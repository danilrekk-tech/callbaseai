// Full processing pipeline:
// storage audio -> transcription -> structured analysis -> knowledge extraction
// -> embeddings -> pgvector. Every stage is journaled in ai_processing_jobs and
// reflected in calls.status.
import type { SupabaseClient } from "@supabase/supabase-js";

import { analyzeTranscript } from "./analysis.server";
import { createEmbeddings } from "./registry.server";
import { transcribeAudio } from "./transcription.server";
import type { AnalysisResult, CallStatus, TranscriptSegmentInput } from "./types";

async function setStatus(
  db: SupabaseClient,
  callId: string,
  status: CallStatus,
  patch: Record<string, unknown> = {},
) {
  await db
    .from("calls")
    .update({ status, ...patch })
    .eq("id", callId);
}

async function startJob(db: SupabaseClient, callId: string, stage: string) {
  const { data } = await db
    .from("ai_processing_jobs")
    .insert({ call_id: callId, stage, status: "running" })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

async function finishJob(
  db: SupabaseClient,
  jobId: string | undefined,
  patch: Record<string, unknown>,
) {
  if (!jobId) return;
  await db
    .from("ai_processing_jobs")
    .update({ finished_at: new Date().toISOString(), ...patch })
    .eq("id", jobId);
}

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];

function normalizeOutcome(value: unknown): string {
  const raw = String(value ?? "").toLowerCase();
  if (["sale", "продажа", "won", "success"].some((v) => raw.includes(v))) return "sale";
  if (["loss", "потер", "lost", "отказ"].some((v) => raw.includes(v))) return "loss";
  if (["progress", "работе", "pending"].some((v) => raw.includes(v))) return "in_progress";
  return "unknown";
}

