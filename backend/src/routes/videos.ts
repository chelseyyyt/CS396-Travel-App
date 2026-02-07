import express from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { supabase, PinRow, VideoCandidateRow, VideoJobRow, VideoRow } from '../supabaseClient.js';

export const videosRouter = express.Router();

const videoIdSchema = z.string().uuid();
const tripIdSchema = z.string().uuid();

const approveSchema = z.object({
	candidateIds: z.array(z.string().uuid()).default([]),
});

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

		const { error: videoError } = await supabase.from<VideoRow>('videos').insert({
			id: videoId,
			trip_id: tripIdParse.data,
			original_filename: req.file.originalname,
			storage_path: storagePath,
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

		return res.status(200).json({
			data: {
				video,
				job: jobs?.[0] ?? null,
				candidates: candidates ?? [],
			},
			error: null,
		});
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

type GeocodeResult = { latitude: number; longitude: number } | null;

function geocodeStub(_candidate: VideoCandidateRow): GeocodeResult {
	return null;
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
			.select('id, trip_id')
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

		const pinsToInsert = (candidates ?? []).flatMap(candidate => {
			let latitude = candidate.latitude;
			let longitude = candidate.longitude;
			if (latitude == null || longitude == null) {
				const geo = geocodeStub(candidate);
				latitude = geo?.latitude ?? null;
				longitude = geo?.longitude ?? null;
			}

			if (latitude == null || longitude == null) {
				return [];
			}

			return [
				{
					trip_id: video.trip_id,
					name: candidate.name,
					latitude,
					longitude,
					place_id: '',
					notes: 'from video',
				},
			];
		});

		if (pinsToInsert.length === 0) {
			return res.status(200).json({ data: { createdPinCount: 0 }, error: null });
		}

		const { data: pins, error: pinError } = await supabase
			.from<PinRow>('pins')
			.insert(pinsToInsert)
			.select('id');

		if (pinError) {
			return res.status(500).json({ data: null, error: pinError.message });
		}

		return res.status(200).json({ data: { createdPinCount: pins?.length ?? 0 }, error: null });
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
