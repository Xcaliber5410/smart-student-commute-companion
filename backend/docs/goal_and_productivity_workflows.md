# Student Goals, Workflows & Productivity Analytics Architecture (Day 10)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 10 of 21-Day Development Roadmap  
**Scope:** Core Backend Foundation for Student Academic Goals, Measurable Targets, Workflow Progress Recalibration, Deterministic Productivity Metrics, and Unified Student Overview & Insights  

---

## 1. Domain Entities & Relational Schema (Migrations 007 & 008)

Day 10 unifies student academic deliverables, calendar schedules, and study sessions into a goal-driven productivity ecosystem. Goals can be qualitative milestones or quantitative targets linked to courses, assignments/tasks, and study sessions.

```text
                             ┌──────────────┐
                             │    users     │ (Authenticated Student)
                             └──────┬───────┘
                                    │ 1:N
            ┌───────────────────────┼───────────────────────┐
            │ 1:N                   │ 1:N                   │ 1:N
            ▼                       ▼                       ▼
   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
   │     courses     │     │   assignments   │     │ study_sessions  │
   └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
            │ 1:N (Optional)        │                       │
            │                       │ N:1 (goal_id)         │ N:1 (goal_id)
            ▼                       ▼                       ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                              goals                              │
   └────────────────────────────────┬────────────────────────────────┘
                                    │
                                    │ Automated Recalibration
                                    ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                Productivity & Analytics Engine                  │
   └────────────────────────────────┬────────────────────────────────┘
                                    │
                                    ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │              Student Overview & Insights API                   │
   │           (/api/student/insights & /api/student/overview)       │
   └─────────────────────────────────────────────────────────────────┘
```

### Table Definitions & Indexing

