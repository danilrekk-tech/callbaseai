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
};

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
