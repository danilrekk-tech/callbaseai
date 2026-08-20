// AI provider registry: reads provider rows from the database, resolves their
// API keys from server-side secrets and exposes generic call helpers with
// automatic fallback. Business logic never talks to a vendor SDK directly.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProviderKind } from "./types";

export type ProviderRow = {
  id: string;
  name: string;
  kind: string;
  base_url: string | null;
  model: string | null;
  secret_name: string | null;
  priority: number;
  enabled: boolean;
};

export function readSecret(name: string | null | undefined): string | null {
  if (!name) return null;
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

export async function listProviders(
  db: SupabaseClient,
  kind: ProviderKind,
): Promise<ProviderRow[]> {
  const { data, error } = await db
    .from("ai_providers")
    .select("id, name, kind, base_url, model, secret_name, priority, enabled")
    .eq("kind", kind)
    .eq("enabled", true)
    .order("priority", { ascending: true });
  if (error) throw new Error(`Не удалось прочитать список провайдеров: ${error.message}`);
  return (data ?? []) as ProviderRow[];
}

export async function markProviderSuccess(db: SupabaseClient, provider: ProviderRow) {
  const { data } = await db
    .from("ai_providers")
    .select("request_count")
    .eq("id", provider.id)
    .maybeSingle();
  await db
    .from("ai_providers")
    .update({
      status: "ok",
      last_success_at: new Date().toISOString(),
      last_error: null,
      request_count: ((data?.request_count as number | undefined) ?? 0) + 1,
    })
    .eq("id", provider.id);
}

export async function markProviderError(
  db: SupabaseClient,
  provider: ProviderRow,
  message: string,
) {
  const { data } = await db
    .from("ai_providers")
    .select("request_count, error_count")
    .eq("id", provider.id)
    .maybeSingle();
  await db
    .from("ai_providers")
    .update({
      status: "error",
      last_error: message.slice(0, 500),
      last_error_at: new Date().toISOString(),
      request_count: ((data?.request_count as number | undefined) ?? 0) + 1,
      error_count: ((data?.error_count as number | undefined) ?? 0) + 1,
    })
    .eq("id", provider.id);
}

export function authHeaders(provider: ProviderRow, key: string): Record<string, string> {
  if (provider.base_url?.includes("elevenlabs.io")) return { "xi-api-key": key };
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (provider.base_url?.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://megagroup-sales-intelligence.lovable.app";
    headers["X-Title"] = "Megagroup Sales Intelligence";
  }
  return headers;
}

export type ChatResult = { content: string; provider: ProviderRow };

/**
 * Chat completion against any OpenAI-compatible provider, walking the
 * registry by priority until one succeeds.
 */
export async function chatCompletion(
  db: SupabaseClient,
  messages: { role: string; content: string }[],
  options: { jsonMode?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<ChatResult> {
  const providers = await listProviders(db, "analysis");
  if (providers.length === 0) throw new Error("Нет включённых AI-провайдеров для анализа.");

  const errors: string[] = [];
  for (const provider of providers) {
    const key = readSecret(provider.secret_name);
    if (!key) {
      errors.push(`${provider.name}: не задан ключ ${provider.secret_name}`);
      continue;
    }
    const body: Record<string, unknown> = {
      model: provider.model,
      messages,
      temperature: options.temperature ?? 0.2,
    };
    if (options.maxTokens) body["max_tokens"] = options.maxTokens;
    if (options.jsonMode) body["response_format"] = { type: "json_object" };

    try {
      const response = await fetch(provider.base_url!, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(provider, key) },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
      const json = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(json.error?.message ?? "Пустой ответ модели");
      }
      await markProviderSuccess(db, provider);
      return { content, provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name} (${provider.model}): ${message}`);
      await markProviderError(db, provider, message);
    }
  }
  throw new Error(`Все AI-провайдеры недоступны. ${errors.join(" | ")}`);
}

export async function createEmbeddings(
  db: SupabaseClient,
  inputs: string[],
): Promise<{ vectors: number[][]; model: string; provider: ProviderRow }> {
  const providers = await listProviders(db, "embedding");
  if (providers.length === 0) throw new Error("Нет включённых провайдеров эмбеддингов.");
  const errors: string[] = [];

  for (const provider of providers) {
    const key = readSecret(provider.secret_name);
    if (!key) {
      errors.push(`${provider.name}: не задан ключ ${provider.secret_name}`);
      continue;
    }
    try {
      const response = await fetch(provider.base_url!, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(provider, key) },
        body: JSON.stringify({ model: provider.model, input: inputs }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text) as { data?: { embedding: number[] }[] };
      const vectors = (json.data ?? []).map((item) => item.embedding);
      if (vectors.length !== inputs.length) throw new Error("Некорректный ответ эмбеддингов");
      await markProviderSuccess(db, provider);
      return { vectors, model: provider.model ?? "unknown", provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${message}`);
      await markProviderError(db, provider, message);
    }
  }
  throw new Error(`Не удалось создать эмбеддинги. ${errors.join(" | ")}`);
}
