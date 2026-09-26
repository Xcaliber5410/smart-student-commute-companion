# Backend Service Layer Architecture & Implementation Guide

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 5 of 21-Day Development Roadmap  
**Scope:** Core Domain Services & Business Logic Architecture (`backend/services/`)

---

## 1. Architectural Overview

The backend enforces a strict layered separation of concerns:

```text
HTTP / Client Request
        │
        ▼
   [API / Route]           Path registration, HTTP method binding, router middleware
        │
        ▼
    [Validation]           Zod schema validation on body, query, and path parameters
        │
        ▼
   [Auth / AuthZ]          JWT verification, Role-Based Access Control, Ownership guards
        │
        ▼
[Service / Business]       Pure business rules, state machines, transactions, coordination
        │
        ▼
    [Repository]           Database access, parameterized SQL, row hydration, atomicity
        │
        ▼
     [Database]            SQLite engine with WAL mode, foreign keys, and ACID transactions
        │
        ▼
[Standardized Response]    Envelope formatting: { success: true, timestamp, data }
```

Business rules and persistence logic must **never** be implemented inside route handlers or controllers.

---

## 2. Layer Responsibilities

| Layer | Responsibility | What It Must NOT Do |
|---|---|---|
| **Routes** (`backend/routes/`) | Endpoint paths, HTTP verb mapping, and middleware chaining. | No validation logic, no database calls, no business branching. |
| **Validators** (`backend/validators/`) | Type, format, and boundary checks using Zod schemas. | No business entity lookups or database queries. |
| **Auth/AuthZ** (`backend/middleware/authMiddleware.js`) | JWT authentication, user context injection, role checking (`student` vs `admin`). | No business workflows or data transformation. |
| **Controllers** (`backend/controllers/`) | HTTP adapters: extract request data, invoke service methods, format API responses via `apiResponse.js`. | No business calculations, no direct SQL queries, no transaction handling. |
| **Services** (`backend/services/`) | Core domain workflows, capacity checks, state transitions, domain-level errors, multi-repository coordination. | No Express `req` or `res` objects; no HTTP status codes; no direct SQL strings. |
| **Repositories** (`backend/repositories/`) | Isolated data persistence, parameterized SQL statements, atomic transactions, row-to-model hydration. | No HTTP concerns; no authentication logic. |
| **Models** (`backend/models/`) | Domain entity invariants, field serialization (`toRow`, `toSafeObject`, `fromRow`), expiry calculations. | No external I/O or network requests. |

---

## 3. Core Domain Services Catalog

### A. `CommutePlanService` (`backend/services/commutePlanService.js`)
* **`planCommute(planParams)`**:
  - Resolves spatial coordinates via `geocodeArea`.
  - Concurrently queries live weather and community disruption reports.
  - Queries GTFS transit schedule candidates matching arrival time and permitted modes.
  - Enforces strict budget thresholds against student limits.
  - Enriches road and transit walking legs with OSRM geometries.
  - Computes multi-criteria score (duration, cost, transfers, disruption penalty).
  - Obtains grounded Gemini AI reasoning with structured rule-based fallbacks.
  - Assembles recommended routes and alternative badges (Fastest, Rain-Safe, Budget).

### B. `TransitService` (`backend/services/transitService.js`)
* **`search({ q, lat, lon, radius })`**:
  - Encapsulates GTFS spatial stop queries (within radius in meters) and stop/route text searches.
  - Keeps raw SQL out of controllers.

### C. `RideGroupService` (`backend/services/rideGroupService.js`)
* **`listRideGroups(options)`**: Paginated retrieval with mode and origin filtering.
* **`getRideGroupById(id)`**: Retrieves group or throws `ResourceNotFoundError`.
* **`createRideGroup(groupData)`**: Persists new Travel Together carpool group.
* **`joinRideGroup(id, userOrToken)`**:
  - Rejects if group is already full (`GROUP_FULL`).
  - Rejects if creator attempts duplicate join (`CREATOR_ALREADY_MEMBER`).
  - Atomically increments member count inside a database transaction.
* **`leaveRideGroup(id)`**:
  - Atomically decrements member count.
  - Prevents dropping below 1 member (`MINIMUM_MEMBERSHIP_REACHED`).
* **`updateRideGroup(id, updates, currentUser)`**:
  - Enforces capacity upper bound (cannot reduce below current membership).
  - Enforces creator ownership (or admin role).
* **`deleteRideGroup(id, currentUser)`**:
  - Enforces creator ownership (or admin role).

