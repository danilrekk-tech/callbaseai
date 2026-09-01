// API key authentication, scopes, rate limiting and audit logging for the
// public REST endpoints. All secrets stay server-side: the frontend never sees
// provider keys, and API keys are stored only as SHA-256 hashes.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiScope = "read" | "write" | "ask";

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

export type ApiIdentity = {
  db: SupabaseClient;
  keyId: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
};

export type ApiAuthResult = { ok: true; db: SupabaseClient; keyId: string } | { ok: false; response: Response };

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

async function auditLog(
  db: SupabaseClient,
  input: {
    apiKeyId: string | null;
    keyPrefix: string | null;
    request: Request;
    status: number;
    durationMs: number;
    error?: string | null;
  },
) {
  const url = new URL(input.request.url);
  await db.from("api_audit_logs").insert({
    api_key_id: input.apiKeyId,
    key_prefix: input.keyPrefix,
    method: input.request.method,
    path: url.pathname,
    status_code: input.status,
    duration_ms: input.durationMs,
    ip: clientIp(input.request),
    user_agent: input.request.headers.get("user-agent"),
    error: input.error ? input.error.slice(0, 1000) : null,
  });
}

/** Validates the x-api-key / Bearer key and returns a service-role client. */
export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const identity = await resolveIdentity(request);
  if (!identity.ok) return { ok: false, response: identity.response };
  return { ok: true, db: identity.identity.db, keyId: identity.identity.keyId };
}

async function resolveIdentity(
  request: Request,
): Promise<{ ok: true; identity: ApiIdentity } | { ok: false; response: Response }> {
  const header =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!header.trim()) {
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
    .select("id, key_prefix, revoked, request_count, scopes, rate_limit_per_minute")
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

  return {
    ok: true,
    identity: {
      db,
      keyId: data.id as string,
      keyPrefix: (data.key_prefix as string | null) ?? "",
      scopes: ((data.scopes as string[] | null) ?? ["read", "write", "ask"]),
      rateLimitPerMinute: (data.rate_limit_per_minute as number | null) ?? 60,
    },
  };
}

async function isRateLimited(db: SupabaseClient, keyId: string, limit: number) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from("api_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", keyId)
    .gte("created_at", since);
  return { limited: (count ?? 0) >= limit, used: count ?? 0 };
}

/**
 * Wraps a public API handler with authentication, scope permissions,
 * per-key rate limiting, uniform JSON error handling and audit logging.
 */
export function withApi(
  scope: ApiScope,
  handler: (ctx: { request: Request; db: SupabaseClient; keyId: string }) => Promise<Response>,
) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const startedAt = Date.now();
    const resolved = await resolveIdentity(request);
    if (!resolved.ok) return resolved.response;
    const { db, keyId, keyPrefix, scopes, rateLimitPerMinute } = resolved.identity;

    const finish = async (response: Response, error?: string | null) => {
      try {
        await auditLog(db, {
          apiKeyId: keyId,
          keyPrefix,
          request,
          status: response.status,
          durationMs: Date.now() - startedAt,
          error: error ?? null,
        });
      } catch {
        // auditing must never break the response
      }
      return response;
    };

    if (!scopes.includes(scope)) {
      return finish(
        jsonResponse({ error: `API key lacks required scope "${scope}".` }, 403),
        "scope denied",
      );
    }

    const rate = await isRateLimited(db, keyId, rateLimitPerMinute);
    if (rate.limited) {
      return finish(
        jsonResponse(
          { error: "Rate limit exceeded", limit: rateLimitPerMinute, window_seconds: 60 },
          429,
          { "Retry-After": "60" },
        ),
        "rate limited",
      );
    }

    try {
      const response = await handler({ request, db, keyId });
      return finish(response, response.status >= 400 ? `status ${response.status}` : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return finish(jsonResponse({ error: message }, 500), message);
    }
  };
}
