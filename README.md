# TravelApp

A website-first trip planning web application that allows users to search for locations, pin them onto a map, organize those pins into trips, and visualize routes between points of interest.

## Tech Stack

- **Frontend**: React + TypeScript + TailwindCSS v4 + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL via Supabase
- **Maps**: Google Maps JavaScript API + Google Places API

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project
- Google Maps API key with Places API enabled

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
```

**Worker** (`worker/.env`):
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
UPLOADS_DIR=/absolute/path/to/backend/uploads
WHISPER_MODEL=base
OCR_LANG=en
USE_OLLAMA=false
OLLAMA_MODEL=qwen2.5:7b-instruct
```

Tip: adding a location hint (city/region) when uploading a video improves candidate accuracy.

### 3. Database Setup

1. Go to your Supabase dashboard → SQL Editor
2. Copy the contents of `db/migrations/001_init.sql`
3. Paste and execute it to create the tables
4. Copy the contents of `db/migrations/002_video_pipeline.sql`
5. Paste and execute it to create the video pipeline tables
6. Copy the contents of `db/migrations/003_video_location_hint.sql`
7. Paste and execute it to create the location hint column

Or use Supabase CLI:
```bash
supabase db push
```

## Running the Application

### Development Mode

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

The backend will start on `http://localhost:5000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:5173` (or the port Vite assigns)

**Terminal 3 - Worker:**
```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python worker.py
```

## Local extraction setup

- Install ffmpeg:
```bash
brew install ffmpeg
```
- Install worker deps:
```bash
cd worker
pip install -r requirements.txt
```

## Production Build

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

**Backend:**
```bash
cd backend
npm start
```

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

## Pages

- **Home** (`/`) - Landing page with product description and CTA
- **Planner** (`/planner`) - Interactive map for searching and pinning locations
- **About** (`/about`) - About page with feature information

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

## Development

- Follow `.cursorrules` for coding conventions
- See `docs/PDR.md` for architecture and requirements
- MVP scope: search → pin → save → view trip

## Testing

Run backend tests:
```bash
cd backend
npm test
```

Run frontend tests:
```bash
cd frontend
npm test
```
# TravelApp
# TravelApp
# TravelApp
