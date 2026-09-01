import { createFileRoute } from "@tanstack/react-router";

import { jsonResponse, withApi } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/patterns")({
  server: {
    handlers: {
      GET: withApi("read", async ({ request, db }) => {
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 300);
        let query = db
          .from("patterns")
          .select(
            "id, name, description, kind, outcome_link, status, confirmations, success_count, success_rate, confidence, created_at, updated_at",
            { count: "exact" },
          )
          .order("confirmations", { ascending: false })
          .limit(limit);
        if (status) query = query.eq("status", status);
        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ total: count ?? 0, data: data ?? [] });
      }),
    },
  },
});
