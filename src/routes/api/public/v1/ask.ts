import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { jsonResponse, withApi } from "@/lib/api-auth.server";

const AskSchema = z.object({
  question: z.string().min(3).max(2000),
  manager_id: z.string().uuid().nullable().optional(),
  client_name: z.string().max(200).nullable().optional(),
  limit: z.number().int().min(1).max(40).optional(),
});

export const Route = createFileRoute("/api/public/v1/ask")({
  server: {
    handlers: {
      POST: withApi("ask", async ({ request, db }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        const parsed = AskSchema.safeParse(payload);
        if (!parsed.success) {
          return jsonResponse({ error: "Validation failed", details: parsed.error.issues }, 400);
        }
        try {
          const { askKnowledgeBase } = await import("@/lib/ai/search.server");
          const result = await askKnowledgeBase(db, parsed.data.question, parsed.data.limit ?? 12, {
            managerId: parsed.data.manager_id ?? null,
            clientName: parsed.data.client_name ?? null,
          });
          return jsonResponse({
            answer: result.answer,
            confidence: result.confidence,
            provider: result.provider,
            model: result.model,
            sources: result.sources,
            related_calls: result.related_calls,
            patterns: result.patterns,
            objections: result.objections,
            recommendations: result.recommendations,
          });
        } catch (error) {
          return jsonResponse(
            { error: error instanceof Error ? error.message : String(error) },
            502,
          );
        }
      }),
    },
  },
});
