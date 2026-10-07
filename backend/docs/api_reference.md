# API Reference — Smart Student Commute Companion

This document provides complete documentation for the backend HTTP REST API, covering all 23 available endpoints, required request structures, schema validations, pagination/filtering parameters, and standardized response conventions.

---

## Base URLs

- **API Base**: `/api` (e.g. `http://localhost:5000/api`)
- **Root Health Check**: `/health` (`http://localhost:5000/health`)

---

## Response Envelope Conventions

### Success Structure

```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "...": "data"
}
```

### Paginated Collection Structure

```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "groups": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error Structure

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "details": { ... }
}
```

---

## 1. System & Health

### `GET /health` & `GET /api/health`
Lightweight health check endpoint for container probes and monitoring.

- **Authentication**: None
- **Response**:
```json
{
  "status": "healthy",
  "service": "Smart Student Commute Companion API",
  "city": "Mumbai",
  "uptimeSeconds": 142.5,
  "timestamp": "2026-09-23T15:40:00.000Z"
}
```

---

## 2. Travel Together (Ride Groups)

### `GET /api/ride-groups`
Retrieves a paginated list of student commute groups.

- **Query Parameters**:
  - `page` *(optional, integer >= 1, default 1)*
  - `limit` *(optional, integer 1–50, default 20)*
  - `mode` *(optional, string, e.g. "auto", "train")*
  - `origin` *(optional, string, case-insensitive substring)*
  - `destination` *(optional, string, case-insensitive substring)*
  - `status` *(optional, "open" | "full" | "departed" | "cancelled")*
- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "groups": [
    {
      "id": "grp-1790178007822-2dvf",
      "creator_pseudonym": "StudentRider",
      "origin_area": "Andheri West",
      "destination_college": "DJSCE",
      "departure_time": "08:30 AM",
      "mode": "auto",
      "max_members": 3,
      "current_members": 1,
      "notes": "Meeting at metro station gate 1",
      "created_at": 1790178007822
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### `GET /api/ride-groups/:id`
Retrieves a single ride group by ID.

- **Path Parameters**: `id` *(string)*
- **Response (200 OK)**: `{ "success": true, "timestamp": "...", "group": { ... } }`
- **Error (404 Not Found)**: When group does not exist.

### `POST /api/ride-groups`
Creates a new carpool / auto-share travel group.

- **Request Body**:
```json
{
  "creator_pseudonym": "Student_Lead",
  "origin_area": "Borivali",
  "destination_college": "DJSCE",
  "departure_time": "08:15 AM",
  "mode": "auto",
  "max_members": 3,
  "notes": "Splitting fare equally"
}
```
- **Validation**:
  - `creator_pseudonym`: 2–50 characters
  - `max_members`: integer between 2 and 6 (default 3)
- **Response (201 Created)**:
```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "group": { "id": "grp-...", "current_members": 1, ... }
}
```

### `PATCH /api/ride-groups/:id`
Updates departure time, notes, capacity, or status.

- **Request Body**:
```json
{
  "departure_time": "08:30 AM",
  "notes": "Updated: Meet near platform 1 staircase",
  "max_members": 4
}
```
- **Constraints**: `max_members` cannot be reduced below `current_members`.
- **Response (200 OK)**: `{ "success": true, "timestamp": "...", "group": { ... } }`

### `DELETE /api/ride-groups/:id`
Deletes / disbands an existing ride group.

- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "message": "Ride group deleted successfully",
  "id": "grp-..."
}
```

### `POST /api/ride-groups/:id/join`
Increments group membership up to `max_members`.

- **Response (200 OK)**: `{ "success": true, "message": "Joined commute group successfully!", "group": { ... } }`
- **Error (400 Bad Request)**: `{ "code": "GROUP_FULL", "message": "This group is already full" }`

---

## 3. Live Commute Reports & Transit Alerts

### `GET /api/live-reports`
Retrieves live community disruption reports with computed freshness decay.

- **Query Parameters**:
  - `page` *(optional, integer >= 1, default 1)*
  - `limit` *(optional, integer 1–50, default 20)*
  - `mode` *(optional: 'train', 'metro', 'bus', 'auto', 'walk')*
  - `area` *(optional, string)*
  - `impact` *(optional: 'low', 'medium', 'high')*
  - `status` *(optional: 'active', 'expired', 'resolved', 'all', default 'active')*
- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "count": 1,
  "reports": [
    {
      "id": "rep-...",
      "pseudonym": "Student_Rider",
      "area": "Vile Parle",
      "mode": "train",
      "message": "Signal delay",
      "impact": "high",
      "status": "active",
      "freshnessWeight": 0.85,
      "ageMinutes": 12,
      "ageFormatted": "12m ago",
      "confirmation_count": 3,
      "contradiction_count": 0
    }
  ],
  "pagination": { ... }
}
```

### `GET /api/live-reports/:id`
Retrieves a single disruption report by ID.

### `POST /api/live-reports` (and `POST /api/reports`)
Submits a new crowdsourced transit disruption report.

- **Request Body**:
```json
{
  "pseudonym": "DailyCommuter",
  "area": "Bandra",
  "route_name": "Western Line",
  "mode": "train",
  "message": "Waterlogging near tracks causing slow movement",
  "impact": "high",
  "durationObservedMinutes": 60
}
```
- **Response (201 Created)**: Returns report with `freshnessWeight: 1.0` and broadcasts to Socket.IO clients.

### `PATCH /api/live-reports/:id`
Updates status ('active', 'resolved', 'expired'), message, or impact.

### `DELETE /api/live-reports/:id`
Deletes a disruption report and associated vote confirmations.

### `GET /api/alerts`
Retrieves active disruption reports formatted into high-priority alerts.

### `POST /api/live-reports/:id/confirm`
Records a "Still happening" confirmation vote.
- **Headers**: `x-user-token` *(optional, prevents duplicate votes per student)*

### `POST /api/live-reports/:id/contradict`
Records a "Cleared up" contradiction vote. Auto-expires report when contradictions exceed confirmations by >= 3.

---

## 4. Student Route Feedback

### `GET /api/feedback`
Retrieves feedback entries and aggregated rating metrics.

- **Query Parameters**:
  - `page` *(optional, default 1)*
  - `limit` *(optional, default 20)*
  - `recommendation_id` *(optional, string filter)*
  - `is_useful` *(optional, boolean string 'true' | 'false')*
- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "summary": {
    "total": 10,
    "helpful": 8,
    "notHelpful": 2,
    "helpfulPercentage": 80
  },
  "feedback": [ ... ],
  "pagination": { ... }
}
```

### `POST /api/feedback`
Submits student route rating.

- **Request Body**:
```json
{
  "recommendation_id": "rec-101",
  "is_useful": true,
  "tags": ["fast", "accurate", "low-cost"],
  "comment": "Helped me avoid train delay at Dadar"
}
```
- **Response (201 Created)**: `{ "success": true, "timestamp": "...", "message": "Thank you for your student feedback!" }`

### `PATCH /api/feedback/:id`
Updates feedback rating, tags, or comments.

### `DELETE /api/feedback/:id`
Deletes a feedback entry by ID.

---

## 5. Transit Search & Commute Plan

### `GET /api/transit/search`
Searches Mumbai railway, metro, and transit corridors.
- **Query**: `query` *(min 2 chars)*

### `POST /api/plan`
Generates multimodal student commute recommendations.
- **Request Body**: `{ "origin": "Borivali", "destination": "DJSCE", ... }`

### `POST /api/demo/reset`
Resets the demo database to initial sample dataset.

---

## 6. Unified Student Search

### `GET /api/student/search` & `GET /api/academic/search`
Performs unified, deterministic, relevance-ranked cross-domain search across all 9 student-scoped entities:
- **Academic**: Courses (`course`), Assignments / Tasks (`assignment`), Goals (`goal`)
- **Planning**: Calendar Events (`calendar_event`), Study Sessions (`study_session`)
- **Student & Commute**: Recurring Commute Schedules (`schedule`), Saved Route Bookmarks (`saved_route`)
- **Alerts & Reminders**: Notifications (`notification`), System Reminders (`reminder`)

All results are strictly scoped to the authenticated student (`req.user.id`). Foreign student data is isolated with zero leakage.

- **Authentication**: Required (`Authorization: Bearer <token>`)
- **Query Parameters**:
  - `q` or `query` *(optional, string, max 200 chars)*: Freeform search query. Empty query returns clean zeroed response.
  - `types` *(optional, comma-separated string)*: Filter by entity type aliases. Supported types: `course`, `assignment` (`task`, `tasks`), `calendar_event` (`event`, `events`), `study_session` (`study`, `session`), `goal` (`goals`), `saved_route` (`routes`), `schedule` (`schedules`), `notification` (`notifications`), `reminder` (`reminders`).
  - `limit` *(optional, integer 1–100, default 20)*: Maximum number of ranked results returned.
  - `offset` *(optional, integer >= 0, default 0)*: Zero-based result offset for pagination.
  - `courseId` *(optional, string)*: Filter results associated with a specific student course.
  - `status` *(optional, string)*: Filter results by status (e.g. `pending`, `completed`, `active`).
- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-10-02T11:45:00.000Z",
  "query": "distributed",
  "total": 3,
  "limit": 20,
  "offset": 0,
  "types": ["course", "assignment", "calendar_event", "study_session", "goal", "saved_route", "schedule", "notification", "reminder"],
  "results": [
    {
      "id": "crs-101",
      "type": "course",
      "title": "Distributed Systems",
      "subtitle": "CS401",
      "snippet": "Advanced distributed algorithms and consensus protocols",
      "status": "active",
      "relevanceScore": 100,
      "metadata": {
        "courseCode": "CS401",
        "department": "Computer Engineering",
        "semester": 7
      }
    }
  ],
  "countsByType": {
    "course": 1,
    "assignment": 1,
    "calendar_event": 0,
    "study_session": 1,
    "goal": 0,
    "saved_route": 0,
    "schedule": 0,
    "notification": 0,
    "reminder": 0
  },
  "executionDurationMs": 4.12,
  "pagination": {
    "total": 3,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```
