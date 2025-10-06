# Preliminary Design Review (PDR): Trip Planning Web App

## 1. Mission Statement
This project is a trip planning web application that allows users to search for locations (via Google Maps/Places API), pin them onto a map, organize those pins into trips, and visualize routes between points of interest.  
The goal is to give travelers a simple, centralized tool for organizing destinations and planning itineraries without juggling multiple apps.

## 2. System Requirements

### Functional Requirements
1. User authentication and persistent data storage.  
2. Search for locations using Google Places API (with autocomplete).  
3. Pin locations to a personal map.  
4. Create, read, update, and delete trips.  
5. View and interact with all pins for a trip on the map.  
6. Connect multiple pins with basic route visualization.

### Non-Functional Requirements
1. Scalability – must support multiple concurrent users.  
2. Usability – intuitive interface for travelers of all tech levels.  
3. Performance – map and pins should load in under 2 s.  
4. Security – secure authentication and protected data storage.  
5. Portability – web app first, mobile apps (iOS/Android) later.

## 3. Architecture Overview

### Frontend
- Framework: React + TypeScript  
- Styling: TailwindCSS  
- Map Integration: Google Maps JavaScript API  
- Search: Google Places Autocomplete  

### Backend
- Platform: Node.js + Express  
- Database: PostgreSQL (on Supabase)  
- Endpoints: REST API for users, trips, pins  
- Hosting: Render or Supabase Edge Functions  

### Third-Party Services
- Google Maps & Places APIs – map rendering / geocoding / search  
- Supabase – database + authentication  

## 4. Data Model

### Users
| Field | Type | Notes |
|-------|------|-------|
| id | PK | UUID |
| name | text | |
| email | text | unique |
| auth_provider | text | e.g. Google, email |

### Trips
| Field | Type | Notes |
|-------|------|-------|
| id | PK | UUID |
| user_id | FK → users.id | |
| title | text | |
| description | text | |
| created_at | timestamp | default now() |

### Pins
| Field | Type | Notes |
|-------|------|-------|
| id | PK | UUID |
| trip_id | FK → trips.id | |
| name | text | |
| latitude | float | |
| longitude | float | |
| place_id | text | from Google Places |
| notes | text | optional |

## 5. Services and APIs
- Google Maps JavaScript API – render map, add/remove markers  
- Google Places API – location search + autocomplete  
- Supabase Auth – login / sign-up  
- Supabase DB – persistence layer  

## 6. MVP Features
- Sign-up / login  
- Search for a place and drop a pin  
- Save pins to a trip  
- View all pins for a trip on the map  
- Edit / delete pins  

## 7. Stretch Goals
- Generate routes between pins  
- Share trips via public links  
- Export trip to Google Maps or PDF  
- Offline map caching  
- Multi-user trip collaboration  

## 8. Risks & Mitigation
| Risk | Mitigation |
|------|-------------|
| Google API costs | Set query limits, evaluate Mapbox later |
| Data privacy | Use Supabase Auth + SSL connections |
| Feature creep | Stick to MVP scope first |
| Performance issues | Cache map tiles and lazy-load pins |

## 9. Development Roadmap

### Phase 1 – MVP
- React + Supabase setup  
- Auth and DB schema  
- Google Map integration  
- Trip + pin CRUD  

### Phase 2 – Enhancements
- Route generation  
- Sharing/exporting trips  
- UI refinement + mobile responsiveness  

### Phase 3 – Expansion
- React Native app via Expo  
- Real-time collaboration  

## 10. Success Metrics
- Deployed MVP available on web  
- Users can save ≥10 pins per trip without errors  
- Map load time < 2 seconds for 50 pins  
- <5% failed search requests  

✅ End of PDR

