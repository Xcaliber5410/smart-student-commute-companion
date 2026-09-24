# Smart Student Commute Companion 🎓🚆
> **AI-Powered Student Mobility Assistant for Mumbai College Commutes**
> Built for Mumbai students tackling rush hour, monsoon downpours, auto refusals, and local train delays.

---

## 🌟 Overview

**Smart Student Commute Companion** is an intelligent multimodal transit planner engineered specifically for college students in Mumbai. It generates factual transit itineraries using official **Mumbai GTFS schedules** (Western Railway, Central Railway, Harbour Railway, Mumbai Metro Lines 1, 2A, 7, 3, and BEST feeder buses) combined with **OpenStreetMap / OSRM routing**, **Open-Meteo real-time weather**, and a **live crowdsourced student disruption feed**.

Before applying AI, the platform runs a **deterministic multi-factor scoring engine** balancing travel time, reliability, walking exertion, weather exposure, budget, and real-time community reports. **Gemini 3.8 Flash** is then invoked strictly as an explainer and ranker over verified candidate routes—ensuring zero hallucinated stations, fares, or train lines.

---

## 🚫 Zero Mapbox Compliance

This project contains **zero dependencies on Mapbox**:
* **Map Layer**: Leaflet + OpenStreetMap (OSM) tile server.
* **Road & Pedestrian Routing**: Open Source Routing Machine (OSRM).
* **Geocoding**: OpenStreetMap Nominatim with local SQLite caching and custom User-Agent.

---

## 🚀 Key Features

