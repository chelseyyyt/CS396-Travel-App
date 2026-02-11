# TravelApp

A website-first trip planning web application that allows users to search for locations, pin them onto a map, organize those pins into trips, and visualize routes between points of interest.

## Tech Stack

- **Frontend**: React + TypeScript + TailwindCSS v4 + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL via Supabase
- **Maps**: Google Maps JavaScript API + Google Places API
- **Worker**: Python (ffmpeg + faster-whisper + PaddleOCR + optional Ollama)

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Python 3.10+
- Supabase account and project
- Google Maps API key with Places API enabled
- ffmpeg (for audio + frame extraction)

## Setup

### 1. Install Dependencies

**Frontend:**
```bash
cd frontend
npm install
```

**Backend:**
```bash
cd backend
npm install
```

**Worker:**
```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment Variables

**Frontend** (`frontend/.env`):
```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
VITE_API_URL=http://localhost:5000
```

**Backend** (`backend/.env`):
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PORT=5000
CORS_ORIGIN=http://localhost:5173
UPLOADS_DIR=/absolute/path/to/backend/uploads
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
# or GOOGLE_PLACES_API_KEY
```

**Worker** (`worker/.env`):
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
UPLOADS_DIR=/absolute/path/to/backend/uploads
WHISPER_MODEL=base
OCR_LANG=en
USE_OLLAMA=true
OLLAMA_MODEL=qwen2.5:7b-instruct
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
# or GOOGLE_PLACES_API_KEY
```

Tip: adding a location hint (city/region) when uploading a video improves candidate accuracy.

### 3. Database Setup

Run migrations in order:
- `db/migrations/001_init.sql`
- `db/migrations/002_video_pipeline.sql`
- `db/migrations/003_video_location_hint.sql`
- `db/migrations/004_video_candidate_debug.sql`
- `db/migrations/005_video_transcripts.sql`
- `db/migrations/006_video_jobs_ollama_logging.sql`
- `db/migrations/007_video_candidates_places_failed.sql`

## Running the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Worker:**
```bash
cd worker
source .venv/bin/activate
export USE_OLLAMA=true             
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.1:8b
python worker.py
```

## Pipeline Overview

1) **Upload video** → stored in `backend/uploads/` and queued in `video_jobs`.
2) **Worker** extracts:
   - audio → transcript segments (faster-whisper)
   - frames → OCR lines (PaddleOCR)
3) **Candidate extraction**:
   - Heuristic extraction (keywords + patterns)
   - Optional Ollama extraction (strict JSON)
4) **Places enrichment**:
   - For each candidate, run Google Places Text Search
   - Attach `places_name`, `places_place_id`, `places_address`, `lat/lng`
5) **Approval flow**:
   - Candidates shown in Planner
   - “Add selected to map” inserts pins for candidates with coords

## Debugging

### Logs to watch
- Worker:
  - `[worker] places enrichment ...`
  - `[worker] places result ...`
  - `[worker] candidate payload sample ...`
  - `[worker] job failed ...` (with traceback)
- Backend:
  - `[pins] create request ...`
  - `[pins] validation error ...`

### Useful SQL
```sql
-- Inspect candidates for a video
select id, name, places_name, places_place_id, latitude, longitude, places_failed
from video_candidates
where video_id = '<video_id>'
order by confidence desc;

-- Inspect transcript
select transcript
from video_transcripts
where video_id = '<video_id>'
order by created_at desc
limit 1;
```

## Known Issues / TODO

- Places enrichment sometimes does not persist lat/lng to DB.
- Candidates may be inserted without coordinates when Places lookup fails.
- Add-to-map is blocked when coords are missing (by design).

## Project Structure

```
TravelApp/
├── backend/           # Express API server
│   └── src/
│       ├── routes/    # API route handlers
│       └── server.ts  # Express server entry point
├── frontend/          # React frontend application
│   └── src/
│       ├── components/  # React components
│       ├── pages/       # Page components (Home, Planner, About)
│       └── App.tsx      # Main app with routing
├── db/
│   └── migrations/    # Database migration files
├── worker/            # Python video processing worker
└── docs/             # Documentation
    ├── PDR.md        # Preliminary Design Review
    └── API_DOCS.md   # API documentation
```

## API Endpoints

See `docs/API_DOCS.md` for complete API documentation.

Base URL: `http://localhost:5000`

- `GET /health` - Health check endpoint
- `GET /api/trips` - List trips (requires `user_id` query param)
- `POST /api/trips` - Create a new trip
- `GET /api/trips/:id` - Get a trip by ID
- `PUT /api/trips/:id` - Update a trip
- `DELETE /api/trips/:id` - Delete a trip
- `POST /api/trips/:tripId/videos` - Upload a video for a trip
- `GET /api/videos/:videoId` - Get video status + candidates
- `POST /api/videos/:videoId/approve` - Convert candidates into pins

## Testing

**Backend:**
```bash
cd backend
npm test
```

**Worker (pytest):**
```bash
cd worker
pytest
```
