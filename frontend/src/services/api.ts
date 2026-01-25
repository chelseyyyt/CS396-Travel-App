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