async function persistAnalysis(
  db: SupabaseClient,
  callId: string,
  managerId: string | null,
  analysis: AnalysisResult,
  provider: string,
  model: string,
  raw: string,
) {
  const outcome = normalizeOutcome(analysis.outcome);
  const client = analysis.client ?? {};
  const manager = analysis.manager ?? {};
  const call = analysis.call ?? {};

  await db.from("client_profiles").upsert(
    {
      call_id: callId,
      client_type: client.client_type ?? null,
      need: client.need ?? null,
      motivation: client.motivation ?? null,
      pains: list(client.pains),
      choice_criteria: list(client.choice_criteria),
      budget_sensitivity: client.budget_sensitivity ?? null,
      interest_level: client.interest_level ?? null,
      objections: list(client.objections),
      fears: list(client.fears),
      communication_style: client.communication_style ?? null,
      buying_signals: list(client.buying_signals),
      refusal_signals: list(client.refusal_signals),
      facts: client.facts ?? [],
      interpretations: client.interpretations ?? [],
    },
    { onConflict: "call_id" },
  );

  await db.from("manager_assessments").upsert(
    {
      call_id: callId,
      manager_id: managerId,
      conversation_structure: manager.conversation_structure ?? null,
      needs_discovery: manager.needs_discovery ?? null,
      questions_asked: list(manager.questions_asked),
      presentation_quality: manager.presentation_quality ?? null,
      objection_handling: manager.objection_handling ?? null,
      argumentation: manager.argumentation ?? null,
      empathy_score: manager.empathy_score ?? null,
      expertise_score: manager.expertise_score ?? null,
      pressure_score: manager.pressure_score ?? null,
      overall_score: manager.overall_score ?? null,
      mistakes: list(manager.mistakes),
      missed_opportunities: list(manager.missed_opportunities),
      good_actions: list(manager.good_actions),
      bad_actions: list(manager.bad_actions),
      facts: manager.facts ?? [],
      interpretations: manager.interpretations ?? [],
    },
    { onConflict: "call_id" },
  );

  await db.from("call_analyses").upsert(
    {
      call_id: callId,
      provider,
      model,
      outcome,
      summary: analysis.summary ?? null,
      stages: call.stages ?? [],
      key_moments: call.key_moments ?? [],
      sale_reasons: list(call.sale_reasons),
      loss_reasons: list(call.loss_reasons),
      turning_point: call.turning_point ?? null,
      effective_phrases: list(call.effective_phrases),
      ineffective_phrases: list(call.ineffective_phrases),
      recommendations: list(call.recommendations),
      facts: call.facts ?? [],
      interpretations: call.interpretations ?? [],
      // detailed flat fields for analytics and search
      needs: [client.need, ...list(client.choice_criteria)].filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      ),
      pain_points: list(client.pains),
      motivation: client.motivation ?? null,
      buying_signals: list(client.buying_signals),
      loss_signals: list(client.refusal_signals),
      manager_actions: list(manager.good_actions),
      manager_mistakes: [...list(manager.mistakes), ...list(manager.bad_actions)],
      successful_phrases: list(call.effective_phrases),
      unsuccessful_phrases: list(call.ineffective_phrases),
      turning_points:
        call.turning_points && call.turning_points.length > 0
          ? call.turning_points
          : call.turning_point
            ? [{ moment: call.turning_point }]
            : [],
      sale_reason: call.sale_reason ?? list(call.sale_reasons)[0] ?? null,
      loss_reason: call.loss_reason ?? list(call.loss_reasons)[0] ?? null,
      confidence: analysis.confidence ?? null,
      raw: { raw_response: raw.slice(0, 20000) },
    },
    { onConflict: "call_id" },
  );

  // insights: facts vs interpretations, per category
  await db.from("insights").delete().eq("call_id", callId);
  const insightRows: Record<string, unknown>[] = [];
  for (const [category, section] of [
    ["client", client],
    ["manager", manager],
    ["call", call],
  ] as const) {
    for (const fact of section.facts ?? []) {
      if (fact?.statement)
        insightRows.push({
          call_id: callId,
          category,
          kind: "fact",
          statement: fact.statement,
          evidence: fact.evidence ?? null,
        });
    }
    for (const item of section.interpretations ?? []) {
      if (item?.statement)
        insightRows.push({
          call_id: callId,
          category,
          kind: "inference",
          statement: item.statement,
          evidence: item.evidence ?? null,
        });
    }
  }
  if (insightRows.length > 0) await db.from("insights").insert(insightRows);

  // objections
  await db.from("call_objections").delete().eq("call_id", callId);
  for (const objection of analysis.objections ?? []) {
    const title = objection?.title?.trim();
    if (!title) continue;
    const { data: existing } = await db
      .from("objections")
      .select("id")
      .ilike("title", title)
      .maybeSingle();
    let objectionId = existing?.id as string | undefined;
    if (!objectionId) {
      const { data: inserted } = await db
        .from("objections")
        .insert({ title, category: objection.category ?? null })
        .select("id")
        .single();
      objectionId = inserted?.id as string | undefined;
    }
    if (!objectionId) continue;
    await db.from("call_objections").insert({
      call_id: callId,
      objection_id: objectionId,
      quote: objection.quote ?? null,
      handled: Boolean(objection.handled),
      handling_quality: objection.handling_quality ?? null,
      manager_response: objection.manager_response ?? null,
    });
  }

  // patterns
  await db.from("call_patterns").delete().eq("call_id", callId);
  for (const pattern of analysis.patterns ?? []) {
    const name = pattern?.name?.trim();
    if (!name) continue;
    const { data: existing } = await db
      .from("patterns")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    let patternId = existing?.id as string | undefined;
    if (!patternId) {
      const { data: inserted } = await db
        .from("patterns")
        .insert({
          name,
          description: pattern.description ?? null,
          kind: pattern.kind ?? null,
          outcome_link: pattern.outcome_link ?? null,
          confidence: pattern.confidence ?? null,
          status: "candidate",
        })
        .select("id")
        .single();
      patternId = inserted?.id as string | undefined;
    }
    if (!patternId) continue;
    await db
      .from("call_patterns")
      .insert({ call_id: callId, pattern_id: patternId, evidence: pattern.evidence ?? null });
  }

  return outcome;
}

