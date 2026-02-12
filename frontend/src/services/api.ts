const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export type Trip = {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	created_at: string;
};

export type Pin = {
	id: string;
	trip_id: string;
	name: string;
	latitude: number;
	longitude: number;
	place_id: string;
	notes: string | null;
	notes_text: string | null;
	updated_at: string | null;
};

export type Video = {
	id: string;
	trip_id: string;
	original_filename: string | null;
	storage_path: string | null;
	location_hint: string | null;
	status: string;
	created_at: string;
};

export type VideoJob = {
	id: string;
	video_id: string;
	status: string;
	progress: number;
	error: string | null;
	created_at: string;
	updated_at: string;
	ollama_prompt: string | null;
	ollama_input: Record<string, unknown> | null;
	ollama_output_raw: string | null;
	ollama_output_json: Record<string, unknown> | null;
	ollama_error: string | null;
	ollama_used: boolean;
	ollama_fallback_reason: string | null;
};

export type VideoCandidate = {
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
	places_failed: boolean;
	extraction_method: string | null;
	llm_prompt: string | null;
	llm_output: Record<string, unknown> | null;
	created_at: string;
};

type ApiResponse<T> = {
	data: T | null;
	error: unknown | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
	try {
		const res = await fetch(`${API_URL}${path}`, {
			headers: {
				'Content-Type': 'application/json',
				...(init?.headers ?? {}),
			},
			...init,
		});
		const json = (await res.json()) as ApiResponse<T>;
		return json;
	} catch (error) {
		return { data: null, error };
	}
}

export async function createTrip(payload: {
	user_id: string;
	title: string;
	description?: string;
}): Promise<ApiResponse<Trip>> {
	return request<Trip>('/api/trips', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export async function listPins(tripId: string): Promise<ApiResponse<Pin[]>> {
	return request<Pin[]>(`/api/trips/${tripId}/pins`, { method: 'GET' });
}

export async function createPin(
	tripId: string,
	payload: {
		name?: string;
		latitude: number;
		longitude: number;
		placeId?: string;
		notes?: string;
	}
): Promise<ApiResponse<Pin>> {
	return request<Pin>(`/api/trips/${tripId}/pins`, {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export async function deletePin(pinId: string): Promise<ApiResponse<{ deleted: true }>> {
	return request<{ deleted: true }>(`/api/pins/${pinId}`, { method: 'DELETE' });
}

export async function updatePinNotes(
	pinId: string,
	notesText: string
): Promise<ApiResponse<Pin>> {
	return request<Pin>(`/api/pins/${pinId}`, {
		method: 'PATCH',
		body: JSON.stringify({ notes_text: notesText }),
	});
}

export async function uploadTripVideo(
	tripId: string,
	file: File,
	locationHint?: string
): Promise<ApiResponse<{ videoId: string; jobId: string }>> {
	const formData = new FormData();
	formData.append('video', file);
	if (locationHint && locationHint.trim().length > 0) {
		formData.append('location_hint', locationHint.trim());
	}
	try {
		const res = await fetch(`${API_URL}/api/trips/${tripId}/videos`, {
			method: 'POST',
			body: formData,
		});
		const json = (await res.json()) as ApiResponse<{ videoId: string; jobId: string }>;
		return json;
	} catch (error) {
		return { data: null, error };
	}
}

export async function getVideo(
	videoId: string
): Promise<ApiResponse<{ video: Video; job: VideoJob | null; candidates: VideoCandidate[] }>> {
	return request<{ video: Video; job: VideoJob | null; candidates: VideoCandidate[] }>(`/api/videos/${videoId}`, {
		method: 'GET',
	});
}

export async function approveVideoCandidates(
	videoId: string,
	candidateIds: string[]
): Promise<ApiResponse<{ createdPinCount: number; pins: Pin[] }>> {
	return request<{ createdPinCount: number; pins: Pin[] }>(`/api/videos/${videoId}/approve`, {
		method: 'POST',
		body: JSON.stringify({ candidateIds }),
	});
}

export async function addCandidatesToTrip(
	tripId: string,
	candidateIds: string[]
): Promise<ApiResponse<{ createdPinCount: number; pins?: Pin[] }>> {
	const body = { candidate_ids: candidateIds };
	try {
		const res = await fetch(`${API_URL}/api/trips/${tripId}/pins`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});
		const text = await res.text();
		let json: ApiResponse<{ createdPinCount: number; pins?: Pin[] }> | null = null;
		try {
			json = JSON.parse(text) as ApiResponse<{ createdPinCount: number; pins?: Pin[] }>;
		} catch {
			// fall through
		}

		if (!res.ok) {
			console.error('[api] addCandidatesToTrip failed', {
				status: res.status,
				body,
				responseText: text,
			});
			return { data: null, error: json?.error ?? text };
		}

		return json ?? { data: null, error: 'Invalid JSON response' };
	} catch (error) {
		console.error('[api] addCandidatesToTrip exception', { body, error });
		return { data: null, error };
	}
}

export async function getVideoDebug(
	videoId: string
): Promise<
	ApiResponse<{
		video: Video;
		job: VideoJob | null;
		candidates: VideoCandidate[];
		transcript: Array<{ start_ms?: number; end_ms?: number; text?: string }> | null;
		transcript_segment_count: number;
		transcript_text: string;
	}>
> {
	return request<{
		video: Video;
		job: VideoJob | null;
		candidates: VideoCandidate[];
		transcript: Array<{ start_ms?: number; end_ms?: number; text?: string }> | null;
		transcript_segment_count: number;
		transcript_text: string;
	}>(`/api/videos/${videoId}/debug`, {
		method: 'GET',
	});
}
