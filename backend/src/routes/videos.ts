import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
	supabase,
	PinRow,
	VideoCandidateRow,
	VideoJobRow,
	VideoRow,
	VideoTranscriptRow,
} from '../supabaseClient.js';

export const videosRouter = express.Router();

const videoIdSchema = z.string().uuid();
const tripIdSchema = z.string().uuid();

const approveSchema = z.object({
	candidateIds: z.array(z.string().uuid()).default([]),
});

function getGoogleMapsApiKey(): string {
	return (
		process.env.GOOGLE_MAPS_API_KEY ??
		process.env.GOOGLE_PLACES_API_KEY ??
		process.env.GOOGLE_MAPS_API_TOKEN ??
		''
	);
}

const PLACES_BIAS_RADIUS_METERS = 50000;

const uploadsDir = process.env.UPLOADS_DIR
	? path.resolve(process.env.UPLOADS_DIR)
	: path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
	destination: (_req, _file, cb) => {
		cb(null, uploadsDir);
	},
	filename: (req, file, cb) => {
		const videoId = (req as express.Request & { videoId?: string }).videoId ?? randomUUID();
		(req as express.Request & { videoId?: string }).videoId = videoId;
		const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
		const filename = `${videoId}_${safeOriginal}`;
		(req as express.Request & { storedFilename?: string }).storedFilename = filename;
		cb(null, filename);
	},
});

const upload = multer({ storage });

function assignVideoId(req: express.Request, _res: express.Response, next: express.NextFunction) {
	(req as express.Request & { videoId?: string }).videoId = randomUUID();
	next();
}

