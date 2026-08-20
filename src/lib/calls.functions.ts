import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CallsFilter = {
  search?: string | undefined;
  managerId?: string | undefined;
  outcome?: string | undefined;
  status?: string | undefined;
  clientType?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

export const listCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CallsFilter | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("calls")
      .select(
        "id, file_name, client_name, client_company, client_type, call_date, duration_seconds, outcome, status, error_message, summary, language, manager_id, created_at, managers(id, full_name)",
        { count: "exact" },
      )
      .order("call_date", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 50) - 1);

    if (data.managerId) query = query.eq("manager_id", data.managerId);
    if (data.outcome) query = query.eq("outcome", data.outcome);
    if (data.status) query = query.eq("status", data.status);
    if (data.clientType) query = query.ilike("client_type", `%${data.clientType}%`);
    if (data.from) query = query.gte("call_date", data.from);
    if (data.to) query = query.lte("call_date", data.to);
    if (data.search) {
      const term = `%${data.search}%`;
      query = query.or(
        `client_name.ilike.${term},client_company.ilike.${term},file_name.ilike.${term},summary.ilike.${term}`,
      );
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], count: count ?? 0 };
  });

export const getCallDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const [call, transcript, segments, clientProfile, assessment, analysis, objections, patterns, jobs] =
      await Promise.all([
        db
          .from("calls")
          .select("*, managers(id, full_name, department)")
          .eq("id", data.id)
          .maybeSingle(),
        db.from("transcripts").select("*").eq("call_id", data.id).maybeSingle(),
        db
          .from("transcript_segments")
          .select("*")
          .eq("call_id", data.id)
          .order("idx", { ascending: true }),
        db.from("client_profiles").select("*").eq("call_id", data.id).maybeSingle(),
        db.from("manager_assessments").select("*").eq("call_id", data.id).maybeSingle(),
        db.from("call_analyses").select("*").eq("call_id", data.id).maybeSingle(),
        db
          .from("call_objections")
          .select("*, objections(id, title, category, occurrences)")
          .eq("call_id", data.id),
        db
          .from("call_patterns")
          .select("*, patterns(id, name, description, confirmations, success_rate, confidence)")
          .eq("call_id", data.id),
        db
          .from("ai_processing_jobs")
          .select("*")
          .eq("call_id", data.id)
          .order("started_at", { ascending: false }),
      ]);

    if (!call.data) throw new Error("Звонок не найден");

    let audioUrl: string | null = null;
    const signed = await db.storage
      .from("call-audio")
      .createSignedUrl(call.data.storage_path as string, 3600);
    if (signed.data?.signedUrl) audioUrl = signed.data.signedUrl;

    return {
      call: call.data,
      transcript: transcript.data,
      segments: segments.data ?? [],
      clientProfile: clientProfile.data,
      assessment: assessment.data,
      analysis: analysis.data,
      objections: objections.data ?? [],
      patterns: patterns.data ?? [],
      jobs: jobs.data ?? [],
      audioUrl,
    };
  });

export const createCallRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      fileName: string;
      storagePath: string;
      mimeType?: string | null;
      fileSize?: number | null;
      durationSeconds?: number | null;
      managerId?: string | null;
      clientName?: string | null;
      clientCompany?: string | null;
      callDate?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("calls")
      .insert({
        file_name: data.fileName,
        storage_path: data.storagePath,
        mime_type: data.mimeType ?? null,
        file_size: data.fileSize ?? null,
        duration_seconds: data.durationSeconds ?? null,
        manager_id: data.managerId ?? null,
        client_name: data.clientName ?? null,
        client_company: data.clientCompany ?? null,
        call_date: data.callDate ?? new Date().toISOString(),
        status: "uploaded",
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const processCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processCallPipeline } = await import("./ai/pipeline.server");
    const result = await processCallPipeline(supabaseAdmin as unknown as SupabaseClient, data.id);
    return result;
  });

export const deleteCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: call } = await context.supabase
      .from("calls")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (call?.storage_path) {
      await context.supabase.storage.from("call-audio").remove([call.storage_path as string]);
    }
    const { error } = await context.supabase.from("calls").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
