import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceRoleKey =
	(process.env.SUPABASE_SERVICE_ROLE_KEY as string) ??
	(process.env.SUPABASE_SERVICE_KEY as string) ??
	(process.env.SUPABASE_KEY as string);

if (!supabaseUrl || !supabaseServiceRoleKey) {
	// eslint-disable-next-line no-console
	console.warn(
		'Supabase environment variables are not set. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
	);
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export type TripRow = {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	created_at: string;
};

export type UserRow = {
	id: string;
	name: string | null;
	email: string;
	auth_provider: string | null;
};

export type PinRow = {
	id: string;
	trip_id: string;
	name: string;
	latitude: number;
	longitude: number;
	place_id: string;
	notes: string | null;
};

export type VideoRow = {
	id: string;
	trip_id: string;
	original_filename: string | null;
	storage_path: string | null;
	location_hint: string | null;
	status: string;
	created_at: string;
};

export type VideoJobRow = {
	id: string;
	video_id: string;
	status: string;
	progress: number;
	error: string | null;
	created_at: string;
	updated_at: string;
};

export type VideoCandidateRow = {
	id: string;
	video_id: string;
	name: string;
	address_hint: string | null;
	latitude: number | null;
	longitude: number | null;
	confidence: number;
	start_ms: number | null;
	end_ms: number | null;
	source: Record<string, unknown> | null;
	places_query: string | null;
	places_place_id: string | null;
	places_name: string | null;
	places_address: string | null;
	places_raw: Record<string, unknown> | null;
	extraction_method: string | null;
	llm_prompt: string | null;
	llm_output: Record<string, unknown> | null;
	created_at: string;
};

export type VideoTranscriptRow = {
	id: string;
	video_id: string;
	transcript: Record<string, unknown>;
	created_at: string;
};
