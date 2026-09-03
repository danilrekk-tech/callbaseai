import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [calls, objections, patterns, analyses, assessments] = await Promise.all([
      db
        .from("calls")
        .select("id, call_date, outcome, status, manager_id, managers(full_name)")
        .order("call_date", { ascending: false })
        .limit(2000),
      db
        .from("objections")
        .select("id, title, category, occurrences, handled_count, won_count")
        .order("occurrences", { ascending: false })
        .limit(8),
      db
        .from("patterns")
        .select("id, name, description, confirmations, success_rate, confidence, outcome_link")
        .order("confirmations", { ascending: false })
        .limit(6),
      db.from("call_analyses").select("loss_reasons, sale_reasons").limit(2000),
      db.from("manager_assessments").select("manager_id, overall_score").limit(2000),
    ]);

    const rows = calls.data ?? [];
    const sales = rows.filter((r) => r.outcome === "sale").length;
    const losses = rows.filter((r) => r.outcome === "loss").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    const inProcessing = rows.filter(
      (r) => !["completed", "failed"].includes(r.status as string),
    ).length;

    // dynamics: last 12 weeks
    const dynamics: { period: string; calls: number; sales: number; losses: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now.getTime() - i * 7 * 86400000);
      const start = new Date(end.getTime() - 7 * 86400000);
      const bucket = rows.filter((r) => {
        const date = new Date(r.call_date as string);
        return date > start && date <= end;
      });
      dynamics.push({
        period: end.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
        calls: bucket.length,
        sales: bucket.filter((r) => r.outcome === "sale").length,
        losses: bucket.filter((r) => r.outcome === "loss").length,
      });
    }

    // manager leaderboard
    const scoreByManager = new Map<string, { total: number; count: number }>();
    for (const row of assessments.data ?? []) {
      const managerId = row.manager_id as string | null;
      if (!managerId || row.overall_score == null) continue;
      const entry = scoreByManager.get(managerId) ?? { total: 0, count: 0 };
      entry.total += Number(row.overall_score);
      entry.count += 1;
      scoreByManager.set(managerId, entry);
    }
    const managerStats = new Map<
      string,
      { id: string; name: string; calls: number; sales: number; losses: number; score: number | null }
    >();
    for (const row of rows) {
      const managerId = row.manager_id as string | null;
      if (!managerId) continue;
      const name = (row.managers as { full_name?: string } | null)?.full_name ?? "Без имени";
      const entry =
        managerStats.get(managerId) ??
        { id: managerId, name, calls: 0, sales: 0, losses: 0, score: null };
      entry.calls += 1;
      if (row.outcome === "sale") entry.sales += 1;
      if (row.outcome === "loss") entry.losses += 1;
      managerStats.set(managerId, entry);
    }
    const topManagers = [...managerStats.values()]
      .map((manager) => {
        const score = scoreByManager.get(manager.id);
        return {
          ...manager,
          score: score && score.count > 0 ? score.total / score.count : null,
          conversion: manager.sales + manager.losses > 0 ? manager.sales / (manager.sales + manager.losses) : 0,
        };
      })
      .sort((a, b) => b.conversion - a.conversion || b.calls - a.calls)
      .slice(0, 6);

    const lossReasons = new Map<string, number>();
    const saleReasons = new Map<string, number>();
    for (const analysis of analyses.data ?? []) {
      for (const reason of (analysis.loss_reasons as string[] | null) ?? []) {
        const key = reason.trim().toLowerCase();
        if (key) lossReasons.set(key, (lossReasons.get(key) ?? 0) + 1);
      }
      for (const reason of (analysis.sale_reasons as string[] | null) ?? []) {
        const key = reason.trim().toLowerCase();
        if (key) saleReasons.set(key, (saleReasons.get(key) ?? 0) + 1);
      }
    }
    const topOf = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([reason, count]) => ({ reason, count }));

    return {
      totals: {
        calls: rows.length,
        sales,
        losses,
        completed,
        failed,
        inProcessing,
        conversion: sales + losses > 0 ? sales / (sales + losses) : 0,
      },
      dynamics,
      objections: objections.data ?? [],
      patterns: patterns.data ?? [],
      topManagers,
      lossReasons: topOf(lossReasons),
      saleReasons: topOf(saleReasons),
    };
  });

