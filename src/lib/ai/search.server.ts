// Retrieval over the pgvector knowledge base + grounded AI answers.
import type { SupabaseClient } from "@supabase/supabase-js";

import { chatCompletion, createEmbeddings } from "./registry.server";

export type KnowledgeMatch = {
  chunk_id: string;
  call_id: string | null;
  source_type: string;
  title: string | null;
  content: string;
  metadata: Record<string, string | number | boolean | null>;
  similarity: number;
};

export async function semanticSearch(
  db: SupabaseClient,
  query: string,
  limit = 10,
): Promise<KnowledgeMatch[]> {
  if (!query.trim()) return [];
  const { vectors } = await createEmbeddings(db, [query]);
  const { data, error } = await db.rpc("match_knowledge", {
    query_embedding: JSON.stringify(vectors[0]),
    match_count: limit,
    min_similarity: 0,
  });
  if (error) throw new Error(`Поиск не выполнен: ${error.message}`);
  return (data ?? []) as KnowledgeMatch[];
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
    outcome: string | null;
    excerpt: string;
  }[];
};

export async function askKnowledgeBase(
  db: SupabaseClient,
  question: string,
  limit = 12,
): Promise<AskResult> {
  const matches = await semanticSearch(db, question, limit);
  if (matches.length === 0) {
    return {
      answer:
        "В базе знаний пока нет данных для ответа. Загрузите звонки и дождитесь завершения обработки.",
      provider: "-",
      model: "-",
      sources: [],
    };
  }

  const context = matches
    .map(
      (match, index) =>
        `[Источник ${index + 1}] (call_id: ${match.call_id ?? "-"}, тип: ${match.source_type}, релевантность: ${match.similarity.toFixed(3)})\n${match.content}`,
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
      manager_name: (match.metadata?.["manager_name"] as string | null) ?? null,
      outcome: (match.metadata?.["outcome"] as string | null) ?? null,
      excerpt: match.content.slice(0, 400),
    })),
  };
}
