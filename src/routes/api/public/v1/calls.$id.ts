import { createFileRoute } from "@tanstack/react-router";

import { authenticateApiRequest, jsonResponse } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/calls/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
        const id = params.id;
        const [call, transcript, segments, clientProfile, assessment, analysis] = await Promise.all([
          auth.db.from("calls").select("*, managers(full_name, department)").eq("id", id).maybeSingle(),
          auth.db
            .from("transcripts")
            .select("id, provider, model, language, full_text, words_count")
            .eq("call_id", id)
            .maybeSingle(),
          auth.db
            .from("transcript_segments")
            .select("idx, speaker, speaker_role, start_ms, end_ms, text")
            .eq("call_id", id)
            .order("idx"),
          auth.db.from("client_profiles").select("*").eq("call_id", id).maybeSingle(),
          auth.db.from("manager_assessments").select("*").eq("call_id", id).maybeSingle(),
          auth.db.from("call_analyses").select("*").eq("call_id", id).maybeSingle(),
        ]);
        if (!call.data) return jsonResponse({ error: "Call not found" }, 404);
        return jsonResponse({
          call: call.data,
          transcript: transcript.data,
          segments: segments.data ?? [],
          client_profile: clientProfile.data,
          manager_assessment: assessment.data,
          analysis: analysis.data,
        });
      },
      POST: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
        try {
          const { processCallPipeline } = await import("@/lib/ai/pipeline.server");
          const result = await processCallPipeline(auth.db, params.id);
          return jsonResponse({ id: params.id, result });
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : String(error) },
            502,
          );
        }
      },
    },
  },
});
