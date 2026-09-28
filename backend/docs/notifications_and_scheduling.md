# Student Notifications, Reminders & Scheduling Architecture (Day 7)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 7 of 21-Day Development Roadmap  
**Scope:** Core Backend Foundation for Student Notifications, Commute Reminders, Timezone-Safe Scheduling, and Read State Lifecycles  

---

## 1. Domain Entities & Database Schema

The Day 7 architecture builds directly on the student context and domain relationships established in Days 1–6. It provisions relational SQLite tables for notifications and commute reminders, secured with foreign keys and performance indexes.

```text
                        ┌──────────────┐
                        │    users     │ (Authenticated Account)
                        └──────┬───────┘
                               │ 1:N
        ┌──────────────────────┴──────────────────────┐
        │ 1:N                                         │ 1:N
        ▼                                             ▼
┌──────────────────┐                         ┌──────────────────┐
│    reminders     │ (Lifecycle & Schedule)  │  notifications   │ (In-App Feed & Badges)
└────────┬─────────┘                         └──────────────────┘
         │                                             ▲
         │ (Scheduler Trigger / Atomic Transition)     │
         └─────────────────────────────────────────────┘
```

### Table Definitions & Indexing

#### 1. `notifications` Table
- `id`: `TEXT PRIMARY KEY` (`notif-...`)
- `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `type`: `TEXT NOT NULL DEFAULT 'reminder'` (`'reminder'`, `'disruption'`, `'ride_group'`, `'system'`)
- `title`: `TEXT NOT NULL` (e.g. `'Board Train Soon'`)
- `message`: `TEXT NOT NULL` (e.g. `'08:35 Borivali local arrives in 10 minutes'`)
- `priority`: `TEXT NOT NULL DEFAULT 'medium'` (`'low'`, `'medium'`, `'high'`)
- `read`: `INTEGER NOT NULL DEFAULT 0` (`0` for unread, `1` for read)
- `read_at`: `INTEGER` (nullable millisecond epoch timestamp)
- `related_resource_type`: `TEXT` (e.g. `'reminder'`, `'student_schedule'`, `'ride_group'`)
- `related_resource_id`: `TEXT`
- `payload`: `TEXT DEFAULT '{}'` (JSON serialized metadata)
- `created_at`: `INTEGER NOT NULL` (millisecond epoch timestamp)
- `expires_at`: `INTEGER` (optional expiration timestamp)

**Indexes:**
- `idx_notifications_user_id`: ON `notifications(user_id)`
- `idx_notifications_user_read`: ON `notifications(user_id, read, created_at DESC)`
- `idx_notifications_user_created`: ON `notifications(user_id, created_at DESC)`

#### 2. `reminders` Table
- `id`: `TEXT PRIMARY KEY` (`rem-...`)
- `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `title`: `TEXT NOT NULL` (e.g. `'Morning CS Lecture Commute'`)
- `message`: `TEXT` (optional notes)
- `scheduled_time`: `INTEGER NOT NULL` (UTC millisecond epoch timestamp when reminder is due)
- `reminder_type`: `TEXT NOT NULL DEFAULT 'commute'` (`'commute'`, `'class'`, `'ride_group'`, `'custom'`)
- `status`: `TEXT NOT NULL DEFAULT 'scheduled'` (`'scheduled'`, `'triggered'`, `'completed'`, `'cancelled'`)
- `related_resource_type`: `TEXT` (`'student_schedule'`, `'ride_group'`, etc.)
- `related_resource_id`: `TEXT`
- `triggered_at`: `INTEGER` (nullable millisecond epoch timestamp)
- `created_at`: `INTEGER NOT NULL`
- `updated_at`: `INTEGER NOT NULL`

**Indexes:**
- `idx_reminders_user_id`: ON `reminders(user_id)`
- `idx_reminders_user_status`: ON `reminders(user_id, status)`
- `idx_reminders_scheduled_status`: ON `reminders(status, scheduled_time ASC)`

---

## 2. Reminder Lifecycle State Machine

Reminders progress through a deterministic finite-state lifecycle:

```text
               ┌─────────────┐
               │  scheduled  │
               └──────┬──────┘
                      │
          ┌───────────┼───────────┐
          │ Trigger   │ Complete  │ Cancel
          ▼           ▼           ▼
   ┌─────────────┐ ┌───────────┐ ┌───────────┐
   │  triggered  │ │ completed │ │ cancelled │
   └──────┬──────┘ └───────────┘ └───────────┘
          │
     ┌────┴────┐
     ▼         ▼
┌───────────┐ ┌───────────┐
│ completed │ │ cancelled │
└───────────┘ └───────────┘
```

1. **`scheduled`**: Initial state upon creation with future or target due timestamp. Can transition to `triggered`, `completed`, or `cancelled`.
2. **`triggered`**: Automatically transitioned by `ReminderScheduler` or on-demand via `POST /api/reminders/:id/trigger`. Triggers immediate creation of an unread `Notification` record for the owning student. Can transition to `completed` or `cancelled`.
3. **`completed`**: Terminal state reached when the commute or lecture reminder is finished. Cannot be edited or cancelled.
4. **`cancelled`**: Inactive state. Cannot be triggered or completed.

---

## 3. Timezone-Safe Scheduling Architecture

