# Day 14 — Commute Problem Statement Backend Audit & Architectural Reset (Skan)

> Verified from the Day-14 codebase inspection, smoke tests, and route audits.  
> Date: 2026-10-05  
> Role: Backend Engineer (Skan)

---

## 1. Objective

Perform a comprehensive **backend-only audit against the original confirmed Problem Statement (P9 — Smart Student Commute Companion)**. 

Map the existing backend codebase into:
1. Reusable infrastructure (auth, db, repositories, services, validation, errors, notifications, scheduling).
2. Existing academic/productivity functionality that can serve as supporting/contextual functionality.
3. Missing or incomplete commute functionality (preferences, modes, route representations, segments, timetable data, travel estimates, disruptions, traffic, weather, availability, candidates, scoring, explanations, alerts, shared travel, feedback, provenance).
4. Potentially redundant functionality to be preserved and decoupled.

---

## 2. Problem Statement Alignment

**Confirmed PS**: `P9 — Smart Student Commute Companion`
- **Core Requirements**: Multimodal commute assistant accepting starting area (not home address), destination college, preferred transport modes, arrival time, and constraints; analyzes disruptions; recommends alternative routes, departure windows, mode combinations, shared travel options, alerts, grounded explanations, and feedback.
- **Privacy Requirements**: Strictly avoid storing precise location history, home addresses, identity details, or continuous tracking data.
- **Provenance Requirements**: Distinguish verified, user-reported, estimated, and synthetic information.

---

## 3. Key Audit Findings

### A. Reusable Infrastructure (100% Retained & Ready)
- **Authentication & Authorization**: `authService.js`, `authMiddleware.js`, `User.js`, `UserRepository.js`. Dual-mode: anonymous-friendly (no forced login wall for commute queries) with voluntary authenticated session profiles.
- **Database & Persistence**: SQLite connection factory supporting both `better-sqlite3` and Node.js 22 `node:sqlite` with re-entrant transactions. 10 migrations cleanly applied.
- **Repositories & Services**: 20 repositories with prepared statements and 37 decoupled services.
- **Validation & Errors**: Zod schema validation across all inputs; comprehensive `AppError` operational hierarchy.
- **Real-time & Notifications**: Socket.IO real-time event broadcasting (`live_report_created`), in-app notifications with read/unread tracking, and deduplicated reminder scheduling.

### B. Supporting Academic Context (Zero Deletions)
- **Calendar & Lecture Schedule** (`calendar_events`): Directly serves as the **automated commute arrival/departure trigger**. A student's first lecture defines the target arrival time at college; the last lecture defines the departure window for the return trip.
- **Student Schedules** (`student_schedules`): Automates recurring daily commute routines by day-of-week.
- **Saved Routes** (`saved_routes`): Bookmarks frequent transit corridors for quick retrieval and disruption monitoring.
- **Assignments & Deadlines** (`assignments`): Serves as a **commute urgency multiplier**, elevating route reliability weighting on critical deadline or exam days.
- **Decoupled Academic Modules**: Course curriculum, study resources, study plans, and academic goals are safely retained without deletion and remain decoupled from core routing.

### C. Commute Gaps Identified for Implementation
1. **Data Provenance**: Formalize the 4-tier provenance classification across all route attributes (`VERIFIED`, `USER_REPORTED`, `ESTIMATED`, `SYNTHETIC`).
2. **Departure Windows**: Enhance route recommendations to output explicit time windows (e.g., "Depart between 08:15 and 08:25").
3. **Route & Leg Domain Models**: Formalize transient route objects into typed, validated models.
4. **Traffic & Peak Curves**: Implement deterministic time-of-day peak congestion curves for road legs.
5. **Shared Travel Integration**: Wire active `RideGroup` recommendations into route calculation outputs.
6. **Feedback Loop**: Feed post-commute accuracy and crowdedness ratings back into scoring reliability weights.
7. **Monsoon Hotspots**: Map known Mumbai waterlogging locations (Milan Subway, Hindmata, Kurla) to route geometries during rain.

---

## 4. Verification & Testing

- `npm test`: Smoke tests executed and verified (5 passed, 0 failed).
- `npm run verify:routes`: Centralized route registration test verified across all 162 endpoints (4 passed, 0 failed).
- Full audit document created at: [`docs/project-context/COMMUTE_BACKEND_AUDIT.md`](file:///c:/DJ%20Sanghvi%20College/Projects/smart-student-commute-companion/docs/project-context/COMMUTE_BACKEND_AUDIT.md).
