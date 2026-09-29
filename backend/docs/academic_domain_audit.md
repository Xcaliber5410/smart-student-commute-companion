# Academic & Productivity Domain Architecture Audit (Day 8)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 8 of 21-Day Development Roadmap  
**Scope:** Architectural Audit and Design for Student Courses, Academic Assignments/Tasks, Deadline Reminders, and Productivity Analytics  

---

## 1. Executive Summary & Existing Domain State

During Days 1–7, the backend established a robust foundation for:
1. **User Authentication & Authorization (Day 4)**: JWT-based student authentication with password hashing (`argon2id` fallback), role assignment, and ownership enforcement.
2. **Student Commute Workflows (Day 6)**: Student profiles (`student_profiles`), recurring daily class/commute schedules (`student_schedules`), saved route bookmarks (`saved_routes`), and ride-sharing groups (`ride_group_members`).
3. **Notifications & Reminders Engine (Day 7)**: Relational `reminders` table with deterministic finite-state lifecycle (`scheduled` -> `triggered` -> `completed` / `cancelled`), in-app feed `notifications` table, timezone-safe IST/UTC conversions (`timezone.js`), and background runner `reminderScheduler`.

### Identified Gaps in Current Architecture

While commute schedules exist for travelling to college, the backend currently lacks the **academic productivity domain** required for students once they arrive at college or manage their coursework:
* **No Course / Subject Entity**: Students cannot organize their academic workload by subject, course code, professor, or semester.
* **No Assignment / Academic Task Entity**: There is no tracking for problem sets, laboratory records, term papers, project milestones, or exam preparation tasks.
* **Disconnected Deadlines & Reminders**: The Day 7 `reminders` and `reminderScheduler` infrastructure exists, but has not yet been connected to academic submission deadlines.
* **Missing Academic Progress Metrics**: The student dashboard aggregates commute metrics and active ride groups, but provides zero academic progress tracking (completion rates, upcoming deadlines, overdue tasks).

---

## 2. Target Domain Model & Entity Relationships

The academic workflow directly extends the authenticated student identity without duplicating authentication or routing infrastructure:

```text
                             ┌──────────────┐
                             │    users     │ (Authenticated Student)
                             └──────┬───────┘
                                    │ 1:N
            ┌───────────────────────┴───────────────────────┐
            │ 1:N                                           │ 1:N
            ▼                                               ▼
   ┌─────────────────┐                             ┌─────────────────┐
   │     courses     │ (Subjects & Syllabi)        │   assignments   │ (Tasks & Projects)
   └────────┬────────┘                             └────────┬────────┘
            │ 1:N (ON DELETE SET NULL)                      │
            └───────────────────────────────────────────────┤
                                                            │ 1:1 (Automated)
                                                            ▼
                                                   ┌─────────────────┐
                                                   │    reminders    │ (Day 7 Engine)
                                                   └────────┬────────┘
                                                            │ Trigger
                                                            ▼
                                                   ┌─────────────────┐
                                                   │  notifications  │ (In-App Feed)
                                                   └─────────────────┘
```

---

## 3. Relational Database Schema Design (Migration 005)

