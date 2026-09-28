# Student Notification & Scheduling Architecture Audit (Day 7)

**Author:** Skan (Backend Developer)  
**Roadmap Phase:** Day 7 of 21-Day Development Roadmap  
**Scope:** Core Backend Foundation for Student Notifications, Reminders, and Timezone-Safe Scheduling  

---

## 1. Executive Summary

On Day 6, the backend established the core student domain workflow layer—including `student_profiles`, recurring `student_schedules`, bookmarked `saved_routes`, and `ride_group_members`—complete with isolated querying, filtering, and a unified student dashboard aggregation service.

The objective of Day 7 is to construct the backend foundation for **student notifications, reminders, and scheduled events**. This enables students to schedule commute reminders (e.g. departure alerts before classes or shared rides), allows the backend to automatically transition due reminders into persistent notifications, and exposes authenticated APIs for reading, filtering, and marking notifications as read.

---

## 2. Audit of Existing Backend Architecture

### 2.1 Existing Models & Relational Schema
An inspection of the repository (`backend/models/`, `backend/db/database.js`, and `backend/migrations/scripts/`) reveals:

1. **`users` (`002_create_users_table.js`)**:
   - `id`, `name`, `email`, `password_hash`, `college_name`, `role`, `created_at`, `updated_at`.
   - Represents authenticated student identity.
2. **`student_profiles` (`003_student_domain_relationships.js`)**:
   - `user_id` (PK, FK to `users`), `home_area`, `default_college`, `preferred_modes`, `walking_tolerance_minutes`, `max_budget_rupees`, `default_arrival_time`.
3. **`student_schedules` (`003_student_domain_relationships.js`)**:
   - `id`, `user_id`, `title`, `origin`, `destination`, `target_arrival_time` (e.g. `'08:45'`), `days_of_week` (JSON array, e.g. `['Mon', 'Wed']`), `reminder_enabled` (`0` or `1`), `active` (`0` or `1`), `created_at`, `updated_at`.
   - *Observation*: The `reminder_enabled` flag and `target_arrival_time` already exist as domain concepts on recurring student schedules, but no reminder execution mechanism was attached to them.
4. **`saved_routes` (`003_student_domain_relationships.js`)**:
   - `id`, `user_id`, `name`, `origin`, `destination`, `preferred_mode`, `max_budget`, `tags`.
5. **`ride_groups` & `ride_group_members`**:
   - `id`, `name`, `origin`, `destination`, `departure_time` (e.g. `'08:30'`), `status` (`'open'`, `'full'`, etc.).
6. **`live_reports`**:
   - `id`, `route_name`, `area`, `disruption_type`, `severity`, `message`, `status`, `expires_at`.

### 2.2 Existing Notification & Reminder Facilities
- **Notification Models/Tables**: None currently exist.
- **Reminder Models/Tables**: None currently exist.
- **Background Jobs / Schedulers / Cron**: None currently exist. No external cron daemon (e.g. node-cron, BullMQ, Agenda) is installed, and package dependencies are kept lean: `express`, `cors`, `zod`, `dotenv`, `jsonwebtoken`.

---

## 3. Date, Time, and Timezone Representation Audit

### 3.1 Current Representation Patterns
Across Days 1–6, timestamps and time strings are represented as follows:
- **Unix Epoch Milliseconds (`INTEGER`)**: Stored in SQLite for `created_at`, `updated_at`, `expires_at`, `cached_at`, and `joined_at` using `Date.now()`.
- **24-Hour Time-of-Day Strings (`TEXT`)**: Stored as `'HH:MM'` (e.g. `'08:45'`, `'09:00'`) in `student_schedules.target_arrival_time` and `ride_groups.departure_time`.
- **ISO-8601 Strings (`TEXT`)**: Used in API response envelopes (`timestamp: new Date().toISOString()`).

### 3.2 Timezone Assumptions & Pitfalls
- **Domain Context**: Smart Student Commute Companion targets students in the Mumbai Metropolitan Region (MMR) traveling to colleges such as D.J. Sanghvi College of Engineering across Western, Central, Metro, and BEST networks.
- **Local Timezone**: Indian Standard Time (`IST`), which is **UTC+05:30** (`Asia/Kolkata`) with no Daylight Saving Time.
- **Server Environment**: Production servers, cloud containers, or CI runners generally run with system clock set to **UTC**.
- **Potential Inconsistencies**:
  - Calling `new Date().getDay()` or `new Date().getHours()` on a UTC server causes a 5 hour 30 minute offset. For instance, at 21:00 UTC on Sunday, it is already 02:30 IST on Monday morning. Schedules intended for Monday morning would fail to trigger if evaluated using UTC day-of-week.
  - Comparing a local time string like `'08:30'` directly against UTC server hours would evaluate 8:30 AM UTC (which is 2:00 PM IST).

### 3.3 Timezone Strategy for Day 7
1. **Absolute Triggers**: Reminders with explicit point-in-time triggers will store `scheduled_time` as a 64-bit millisecond integer timestamp (`INTEGER` in SQLite), representing UTC epoch milliseconds. Comparing `scheduled_time <= Date.now()` is completely invariant to server timezone.
2. **Local Time Calculation Helper**: Provide a dedicated timezone utility (`backend/utils/timezone.js`) configured for `'Asia/Kolkata'` (UTC+05:30) to compute current IST day-of-week (`Mon`, `Tue`, etc.) and current IST `'HH:MM'`.
3. **Display Formatting**: Deliver timestamps as ISO-8601 strings or integer milliseconds in API payloads so frontend (Xcaliber) can render them in student-local time.

