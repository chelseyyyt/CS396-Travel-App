import { buildPlaceQuery, fetchPlaceForCandidate } from '../src/routes/videos.js';
import type { VideoCandidateRow } from '../src/supabaseClient.js';

describe('video approve helpers', () => {
	it('buildPlaceQuery combines name, address, and location hint', () => {
		const query = buildPlaceQuery('Example Cafe', 'Market St', 'Chicago, IL');
		expect(query).toBe('Example Cafe, Market St, Chicago, IL');
	});

	it('includes location bias in Places request when provided', async () => {
		process.env.GOOGLE_MAPS_API_KEY = 'test-key';
		const candidate: VideoCandidateRow = {
			id: 'candidate-id',
			video_id: 'video-id',
			name: 'Example Cafe',
			address_hint: 'Market St',
			latitude: null,
			longitude: null,
			confidence: 0.8,
			start_ms: null,
			end_ms: null,
			source: null,
			created_at: new Date().toISOString(),
		};

		const fetchMock = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [
					{
						place_id: 'place-123',
						geometry: { location: { lat: 41.881, lng: -87.623 } },
					},
				],
			}),
		});

		const originalFetch = global.fetch;
		global.fetch = fetchMock as typeof fetch;

		await fetchPlaceForCandidate(candidate, 'Chicago, IL', { lat: 41.881, lng: -87.623 });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain('location=41.881,-87.623');
		expect(url).toContain('radius=50000');
		expect(url).toContain(encodeURIComponent('Example Cafe, Market St, Chicago, IL'));

		global.fetch = originalFetch;
	});
});
