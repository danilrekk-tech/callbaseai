ALTER TABLE public.call_analyses
  ADD COLUMN IF NOT EXISTS needs text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pain_points text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS motivation text,
  ADD COLUMN IF NOT EXISTS buying_signals text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS loss_signals text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS manager_actions text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS manager_mistakes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS successful_phrases text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS unsuccessful_phrases text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS turning_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sale_reason text,
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS confidence numeric;

ALTER TABLE public.patterns
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'candidate';

ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS last_latency_ms integer,
  ADD COLUMN IF NOT EXISTS avg_latency_ms numeric,
  ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.ai_processing_jobs
  ADD COLUMN IF NOT EXISTS latency_ms integer;

UPDATE public.insights SET kind = 'inference' WHERE kind = 'interpretation';

UPDATE public.patterns SET status = CASE WHEN confirmations >= 3 THEN 'confirmed' ELSE 'candidate' END;

INSERT INTO public.ai_providers (name, kind, base_url, model, secret_name, priority, enabled)
VALUES
  ('OpenRouter Free (Qwen 2.5 72B)', 'analysis', 'https://openrouter.ai/api/v1/chat/completions', 'qwen/qwen-2.5-72b-instruct:free', 'OPENROUTER_API_KEY', 22, true),
  ('OpenRouter Free (Mistral Small 3.2)', 'analysis', 'https://openrouter.ai/api/v1/chat/completions', 'mistralai/mistral-small-3.2-24b-instruct:free', 'OPENROUTER_API_KEY', 24, true)
ON CONFLICT DO NOTHING;