import { createFileRoute } from "@tanstack/react-router";

import { jsonResponse, withApi } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/managers")({
  server: {
    handlers: {
      GET: withApi("read", async ({ db }) => {
        const [managersRes, callsRes, assessmentsRes] = await Promise.all([
          db.from("managers").select("id, full_name, email, department, is_active").order("full_name"),
          db.from("calls").select("manager_id, outcome, duration_seconds"),
          db.from("manager_assessments").select("manager_id, overall_score, empathy_score, expertise_score"),
        ]);

        const calls = callsRes.data ?? [];
        const assessments = assessmentsRes.data ?? [];
        const data = (managersRes.data ?? []).map((manager) => {
          const own = calls.filter((call) => call.manager_id === manager.id);
          const sales = own.filter((call) => call.outcome === "sale").length;
          const lost = own.filter((call) => call.outcome === "loss").length;
          const scores = assessments
            .filter((row) => row.manager_id === manager.id)
            .map((row) => Number(row.overall_score))
            .filter((value) => Number.isFinite(value));
          return {
            ...manager,
            calls_total: own.length,
            sales,
            lost,
            conversion: sales + lost > 0 ? sales / (sales + lost) : null,
            avg_score:
              scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
          };
        });
        return jsonResponse({ total: data.length, data });
      }),
    },
  },
});
