create table if not exists public.video_transcripts (
	id uuid primary key default gen_random_uuid(),
	video_id uuid not null references public.videos(id) on delete cascade,
	transcript jsonb not null,
	created_at timestamp with time zone not null default now()
);

create index if not exists idx_video_transcripts_video_id on public.video_transcripts(video_id);
