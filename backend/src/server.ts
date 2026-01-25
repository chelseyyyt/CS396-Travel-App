import 'dotenv/config';
import express from 'express';
import { pinsRouter } from './routes/pins.js';
import { tripsRouter } from './routes/trips.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:4173')
	.split(',')
	.map(origin => origin.trim())
	.filter(Boolean);

app.use((req, res, next) => {
	const origin = req.headers.origin;
	if (origin && allowedOrigins.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Vary', 'Origin');
	}
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
	if (req.method === 'OPTIONS') {
		return res.sendStatus(204);
	}
	return next();
});

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/trips', tripsRouter);
app.use('/api', pinsRouter);

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
