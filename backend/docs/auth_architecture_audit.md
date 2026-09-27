# Authentication Architecture Audit & Security Specification

**Author:** Skan (Backend Developer)  
**Date:** Day 4 of 21-Day Roadmap  
**Scope:** Authentication, Authorization, Credential Security, and Access Control (`/backend`)

---

## 1. Executive Summary

As of Day 3, the **Smart Student Commute Companion** backend provides multimodal transit routing, GTFS transit queries, real-time crowdsourced disruption feeds with decay algorithms, and Travel Together carpooling coordination. However, the system currently operates in an unauthenticated prototype state:

1. **Absence of User Identity & Persistence**: There is no `users` table or user model. Requests currently rely on client-supplied pseudonyms (`creator_pseudonym` in `ride_groups`, `pseudonym` in `live_commute_reports`) or arbitrary client tokens (`user_token` in `live_report_confirmations`).
2. **Missing Credential Handling**: No password hashing, credential validation, registration, or login mechanisms are present.
3. **No Access Control or Ownership Enforcement**: Any client can mutate or delete any ride group or submit feedback anonymously. There is no verification of resource ownership.
4. **No Session or Authentication Middleware**: API endpoints do not inspect identity headers (`Authorization: Bearer <token>`).

The objective of Day 4 is to establish a robust, maintainable, and secure authentication and authorization foundation across 7 sequential tasks, adhering strictly to existing Express, SQLite (`better-sqlite3`), and Zod patterns without breaking existing endpoints or modifying frontend code.

---

## 2. Current Architecture & Security Audit

### 2.1 Existing Identity-Related Artifacts

| Component | Current Implementation | Security Deficiency |
| :--- | :--- | :--- |
| `models/RideGroup.js` | Uses string `creator_pseudonym` without relation to a verified account. | Any user can spoof another student's name; any client can `PATCH` or `DELETE` any group by ID. |
| `models/LiveReport.js` | Uses string `pseudonym` without authentication. | Susceptible to disruption spam and malicious status spoofing without accountability. |
| `models/ReportConfirmation.js` | Uses `user_token` (client-generated string) for deduplicating confirm/contradict votes. | Client can forge arbitrary `user_token` values to bypass duplicate vote constraints. |
| `controllers/rideGroupController.js` | Direct update/delete operations without authorization. | Insecure Direct Object References (IDOR). |
| `routes/index.js` | All 23 API endpoints are completely open without middleware gates. | Zero perimeter defense or identity context. |

### 2.2 Mechanism Evaluation: JWT vs. Server-Side Sessions

| Criterion | Stateless Cryptographic Token (JWT) | Server-Side Stateful Sessions |
| :--- | :--- | :--- |
| **Storage Overhead** | Zero database lookups for verification; self-contained payload. | Requires session table storage and DB read on every request. |
| **Horizontal Scalability** | High; stateless verification across server instances or serverless workers. | Requires shared session store (Redis) or SQLite locks. |
| **Dependencies** | Standard Node.js `crypto` (HMAC-SHA256); zero external dependencies. | Requires `express-session` + SQLite session store. |
| **Suitability for API** | Ideal for mobile/web REST APIs with `Authorization: Bearer <token>` header. | Cookie-based sessions introduce CSRF complexities for pure REST. |

**Decision:** Adopt a standard **HMAC-SHA256 Signed Bearer Token (JWT-compliant)** strategy utilizing Node.js built-in `crypto` module. This guarantees zero native dependency issues, full compatibility with the existing architecture, standard `Authorization: Bearer <token>` header support, and strict tamper protection.

---

## 3. Planned Architecture & Schema

### 3.1 Database Schema (`users` table)

