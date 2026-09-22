# Database Setup, Migration, and Testing Guide

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 2 of 21-Day Development Roadmap  
**Scope:** Persistence, Data Models, Migrations, Repositories, and Database Testing

---

## 1. Database Architecture Overview

Smart Student Commute Companion utilizes an embedded **SQLite** engine operating in Write-Ahead Logging (**WAL**) mode.

* **High Performance**: In-process zero-latency transactions; avoids external server latency.
* **Concurrency**: WAL (`journal_mode = WAL`) allows unlimited concurrent reads while writes are progressing.
* **Dual-Driver Engine**: Automatic selection between `better-sqlite3` (native compiled) and Node.js built-in `node:sqlite` (`DatabaseSync`), guaranteeing zero boot failures across different Node versions (v18, v22, v24) and operating systems (Windows, Linux, macOS).
* **Singleton Lifecycle**: Centralized connection manager in `backend/db/connection.js` ensures only a single connection pool is instantiated per database file path, with safe teardown via `closeConnection()` on SIGINT/SIGTERM.

---

## 2. Environment Variables

The database is configured via centralized environment configuration in `backend/config/index.js`. Add these to your `.env` file if custom overrides are needed:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_PATH` | `string` | `./backend/db/commute.db` | Absolute or relative filesystem path to the SQLite database file. |
| `DATABASE_WAL_MODE` | `boolean` | `true` | Enables Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for high concurrency. |

Example `.env` entry:
```env
DATABASE_PATH=./backend/db/commute.db
DATABASE_WAL_MODE=true
```

---

## 3. Schema Migrations System

The backend features a zero-dependency, transaction-wrapped schema migration runner in `backend/migrations/`:

* Migration records are tracked in the `schema_migrations` table (`id`, `name`, `applied_at`).
* Each migration file in `backend/migrations/scripts/` exports:
  * `up(db)`: Forward schema application.
  * `down(db)`: Clean rollback operation.
* Every migration runs inside an ACID SQLite transaction (`BEGIN TRANSACTION ... COMMIT;`). If any DDL or DML statement fails, changes are completely rolled back.

### Migration Commands

Run migration operations via `npm` from the root or `/backend` directory:

```bash
# 1. Apply all pending migrations (Forward)
npm --prefix backend run db:migrate

# 2. Roll back the most recently applied migration (Reverse)
npm --prefix backend run db:rollback

# 3. Check migration status (Lists applied and pending migrations)
npm --prefix backend run db:status
```

---

## 4. Foundational Data Models

Located in `backend/models/`, each domain entity is backed by strict **Zod** schema validation and exposes immutable domain invariants:

1. **`RideGroup` (`backend/models/RideGroup.js`)**:
   - Manages student carpooling and shared commute coordination.
   - Fields: `id`, `creator_pseudonym`, `origin_area`, `destination_college`, `departure_time`, `mode`, `max_members`, `current_members`, `notes`, `created_at`.
   - Domain invariants: `isFull()`, capacity limits (2–6 students).

2. **`LiveReport` (`backend/models/LiveReport.js`)**:
   - Real-time community transit disruption reports (delays, crowding, diversions).
   - Fields: `id`, `pseudonym`, `area`, `route_name`, `route_id`, `mode`, `message`, `impact`, `status`, `created_at`, `expires_at`, `confirmation_count`, `contradiction_count`.
   - Domain invariants: `isExpired(currentTime)`, status transitions.

3. **`ReportConfirmation` (`backend/models/ReportConfirmation.js`)**:
   - Crowdsourced community verification votes on disruptions.
   - Fields: `id`, `report_id`, `user_token`, `action` (`confirm` | `contradict`), `created_at`.
   - Unique voter constraint: Prevents single users from submitting duplicate votes.

4. **`Feedback` (`backend/models/Feedback.js`)**:
   - Post-commute student ratings and tagging on recommended routes.
   - Fields: `id`, `recommendation_id`, `is_useful`, `tags`, `comment`, `created_at`.

5. **`GeocodingCache` (`backend/models/GeocodingCache.js`)**:
   - Persistent spatial coordinate caching for Mumbai colleges and landmarks.
   - Fields: `query`, `lat`, `lon`, `display_name`, `created_at`.

---

## 5. Repository Data-Access Layer

Located in `backend/repositories/`, separating raw SQL statements from route handlers and controllers:

* **`RideGroupRepository`**: `create()`, `findById()`, `findRecent()`, `incrementMembers()`.
* **`ReportRepository`**: `create()`, `findById()`, `findActive()`, `findVote()`, `addVote()`.
* **`FeedbackRepository`**: `create()`, `findById()`, `findByRecommendationId()`, `getRatingSummary()`.
* **`GeocodingRepository`**: `findByQuery()`, `upsert()`.

---

## 6. Database Validation & Error Handling

Low-level driver errors are mapped to application errors via `backend/db/dbErrors.js`:

* **`SQLITE_CONSTRAINT_UNIQUE`** $\rightarrow$ HTTP 409 `ConflictError` (`DUPLICATE_RECORD`).
* **`SQLITE_CONSTRAINT_NOTNULL`** $\rightarrow$ HTTP 400 `ValidationError` (`NOT_NULL_VIOLATION`).
* **`SQLITE_CONSTRAINT_FOREIGNKEY`** $\rightarrow$ HTTP 400 `BadRequestError` (`FOREIGN_KEY_VIOLATION`).
* **`SQLITE_BUSY` / `SQLITE_LOCKED`** $\rightarrow$ HTTP 503 `ServiceUnavailableError` (`DATABASE_BUSY`).
* **Production Security**: Raw SQL queries, table names, file paths, and internal stack traces are scrubbed in production responses.

---

## 7. Database Testing Instructions

### Running Database Integration Tests
Integration tests run against an isolated test database (`backend/db/test_integration_runner.db`) and **never touch production data**:

```bash
# Run database integration test suite
npm --prefix backend run test:db
```

### Running All Backend Tests
```bash
# Executes config, bootstrap, route verification, error verification, smoke tests, and DB tests:
npm --prefix backend run test:all
```
