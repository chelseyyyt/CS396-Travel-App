alter table public.video_candidates add column if not exists places_failed boolean not null default false;