1. **Multimodal Mumbai Transit**:
   - Western Railway (Churchgate - Borivali / Virar)
   - Central Railway (CSMT - Dadar - Thane / Kalyan)
   - Harbour Line (CSMT - Kurla - Panvel)
   - Mumbai Metro (Line 1: Versova-Ghatkopar, Line 2A & 7, Line 3 Aqua Line)
   - BEST Feeder Buses connecting major campuses (IIT Bombay, VJTI, NMIMS, HR College, SPIT, Ruia, St. Xavier's).
2. **Deterministic Scoring Engine**:
   - Travel Time (35%), Reliability (25%), Walking (15%), Disruption Risk (10%), Weather (10%), Cost (5%).
   - Dynamic user priority profiles: **Balanced**, **Fastest**, **Cheapest**, **Rain-Safe**.
3. **Open-Meteo Weather Intelligence**:
   - Hourly precipitation probability and rain metrics penalize outdoor walking legs and auto refusal zones during monsoon downpours.
4. **Live Student Community Reports (Socket.IO)**:
   - Students report live conditions (auto shortages, platform crowding, waterlogging).
   - Reports decay automatically based on age (0-10m: 1.0, 10-30m: 0.75, 30-60m: 0.45, 60-120m: 0.20, >120m: expired).
   - "Still happening" and "No longer happening" community verification.
   - Distinct badge: `⚠ Community reported` (never falsely labeled as verified).
5. **Strictly Grounded Gemini AI**:
   - Model: `gemini-3.8-flash` (or `gemini-2.5-flash`).
   - High-reasoning configuration with structured JSON output.
   - Resilient fallback to deterministic explanation engine if API key is not supplied or external network fails.
6. **Travel Together (Commute Coordination)**:
   - Privacy-preserving student grouping for shared autos, cabs, and train buddies.
   - Strictly area-level landmarks (no private home address exposure).
7. **Demo Mode**:
   - `POST /api/demo/reset` and one-click button in the header resets the hackathon environment to a pre-seeded realistic state.

---

## 🛠️ Stack

* **Frontend**: React 18, Vite, Tailwind CSS, React Leaflet, Lucide React, Socket.IO client
* **Backend**: Node.js, Express, SQLite (`better-sqlite3` with `node:sqlite` fallback), Socket.IO, Zod, Axios, dotenv
* **Database & Persistence**: SQLite 3 (WAL mode), Transactional Migration Runner, Repository Pattern Layer
* **AI Engine**: Gemini 3.8 Flash (`@google/genai`) with high thinking budget and JSON mode
* **Transit Data**: GTFS compliant CSV tables (`agency`, `routes`, `stops`, `trips`, `stop_times`, `calendar`)

---

## 📦 Getting Started

### Prerequisites
* Node.js (v18+ or v22+)
* npm

### Installation

Clone the repository and install all dependencies:

```bash
# 1. Install root, server, and client dependencies
npm run install:all
```

### Environment Configuration

The application works right out of the box with deterministic fallbacks even without an API key!
To enable full Gemini 3.8 Flash high-reasoning explanations:

Create or edit `.env` in the root directory:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
DATABASE_PATH=./backend/db/commute.db
DATABASE_WAL_MODE=true
GEMINI_API_KEY=your_gemini_api_key_here
```

### Running Locally

Run both the Express backend and Vite frontend concurrently with a single command:

```bash
npm run dev
```

- **Frontend Application**: [http://localhost:5173](http://localhost:5173)
- **Backend API Server**: [http://localhost:5000](http://localhost:5000)

---

## 🗄️ Database, Migrations & Testing

The backend includes a production-grade database foundation with zero external database server requirements:

### Schema Migrations
```bash
# Apply pending schema migrations
npm --prefix backend run db:migrate

# Roll back the most recent migration
npm --prefix backend run db:rollback

# Inspect migration status
npm --prefix backend run db:status
```

### Automated Test Suites
All tests run against isolated in-memory/ephemeral test databases with **zero mutation of production data**:

```bash
# Run isolated authentication & authorization test suite (19 tests: scrypt, JWT, RBAC, ownership)
npm --prefix backend run verify:auth

# Run isolated database integration test suite (18 tests: lifecycle, models, repos, transactions)
npm --prefix backend run test:db

# Run backend foundation smoke tests
npm --prefix backend test

# Run all backend test suites sequentially (config, bootstrap, routes, errors, validation, API, auth, DB)
npm --prefix backend run test:all
```

For detailed specifications, see:
- [Authentication & Authorization Specification](backend/docs/authentication.md)
- [Database Setup & Operations Guide](backend/docs/database_setup.md)
- [Database Integration Audit](backend/docs/database_audit.md)
- [Backend Architecture & Technical Specification](file:///c:/DJ%20Sanghvi%20College/Projects/smart-student-commute-companion/backend/docs/architecture.md)

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health and Mumbai GTFS status |
| `POST` | `/api/plan` | Geocodes, fetches transit & weather, scores candidates, runs AI reasoning |
| `GET` | `/api/live-reports` | Active crowdsourced disruption reports with freshness decay |
| `POST` | `/api/live-reports` | Submit a new student community report (broadcasts via Socket.IO) |
| `POST` | `/api/live-reports/:id/confirm` | Vote "Still happening" on a report |
| `POST` | `/api/live-reports/:id/contradict` | Vote "No longer happening" on a report |
| `GET` | `/api/transit/search` | Spatial and text search across GTFS stops and lines |
| `GET` | `/api/ride-groups` | List open Travel Together commute groups |
| `POST` | `/api/ride-groups` | Create a new student commute group |
| `POST` | `/api/ride-groups/:id/join` | Join an existing commute group |
| `POST` | `/api/feedback` | Record student feedback (thumbs up/down, tags, comments) |
| `POST` | `/api/demo/reset` | Reset demo reports, ride groups, and database to initial state |

---

## 🔒 Privacy & Safety Notice

* Continuous background GPS tracking is **not** implemented.
* Exact residential addresses are **never** stored or displayed.
* All locations are strictly area/neighborhood level (e.g. "Andheri East", "Matunga", "Powai Plaza").
* Community reports and commute groups use student pseudonyms.

---

## 🏆 Demo Walkthrough

1. Open [http://localhost:5173](http://localhost:5173).
2. Click **Plan My Commute** (default: Andheri East → IIT Bombay Powai).
3. Observe:
   - Origin and destination rendered on the Leaflet map with custom icons.
   - Recommended Route card with Gemini AI explanation, departure time, and leg-by-leg breakdown.
   - Alternative routes (Fastest, Lowest-Cost, Rain-Safe) selectable on the map.
   - Open-Meteo weather card showing rain probability and temperature.
   - Live Student Disruption Feed showing active reports and freshness weights.
4. Click **Still happening** or **No longer happening** on a live report and observe the real-time vote update.
5. Click **Post Report** to broadcast a new report—it immediately renders via Socket.IO without page reload.
6. Switch to **Travel Together** to view or create student commute buddy groups.
7. Rate the recommendation with thumbs up/down and feedback tags.
8. Click **Reset Demo** in the header to return the environment to its initial state.
