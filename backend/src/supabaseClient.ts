import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseServiceRoleKey) {
	// eslint-disable-next-line no-console
	console.warn('Supabase environment variables are not set. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export type TripRow = {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	created_at: string;
};