function buildChunks(
  analysis: AnalysisResult,
  segments: TranscriptSegmentInput[],
  meta: { managerName: string | null; callDate: string; outcome: string },
) {
  const chunks: { source_type: string; title: string; content: string }[] = [];
  const header = `Звонок от ${new Date(meta.callDate).toLocaleDateString("ru-RU")}, менеджер: ${meta.managerName ?? "не указан"}, результат: ${meta.outcome}.`;

  if (analysis.summary)
    chunks.push({
      source_type: "summary",
      title: "Резюме звонка",
      content: `${header}\nРезюме: ${analysis.summary}`,
    });

  const client = analysis.client ?? {};
  chunks.push({
    source_type: "client_profile",
    title: "Профиль клиента",
    content: `${header}\nТип клиента: ${client.client_type ?? "-"}\nПотребность: ${client.need ?? "-"}\nМотивация: ${client.motivation ?? "-"}\nБоли: ${list(client.pains).join("; ")}\nКритерии выбора: ${list(client.choice_criteria).join("; ")}\nЧувствительность к цене: ${client.budget_sensitivity ?? "-"}\nЗаинтересованность: ${client.interest_level ?? "-"}\nВозражения: ${list(client.objections).join("; ")}\nСтрахи: ${list(client.fears).join("; ")}\nСтиль общения: ${client.communication_style ?? "-"}\nСигналы покупки: ${list(client.buying_signals).join("; ")}\nСигналы отказа: ${list(client.refusal_signals).join("; ")}`,
  });

  const manager = analysis.manager ?? {};
  chunks.push({
    source_type: "manager_assessment",
    title: "Работа менеджера",
    content: `${header}\nСтруктура разговора: ${manager.conversation_structure ?? "-"}\nВыявление потребности: ${manager.needs_discovery ?? "-"}\nВопросы: ${list(manager.questions_asked).join("; ")}\nПрезентация: ${manager.presentation_quality ?? "-"}\nРабота с возражениями: ${manager.objection_handling ?? "-"}\nАргументация: ${manager.argumentation ?? "-"}\nОшибки: ${list(manager.mistakes).join("; ")}\nПропущенные возможности: ${list(manager.missed_opportunities).join("; ")}\nУдачные действия: ${list(manager.good_actions).join("; ")}\nНеудачные действия: ${list(manager.bad_actions).join("; ")}`,
  });

  const call = analysis.call ?? {};
  chunks.push({
    source_type: "call_analysis",
    title: "Итоги и причины",
    content: `${header}\nПричины продажи: ${list(call.sale_reasons).join("; ")}\nПричины потери: ${list(call.loss_reasons).join("; ")}\nПереломный момент: ${call.turning_point ?? "-"}\nЭффективные формулировки: ${list(call.effective_phrases).join("; ")}\nНеэффективные формулировки: ${list(call.ineffective_phrases).join("; ")}\nРекомендации: ${list(call.recommendations).join("; ")}`,
  });

  for (const objection of analysis.objections ?? []) {
    if (!objection?.title) continue;
    chunks.push({
      source_type: "objection",
      title: `Возражение: ${objection.title}`,
      content: `${header}\nВозражение: ${objection.title}\nЦитата клиента: ${objection.quote ?? "-"}\nОтвет менеджера: ${objection.manager_response ?? "-"}\nОтработано: ${objection.handled ? "да" : "нет"} (${objection.handling_quality ?? "-"})`,
    });
  }

  // transcript chunks (~1800 chars) to keep verbatim evidence searchable
  let buffer = "";
  let part = 1;
  for (const segment of segments) {
    const line = `[${segment.speaker_role ?? segment.speaker}] ${segment.text}\n`;
    if (buffer.length + line.length > 1800) {
      chunks.push({
        source_type: "transcript",
        title: `Фрагмент транскрипции #${part}`,
        content: `${header}\n${buffer}`,
      });
      buffer = "";
      part += 1;
    }
    buffer += line;
  }
  if (buffer.trim().length > 0)
    chunks.push({
      source_type: "transcript",
      title: `Фрагмент транскрипции #${part}`,
      content: `${header}\n${buffer}`,
    });

  return chunks;
}

