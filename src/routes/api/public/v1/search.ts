import { createFileRoute } from "@tanstack/react-router";

import { authenticateApiRequest, jsonResponse } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
        const url = new URL(request.url);
        const query = (url.searchParams.get("q") ?? "").slice(0, 1000);
        if (!query.trim()) return jsonResponse({ error: "Missing q parameter" }, 400);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
        try {
          const { semanticSearch } = await import("@/lib/ai/search.server");
          const matches = await semanticSearch(auth.db, query, limit);
          return jsonResponse({ query, count: matches.length, data: matches });
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
