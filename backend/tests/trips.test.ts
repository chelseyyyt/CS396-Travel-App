import request from 'supertest';
import express from 'express';
import tripsRouter from '../src/routes/trips.js';

// Create an express app for testing the router in isolation
const app = express();
app.use(express.json());
app.use('/api/trips', tripsRouter);

// Mock supabase client methods used by the router
jest.mock('../src/supabaseClient', () => {
	const actual = jest.requireActual('../src/supabaseClient');
	return {
		...actual,
		supabase: {
			from: jest.fn(() => ({
				insert: jest.fn().mockReturnThis(),
				update: jest.fn().mockReturnThis(),
				delete: jest.fn().mockReturnThis(),
				select: jest.fn().mockReturnThis(),
				single: jest.fn(),
				eq: jest.fn().mockReturnThis(),
				order: jest.fn().mockReturnThis(),
			})),
		},
		TripRow: {} as any,
		__esModule: true,
	};
});

describe('Trips Router', () => {
	it('validates missing user_id on list', async () => {
		const res = await request(app).get('/api/trips');
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ data: null, error: 'user_id is required' });
	});

	it('rejects invalid create payload', async () => {
		const res = await request(app).post('/api/trips').send({ title: '' });
		expect(res.status).toBe(400);
		expect(res.body.data).toBeNull();
		expect(res.body.error).toBeTruthy();
	});
});

