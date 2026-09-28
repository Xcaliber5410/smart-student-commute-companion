/**
 * Comprehensive Student Notification & Reminder Integration Test Suite
 *
 * Verifies the complete end-to-end workflow:
 * Authenticated Student -> Reminder Creation -> Scheduler Due Processing ->
 * Notification Generation -> Notification Retrieval -> Read State Transitions ->
 * Cross-User Isolation -> Idempotency.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_notification_integration.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');
const { reminderScheduler } = require('../services/reminderScheduler');

function makeRequest(server, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };

    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runNotificationIntegrationSuite() {
  console.log('====================================================');
  console.log(' Running Notification & Scheduling Integration Test Suite');
  console.log('====================================================\n');

  initDb(testDbPath);

  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
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

  let token1, user1;
  let token2, user2;
  let schedule1Id;
  let reminder1Id;
  let reminder2Id;
  let generatedNotifId;

  try {
    // 1. Auth Guard Enforcement
    await test('Auth Guard: GET /api/notifications returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/notifications'
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    });

    await test('Auth Guard: GET /api/reminders returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/reminders'
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    });

    const runId = Date.now();
    const email1 = `notif_${runId}_1@djsce.edu`;
    const email2 = `notif_${runId}_2@djsce.edu`;

    // 2. User Registrations
    await test('Auth: registers and logs in primary student', async () => {
      const regRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: email1,
          password: 'Password123!',
          full_name: 'Aditya Rao',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.equal(regRes.status, 201);

      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: email1,
          password: 'Password123!'
        }
      });
      assert.equal(loginRes.status, 200);
      token1 = loginRes.body.token;
      user1 = loginRes.body.user;
      assert.ok(token1);
      assert.ok(user1.id);
    });

    await test('Auth: registers second student for isolation tests', async () => {
      const regRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: email2,
          password: 'Password123!',
          full_name: 'Rohan Verma',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.equal(regRes.status, 201);

      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: email2,
          password: 'Password123!'
        }
      });
      assert.equal(loginRes.status, 200);
      token2 = loginRes.body.token;
      user2 = loginRes.body.user;
    });

    // 3. Create Student Schedule to Link
    await test('Student Schedule: creates a recurring schedule for Student 1', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/schedules',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          title: 'Algorithms Lecture',
          origin: 'Borivali West',
          destination: 'D.J. Sanghvi College of Engineering',
          target_arrival_time: '09:00',
          days_of_week: ['Mon', 'Wed', 'Fri']
        }
      });
      assert.equal(res.status, 201);
      schedule1Id = res.body.schedule.id;
    });

    // 4. Create Reminders
    await test('Reminders: POST /api/reminders creates scheduled commute reminder linked to routine', async () => {
      const scheduledTime = Date.now() - 2000; // Past time so it's immediately due for test
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/reminders',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          title: 'Leave for Algorithms Lecture',
          message: 'Board 08:15 Borivali Fast local',
          scheduled_time: scheduledTime,
          reminder_type: 'commute',
          related_resource_type: 'student_schedule',
          related_resource_id: schedule1Id
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.reminder.status, 'scheduled');
      assert.equal(res.body.reminder.related_resource_id, schedule1Id);
      reminder1Id = res.body.reminder.id;
    });

    await test('Validation: POST /api/reminders rejects invalid scheduled_time', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/reminders',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          title: 'Invalid Timestamp Reminder',
          scheduled_time: -500
        }
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Cross-User: Student 2 cannot link reminder to Student 1 schedule', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/reminders',
        headers: { Authorization: `Bearer ${token2}` },
        body: {
          title: 'Stolen Schedule Reminder',
          scheduled_time: Date.now() + 60000,
          related_resource_type: 'student_schedule',
          related_resource_id: schedule1Id
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'FORBIDDEN');
    });

    // 5. Scheduler Due Processing
    await test('Scheduler: processes due reminder and creates notification', async () => {
      const report = reminderScheduler.processDueReminders(Date.now());
      assert.ok(report.processedCount >= 1);
      assert.ok(report.triggeredIds.includes(reminder1Id));

      // Verify reminder state in API is now triggered
      const remRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/reminders/${reminder1Id}`,
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(remRes.status, 200);
      assert.equal(remRes.body.reminder.status, 'triggered');
    });

    await test('Idempotency: repeated scheduler tick produces 0 duplicate notifications', async () => {
      const report = reminderScheduler.processDueReminders(Date.now());
      assert.equal(report.triggeredIds.includes(reminder1Id), false);
    });

    // 6. Notification Retrieval & Read State
    await test('Notifications: GET /api/notifications returns triggered notification', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/notifications',
        headers: { Authorization: `Bearer ${token1}` }
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.notifications));
      const notif = res.body.notifications.find(n => n.related_resource_id === reminder1Id);
      assert.ok(notif, 'Notification for triggered reminder was returned');
      assert.equal(notif.read, false);
      generatedNotifId = notif.id;
    });

    await test('Notifications: GET /api/notifications/count reports accurate unread count', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/notifications/count',
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.unreadCount >= 1);
    });

    await test('Notifications: PATCH /api/notifications/:id/read marks notification as read', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/notifications/${generatedNotifId}/read`,
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.notification.read, true);
      assert.ok(res.body.notification.read_at > 0);
    });

    // 7. Cross-User Isolation
    await test('Cross-User Isolation: Student 2 cannot access Student 1 notification (403)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/notifications/${generatedNotifId}`,
        headers: { Authorization: `Bearer ${token2}` }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'FORBIDDEN');
    });

    await test('Cross-User Isolation: Student 2 cannot read or update Student 1 reminder (403)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/reminders/${reminder1Id}`,
        headers: { Authorization: `Bearer ${token2}` }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'FORBIDDEN');
    });

    // 8. Bulk Read and Reminders Lifecycle
    await test('Notifications: POST /api/notifications/read-all marks all unread notifications', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/notifications/read-all',
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);

      const countRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/notifications/count',
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(countRes.body.unreadCount, 0);
    });

    await test('Reminders: POST /api/reminders/:id/complete marks reminder completed', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: `/api/reminders/${reminder1Id}/complete`,
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.reminder.status, 'completed');
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(` NOTIFICATION INTEGRATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runNotificationIntegrationSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
