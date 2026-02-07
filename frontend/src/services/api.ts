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
};

export type Video = {
	id: string;
	trip_id: string;
	original_filename: string | null;
	storage_path: string | null;
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

export async function uploadTripVideo(
	tripId: string,
	file: File
): Promise<ApiResponse<{ videoId: string; jobId: string }>> {
	const formData = new FormData();
	formData.append('video', file);
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
): Promise<ApiResponse<{ createdPinCount: number }>> {
	return request<{ createdPinCount: number }>(`/api/videos/${videoId}/approve`, {
		method: 'POST',
		body: JSON.stringify({ candidateIds }),
	});
}
