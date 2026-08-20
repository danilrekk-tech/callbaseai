import { createFileRoute } from "@tanstack/react-router";

import { authenticateApiRequest, jsonResponse } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
        const [calls, objections, patterns] = await Promise.all([
          auth.db.from("calls").select("outcome, status"),
          auth.db
            .from("objections")
            .select("title, category, occurrences, handled_count, won_count")
            .order("occurrences", { ascending: false })
            .limit(20),
          auth.db
            .from("patterns")
            .select("name, outcome_link, confirmations, success_rate, confidence")
            .order("confirmations", { ascending: false })
            .limit(20),
        ]);
        const rows = calls.data ?? [];
        const sales = rows.filter((row) => row.outcome === "sale").length;
        const losses = rows.filter((row) => row.outcome === "loss").length;
        return jsonResponse({
          totals: {
            calls: rows.length,
            sales,
            losses,
            completed: rows.filter((row) => row.status === "completed").length,
            failed: rows.filter((row) => row.status === "failed").length,
            conversion: sales + losses > 0 ? sales / (sales + losses) : 0,
          },
          top_objections: objections.data ?? [],
          top_patterns: patterns.data ?? [],
        });
      },
    },
  },
});
