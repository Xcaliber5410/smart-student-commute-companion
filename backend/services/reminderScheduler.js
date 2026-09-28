/**
 * ReminderScheduler Service
 *
 * Provides timezone-safe scheduled processing for student commute reminders.
 * Scans for due reminders, guarantees atomic state transitions, creates persistent
 * notifications, and prevents duplicate processing.
 */

const { reminderRepository } = require('../repositories/ReminderRepository');
const { notificationService } = require('./notificationService');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { getMumbaiDayOfWeek, parseMumbaiTimeToEpoch } = require('../utils/timezone');
const { getConnection } = require('../db/connection');

class ReminderScheduler {
  constructor(
    remRepo = reminderRepository,
    notifSvc = notificationService,
    schedRepo = studentScheduleRepository,
    dbInstance = null
  ) {
    this.remRepo = remRepo;
    this.notifSvc = notifSvc;
    this.schedRepo = schedRepo;
    this.db = dbInstance;
    this.timer = null;
    this.isRunning = false;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Identifies all reminders that are due (scheduled_time <= asOfTime),
   * transitions them to 'triggered' atomically, and generates student notifications.
   *
   * @param {number} [asOfTime=Date.now()] - UTC epoch millisecond timestamp
   * @param {object} [options={}]
   * @returns {object} Processing report: { processedCount, triggeredIds }
   */
  processDueReminders(asOfTime = Date.now(), options = {}) {
    const limit = options.limit || 50;
    const dueReminders = this.remRepo.findDueReminders(asOfTime, limit);

    const triggeredIds = [];

    for (const reminder of dueReminders) {
      // Atomic status update: guarantees idempotency even if multiple scheduler ticks overlap
      const stmt = this.database.prepare(`
        UPDATE reminders 
        SET status = 'triggered', triggered_at = ?, updated_at = ? 
        WHERE id = ? AND status = 'scheduled'
      `);

      const result = stmt.run(asOfTime, asOfTime, reminder.id);

      // Only dispatch notification if this worker successfully transitioned the status
      if (result.changes === 1) {
        try {
          this.notifSvc.createNotification(reminder.user_id, {
            type: 'reminder',
            title: reminder.title,
            message: reminder.message || `Commute reminder: ${reminder.title}`,
            priority: 'high',
            related_resource_type: reminder.related_resource_type || 'reminder',
            related_resource_id: reminder.id,
            payload: {
              reminderId: reminder.id,
              scheduledTime: reminder.scheduled_time
            }
          });

          triggeredIds.push(reminder.id);
        } catch (err) {
          console.error(`[ReminderScheduler] Failed to create notification for reminder ${reminder.id}:`, err.message);
        }
      }
    }

    return {
      processedCount: triggeredIds.length,
      triggeredIds
    };
  }

  /**
   * Scans recurring schedules for today in Mumbai time and schedules daily reminders
   * if reminder_enabled is true.
   *
   * @param {number} [asOfTime=Date.now()]
   * @param {number} [leadMinutes=30]
   * @returns {object} { scheduledCount, scheduleIds }
   */
  syncRecurringScheduleReminders(asOfTime = Date.now(), leadMinutes = 30) {
    const now = new Date(asOfTime);
    const todayDay = getMumbaiDayOfWeek(now);
    const scheduledIds = [];

    const activeSchedules = this.schedRepo.findActiveSchedulesForDay(todayDay);

    for (const schedule of activeSchedules) {
      if (!schedule.reminder_enabled) continue;

      try {
        const arrivalEpoch = parseMumbaiTimeToEpoch(schedule.target_arrival_time, now);
        const reminderTime = arrivalEpoch - (leadMinutes * 60 * 1000);

        // Only create if reminder is upcoming today (within the next 12 hours)
        if (reminderTime > asOfTime - 3600000 && reminderTime < asOfTime + 12 * 3600000) {
          // Check if reminder was already scheduled for this schedule today
          const existing = this.remRepo.findByUserId(schedule.user_id, {
            status: 'scheduled'
          }).find(r => r.related_resource_id === schedule.id && Math.abs(r.scheduled_time - reminderTime) < 300000);

          if (!existing) {
            this.remRepo.create({
              user_id: schedule.user_id,
              title: `Commute Routine: ${schedule.title}`,
              message: `Time to depart from ${schedule.origin} for arrival at ${schedule.destination} by ${schedule.target_arrival_time}`,
              scheduled_time: reminderTime,
              reminder_type: 'commute',
              related_resource_type: 'student_schedule',
              related_resource_id: schedule.id,
              status: 'scheduled'
            });
            scheduledIds.push(schedule.id);
          }
        }
      } catch (err) {
        // Skip invalid schedule times gracefully
      }
    }

    return {
      scheduledCount: scheduledIds.length,
      scheduleIds: scheduledIds
    };
  }

  /**
   * Starts background recurring processing.
   */
  startScheduler(options = {}) {
    if (this.isRunning) return;

    const intervalMs = options.intervalMs || 60000;
    this.isRunning = true;

    this.timer = setInterval(() => {
      try {
        this.processDueReminders();
      } catch (err) {
        console.error('[ReminderScheduler] Error during scheduled tick:', err.message);
      }
    }, intervalMs);

    // Unref timer so node process can cleanly exit if needed
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  /**
   * Stops background processing.
   */
  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  isSchedulerRunning() {
    return this.isRunning;
  }
}

const reminderScheduler = new ReminderScheduler();

module.exports = {
  ReminderScheduler,
  reminderScheduler
};