### D. `ReportService` (`backend/services/reportService.js`)
* **`getLiveReports(options)`**: Queries active disruption reports with exponential freshness decay calculation.
* **`getAlerts()`**: Formats active disruptions into prioritized student transit alerts.
* **`createReport(input)`**: Persists report with initial duration and expiration timestamp.
* **`confirmReport(id, userToken)`**:
  - Verifies report is active and not expired (`REPORT_INACTIVE`).
  - Atomically records confirmation vote and updates counter in a transaction.
* **`contradictReport(id, userToken)`**:
  - Verifies report is active and not expired (`REPORT_INACTIVE`).
  - Atomically records contradiction vote, updates counter, and triggers auto-expiration if contradiction threshold is met.
* **`updateReport(id, updates, currentUser)`**:
  - Disallows editing resolved reports without reopening (`REPORT_RESOLVED`).
  - Enforces creator ownership or admin role.
* **`deleteReport(id, currentUser)`**:
  - Enforces creator ownership or admin role.

### E. `FeedbackService` (`backend/services/feedbackService.js`)
* **`submitFeedback(input)`**: Persists student route rating.
* **`submitFeedbackBatch(items)`**: Atomically inserts multiple feedback records in a single database transaction.
* **`getFeedbackSummary(recommendationId)`**: Calculates helpful count, total ratings, and helpful percentage.
* **`deleteFeedbackByRecommendation(recommendationId)`**: Atomically cascades deletion of all ratings for a recommendation.

### F. `AuthService` (`backend/services/authService.js`)
* **`register(data)`**: Validates uniqueness and creates account with salted scrypt hashing.
* **`login(credentials)`**: Constant-time verification preventing user enumeration, produces signed JWT.
* **`getProfile(userId)` / `updateProfile(userId, updates)`**: Profile retrieval and mutation.
* **`listUsers()`**: Admin-only user directory querying through `UserRepository.findAll()`.

---

## 4. Transaction Boundaries & Consistency

Transactions are strictly managed at the persistence/repository layer using the underlying engine's transaction API (`this.database.transaction(() => { ... })`).

### Critical Transactional Boundaries
1. **`ReportRepository.addVote`**:
   - Step 1: Insert into `live_report_confirmations` (`UNIQUE(report_id, user_token)`).
   - Step 2: Increment confirmation or contradiction counter on `live_commute_reports`.
   - Step 3: Check auto-expiry condition and atomically update `status = 'expired'`.
   - *Rollback:* If duplicate voter or DB error occurs, all changes roll back cleanly.

2. **`RideGroupRepository.atomicJoin` and `atomicLeave`**:
   - Step 1: Read current record within transaction lock.
   - Step 2: Validate capacity invariant (`current_members < max_members` or `current_members > 1`).
   - Step 3: Update `current_members`.
   - *Rollback:* Aborts if capacity bounds are violated, leaving count consistent.

3. **`FeedbackRepository.createBatch`**:
   - Step 1..N: Sequentially insert all batch entries.
   - *Rollback:* If any individual record collides (e.g. unique constraint), entire batch is rolled back.

4. **`ReportRepository.delete` and `FeedbackRepository.deleteByRecommendationId`**:
   - Cascading deletions occur in a single atomic transaction.

---

## 5. Standardized Error Handling

All domain services throw operational errors derived from `AppError`:

| Error Class | HTTP Status | Code | Usage |
|---|---|---|---|
| `ResourceNotFoundError` | 404 | `NOT_FOUND` | Missing entity by ID or key. |
| `BusinessRuleError` | 400 | `BUSINESS_RULE_VIOLATION` | Invariant or capacity violation. |
| `OwnershipError` | 403 | `FORBIDDEN_OWNERSHIP` | Non-owner non-admin mutation attempt. |
| `InvalidStateTransitionError` | 400 | `INVALID_STATE_TRANSITION` | Disallowed state transition (e.g. voting on expired report). |
| `ConflictError` | 409 | `CONFLICT` | Duplicate key, duplicate email, unique collision. |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Invalid credentials or missing authentication token. |

### Sensitive Data Masking
In production environments (`NODE_ENV=production`), unexpected non-operational 500 errors mask database internals, SQL snippets, and stack traces, returning a safe generic response envelope.

---

## 6. Verification and Test Suite

All domain services, business rules, and transactions are covered by automated verification scripts:

```bash
# Run all tests (Smoke + DB + API + Auth + Rules + Transactions + Services)
npm run test:all

# Run domain business rules verification
npm run verify:rules

# Run database transactions and rollback suite
npm run verify:transactions

# Run standardized service error handling verification
npm run verify:service-errors

# Run service layer integration test suite
npm run test:services
```
