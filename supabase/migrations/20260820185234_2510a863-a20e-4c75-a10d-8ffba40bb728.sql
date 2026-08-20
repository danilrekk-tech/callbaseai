CREATE EXTENSION IF NOT EXISTS vector;

-- roles
CREATE TYPE public.app_role AS ENUM ('admin','analyst','viewer');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.user_roles) = 0 THEN 'admin'::public.app_role ELSE 'analyst'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- managers
CREATE TABLE public.managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers TO authenticated;
GRANT ALL ON public.managers TO service_role;
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers all authenticated" ON public.managers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER managers_touch BEFORE UPDATE ON public.managers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- calls
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  duration_seconds numeric,
  manager_id uuid REFERENCES public.managers(id) ON DELETE SET NULL,
  client_name text,
  client_company text,
  call_date timestamptz NOT NULL DEFAULT now(),
  language text,
  outcome text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'uploaded',
  error_message text,
  summary text,
  client_type text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calls all authenticated" ON public.calls FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER calls_touch BEFORE UPDATE ON public.calls FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX calls_status_idx ON public.calls(status);
CREATE INDEX calls_manager_idx ON public.calls(manager_id);
CREATE INDEX calls_date_idx ON public.calls(call_date DESC);

-- transcripts
CREATE TABLE public.transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'elevenlabs',
  model text,
  language text,
  language_probability numeric,
  full_text text NOT NULL DEFAULT '',
  words_count integer NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transcripts all authenticated" ON public.transcripts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  speaker text,
  speaker_role text,
  start_ms integer,
  end_ms integer,
  text text NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcript_segments TO authenticated;
GRANT ALL ON public.transcript_segments TO service_role;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments all authenticated" ON public.transcript_segments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX segments_call_idx ON public.transcript_segments(call_id, idx);

-- client profiles
CREATE TABLE public.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  client_type text,
  need text,
  motivation text,
  pains text[] NOT NULL DEFAULT '{}',
  choice_criteria text[] NOT NULL DEFAULT '{}',
  budget_sensitivity text,
  interest_level text,
  objections text[] NOT NULL DEFAULT '{}',
  fears text[] NOT NULL DEFAULT '{}',
  communication_style text,
  buying_signals text[] NOT NULL DEFAULT '{}',
  refusal_signals text[] NOT NULL DEFAULT '{}',
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  interpretations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_profiles TO authenticated;
GRANT ALL ON public.client_profiles TO service_role;
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_profiles all authenticated" ON public.client_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.manager_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES public.managers(id) ON DELETE SET NULL,
  conversation_structure text,
  needs_discovery text,
  questions_asked text[] NOT NULL DEFAULT '{}',
  presentation_quality text,
  objection_handling text,
  argumentation text,
  empathy_score numeric,
  expertise_score numeric,
  pressure_score numeric,
  overall_score numeric,
  mistakes text[] NOT NULL DEFAULT '{}',
  missed_opportunities text[] NOT NULL DEFAULT '{}',
  good_actions text[] NOT NULL DEFAULT '{}',
  bad_actions text[] NOT NULL DEFAULT '{}',
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  interpretations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_assessments TO authenticated;
GRANT ALL ON public.manager_assessments TO service_role;
ALTER TABLE public.manager_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager_assessments all authenticated" ON public.manager_assessments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.call_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  provider text,
  model text,
  outcome text,
  summary text,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_moments jsonb NOT NULL DEFAULT '[]'::jsonb,
  sale_reasons text[] NOT NULL DEFAULT '{}',
  loss_reasons text[] NOT NULL DEFAULT '{}',
  turning_point text,
  effective_phrases text[] NOT NULL DEFAULT '{}',
  ineffective_phrases text[] NOT NULL DEFAULT '{}',
  recommendations text[] NOT NULL DEFAULT '{}',
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  interpretations jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_analyses TO authenticated;
GRANT ALL ON public.call_analyses TO service_role;
ALTER TABLE public.call_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_analyses all authenticated" ON public.call_analyses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- objections
CREATE TABLE public.objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  category text,
  description text,
  occurrences integer NOT NULL DEFAULT 0,
  handled_count integer NOT NULL DEFAULT 0,
  won_count integer NOT NULL DEFAULT 0,
  best_responses text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objections TO authenticated;