---

## 4. Architectural Design: Reminders, Scheduling, and Notifications

### 4.1 Unidirectional Lifecycle Architecture

```text
               Authenticated Student / System Trigger
                                │
                                ▼
                         [Reminders API]
                                │ (POST /api/reminders)
                                ▼
                         ReminderService
                                │
                        ReminderRepository
                                │ (Stores with status = 'scheduled')
                                ▼
                      ┌──────────────────┐
                      │    reminders     │
                      └─────────┬────────┘
                                │
                                │ (Polling / Event Tick: scheduled_time <= now)
                                ▼
                        ReminderScheduler
                                │ (Atomic transition: 'scheduled' -> 'triggered')
                                ▼
                       NotificationService
                                │ (Creates notification for owning student)
                                ▼
                    ┌──────────────────────┐
                    │    notifications     │
                    └──────────┬───────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   GET /api/notifications             PATCH /api/notifications/:id/read
   (Fetch unread / filtered)            (Mark as read / unread)
```

### 4.2 Data Model Definitions

#### 1. `reminders` Table
- `id`: `TEXT PRIMARY KEY` (`rem-...`)
- `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `title`: `TEXT NOT NULL` (e.g. `'Catch 08:15 Borivali Fast'`)
- `message`: `TEXT`
- `scheduled_time`: `INTEGER NOT NULL` (UTC epoch milliseconds when reminder is due)
- `reminder_type`: `TEXT NOT NULL` (`'commute'`, `'class'`, `'ride_group'`, `'custom'`)
- `status`: `TEXT NOT NULL DEFAULT 'scheduled'` (`'scheduled'`, `'triggered'`, `'completed'`, `'cancelled'`)
- `related_resource_type`: `TEXT` (`'student_schedule'`, `'ride_group'`, `'route'`)
- `related_resource_id`: `TEXT`
- `triggered_at`: `INTEGER` (nullable)
- `created_at`: `INTEGER NOT NULL`
- `updated_at`: `INTEGER NOT NULL`

Indexes:
- `idx_reminders_user_status` ON `(user_id, status)`
- `idx_reminders_scheduled_status` ON `(status, scheduled_time)`

#### 2. `notifications` Table
- `id`: `TEXT PRIMARY KEY` (`notif-...`)
- `user_id`: `TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `type`: `TEXT NOT NULL` (`'reminder'`, `'disruption'`, `'ride_group'`, `'system'`)
- `title`: `TEXT NOT NULL`
- `message`: `TEXT NOT NULL`
- `priority`: `TEXT NOT NULL DEFAULT 'medium'` (`'low'`, `'medium'`, `'high'`)
- `read`: `INTEGER NOT NULL DEFAULT 0` (`0` or `1`)
- `read_at`: `INTEGER` (nullable)
- `related_resource_type`: `TEXT`
- `related_resource_id`: `TEXT`
- `payload`: `TEXT` (JSON serialized metadata)
- `created_at`: `INTEGER NOT NULL`
- `expires_at`: `INTEGER` (nullable)

Indexes:
- `idx_notifications_user_read` ON `(user_id, read, created_at DESC)`
- `idx_notifications_user_created` ON `(user_id, created_at DESC)`

---

## 5. Scheduling & Idempotency Engine

To avoid pulling heavy external dependencies while preserving clean decoupling:
1. **`ReminderScheduler`**:
   - Exposes `processDueReminders(asOfTime = Date.now())`.
   - Executes inside a transaction or atomic conditional query:
     ```sql
     SELECT * FROM reminders 
     WHERE status = 'scheduled' AND scheduled_time <= ?
     ORDER BY scheduled_time ASC
     LIMIT 50;
     ```
   - For each due reminder, atomically transitions `status = 'triggered'` and invokes `NotificationService.createNotification(...)`.
   - **Idempotency Guarantee**: If a reminder has already transitioned to `'triggered'`, subsequent scheduler ticks ignore it.
2. **Background Processing**:
   - Provides `startScheduler({ intervalMs })` and `stopScheduler()` for background tick evaluation.
   - Clean shutdown hooks prevent dangling timers during test execution and graceful server termination.

---

## 6. Implementation Plan for Day 7 Tasks

| Task | Target | Key Deliverable |
|---|---|---|
| **Task 1** | Architecture Audit | `backend/docs/notification_scheduling_audit.md` |
| **Task 2** | Notification & Reminder Data Models | Migration `004_notifications_and_reminders.js`, Models `Notification.js`, `Reminder.js`, DB schema |
| **Task 3** | Notification Service & Repository | `NotificationRepository.js`, `notificationService.js`, service tests |
| **Task 4** | Reminder Lifecycle & Service | `ReminderRepository.js`, `reminderService.js`, lifecycle state machine |
| **Task 5** | Timezone-Safe Scheduling | `backend/utils/timezone.js`, `reminderScheduler.js`, due processor tests |
| **Task 6** | Notification & Reminder APIs | `notificationController.js`, `reminderController.js`, routes, validators |
| **Task 7** | Integration Tests & Final Docs | `integration_notification_test.js`, full suite pass, documentation |
