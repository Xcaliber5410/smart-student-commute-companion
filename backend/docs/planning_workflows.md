# Student Planning, Calendar & Workload Architecture (Day 9)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 9 of 21-Day Development Roadmap  
**Scope:** Core Backend Foundation for Student Calendar Events, Study Sessions, Schedule Range Queries, Conflict Detection, Workload Analysis, and Automated Reminders  

---

## 1. Planning Domain & System Topology

Day 9 extends the student commute and academic models established during Days 1–8 by introducing a comprehensive scheduling and productivity subsystem. It enables students to structure lectures, study blocks, and assignment milestones into unified timelines with deterministic conflict detection and automated alert scheduling.

```text
                     AUTHENTICATED STUDENT (JWT)
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
              COURSES       ASSIGNMENTS       CALENDAR
                                 │             EVENTS
                                 ▼               │
                             DEADLINES           │
                                 │               │
                                 └───────┬───────┘
                                         ▼
                                  STUDY SESSIONS
                                         │
                                         ▼
                                  WORKLOAD ENGINE
                                   │           │
                                   ▼           ▼
                               CONFLICTS   SUMMARIES
                                   │
                                   ▼
                               REMINDERS (Automated Sync)
                                   │
                                   ▼
                              NOTIFICATIONS (In-App Feed)
```

---

## 2. Domain Models & Relational Schema (Migration 006)

