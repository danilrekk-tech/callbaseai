import { createFileRoute } from "@tanstack/react-router";

import { jsonResponse, withApi } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/objections")({
  server: {
    handlers: {
      GET: withApi("read", async ({ request, db }) => {
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);
        const category = url.searchParams.get("category");
        let query = db
          .from("objections")
          .select(
            "id, title, category, description, occurrences, handled_count, won_count, best_responses, created_at",
            { count: "exact" },
          )
          .order("occurrences", { ascending: false })
          .limit(limit);
        if (category) query = query.eq("category", category);
        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ total: count ?? 0, data: data ?? [] });
      }),
    },
  },
});
