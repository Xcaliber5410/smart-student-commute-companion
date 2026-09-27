# Backend Business Logic Layer Audit & Design (Day 5)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 5 of 21-Day Development Roadmap  
**Scope:** Core Backend Business Logic & Service Layer Architecture

---

## 1. Architectural Flow

The backend adheres strictly to the following 6-tier unidirectional flow:

```text
Request
  ↓
API / Route (Express router, HTTP method mapping, path parameters)
  ↓
Validation (Zod schema checking: body, params, query)
  ↓
Authentication / Authorization (JWT identity extraction, role & ownership guards)
  ↓
Service / Business Logic (Domain invariants, state machines, business workflows, coordination)
  ↓
Repository / Data Access (Parameterized queries, transactions, hydration of domain models)
  ↓
Database (SQLite tables, constraints, foreign keys)
```

---

## 2. Audit Findings

### 2.1 Route/Controller Handlers Containing Business Rules
- **`planController.js`**: Contained extensive business logic:
  - Coordinating geocoding for origin and destination.
  - Querying live weather and active disruption reports concurrently.
  - Filtering transit candidates strictly by user budget.
  - Enriching multimodal transit legs with OSRM driving/walking road geometries.
  - Scoring candidate routes with multi-factor weighting.
  - Orchestrating Gemini AI grounded explanations and structured fallbacks.
  - Identifying and ranking practical alternatives (fastest, lowest-cost, rain-safe).
  *Resolution*: Extract into a dedicated `CommutePlanService`.
- **`transitController.js`**: Performed direct GTFS transit queries and response transformation.
  *Resolution*: Extract into a dedicated `TransitService`.
- **`rideGroupController.js`**: Handled input parsing and delegation, but business-level capacity rules, status transitions, and membership state machines must be strengthened inside `RideGroupService`.
- **`reportController.js`**: Auto-expiry logic was partially coupled to repository transactions. Domain business rules (e.g. valid status transitions, voting eligibility) belong in `ReportService`.
- **`authController.js`**: Properly thin, delegating to `AuthService`.

### 2.2 Domain Service Layer Allocation
- **`CommutePlanService` (`backend/services/commutePlanService.js`)**: Multimodal transit planning, OSRM geometry stitching, deterministic route scoring, and AI explanation generation.
- **`TransitService` (`backend/services/transitService.js`)**: Transit corridor searches, station queries, and route discovery.
- **`RideGroupService` (`backend/services/rideGroupService.js`)**: Carpool coordination, capacity enforcement, finite state transitions (`open` → `full` → `departed` → `cancelled`), duplicate join prevention, and creator ownership verification.
- **`ReportService` (`backend/services/reportService.js`)**: Community transit disruption ingestion, freshness decay calculation, confirmation/contradiction voting, and threshold auto-expiry.
- **`FeedbackService` (`backend/services/feedbackService.js`)**: Student commute review submission, rating aggregation, and recommendation telemetry.
- **`AuthService` (`backend/services/authService.js`)**: Student registration, password hashing (scrypt), constant-time credential checks, JWT issuance, and profile management.

### 2.3 Repository Layer Allocation
- Repositories are strictly responsible for data persistence and retrieval:
  - `UserRepository`: CRUD on `users` table.
  - `RideGroupRepository`: CRUD on `ride_groups` table, membership management, and status updates.
  - `ReportRepository`: CRUD on `live_commute_reports` and `live_report_confirmations`.
  - `FeedbackRepository`: CRUD on `feedback` table and SQL aggregation metrics.
  - `GeocodingRepository`: Coordinate caching and lookup.
- Repositories must **not** perform HTTP handling, schema validation, or transport serialization.

### 2.4 Existing Validation & Auth Verification
- **Validation**: Centralized Zod middleware (`backend/middleware/validate.js`) validates `body`, `params`, and `query` prior to controller/service invocation.
- **Authentication**: JWT token verification (`backend/middleware/authMiddleware.js`) via `authenticate` and `optionalAuthenticate`.
- **Authorization**: Role-based access control (`requireRole`) and resource ownership (`enforceRideGroupOwnership`).

### 2.5 Identified Inconsistencies & Target Enhancements
1. **Separation of Concerns**: `planController.js` must be refactored to delegate entirely to `commutePlanService`.
2. **State Machine Invariants**: Ride groups must enforce valid status transitions (`open` → `full` → `departed` → `cancelled`) and block mutations on completed/cancelled groups.
3. **Membership Integrity**: Students must not be allowed to join the same ride group more than once, nor join departed/cancelled groups.
4. **Disruption Voting Rules**: Confirmations/contradictions must only apply to `active` reports; voting on `resolved` or `expired` reports must be prohibited at the business logic layer.
5. **Transactional Consistency**: Atomic multi-step operations (e.g. member additions, report contradiction with auto-expiry) must be handled through explicit database transactions.
6. **Standardized Service Errors**: Services must emit typed domain errors (`NotFoundError`, `BadRequestError`, `ForbiddenError`, `ConflictError`) cleanly mapped by the central error handler.
