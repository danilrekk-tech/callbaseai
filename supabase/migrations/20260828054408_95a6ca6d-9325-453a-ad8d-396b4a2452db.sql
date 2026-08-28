-- 1. Stage-level job queue: one row per (call, stage)
ALTER TABLE public.ai_processing_jobs
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- collapse historical duplicates so the unique index can be created
DELETE FROM public.ai_processing_jobs a
USING public.ai_processing_jobs b
WHERE a.call_id = b.call_id
  AND a.stage = b.stage
  AND a.call_id IS NOT NULL
  AND a.started_at < b.started_at;

CREATE UNIQUE INDEX IF NOT EXISTS ai_processing_jobs_call_stage_key
  ON public.ai_processing_jobs (call_id, stage)
  WHERE call_id IS NOT NULL;

DROP TRIGGER IF EXISTS ai_processing_jobs_touch ON public.ai_processing_jobs;
CREATE TRIGGER ai_processing_jobs_touch
  BEFORE UPDATE ON public.ai_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. single-flight locks for pipeline runs
CREATE TABLE IF NOT EXISTS public.processing_locks (
  lock_key text PRIMARY KEY,
  holder text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.processing_locks TO authenticated;
GRANT ALL ON public.processing_locks TO service_role;
ALTER TABLE public.processing_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locks readable by authenticated" ON public.processing_locks
  FOR SELECT TO authenticated USING (true);

-- 3. API audit log (also used for rate limiting)
CREATE TABLE IF NOT EXISTS public.api_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  key_prefix text,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer,
  ip text,
  user_agent text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_audit_logs_key_time_idx
  ON public.api_audit_logs (api_key_id, created_at DESC);
GRANT SELECT ON public.api_audit_logs TO authenticated;
GRANT ALL ON public.api_audit_logs TO service_role;
ALTER TABLE public.api_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit logs readable by admins" ON public.api_audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. API keys: permissions, rate limit, and hide the hash from the app
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['read','write']::text[],
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer NOT NULL DEFAULT 60;

DROP POLICY IF EXISTS "api_keys all authenticated" ON public.api_keys;
CREATE POLICY "api keys admin only" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE SELECT (key_hash) ON public.api_keys FROM authenticated;

-- 5. Provider manager: explicit primary per kind, admin-only writes
ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

UPDATE public.ai_providers p
SET is_primary = true
WHERE p.id = (
  SELECT id FROM public.ai_providers q
  WHERE q.kind = p.kind AND q.enabled
  ORDER BY q.priority ASC, q.created_at ASC
  LIMIT 1
);

DROP POLICY IF EXISTS "ai_providers all authenticated" ON public.ai_providers;
CREATE POLICY "providers readable by authenticated" ON public.ai_providers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "providers writable by admins" ON public.ai_providers
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "providers updatable by admins" ON public.ai_providers
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "providers deletable by admins" ON public.ai_providers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. Processing jobs: readable by all authenticated, writable only server-side
DROP POLICY IF EXISTS "jobs all authenticated" ON public.ai_processing_jobs;
CREATE POLICY "jobs readable by authenticated" ON public.ai_processing_jobs
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.ai_processing_jobs TO authenticated;
GRANT ALL ON public.ai_processing_jobs TO service_role;