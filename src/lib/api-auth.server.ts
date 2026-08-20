// API key authentication for the public REST endpoints.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function hashApiKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey(): string {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(random)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `mg_sk_${body}`;
}

export type ApiAuthResult =
  | { ok: true; db: SupabaseClient; keyId: string }
  | { ok: false; response: Response };

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Validates the x-api-key / Bearer key and returns a service-role client. */
export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const header =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!header) {
    return {
      ok: false,
      response: jsonResponse({ error: "Missing API key. Send header x-api-key." }, 401),
    };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const keyHash = await hashApiKey(header.trim());
  const { data, error } = await db
    .from("api_keys")
    .select("id, revoked, request_count")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error) return { ok: false, response: jsonResponse({ error: error.message }, 500) };
  if (!data || data.revoked) {
    return { ok: false, response: jsonResponse({ error: "Invalid or revoked API key." }, 401) };
  }
  await db
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      request_count: ((data.request_count as number | undefined) ?? 0) + 1,
    })
    .eq("id", data.id as string);
  return { ok: true, db, keyId: data.id as string };
}