// Upload video + create job
videosRouter.post('/trips/:tripId/videos', assignVideoId, upload.single('video'), async (req, res) => {
	try {
		const tripIdParse = tripIdSchema.safeParse(req.params.tripId);
		if (!tripIdParse.success) {
			return res.status(400).json({ data: null, error: 'tripId must be a valid UUID' });
		}
		if (!req.file) {
			return res.status(400).json({ data: null, error: 'video file is required' });
		}

		const videoId = (req as express.Request & { videoId?: string }).videoId ?? randomUUID();
		const storedFilename =
			(req as express.Request & { storedFilename?: string }).storedFilename ?? req.file.filename;
		const storagePath = path.join(uploadsDir, storedFilename);

		const locationHint = normalizeHint((req.body as { location_hint?: string })?.location_hint);

		const { error: videoError } = await supabase.from<VideoRow>('videos').insert({
			id: videoId,
			trip_id: tripIdParse.data,
			original_filename: req.file.originalname,
			storage_path: storagePath,
			location_hint: locationHint,
			status: 'queued',
		});

		if (videoError) {
			try {
				fs.unlinkSync(storagePath);
			} catch (_err) {
				// ignore cleanup errors
			}
			return res.status(500).json({ data: null, error: videoError.message });
		}

		const { data: jobData, error: jobError } = await supabase
			.from<VideoJobRow>('video_jobs')
			.insert({
				video_id: videoId,
				status: 'queued',
				progress: 0,
			})
			.select()
			.single();

		if (jobError) {
			return res.status(500).json({ data: null, error: jobError.message });
		}

		return res.status(201).json({ data: { videoId, jobId: jobData.id }, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Get video + job + candidates
videosRouter.get('/videos/:videoId', async (req, res) => {
	try {
		const videoIdParse = videoIdSchema.safeParse(req.params.videoId);
		if (!videoIdParse.success) {
			return res.status(400).json({ data: null, error: 'videoId must be a valid UUID' });
		}
		const videoId = videoIdParse.data;

		const { data: video, error: videoError } = await supabase
			.from<VideoRow>('videos')
			.select('*')
			.eq('id', videoId)
			.single();

		if (videoError || !video) {
			return res.status(404).json({ data: null, error: 'Video not found' });
		}

		const { data: jobs, error: jobError } = await supabase
			.from<VideoJobRow>('video_jobs')
			.select('*')
			.eq('video_id', videoId)
			.order('created_at', { ascending: false })
			.limit(1);

		if (jobError) {
			return res.status(500).json({ data: null, error: jobError.message });
		}

		const { data: candidates, error: candidateError } = await supabase
			.from<VideoCandidateRow>('video_candidates')
			.select('*')
			.eq('video_id', videoId)
			.order('confidence', { ascending: false });

		if (candidateError) {
			return res.status(500).json({ data: null, error: candidateError.message });
		}

		const { data: transcripts, error: transcriptError } = await supabase
			.from<VideoTranscriptRow>('video_transcripts')
			.select('*')
			.eq('video_id', videoId)
			.order('created_at', { ascending: false })
			.limit(1);

		if (transcriptError) {
			return res.status(500).json({ data: null, error: transcriptError.message });
		}

		return res.status(200).json({
			data: {
				video,
				job: jobs?.[0] ?? null,
				candidates: candidates ?? [],
				transcript: transcripts?.[0] ?? null,
			},
			error: null,
		});
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Debug: video + job + candidates with evidence + places metadata
videosRouter.get('/videos/:videoId/debug', async (req, res) => {
	try {
		const videoIdParse = videoIdSchema.safeParse(req.params.videoId);
		if (!videoIdParse.success) {
			return res.status(400).json({ data: null, error: 'videoId must be a valid UUID' });
		}
		const videoId = videoIdParse.data;

		const { data: video, error: videoError } = await supabase
			.from<VideoRow>('videos')
			.select('*')
			.eq('id', videoId)
			.single();

		if (videoError || !video) {
			return res.status(404).json({ data: null, error: 'Video not found' });
		}

		const { data: jobs, error: jobError } = await supabase
			.from<VideoJobRow>('video_jobs')
			.select('*')
			.eq('video_id', videoId)
			.order('created_at', { ascending: false })
			.limit(1);

		if (jobError) {
			return res.status(500).json({ data: null, error: jobError.message });
		}

		const { data: candidates, error: candidateError } = await supabase
			.from<VideoCandidateRow>('video_candidates')
			.select('*')
			.eq('video_id', videoId)
			.order('confidence', { ascending: false });

		if (candidateError) {
			return res.status(500).json({ data: null, error: candidateError.message });
		}

		const { data: transcriptRow, error: transcriptError } = await supabase
			.from<VideoTranscriptRow>('video_transcripts')
			.select('transcript')
			.eq('video_id', videoId)
			.maybeSingle();

		if (transcriptError) {
			console.error('[video-debug] transcript fetch error', transcriptError.message);
			return res.status(500).json({ data: null, error: transcriptError.message });
		}

		const transcript = (transcriptRow?.transcript ?? null) as Array<{
			start_ms?: number;
			end_ms?: number;
			text?: string;
		}> | null;
		const transcriptSegmentCount = transcript ? transcript.length : 0;
		const transcriptText = transcript
			? transcript
					.map(segment => {
						const start = segment.start_ms ?? 0;
						const end = segment.end_ms ?? 0;
						const text = segment.text ?? '';
						return `[${start}-${end}] ${text}`.trim();
					})
					.join('\n')
			: '';

		return res.status(200).json({
			data: {
				video,
				job: jobs?.[0] ?? null,
				candidates: candidates ?? [],
				transcript,
				transcript_segment_count: transcriptSegmentCount,
				transcript_text: transcriptText,
			},
			error: null,
		});
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Dev-only transcript export
videosRouter.get('/videos/:videoId/transcript.txt', async (req, res) => {
	try {
		const videoIdParse = videoIdSchema.safeParse(req.params.videoId);
		if (!videoIdParse.success) {
			return res.status(400).json({ data: null, error: 'videoId must be a valid UUID' });
		}
		const videoId = videoIdParse.data;

		const { data: transcriptRow, error: transcriptError } = await supabase
			.from<VideoTranscriptRow>('video_transcripts')
			.select('transcript')
			.eq('video_id', videoId)
			.maybeSingle();

		if (transcriptError) {
			console.error('[video-transcript] fetch error', transcriptError.message);
			return res.status(500).send('Transcript fetch error');
		}

		const transcript = (transcriptRow?.transcript ?? []) as Array<{
			start_ms?: number;
			end_ms?: number;
			text?: string;
		}>;
		const transcriptText = transcript
			.map(segment => {
				const start = segment.start_ms ?? 0;
				const end = segment.end_ms ?? 0;
				const text = segment.text ?? '';
				return `[${start}-${end}] ${text}`.trim();
			})
			.join('\n');

		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		return res.status(200).send(transcriptText);
	} catch (_e) {
		return res.status(500).send('Internal server error');
	}
});

type LatLng = { lat: number; lng: number };
type PlaceResult = {
	place_id: string;
	name: string | null;
	address: string | null;
	location: LatLng;
	raw: Record<string, unknown> | null;
} | null;

function normalizeHint(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export function buildPlaceQuery(candidateName: string, addressHint?: string | null, locationHint?: string | null): string {
	const parts = [candidateName, addressHint ?? '', locationHint ?? '']
		.map(part => part.trim())
		.filter(part => part.length > 0);
	return parts.join(', ');
}

export function buildPlacesTextSearchUrl(query: string, apiKey: string, locationBias?: LatLng | null): string {
	const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
	url.searchParams.set('query', query);
	url.searchParams.set('key', apiKey);
	if (locationBias) {
		url.searchParams.set('location', `${locationBias.lat},${locationBias.lng}`);
		url.searchParams.set('radius', PLACES_BIAS_RADIUS_METERS.toString());
	}
	return url.toString();
}

async function geocodeLocationHint(locationHint: string): Promise<LatLng | null> {
	const googleMapsApiKey = getGoogleMapsApiKey();
	if (!googleMapsApiKey) return null;
	const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
	url.searchParams.set('address', locationHint);
	url.searchParams.set('key', googleMapsApiKey);
	const response = await fetch(url.toString());
	if (!response.ok) {
		return null;
	}
	const json = (await response.json()) as {
		results?: { geometry?: { location?: { lat: number; lng: number } } }[];
		status?: string;
	};
	const location = json.results?.[0]?.geometry?.location;
	if (!location) return null;
	return { lat: location.lat, lng: location.lng };
}

export async function fetchPlaceForCandidate(
	candidate: VideoCandidateRow,
	locationHint?: string | null,
	locationBias?: LatLng | null
): Promise<PlaceResult> {
	const googleMapsApiKey = getGoogleMapsApiKey();
	if (!googleMapsApiKey) return null;
	const query = buildPlaceQuery(candidate.name, candidate.address_hint, locationHint);
	const url = buildPlacesTextSearchUrl(query, googleMapsApiKey, locationBias);
	const response = await fetch(url);
	if (!response.ok) {
		return null;
	}
	const json = (await response.json()) as {
		results?: {
			place_id?: string;
			name?: string;
			formatted_address?: string;
			geometry?: { location?: { lat: number; lng: number } };
		}[];
		status?: string;
	};
	const top = json.results?.[0];
	const loc = top?.geometry?.location;
	if (!top?.place_id || !loc) {
		return null;
	}
	return {
		place_id: top.place_id,
		name: top.name ?? null,
		address: top.formatted_address ?? null,
		location: { lat: loc.lat, lng: loc.lng },
		raw: json as unknown as Record<string, unknown>,
	};
}

// Approve candidates -> pins
videosRouter.post('/videos/:videoId/approve', async (req, res) => {
	try {
		const videoIdParse = videoIdSchema.safeParse(req.params.videoId);
		if (!videoIdParse.success) {
			return res.status(400).json({ data: null, error: 'videoId must be a valid UUID' });
		}
		const bodyParse = approveSchema.safeParse(req.body);
		if (!bodyParse.success) {
			return res.status(400).json({ data: null, error: bodyParse.error.flatten() });
		}

		const candidateIds = bodyParse.data.candidateIds;
		if (candidateIds.length === 0) {
			return res.status(200).json({ data: { createdPinCount: 0 }, error: null });
		}

		const { data: video, error: videoError } = await supabase
			.from<VideoRow>('videos')
			.select('id, trip_id, location_hint')
			.eq('id', videoIdParse.data)
			.single();

		if (videoError || !video) {
			return res.status(404).json({ data: null, error: 'Video not found' });
		}

		const { data: candidates, error: candidateError } = await supabase
			.from<VideoCandidateRow>('video_candidates')
			.select('*')
			.eq('video_id', videoIdParse.data)
			.in('id', candidateIds);

		if (candidateError) {
			return res.status(500).json({ data: null, error: candidateError.message });
		}

		const locationHint = normalizeHint(video.location_hint);
		const locationCache = new Map<string, LatLng | null>();

		const pinsToInsert = await Promise.all(
			(candidates ?? []).map(async candidate => {
				let latitude = candidate.latitude;
				let longitude = candidate.longitude;
				let placeId = '';
				let placeName: string | null = null;
				let placeAddress: string | null = null;
				let placesRaw: Record<string, unknown> | null = null;
				let locationBias: LatLng | null = null;
				const query = buildPlaceQuery(candidate.name, candidate.address_hint, locationHint);

				if (locationHint) {
					if (!locationCache.has(locationHint)) {
						locationCache.set(locationHint, await geocodeLocationHint(locationHint));
					}
					locationBias = locationCache.get(locationHint) ?? null;
				}

				const place = await fetchPlaceForCandidate(candidate, locationHint, locationBias);
				if (place) {
					latitude = place.location.lat;
					longitude = place.location.lng;
					placeId = place.place_id;
					placeName = place.name;
					placeAddress = place.address;
					placesRaw = place.raw;
				}

				const debugUpdate: Partial<VideoCandidateRow> = {
					places_query: query,
					places_place_id: placeId || null,
					places_name: placeName ?? null,
					places_address: placeAddress ?? null,
					places_raw: placesRaw,
				};
				await supabase.from<VideoCandidateRow>('video_candidates').update(debugUpdate).eq('id', candidate.id);

				console.info('[video-approve]', {
					candidateId: candidate.id,
					candidateName: candidate.name,
					query,
					locationHintApplied: Boolean(locationHint),
					locationBiasApplied: Boolean(locationBias),
					placeId: placeId || null,
					latitude: latitude ?? null,
					longitude: longitude ?? null,
				});

				if (latitude == null || longitude == null) {
					return null;
				}

				const finalName = placeName ?? candidate.name;
				const noteParts = ['from video'];
				if (placeAddress) {
					noteParts.push(placeAddress);
				}

				return {
					trip_id: video.trip_id,
					name: finalName,
					latitude,
					longitude,
					place_id: placeId,
					notes: noteParts.join(' — '),
				};
			})
		);

		const filteredPins = pinsToInsert.filter(Boolean) as Array<{
			trip_id: string;
			name: string;
			latitude: number;
			longitude: number;
			place_id: string;
			notes: string;
		}>;

		if (filteredPins.length === 0) {
			return res.status(200).json({ data: { createdPinCount: 0 }, error: null });
		}

		const { data: pins, error: pinError } = await supabase
			.from<PinRow>('pins')
			.insert(filteredPins)
			.select('*');

		if (pinError) {
			return res.status(500).json({ data: null, error: pinError.message });
		}

		return res.status(200).json({
			data: { createdPinCount: pins?.length ?? 0, pins: pins ?? [] },
			error: null,
		});
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Retry job (optional)
videosRouter.post('/videos/:videoId/retry', async (req, res) => {
	try {
		const videoIdParse = videoIdSchema.safeParse(req.params.videoId);
		if (!videoIdParse.success) {
			return res.status(400).json({ data: null, error: 'videoId must be a valid UUID' });
		}

		const now = new Date().toISOString();
		const { data: jobs, error: jobError } = await supabase
			.from<VideoJobRow>('video_jobs')
			.select('*')
			.eq('video_id', videoIdParse.data)
			.order('created_at', { ascending: false })
			.limit(1);

		if (jobError) {
			return res.status(500).json({ data: null, error: jobError.message });
		}

		const job = jobs?.[0] ?? null;
		if (job) {
			const { error: updateError } = await supabase
				.from<VideoJobRow>('video_jobs')
				.update({ status: 'queued', progress: 0, error: null, updated_at: now })
				.eq('id', job.id);

			if (updateError) {
				return res.status(500).json({ data: null, error: updateError.message });
			}
		}

		await supabase
			.from<VideoRow>('videos')
			.update({ status: 'queued' })
			.eq('id', videoIdParse.data);

		return res.status(200).json({ data: { job }, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

export default videosRouter;
