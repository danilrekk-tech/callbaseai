import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { jsonResponse, withApi } from "@/lib/api-auth.server";
import { MAX_AUDIO_BYTES, SUPPORTED_AUDIO_EXTENSIONS } from "@/lib/ai/types";

const CreateCallSchema = z
  .object({
    storage_path: z.string().min(1).max(500).optional(),
    audio_url: z.string().url().max(2000).optional(),
    file_name: z.string().min(1).max(300).optional(),
    mime_type: z.string().max(120).optional(),
    file_size: z.number().int().positive().optional(),
    manager_id: z.string().uuid().nullable().optional(),
    client_name: z.string().max(200).nullable().optional(),
    client_company: z.string().max(200).nullable().optional(),
    call_date: z.string().datetime().optional(),
    process: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.storage_path || value.audio_url), {
    message: "Either storage_path or audio_url is required",
  });

function extensionOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

function isSupported(name: string) {
  return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

function storagePathFor(fileName: string) {
  const safe = fileName.replace(/[^\w.-]+/g, "_").slice(-80);
  return `api/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
}

export const Route = createFileRoute("/api/public/v1/calls")({
  server: {
    handlers: {
      GET: withApi("read", async ({ request, db }) => {
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
        let query = db
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
      }),

      POST: withApi("write", async ({ request, db }) => {
        const contentType = request.headers.get("content-type") ?? "";
        let input: z.infer<typeof CreateCallSchema>;
        let uploadBytes: ArrayBuffer | null = null;
        let uploadName: string | null = null;
        let uploadType: string | null = null;

        if (contentType.includes("multipart/form-data")) {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return jsonResponse({ error: "multipart body must include a 'file' field" }, 400);
          }
          if (!isSupported(file.name)) {
            return jsonResponse(
              {
                error: `Unsupported audio format. Allowed: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`,
              },
              400,
            );
          }
          if (file.size > MAX_AUDIO_BYTES) {
            return jsonResponse({ error: "Audio file is too large", max_bytes: MAX_AUDIO_BYTES }, 413);
          }
          uploadBytes = await file.arrayBuffer();
          uploadName = file.name;
          uploadType = file.type || "audio/mpeg";
          const str = (key: string) => {
            const value = form.get(key);
            return typeof value === "string" && value.length > 0 ? value : undefined;
          };
          input = CreateCallSchema.parse({
            file_name: uploadName,
            mime_type: uploadType,
            file_size: file.size,
            storage_path: "pending",
            manager_id: str("manager_id") ?? null,
            client_name: str("client_name") ?? null,
            client_company: str("client_company") ?? null,
            call_date: str("call_date"),
            process: str("process") !== "false",
          });
        } else {
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
          input = parsed.data;

          if (input.audio_url) {
            const remote = await fetch(input.audio_url);
            if (!remote.ok) {
              return jsonResponse(
                { error: `Could not download audio_url (status ${remote.status})` },
                400,
              );
            }
            const derivedName =
              input.file_name ?? decodeURIComponent(new URL(input.audio_url).pathname.split("/").pop() ?? "call.mp3");
            if (!isSupported(derivedName)) {
              return jsonResponse(
                {
                  error: `Unsupported audio format. Allowed: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`,
                },
                400,
              );
            }
            uploadBytes = await remote.arrayBuffer();
            if (uploadBytes.byteLength > MAX_AUDIO_BYTES) {
              return jsonResponse(
                { error: "Audio file is too large", max_bytes: MAX_AUDIO_BYTES },
                413,
              );
            }
            uploadName = derivedName;
            uploadType = remote.headers.get("content-type") ?? "audio/mpeg";
          }
        }

        let storagePath = input.storage_path ?? "";
        if (uploadBytes && uploadName) {
          storagePath = storagePathFor(uploadName);
          const upload = await db.storage
            .from("call-audio")
            .upload(storagePath, uploadBytes, { contentType: uploadType ?? "audio/mpeg" });
          if (upload.error) return jsonResponse({ error: upload.error.message }, 500);
        }

        const fileName = uploadName ?? input.file_name ?? storagePath.split("/").pop() ?? "call.mp3";

        const { data, error } = await db
          .from("calls")
          .insert({
            file_name: fileName,
            storage_path: storagePath,
            mime_type: uploadType ?? input.mime_type ?? null,
            file_size: uploadBytes?.byteLength ?? input.file_size ?? null,
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
          const result = await processCallPipeline(db, data.id as string);
          return jsonResponse({ id: data.id, processed: true, result }, 201);
        } catch (pipelineError) {
          return jsonResponse(
            {
              id: data.id,
              processed: false,
              error:
                pipelineError instanceof Error ? pipelineError.message : String(pipelineError),
            },
            502,
          );
        }
      }),
    },
  },
});