### Table 1: `courses`
Represents an academic course or subject enrolled by a student:
* `id` (`TEXT PRIMARY KEY`): Unique identifier (`course-...`).
* `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
* `name` (`TEXT NOT NULL`): Course title (e.g., `"Design & Analysis of Algorithms"`).
* `code` (`TEXT`): Short catalog code (e.g., `"CS301"`).
* `instructor` (`TEXT`): Professor or instructor name (e.g., `"Dr. Ramanujan"`).
* `color` (`TEXT DEFAULT '#4F46E5'`): Hex color token for frontend course badges.
* `credits` (`INTEGER DEFAULT 3`): Academic credits.
* `archived` (`INTEGER NOT NULL DEFAULT 0`): Flag for completed semesters.
* `created_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.
* `updated_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.

**Indexes:**
* `idx_courses_user_id`: ON `courses(user_id)`
* `idx_courses_user_archived`: ON `courses(user_id, archived)`

### Table 2: `assignments`
Represents student academic deliverables, tasks, and deadlines:
* `id` (`TEXT PRIMARY KEY`): Unique identifier (`asgn-...`).
* `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
* `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Associated subject.
* `title` (`TEXT NOT NULL`): Task title (e.g., `"Greedy Algorithms Problem Set"`).
* `description` (`TEXT`): Detailed submission instructions or problem notes.
* `due_date` (`INTEGER NOT NULL`): Submission deadline as UTC millisecond epoch timestamp.
* `priority` (`TEXT NOT NULL DEFAULT 'medium'`): `'low'`, `'medium'`, `'high'`, `'urgent'`.
* `status` (`TEXT NOT NULL DEFAULT 'pending'`): `'pending'`, `'in_progress'`, `'completed'`, `'cancelled'`.
* `reminder_enabled` (`INTEGER NOT NULL DEFAULT 1`): Automatic deadline reminder trigger.
* `reminder_lead_time_minutes` (`INTEGER NOT NULL DEFAULT 1440`): Alert timing (default 24h prior to deadline).
* `completed_at` (`INTEGER`): Millisecond epoch timestamp when marked completed.
* `created_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.
* `updated_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.

**Indexes:**
* `idx_assignments_user_id`: ON `assignments(user_id)`
* `idx_assignments_user_status`: ON `assignments(user_id, status)`
* `idx_assignments_user_due`: ON `assignments(user_id, due_date ASC)`
* `idx_assignments_course_id`: ON `assignments(course_id)`

---

## 4. Assignment Lifecycle & Reminder Synchronization Rules

### Finite-State Transitions:
```text
           ┌───────────┐
           │  pending  │
           └─────┬─────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
 ┌─────────────┐   ┌─────────────┐
 │ in_progress │   │  completed  │
 └──────┬──────┘   └─────────────┘
        │                 ▲
        └─────────────────┘
```

### Reminder Integration Mechanics:
1. **Creation**: When an assignment is created with `due_date` and `reminder_enabled = 1`:
   - Compute `reminder_time = due_date - (reminder_lead_time_minutes * 60 * 1000)`.
   - If `reminder_time` is in the future, create a scheduled reminder linked via `related_resource_type = 'assignment'` and `related_resource_id = assignment.id`.
   - If `reminder_time` has already passed but `due_date` is still in the future, schedule the reminder for immediate processing or clamp to deadline.
2. **Deadline Updates**: If `due_date` changes on an active assignment:
   - Locate any scheduled reminder with `related_resource_id = assignment.id` and update its `scheduled_time` to match the new deadline lead time.
3. **Completion / Cancellation / Deletion**:
   - Marking an assignment `completed` or `cancelled`, or deleting the assignment, automatically transitions any related scheduled reminder to `completed` or `cancelled`. This guarantees that students are never spammed with reminders for tasks they have already submitted.

---

## 5. Academic Progress Metrics & Aggregation Rules

To eliminate N+1 queries when rendering the student dashboard, progress metrics will execute single-pass SQL aggregations:
* **Total Assignments**: `COUNT(*)` scoped to `user_id`.
* **Completed Assignments**: `SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`.
* **Pending Assignments**: `SUM(CASE WHEN status IN ('pending', 'in_progress') THEN 1 ELSE 0 END)`.
* **Overdue Assignments**: `SUM(CASE WHEN status != 'completed' AND due_date < :now THEN 1 ELSE 0 END)`.
* **Completion Rate**: `ROUND((completed * 100.0) / total)`.
* **Upcoming Deadlines**: Assignments due between `:now` and `:now + 7 days`.
* **Course-wise Progress**: Grouped by `course_id` with course metadata joined, computing per-course completion rates.

---

## 6. Implementation Roadmap for Day 8

| Task | Scope | Verification |
|---|---|---|
| **Task 1** | Audit existing domain & establish architecture baseline | Verify test suite integrity & documentation |
| **Task 2** | Implement `Course` entity, repository, service, and CRUD endpoints | Unit tests & `verify_course_service.js` |
| **Task 3** | Implement `Assignment` entity, repository, lifecycle service | State transitions & `verify_assignment_service.js` |
| **Task 4** | Connect assignment deadlines with Day 7 reminder engine | Deadline scheduling & cancellation tests |
| **Task 5** | Add practical filtering, sorting, and pagination for academic APIs | Query filter & sorting tests |
| **Task 6** | Build single-pass academic progress and dashboard analytics | Aggregate metrics & edge cases (empty data, overdue) |
| **Task 7** | End-to-end integration tests & final documentation | Full test runner (`test:all`) & API reference |
