/**
 * Verification Script: Notification & Reminder API Endpoints (Task 6)
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const { signToken } = require('../utils/token');
const { userRepository } = require('../repositories/UserRepository');

function makeRequest(server, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log(' Running Notification & Reminder API Verification');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return fn()
      .then(() => {
        console.log(`✅ PASS: ${name}`);
        passed++;
      })
      .catch(err => {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        failed++;
      });
  }

  // Setup test users & tokens
  let user1 = userRepository.findByEmail('api.student1@djsce.edu');
  if (!user1) {
    user1 = userRepository.create({
      email: 'api.student1@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Sameer Kulkarni',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }

  let user2 = userRepository.findByEmail('api.student2@djsce.edu');
  if (!user2) {
    user2 = userRepository.create({
      email: 'api.student2@djsce.edu',
      password: 'TestPassword123!',
      full_name: 'Ananya Roy',
      college_name: 'D.J. Sanghvi College of Engineering',
      role: 'student'
    });
  }

  const token1 = signToken({ sub: user1.id, role: 'student', email: user1.email });
  const token2 = signToken({ sub: user2.id, role: 'student', email: user2.email });

  const authHeader1 = { Authorization: `Bearer ${token1}` };
  const authHeader2 = { Authorization: `Bearer ${token2}` };

  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  let createdReminderId = null;
  let createdNotificationId = null;

  try {
    // 1. Auth Guard Checks
    await test('Auth: GET /api/notifications returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, 'GET', '/api/notifications');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('Auth: GET /api/reminders returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, 'GET', '/api/reminders');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    // 2. Reminder Creation & Validation
    await test('Reminders: POST /api/reminders creates a scheduled commute reminder', async () => {
      const scheduledTime = Date.now() + 3600000;
      const res = await makeRequest(server, 'POST', '/api/reminders', authHeader1, {
        title: 'Morning CS Lab Reminder',
        message: 'Leave before 08:30 for Lab',
        scheduled_time: scheduledTime,
        reminder_type: 'class'
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.reminder.id.startsWith('rem-'));
      assert.strictEqual(res.body.reminder.title, 'Morning CS Lab Reminder');
      assert.strictEqual(res.body.reminder.status, 'scheduled');
      createdReminderId = res.body.reminder.id;
    });

    await test('Validation: POST /api/reminders rejects missing title', async () => {
      const res = await makeRequest(server, 'POST', '/api/reminders', authHeader1, {
        scheduled_time: Date.now() + 1000
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    // 3. Trigger Reminder to generate Notification
    await test('Reminders: POST /api/reminders/:id/trigger triggers reminder and creates notification', async () => {
      const res = await makeRequest(server, 'POST', `/api/reminders/${createdReminderId}/trigger`, authHeader1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.reminder.status, 'triggered');
    });

    // 4. Notification Retrieval & Unread Count
    await test('Notifications: GET /api/notifications returns student notifications', async () => {
      const res = await makeRequest(server, 'GET', '/api/notifications', authHeader1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.notifications));
      assert.ok(res.body.notifications.length >= 1);

      const notif = res.body.notifications.find(n => n.related_resource_id === createdReminderId);
      assert.ok(notif);
      assert.strictEqual(notif.read, false);
      createdNotificationId = notif.id;
    });

    await test('Notifications: GET /api/notifications/count returns unread count', async () => {
      const res = await makeRequest(server, 'GET', '/api/notifications/count', authHeader1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.unreadCount >= 1);
    });

    // 5. Mark as Read (Single)
    await test('Notifications: PATCH /api/notifications/:id/read marks notification as read', async () => {
      const res = await makeRequest(server, 'PATCH', `/api/notifications/${createdNotificationId}/read`, authHeader1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.notification.read, true);
      assert.ok(res.body.notification.read_at > 0);
    });

    // 6. Ownership Isolation Checks
    await test('Ownership: Student 2 cannot access Student 1 notification (403)', async () => {
      const res = await makeRequest(server, 'GET', `/api/notifications/${createdNotificationId}`, authHeader2);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    await test('Ownership: Student 2 cannot trigger Student 1 reminder (403)', async () => {
      const res = await makeRequest(server, 'POST', `/api/reminders/${createdReminderId}/trigger`, authHeader2);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    // 7. Filtering and Validation on Endpoints
    await test('Filtering: GET /api/notifications with limit and pagination', async () => {
      const res = await makeRequest(server, 'GET', '/api/notifications?page=1&limit=5', authHeader1);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 5);
    });

    await test('Validation: GET /api/notifications rejects limit exceeding 50', async () => {
      const res = await makeRequest(server, 'GET', '/api/notifications?limit=999', authHeader1);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` NOTIFICATION API SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
