# Student Planning Domain Audit & Architecture (Day 9)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 9 of 21-Day Development Roadmap  
**Scope:** Architecture and Foundation for Student Planning, Calendar Events, Study Sessions, Workload Analysis, and Schedule Reminders  

---

## 1. Domain Inspection & Gap Analysis

Days 1–8 established the core student commute, routines, notifications, and academic deliverables foundation:
- `users`: Core student authentication and profile.
- `student_profiles`: Travel preferences, colleges, and constraints.
- `student_schedules`: Recurring weekly commute routines.
- `courses`: Academic courses, credits, and syllabi.
- `assignments`: Academic deliverables, deadlines, and priorities.
- `reminders` & `notifications`: Scheduled alert triggers and student in-app notifications.

### Identified Planning Gaps
Prior to Day 9, the backend lacked:
1. **Calendar Events**: Discrete time-bound academic or personal events (lectures, labs, exams, seminars, extracurriculars) with exact `start_time` and `end_time`.
2. **Study Sessions**: Planned or completed study blocks with designated duration, linked to courses or assignments.
3. **Workload Analysis & Conflict Detection**: Aggregation of student commitments (events + study sessions + assignment deadlines) to identify overloaded days and overlapping time blocks.
4. **Planning Reminders**: Automated reminder hooks alerting students prior to upcoming calendar events and study blocks.

---

## 2. Planning Domain Relationships

```text
                             ┌──────────────┐
                             │    users     │ (Authenticated Student)
                             └──────┬───────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │ 1:N                      │ 1:N                      │ 1:N
         ▼                          ▼                          ▼
  ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
  │   courses   │            │ assignments │            │  calendar_  │
  └──────┬──────┘            └──────┬──────┘            │   events    │
         │                          │                   └──────┬──────┘
         │ 1:N (Optional)           │ 1:N (Optional)           │
         └─────────────┐  ┌─────────┘                          │
                       ▼  ▼                                    │
              ┌─────────────────┐                              │
              │ study_sessions  │                              │
              └────────┬────────┘                              │
                       │                                       │
                       └───────────────────┬───────────────────┘
                                           │ 1:1 Automated Sync
                                           ▼
                                  ┌─────────────────┐
                                  │    reminders    │
                                  └────────┬────────┘
                                           │ Trigger
                                           ▼
                                  ┌─────────────────┐
                                  │  notifications  │
                                  └─────────────────┘
```

---

## 3. Relational Schema Design (Migration 006)

### `calendar_events` Table
Tracks student events, lectures, and exams:
- `id` (`TEXT PRIMARY KEY`): Unique ID (`evt-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Student owner.
- `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Optional associated course.
- `title` (`TEXT NOT NULL`): Title of the event (e.g., `"Operating Systems Lecture"`).
- `description` (`TEXT`): Additional notes or agenda.
- `location` (`TEXT`): Physical room, campus building, or virtual link.
- `event_type` (`TEXT NOT NULL DEFAULT 'lecture'`): `'lecture'`, `'lab'`, `'exam'`, `'study'`, `'deadline'`, `'extracurricular'`, `'personal'`.
- `start_time` (`INTEGER NOT NULL`): UTC millisecond epoch timestamp.
- `end_time` (`INTEGER NOT NULL`): UTC millisecond epoch timestamp (`end_time > start_time`).
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
Tracks planned and completed student study sessions:
- `id` (`TEXT PRIMARY KEY`): Unique ID (`study-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Student owner.
- `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Optional course.
- `assignment_id` (`TEXT REFERENCES assignments(id) ON DELETE SET NULL`): Optional target deliverable.
- `title` (`TEXT NOT NULL`): Goal for the study block (e.g., `"Prep for Midterm"`).
- `notes` (`TEXT`): Details or checklist for the session.
- `planned_start_time` (`INTEGER NOT NULL`): UTC millisecond epoch timestamp.
- `planned_duration_minutes` (`INTEGER NOT NULL`): Target duration (must be > 0).
- `actual_duration_minutes` (`INTEGER`): Recorded study duration upon completion.
- `status` (`TEXT NOT NULL DEFAULT 'planned'`): `'planned'`, `'in_progress'`, `'completed'`, `'cancelled'`.
- `reminder_enabled` (`INTEGER NOT NULL DEFAULT 1`): Flag for automated alert.
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

## 4. Key Invariants & Business Rules
1. **Ownership Enforcement**: Students may only link events and study sessions to courses or assignments they own. Attempting to link to another student's course or assignment yields `403 Forbidden`.
2. **Time Integrity**: `start_time` must precede `end_time`. Negative or zero durations are rejected with `400 Validation Error`.
3. **Reminder Engine Integration**: Active scheduled events and study blocks automatically hook into the Day 7 reminder engine via `related_resource_type` and `related_resource_id`.
4. **Deterministic Conflict Analysis**: Interval overlaps are calculated using `[startA < endB AND startB < endA]`.
