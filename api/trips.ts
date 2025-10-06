import express from 'express';
import { z } from 'zod';
import { supabase, TripRow } from './supabaseClient';

export const tripsRouter = express.Router();

const tripSchema = z.object({
	user_id: z.string().uuid(),
	title: z.string().min(1).max(200),
	description: z.string().max(2000).optional().nullable(),
});

// Create Trip
tripsRouter.post('/', async (req, res) => {
	try {
		const parsed = tripSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ data: null, error: parsed.error.flatten() });
		}
		const { user_id, title, description } = parsed.data;
		const { data, error } = await supabase
			.from<TripRow>('trips')
			.insert({ user_id, title, description: description ?? null })
			.select()
			.single();
		if (error) return res.status(500).json({ data: null, error: error.message });
		return res.status(201).json({ data, error: null });
	} catch (e: unknown) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Read Trips (by user)
tripsRouter.get('/', async (req, res) => {
	try {
		const userId = req.query.user_id as string | undefined;
		if (!userId) {
			return res.status(400).json({ data: null, error: 'user_id is required' });
		}
		const { data, error } = await supabase
			.from<TripRow>('trips')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
		if (error) return res.status(500).json({ data: null, error: error.message });
		return res.status(200).json({ data, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Read Trip by id
tripsRouter.get('/:id', async (req, res) => {
	try {
		const id = req.params.id;
		const { data, error } = await supabase
			.from<TripRow>('trips')
			.select('*')
			.eq('id', id)
			.single();
		if (error) return res.status(404).json({ data: null, error: 'Trip not found' });
		return res.status(200).json({ data, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Update Trip
const tripUpdateSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	description: z.string().max(2000).optional().nullable(),
});

tripsRouter.put('/:id', async (req, res) => {
	try {
		const id = req.params.id;
		const parsed = tripUpdateSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({ data: null, error: parsed.error.flatten() });
		}
		const { data, error } = await supabase
			.from<TripRow>('trips')
			.update(parsed.data)
			.eq('id', id)
			.select()
			.single();
		if (error) return res.status(404).json({ data: null, error: 'Trip not found' });
		return res.status(200).json({ data, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

// Delete Trip
tripsRouter.delete('/:id', async (req, res) => {
	try {
		const id = req.params.id;
		const { error } = await supabase.from<TripRow>('trips').delete().eq('id', id);
		if (error) return res.status(404).json({ data: null, error: 'Trip not found' });
		return res.status(204).json({ data: null, error: null });
	} catch (_e) {
		return res.status(500).json({ data: null, error: 'Internal server error' });
	}
});

export default tripsRouter;


