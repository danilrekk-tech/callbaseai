import { createFileRoute } from "@tanstack/react-router";

import { jsonResponse, withApi } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/stats")({
  server: {
    handlers: {
      GET: withApi("read", async ({ db }) => {
        const [calls, objections, patterns, jobs] = await Promise.all([
          db.from("calls").select("outcome, status"),
          db
            .from("objections")
            .select("title, category, occurrences, handled_count, won_count")
            .order("occurrences", { ascending: false })
            .limit(20),
          db
            .from("patterns")
            .select("name, outcome_link, status, confirmations, success_rate, confidence")
            .order("confirmations", { ascending: false })
            .limit(20),
          db.from("ai_processing_jobs").select("stage, status"),
        ]);
        const rows = calls.data ?? [];
        const sales = rows.filter((row) => row.outcome === "sale").length;
        const losses = rows.filter((row) => row.outcome === "loss").length;
        const jobRows = jobs.data ?? [];
        return jsonResponse({
          totals: {
            calls: rows.length,
            sales,
            losses,
            completed: rows.filter((row) => row.status === "completed").length,
            failed: rows.filter((row) => row.status === "failed").length,
            conversion: sales + losses > 0 ? sales / (sales + losses) : 0,
          },
          processing: {
            running: jobRows.filter((row) => row.status === "running").length,
            failed: jobRows.filter((row) => row.status === "failed").length,
            succeeded: jobRows.filter((row) => row.status === "succeeded").length,
          },
          top_objections: objections.data ?? [],
          top_patterns: patterns.data ?? [],
        });
      }),
    },
  },
});
