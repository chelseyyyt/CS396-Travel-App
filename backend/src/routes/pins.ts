import express from 'express';
import { z } from 'zod';
import { supabase, PinRow } from '../supabaseClient.js';

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

// Create Pin for Trip
pinsRouter.post('/trips/:tripId/pins', async (req, res) => {
	try {
		const tripIdParse = tripIdSchema.safeParse(req.params.tripId);
		if (!tripIdParse.success) {
			return res.status(400).json({ data: null, error: 'tripId must be a valid UUID' });
		}
		const parsed = pinCreateSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ data: null, error: parsed.error.flatten() });
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
