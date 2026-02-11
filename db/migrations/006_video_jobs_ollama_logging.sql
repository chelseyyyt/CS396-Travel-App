alter table public.video_jobs add column if not exists ollama_prompt text;
alter table public.video_jobs add column if not exists ollama_input jsonb;
alter table public.video_jobs add column if not exists ollama_output_raw text;
alter table public.video_jobs add column if not exists ollama_output_json jsonb;
alter table public.video_jobs add column if not exists ollama_error text;
alter table public.video_jobs add column if not exists ollama_used boolean not null default false;
alter table public.video_jobs add column if not exists ollama_fallback_reason text;
