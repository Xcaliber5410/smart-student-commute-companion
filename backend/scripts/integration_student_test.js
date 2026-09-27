/**
 * Comprehensive Student Workflow Integration Test Suite
 *
 * Verifies the complete end-to-end flow:
 * Authenticated User -> Authorization Guard -> Student Controllers ->
 * Validation -> Domain Services -> Repositories -> Database -> Standardized Response.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_student_integration.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');

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

async function runStudentIntegrationTests() {
  console.log('====================================================');
  console.log(' Running Student Workflow Integration Test Suite');
  console.log('====================================================\n');

  await initDb();
  const app = createApp();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

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

  const runId = Date.now();
  let student1Token = null;
  let student1Id = null;
  let student2Token = null;
  let student2Id = null;

  try {
    // 1. Guard check: unauthenticated requests rejected
    await test('Auth Guard: GET /api/student/context returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/context'
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 2. Register & Login Student 1
    await test('Auth: registers and logs in primary student', async () => {
      const email = `student1_${runId}@djsce.edu`;
      const password = 'Password123!';
      const regRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email,
          password,
          full_name: 'Anirudh Student',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(regRes.status, 201);
      student1Id = regRes.body.user.id;

      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password }
      });
      assert.strictEqual(loginRes.status, 200);
      assert.ok(loginRes.body.token);
      student1Token = loginRes.body.token;
      student1Headers = { Authorization: `Bearer ${student1Token}` };
    });

    // 3. Register & Login Student 2 (for cross-user isolation tests)
    await test('Auth: registers second student for isolation tests', async () => {
      const email = `student2_${runId}@djsce.edu`;
      const password = 'Password123!';
      const regRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email,
          password,
          full_name: 'Imposter Student',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(regRes.status, 201);
      student2Id = regRes.body.user.id;

      const loginRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password }
      });
      assert.strictEqual(loginRes.status, 200);
      assert.ok(loginRes.body.token);
      student2Token = loginRes.body.token;
      student2Headers = { Authorization: `Bearer ${student2Token}` };
    });

    // 4. Retrieve Student Context
    await test('Student Context: GET /api/student/context returns authenticated student profile', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/context',
        headers: student1Headers
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.id, student1Id);
      assert.strictEqual(res.body.user.full_name, 'Anirudh Student');
      assert.ok(Array.isArray(res.body.profile.preferred_modes));
    });

    // 5. Update Student Profile
    await test('Student Profile: PUT /api/student/profile updates home area and preferences', async () => {
      const res = await makeRequest(server, {
        method: 'PUT',
        path: '/api/student/profile',
        headers: student1Headers,
        body: {
          home_area: 'Borivali West',
          default_college: 'DJ Sanghvi College of Engineering',
          preferred_modes: ['train', 'metro', 'auto'],
          walking_tolerance_minutes: 15,
          max_budget_rupees: 80
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.profile.home_area, 'Borivali West');
      assert.strictEqual(res.body.profile.max_budget_rupees, 80);
    });

    // 6. Create Student Commute Schedule
    let createdScheduleId = null;
    await test('Student Schedule: POST /api/student/schedules creates recurring commute schedule', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/schedules',
        headers: student1Headers,
        body: {
          title: 'Morning Algorithms Lecture',
          origin: 'Borivali West',
          destination: 'DJ Sanghvi College of Engineering',
          target_arrival_time: '08:45',
          days_of_week: ['Mon', 'Wed', 'Fri'],
          reminder_enabled: true,
          active: true
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.schedule.id);
      createdScheduleId = res.body.schedule.id;
      assert.strictEqual(res.body.schedule.title, 'Morning Algorithms Lecture');
    });

    // 7. List and Filter Schedules
    await test('Student Schedule: GET /api/student/schedules filters by active status and search', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/schedules?active=true&search=Algorithms',
        headers: student1Headers
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.schedules.length, 1);
      assert.strictEqual(res.body.pagination.total, 1);
    });

    // 8. Update Schedule
    await test('Student Schedule: PUT /api/student/schedules/:id updates target arrival time', async () => {
      const res = await makeRequest(server, {
        method: 'PUT',
        path: `/api/student/schedules/${createdScheduleId}`,
        headers: student1Headers,
        body: {
          target_arrival_time: '08:30'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.schedule.target_arrival_time, '08:30');
    });

    // 9. Cross-User Data Isolation: Student 2 cannot modify Student 1 schedule
    await test('Cross-User Isolation: Student 2 cannot update Student 1 schedule (403)', async () => {
      const res = await makeRequest(server, {
        method: 'PUT',
        path: `/api/student/schedules/${createdScheduleId}`,
        headers: student2Headers,
        body: {
          title: 'Hacked Title'
        }
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    // 10. Saved Routes: Create and List
    let createdRouteId = null;
    await test('Saved Routes: POST & GET /api/student/saved-routes manages favorite shortcut', async () => {
      const createRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/saved-routes',
        headers: student1Headers,
        body: {
          name: 'Fast Train Direct',
          origin: 'Borivali Station',
          destination: 'Vile Parle Station',
          preferred_mode: 'train',
          max_budget: 20,
          tags: ['fast', 'budget']
        }
      });
      assert.strictEqual(createRes.status, 201);
      createdRouteId = createRes.body.route.id;

      const listRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/saved-routes?preferred_mode=train',
        headers: student1Headers
      });
      assert.strictEqual(listRes.status, 200);
      assert.strictEqual(listRes.body.routes.length, 1);
      assert.strictEqual(listRes.body.routes[0].name, 'Fast Train Direct');
    });

    // 11. Cross-User Isolation: Student 2 cannot access Student 1 saved route
    await test('Cross-User Isolation: Student 2 cannot get Student 1 saved route (403)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/saved-routes/${createdRouteId}`,
        headers: student2Headers
      });
      assert.strictEqual(res.status, 403);
    });

    // 12. Student Dashboard Aggregation
    await test('Dashboard: GET /api/student/dashboard aggregates schedules, routes, and stats', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/dashboard',
        headers: student1Headers
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const dash = res.body.dashboard;

      assert.strictEqual(dash.student.id, student1Id);
      assert.strictEqual(dash.student.home_area, 'Borivali West');
      assert.strictEqual(dash.schedule_summary.total_active_schedules, 1);
      assert.strictEqual(dash.saved_routes.total_count, 1);
      assert.ok(dash.quick_stats);
      assert.strictEqual(dash.quick_stats.active_schedules, 1);
      assert.strictEqual(dash.quick_stats.saved_routes, 1);
    });

    // 13. Validation Error on Invalid Payload
    await test('Validation: POST /api/student/schedules rejects invalid arrival time format', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/schedules',
        headers: student1Headers,
        body: {
          title: 'Short',
          origin: '',
          destination: 'College'
        }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(` STUDENT INTEGRATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runStudentIntegrationTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