- **Response Headers**:
  - `X-SearchRateLimit-Limit`: Maximum requests per window (default 60).
  - `X-SearchRateLimit-Remaining`: Remaining request quota.
  - `X-SearchRateLimit-Reset`: Unix timestamp when quota resets.
- **Error Responses**:
  - `401 Unauthorized`: Missing or invalid Bearer token.
  - `400 Bad Request / Validation Error`: Invalid entity type, query exceeding 200 characters, limit < 1 or > 100, or offset < 0 or > 1000.
  - `429 Too Many Requests`: Velocity rate limit exceeded (includes `Retry-After` header).

*For full architecture, ranking heuristics, and entity mappings, see [unified_search.md](file:///c:/DJ%20Sanghvi%20College/Projects/smart-student-commute-companion/backend/docs/unified_search.md).*

---

## 11. Student Study Resources (Day 12)

Authenticated endpoints for student-owned study materials (notes, references, links, documents, and lightweight study resources). Supports relational bindings to courses, assignments, goals, and study sessions with student ownership isolation.

### `GET /api/student/resources` (or `/api/academic/resources`)
Lists authenticated student's study resources with multi-attribute filtering, search, and pagination.

- **Auth**: `Bearer <token>`
- **Query Parameters**:
  - `page` *(optional, integer >= 1, default: 1)*
  - `limit` *(optional, integer 1..50, default: 20)*
  - `resource_type` / `type` *(optional, enum: `'note'`, `'link'`, `'reference'`, `'document'`, `'other'`)*
  - `course_id` *(optional, string ID)*: Filter by associated course
  - `assignment_id` *(optional, string ID)*: Filter by associated assignment
  - `goal_id` *(optional, string ID)*: Filter by associated goal
  - `study_session_id` *(optional, string ID)*: Filter by associated study session
  - `tag` *(optional, string)*: Filter by tag
  - `q` / `searchTerm` *(optional, string)*: Search title, description, content, tags, url, or file_name
  - `is_favorite` *(optional, boolean or 0/1)*: Filter by favorite status
  - `archived` *(optional, boolean or 0/1)*: Filter by archive status
  - `sort` *(optional, `'created_at'` | `'updated_at'` | `'title'`, default: `'created_at'`)*
  - `order` *(optional, `'asc'` | `'desc'`, default: `'desc'`)*
- **Response**: `200 OK`
```json
{
  "success": true,
  "timestamp": "2026-10-03T10:00:00.000Z",
  "resources": [
    {
      "id": "res-101",
      "user_id": "usr-1",
      "course_id": "crs-101",
      "assignment_id": "asgn-101",
      "goal_id": "goal-101",
      "study_session_id": "sess-101",
      "title": "Raft Consensus Protocol Notes",
      "description": "Summary of paper",
      "resource_type": "note",
      "url": "https://raft.github.io/",
      "content": "# Notes...",
      "tags": ["raft", "consensus"],
      "is_favorite": 1,
      "archived": 0,
      "created_at": 1727950000000,
      "updated_at": 1727950000000
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `POST /api/student/resources` (or `/api/academic/resources`)
Creates a new study resource for the authenticated student.

- **Auth**: `Bearer <token>`
- **Body**:
  - `title` *(required, string 1..200 chars)*
  - `resource_type` *(optional, enum: `'note'`, `'link'`, `'reference'`, `'document'`, `'other'`, default: `'note'`)*
  - `description` *(optional, string <= 1000 chars)*
  - `content` *(optional, string <= 50000 chars)*
  - `url` *(optional, valid URL string <= 1000 chars)*
  - `file_name` *(optional, string <= 255 chars)*
  - `file_size` *(optional, non-negative integer)*
  - `mime_type` *(optional, string <= 100 chars)*
  - `tags` *(optional, array of strings or comma-separated string)*
  - `is_favorite` *(optional, boolean or 0/1, default: 0)*
  - `course_id` *(optional, string ID)*: Must belong to authenticated student
  - `assignment_id` *(optional, string ID)*: Must belong to authenticated student
  - `goal_id` *(optional, string ID)*: Must belong to authenticated student
  - `study_session_id` *(optional, string ID)*: Must belong to authenticated student
- **Response**: `201 Created`

### `GET /api/student/resources/:id` (or `/api/academic/resources/:id`)
Retrieves an individual study resource with student ownership verification.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK`

### `PATCH /api/student/resources/:id` (or `/api/academic/resources/:id`)
Partially updates fields of an existing study resource.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK`

### `PUT /api/student/resources/:id` (or `/api/academic/resources/:id`)
Replaces or updates fields of an existing study resource.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK`

### `DELETE /api/student/resources/:id` (or `/api/academic/resources/:id`)
Deletes a study resource. Does not delete or alter associated courses, assignments, goals, or study sessions.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK` with `{ "success": true, "message": "Study resource deleted successfully", "id": "..." }`

### `POST /api/student/resources/:id/archive` (or `/api/academic/resources/:id/archive`)
Archives or unarchives a study resource.

- **Auth**: `Bearer <token>`
- **Body**: `{ "archived": boolean }` *(optional, defaults to true)*
- **Response**: `200 OK`

### `POST /api/student/resources/:id/favorite` (or `/api/academic/resources/:id/favorite`)
Toggles favorite status between 0 and 1.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK`

### `GET /api/student/resources/context` (or `/api/academic/resources/context`)
Retrieves contextual study resources deterministically tailored to a student's current academic work (course, assignment, goal, study session, or recent workload).

- **Auth**: `Bearer <token>`
- **Query Parameters**:
  - `courseId` (or `course_id`): Course ID to retrieve course and deliverable materials
  - `assignmentId` (or `assignment_id`): Assignment ID to retrieve direct, parent course, and goal materials
  - `goalId` (or `goal_id`): Goal ID to retrieve direct, course, and child task/session materials
  - `studySessionId` (or `study_session_id`): Study Session ID to retrieve direct, course, goal, and task materials
  - `recent`: `boolean` (defaults to active & recent workload if no specific ID provided)
  - `resourceType`: filter by type (`note`, `reference`, `document`, `link`, `other`)
  - `limit`: `1-50` (default: 20)
- **Response**: `200 OK` with contextual payload, summaries, direct resources, and deterministically ranked unified resources.

---

## 12. Student Study Plans & Work Scheduling

### `POST /api/student/study-plans/generate` (or `POST /api/student/study-plans`)
Deterministically generates a practical, conflict-free study sprint based on actual upcoming assignment deadlines, priorities, active goals, and calendar availability. Prevents duplicate planned items.

- **Auth**: `Bearer <token>`
- **Body**:
  ```json
  {
    "title": "Midterm Prep Sprint",
    "description": "Deterministic study schedule for upcoming assignments and goals",
    "days": 7,
    "startDate": 1791100000000,
    "endDate": 1791704800000,
    "dailyLimitMinutes": 240,
    "defaultSessionDuration": 60,
    "includeAssignments": true,
    "includeGoals": true,
    "courseId": "crs-123",
    "replaceExisting": true
  }
  ```
- **Response**: `201 Created` with `{ "success": true, "plan": { ... }, "items": [ ... ], "summary": { ... }, "warnings": [ ... ] }`

### `POST /api/student/study-plans/recalculate` (or `POST /api/student/study-plans/:id/recalculate`)
Recalculates a study plan to adjust to updated assignment deadlines, completed work, and goal progress without creating duplicate planned items.

- **Auth**: `Bearer <token>`
- **Body**: `{ "planId": "...", "dailyLimitMinutes": 240, "defaultSessionDuration": 60 }`
- **Response**: `200 OK` with recalculated plan, updated items, and summary.

### `GET /api/student/study-plans/current`
Retrieves the student's active upcoming study plan, planned study items, and progress summary.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK` with `{ "success": true, "plan": { ... }, "items": [ ... ], "summary": { "progressPercentage": 45, ... } }`

### `GET /api/student/study-plans`
Retrieves paginated study plans for the authenticated student.

- **Auth**: `Bearer <token>`
- **Query Parameters**: `page` (default 1), `limit` (default 20, max 50), `status` (`active`, `completed`, `archived`), `startDate`, `endDate`.
- **Response**: `200 OK` with paginated plans array.

### `GET /api/student/study-plans/:id`
Retrieves details of a specific study plan and its child planned work items.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK` with `{ "success": true, "plan": { ... }, "items": [ ... ], "summary": { ... } }`

### `PATCH /api/student/study-plans/:id`
Updates study plan title, description, or status.

- **Auth**: `Bearer <token>`
- **Body**: `{ "title": "...", "description": "...", "status": "active|completed|archived" }`
- **Response**: `200 OK`

### `DELETE /api/student/study-plans/:id`
Deletes a study plan and all associated planned study work items.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK` with `{ "success": true, "message": "Study plan deleted successfully" }`

### `GET /api/student/study-plans/items`
Retrieves planned study work items with date, date-range, and deliverable filters.

- **Auth**: `Bearer <token>`
- **Query Parameters**:
  - `date`: `YYYY-MM-DD` (Asia/Kolkata date filter)
  - `startDate`, `endDate`: epoch timestamp range
  - `status`: `planned`, `in_progress`, `completed`, `skipped`
  - `priority`: `urgent`, `high`, `medium`, `low`
  - `planId`, `courseId`, `assignmentId`, `goalId`
  - `page`, `limit`
- **Response**: `200 OK` with paginated items.

### `GET /api/student/study-plans/items/:id`
Retrieves a specific planned study work item by ID.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK` with `{ "success": true, "item": { ... } }`

### `PATCH /api/student/study-plans/items/:id`
Updates planned work item details or reschedules its target date with deterministic conflict and deadline validation.

- **Auth**: `Bearer <token>`
- **Body**: `{ "plannedDate": 1791200000000, "durationMinutes": 60, "priority": "high", "title": "..." }`
- **Response**: `200 OK`

### `PATCH /api/student/study-plans/items/:id/status`
Updates item completion status (`planned`, `in_progress`, `completed`, `skipped`). Automatically sets `completed_at` on completion.

- **Auth**: `Bearer <token>`
- **Body**: `{ "status": "completed" }`
- **Response**: `200 OK`

### `DELETE /api/student/study-plans/items/:id`
Removes / cancels an individual planned study work item.

- **Auth**: `Bearer <token>`
- **Response**: `200 OK` with `{ "success": true, "message": "Study plan item removed successfully" }`

---

## 9. Commute Candidate Route Planning (Day 15 & Day 16 Context Engine)

### `POST /api/commute/candidates` and `POST /api/student/commute/candidates`
Generates feasible, multimodal candidate commute journeys connecting a student's coarse starting area to their college destination, evaluated against real-time and environmental commute context (transit disruptions, road traffic, weather conditions, and service availability).

> **Note**: This endpoint exposes **feasible candidate journeys and their contextual impacts**; it clearly distinguishes baseline travel estimates from contextual changes and reports route feasibility without declaring a "recommended" or ranked route.

#### Security & Privacy
- **Auth**: `Bearer <token>` (Student authentication required)
- **Privacy Enforcement**: Rejects granular street addresses, house/flat numbers, housing societies, PIN codes, and GPS telemetry with `400 VALIDATION_ERROR`.
- **Student Ownership & Scope**: If `startingArea` is omitted in the request, the student's saved `default_origin_area` is automatically resolved from profile preferences. Request parameters override profile defaults.

#### Request Body
```json
{
  "startingArea": "Lokhandwala Complex",
  "collegeDestination": "D.J. Sanghvi College of Engineering",
  "desiredDepartureTime": "08:00",
  "desiredArrivalTime": "08:50",
  "preferredModes": ["metro", "bus", "walk"],
  "allowedModes": ["metro", "bus", "walk"],
  "avoidModes": ["auto"],
  "maxTransfers": 2,
  "maxWalkingMinutes": 20,
  "maxBudgetRupees": 60,
  "limit": 5,
  "date": "Mon",
  "dayOfWeek": "Mon"
}
```

Optional context simulation overrides (used for testing or dynamic scenarios):
- `disruptions`: Array of active transit disruption objects.
- `trafficConditions`: Array of road traffic condition objects.
- `weatherContext`: Weather context or condition object (`clear`, `rain`, `heavy_rain`, `severe`, `extreme_heat`).
- `availabilityRecords`: Array of transport availability status records.

#### Response: `200 OK`
```json
{
  "success": true,
  "timestamp": "2026-10-07T17:15:00.000Z",
  "candidateCount": 2,
  "feasibleCandidateCount": 2,
  "infeasibleCandidateCount": 0,
  "candidates": [
    {
      "id": "cand-graph-1728238500-0",
      "origin": "Lokhandwala Complex",
      "destination": "D.J. Sanghvi College of Engineering",
      "departureTime": "08:00",
      "estimatedArrivalTime": "08:35",
      "totalDurationMinutes": 35,
      "estimatedTravelTimeMinutes": 35,
      "baselineTravel": {
        "durationMinutes": 35,
        "estimatedArrivalTime": "08:35",
        "departureTime": "08:00",
        "waitingTimeMinutes": 6,
        "walkingTimeMinutes": 10,
        "transitTimeMinutes": 19,
        "transferCount": 1,
        "estimatedCostRupees": 30,
        "totalDistanceKm": 4.5
      },
      "contextualImpact": {
        "isFeasible": true,
        "feasibilityReason": "OPERATIONAL",
        "reasonCodes": ["CLEAN_JOURNEY"],
        "totalAdditionalDelayMinutes": 0,
        "disruptionDelayMinutes": 0,
        "trafficDelayMinutes": 0,
        "weatherDelayMinutes": 0,
        "availabilityDelayMinutes": 0,
        "originalDurationMinutes": 35,
        "updatedDurationMinutes": 35,
        "updatedArrivalTime": "08:35",
        "reliabilityIndicator": "LOW",
        "uncertaintyLevel": "LOW",
        "dominantTransportStatus": "AVAILABLE",
        "affectedSegments": [],
        "unavailableSegments": [],
        "advisories": [
          "Normal commute conditions — no active disruptions, road traffic, or adverse weather."
        ],
        "dataTiers": ["ESTIMATED"],
        "provenance": {
          "sourceTier": "ESTIMATED",
          "provider": "Commute Context Engine"
        }
      },
      "isFeasible": true,
      "isViable": true,
      "feasibilityReason": "OPERATIONAL",
      "reasonCodes": ["CLEAN_JOURNEY"],
      "additionalDisruptionDelayMinutes": 0,
      "totalAdditionalDelayMinutes": 0,
      "affectedSegments": [],
      "unavailableSegments": [],
      "trafficImpact": {
        "level": "normal",
        "addedTravelTimeMinutes": 0
      },
      "weatherImpact": {
        "condition": "clear",
        "totalAddedTravelTimeMinutes": 0
      },
      "transportAvailability": {
        "status": "AVAILABLE",
        "isUsable": true,
        "totalDelayMinutes": 0
      },
      "totalWaitingTimeMinutes": 6,
      "walkingTimeMinutes": 10,
      "transitTimeMinutes": 19,
      "transferCount": 1,
      "estimatedCostRupees": 30,
      "totalDistanceKm": 4.5,
      "primaryMode": "metro",
      "modesIncluded": ["metro", "bus", "walk"],
      "advisories": [],
      "provenance": {
        "tier": "ESTIMATED",
        "source": "Candidate Route Generation Engine",
        "description": "Deterministic timetable propagation with real-time context integration"
      },
      "limitations": "Timetable baseline with real-time and environmental context adjustments. Does NOT constitute a final recommendation or ranked choice.",
      "segments": [
        {
          "segmentIndex": 0,
          "type": "TRANSIT",
          "mode": "metro",
          "from": "Lokhandwala",
          "to": "DN Nagar",
          "departureTime": "08:02",
          "arrivalTime": "08:12",
          "durationMinutes": 10,
          "waitingTimeMinutes": 2,
          "distanceKm": 2.5,
          "fareRupees": 20,
          "lineIdentifier": "Line 2A",
          "status": "ACTIVE",
          "isAffected": false,
          "isUsable": true,
          "contextDelayMinutes": 0,
          "contextReasons": [],
          "provenance": {
            "tier": "ESTIMATED",
            "source": "Journey Segment Engine"
          }
        }
      ]
    }
  ],
  "queryContext": {
    "studentId": "usr-12345",
    "startingArea": "Lokhandwala Complex",
    "collegeDestination": "D.J. Sanghvi College of Engineering",
    "departureTime": "08:00",
    "targetArrivalTime": null,
    "appliedConstraints": {
      "maxTransfers": 2,
      "maxWalkingMinutes": 20,
      "maxBudgetRupees": 60
    },
    "appliedPreferences": {
      "allowedModes": ["metro", "bus", "walk"],
      "avoidModes": ["auto"],
      "preferredModes": ["metro", "bus", "walk"]
    }
  },
  "contextSummary": {
    "weatherCondition": "clear",
    "trafficLevel": "normal",
    "dominantTransportStatus": "AVAILABLE",
    "activeDisruptionsCount": 0,
    "hasInfeasibleCandidates": false
  },
  "provenanceMetadata": {
    "dataTiers": ["VERIFIED", "ESTIMATED"],
    "hasEstimatedData": true,
    "hasUserReportedData": false,
    "hasVerifiedData": true,
    "hasSyntheticData": false,
    "limitations": "Timetable estimates with real-time/forecasted environmental and transport context. Does NOT declare a recommended or chosen route."
  }
}
```





