# Day 13 — Student Study Planning System (Backend — Skan)

> Comprehensive End-to-End Verification and System Architecture Reference  
> Date: 2026-10-04  
> Role: Backend Engineer (Skan)

---

## 1. Executive Summary & Capabilities

The **Student Study Planning System** provides deterministic, personalized, conflict-free study schedule generation and progress tracking for students. It synthesizes an individual student's pending academic deadlines, active milestone goals, calendar lecture schedule, independent study sessions, and contextual study resources into an actionable study roadmap.

### Key Capabilities
- **Automated, Deterministic Schedule Generation**: Eliminates student decision fatigue by transforming deadlines and goals into concrete, calendar-aware study work items without non-deterministic AI halluncinations.
- **Relational Deliverable Association**: Every planned study item binds directly to underlying academic entities (`course_id`, `assignment_id`, `goal_id`, `study_session_id`, `resource_id`).
- **Contextual Study Resource Injection**: Automatically links relevant course materials (notes, reference guides, documents) to planned items.
- **Dynamic Plan Recalculation**: Adjusts forward schedules when deadlines shift or progress occurs, preserving previously completed work without duplicating sessions or double-booking time slots.
- **Comprehensive Academic Insights**: Computes completion velocity, identifies overdue items, detects missed sessions, flags urgent assignments lacking preparation, and highlights upcoming workload crunches.
- **Idempotent Reminders & Spam Suppression**: Dispatches timely alerts for upcoming/overdue study sessions and urgent deadline preparation deficits, with strict throttling to prevent duplicate notifications.

---

## 2. Planning Rules & Deterministic Architecture

The planning engine operates strictly on deterministic heuristics anchored in Indian Standard Time (`Asia/Kolkata` / UTC+05:30):

### A. Temporal Boundaries & Working Hours
- **Planning Window**: Configurable (default: 7 days forward from `now`).
- **Daily Time Frame**: Study slots are only scheduled between **08:00 and 22:00 IST**. Early mornings (<08:00) and night hours (>22:00) are protected rest periods.
- **Past Protection**: The planner will **never** schedule study work in the past. If `startDate` is earlier than `now`, the engine automatically advances the effective start time to `now`.

### B. Conflict Avoidance & Buffer Protection
- **Calendar Merging**: All scheduled `CalendarEvents` (lectures, labs, exams) and planned `StudySessions` are aggregated and contiguous/overlapping events are merged into unified busy intervals.
- **15-Minute Transition Buffers**: A mandatory **15-minute buffer** is enforced before and after every calendar event. No study slot will ever butt directly against a lecture.

### C. Prioritization & Tie-Breaking
1. **Urgent Deadlines**: Approaching deadlines receive top priority and are scheduled in the earliest available free windows.
2. **Goal-Linked Work**: Assignments supporting active goals receive a **+0.5 priority boost**, elevating their scheduling order.
3. **Deterministic Tie-Breaking**: When multiple items share urgency, items are sorted by `due_date ASC`, `effective_priority DESC`, `created_at ASC`, and `id ASC`.

### D. Multi-Session Chunking & Fatigue Prevention
- **Urgent Deliverables**: Automatically split into 2 separate sessions (e.g., initial preparation + finalization) to encourage spaced repetition.
- **Daily Study Caps**: A student's planned study time is capped per day (default: 240 minutes) to avoid academic burnout.
- **Anti-Cramming Rule**: Non-urgent assignments are restricted to at most 1 session per day.

---

## 3. Supported Integrations

The study planning system is deeply integrated across the backend platform:

| Domain | Integrated Service / Repository | Functional Behavior |
| :--- | :--- | :--- |
| **Assignments** | `AssignmentRepository` | Candidate filtering (`pending`, `in_progress`); completed/submitted work strictly excluded. |
| **Academic Goals** | `GoalRepository` | Milestone study sessions scheduled before `target_date`; completed/100% goals skipped. |
| **Calendar Events** | `CalendarEventRepository` | Avoids all scheduled events with 15-minute transitions. |
| **Study Sessions** | `StudySessionRepository` | Existing planned study sessions are treated as firm calendar commitments. |
| **Study Resources** | `StudyResourceService` | Attaches contextual notes, links, and documents directly to planned study items. |
| **Workload Analysis** | `WorkloadAnalysisService` | Identifies heavy commitment days and steers non-urgent study work to lighter days. |
| **Productivity Analytics** | `ProductivityAnalyticsService` | Aggregates planned vs completed study metrics, plan completion rate, and progress percentages. |
| **Notifications & Reminders** | `NotificationService` | Dispatches upcoming session alerts, overdue alerts, and deadline preparation warnings with 24h throttling. |

