import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { semanticSearch } = await import("./ai/search.server");
    return semanticSearch(
      context.supabase as unknown as SupabaseClient,
      data.query,
      data.limit ?? 12,
    );
  });

export const askKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { question: string }) => input)
  .handler(async ({ data, context }) => {
    const { askKnowledgeBase } = await import("./ai/search.server");
    return askKnowledgeBase(context.supabase as unknown as SupabaseClient, data.question);
  });

export const listAiProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_providers")
      .select("*")
      .order("kind")
      .order("priority");
    if (error) throw new Error(error.message);

    const secretNames = [...new Set((data ?? []).map((row) => row.secret_name).filter(Boolean))];
    const configured: Record<string, boolean> = {};
    for (const name of secretNames as string[]) {
      configured[name] = Boolean(process.env[name]);
    }
    return { providers: data ?? [], configured };
  });

export const updateAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { id: string; enabled?: boolean; priority?: number; model?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const patch: { enabled?: boolean; priority?: number; model?: string } = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.model !== undefined) patch.model = data.model;
    const { error } = await context.supabase.from("ai_providers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      kind: "analysis" | "embedding" | "transcription";
      base_url: string;
      model: string;
      secret_name: string;
      priority?: number;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_providers").insert({
      name: data.name,
      kind: data.kind,
      base_url: data.base_url,
      model: data.model,
      secret_name: data.secret_name,
      priority: data.priority ?? 50,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: "transcription" | "analysis" | "embedding" }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    if (data.kind === "transcription") {
      const { testTranscriptionConnection } = await import("./ai/transcription.server");
      return testTranscriptionConnection(db);
    }
    if (data.kind === "analysis") {
      const { testAnalysisConnection } = await import("./ai/analysis.server");
      return testAnalysisConnection(db);
    }
    const { createEmbeddings } = await import("./ai/registry.server");
    try {
      const { model, provider } = await createEmbeddings(db, ["проверка соединения"]);
      return { ok: true, message: `${provider.name} (${model}) — эмбеддинги создаются.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_processing_jobs")
      .select("*, calls(id, file_name, client_name)")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("api_keys")
      .select("id, name, key_prefix, revoked, last_used_at, request_count, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    const { generateApiKey, hashApiKey } = await import("./api-auth.server");
    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const { error } = await context.supabase.from("api_keys").insert({
      name: data.name,
      key_prefix: key.slice(0, 12),
      key_hash: keyHash,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