GRANT ALL ON public.objections TO service_role;
ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objections all authenticated" ON public.objections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER objections_touch BEFORE UPDATE ON public.objections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.call_objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  objection_id uuid NOT NULL REFERENCES public.objections(id) ON DELETE CASCADE,
  quote text,
  handled boolean NOT NULL DEFAULT false,
  handling_quality text,
  manager_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, objection_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_objections TO authenticated;
GRANT ALL ON public.call_objections TO service_role;
ALTER TABLE public.call_objections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_objections all authenticated" ON public.call_objections FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- patterns
CREATE TABLE public.patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  kind text,
  outcome_link text,
  confirmations integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  success_rate numeric,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patterns TO authenticated;
GRANT ALL ON public.patterns TO service_role;
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patterns all authenticated" ON public.patterns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER patterns_touch BEFORE UPDATE ON public.patterns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.call_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  pattern_id uuid NOT NULL REFERENCES public.patterns(id) ON DELETE CASCADE,
  evidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, pattern_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_patterns TO authenticated;
GRANT ALL ON public.call_patterns TO service_role;
ALTER TABLE public.call_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_patterns all authenticated" ON public.call_patterns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- insights
CREATE TABLE public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  category text NOT NULL,
  kind text NOT NULL DEFAULT 'interpretation',
  statement text NOT NULL,
  evidence text,
  weight numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO authenticated;
GRANT ALL ON public.insights TO service_role;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights all authenticated" ON public.insights FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- knowledge base
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  title text,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_chunks all authenticated" ON public.knowledge_chunks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL UNIQUE REFERENCES public.knowledge_chunks(id) ON DELETE CASCADE,
  model text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embeddings TO authenticated;
GRANT ALL ON public.embeddings TO service_role;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "embeddings all authenticated" ON public.embeddings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX embeddings_vec_idx ON public.embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.match_knowledge(query_embedding vector(1536), match_count integer DEFAULT 8, min_similarity double precision DEFAULT 0.0)
RETURNS TABLE (
  chunk_id uuid,
  call_id uuid,
  source_type text,
  title text,
  content text,
  metadata jsonb,
  similarity double precision
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT kc.id, kc.call_id, kc.source_type, kc.title, kc.content, kc.metadata,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.embeddings e
  JOIN public.knowledge_chunks kc ON kc.id = e.chunk_id
  WHERE 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count
$$;
GRANT EXECUTE ON FUNCTION public.match_knowledge(vector, integer, double precision) TO authenticated, service_role;

-- ai jobs / providers / api keys
CREATE TABLE public.ai_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text,
  model text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_processing_jobs TO authenticated;
GRANT ALL ON public.ai_processing_jobs TO service_role;
ALTER TABLE public.ai_processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs all authenticated" ON public.ai_processing_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL,
  base_url text,
  model text,
  secret_name text,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  request_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name, model)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_providers TO authenticated;
GRANT ALL ON public.ai_providers TO service_role;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_providers all authenticated" ON public.ai_providers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER ai_providers_touch BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  revoked boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  request_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys all authenticated" ON public.api_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- default AI providers registry
INSERT INTO public.ai_providers (name, kind, base_url, model, secret_name, priority) VALUES
  ('ElevenLabs Scribe', 'transcription', 'https://api.elevenlabs.io/v1/speech-to-text', 'scribe_v2', 'ELEVENLABS_API_KEY', 10),
  ('OpenRouter Free', 'analysis', 'https://openrouter.ai/api/v1/chat/completions', 'meta-llama/llama-3.3-70b-instruct:free', 'OPENROUTER_API_KEY', 10),
  ('OpenRouter Free (DeepSeek)', 'analysis', 'https://openrouter.ai/api/v1/chat/completions', 'deepseek/deepseek-chat-v3-0324:free', 'OPENROUTER_API_KEY', 20),
  ('Lovable AI Gateway', 'analysis', 'https://ai.gateway.lovable.dev/v1/chat/completions', 'google/gemini-3.7-flash', 'LOVABLE_API_KEY', 30),
  ('Lovable AI Embeddings', 'embedding', 'https://ai.gateway.lovable.dev/v1/embeddings', 'openai/text-embedding-3-small', 'LOVABLE_API_KEY', 10);

-- storage policies for the private call-audio bucket
CREATE POLICY "authenticated can read call audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'call-audio');
CREATE POLICY "authenticated can upload call audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'call-audio');
CREATE POLICY "authenticated can delete call audio" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'call-audio');