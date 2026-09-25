INSERT INTO public.ai_providers (name, kind, base_url, model, secret_name, priority, enabled)
SELECT 'OpenRouter Embeddings', 'embedding', 'https://openrouter.ai/api/v1/embeddings', 'openai/text-embedding-3-small', 'OPENROUTER_API_KEY', 5, true
WHERE NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE kind='embedding' AND base_url LIKE '%openrouter.ai%');
UPDATE public.ai_providers SET enabled=false, priority=30 WHERE kind='embedding' AND base_url LIKE '%ai.gateway.lovable.dev%';
