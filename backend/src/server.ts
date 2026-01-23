import express from 'express';
import { tripsRouter } from './routes/trips.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/trips', tripsRouter);

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});

