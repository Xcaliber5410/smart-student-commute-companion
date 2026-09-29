# Student Academic Productivity & Workflow Architecture (Day 8)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 8 of 21-Day Development Roadmap  
**Scope:** Core Backend Foundation for Academic Courses, Deliverables/Tasks, Deadline Reminders, Filtering & Sorting, and Real-Time Progress Summaries  

---

## 1. Domain Entities & Database Architecture

Day 8 bridges the gap between commute workflows and academic campus productivity by introducing relational SQLite tables for courses and assignments, directly integrated with the Day 7 reminder and notification engine.

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

### Table Definitions & Indexing

#### 1. `courses` Table
Stores student academic subjects, courses, and syllabus metadata:
- `id` (`TEXT PRIMARY KEY`): Unique course ID (`course-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
- `name` (`TEXT NOT NULL`): Course title (e.g. `"Operating Systems"`).
- `code` (`TEXT`): Catalog code (e.g. `"CS302"`).
- `instructor` (`TEXT`): Professor name (e.g. `"Dr. Tanenbaum"`).
- `color` (`TEXT DEFAULT '#4F46E5'`): Hex color token for frontend UI badge tinting.
- `credits` (`INTEGER DEFAULT 3`): Course academic credits.
- `archived` (`INTEGER NOT NULL DEFAULT 0`): Flag for archiving completed semesters.
- `created_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.
- `updated_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.

**Indexes:**
- `idx_courses_user_id`: ON `courses(user_id)`
- `idx_courses_user_archived`: ON `courses(user_id, archived)`

#### 2. `assignments` Table
Tracks deliverables, problem sets, lab reports, and exam milestones:
- `id` (`TEXT PRIMARY KEY`): Unique assignment ID (`asgn-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
- `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Linked subject ID.
- `title` (`TEXT NOT NULL`): Task title.
- `description` (`TEXT`): Deliverable notes and instructions.
- `due_date` (`INTEGER NOT NULL`): Deadline as UTC millisecond epoch timestamp.
- `priority` (`TEXT NOT NULL DEFAULT 'medium'`): `'low'`, `'medium'`, `'high'`, `'urgent'`.
- `status` (`TEXT NOT NULL DEFAULT 'pending'`): `'pending'`, `'in_progress'`, `'completed'`, `'cancelled'`.
- `reminder_enabled` (`INTEGER NOT NULL DEFAULT 1`): Flag for automatic alert scheduling.
- `reminder_lead_time_minutes` (`INTEGER NOT NULL DEFAULT 1440`): Alert timing (default 24h prior).
- `completed_at` (`INTEGER`): Millisecond epoch timestamp when marked completed.
- `created_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.
- `updated_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.

**Indexes:**
- `idx_assignments_user_id`: ON `assignments(user_id)`
- `idx_assignments_user_status`: ON `assignments(user_id, status)`
- `idx_assignments_user_due`: ON `assignments(user_id, due_date ASC)`
- `idx_assignments_course_id`: ON `assignments(course_id)`

---

## 2. Deadline & Reminder Lifecycle Synchronization

The service layer guarantees that academic task deadlines stay synchronized with the Day 7 reminder engine without manual user effort:

1. **Automatic Scheduling**:
   When an assignment is created with `reminder_enabled = true`:
   - Computes `scheduled_time = due_date - (reminder_lead_time_minutes * 60 * 1000)`.
   - Clamps to immediate trigger if lead time has passed but deadline is still in the future.
   - Inserts a reminder with `reminder_type: 'assignment'`, `related_resource_type: 'assignment'`, and `related_resource_id: assignment.id`.
2. **Deadline Updates**:
   When `due_date` or `reminder_lead_time_minutes` is updated:
   - Updates the existing scheduled reminder's `scheduled_time` automatically.
3. **Task Completion / Cancellation**:
   When an assignment is marked `'completed'` or `'cancelled'`:
   - Active scheduled reminders transition to `'cancelled'`. Students are never spammed for deliverables they have already completed.
4. **Re-Opening Tasks**:
   When a completed or cancelled assignment is reverted to `'pending'` or `'in_progress'`:
   - The scheduled reminder is restored.
5. **Deletion**:
   Deleting an assignment cleans up all associated reminder records via `remRepo.deleteByResource('assignment', id)`.

---

## 3. API Reference

All endpoints require JWT Bearer authentication (`Authorization: Bearer <token>`) and enforce student-level data isolation.

### Courses Endpoints (`/api/academic/courses`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/academic/courses` | List student's courses with `search`, `archived`, and pagination |
| `POST` | `/api/academic/courses` | Create a new course (rejects duplicate names/codes with `409 Conflict`) |
| `GET` | `/api/academic/courses/:id` | Retrieve course by ID (rejects cross-user access with `403 Forbidden`) |
| `PATCH` | `/api/academic/courses/:id` | Update course details |
| `POST` | `/api/academic/courses/:id/archive` | Toggle course archived state (`{ archived: true }`) |
| `DELETE` | `/api/academic/courses/:id` | Delete course |

### Assignments Endpoints (`/api/academic/assignments`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/academic/assignments` | List assignments with filtering (`status`, `course_id`, `priority`, `overdue`, `upcoming`, `search`) and sorting (`due_date_asc`, `due_date_desc`, `priority`, `created_at`) |
| `POST` | `/api/academic/assignments` | Create assignment and auto-schedule deadline reminder |
| `GET` | `/api/academic/assignments/:id` | Retrieve assignment by ID |
| `PATCH` | `/api/academic/assignments/:id` | Update assignment details and re-sync reminder |
| `PATCH` | `/api/academic/assignments/:id/status` | Transition status (`pending`, `in_progress`, `completed`, `cancelled`) |
| `DELETE` | `/api/academic/assignments/:id` | Delete assignment and remove associated reminders |

### Academic Progress & Analytics (`/api/academic/progress`)

`GET /api/academic/progress` delivers single-pass SQL aggregated metrics:

```json
{
  "success": true,
  "timestamp": "2026-09-29T14:15:00.000Z",
  "studentId": "usr-1790691284100-abc",
  "totalAssignments": 5,
  "completedAssignments": 2,
  "inProgressAssignments": 1,
  "pendingAssignments": 2,
  "overdueAssignments": 1,
  "completionPercentage": 40,
  "priorityBreakdown": {
    "urgent": 1,
    "high": 1,
    "medium": 2,
    "low": 1
  },
  "upcomingDeadlines": [
    {
      "id": "asgn-1790691284123-xfk",
      "title": "Raft Consensus Implementation",
      "dueDate": 1790864084123,
      "priority": "urgent",
      "status": "pending",
      "courseId": "course-1790691284108-xrg",
      "courseName": "Distributed Systems",
      "courseCode": "CS401",
      "courseColor": "#3B82F6"
    }
  ],
  "courseProgress": [
    {
      "courseId": "course-1790691284108-xrg",
      "courseName": "Distributed Systems",
      "courseCode": "CS401",
      "courseColor": "#3B82F6",
      "totalAssignments": 3,
      "completedAssignments": 1,
      "pendingAssignments": 2,
      "overdueAssignments": 1,
      "completionPercentage": 33
    }
  ]
}
```

---

## 4. Verification & Testing

Run all academic domain tests:
```bash
# 1. Course service tests
npm run verify:course-service

# 2. Assignment lifecycle tests
npm run verify:assignment-service

# 3. Deadline reminder synchronization tests
npm run verify:assignment-reminders

# 4. Filtering and sorting query tests
npm run verify:academic-filtering

# 5. Progress summary analytics tests
npm run verify:academic-progress

# 6. End-to-end integration test suite
npm run test:academic
```
