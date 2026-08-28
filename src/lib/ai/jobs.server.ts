// Stage-level job queue for call processing.
// Every stage of a call is an independent, idempotent job row in
// ai_processing_jobs (unique per call + stage). A succeeded stage is never
// re-run unless explicitly forced, a failed stage can be retried alone, and
// each run is journaled with provider, model, timings, status, error and
// retry count.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PipelineStage } from "./types";

export type StageOutcome = {
  stage: PipelineStage;
  status: "succeeded" | "skipped" | "failed";
  attempts: number;
  durationMs: number | null;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  details?: Record<string, unknown>;
};

export type StageResult = {
  provider?: string | null;
  model?: string | null;
  details?: Record<string, unknown>;
};

const DEFAULT_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Best-effort single-flight lease. Returns false when another run holds it. */
export async function acquireLock(db: SupabaseClient, key: string, ttlMs = 30 * 60 * 1000) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs).toISOString();
  const { data: existing } = await db
    .from("processing_locks")
    .select("lock_key, expires_at")
    .eq("lock_key", key)
    .maybeSingle();

  if (existing) {
    if (new Date(existing.expires_at as string).getTime() > now.getTime()) return false;
    const { error } = await db
      .from("processing_locks")
      .update({ expires_at: expires, created_at: now.toISOString() })
      .eq("lock_key", key)
      .lt("expires_at", now.toISOString());
    return !error;
  }
  const { error } = await db.from("processing_locks").insert({ lock_key: key, expires_at: expires });
  return !error;
}

export async function releaseLock(db: SupabaseClient, key: string) {
  await db.from("processing_locks").delete().eq("lock_key", key);
}

export async function getStageJobs(db: SupabaseClient, callId: string) {
  const { data } = await db
    .from("ai_processing_jobs")
    .select("*")
    .eq("call_id", callId)
    .order("started_at", { ascending: true });
  return data ?? [];
}

/**
 * Runs one pipeline stage with idempotency, bounded retries and full logging.
 * Throws when the stage ultimately fails, so the caller can stop the chain.
 */
export async function runStage<T>(
  db: SupabaseClient,
  callId: string,
  stage: PipelineStage,
  handler: () => Promise<StageResult & { value?: T }>,
  options: { force?: boolean; maxAttempts?: number } = {},
): Promise<{ outcome: StageOutcome; value?: T }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const { data: existing } = await db
    .from("ai_processing_jobs")
    .select("id, status, attempts, latency_ms, provider, model, details")
    .eq("call_id", callId)
    .eq("stage", stage)
    .maybeSingle();

  if (existing?.status === "succeeded" && !options.force) {
    return {
      outcome: {
        stage,
        status: "skipped",
        attempts: (existing.attempts as number) ?? 0,
        durationMs: (existing.latency_ms as number | null) ?? null,
        provider: (existing.provider as string | null) ?? null,
        model: (existing.model as string | null) ?? null,
        details: (existing.details as Record<string, unknown>) ?? {},
      },
    };
  }

  let attempts = options.force ? 0 : ((existing?.attempts as number | undefined) ?? 0);
  let lastError = "";

  for (let localAttempt = 1; localAttempt <= maxAttempts; localAttempt += 1) {
    attempts += 1;
    const startedAt = new Date();
    await db.from("ai_processing_jobs").upsert(
      {
        call_id: callId,
        stage,
        status: "running",
        attempts,
        max_attempts: maxAttempts,
        error: null,
        started_at: startedAt.toISOString(),
        finished_at: null,
        latency_ms: null,
      },
      { onConflict: "call_id,stage" },
    );

    try {
      const result = await handler();
      const durationMs = Date.now() - startedAt.getTime();
      await db
        .from("ai_processing_jobs")
        .update({
          status: "succeeded",
          provider: result.provider ?? null,
          model: result.model ?? null,
          details: result.details ?? {},
          finished_at: new Date().toISOString(),
          latency_ms: durationMs,
          error: null,
        })
        .eq("call_id", callId)
        .eq("stage", stage);
      return {
        outcome: {
          stage,
          status: "succeeded",
          attempts,
          durationMs,
          provider: result.provider ?? null,
          model: result.model ?? null,
          details: result.details ?? {},
        },
        ...(result.value === undefined ? {} : { value: result.value }),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt.getTime();
      await db
        .from("ai_processing_jobs")
        .update({
          status: "failed",
          error: lastError.slice(0, 1000),
          finished_at: new Date().toISOString(),
          latency_ms: durationMs,
        })
        .eq("call_id", callId)
        .eq("stage", stage);
      if (localAttempt < maxAttempts) await sleep(Math.min(15000, 1500 * localAttempt));
    }
  }

  throw new Error(`Этап «${stage}» не выполнен после ${attempts} попыток: ${lastError}`);
}
