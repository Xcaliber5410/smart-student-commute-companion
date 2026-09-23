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