#### 1. `goals` Table (Migration 007)
Tracks academic milestones, semester targets, study duration goals, and task completion goals:
- `id` (`TEXT PRIMARY KEY`): Unique goal ID (`goal-...`).
- `user_id` (`TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`): Owning student ID.
- `course_id` (`TEXT REFERENCES courses(id) ON DELETE SET NULL`): Optional associated course.
- `title` (`TEXT NOT NULL`): Goal objective (e.g. `"Score 9+ SGPA in Operating Systems"`).
- `description` (`TEXT`): Goal details, resources, and action plan.
- `target_date` (`INTEGER`): Deadline / milestone date as millisecond epoch timestamp.
- `status` (`TEXT NOT NULL DEFAULT 'active'`): Enum `'active'`, `'completed'`, `'on_hold'`, `'cancelled'`.
- `progress` (`INTEGER NOT NULL DEFAULT 0`): Progress percentage integer between `0` and `100`.
- `target_value` (`REAL`): Optional measurable target (e.g. `10.0` assignments, `20.0` hours).
- `current_value` (`REAL DEFAULT 0`): Current measurable accumulation (e.g. `4.0`).
- `unit` (`TEXT`): Measurable unit (e.g. `'hours'`, `'chapters'`, `'assignments'`).
- `priority` (`TEXT NOT NULL DEFAULT 'medium'`): Enum `'low'`, `'medium'`, `'high'`, `'urgent'`.
- `category` (`TEXT NOT NULL DEFAULT 'academic'`): Enum `'academic'`, `'career'`, `'project'`, `'skill'`, `'personal'`.
- `completed_at` (`INTEGER`): Millisecond epoch timestamp when marked completed.
- `created_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.
- `updated_at` (`INTEGER NOT NULL`): Millisecond epoch timestamp.

**Indexes:**
- `idx_goals_user_id`: ON `goals(user_id)`
- `idx_goals_user_status`: ON `goals(user_id, status)`
- `idx_goals_course_id`: ON `goals(course_id)`
- `idx_goals_target_date`: ON `goals(user_id, target_date)`

#### 2. Workflow Association Columns (Migration 008)
Connects atomic student actions directly to high-level goals:
- `assignments.goal_id` (`TEXT REFERENCES goals(id) ON DELETE SET NULL`) with index `idx_assignments_goal_id`.
- `study_sessions.goal_id` (`TEXT REFERENCES goals(id) ON DELETE SET NULL`) with index `idx_study_sessions_goal_id`.

---

## 2. Student Goal Management API

All endpoints require JWT Bearer authentication and enforce student ownership isolation.

### `POST /api/academic/goals`
Creates a student goal with optional course linkage and measurable target.

**Request Body:**
```json
{
  "title": "Master Operating Systems Kernels",
  "description": "Complete all memory management labs and revision sessions",
  "course_id": "course-12345",
  "target_date": 1792000000000,
  "category": "academic",
  "priority": "high",
  "target_value": 5,
  "unit": "assignments"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "timestamp": "2026-10-01T23:00:00.000Z",
  "message": "Goal created successfully",
  "goal": {
    "id": "goal-1790878194250-zum7s",
    "userId": "usr-123",
    "courseId": "course-12345",
    "title": "Master Operating Systems Kernels",
    "status": "active",
    "progress": 0,
    "targetValue": 5,
    "currentValue": 0,
    "unit": "assignments",
    "priority": "high",
    "category": "academic",
    "targetDate": 1792000000000,
    "createdAt": 1790878194250,
    "updatedAt": 1790878194250
  }
}
```

### `GET /api/academic/goals`
Lists student goals with filtering and pagination.

**Query Parameters:**
- `status`: Filter by status (`active`, `completed`, `on_hold`, `cancelled`).
- `courseId`: Filter by associated course.
- `priority`: Filter by priority (`low`, `medium`, `high`, `urgent`).
- `category`: Filter by category.
- `overdue`: Boolean (`true` returns goals whose target date has passed while still active).
- `page`: Page number (default `1`).
- `limit`: Items per page (default `20`, max `100`).

### `GET /api/academic/goals/:id`
Retrieves a single goal by ID with ownership verification.

### `PATCH /api/academic/goals/:id`
Updates goal details (title, description, target date, priority, course).

### `PATCH /api/academic/goals/:id/progress`
Updates goal progress percentage or measurable current value. When progress reaches `100%`, the goal transitions automatically to `completed`.

**Request Body:**
```json
{
  "progress": 75,
  "current_value": 3.75
}
```

### `POST /api/academic/goals/:id/complete`
Explicitly marks a goal completed (`status = 'completed'`, `progress = 100`, `completed_at = now`).

### `POST /api/academic/goals/:id/cancel`
Cancels an active or on-hold goal. Rejects illegal state transitions (e.g. attempting to mark a cancelled goal completed without reopening it).

### `DELETE /api/academic/goals/:id`
Permanently deletes a goal. Unlinks all associated assignments and study sessions (`ON DELETE SET NULL`).

---

## 3. Workflow Associations & Progress Recalibration

### Endpoints
- `GET /api/academic/goals/:id/work`: Retrieves all linked assignments and study sessions with progress summary.
- `POST /api/academic/goals/:id/assignments`: Links an assignment to the goal (`body: { assignmentId }`).
- `DELETE /api/academic/goals/:id/assignments/:assignmentId`: Unlinks an assignment.
- `POST /api/academic/goals/:id/study-sessions`: Links a study session to the goal (`body: { sessionId }`).
- `DELETE /api/academic/goals/:id/study-sessions/:sessionId`: Unlinks a study session.
- `POST /api/academic/goals/:id/sync-progress`: Recalibrates progress based on completed work.

### Dynamic Recalibration Engine (`syncGoalProgressFromWork`)
When assignments or study sessions linked to a goal are updated:
1. **Task-Based Calculation**: If linked assignments exist and the goal does not specify hours as unit:
   $$\text{Progress} = \text{round}\left(\frac{\text{Completed Tasks}}{\text{Total Linked Tasks}} \times 100\right)$$
2. **Time-Based Calculation**: If the goal has target unit `"hours"` or `"minutes"`:
   $$\text{Progress} = \text{min}\left(100, \text{round}\left(\frac{\text{Completed Study Minutes}}{\text{Target Minutes}} \times 100\right)\right)$$
3. **Automatic Lifecycle Transitions**:
   - When progress reaches 100%, status transitions automatically from `active` $\rightarrow$ `completed`.
   - If a completed task is reopened (`completed` $\rightarrow$ `pending`), progress recalculates and a completed goal automatically reverts to `in_progress` / `active`.

---

## 4. Deterministic Productivity & Statistics Service

Endpoint: `GET /api/academic/productivity` (alias `GET /api/academic/statistics`).

All metrics are derived strictly from actual SQLite records without hallucinations.

### Date Ranges Supported
- `today`: Current 24-hour day in Asia/Kolkata (IST UTC+05:30).
- `week` / `current_week`: From Monday 00:00:00 to Sunday 23:59:59 IST.
- `month` / `current_month`: From 1st day of month 00:00:00 to last day 23:59:59 IST.
- `custom`: Specified by `startDate` and `endDate` timestamps.

### Returned Metrics Structure
```json
{
  "success": true,
  "timestamp": "2026-10-01T23:30:00.000Z",
  "period": "week",
  "dateRange": {
    "start": 1790640000000,
    "end": 1791244799999
  },
  "assignments": {
    "completedInPeriod": 3,
    "dueInPeriod": 4,
    "pending": 1,
    "inProgress": 0,
    "overdueInRange": 0,
    "currentOverdueBacklog": 0,
    "completionRatePercentage": 75
  },
  "studySessions": {
    "completedSessions": 2,
    "totalPlannedMinutes": 180,
    "completedMinutes": 120,
    "completedHours": 2.0,
    "adherencePercentage": 67,
    "byCourse": [
      {
        "courseId": "course-12345",
        "courseName": "Operating Systems",
        "courseColor": "#4F46E5",
        "completedMinutes": 120,
        "completedHours": 2.0,
        "completedSessions": 2
      }
    ]
  },
  "goals": {
    "total": 2,
    "active": 1,
    "completed": 1,
    "onHold": 0,
    "cancelled": 0,
    "completedInPeriod": 1,
    "overdue": 0,
    "averageActiveProgress": 50
  },
  "calendar": {
    "totalEvents": 5,
    "scheduledMinutes": 300,
    "scheduledHours": 5.0,
    "byCategory": {
      "lecture": 3,
      "lab": 1,
      "study": 1
    }
  },
  "dailyBreakdown": [ ... ]
}
```

---

## 5. Unified Student Overview & Insights API

Endpoint: `GET /api/student/insights` (aliases: `GET /api/student/overview`, `GET /api/academic/insights`, `GET /api/academic/overview`).

Consolidates all student productivity and planning telemetry into a single, high-performance payload to eliminate frontend roundtrips.

### Payload Structure
- **`student`**: Student profile summary (`id`, `name`, `email`, `role`).
- **`activeGoals`**: List of active goals enriched with course name and color.
- **`goalMetrics`**: Aggregate goal telemetry (`total`, `active`, `completed`, `averageActiveProgress`).
- **`upcomingAssignments`**: Deliverables due within the next 7 days, enriched with course details and remaining hours.
- **`overdueAssignments`**: Unfinished deliverables past their deadline, enriched with days overdue.
- **`todayEvents`**: Calendar events scheduled for today (00:00:00 to 23:59:59 IST).
- **`upcomingStudySessions`**: Planned study blocks for the next 48 hours.
- **`notifications`**: Unread notification count and urgent alerts.
- **`workloadSummary`**: High-level workload distribution and urgency indicators.
- **`productivity`**: Current week productivity overview.

### Performance Optimization: Zero N+1 Queries
Courses are retrieved once in a single query and mapped in-memory:
```javascript
const courses = courseRepository.findByUser(studentId, { archived: 0 });
const courseMap = new Map(courses.map(c => [c.id, { id: c.id, name: c.name, code: c.code, color: c.color }]));
// All assignments, goals, study sessions, and events are enriched in O(1) time
```

---

## 6. End-to-End Practical Workflow Lifecycle

The integrated system implements the complete student lifecycle:

```text
Student
  ↓
Creates Course (Operating Systems)
  ↓
Creates Goal (Master OS Kernels) linked to Course
  ↓
Creates Assignment (Memory Management Lab) linked to Course & Goal
  ↓
Creates Study Session (Virtual Memory Study Block) linked to Course & Goal
  ↓
Student Insights API reflects:
  - 1 Active Goal (0% Progress)
  - 1 Upcoming Assignment
  - 1 Upcoming Study Session
  ↓
Student Completes Assignment
  ↓
Goal Progress automatically recalibrates to 50%
  ↓
Student Completes Study Session
  ↓
Productivity Metrics update:
  - 1 Completed Assignment
  - 60 Completed Study Minutes
  ↓
Student Completes remaining Goal Deliverables
  ↓
Goal reaches 100% and automatically completes
  ↓
Student Insights API reflects:
  - 0 Active Goals
  - 1 Completed Goal
  - 0 Overdue Tasks
```
