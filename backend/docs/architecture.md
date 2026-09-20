# Backend Architecture Audit & Technical Specification

**Author:** Skan (Backend Developer)  
**Date:** Day 1 of 21-Day Roadmap  
**Scope:** Exclusive to Backend Architecture & Infrastructure (`/backend`)

---

## 1. System Overview & Technology Stack

| Dimension | Specification | Notes |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v18+ / v22+) | CommonJS modules (`require` / `module.exports`) |
| **Framework** | Express.js `v4.21.2` | REST HTTP API server |
| **Real-Time Communication** | Socket.IO `v4.8.1` | Bidirectional WebSocket feed for live disruption updates |
| **Database Engine** | SQLite 3 via `better-sqlite3` `v11.8.1` | Synchronous, embedded file database with WAL mode enabled |
| **Validation** | Zod `v3.24.2` | Runtime schema validation for request payloads |
| **AI Integration** | `@google/genai` `v2.21.0` / Gemini 3.8 Flash | Generative explanation engine with deterministic fallback |
| **HTTP Client** | Axios `v1.7.9` | External API communication (OSRM, Open-Meteo, Nominatim) |
| **Configuration** | `dotenv` `v16.4.7` | Loads root `.env` |
| **Package Manager** | npm | Managed via `backend/package.json` |
| **Entry Point** | `backend/server.js` | Launches HTTP and Socket.IO servers |

### Existing Startup & Verification Commands
- **Local Backend Development**: `npm --prefix backend run dev` (Runs `node --watch server.js`)
- **Production Backend Start**: `npm --prefix backend run start` (Runs `node server.js`)
- **Full-Stack Development**: `npm run dev` (Root script running backend on port 5000 and frontend on port 5173 concurrently)
- **End-to-End Verification**: `node backend/scripts/verify_all.js` (Executes full 7-step integration test suite against running backend)

---

## 2. Current Directory Structure & Module Responsibilities

```
backend/
├── app.js                   # Express application factory (CORS, body parsing, routes, errors)
├── config/
│   └── index.js             # Centralized environment configuration & Zod validation
├── db/
│   ├── commute.db           # SQLite database file (WAL mode)
│   └── database.js          # SQLite connection, table DDL schemas, and demo seed data
├── docs/
│   └── architecture.md      # Backend architecture and technical specification
├── .env.example             # Documented backend environment variables and safe placeholders
├── package.json             # Backend dependencies and scripts
├── routes/
│   └── api.js               # Monolithic Express router (API routes, Zod schemas, DB logic)
├── scripts/
│   ├── verify_all.js        # Automated end-to-end integration test script
│   ├── verify_bootstrap.js  # Automated server bootstrap, lifecycle, and idempotency test suite
│   └── verify_config.js     # Automated configuration validation & secret redaction test suite
├── server.js                # Server entry point, listener lifecycle, graceful shutdown
└── services/
    ├── aiPlannerService.js  # Grounded Gemini explanation & deterministic reasoning fallback
    ├── disruptionService.js # Community report decay calculations, filtering & route impact
    ├── geocodingService.js  # 3-tier geocoder (local dictionary, SQLite cache, Nominatim)
    ├── gtfsService.js       # GTFS schedule parser, spatial stop search & candidate routing
    ├── routingService.js    # Haversine distance, fallback interpolation & OSRM road routing
    ├── scoringService.js    # Deterministic multi-factor route scoring engine
    └── weatherService.js    # Open-Meteo API client with 15-minute in-memory caching
```

### Module Responsibilities Breakdown

#### 1. Centralized Configuration Module (`config/index.js`)
- Single source of truth for all runtime environment settings.
- Automatically locates `.env` in `backend/` and project root.
- Uses Zod schema validation to validate `PORT`, `HOST`, `NODE_ENV`, `CLIENT_URL`, `GEMINI_API_KEY`, `REQUIRE_GEMINI_KEY`, and `DATABASE_PATH`.
- Provides safe defaults for non-sensitive values (`PORT=5000`, `HOST=0.0.0.0`, `NODE_ENV=development`, `CLIENT_URL=http://localhost:5173`).
- Strictly sanitizes error messages and log outputs, ensuring API keys and secrets are never leaked.
- Enforces production safety rules (e.g. rejecting localhost `CLIENT_URL` in `production`).
- Provides `toSanitizedObject()` helper for safe diagnostics and startup banners.

