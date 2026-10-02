# Unified Student Search — Architecture & API Documentation

## Overview

The **Unified Student Search** feature provides a cross-domain, deterministic search engine for the **Smart Student Commute Companion**. It empowers authenticated students to query across all academic, planning, commute, goal, and alert records stored in the backend with high-resolution relevance ranking, robust data isolation, and comprehensive privacy-preserving observability.

---

## 1. What Unified Search Supports

- **Multi-Entity Discovery**: Queries 9 student-owned entity types simultaneously in a single pass.
- **Natural Language Query Parsing**: Supports full phrases, tokenized keywords, non-contiguous multi-word queries, and partial prefix matching (e.g. `distrib` matches "Distributed Systems").
- **Case-Insensitive & Whitespace-Tolerant**: Normalizes repeated spaces and case variations.
- **High-Resolution Deterministic Ranking**: Heuristic scoring engine (0–200+ points) prioritizing exact title matches, beginning-of-field occurrences, word boundaries, identifier matches (course codes), and active deliverable boosts.
- **Invariant Secondary Tie-Breaking**: 5-tier deterministic comparator (`relevanceScore DESC` → `recency DESC` → `title ASC` → `type ASC` → `id ASC`) guaranteeing zero order shifts across pagination boundaries or server reloads.
- **Strict Student Ownership Isolation**: Zero data leakage between students. Queries strictly filter by `req.user.id`, and cross-student access attempts are forbidden.
- **Course & Status Scoping**: Allows scoping queries to specific courses (`courseId`) or deliverable statuses/priorities (`status`).
- **Pagination & Bounds Protection**: Configurable `limit` (1–100, default 20) and `offset` (0–1000) with protection against deep-paging resource exhaustion.
- **Operational Observability**: Telemetry ring-buffer tracking latency percentiles (min, avg, max, p95), success/failure rates, zero-result frequencies, and filter distributions.
- **Request Abuse Safeguards**: In-memory sliding-window rate limiter emitting standard HTTP rate-limiting headers (`X-SearchRateLimit-Limit`, `X-SearchRateLimit-Remaining`, `X-SearchRateLimit-Reset`) and returning HTTP 429 (`TooManyRequestsError`) on bursts.
- **Privacy First**: Raw student search queries and personal identifiers are strictly excluded from telemetry buffers and server logs.

---

## 2. API Endpoints & Request Shape

### Endpoints
- **Primary**: `GET /api/student/search`
- **Academic Alias**: `GET /api/academic/search`

Both endpoints share identical schemas, authentication guards, and response contracts.

### Headers
- `Authorization: Bearer <JWT_TOKEN>` *(Required)*

### Query Parameters

| Parameter | Type | Required | Default | Bounds / Constraints | Description |
|:---|:---|:---|:---|:---|:---|
| `q` / `query` | string | No | `""` | Max 200 chars | Search query string. Empty query returns clean 200 OK empty response. |
| `types` / `type` | string \| string[] | No | All 9 | Comma-delimited list or array | Entity types to query (supports singular, plural, and colloquial aliases). |
| `courseId` / `course_id` | string | No | `null` | Valid string ID | Restricts search to entities associated with the given course. |
| `status` | string | No | `null` | Valid status string | Filters by status (e.g. `pending`, `completed`) or priority (`urgent`, `high`). |
| `limit` | integer | No | `20` | Min 1, Max 100 | Maximum number of results to return. |
| `offset` | integer | No | `0` | Min 0, Max 1000 | Number of results to skip for pagination. |

### Response Shape (200 OK)