export async function indexKnowledge(
  db: SupabaseClient,
  callId: string,
  chunks: { source_type: string; title: string; content: string }[],
  metadata: Record<string, unknown>,
) {
  const { data: oldChunks } = await db.from("knowledge_chunks").select("id").eq("call_id", callId);
  if (oldChunks && oldChunks.length > 0) {
    await db
      .from("knowledge_chunks")
      .delete()
      .in(
        "id",
        oldChunks.map((c) => c.id as string),
      );
  }

  const { data: inserted, error } = await db
    .from("knowledge_chunks")
    .insert(
      chunks.map((chunk) => ({
        call_id: callId,
        source_type: chunk.source_type,
        title: chunk.title,
        content: chunk.content,
        metadata,
      })),
    )
    .select("id, content");
  if (error) throw new Error(`Не удалось сохранить чанки знаний: ${error.message}`);

  const rows = inserted ?? [];
  const batchSize = 32;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { vectors, model } = await createEmbeddings(
      db,
      batch.map((row) => (row.content as string).slice(0, 6000)),
    );
    const { error: embedError } = await db.from("embeddings").upsert(
      batch.map((row, index) => ({
        chunk_id: row.id as string,
        model,
        embedding: JSON.stringify(vectors[index]),
      })),
      { onConflict: "chunk_id" },
    );
    if (embedError) throw new Error(`Не удалось сохранить эмбеддинги: ${embedError.message}`);
  }
  return rows.length;
}