#### 2. Application Factory (`app.js`)
- Separates application initialization from the HTTP network listener.
- Configures CORS using centralized `config.allowedOrigins` and enables credentials.
- Attaches `express.json()` request body parsing.
- Mounts `/api` router using the provided Socket.IO instance.
- Configures top-level centralized error handling.
- Exports `createApp({ io })`, enabling programmatic testing and serverless compatibility without binding to network ports.

#### 3. Server Core & Lifecycle Management (`server.js`)
- Initializes HTTP server and binds Socket.IO with CORS rules.
- Manages Socket.IO real-time channels and disconnections.
- Attaches the Express application from `createApp({ io })`.
- Provides `startServer(port, host)` with idempotency protection against duplicate listeners.
- Provides `closeServer()` to cleanly release network sockets, Socket.IO clients, and SQLite connections.
- Implements graceful shutdown listeners for `SIGTERM` and `SIGINT` with a 5-second safety timeout.
- Uses `if (require.main === module)` to only start listening when executed directly as a script.

#### 4. Persistence Layer (`db/database.js`)
- Manages single connection instance to `commute.db` with WAL mode (`journal_mode = WAL`).
- Bootstraps 11 database tables:
  1. `geocoding_cache`: Caches geocoding queries with timestamps.
  2. `live_commute_reports`: Community reports with status, expiry, confirmations, and contradictions.
  3. `live_report_confirmations`: Deduplication tracking table for user votes.
  4. `ride_groups`: Student travel buddy coordination entries.
  5. `feedback`: User satisfaction ratings and qualitative tags.
  6. `gtfs_agency`, `gtfs_routes`, `gtfs_stops`, `gtfs_trips`, `gtfs_stop_times`, `gtfs_calendar`: Static GTFS transit data.
- Exports `db` instance and `resetDemo()` method to re-seed deterministic baseline data.

#### 5. API Router (`routes/api.js`)
Currently acts as a combination of router, controller, and query layer:
- Validates requests via Zod (`planSchema`, `reportSchema`, `rideGroupSchema`, `feedbackSchema`).
- Handles all `/api/*` endpoints.
- Directly invokes SQL prepared statements on `db`.
- Emits Socket.IO events (`live_report_created`, `live_report_updated`, `live_report_expired`, `demo_reset`).

#### 6. Domain Services (`services/`)
- **`gtfsService.js`**:
  - Implements bounding-box pre-filtering and exact Haversine distance calculation for stop discovery.
  - Queries scheduled trips matching origin-destination stop pairs.
  - Synthesizes candidate multimodal routes (Direct trains, Metros, BEST feeder buses, Auto, Walking).
- **`routingService.js`**:
  - Computes pedestrian and vehicular route geometries via public OSRM API.
  - Applies a Mumbai-specific traffic calibration factor (`distanceKm * 2.8 + 8` minutes for peak road travel).
  - Provides mathematical linear coordinate interpolation as a fallback when external routing fails.
- **`geocodingService.js`**:
  - Tier 1: Instant zero-latency dictionary lookup for 30+ Mumbai colleges and railway hubs.
  - Tier 2: SQLite cache (`geocoding_cache`).
  - Tier 3: OpenStreetMap Nominatim API with custom `User-Agent`.
- **`weatherService.js`**:
  - Queries Open-Meteo for temperature, relative humidity, precipitation, and hourly forecast.
  - Translates WMO weather codes into human-readable conditions and rain risk tiers.
  - Enforces 15-minute in-memory caching to avoid external API rate limits.
- **`disruptionService.js`**:
  - Calculates mathematical decay weights for student reports based on age ($0–10\text{ min} = 1.0$, $10–30\text{ min} = 0.75$, $30–60\text{ min} = 0.45$, $60–120\text{ min} = 0.20$, $>120\text{ min} = 0.0$).
  - Matches route corridors and modes against active reports to compute penalties and attach alerts.