### `calendar_events` Table
Tracks student lectures, lab examinations, and campus events:
- `id` (`TEXT PRIMARY KEY`): Unique event ID (`evt-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
- `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Optional associated course.
- `title` (`TEXT NOT NULL`): Title of the event (e.g. `"Operating Systems Lecture"`).
- `description` (`TEXT`): Event details or syllabus notes.
- `location` (`TEXT`): Room, lab, or campus building.
- `event_type` (`TEXT NOT NULL DEFAULT 'lecture'`): `'lecture'`, `'lab'`, `'exam'`, `'study'`, `'deadline'`, `'extracurricular'`, `'personal'`.
- `start_time` (`INTEGER NOT NULL`): Start time as UTC epoch millisecond timestamp.
- `end_time` (`INTEGER NOT NULL`): End time as UTC epoch millisecond timestamp (`end_time > start_time`).
- `status` (`TEXT NOT NULL DEFAULT 'scheduled'`): `'scheduled'`, `'cancelled'`.
- `reminder_enabled` (`INTEGER NOT NULL DEFAULT 1`): Flag for automated reminder scheduling.
- `reminder_lead_time_minutes` (`INTEGER NOT NULL DEFAULT 30`): Alert timing (default 30 min prior).
- `created_at` (`INTEGER NOT NULL`): Epoch ms.
- `updated_at` (`INTEGER NOT NULL`): Epoch ms.

**Indexes:**
- `idx_calendar_events_user_id`: ON `calendar_events(user_id)`
- `idx_calendar_events_user_range`: ON `calendar_events(user_id, start_time, end_time)`
- `idx_calendar_events_user_status`: ON `calendar_events(user_id, status)`
- `idx_calendar_events_course_id`: ON `calendar_events(course_id)`

---

### `study_sessions` Table
Tracks planned and completed student focused study blocks:
- `id` (`TEXT PRIMARY KEY`): Unique session ID (`study-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
- `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Optional course.
- `assignment_id` (`TEXT REFERENCES assignments(id) ON DELETE SET NULL`): Optional target deliverable.
- `title` (`TEXT NOT NULL`): Focus topic (e.g., `"Review Chapter 4 Problem Set"`).
- `notes` (`TEXT`): Session checklist or links.
- `planned_start_time` (`INTEGER NOT NULL`): Planned start UTC epoch millisecond timestamp.
- `planned_duration_minutes` (`INTEGER NOT NULL`): Designated duration in minutes (1 to 1440).
- `actual_duration_minutes` (`INTEGER`): Recorded study duration upon completion.
- `status` (`TEXT NOT NULL DEFAULT 'planned'`): `'planned'`, `'in_progress'`, `'completed'`, `'cancelled'`.
- `reminder_enabled` (`INTEGER NOT NULL DEFAULT 1`): Flag for automated reminder scheduling.
- `reminder_lead_time_minutes` (`INTEGER NOT NULL DEFAULT 15`): Alert timing (default 15 min prior).
- `completed_at` (`INTEGER`): Epoch ms when marked completed.
- `created_at` (`INTEGER NOT NULL`): Epoch ms.
- `updated_at` (`INTEGER NOT NULL`): Epoch ms.

**Indexes:**
- `idx_study_sessions_user_id`: ON `study_sessions(user_id)`
- `idx_study_sessions_user_time`: ON `study_sessions(user_id, planned_start_time)`
- `idx_study_sessions_user_status`: ON `study_sessions(user_id, status)`
- `idx_study_sessions_course_id`: ON `study_sessions(course_id)`
- `idx_study_sessions_assignment_id`: ON `study_sessions(assignment_id)`

---

## 3. Automated Reminder Synchronization Lifecycle

The service layer guarantees that student schedule entries automatically synchronize with the Day 7 reminder engine:

1. **Calendar Event Hook**:
   - Creating an event with `reminder_enabled = true` schedules a reminder:
     `scheduled_time = start_time - (reminder_lead_time_minutes * 60 * 1000)`.
   - If the event start time changes, the reminder's `scheduled_time` is updated.
   - If the event is cancelled or deleted, active scheduled reminders are cancelled or purged.
2. **Study Session Hook**:
   - Creating a study session with `reminder_enabled = true` schedules a reminder:
     `scheduled_time = planned_start_time - (reminder_lead_time_minutes * 60 * 1000)`.
   - Marking the session `'completed'` or `'cancelled'` automatically cancels the scheduled reminder so students are never spammed for completed sessions.
   - Deleting a study session removes associated reminders.

---

## 4. Conflict Detection & Workload Analysis Algorithms

### Conflict Detection Engine
Given a student's commitments in a time window:
- Events occupy `[start_time, end_time]`.
- Study sessions occupy `[planned_start_time, planned_start_time + planned_duration_minutes * 60000]`.
- Two intervals $A$ and $B$ conflict if and only if:
  $$A.\text{startTime} < B.\text{endTime} \quad \text{AND} \quad B.\text{startTime} < A.\text{endTime}$$
- Overlap duration is computed:
  $$\text{overlapMinutes} = \frac{\min(A.\text{endTime}, B.\text{endTime}) - \max(A.\text{startTime}, B.\text{startTime})}{60000}$$
- Overlaps $\ge 30$ minutes or identical start times receive `severity: 'high'`, otherwise `'medium'`.
- Consecutive items touching on boundaries (e.g., 10:00–11:00 and 11:00–12:00) do NOT conflict.

### Workload Analysis Engine
Aggregates student commitments across daily calendar dates in Asia/Kolkata timezone:
- Counts events and sums scheduled minutes.
- Counts planned study sessions and sums study minutes.
- Identifies active assignment deadlines on each date.
- Evaluates `isHeavyDay: true` if:
  $$\text{totalCommitmentMinutes} \ge 240 \text{ minutes (4 hours)} \quad \text{OR} \quad \text{assignmentsDueCount} \ge 2$$
- Computes overall summary: total study hours, overloaded day counts, deadline clusters, and conflicts count.

---

## 5. REST API Specifications

All endpoints require `Authorization: Bearer <JWT>` header and enforce student ownership.

### Calendar Range & Agenda
- `GET /api/calendar/range?start=1790829000000&end=1790836200000`:
  Returns unified chronological `timeline` of events, study sessions, and deadlines.
- `GET /api/calendar/today`:
  Returns today's agenda in Asia/Kolkata timezone.
- `GET /api/calendar/upcoming?days=7`:
  Returns upcoming commitments in the next N days.
- `GET /api/calendar/conflicts?days=14`:
  Analyzes overlapping time intervals between events and study sessions.
- `GET /api/calendar/workload?days=7`:
  Generates daily commitment breakdowns, overload flags, and total study duration metrics.

### Calendar Events
- `POST /api/calendar/events`: Create an event.
- `GET /api/calendar/events`: List events with pagination and filters (`course_id`, `event_type`, `status`, `search`).
- `GET /api/calendar/events/:id`: Retrieve single event.
- `PATCH /api/calendar/events/:id`: Update event fields.
- `DELETE /api/calendar/events/:id`: Delete event and clean up reminders.

### Study Sessions
- `POST /api/calendar/study-sessions`: Plan a study block.
- `GET /api/calendar/study-sessions`: List sessions with pagination and filters.
- `GET /api/calendar/study-sessions/:id`: Retrieve single session.
- `PATCH /api/calendar/study-sessions/:id`: Update session fields.
- `PATCH /api/calendar/study-sessions/:id/status`: Update status (`planned`, `in_progress`, `completed`, `cancelled`) and record `actual_duration_minutes`.
- `DELETE /api/calendar/study-sessions/:id`: Delete study block.

---

## 6. Verification Test Commands

```bash
# Run unit & service test suites
npm run verify:calendar-service
npm run verify:study-service
npm run verify:planning-reminders
npm run verify:calendar-range
npm run verify:workload-analysis

# Run complete End-to-End Planning Integration suite
npm run test:planning

# Run route registration audit
npm run verify:routes

# Run full project test verification
npm run test:all
```

---

## 7. Subsystem Verification & Status

* **Day 9 Backend Work:** Completed & integrated into centralized routing (`/calendar/*`).
* **Contribution & Verification Status:** Verified on `main` branch.