export async function processCallPipeline(db: SupabaseClient, callId: string) {
  const { data: call, error } = await db
    .from("calls")
    .select("id, file_name, storage_path, manager_id, client_name, call_date, managers(full_name)")
    .eq("id", callId)
    .single();
  if (error || !call) throw new Error("Звонок не найден");

  const managerName =
    (call.managers as { full_name?: string } | null)?.full_name ?? null;

  try {
    await setStatus(db, callId, "processing", { error_message: null });

    // 1. transcription
    const transcribeJob = await startJob(db, callId, "transcription");
    await setStatus(db, callId, "transcribing");
    const download = await db.storage
      .from("call-audio")
      .download(call.storage_path as string);
    if (download.error || !download.data) {
      throw new Error(`Не удалось получить аудио из хранилища: ${download.error?.message}`);
    }
    const transcription = await transcribeAudio(db, download.data, call.file_name as string);
    await finishJob(db, transcribeJob, {
      status: "succeeded",
      provider: transcription.provider,
      model: transcription.model,
      details: { words: transcription.wordsCount, language: transcription.language },
    });

    const { data: transcriptRow, error: transcriptError } = await db
      .from("transcripts")
      .upsert(
        {
          call_id: callId,
          provider: transcription.provider,
          model: transcription.model,
          language: transcription.language,
          language_probability: transcription.languageProbability,
          full_text: transcription.fullText,
          words_count: transcription.wordsCount,
          raw: transcription.raw as Record<string, unknown>,
        },
        { onConflict: "call_id" },
      )
      .select("id")
      .single();
    if (transcriptError || !transcriptRow) {
      throw new Error(`Не удалось сохранить транскрипцию: ${transcriptError?.message}`);
    }

    await db.from("transcript_segments").delete().eq("call_id", callId);
    if (transcription.segments.length > 0) {
      await db.from("transcript_segments").insert(
        transcription.segments.map((segment) => ({
          transcript_id: transcriptRow.id as string,
          call_id: callId,
          idx: segment.idx,
          speaker: segment.speaker,
          speaker_role: null,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          text: segment.text,
        })),
      );
    }
    await setStatus(db, callId, "transcribed", { language: transcription.language });

    // 2. analysis
    const analysisJob = await startJob(db, callId, "analysis");
    await setStatus(db, callId, "analyzing");
    const { analysis, provider, model, raw } = await analyzeTranscript(db, {
      segments: transcription.segments,
      fullText: transcription.fullText,
      managerName,
      clientName: (call.client_name as string | null) ?? null,
    });
    await finishJob(db, analysisJob, { status: "succeeded", provider, model });

    const outcome = await persistAnalysis(
      db,
      callId,
      (call.manager_id as string | null) ?? null,
      analysis,
      provider,
      model,
      raw,
    );

    // speaker roles
    const managerSpeaker = analysis.manager_speaker ?? null;
    if (managerSpeaker) {
      await db
        .from("transcript_segments")
        .update({ speaker_role: "manager" })
        .eq("call_id", callId)
        .eq("speaker", managerSpeaker);
      await db
        .from("transcript_segments")
        .update({ speaker_role: "client" })
        .eq("call_id", callId)
        .neq("speaker", managerSpeaker);
    }

    const segmentsWithRoles = transcription.segments.map((segment) => ({
      ...segment,
      speaker_role:
        managerSpeaker == null
          ? segment.speaker
          : segment.speaker === managerSpeaker
            ? "менеджер"
            : "клиент",
    }));

    // 3. knowledge + embeddings
    const knowledgeJob = await startJob(db, callId, "knowledge");
    const chunks = buildChunks(analysis, segmentsWithRoles, {
      managerName,
      callDate: (call.call_date as string) ?? new Date().toISOString(),
      outcome,
    });
    const indexed = await indexKnowledge(db, callId, chunks, {
      manager_id: call.manager_id,
      manager_name: managerName,
      outcome,
      call_date: call.call_date,
    });
    await finishJob(db, knowledgeJob, { status: "succeeded", details: { chunks: indexed } });

    await setStatus(db, callId, "completed", {
      outcome,
      summary: analysis.summary ?? null,
      client_type: analysis.client?.client_type ?? null,
      processed_at: new Date().toISOString(),
      error_message: null,
    });

    await refreshAggregates(db);
    return { ok: true as const, outcome, chunks: indexed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .from("ai_processing_jobs")
      .update({ status: "failed", error: message.slice(0, 800), finished_at: new Date().toISOString() })
      .eq("call_id", callId)
      .eq("status", "running");
    await setStatus(db, callId, "failed", { error_message: message.slice(0, 800) });
    throw new Error(message);
  }
}

/** Recomputes objection and pattern statistics across the whole database. */
export async function refreshAggregates(db: SupabaseClient) {
  const { data: objections } = await db.from("objections").select("id");
  for (const objection of objections ?? []) {
    const { data: links } = await db
      .from("call_objections")
      .select("handled, calls(outcome)")
      .eq("objection_id", objection.id as string);
    const rows = links ?? [];
    await db
      .from("objections")
      .update({
        occurrences: rows.length,
        handled_count: rows.filter((r) => r.handled).length,
        won_count: rows.filter((r) => (r.calls as { outcome?: string } | null)?.outcome === "sale")
          .length,
      })
      .eq("id", objection.id as string);
  }

  const { data: patterns } = await db.from("patterns").select("id");
  for (const pattern of patterns ?? []) {
    const { data: links } = await db
      .from("call_patterns")
      .select("calls(outcome)")
      .eq("pattern_id", pattern.id as string);
    const rows = links ?? [];
    const decided = rows.filter((r) =>
      ["sale", "loss"].includes((r.calls as { outcome?: string } | null)?.outcome ?? ""),
    );
    const wins = rows.filter((r) => (r.calls as { outcome?: string } | null)?.outcome === "sale");
    await db
      .from("patterns")
      .update({
        confirmations: rows.length,
        success_count: wins.length,
        success_rate: decided.length > 0 ? wins.length / decided.length : null,
        confidence: Math.min(0.95, 0.35 + rows.length * 0.1),
        // a pattern only becomes a real pattern once enough independent calls confirm it
        status: rows.length >= PATTERN_MIN_CONFIRMATIONS ? "confirmed" : "candidate",
      })
      .eq("id", pattern.id as string);
  }
}
