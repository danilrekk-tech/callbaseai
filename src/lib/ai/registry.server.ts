// AI provider registry: reads provider rows from the database, resolves their
// API keys from server-side secrets and exposes generic call helpers with
// automatic fallback, latency tracking and health reporting.
// Business logic never talks to a vendor SDK directly.
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

export async function markProviderSuccess(
  db: SupabaseClient,
  provider: ProviderRow,
  latencyMs?: number,
) {
  const { data } = await db
    .from("ai_providers")
    .select("request_count, success_count, avg_latency_ms")
    .eq("id", provider.id)
    .maybeSingle();
  const successes = ((data?.success_count as number | undefined) ?? 0) + 1;
  const previousAvg = (data?.avg_latency_ms as number | null | undefined) ?? null;
  const avg =
    latencyMs == null
      ? previousAvg
      : previousAvg == null
        ? latencyMs
        : Math.round((previousAvg * (successes - 1) + latencyMs) / successes);

  await db
    .from("ai_providers")
    .update({
      status: "ok",
      last_success_at: new Date().toISOString(),
      last_error: null,
      request_count: ((data?.request_count as number | undefined) ?? 0) + 1,
      success_count: successes,
      last_latency_ms: latencyMs ?? null,
      avg_latency_ms: avg,
    })
    .eq("id", provider.id);
}

export async function markProviderError(
  db: SupabaseClient,
  provider: ProviderRow,
  message: string,
  latencyMs?: number,
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
      last_latency_ms: latencyMs ?? null,
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

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Таймаут ответа провайдера (${Math.round(timeoutMs / 1000)} с)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Transient statuses are worth one bounded retry on the same provider before
 *  falling back to the next one. We never work around rate limits — we wait
 *  the advertised amount once and then move on. */
function retryDelayMs(status: number, retryAfter: string | null, attempt: number): number | null {
  if (status !== 429 && status < 500) return null;
  if (attempt >= 1) return null;
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 20) * 1000;
  return 1500;
}

export type ChatResult = { content: string; provider: ProviderRow; latencyMs: number };

/**
 * Chat completion against any OpenAI-compatible provider, walking the
 * registry by priority (free OpenRouter models first) until one succeeds.
 */
export async function chatCompletion(
  db: SupabaseClient,
  messages: { role: string; content: string }[],
  options: {
    jsonMode?: boolean;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {},
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

    for (let attempt = 0; attempt < 2; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await fetchWithTimeout(
          provider.base_url!,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders(provider, key) },
            body: JSON.stringify(body),
          },
          options.timeoutMs ?? 180_000,
        );
        const text = await response.text();
        if (!response.ok) {
          const delay = retryDelayMs(
            response.status,
            response.headers.get("retry-after"),
            attempt,
          );
          if (delay != null) {
            await sleep(delay);
            continue;
          }
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
        const latencyMs = Date.now() - startedAt;
        await markProviderSuccess(db, provider, latencyMs);
        return { content, provider, latencyMs };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.name} (${provider.model}): ${message}`);
        await markProviderError(db, provider, message, Date.now() - startedAt);
        break;
      }
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
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(
        provider.base_url!,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(provider, key) },
          body: JSON.stringify({ model: provider.model, input: inputs }),
        },
        120_000,
      );
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text) as { data?: { embedding: number[] }[] };
      const vectors = (json.data ?? []).map((item) => item.embedding);
      if (vectors.length !== inputs.length) throw new Error("Некорректный ответ эмбеддингов");
      await markProviderSuccess(db, provider, Date.now() - startedAt);
      return { vectors, model: provider.model ?? "unknown", provider };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${message}`);
      await markProviderError(db, provider, message, Date.now() - startedAt);
    }
  }
  throw new Error(`Не удалось создать эмбеддинги. ${errors.join(" | ")}`);
}
