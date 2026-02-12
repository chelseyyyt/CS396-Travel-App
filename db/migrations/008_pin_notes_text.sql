alter table public.pins add column if not exists notes_text text;
alter table public.pins add column if not exists updated_at timestamp with time zone default now();
