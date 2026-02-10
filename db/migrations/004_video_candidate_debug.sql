alter table public.video_candidates add column if not exists places_query text;
alter table public.video_candidates add column if not exists places_place_id text;
alter table public.video_candidates add column if not exists places_name text;
alter table public.video_candidates add column if not exists places_address text;
alter table public.video_candidates add column if not exists places_raw jsonb;
alter table public.video_candidates add column if not exists extraction_method text;
alter table public.video_candidates add column if not exists llm_prompt text;
alter table public.video_candidates add column if not exists llm_output jsonb;