- **`scoringService.js`**:
  - Executes deterministic multi-criteria decision analysis (MCDA).
  - Weights travel time, reliability, walking exertion, disruption risk, weather exposure, and fare across 4 profiles (`balanced`, `fastest`, `cheapest`, `rain-safe`).
  - Enforces hard budget constraints (eliminates over-budget options if compliant routes exist).
- **`aiPlannerService.js`**:
  - Calls Gemini 3.8 Flash (`@google/genai`) with structured JSON instructions.
  - Strictly constrains AI prompt to candidates generated by `gtfsService` and `scoringService` to prevent hallucination.
  - Provides a complete deterministic fallback explainer if `GEMINI_API_KEY` is not present or API call fails.

---

## 3. Existing API Specifications

| Method | Endpoint | Description | Auth / Identification |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status, city, timestamp | Public |
| `POST` | `/api/plan` | Geocodes, discovers GTFS options, enriches OSRM paths, scores routes, and generates AI explanations | Public (Body validation) |
| `GET` | `/api/live-reports` | Returns unexpired active disruption reports with calculated freshness weights | Public |
| `GET` | `/api/alerts` | Formatted alias of active disruption reports | Public |
| `POST` | `/api/live-reports` | Creates student community report and emits `live_report_created` | Pseudonym (optional) |
| `POST` | `/api/reports` | Alias for report creation | Pseudonym (optional) |
| `POST` | `/api/live-reports/:id/confirm` | Upvotes "still happening"; emits `live_report_updated` | `x-user-token` / IP |
| `POST` | `/api/live-reports/:id/contradict`| Upvotes "no longer happening"; auto-expires report if contradictions > confirmations + 3 | `x-user-token` / IP |
| `GET` | `/api/transit/search` | Search stops and routes by text query or GPS radius | Public |
| `GET` | `/api/ride-groups` | Lists available "Travel Together" student carpools/train groups | Public |
| `POST` | `/api/ride-groups` | Creates a student commute group | Creator pseudonym |
| `POST` | `/api/ride-groups/:id/join` | Increments member count up to `max_members` | Public |
| `POST` | `/api/feedback` | Records student rating, satisfaction tags, and comments | Public |
| `POST` | `/api/demo/reset` | Resets SQLite database and broadcasts `demo_reset` via Socket.IO | Public |

---

## 4. Completed Features to Preserve (Protected Code Surface)

Under no circumstances should upcoming backend changes break, alter, or recreate the following functional guarantees:

1. **Multimodal Mumbai Transit Grounding**:
   - Western Railway, Central Railway, Harbour Line, Metro (Lines 1, 2A, 7, 3), and BEST campus feeder buses are sourced from verified GTFS schedules in `commute.db`.
   - Never allow route generation to synthesize fictional transit stops or routes.

2. **Strict Budget & Mode Filtering**:
   - Routes exceeding `maxBudgetRupees` must be eliminated if within-budget routes exist.
   - Routes must strictly conform to `preferredModes`.

3. **Deterministic Scoring Engine Reliability**:
   - The multi-factor scoring formula and the four profiles (`balanced`, `fastest`, `cheapest`, `rain-safe`) must remain deterministic and repeatable.

4. **Zero-Hallucination AI Explanations**:
   - Gemini must always be supplied pre-computed candidate routes and pre-scored rankings.
   - The deterministic fallback explanation engine in `aiPlannerService.js` must always function when `GEMINI_API_KEY` is omitted or network is unreachable.

5. **Community Disruption Time Decay & Consensus Logic**:
   - Mathematical time decay calculation ($1.0 \to 0.0$) must be preserved.
   - Contradiction-based auto-expiration threshold (`contradictions >= confirmations + 3`) must be maintained.
   - Deduplication via `live_report_confirmations` must not be bypassed.

6. **Real-Time WebSockets**:
   - Socket.IO broadcast channels and payload structures (`live_report_created`, `live_report_updated`, `live_report_expired`, `demo_reset`) must remain backwards-compatible with the frontend client.

7. **Student Privacy Constraints**:
   - Never accept, require, or persist exact residential addresses or continuous GPS tracks.
   - All spatial coordinates must remain at the neighborhood/station landmark level.

---

## 5. Architectural Issues, Blockers & Technical Debt

During this Day 1 audit, several key architectural issues were identified that could block or impede development over the 21-day roadmap:

### 1. Monolithic Router Anti-Pattern ("Fat Router")
- **Issue**: `backend/routes/api.js` is 539 lines long. It bundles route definitions, Zod validation schemas, direct SQL statement compilation and execution, external service orchestration, and Socket.IO emission logic all inside a single factory function.
- **Risk**: High risk of merge conflicts, regression bugs, and inability to unit test individual route handlers in isolation.

### 2. Lack of a Data Access / Repository Layer (DAL)
- **Issue**: Raw SQL queries (`db.prepare(...)`) are executed directly within `routes/api.js`, `services/gtfsService.js`, `services/disruptionService.js`, and `services/geocodingService.js`.
- **Risk**: Database operations are tightly coupled with transport/controller logic. Changes to database schema require modifications across multiple service and route files.

### 3. Tight Socket.IO Coupling
- **Issue**: `createApiRouter(io)` requires passing the Socket.IO instance directly into the routing layer.
- **Risk**: Prevents testing HTTP routes with `supertest` without spinning up a mock Socket.IO server. A dedicated event emitter service or socket manager should decouple this.

### 4. Missing Formal Test Framework
- **Issue**: The project relies entirely on `scripts/verify_all.js` (an imperative script that requires an active server listening on port 5000). There is no test runner (e.g. Jest, Vitest, or Mocha).
- **Risk**: Inability to run automated CI/CD unit tests, mock external APIs (OSRM, Open-Meteo, Gemini), or test edge cases in isolated service functions.

### 5. In-Memory State & Single-Instance Vulnerabilities
- **Issue**: `weatherService.js` stores cached weather in module-level variables (`cachedWeather`, `lastFetchTime`).
- **Risk**: While fine for a single Node.js process, this state is lost on process restart and will not scale if clustering or worker threads are introduced.

### 6. Hardcoded Magic Numbers & Configuration Sprawl
- **Issue**: Travel speeds (22 km/h, 4.5 km/h), road calibration multipliers (`2.8 + 8`), scoring weights, and search radii (3500m) are hardcoded inline in service files.
- **Risk**: Tuning transit algorithms requires modifying core logic files rather than a centralized configuration file.

---

## 6. Proposed Evolution (Target Architecture)

To support the roadmap cleanly without introducing breaking changes, the backend should gradually evolve toward a clean layered architecture:

```
backend/
├── db/                        # Database initialization & migrations
│   ├── database.js
│   └── migrations/
├── src/ (or modular folders)
│   ├── config/                # Environment, constants, calibration weights
│   │   ├── constants.js
│   │   └── scoringProfiles.js
│   ├── controllers/           # HTTP Request/Response handlers
│   │   ├── plannerController.js
│   │   ├── disruptionController.js
│   │   ├── transitController.js
│   │   └── rideGroupController.js
│   ├── routes/                # Pure Express router mappings
│   │   ├── planRoutes.js
│   │   ├── reportRoutes.js
│   │   └── groupRoutes.js
│   ├── services/              # Pure domain business logic (existing, refined)
│   ├── repositories/          # Data access layer for SQLite queries
│   │   ├── reportRepository.js
│   │   ├── gtfsRepository.js
│   │   └── rideGroupRepository.js
│   ├── sockets/               # Socket.IO handlers & event emitter abstraction
│   │   └── socketManager.js
│   └── validators/            # Zod validation schemas
│       └── schemas.js
├── scripts/                   # Verification and maintenance scripts
└── server.js                  # Entry point
```

> **Important Boundary Rule for Day 1:**  
> The backend structure is documented but **not restructured in this commit**. All existing files, paths, and behaviors remain fully intact and operational. Planned architectural refinements will be implemented incrementally across designated roadmap days.

---

## 7. Verification Results

- [x] **Repository Consistency**: Documented paths, endpoints, and schemas match the active codebase.
- [x] **Zero Code Changes to Runtime**: No runtime backend files were modified.
- [x] **No Frontend Changes**: No files in `/frontend` were touched.
- [x] **No Dependency Changes**: `package.json` and `package-lock.json` remain untouched.
- [x] **Roadmap Alignment**: Day 1 objectives (audit and architecture documentation) are completely fulfilled.
