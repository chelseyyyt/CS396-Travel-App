-- Initial schema for TravelApp
-- Matches docs/PDR.md and .cursorrules (MVP: users, trips, pins)

-- Enable pgcrypto for gen_random_uuid (Supabase supports this extension)
create extension if not exists "pgcrypto";

-- users table
create table if not exists public.users (
	id uuid primary key default gen_random_uuid(),
	name text,
	email text unique not null,
	auth_provider text
);

-- trips table
create table if not exists public.trips (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.users(id) on delete cascade,
	title text not null,
	description text,
	created_at timestamp with time zone not null default now()
);

-- pins table
create table if not exists public.pins (
	id uuid primary key default gen_random_uuid(),
	trip_id uuid not null references public.trips(id) on delete cascade,
	name text not null,
	latitude double precision not null,
	longitude double precision not null,
	place_id text not null,
	notes text
);

-- indexes to support common queries
create index if not exists idx_trips_user_id on public.trips(user_id);
create index if not exists idx_pins_trip_id on public.pins(trip_id);


