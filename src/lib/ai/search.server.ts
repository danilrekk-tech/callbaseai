// Retrieval over the pgvector knowledge base + grounded AI answers.
import type { SupabaseClient } from "@supabase/supabase-js";

import { chatCompletion, createEmbeddings } from "./registry.server";

export type SearchFilters = {
  managerId?: string | null;
  clientName?: string | null;
};

export type CallRef = {
  call_id: string;
  client_name: string | null;
  client_company: string | null;
  manager_id: string | null;
  manager_name: string | null;
  outcome: string | null;
  call_date: string | null;
  file_name: string | null;
};

export type KnowledgeMatch = {
  chunk_id: string;
  call_id: string | null;
  source_type: string;
  title: string | null;
  content: string;
  metadata: Record<string, string | number | boolean | null>;
  similarity: number;
  call: CallRef | null;
};

async function loadCallRefs(db: SupabaseClient, callIds: string[]) {
  const map = new Map<string, CallRef>();
  if (callIds.length === 0) return map;
  const { data } = await db
    .from("calls")
    .select("id, file_name, client_name, client_company, manager_id, outcome, call_date, managers(full_name)")
    .in("id", callIds);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const managers = row["managers"] as { full_name?: string } | null;
    map.set(row["id"] as string, {
      call_id: row["id"] as string,
      client_name: (row["client_name"] as string | null) ?? null,
      client_company: (row["client_company"] as string | null) ?? null,
      manager_id: (row["manager_id"] as string | null) ?? null,
      manager_name: managers?.full_name ?? null,
      outcome: (row["outcome"] as string | null) ?? null,
      call_date: (row["call_date"] as string | null) ?? null,
      file_name: (row["file_name"] as string | null) ?? null,
    });
  }
  return map;
}

export async function semanticSearch(
  db: SupabaseClient,
  query: string,
  limit = 10,
  filters: SearchFilters = {},
): Promise<KnowledgeMatch[]> {
  if (!query.trim()) return [];
  const hasFilters = Boolean(filters.managerId || filters.clientName);
  const { vectors } = await createEmbeddings(db, [query]);
  const { data, error } = await db.rpc("match_knowledge", {
    query_embedding: JSON.stringify(vectors[0]),
    match_count: hasFilters ? Math.min(limit * 6, 200) : limit,
    min_similarity: 0,
  });
  if (error) throw new Error(`Поиск не выполнен: ${error.message}`);

  const rows = (data ?? []) as Omit<KnowledgeMatch, "call">[];
  const refs = await loadCallRefs(
    db,
    [...new Set(rows.map((row) => row.call_id).filter(Boolean) as string[])],
  );

  const enriched: KnowledgeMatch[] = rows.map((row) => ({
    ...row,
    call: row.call_id ? refs.get(row.call_id) ?? null : null,
  }));

  if (!hasFilters) return enriched;

  const clientQuery = filters.clientName?.trim().toLowerCase() ?? "";
  return enriched
    .filter((match) => {
      const call = match.call;
      if (!call) return false;
      if (filters.managerId && call.manager_id !== filters.managerId) return false;
      if (clientQuery) {
        const haystack = `${call.client_name ?? ""} ${call.client_company ?? ""}`.toLowerCase();
        if (!haystack.includes(clientQuery)) return false;
      }
      return true;
    })
    .slice(0, limit);
}

export type AskResult = {
  answer: string;
  confidence: number;
  provider: string;
  model: string;
  sources: {
    call_id: string | null;
    title: string | null;
    source_type: string;
    similarity: number;
    manager_name: string | null;
    client_name: string | null;
    outcome: string | null;
    call_date: string | null;
    excerpt: string;
  }[];
  related_calls: CallRef[];
  patterns: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    confirmations: number;
    confidence: number | null;
    success_rate: number | null;
  }[];
  objections: {
    id: string;
    title: string;
    category: string | null;
    occurrences: number;
    handled_count: number;
  }[];
  recommendations: string[];
};

/** Collects the structured context (patterns, objections, recommendations)
 *  behind the calls that produced the retrieved chunks. */
