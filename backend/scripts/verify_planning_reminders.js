/**
 * Verification Script: Planning Reminders & Schedule Integration
 */

const assert = require('assert');
const { CalendarEventService } = require('../services/calendarEventService');
const { CalendarEventRepository } = require('../repositories/CalendarEventRepository');
const { StudySessionService } = require('../services/studySessionService');
const { StudySessionRepository } = require('../repositories/StudySessionRepository');
const { CourseRepository } = require('../repositories/CourseRepository');
const { AssignmentRepository } = require('../repositories/AssignmentRepository');
const { ReminderRepository } = require('../repositories/ReminderRepository');
const { NotificationRepository } = require('../repositories/NotificationRepository');
const { NotificationService } = require('../services/notificationService');
const { ReminderScheduler } = require('../services/reminderScheduler');
const { getConnection } = require('../db/connection');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

console.log('====================================================');
console.log(' Running Planning Reminders Integration Test Suite');
console.log('====================================================\n');

const db = getConnection();
const eventRepo = new CalendarEventRepository(db);
const studyRepo = new StudySessionRepository(db);
const courseRepo = new CourseRepository(db);
const asgnRepo = new AssignmentRepository(db);
const remRepo = new ReminderRepository(db);
const notifRepo = new NotificationRepository(db);
const notifSvc = new NotificationService(notifRepo);
const scheduler = new ReminderScheduler(remRepo, notifSvc, null, db);

const calService = new CalendarEventService(eventRepo, courseRepo, remRepo);
const studyService = new StudySessionService(studyRepo, courseRepo, asgnRepo, remRepo);

const testUser = `stu-rem-${Date.now()}`;
db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Reminder Student', 'DJSCE', 'student', ?, ?)")
  .run(testUser, `${testUser}@example.com`, Date.now(), Date.now());

const now = Date.now();
const futureEventTime = now + (2 * 3600 * 1000); // 2 hours from now
const futureStudyTime = now + (3 * 3600 * 1000); // 3 hours from now

(async () => {
  let createdEvent = null;
  let createdSession = null;

  // 1. Calendar Event Reminder Creation
  await runAsyncTest('Event -> Reminder: creating calendar event auto-schedules reminder', async () => {
    createdEvent = await calService.createEvent(testUser, {
      title: 'Database Systems Final Exam',
      event_type: 'exam',
      start_time: futureEventTime,
      end_time: futureEventTime + (2 * 3600 * 1000),
      reminder_enabled: 1,
      reminder_lead_time_minutes: 30
    });

    const reminders = remRepo.findByResource('calendar_event', createdEvent.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].status, 'scheduled');
    assert.strictEqual(reminders[0].reminder_type, 'calendar_event');
    assert.strictEqual(reminders[0].scheduled_time, futureEventTime - (30 * 60 * 1000));
    assert(reminders[0].title.includes('Database Systems Final Exam'));
  });

  // 2. Duplicate Prevention & Time Update
  await runAsyncTest('Event Time Update: updating event start_time updates existing reminder scheduled_time', async () => {
    const updatedStartTime = futureEventTime + (3600 * 1000); // shifted by 1 hour
    const updated = await calService.updateEvent(testUser, createdEvent.id, {
      start_time: updatedStartTime,
      end_time: updatedStartTime + (2 * 3600 * 1000)
    });

    const reminders = remRepo.findByResource('calendar_event', createdEvent.id);
    assert.strictEqual(reminders.length, 1, 'Should preserve single active reminder without duplicates');
    assert.strictEqual(reminders[0].status, 'scheduled');
    assert.strictEqual(reminders[0].scheduled_time, updatedStartTime - (30 * 60 * 1000));
  });

  // 3. Event Cancellation cancels reminder
  await runAsyncTest('Event Cancellation: cancelling event sets reminder to cancelled', async () => {
    await calService.updateEvent(testUser, createdEvent.id, {
      status: 'cancelled'
    });

    const reminders = remRepo.findByResource('calendar_event', createdEvent.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].status, 'cancelled');
  });

  // 4. Study Session Reminder Creation
  await runAsyncTest('Study Session -> Reminder: creating study session auto-schedules reminder', async () => {
    createdSession = await studyService.createSession(testUser, {
      title: 'Operating Systems Virtual Memory Prep',
      planned_start_time: futureStudyTime,
      planned_duration_minutes: 90,
      reminder_enabled: 1,
      reminder_lead_time_minutes: 15
    });

    const reminders = remRepo.findByResource('study_session', createdSession.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].status, 'scheduled');
    assert.strictEqual(reminders[0].reminder_type, 'study_session');
    assert.strictEqual(reminders[0].scheduled_time, futureStudyTime - (15 * 60 * 1000));
  });

  // 5. Session Time Update
  await runAsyncTest('Session Time Update: updating planned_start_time reschedules reminder', async () => {
    const newStudyTime = futureStudyTime + (3600 * 1000);
    await studyService.updateSession(testUser, createdSession.id, {
      planned_start_time: newStudyTime
    });

    const reminders = remRepo.findByResource('study_session', createdSession.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].status, 'scheduled');
    assert.strictEqual(reminders[0].scheduled_time, newStudyTime - (15 * 60 * 1000));
  });

  // 6. Session Completion cancels reminder
  await runAsyncTest('Session Completion: marking study session completed cancels reminder', async () => {
    await studyService.updateStatus(testUser, createdSession.id, 'completed', 85);

    const reminders = remRepo.findByResource('study_session', createdSession.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].status, 'cancelled');
  });

  // 7. Scheduler Trigger -> Notification
  await runAsyncTest('Scheduler Trigger: processes due reminder and creates student in-app notification', async () => {
    // Create an immediate event
    const urgentEvent = await calService.createEvent(testUser, {
      title: 'Urgent Lab Submission Viva',
      event_type: 'exam',
      start_time: Date.now() + 60000,
      end_time: Date.now() + 3600000,
      reminder_enabled: 1,
      reminder_lead_time_minutes: 5 // Trigger timestamp is in past/now
    });

    const reminders = remRepo.findByResource('calendar_event', urgentEvent.id);
    assert(reminders.length >= 1);
    const targetRem = reminders[0];

    // Force scheduled time to past
    db.prepare("UPDATE reminders SET scheduled_time = ? WHERE id = ?")
      .run(Date.now() - 1000, targetRem.id);

    const result = scheduler.processDueReminders(Date.now());
    assert(result.processedCount >= 1);
    assert(result.triggeredIds.includes(targetRem.id));

    // Verify in-app notification was dispatched to student
    const notifs = notifRepo.findByUserId(testUser);
    assert(notifs.some(n => n.title.includes('Urgent Lab Submission Viva')));

    // Clean up
    await calService.deleteEvent(testUser, urgentEvent.id);
  });

  // 8. Deletion cleans up reminders
  await runAsyncTest('Deletion Cleanup: deleting study session cleans up reminder records', async () => {
    await studyService.deleteSession(testUser, createdSession.id);
    const reminders = remRepo.findByResource('study_session', createdSession.id);
    assert.strictEqual(reminders.length, 0);
  });

  console.log('\n----------------------------------------------------');
  console.log(` PLANNING REMINDERS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
