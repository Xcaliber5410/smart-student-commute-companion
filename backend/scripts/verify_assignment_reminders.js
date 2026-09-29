/**
 * Verification Script: Assignment Deadlines & Reminder Integration
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_academic_reminders.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { courseService } = require('../services/courseService');
const { assignmentService } = require('../services/assignmentService');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { reminderScheduler } = require('../services/reminderScheduler');

console.log('====================================================');
console.log(' Running Assignment Deadline & Reminder Test Suite');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    failed++;
  }
}

async function run() {
  initDb();

  const user = userRepository.create({
    email: `rem_student_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Aditya Deadline',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const authUser = { id: user.id, role: 'student', email: user.email };

  const course = courseService.createCourse(
    user.id,
    { name: 'Software Engineering', code: 'CS306' },
    authUser
  );

  let asgn = null;
  const now = Date.now();
  const futureDeadline = now + (2 * 86400000); // 2 days in future
  const leadTimeMinutes = 60; // 1 hour lead time

  // 1. Create Assignment & Scheduled Reminder
  await test('Assignment Creation: automatically schedules reminder for deadline', () => {
    asgn = assignmentService.createAssignment(
      user.id,
      {
        course_id: course.id,
        title: 'Sprint 2 Burndown & Architecture Spec',
        due_date: futureDeadline,
        priority: 'high',
        reminder_enabled: true,
        reminder_lead_time_minutes: leadTimeMinutes
      },
      authUser
    );

    assert.ok(asgn.id);

    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    assert.strictEqual(reminders.length, 1, 'Exactly one reminder should be created');

    const rem = reminders[0];
    assert.strictEqual(rem.status, 'scheduled');
    assert.strictEqual(rem.reminder_type, 'assignment');
    assert.strictEqual(rem.user_id, user.id);
    assert.strictEqual(rem.scheduled_time, futureDeadline - (leadTimeMinutes * 60 * 1000));
    assert.ok(rem.title.includes('Sprint 2 Burndown'));
  });

  // 2. Prevent Duplicate Reminders
  await test('Duplicate Prevention: repeated sync on active assignment preserves single reminder', () => {
    const rawAsgn = assignmentService.assignmentRepo.findById(asgn.id);
    assignmentService.syncAssignmentReminder(rawAsgn);

    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    assert.strictEqual(reminders.length, 1, 'Should not produce duplicate reminders');
  });

  // 3. Deadline Update Reschedules Reminder
  await test('Deadline Update: updates reminder scheduled_time accordingly', () => {
    const newDeadline = futureDeadline + 86400000; // extended by 1 day
    const updated = assignmentService.updateAssignment(
      asgn.id,
      { due_date: newDeadline },
      authUser
    );

    assert.strictEqual(updated.dueDate, newDeadline);

    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].scheduled_time, newDeadline - (leadTimeMinutes * 60 * 1000));
  });

  // 4. Completion Cancels Scheduled Reminder
  await test('Completion: automatically cancels scheduled reminder when assignment is completed', () => {
    assignmentService.updateStatus(asgn.id, 'completed', authUser);

    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].status, 'cancelled', 'Reminder status must transition to cancelled');
  });

  // 5. Re-open Assignment Restores Scheduled Reminder
  await test('Re-open: restores scheduled reminder when assignment is set back to in_progress', () => {
    assignmentService.updateStatus(asgn.id, 'in_progress', authUser);

    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    const active = reminders.find(r => r.status === 'scheduled');
    assert.ok(active, 'Active scheduled reminder must be restored upon re-opening task');
  });

  // 6. Scheduler Due Processing Generates Notification
  await test('Scheduler Integration: due assignment reminder produces student notification', () => {
    // Force reminder scheduled_time to past so scheduler picks it up
    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    const scheduledRem = reminders.find(r => r.status === 'scheduled');
    reminderRepository.update(scheduledRem.id, { scheduled_time: Date.now() - 5000 });

    const report = reminderScheduler.processDueReminders(Date.now());
    assert.ok(report.processedCount >= 1);
    assert.ok(report.triggeredIds.includes(scheduledRem.id));

    // Verify reminder is now triggered
    const updatedRem = reminderRepository.findById(scheduledRem.id);
    assert.strictEqual(updatedRem.status, 'triggered');

    // Verify student notification created
    const notifs = notificationRepository.findByUserId(user.id);
    const asgnNotif = notifs.find(n => n.related_resource_id === scheduledRem.id);
    assert.ok(asgnNotif, 'Notification should be generated for due assignment reminder');
    assert.ok(asgnNotif.title.includes('Assignment Due'));
    assert.strictEqual(asgnNotif.read, false);
  });

  // 7. Deletion Cleans Up Reminders
  await test('Deletion: cleans up associated reminders on task delete', () => {
    assignmentService.deleteAssignment(asgn.id, authUser);

    const reminders = reminderRepository.findByResource('assignment', asgn.id);
    assert.strictEqual(reminders.length, 0, 'All related reminders should be deleted');
  });

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  console.log('\n----------------------------------------------------');
  console.log(` ASSIGNMENT REMINDERS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
