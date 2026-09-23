# API Response Conventions

This document specifies the standard response format, HTTP status codes, error handling rules, and pagination structures for the Smart Student Commute Companion backend API.

---

## 1. Design Principles

1. **Uniform Envelope Structure**: All endpoints return predictable, typed JSON responses containing a top-level `success` flag (`true` or `false`) and an ISO-8601 UTC `timestamp`.
2. **Backward Compatibility**: Established entity keys (e.g. `group`, `groups`, `report`, `reports`, `feedback`, `alerts`) are preserved so client code remains unbroken.
3. **Information Security**: Internal database schemas, raw driver errors, and sensitive tokens (JWT, API keys) are sanitized in production.
4. **Standard HTTP Semantics**: Status codes reflect the true outcome of the operation (200, 201, 400, 404, 409, 500).

---

## 2. Success Responses

### Single Entity / Action (HTTP 200 OK)

Helper: `success(res, payload)`

```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "group": {
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
}
```

### Resource Creation (HTTP 201 Created)

Helper: `created(res, payload)`

```json
{
  "success": true,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "message": "Community report posted successfully",
  "report": {
    "id": "rep-1790178007833-9evp",
    "pseudonym": "Student_Rider",
    "area": "Vile Parle",
    "mode": "train",
    "message": "Track maintenance slowing down fast trains",
    "impact": "high",
    "status": "active",
    "created_at": 1790178007833,
    "expires_at": 1790181607833,
    "freshnessWeight": 1.0,
    "ageFormatted": "Just now"
  }
}
```

### Collection with Pagination (HTTP 200 OK)

Helper: `paginated(res, { dataKey, data, pagination, ...extra })`

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

---

## 3. Error Responses

All error responses are managed centrally by `backend/middleware/errorHandler.js`.
Errors produce a consistent format:

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "timestamp": "2026-09-23T15:40:00.000Z",
  "details": {
    "max_members": {
      "_errors": [
        "Maximum group capacity is 6"
      ]
    }
  }
}
```

### Common HTTP Status Codes

| Status Code | Code Constant | Scenario |
|:---|:---|:---|
| **400 Bad Request** | `VALIDATION_ERROR`, `INVALID_JSON`, `BAD_REQUEST` | Payload syntax error, failed schema validation, business capacity violation |
| **401 Unauthorized** | `UNAUTHORIZED` | Missing or invalid authentication token |
| **403 Forbidden** | `FORBIDDEN` | Valid caller lacks permission to modify/delete target entity |
| **404 Not Found** | `NOT_FOUND` | Record does not exist or API path is unmatched |
| **409 Conflict** | `CONFLICT` | Unique key or duplicate record violation |
| **500 Internal Server Error** | `INTERNAL_SERVER_ERROR` | Unexpected runtime error (sanitized in production) |

---

## 4. Production vs Development Error Sanitization

- **Development (`NODE_ENV !== 'production'`)**: Includes full stack trace (`stack`) and detailed operational causes for rapid debugging.
- **Production (`NODE_ENV === 'production'`)**:
  - If error is non-operational or unexpected (500), internal message is masked:
    `"An unexpected error occurred. Please try again later."`
  - Stack traces are stripped from the response body.
  - Server-side logs safely record diagnostic details while redacting sensitive HTTP headers (`Authorization`, `x-user-token`, `Cookie`).
