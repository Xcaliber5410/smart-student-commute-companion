/**
 * Verification Script: Notification Service & Repository Layer (Task 3)
 */

const assert = require('assert');
const { notificationService } = require('../services/notificationService');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { userRepository } = require('../repositories/UserRepository');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Notification Service & Repository Verification');
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
  let user1 = userRepository.findByEmail('notif.student1@djsce.edu');
  if (!user1) {
    user1 = userRepository.create({
      email: 'notif.student1@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Aarav Mehta',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }

  let user2 = userRepository.findByEmail('notif.student2@djsce.edu');
  if (!user2) {
    user2 = userRepository.create({
      email: 'notif.student2@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Isha Patel',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }

  const student1Id = user1.id;
  const student2Id = user2.id;
  const studentUser1 = { id: student1Id, role: 'student' };
  const studentUser2 = { id: student2Id, role: 'student' };
  const adminUser = { id: 'usr-admin-test', role: 'admin' };

  let createdNotif1Id = null;
  let createdNotif2Id = null;

  // 1. Successful Notification Creation
  test('NotificationService: creates notifications for student', () => {
    const notif1 = notificationService.createNotification(student1Id, {
      type: 'reminder',
      title: 'Board Train Soon',
      message: '08:35 Borivali local arrives in 10 minutes',
      priority: 'high',
      payload: { platform: 3 }
    });

    assert.ok(notif1.id.startsWith('notif-'));
    assert.strictEqual(notif1.user_id, student1Id);
    assert.strictEqual(notif1.title, 'Board Train Soon');
    assert.strictEqual(notif1.priority, 'high');
    assert.strictEqual(notif1.read, false);
    assert.strictEqual(notif1.payload.platform, 3);
    createdNotif1Id = notif1.id;

    const notif2 = notificationService.createNotification(student1Id, {
      type: 'disruption',
      title: 'Monsoon Alert',
      message: 'Waterlogging reported near station',
      priority: 'medium'
    });
    createdNotif2Id = notif2.id;
  });

  // 2. Successful Retrieval & Single Read
  test('NotificationService: retrieves notification and asserts ownership', () => {
    const fetched = notificationService.getNotificationById(createdNotif1Id, studentUser1);
    assert.strictEqual(fetched.id, createdNotif1Id);
    assert.strictEqual(fetched.title, 'Board Train Soon');

    // Admin can also retrieve
    const adminFetched = notificationService.getNotificationById(createdNotif1Id, adminUser);
    assert.strictEqual(adminFetched.id, createdNotif1Id);
  });

  // 3. Ownership Isolation (Student 2 forbidden from Student 1's notification)
  test('NotificationService: blocks unauthorized cross-student access', () => {
    assert.throws(() => {
      notificationService.getNotificationById(createdNotif1Id, studentUser2);
    }, (err) => err instanceof ForbiddenError);

    assert.throws(() => {
      notificationService.markAsRead(createdNotif1Id, studentUser2);
    }, (err) => err instanceof ForbiddenError);

    assert.throws(() => {
      notificationService.listStudentNotifications(student1Id, studentUser2);
    }, (err) => err instanceof ForbiddenError);
  });

  // 4. Missing Notification Check
  test('NotificationService: throws NotFoundError for non-existent notification', () => {
    assert.throws(() => {
      notificationService.getNotificationById('notif-missing-99999', studentUser1);
    }, (err) => err instanceof NotFoundError);
  });

  // 5. Unread Count & Mark as Read
  test('NotificationService: calculates unread count and updates read state', () => {
    const countBefore = notificationService.getUnreadCount(student1Id, studentUser1);
    assert.strictEqual(countBefore.unreadCount >= 2, true);

    const updated = notificationService.markAsRead(createdNotif1Id, studentUser1);
    assert.strictEqual(updated.read, true);
    assert.ok(updated.read_at > 0);

    const countAfter = notificationService.getUnreadCount(student1Id, studentUser1);
    assert.strictEqual(countAfter.unreadCount, countBefore.unreadCount - 1);
  });

  // 6. Paginated Listing & Filtering
  test('NotificationService: lists with pagination and filtering by read state', () => {
    const listUnread = notificationService.listStudentNotifications(student1Id, studentUser1, { read: false });
    assert.ok(Array.isArray(listUnread.notifications));
    assert.ok(listUnread.notifications.every(n => n.read === false));
    assert.ok(listUnread.pagination.page === 1);

    const listAll = notificationService.listStudentNotifications(student1Id, studentUser1, { page: 1, limit: 10 });
    assert.ok(listAll.notifications.length >= 2);
  });

  // 7. Bulk Mark All as Read
  test('NotificationService: marks all notifications as read', () => {
    const result = notificationService.markAllAsRead(student1Id, studentUser1);
    assert.ok(result.updatedCount >= 1);

    const unread = notificationService.getUnreadCount(student1Id, studentUser1);
    assert.strictEqual(unread.unreadCount, 0);
  });

  // 8. Empty Result Set for Fresh Student
  test('NotificationService: returns clean empty results for student with no notifications', () => {
    const emptyList = notificationService.listStudentNotifications(student2Id, studentUser2);
    assert.deepStrictEqual(emptyList.notifications, []);
    assert.strictEqual(emptyList.pagination.total, 0);
    assert.strictEqual(emptyList.unreadCount, 0);
  });

  // 9. Deletion
  test('NotificationService: deletes notification and removes from repository', () => {
    const delResult = notificationService.deleteNotification(createdNotif2Id, studentUser1);
    assert.strictEqual(delResult.success, true);

    assert.throws(() => {
      notificationService.getNotificationById(createdNotif2Id, studentUser1);
    }, (err) => err instanceof NotFoundError);
  });

  console.log('\n----------------------------------------------------');
  console.log(` NOTIFICATION SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
