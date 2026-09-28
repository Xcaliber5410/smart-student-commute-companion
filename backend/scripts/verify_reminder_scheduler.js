/**
 * Verification Script: Timezone-Safe Reminder Scheduler & Due Processing (Task 5)
 */

const assert = require('assert');
const { reminderScheduler } = require('../services/reminderScheduler');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  getMumbaiNow,
  getMumbaiDayOfWeek,
  getMumbaiTimeHHMM,
  parseMumbaiTimeToEpoch,
  formatInMumbaiTime,
  IST_OFFSET_MS
} = require('../utils/timezone');

async function run() {
  console.log('====================================================');
  console.log(' Running Timezone-Safe Reminder Scheduler Verification');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
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

  // Ensure test student exists
  let user = userRepository.findByEmail('sched.student@djsce.edu');
  if (!user) {
    user = userRepository.create({
      email: 'sched.student@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Tanvi Joshi',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }
  const studentId = user.id;

  // 1. Timezone Calculation Tests
  test('Timezone: verifies Mumbai IST (+05:30) conversion and day-of-week', () => {
    // Midnight Sunday UTC: 2026-09-27T20:00:00Z -> In IST, this is Monday 01:30 AM!
    const testDateUtc = new Date('2026-09-27T20:00:00.000Z');
    const istDay = getMumbaiDayOfWeek(testDateUtc);
    assert.strictEqual(istDay, 'Mon', 'Sunday night UTC must correctly be Monday in Mumbai IST');

    const istTime = getMumbaiTimeHHMM(testDateUtc);
    assert.strictEqual(istTime, '01:30', 'UTC 20:00 must be 01:30 in Mumbai');

    // Parse '08:45' on that day
    const epoch = parseMumbaiTimeToEpoch('08:45', testDateUtc);
    assert.ok(epoch > 0);
    const formatted = formatInMumbaiTime(epoch);
    assert.ok(formatted.includes('08:45:00'));
  });

  // 2. Due Reminder Detection
  test('ReminderScheduler: detects and triggers due reminders', () => {
    const now = Date.now();
    const pastTime = now - 5000; // 5s ago

    const dueRem = reminderRepository.create({
      user_id: studentId,
      title: 'Due Commute Alert',
      message: 'Catch Western Line local now',
      scheduled_time: pastTime,
      reminder_type: 'commute',
      status: 'scheduled'
    });

    const notifCountBefore = notificationRepository.getUnreadCount(studentId);

    const report = reminderScheduler.processDueReminders(now);
    assert.ok(report.processedCount >= 1);
    assert.ok(report.triggeredIds.includes(dueRem.id));

    // Verify reminder status in database is now 'triggered'
    const updatedRem = reminderRepository.findById(dueRem.id);
    assert.strictEqual(updatedRem.status, 'triggered');
    assert.strictEqual(updatedRem.triggered_at, now);

    // Verify corresponding notification was generated
    const notifCountAfter = notificationRepository.getUnreadCount(studentId);
    assert.strictEqual(notifCountAfter, notifCountBefore + 1);

    const notifs = notificationRepository.findByUserId(studentId);
    const matchingNotif = notifs.find(n => n.related_resource_id === dueRem.id);
    assert.ok(matchingNotif);
    assert.strictEqual(matchingNotif.title, 'Due Commute Alert');
  });

  // 3. Future Reminder Exclusion
  test('ReminderScheduler: excludes future reminders from triggering', () => {
    const now = Date.now();
    const futureTime = now + 600000; // 10 minutes in future

    const futureRem = reminderRepository.create({
      user_id: studentId,
      title: 'Future Commute Alert',
      scheduled_time: futureTime,
      reminder_type: 'commute',
      status: 'scheduled'
    });

    const report = reminderScheduler.processDueReminders(now);
    assert.strictEqual(report.triggeredIds.includes(futureRem.id), false);

    const checkRem = reminderRepository.findById(futureRem.id);
    assert.strictEqual(checkRem.status, 'scheduled');
    assert.strictEqual(checkRem.triggered_at, null);
  });

  // 4. Idempotency Check (No duplicate notification generation)
  test('ReminderScheduler: ensures idempotent processing on repeated execution', () => {
    const now = Date.now();
    const pastTime = now - 2000;

    const testRem = reminderRepository.create({
      user_id: studentId,
      title: 'Idempotency Test Reminder',
      scheduled_time: pastTime,
      reminder_type: 'commute',
      status: 'scheduled'
    });

    // Run 1: Should trigger
    const run1 = reminderScheduler.processDueReminders(now);
    assert.ok(run1.triggeredIds.includes(testRem.id));

    const notifsCountAfterRun1 = notificationRepository.findByUserId(studentId)
      .filter(n => n.related_resource_id === testRem.id).length;
    assert.strictEqual(notifsCountAfterRun1, 1);

    // Run 2: Same timestamp, already triggered. Must NOT trigger again
    const run2 = reminderScheduler.processDueReminders(now);
    assert.strictEqual(run2.triggeredIds.includes(testRem.id), false);

    const notifsCountAfterRun2 = notificationRepository.findByUserId(studentId)
      .filter(n => n.related_resource_id === testRem.id).length;
    assert.strictEqual(notifsCountAfterRun2, 1, 'Duplicate notification was NOT created');
  });

  // 5. Already Processed Reminders Ignored
  test('ReminderScheduler: ignores cancelled or completed reminders', () => {
    const now = Date.now();

    const cancelledRem = reminderRepository.create({
      user_id: studentId,
      title: 'Cancelled Reminder',
      scheduled_time: now - 10000,
      status: 'cancelled'
    });

    const completedRem = reminderRepository.create({
      user_id: studentId,
      title: 'Completed Reminder',
      scheduled_time: now - 10000,
      status: 'completed'
    });

    const report = reminderScheduler.processDueReminders(now);
    assert.strictEqual(report.triggeredIds.includes(cancelledRem.id), false);
    assert.strictEqual(report.triggeredIds.includes(completedRem.id), false);
  });

  // 6. Background Scheduler Start & Stop
  test('ReminderScheduler: starts and stops background timer cleanly', () => {
    assert.strictEqual(reminderScheduler.isSchedulerRunning(), false);

    reminderScheduler.startScheduler({ intervalMs: 1000 });
    assert.strictEqual(reminderScheduler.isSchedulerRunning(), true);

    reminderScheduler.stopScheduler();
    assert.strictEqual(reminderScheduler.isSchedulerRunning(), false);
  });

  console.log('\n----------------------------------------------------');
  console.log(` REMINDER SCHEDULER SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