A new migration `002_create_users_table.js` will provision the `users` table:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- 'usr-<timestamp>-<random>'
  email TEXT NOT NULL UNIQUE,        -- Normalized lowercase email
  password_hash TEXT NOT NULL,       -- scrypt formatted 'salt:hash'
  full_name TEXT NOT NULL,           -- Student name
  college_name TEXT NOT NULL,        -- e.g. "DJ Sanghvi College of Engineering"
  role TEXT NOT NULL DEFAULT 'student', -- 'student' | 'admin'
  created_at INTEGER NOT NULL,       -- Epoch milliseconds
  updated_at INTEGER NOT NULL        -- Epoch milliseconds
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
```

### 3.2 Credential Security Specification

1. **Hashing Algorithm**: Node.js `crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })`.
   - **Salt**: 16 cryptographically secure random bytes generated via `crypto.randomBytes(16)`.
   - **Format**: Stored strictly as `<saltHex>:<hashHex>`.
2. **Verification**: Re-hashes candidate password with stored salt and compares using `crypto.timingSafeEqual` to prevent side-channel timing attacks.
3. **Password Rules**: Minimum 8 characters, maximum 128 characters, containing at least one uppercase letter, one lowercase letter, and one number.
4. **Data Sanitization**: Domain models and controllers must strip `password_hash` before serializing user entities (`user.toJSON()` or `user.toSafeObject()`).
5. **No Enumeration Leakage**: Login failures return a generic `"Invalid email or password"` (401) with consistent response times, avoiding user enumeration.

### 3.3 Token Specification

1. **Structure**: Standard Header.Payload.Signature token (HS256).
2. **Payload Claims**:
   - `sub`: User ID (`usr-...`)
   - `email`: User email
   - `role`: User role (`student` / `admin`)
   - `college_name`: Student institution
   - `iat`: Issued-at timestamp (seconds)
   - `exp`: Expiration timestamp (seconds, default 24 hours)
3. **Secret**: `config.jwtSecret` or `process.env.JWT_SECRET` with secure development fallback.
4. **Transmission**: `Authorization: Bearer <token>`.

---

## 4. Route Access Matrix (Public vs. Protected)

Based on project requirements and student commute workflows:

| Route Path | Method | Access Level | Description |
| :--- | :---: | :---: | :--- |
| `/health`, `/api/health` | `GET` | **Public** | System liveness probe |
| `/api/auth/register` | `POST` | **Public** | Student account registration |
| `/api/auth/login` | `POST` | **Public** | Credential validation & token issuance |
| `/api/auth/me` | `GET` | **Authenticated** | Returns current user profile |
| `/api/plan` | `POST` | **Public** | Multimodal route planning and scoring |
| `/api/transit/*` | `GET` | **Public** | GTFS transit and station search |
| `/api/live-reports` | `GET` | **Public** | View crowdsourced commute disruptions |
| `/api/live-reports/:id` | `GET` | **Public** | View specific disruption details |
| `/api/alerts` | `GET` | **Public** | High-impact active disruption alerts |
| `/api/live-reports` | `POST` | **Authenticated** | Report a live commute disruption |
| `/api/live-reports/:id/confirm` | `POST` | **Authenticated** | Upvote/confirm a disruption report |
| `/api/live-reports/:id/contradict`| `POST` | **Authenticated** | Downvote/contradict a disruption report |
| `/api/ride-groups` | `GET` | **Public** | Browse student carpool/travel groups |
| `/api/ride-groups/:id` | `GET` | **Public** | View specific ride group details |
| `/api/ride-groups` | `POST` | **Authenticated** | Create a student travel group |
| `/api/ride-groups/:id/join` | `POST` | **Authenticated** | Join an open ride group |
| `/api/ride-groups/:id` | `PATCH` | **Owner / Admin** | Update ride group (creator only) |
| `/api/ride-groups/:id` | `DELETE` | **Owner / Admin** | Delete ride group (creator only) |
| `/api/feedback` | `POST` | **Public / Optional Auth** | Submit student route feedback |
| `/api/feedback` | `GET` | **Admin / Public** | View aggregate feedback |
| `/api/demo/reset` | `POST` | **Public / Demo** | Reset demo environment |

---

## 5. Implementation Roadmap (7 Sequential Tasks)

1. **Task 1: Authentication Architecture Audit** (This document)
2. **Task 2: User Identity and Password Security**
   - Migration `002_create_users_table.js`.
   - Domain model `models/User.js` with scrypt hashing, verification, and serialization sanitization.
   - `repositories/UserRepository.js` with transactional persistence and email uniqueness.
3. **Task 3: User Registration API**
   - Zod validation in `validators/authValidators.js`.
   - `services/authService.js` registration logic.
   - `controllers/authController.js` and `routes/authRoutes.js` (`POST /api/auth/register`).
4. **Task 4: Login and Session/Token Handling**
   - Token generation & verification utilities (`utils/token.js`).
   - `authService.login()` with constant-time scrypt verification.
   - `POST /api/auth/login` endpoint returning sanitized user + token.
5. **Task 5: Authentication Middleware**
   - `middleware/authMiddleware.js` (`authenticateToken`).
   - Header extraction (`Bearer <token>`), signature verification, and attaching `req.user`.
   - `GET /api/auth/me` endpoint.
6. **Task 6: Authorization and User Access Control**
   - Role guard middleware (`requireRole('admin')`).
   - Resource ownership verification (`requireOwnership`) protecting `ride_groups` mutations.
7. **Task 7: Authentication Tests and Documentation**
   - Automated test suite (`scripts/verify_auth.js`).
   - Documentation (`docs/authentication.md`).
   - Full regression verification (`npm run test:all`).