### 3.1 Assumptions & Strategy
- **Target Audience**: Mumbai students navigating Western Railway, Central Railway, Harbour Line, Metro lines, and BEST buses to reach institutions such as D.J. Sanghvi College of Engineering.
- **Reference Timezone**: **`Asia/Kolkata`** (Indian Standard Time, **UTC+05:30**), which observes no daylight saving shifts.
- **Absolute Epoch Storage**: Point-in-time triggers store `scheduled_time` as UTC Unix epoch milliseconds (`INTEGER`). Evaluating `scheduled_time <= Date.now()` is mathematically invariant to server-local timezones.
- **Timezone Utility (`backend/utils/timezone.js`)**:
  - `getMumbaiNow()`: Computes current date adjusted to IST.
  - `getMumbaiDayOfWeek()`: Returns 3-letter day of week (`'Mon'`, `'Tue'`, etc.) in IST. Prevents timezone boundary errors on Sunday evening UTC (which is Monday morning in Mumbai).
  - `getMumbaiTimeHHMM()`: Returns `'HH:MM'` (24-hour) in IST.
  - `parseMumbaiTimeToEpoch(timeHHMM, baseDate)`: Converts Mumbai local time strings into absolute UTC millisecond epochs.

### 3.2 Idempotency & Concurrency Safety
The scheduler queries due reminders using an atomic conditional update:
```sql
UPDATE reminders 
SET status = 'triggered', triggered_at = ?, updated_at = ? 
WHERE id = ? AND status = 'scheduled';
```
Only the worker or execution that receives `changes === 1` will generate the associated notification. Subsequent calls with the same timestamp or concurrent scheduler runs receive `changes === 0` and safely skip notification creation.

---

## 4. API Reference

All notification and reminder endpoints require a valid JWT passed in the `Authorization: Bearer <token>` header. All data queries and mutations are strictly scoped to `req.user.id` or `admin`.

### 4.1 Notification Endpoints

| Method | Endpoint | Query / Body Params | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | `page=1`, `limit=20`, `read=0/1`, `type`, `priority` | Paginated listing of student notifications |
| `GET` | `/api/notifications/unread` | `page=1`, `limit=20`, `type`, `priority` | Shortcut for unread notifications (`read=false`) |
| `GET` | `/api/notifications/count` | None | Returns `{ unreadCount: number }` |
| `GET` | `/api/notifications/:id` | Path: `:id` (`notif-...`) | Retrieves single notification (ownership guarded) |
| `PATCH`| `/api/notifications/:id/read`| Path: `:id` | Marks notification as read (`read = 1`, `read_at`) |
| `POST` | `/api/notifications/read-all`| None | Marks all unread notifications as read for student |
| `POST` | `/api/notifications/read-multiple` | Body: `{ ids: string[] }` | Marks selected notification IDs as read |
| `DELETE`| `/api/notifications/:id`| Path: `:id` | Deletes notification (ownership guarded) |

### 4.2 Reminder Endpoints

| Method | Endpoint | Query / Body Params | Description |
|---|---|---|---|
| `GET` | `/api/reminders` | `page=1`, `limit=20`, `status`, `reminder_type` | Paginated listing of student reminders |
| `POST` | `/api/reminders` | Body: `{ title, scheduled_time, message?, reminder_type?, related_resource_type?, related_resource_id? }` | Creates new scheduled reminder |
| `GET` | `/api/reminders/:id` | Path: `:id` (`rem-...`) | Retrieves single reminder |
| `PATCH`| `/api/reminders/:id` | Body: `{ title?, message?, scheduled_time?, reminder_type? }` | Updates scheduled reminder |
| `POST` | `/api/reminders/:id/trigger` | Path: `:id` | Manually triggers reminder & creates notification |
| `POST` | `/api/reminders/:id/complete` | Path: `:id` | Marks reminder as completed |
| `POST` | `/api/reminders/:id/cancel` | Path: `:id` | Cancels scheduled reminder |
| `DELETE`| `/api/reminders/:id` | Path: `:id` | Deletes reminder record |

---

## 5. Background Scheduler Execution

The background scheduler can be run in two modes:
1. **On-Demand / Webhook / Cron Tick**:
   ```javascript
   const { reminderScheduler } = require('./services');
   const report = reminderScheduler.processDueReminders(Date.now());
   console.log(`Triggered ${report.processedCount} reminders`);
   ```
2. **In-Process Interval Worker**:
   ```javascript
   const { reminderScheduler } = require('./services');
   reminderScheduler.startScheduler({ intervalMs: 30000 }); // Evaluates every 30 seconds
   // Graceful teardown:
   reminderScheduler.stopScheduler();
   ```

---

## 6. Verification and Testing

Execute the test suites via `npm`:

```bash
# Day 7 Specific Suites
npm run verify:notification-models     # Verifies models, defaults, and schema
npm run verify:notification-service    # Verifies notification service & repository
npm run verify:reminder-service        # Verifies reminder lifecycle & transitions
npm run verify:reminder-scheduler      # Verifies due processing & timezone logic
npm run verify:notification-api        # Verifies HTTP endpoints, auth, and validation
npm run test:notification              # End-to-end integration test suite

# Complete Comprehensive Verification (All 29 Suites)
npm run test:all
```