async function loadAnswerContext(db: SupabaseClient, callIds: string[]) {
  if (callIds.length === 0) {
    return { patterns: [], objections: [], recommendations: [] as string[] };
  }
  const [patternLinks, objectionLinks, analyses] = await Promise.all([
    db
      .from("call_patterns")
      .select(
        "pattern_id, patterns(id, name, description, status, confirmations, confidence, success_rate)",
      )
      .in("call_id", callIds),
    db
      .from("call_objections")
      .select("objection_id, objections(id, title, category, occurrences, handled_count)")
      .in("call_id", callIds),
    db.from("call_analyses").select("recommendations").in("call_id", callIds),
  ]);

  const patternMap = new Map<string, AskResult["patterns"][number]>();
  for (const row of (patternLinks.data ?? []) as Record<string, unknown>[]) {
    const pattern = row["patterns"] as Record<string, unknown> | null;
    if (!pattern) continue;
    patternMap.set(pattern["id"] as string, {
      id: pattern["id"] as string,
      name: pattern["name"] as string,
      description: (pattern["description"] as string | null) ?? null,
      status: (pattern["status"] as string | null) ?? "candidate",
      confirmations: (pattern["confirmations"] as number | null) ?? 0,
      confidence: (pattern["confidence"] as number | null) ?? null,
      success_rate: (pattern["success_rate"] as number | null) ?? null,
    });
  }

  const objectionMap = new Map<string, AskResult["objections"][number]>();
  for (const row of (objectionLinks.data ?? []) as Record<string, unknown>[]) {
    const objection = row["objections"] as Record<string, unknown> | null;
    if (!objection) continue;
    objectionMap.set(objection["id"] as string, {
      id: objection["id"] as string,
      title: objection["title"] as string,
      category: (objection["category"] as string | null) ?? null,
      occurrences: (objection["occurrences"] as number | null) ?? 0,
      handled_count: (objection["handled_count"] as number | null) ?? 0,
    });
  }

  const recommendations = [
    ...new Set(
      ((analyses.data ?? []) as { recommendations?: string[] | null }[]).flatMap(
        (row) => row.recommendations ?? [],
      ),
    ),
  ].slice(0, 12);

  return {
    patterns: [...patternMap.values()].sort((a, b) => b.confirmations - a.confirmations),
    objections: [...objectionMap.values()].sort((a, b) => b.occurrences - a.occurrences),
    recommendations,
  };
}

export async function askKnowledgeBase(
  db: SupabaseClient,
  question: string,
  limit = 12,
  filters: SearchFilters = {},
): Promise<AskResult> {
  const matches = await semanticSearch(db, question, limit, filters);
  if (matches.length === 0) {
    return {
      answer:
        "В базе знаний нет данных под этот запрос и фильтры. Загрузите звонки, дождитесь обработки или ослабьте фильтры.",
      provider: "-",
      model: "-",
      sources: [],
    };
  }

  const context = matches
    .map(
      (match, index) =>
        `[Источник ${index + 1}] (call_id: ${match.call_id ?? "-"}, тип: ${match.source_type}, менеджер: ${match.call?.manager_name ?? "-"}, клиент: ${match.call?.client_name ?? "-"}, релевантность: ${match.similarity.toFixed(3)})\n${match.content}`,
    )
    .join("\n\n");

  const { content, provider } = await chatCompletion(
    db,
    [
      {
        role: "system",
        content:
          "Ты — аналитик продаж компании Мегагруп. Отвечай ТОЛЬКО на основе предоставленных фрагментов базы знаний реальных звонков. " +
          "Если данных недостаточно — прямо скажи об этом. Ссылайся на источники в формате [Источник N]. Отвечай по-русски, структурированно, по делу.",
      },
      { role: "user", content: `Вопрос: ${question}\n\nФрагменты базы знаний:\n${context}` },
    ],
    { maxTokens: 1800, temperature: 0.2 },
  );

  return {
    answer: content.trim(),
    provider: provider.name,
    model: provider.model ?? "unknown",
    sources: matches.map((match) => ({
      call_id: match.call_id,
      title: match.title,
      source_type: match.source_type,
      similarity: match.similarity,
      manager_name: match.call?.manager_name ?? (match.metadata?.["manager_name"] as string | null) ?? null,
      client_name: match.call?.client_name ?? null,
      outcome: match.call?.outcome ?? (match.metadata?.["outcome"] as string | null) ?? null,
      call_date: match.call?.call_date ?? null,
      excerpt: match.content.slice(0, 400),
    })),
  };
}