---

## 4. Conflict Behavior & Edge Cases

| Scenario | Engine Behavior | Verification Result |
| :--- | :--- | :--- |
| **Overlapping Calendar Events** | Merges overlapping intervals and avoids scheduling within the merged duration plus buffer. | Verified in `test:planning-conflicts` |
| **Back-to-Back Lectures** | Merges contiguous events with 0 gap into a single block, applying 15m outer buffers. | Verified in `test:planning-conflicts` |
| **Insufficient Free Time** | Generates plan for available slots, calculates exact deficit minutes, and records explicit warning. | Verified in `test:planning-conflicts` |
| **Completed Deliverables** | Strictly ignored; no study work is scheduled for completed or submitted assignments. | Verified in `test:planning-goals-resources` |
| **Plan Recalculation** | Preserves completed study items, deducts completed sessions from needed count, and avoids duplicates. | Verified in `test:study-planning-e2e` |
| **Student Rescheduling** | Rejects past dates and post-deadline dates with 400; rejects conflicting time slots with 409. | Verified in `verify:planning-engine` |
| **Multi-Tenant Isolation** | All queries enforce `user_id = ?`. Cross-tenant retrieval, mutation, or recalculation returns 404. | Verified in `test:study-planning-e2e` |

---

## 5. API Endpoints Registry

All routes are mounted under `/api/student/study-plans` and protected by `authMiddleware`:

### Plan Lifecycle
- `POST /api/student/study-plans/generate` — Generate and optionally persist a deterministic study plan.
  - Body: `{ title, startDate, endDate, dailyLimitMinutes, defaultSessionDuration, replaceExisting, autoPersist, now }`
- `GET /api/student/study-plans/current` — Retrieve active upcoming study plan with items and progress metrics.
- `GET /api/student/study-plans` — List paginated study plans (`page`, `limit`, `status`, `startDate`, `endDate`).
- `GET /api/student/study-plans/:id` — Retrieve specific plan details with progress statistics.
- `PUT /api/student/study-plans/:id` — Update plan title, description, or status.
- `DELETE /api/student/study-plans/:id` — Delete plan and cascade-delete child items.
- `POST /api/student/study-plans/:id/recalculate` — Recalculate schedule, preserving completed work.

### Planned Items
- `GET /api/student/study-plans/items` — Query planned study items with filtering (`date` in YYYY-MM-DD, `startDate`, `endDate`, `courseId`, `assignmentId`, `goalId`, `status`, `priority`).
- `GET /api/student/study-plans/items/:id` — Retrieve single planned item.
- `PATCH /api/student/study-plans/items/:id/status` — Mutate item status (`planned`, `in_progress`, `completed`, `skipped`). Automated `completed_at` timestamping.
- `POST /api/student/study-plans/items/:id/reschedule` — Reschedule planned date with deadline and conflict validation.
- `DELETE /api/student/study-plans/items/:id` — Remove an individual planned item.

### Insights & Reminders
- `GET /api/student/study-plans/insights` — Retrieve academic insights (planned vs completed, overdue, missed, overloaded days, unplanned urgent assignments, prep deficits).
- `POST /api/student/study-plans/reminders/process` — Process and dispatch due study plan reminders with idempotency.

---

## 6. Insights & Notification Duplicate Suppression

The system guarantees **zero notification spam**:
1. **Upcoming Study Session Reminders**: Keyed by `related_resource_type = 'study_plan_item_upcoming'` and `related_resource_id = item.id`. Before creation, the database index `idx_notifications_user_resource` is queried; if an alert already exists, dispatch is suppressed.
2. **Overdue Study Session Reminders**: Keyed by `related_resource_type = 'study_plan_item_overdue'` and `related_resource_id = item.id`. Suppressed if already sent.
3. **Preparation Deficit Warnings**: Keyed by `related_resource_type = 'assignment_prep_warning'` and `related_resource_id = assignment.id`. Throttled to at most **once every 24 hours**.

---

## 7. Known Boundaries & Limitations

- **Daily Working Cap**: Study planning strictly limits study blocks between 08:00 and 22:00 IST. Nocturnal students desiring 02:00 AM study sessions must manually adjust or create custom study sessions.
- **Maximum Daily Allocation**: The system caps planned study time per day (default: 4 hours) to guard student wellness. If an overwhelming number of assignments are due simultaneously, the planner will report an explicit `insufficient_free_time` deficit warning rather than unsustainably overloading the student.
- **Local Timezone**: All deterministic date calculations are pegged to `Asia/Kolkata` (IST, UTC+05:30) as required by Mumbai student commute and academic calendars.
