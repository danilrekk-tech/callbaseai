import { createFileRoute } from "@tanstack/react-router";

import { jsonResponse, withApi } from "@/lib/api-auth.server";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/ai/types";

function callIdFrom(request: Request) {
  return decodeURIComponent(new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "");
}

export const Route = createFileRoute("/api/public/v1/calls/$id")({
  server: {
    handlers: {
      GET: withApi("read", async ({ request, db }) => {
        const id = callIdFrom(request);
        const [call, transcript, segments, clientProfile, assessment, analysis, jobs] =
          await Promise.all([
            db.from("calls").select("*, managers(full_name, department)").eq("id", id).maybeSingle(),
            db
              .from("transcripts")
              .select("id, provider, model, language, full_text, words_count")
              .eq("call_id", id)
              .maybeSingle(),
            db
              .from("transcript_segments")
              .select("idx, speaker, speaker_role, start_ms, end_ms, text")
              .eq("call_id", id)
              .order("idx"),
            db.from("client_profiles").select("*").eq("call_id", id).maybeSingle(),
            db.from("manager_assessments").select("*").eq("call_id", id).maybeSingle(),
            db.from("call_analyses").select("*").eq("call_id", id).maybeSingle(),
            db
              .from("ai_processing_jobs")
              .select("stage, status, provider, model, attempts, latency_ms, error, started_at")
              .eq("call_id", id)
              .order("started_at", { ascending: false }),
          ]);
        if (!call.data) return jsonResponse({ error: "Call not found" }, 404);
        return jsonResponse({
          call: call.data,
          transcript: transcript.data,
          segments: segments.data ?? [],
          client_profile: clientProfile.data,
          manager_assessment: assessment.data,
          analysis: analysis.data,
          jobs: jobs.data ?? [],
        });
      }),

      POST: withApi("write", async ({ request, db }) => {
        const id = callIdFrom(request);
        let stage: PipelineStage | null = null;
        let continueAfter = false;
        if ((request.headers.get("content-type") ?? "").includes("application/json")) {
          try {
            const body = (await request.json()) as {
              stage?: string;
              continue_after?: boolean;
            };
            if (body.stage) {
              if (!PIPELINE_STAGES.includes(body.stage as PipelineStage)) {
                return jsonResponse(
                  { error: `Unknown stage. Allowed: ${PIPELINE_STAGES.join(", ")}` },
                  400,
                );
              }
              stage = body.stage as PipelineStage;
            }
            continueAfter = body.continue_after === true;
          } catch {
            return jsonResponse({ error: "Invalid JSON body" }, 400);
          }
        }

        try {
          const { processCallPipeline, retryStage } = await import("@/lib/ai/pipeline.server");
          const result = stage
            ? await retryStage(db, id, stage, { continueAfter })
            : await processCallPipeline(db, id);
          return jsonResponse({ id, stage, result });
        } catch (error) {
          return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 502);
        }
      }),
    },
  },
});
