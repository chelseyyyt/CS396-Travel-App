-- Video pipeline schema: videos, jobs, candidates

create table if not exists public.videos (
	id uuid primary key default gen_random_uuid(),
	trip_id uuid not null references public.trips(id) on delete cascade,
	original_filename text,
	storage_path text,
	status text not null,
	created_at timestamp with time zone not null default now()
);

create table if not exists public.video_jobs (
	id uuid primary key default gen_random_uuid(),
	video_id uuid not null references public.videos(id) on delete cascade,
	status text not null,
	progress int not null default 0,
	error text,
	created_at timestamp with time zone not null default now(),
	updated_at timestamp with time zone not null default now()
);

create table if not exists public.video_candidates (
	id uuid primary key default gen_random_uuid(),
	video_id uuid not null references public.videos(id) on delete cascade,
	name text not null,
	address_hint text,
	latitude double precision,
	longitude double precision,
	confidence double precision not null default 0.5,
	start_ms int,
	end_ms int,
	source jsonb,
	created_at timestamp with time zone not null default now()
);

create index if not exists idx_videos_trip_id on public.videos(trip_id);
create index if not exists idx_video_jobs_video_id on public.video_jobs(video_id);
create index if not exists idx_video_jobs_status on public.video_jobs(status);
create index if not exists idx_video_candidates_video_id on public.video_candidates(video_id);
