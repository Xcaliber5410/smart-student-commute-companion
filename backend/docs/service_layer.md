# Backend Service Layer Architecture & Guidelines

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 3 of 21-Day Development Roadmap  
**Scope:** Reusable Business Logic Layer (`/backend/services`)

---

## 1. Architectural Role of the Service Layer

The service layer sits between the **HTTP Controller Layer** and the **Repository/Data-Access Layer**:

```
HTTP Request
     │
     ▼
[Route Layer] (`backend/routes/`)
     │ (Method, URL, route-level middleware)
     ▼
[Controller Layer] (`backend/controllers/`)
     │ (Extract params, schema validation, HTTP response status, WebSocket emit)
     ▼
[Service Layer] (`backend/services/`)
     │ (Domain rules, business constraints, multi-step orchestration, decay/score logic)
     ▼
[Repository Layer] (`backend/repositories/`)
     │ (Parameterized queries, transactions, hydration of domain models)
     ▼
[Database Engine] (SQLite WAL Singleton via `backend/db/connection.js`)
```

### Core Design Principles
1. **Decoupling from Transport Protocol**:
   - Service functions must **never** take Express `req` or `res` objects.
   - Services accept plain JavaScript objects or primitives and return domain entities or plain data objects.
   - Any service method can be invoked equally by HTTP route handlers, WebSocket event listeners, background crons, or test suites.
2. **Business Invariant Enforcement**:
   - Validation of domain rules (e.g., maximum ride group capacity, expiration times, auto-expiry thresholds) belongs in the service layer or domain models, not in controllers.
3. **Repository Reuse**:
   - Services interact with the database exclusively through dedicated repository instances (`RideGroupRepository`, `ReportRepository`, etc.), keeping raw SQL completely out of business logic.
4. **Clean Error Propagation**:
   - Services throw operational `AppError` subclasses (`NotFoundError`, `BadRequestError`, `ConflictError`), which bubble up to the centralized `errorHandler` middleware.

---

## 2. Implemented Services Catalog

### A. `RideGroupService` (`backend/services/rideGroupService.js`)
* **`listRideGroups(limit)`**: Retrieves recent student carpooling groups.
* **`getRideGroupById(id)`**: Fetches group by ID or throws `NotFoundError`.
* **`createRideGroup(groupData)`**: Persists new commute coordination group with default member count.
* **`joinRideGroup(id)`**: Adds student to group, throwing `BadRequestError('This group is already full', 'GROUP_FULL')` if maximum capacity is exceeded.

### B. `ReportService` (`backend/services/reportService.js`)
* **`getLiveReports()`**: Queries active disruption reports filtered by 120-minute freshness decay.
* **`getAlerts()`**: Formats active disruptions into student transit alerts.
* **`createReport(reportData)`**: Calculates duration, expiration, and initial freshness metadata.
* **`confirmReport(id, userToken)`**: Handles "Still happening" confirmation votes with duplicate voter protection.
* **`contradictReport(id, userToken)`**: Handles "No longer happening" votes and triggers auto-expiration when contradictions exceed confirmations by 3.

### C. `FeedbackService` (`backend/services/feedbackService.js`)
* **`submitFeedback(input)`**: Records thumbs-up/down ratings, tags, and comments.
* **`getFeedbackSummary(recommendationId)`**: Aggregates helpful percentage and feedback counts.
* **`getFeedbackForRecommendation(recommendationId)`**: Lists feedback entries for a specific route recommendation.

### D. Centralized Registry (`backend/services/index.js`)
Single import point for all backend services:
```javascript
const { rideGroupService, reportService, feedbackService } = require('../services');
```

---

## 3. Guidelines for Adding Future Services

When implementing new domain features in subsequent roadmap days:
1. Create `<feature>Service.js` in `backend/services/` encapsulating the business rules.
2. Inject or instantiate the corresponding repository from `backend/repositories/`.
3. Export both the class (for unit testing/mocking) and a default singleton instance.
4. Re-export the service in `backend/services/index.js`.
5. Keep controllers lean: validate input with Zod, call the service, send HTTP response.
