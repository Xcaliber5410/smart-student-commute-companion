# Student Domain & Workflows Architecture (Day 6)

## 1. Domain Entities & Relationships

The Day 6 architecture models core student daily commute workflows with relational persistence in SQLite:

```
                            ┌──────────────┐
                            │    users     │ (Authenticated Account)
                            └──────┬───────┘
                                   │ 1:1
                                   ▼
                        ┌─────────────────────┐
                        │  student_profiles   │ (Commute Preferences & Defaults)
                        └─────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │ 1:N                     │ 1:N                     │ M:N
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐     ┌─────────────────────┐
│student_schedules │      │   saved_routes   │     │ ride_group_members  │
└──────────────────┘      └──────────────────┘     └──────────┬──────────┘
(Recurring Daily           (Bookmarked Direct                 │
 Commute Routines)          Shortcuts & Tags)                 ▼
                                                   ┌─────────────────────┐
                                                   │     ride_groups     │
                                                   └─────────────────────┘
```

### Table Definitions & Foreign Key Constraints

1. **`student_profiles`**:
   - `user_id`: `TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
   - `home_area`: Student's origin neighborhood (e.g. `'Borivali West'`).
   - `default_college`: Primary destination college.
   - `preferred_modes`: JSON array of preferred travel modes (`['metro', 'train', 'bus', 'auto', 'walk']`).
   - `walking_tolerance_minutes`: Maximum acceptable walking duration (default `15`).
   - `max_budget_rupees`: Commute cost ceiling per trip (default `100`).
   - `default_arrival_time`: Target daily reporting time (default `'09:00'`).

2. **`student_schedules`**:
   - `id`: Unique schedule ID (`sch-...`).
   - `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`.
   - `title`: Schedule routine title (e.g. `'Morning CS Lecture'`).
   - `origin`, `destination`: Commute route endpoints.
   - `target_arrival_time`: Target arrival time (`'08:45'`).
   - `days_of_week`: JSON array (`['Mon', 'Wed', 'Fri']`).
   - `reminder_enabled`: 0 or 1.
   - `active`: 0 or 1.

3. **`saved_routes`**:
   - `id`: Unique route ID (`route-...`).
   - `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`.
   - `name`: Human-readable bookmark label.
   - `origin`, `destination`: Locations.
   - `preferred_mode`: Transit mode preference (`'metro'`, `'train'`, etc.).
   - `max_budget`: Budget ceiling in Rupees.
   - `tags`: JSON array of tags (e.g. `['fast', 'ac']`).

4. **`ride_group_members`**:
   - `id`: Auto-increment integer primary key.
   - `group_id`: `TEXT NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE`.
   - `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`.
   - `role`: `'creator'` or `'member'`.
   - `joined_at`: Timestamp integer.
   - `UNIQUE(group_id, user_id)`: Prevents duplicate joins.

---

## 2. Service Layer Responsibilities

1. **`StudentContextService`**:
   - Resolves unified student identity: merges `users` account info with `student_profiles` preferences.
   - Provides safe fallback defaults if profile hasn't been initialized yet.
   - Enforces strict ownership checks (`studentUserId === requestingUser.id` or `admin`).

2. **`StudentScheduleService`**:
   - Manages recurring schedules for classes, labs, and internships.
   - Handles creation, updates, deletion, active/paused toggles, and time filtering.
   - Supports search by keyword across title, origin, and destination.

3. **`SavedRouteService`**:
   - Manages student's bookmarked shortcut routes.
   - Enforces ownership isolation (students cannot see or modify other students' routes).
   - Provides filtering by transit mode, tags, budget limits, and search strings.

4. **`RideGroupService`** (Strengthened):
   - Atomically updates `ride_groups.current_members` AND inserts/deletes `ride_group_members` inside a single SQLite transaction.
   - Enforces capacity checks and prevents group creators or already registered members from duplicate joining.
   - Provides `listStudentGroups` to query groups joined or created by an authenticated student.

5. **`StudentDashboardService`**:
   - Aggregates multi-entity context in a single optimized payload for Xcaliber's frontend:
     - Student profile and commute defaults.
     - Schedule summary, including today's routines and upcoming `next_commute`.
     - Recent saved routes.
     - Joined and created ride groups.
     - Live disruption alerts relevant to the student's home area or destination college.
     - High-level quick stats counters.

---

## 3. Query, Search & Filtering Capabilities

All student list endpoints utilize standardized query parameters, schema validation, and clamped pagination:

| Filter Parameter | Schema / Type | Applied To | Description |
|------------------|---------------|------------|-------------|
| `page` | Integer >= 1 (Default: `1`) | All list endpoints | Page number |
| `limit` | Integer 1–50 (Default: `20`) | All list endpoints | Clamped results per page |
| `search` | String | Schedules, Routes, Groups | Substring match against names/places |
| `active` | Boolean / String ('true'/'false') | Schedules | Filter active vs paused routines |
| `day_of_week` / `day` | String (`'Mon'`, `'Tue'`, etc.) | Schedules | Filter schedules matching day |
| `preferred_mode` | Enum (`'train'`, `'metro'`, etc.) | Saved Routes | Filter by transit mode |
| `max_budget` | Numeric | Saved Routes | Filter routes within budget ceiling |
| `tag` | String | Saved Routes | Filter routes tagged with keyword |
| `role` | Enum (`'creator'`, `'member'`) | Ride Groups | Filter student created vs joined groups |

---

## 4. Performance & Database Optimization

1. **Compound Indexes**:
   - `idx_saved_routes_user_mode`: `saved_routes(user_id, preferred_mode)`
   - `idx_saved_routes_user_created`: `saved_routes(user_id, created_at DESC)`
   - `idx_student_schedules_user_active_time`: `student_schedules(user_id, active, target_arrival_time)`
   - `idx_rg_members_user_role`: `ride_group_members(user_id, role)`

2. **Index Utilization**:
   - Confirmed via `EXPLAIN QUERY PLAN` that student routine queries, route searches, and group listings utilize SQLite B-Tree indices (`USING INDEX`).

3. **Transaction Boundaries**:
   - Group join/leave operations execute member counting and relational table mutations inside `this.database.transaction()`.

4. **Bounded Pagination**:
   - All repository search queries enforce `LIMIT ? OFFSET ?` with strict upper bounds (`limit <= 50`) to prevent memory exhaustion and unbounded table scans.

---

## 5. API Endpoints Reference

All `/api/student/*` routes require HTTP header `Authorization: Bearer <JWT>`:

- `GET /api/student/context` — Returns student account, profile, and commute defaults.
- `PUT /api/student/profile` — Updates home area, preferred modes, budget, walking tolerance.
- `GET /api/student/schedules` — List schedules with `?active=&search=&day=&page=&limit=`.
- `POST /api/student/schedules` — Create a new recurring schedule.
- `GET /api/student/schedules/:id` — Retrieve a single schedule by ID.
- `PUT /api/student/schedules/:id` — Update schedule parameters or toggle active status.
- `DELETE /api/student/schedules/:id` — Remove schedule.
- `GET /api/student/saved-routes` — List saved routes with `?preferred_mode=&tag=&search=&page=&limit=`.
- `POST /api/student/saved-routes` — Bookmark a new route.
- `GET /api/student/saved-routes/:id` — Retrieve route by ID.
- `PUT /api/student/saved-routes/:id` — Update route name, budget, or tags.
- `DELETE /api/student/saved-routes/:id` — Delete saved route.
- `GET /api/student/ride-groups` — List student joined/created groups with `?role=&search=&page=&limit=`.
- `GET /api/student/dashboard` — Unified dashboard summary with today's schedules, next commute, alerts, and quick stats.