export const listManagers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [managers, calls, assessments] = await Promise.all([
      db.from("managers").select("*").order("full_name"),
      db.from("calls").select("id, manager_id, outcome, status"),
      db
        .from("manager_assessments")
        .select(
          "manager_id, overall_score, empathy_score, expertise_score, pressure_score, mistakes, good_actions",
        ),
    ]);

    return (managers.data ?? []).map((manager) => {
      const own = (calls.data ?? []).filter((c) => c.manager_id === manager.id);
      const scored = (assessments.data ?? []).filter((a) => a.manager_id === manager.id);
      const avg = (key: "overall_score" | "empathy_score" | "expertise_score" | "pressure_score") => {
        const values = scored
          .map((s) => s[key])
          .filter((v): v is number => v != null)
          .map(Number);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
      };
      const sales = own.filter((c) => c.outcome === "sale").length;
      const losses = own.filter((c) => c.outcome === "loss").length;
      const mistakes = new Map<string, number>();
      const strengths = new Map<string, number>();
      for (const item of scored) {
        for (const mistake of (item.mistakes as string[] | null) ?? [])
          mistakes.set(mistake, (mistakes.get(mistake) ?? 0) + 1);
        for (const good of (item.good_actions as string[] | null) ?? [])
          strengths.set(good, (strengths.get(good) ?? 0) + 1);
      }
      const top = (map: Map<string, number>) =>
        [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([text, count]) => ({ text, count }));
      return {
        ...manager,
        calls: own.length,
        sales,
        losses,
        conversion: sales + losses > 0 ? sales / (sales + losses) : 0,
        overall: avg("overall_score"),
        empathy: avg("empathy_score"),
        expertise: avg("expertise_score"),
        pressure: avg("pressure_score"),
        mistakes: top(mistakes),
        strengths: top(strengths),
      };
    });
  });

export const upsertManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      full_name: string;
      email?: string | null;
      department?: string | null;
      is_active?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const payload = {
      full_name: data.full_name,
      email: data.email ?? null,
      department: data.department ?? null,
      is_active: data.is_active ?? true,
    };
    const query = data.id
      ? context.supabase.from("managers").update(payload).eq("id", data.id)
      : context.supabase.from("managers").insert(payload);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPatterns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("patterns")
      .select(
        "*, call_patterns(evidence, calls(id, client_name, call_date, outcome, managers(full_name)))",
      )
      .order("confirmations", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [patterns, insights, objections, calls] = await Promise.all([
      context.supabase
        .from("patterns")
        .select("id, name, description, kind, outcome_link, confirmations, success_rate, confidence, status, updated_at, call_patterns(evidence, calls(id, client_name, call_date, outcome, managers(full_name)))")
        .order("updated_at", { ascending: false })
        .limit(30),
      context.supabase
        .from("insights")
        .select("id, call_id, category, kind, statement, evidence, weight, created_at, calls(id, client_name, call_date)")
        .order("created_at", { ascending: false })
        .limit(40),
      context.supabase
        .from("objections")
        .select("id, title, category, occurrences, handled_count, won_count")
        .order("occurrences", { ascending: false })
        .limit(8),
      context.supabase.from("calls").select("id, outcome, status").limit(5000),
    ]);
    const callRows = calls.data ?? [];
    return {
      patterns: patterns.data ?? [],
      insights: insights.data ?? [],
      objections: objections.data ?? [],
      coverage: {
        total: callRows.length,
        analyzed: callRows.filter((row) => row.status === "completed").length,
        patterns: (patterns.data ?? []).filter((row) => row.status === "confirmed").length,
        candidates: (patterns.data ?? []).filter((row) => row.status !== "confirmed").length,
      },
    };
  });

export const listObjections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("objections")
      .select(
        "*, call_objections(quote, handled, handling_quality, manager_response, calls(id, client_name, call_date, outcome, managers(full_name)))",
      )
      .order("occurrences", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string | undefined; sourceType?: string | undefined } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("knowledge_chunks")
      .select("id, call_id, source_type, title, content, created_at, metadata, embeddings(model)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.sourceType) query = query.eq("source_type", data.sourceType);
    if (data.search) query = query.ilike("content", `%${data.search}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { count } = await context.supabase
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true });
    const { count: embeddingCount } = await context.supabase
      .from("embeddings")
      .select("id", { count: "exact", head: true });
    return { rows: rows ?? [], total: count ?? 0, embeddings: embeddingCount ?? 0 };
  });

export const recomputeAggregates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAggregates } = await import("./ai/pipeline.server");
    await refreshAggregates(supabaseAdmin as unknown as SupabaseClient);
    return { ok: true };
  });
