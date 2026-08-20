import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { authenticateApiRequest, jsonResponse } from "@/lib/api-auth.server";

const CreateCallSchema = z.object({
  storage_path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(300),
  mime_type: z.string().max(120).optional(),
  file_size: z.number().int().positive().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  client_name: z.string().max(200).nullable().optional(),
  client_company: z.string().max(200).nullable().optional(),
  call_date: z.string().datetime().optional(),
  process: z.boolean().optional(),
});

export const Route = createFileRoute("/api/public/v1/calls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        let query = auth.db
          .from("calls")
          .select(
            "id, file_name, client_name, client_company, client_type, call_date, duration_seconds, outcome, status, summary, language, manager_id, managers(full_name)",
            { count: "exact" },
          )
          .order("call_date", { ascending: false })
          .range(offset, offset + limit - 1);
        const outcome = url.searchParams.get("outcome");
        const status = url.searchParams.get("status");
        const managerId = url.searchParams.get("manager_id");
        if (outcome) query = query.eq("outcome", outcome);
        if (status) query = query.eq("status", status);
        if (managerId) query = query.eq("manager_id", managerId);
        const { data, error, count } = await query;
        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ total: count ?? 0, limit, offset, data });
      },
      POST: async ({ request }) => {
        const auth = await authenticateApiRequest(request);
        if (!auth.ok) return auth.response;
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        const parsed = CreateCallSchema.safeParse(payload);
        if (!parsed.success) {
          return jsonResponse({ error: "Validation failed", details: parsed.error.issues }, 400);
        }
        const input = parsed.data;
        const { data, error } = await auth.db
          .from("calls")
          .insert({
            file_name: input.file_name,
            storage_path: input.storage_path,
            mime_type: input.mime_type ?? null,
            file_size: input.file_size ?? null,
            manager_id: input.manager_id ?? null,
            client_name: input.client_name ?? null,
            client_company: input.client_company ?? null,
            call_date: input.call_date ?? new Date().toISOString(),
            status: "uploaded",
          })
          .select("id")
          .single();
        if (error) return jsonResponse({ error: error.message }, 500);

        if (input.process === false) return jsonResponse({ id: data.id, processed: false }, 201);
        try {
          const { processCallPipeline } = await import("@/lib/ai/pipeline.server");
          const result = await processCallPipeline(auth.db, data.id as string);
          return jsonResponse({ id: data.id, processed: true, result }, 201);
        } catch (pipelineError) {
          return jsonResponse(
            {
              id: data.id,
              processed: false,
              error: pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
            },
            502,
          );
        }
      },
    },
  },
});