```json
{
  "success": true,
  "query": "distributed",
  "total": 9,
  "limit": 20,
  "offset": 0,
  "types": [
    "course",
    "assignment",
    "calendar_event",
    "study_session",
    "goal",
    "saved_route",
    "schedule",
    "notification",
    "reminder"
  ],
  "results": [
    {
      "id": "course-1790948200-a1b2",
      "type": "course",
      "title": "Distributed Systems & Cloud",
      "description": "Instructor: Dr. Tanenbaum | Credits: 4",
      "status": "active",
      "relevanceScore": 185.0,
      "date": null,
      "url": "/api/academic/courses/course-1790948200-a1b2",
      "metadata": {
        "code": "CS401",
        "instructor": "Dr. Tanenbaum",
        "color": "#4F46E5",
        "credits": 4,
        "is_archived": false,
        "student_relationship": "enrolled",
        "domain": "academic"
      }
    }
  ],
  "countsByType": {
    "course": 1,
    "assignment": 1,
    "calendar_event": 1,
    "study_session": 1,
    "goal": 1,
    "saved_route": 1,
    "schedule": 1,
    "notification": 1,
    "reminder": 1
  },
  "executionDurationMs": 4.12,
  "pagination": {
    "total": 9,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### Rate-Limiting Headers
Every response includes:
- `X-SearchRateLimit-Limit`: Maximum requests permitted per window (default 60).
- `X-SearchRateLimit-Remaining`: Remaining request quota.
- `X-SearchRateLimit-Reset`: Unix timestamp when quota resets.

### Error Responses
- **401 Unauthorized**: Missing, expired, or invalid Bearer token.
- **400 Bad Request / Validation Error**: Query > 200 characters, limit < 1 or > 100, offset < 0 or > 1000, or invalid entity type.
- **429 Too Many Requests**: Burst velocity exceeds window threshold (includes `Retry-After: <seconds>` header).

---

## 3. Searchable Entity Types & Canonical Aliases

| Canonical Type | Supported Aliases | Database Source Table | Indexed / Searchable Columns |
|:---|:---|:---|:---|
| `course` | `courses`, `subject`, `subjects` | `courses` | `name`, `code`, `instructor` |
| `assignment` | `assignments`, `task`, `tasks` | `assignments` | `title`, `description` |
| `calendar_event` | `calendar_events`, `calendar`, `event`, `events` | `calendar_events` | `title`, `description`, `location`, `event_type` |
| `study_session` | `study_sessions`, `session`, `sessions`, `study` | `study_sessions` | `title`, `notes` |
| `goal` | `goals` | `goals` | `title`, `description` |
| `saved_route` | `saved_routes`, `route`, `routes` | `saved_routes` | `name`, `origin`, `destination`, `tags` |
| `schedule` | `schedules`, `commute_schedule`, `commute_schedules` | `student_schedules` | `title`, `origin`, `destination` |
| `notification` | `notifications` | `notifications` | `title`, `message` |
| `reminder` | `reminders` | `reminders` | `title`, `message` |

---

## 4. Ranking & Determinism Strategy

Relevance calculation (`backend/services/searchRanker.js`) is entirely rule-based and deterministic:

1. **Exact Title Match (+150 pts)**: Normalized query identically matches the entity title.
2. **Prefix Match (+85 pts)**: Entity title begins with the search query.
3. **Word Boundary Match (+55 pts)**: Query appears as a distinct word in the title (`\bquery\b`).
4. **General Title Substring (+35 pts)**: Query appears anywhere within the title.
5. **Identifier Match (+100 pts)**: Exact match on course code or specific identifier.
6. **Description Matches (+10 pts)**: Matches occurring in secondary fields (descriptions, notes, locations).
7. **Coverage Bonus (up to +20 pts)**: Proportional density of query characters relative to total field length (compact titles rank above bloated descriptions).
8. **Multi-Token Cohesion (+15 pts)**: Bonus when all tokens appear together in the primary title.
9. **Active Deliverable Boost (+6 pts)**: Uncompleted assignments, upcoming events, and active goals receive priority over completed or archived items.
10. **Secondary Tie-Breaking Order**:
    ```text
    relevanceScore DESC
    → recency DESC (created_at / updated_at / start_time)
    → title ASC (case-insensitive alphabetical)
    → type ASC
    → id ASC
    ```

---

## 5. Authorization & Data Isolation Rules

1. **Authentication Enforcement**: `req.user` must be populated via `authenticateToken` middleware. Unauthenticated requests are rejected with `401 Unauthorized`.
2. **Student Scoping**: All search database queries include `WHERE user_id = ?` binding the requesting student's ID.
3. **Cross-Student Isolation**: Student A cannot view or discover any records belonging to Student B. If a student attempts to filter by a `courseId` belonging to another student, 0 records are returned.
4. **Ownership Assertions**: In internal service layers, `assertOwnership(studentUserId, requestingUser)` verifies that `requestingUser.id === studentUserId` (or `requestingUser.role === 'admin'`), throwing `ForbiddenError` otherwise.

---

## 6. Implementation Files

| Component | File Path | Purpose |
|:---|:---|:---|
| **Repository** | `backend/repositories/studentSearchRepository.js` | Parameterized SQLite queries across 9 tables with token matching. |
| **Service** | `backend/services/studentSearchService.js` | Business logic, course pre-fetching (zero N+1), scoring, and normalization. |
| **Ranker** | `backend/services/searchRanker.js` | Scoring heuristics, token extraction, and 5-tier secondary sort. |
| **Domain Model** | `backend/models/StudentSearchResult.js` | Typed representation, factory converters, and relationship/actionable helpers. |
| **Validators** | `backend/validators/searchValidators.js` | Zod schema validation, alias normalization, and bounds enforcement. |
| **Controllers** | `backend/controllers/studentController.js` & `academicController.js` | HTTP request handling, parameter extraction, and standardized response envelopes. |
| **Routes** | `backend/routes/studentRoutes.js` & `academicRoutes.js` | Route wiring, auth middleware, and safeguard middleware. |
| **Observability** | `backend/services/searchAnalyticsService.js` | In-memory ring-buffer, latency metrics, and privacy-safe metadata tracking. |
| **Safeguards** | `backend/middleware/searchSafeguard.js` | Sliding-window velocity rate limiting and header injection. |

---

## 7. Test Suites Added & Verification

1. **API Integration Test Suite** (`backend/scripts/integration_student_search_test.js`):
   - **41 tests executed**: End-to-end verification covering auth guards, cross-domain multi-entity discovery, code searches, descriptions, calendar events, goals, notifications, reminders, partial tokens, filters, pagination, boundary validations, deterministic ordering, and abuse safeguards.
2. **Deterministic Ranking Test Suite** (`backend/scripts/verify_search_ranking.js`):
   - **9 tests executed**: Validating exact matches, prefix vs. later, field hierarchy, coverage density, identifier matches, status boosts, and invariant sort stability across 50 random shuffles.
3. **Repository & Service Test Suite** (`backend/scripts/verify_student_search.js`):
   - **14 tests executed**: Verifying contract support, multi-word matching, case normalization, zero N+1 enrichment, and student isolation.
4. **Telemetry & Observability Test Suite** (`backend/scripts/verify_search_analytics.js`):
   - **5 tests executed**: Verifying privacy guarantees (no raw query leakage), latency percentiles, sliding-window rate limiting, and validation failure tracking.
5. **Context & Insights Integration Test Suite** (`backend/scripts/integration_search_context_test.js`):
   - **9 tests executed**: Validating `StudentSearchResult` domain model, context service integration, insights service integration, and read-only database guarantees.

---

## 8. Known Limitations & Future Extension Points

1. **In-Memory Rate Limiting**: The sliding-window rate limiter currently stores hit counts in a Node.js process-memory map. For multi-instance clustered or serverless deployments, this can be swapped with a Redis-backed sliding window without modifying the middleware interface.
2. **Full-Text Search (SQLite FTS5)**: Current matching utilizes parameterized SQL `LIKE` with tokenization. For extreme dataset sizes (>100,000 records per student), an FTS5 virtual table or BM25 index can be introduced.
3. **Fuzzy Spelling Correction**: Current matching requires exact substring or prefix matches. Levenshtein distance or trigram matching can be introduced for typographical error tolerance.
4. **Search Filters Expansion**: Additional filters (e.g. date ranges `dueBefore`, `createdAfter`, tags `tag=campus`) can be surfaced through `studentSearchQuerySchema`.
