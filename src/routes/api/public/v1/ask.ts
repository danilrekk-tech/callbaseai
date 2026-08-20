import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { authenticateApiRequest, jsonResponse } from "@/lib/api-auth.server";

const AskSchema = z.object({ question: z.string().min(3).max(2000) });

export const Route = createFileRoute("/api/public/v1/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
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
          const result = await askKnowledgeBase(auth.db, parsed.data.question);
          return jsonResponse(result);
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
