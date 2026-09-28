/**
 * Verification Script: Student Reminder Lifecycle & Service Layer (Task 4)
 */

const assert = require('assert');
const { reminderService } = require('../services/reminderService');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { notificationService } = require('../services/notificationService');
const { userRepository } = require('../repositories/UserRepository');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Student Reminder Service Lifecycle Verification');
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

  // Ensure test users exist
  let user1 = userRepository.findByEmail('rem.student1@djsce.edu');
  if (!user1) {
    user1 = userRepository.create({
      email: 'rem.student1@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Devanshi Shah',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }

  let user2 = userRepository.findByEmail('rem.student2@djsce.edu');
  if (!user2) {
    user2 = userRepository.create({
      email: 'rem.student2@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Kabir Deshmukh',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }

  const student1Id = user1.id;
  const student2Id = user2.id;
  const studentUser1 = { id: student1Id, role: 'student' };
  const studentUser2 = { id: student2Id, role: 'student' };

  // Create a schedule for Student 1
  const schedule1 = studentScheduleRepository.create({
    user_id: student1Id,
    title: 'Operating Systems Lecture',
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College of Engineering',
    target_arrival_time: '09:00',
    days_of_week: ['Mon', 'Wed']
  });

  let createdReminder1Id = null;
  let createdReminder2Id = null;

  // 1. Create Reminder with Valid Schedule Link
  test('ReminderService: creates reminder linked to student schedule', () => {
    const scheduledTime = Date.now() + 1800000; // 30 mins in future
    const rem = reminderService.createReminder(student1Id, {
      title: 'Catch 08:30 Fast Local',
      message: 'Leave now to reach OS lecture on time',
      scheduled_time: scheduledTime,
      reminder_type: 'commute',
      related_resource_type: 'student_schedule',
      related_resource_id: schedule1.id
    }, studentUser1);

    assert.ok(rem.id.startsWith('rem-'));
    assert.strictEqual(rem.user_id, student1Id);
    assert.strictEqual(rem.title, 'Catch 08:30 Fast Local');
    assert.strictEqual(rem.status, 'scheduled');
    assert.strictEqual(rem.related_resource_id, schedule1.id);
    createdReminder1Id = rem.id;
  });

  // 2. Reject Cross-Student Schedule Link
  test('ReminderService: rejects linking reminder to another student schedule', () => {
    assert.throws(() => {
      reminderService.createReminder(student2Id, {
        title: 'Imposter Reminder',
        scheduled_time: Date.now() + 100000,
        related_resource_type: 'student_schedule',
        related_resource_id: schedule1.id // Owned by student 1!
      }, studentUser2);
    }, (err) => err instanceof ForbiddenError);
  });

  // 3. Ownership Isolation on Read & Updates
  test('ReminderService: prevents unauthorized student from reading or updating reminder', () => {
    assert.throws(() => {
      reminderService.getReminderById(createdReminder1Id, studentUser2);
    }, (err) => err instanceof ForbiddenError);

    assert.throws(() => {
      reminderService.updateReminder(createdReminder1Id, { title: 'Hacked' }, studentUser2);
    }, (err) => err instanceof ForbiddenError);
  });

  // 4. Update Scheduled Reminder
  test('ReminderService: updates title and scheduled time of scheduled reminder', () => {
    const newTime = Date.now() + 3600000;
    const updated = reminderService.updateReminder(createdReminder1Id, {
      title: 'Board 08:40 Slow Local',
      scheduled_time: newTime
    }, studentUser1);

    assert.strictEqual(updated.title, 'Board 08:40 Slow Local');
    assert.strictEqual(updated.scheduled_time, newTime);
  });

  // 5. Trigger Reminder & Verify Notification Delivery
  test('ReminderService: transitions to triggered and creates student notification', () => {
    const unreadBefore = notificationService.getUnreadCount(student1Id, studentUser1).unreadCount;

    const triggered = reminderService.triggerReminder(createdReminder1Id, studentUser1);
    assert.strictEqual(triggered.status, 'triggered');
    assert.ok(triggered.triggered_at > 0);

    const unreadAfter = notificationService.getUnreadCount(student1Id, studentUser1).unreadCount;
    assert.strictEqual(unreadAfter, unreadBefore + 1);

    // Verify notification was created with reminder details
    const notifs = notificationService.listStudentNotifications(student1Id, studentUser1);
    const createdNotif = notifs.notifications.find(n => n.related_resource_id === createdReminder1Id);
    assert.ok(createdNotif, 'Notification was created for triggered reminder');
    assert.strictEqual(createdNotif.title, 'Board 08:40 Slow Local');
  });

  // 6. Complete Reminder from Triggered
  test('ReminderService: marks triggered reminder as completed', () => {
    const completed = reminderService.completeReminder(createdReminder1Id, studentUser1);
    assert.strictEqual(completed.status, 'completed');

    // Cannot edit completed reminder
    assert.throws(() => {
      reminderService.updateReminder(createdReminder1Id, { title: 'Cannot change' }, studentUser1);
    }, (err) => err instanceof BadRequestError);

    // Cannot cancel completed reminder
    assert.throws(() => {
      reminderService.cancelReminder(createdReminder1Id, studentUser1);
    }, (err) => err instanceof BadRequestError);
  });

  // 7. Cancellation Lifecycle
  test('ReminderService: cancels a scheduled reminder', () => {
    const rem2 = reminderService.createReminder(student1Id, {
      title: 'Buy Monthly Train Pass',
      scheduled_time: Date.now() + 7200000,
      reminder_type: 'custom'
    }, studentUser1);
    createdReminder2Id = rem2.id;

    const cancelled = reminderService.cancelReminder(createdReminder2Id, studentUser1);
    assert.strictEqual(cancelled.status, 'cancelled');

    // Cannot trigger cancelled reminder
    assert.throws(() => {
      reminderService.triggerReminder(createdReminder2Id, studentUser1);
    }, (err) => err instanceof BadRequestError);
  });

  // 8. Filter and Paginate Reminders
  test('ReminderService: lists reminders with status filter and pagination', () => {
    const listCompleted = reminderService.listStudentReminders(student1Id, studentUser1, { status: 'completed' });
    assert.strictEqual(listCompleted.reminders.length >= 1, true);
    assert.strictEqual(listCompleted.reminders[0].status, 'completed');

    const listAll = reminderService.listStudentReminders(student1Id, studentUser1, { page: 1, limit: 10 });
    assert.strictEqual(listAll.reminders.length >= 2, true);
  });

  // 9. Delete Reminder
  test('ReminderService: deletes reminder cleanly', () => {
    const res = reminderService.deleteReminder(createdReminder2Id, studentUser1);
    assert.strictEqual(res.success, true);

    assert.throws(() => {
      reminderService.getReminderById(createdReminder2Id, studentUser1);
    }, (err) => err instanceof NotFoundError);
  });

  console.log('\n----------------------------------------------------');
  console.log(` REMINDER SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
