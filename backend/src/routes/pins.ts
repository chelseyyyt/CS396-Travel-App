import express from 'express';
import { z } from 'zod';
import { supabase, PinRow, VideoCandidateRow, VideoRow } from '../supabaseClient.js';

export const pinsRouter = express.Router();

const tripIdSchema = z.string().uuid();
const pinIdSchema = z.string().uuid();

const pinCreateSchema = z.object({
	name: z.string().max(200).optional(),
	latitude: z.coerce.number().min(-90).max(90),
	longitude: z.coerce.number().min(-180).max(180),
	placeId: z.string().max(255).optional(),
	notes: z.string().max(2000).optional().nullable(),
});

const candidateIdsSchema = z.object({
	candidate_ids: z.array(z.string().uuid()).min(1),
});

// Create Pin for Trip
pinsRouter.post('/trips/:tripId/pins', async (req, res) => {
	try {
		const safeBody = (() => {
			try {
				return JSON.stringify(req.body);
			} catch (_e) {
				return '[unserializable body]';
			}
		})();
		console.info('[pins] create request', {
			tripId: req.params.tripId,
			contentType: req.headers['content-type'],
			body: safeBody,
		});
		const tripIdParse = tripIdSchema.safeParse(req.params.tripId);
		if (!tripIdParse.success) {
			return res.status(400).json({ data: null, error: 'tripId must be a valid UUID' });
		}

		const candidateParse = candidateIdsSchema.safeParse(req.body);
		if (candidateParse.success) {
			const candidateIds = candidateParse.data.candidate_ids;
			console.info('[pins] candidate_ids', candidateIds);

			const { data: candidates, error: candidateError } = await supabase
				.from<VideoCandidateRow>('video_candidates')
				.select('*')
				.in('id', candidateIds);

			if (candidateError) {
				return res.status(500).json({ data: null, error: candidateError.message });
			}

			const videoIds = Array.from(new Set((candidates ?? []).map(candidate => candidate.video_id)));
			const { data: videos, error: videoError } = await supabase
				.from<VideoRow>('videos')
				.select('id, trip_id')
				.in('id', videoIds);

			if (videoError) {
				return res.status(500).json({ data: null, error: videoError.message });
			}

			const videoTripMap = new Map((videos ?? []).map(video => [video.id, video.trip_id]));
			const mismatched = (candidates ?? []).filter(
				candidate => videoTripMap.get(candidate.video_id) !== tripIdParse.data
			);
			if (mismatched.length > 0) {
				return res.status(400).json({
					data: null,
					error: `One or more candidates do not belong to trip ${tripIdParse.data}.`,
				});
			}

			const missingCoords = (candidates ?? []).filter(
				candidate => candidate.latitude == null || candidate.longitude == null
			);
			if (missingCoords.length > 0) {
				return res.status(400).json({
					data: null,
					error: 'One or more candidates are missing coordinates.',
				});
			}

			const pinsToInsert = (candidates ?? []).map(candidate => {
				const noteParts = ['from video'];
				if (candidate.places_address) {
					noteParts.push(candidate.places_address);
				}
				return {
					trip_id: tripIdParse.data,
					name: candidate.places_name ?? candidate.name,
					latitude: candidate.latitude as number,
					longitude: candidate.longitude as number,
					place_id: candidate.places_place_id ?? '',
					notes: noteParts.join(' — '),
				};
			});

			const { data, error } = await supabase
				.from<PinRow>('pins')
				.insert(pinsToInsert)
				.select();

			if (error) return res.status(500).json({ data: null, error: error.message });
			return res.status(201).json({
				data: { createdPinCount: data?.length ?? 0, pins: data ?? [] },
				error: null,
			});
		}

		const parsed = pinCreateSchema.safeParse(req.body);
		if (!parsed.success) {
			console.warn('[pins] validation error', {
				candidateIdsError: candidateParse.error.flatten(),
				pinError: parsed.error.flatten(),
			});
			return res.status(400).json({
				data: null,
				error: 'Invalid request body. Expected candidate_ids[] or pin fields.',
			});
		}

		const { name, latitude, longitude, placeId, notes } = parsed.data;
		const { data, error } = await supabase
			.from<PinRow>('pins')
			.insert({
				trip_id: tripIdParse.data,
				name: name ?? 'Dropped Pin',
				latitude,
				longitude,
				place_id: placeId ?? '',
				notes: notes ?? null,
			})
			.select()
			.single();

		if (error) return res.status(500).json({ data: null, error: error.message });
		return res.status(201).json({ data, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// List Pins for Trip
pinsRouter.get('/trips/:tripId/pins', async (req, res) => {
	try {
		const tripIdParse = tripIdSchema.safeParse(req.params.tripId);
		if (!tripIdParse.success) {
			return res.status(400).json({ data: null, error: 'tripId must be a valid UUID' });
		}

		const { data, error } = await supabase
			.from<PinRow>('pins')
			.select('*')
			.eq('trip_id', tripIdParse.data)
			.order('name', { ascending: true });

		if (error) return res.status(500).json({ data: null, error: error.message });
		return res.status(200).json({ data, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Delete Pin
pinsRouter.delete('/pins/:pinId', async (req, res) => {
	try {
		const pinIdParse = pinIdSchema.safeParse(req.params.pinId);
		if (!pinIdParse.success) {
			return res.status(400).json({ data: null, error: 'pinId must be a valid UUID' });
		}

		const { data, error } = await supabase
			.from<PinRow>('pins')
			.delete()
			.eq('id', pinIdParse.data)
			.select('id');

		if (error) return res.status(500).json({ data: null, error: error.message });
		if (!data || data.length === 0) {
			return res.status(404).json({ data: null, error: 'Pin not found' });
		}
		return res.status(200).json({ data: { deleted: true }, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

export default pinsRouter;
