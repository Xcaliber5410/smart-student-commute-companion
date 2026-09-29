/**
 * Comprehensive Academic Workflow & Integration Test Suite
 *
 * Verifies the complete end-to-end academic productivity lifecycle:
 * Student -> Course Creation -> Assignment Creation -> Deadline Tracking ->
 * Reminder Synchronization -> Notification Trigger -> Status Lifecycle ->
 * Progress Analytics -> Cross-User Isolation.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_academic_integration.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');
const { reminderScheduler } = require('../services/reminderScheduler');
const { reminderRepository } = require('../repositories/ReminderRepository');

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

async function runAcademicIntegrationSuite() {
  console.log('====================================================');
  console.log(' Running End-to-End Academic Workflow Integration Tests');
  console.log('====================================================\n');

  initDb();

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

  const runId = Date.now();
  let token1, user1;
  let token2, user2;
  let course1Id, course2Id;
  let assignment1Id;

  try {
    // 1. Auth Guard Enforcement
    await test('Auth Guard: GET /api/academic/courses returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, { method: 'GET', path: '/api/academic/courses' });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    });

    await test('Auth Guard: GET /api/academic/assignments returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, { method: 'GET', path: '/api/academic/assignments' });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'UNAUTHORIZED');
    });

    // 2. Student Registrations & Logins
    await test('Auth: registers and logs in primary student', async () => {
      const email = `acad1_${runId}@djsce.edu`;
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email,
          password: 'Password123!',
          full_name: 'Aditya Scholar',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.equal(reg.status, 201);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password: 'Password123!' }
      });
      assert.equal(login.status, 200);
      token1 = login.body.token;
      user1 = login.body.user;
      assert.ok(token1);
    });

    await test('Auth: registers and logs in second student for isolation tests', async () => {
      const email = `acad2_${runId}@djsce.edu`;
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email,
          password: 'Password123!',
          full_name: 'Rohan Peer',
          college_name: 'D.J. Sanghvi College of Engineering'
        }
      });
      assert.equal(reg.status, 201);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password: 'Password123!' }
      });
      assert.equal(login.status, 200);
      token2 = login.body.token;
      user2 = login.body.user;
      assert.ok(token2);
    });

    // 3. Course Creation & Duplication Check
    await test('Courses: POST /api/academic/courses creates student courses', async () => {
      const res1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          name: 'Distributed Systems',
          code: 'CS401',
          instructor: 'Dr. Lamport',
          color: '#3B82F6',
          credits: 4
        }
      });
      assert.equal(res1.status, 201);
      assert.equal(res1.body.course.name, 'Distributed Systems');
      course1Id = res1.body.course.id;

      const res2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          name: 'Computer Networks',
          code: 'CS402',
          instructor: 'Dr. Tanenbaum',
          color: '#10B981',
          credits: 4
        }
      });
      assert.equal(res2.status, 201);
      course2Id = res2.body.course.id;
    });

    await test('Courses: rejects duplicate course name with 409 Conflict', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          name: 'Distributed Systems', // duplicate
          code: 'CS999'
        }
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'CONFLICT');
    });

    // 4. Assignment Creation & Automatic Reminder
    const initialDeadline = Date.now() + 86400000 * 2; // 2 days
    await test('Assignments: POST /api/academic/assignments creates task and auto-schedules reminder', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          course_id: course1Id,
          title: 'Raft Consensus Implementation',
          description: 'Build leader election in Node.js',
          due_date: initialDeadline,
          priority: 'urgent',
          reminder_enabled: true,
          reminder_lead_time_minutes: 120 // 2 hours prior
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.assignment.title, 'Raft Consensus Implementation');
      assert.equal(res.body.assignment.status, 'pending');
      assignment1Id = res.body.assignment.id;

      // Verify reminder scheduled in database
      const reminders = reminderRepository.findByResource('assignment', assignment1Id);
      assert.equal(reminders.length, 1);
      assert.equal(reminders[0].status, 'scheduled');
      assert.equal(reminders[0].reminder_type, 'assignment');
      assert.equal(reminders[0].scheduled_time, initialDeadline - (120 * 60 * 1000));
    });

    // 5. Cross-User Course Guard
    await test('Cross-User: Student 2 cannot link task to Student 1 course (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${token2}` },
        body: {
          course_id: course1Id, // owned by student 1
          title: 'Intruder Assignment',
          due_date: initialDeadline
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'FORBIDDEN');
    });

    // 6. Deadline Update Re-syncs Reminder
    const extendedDeadline = initialDeadline + 86400000;
    await test('Assignments: PATCH /api/academic/assignments/:id updates deadline and reschedules reminder', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/assignments/${assignment1Id}`,
        headers: { Authorization: `Bearer ${token1}` },
        body: { due_date: extendedDeadline }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.assignment.dueDate, extendedDeadline);

      const reminders = reminderRepository.findByResource('assignment', assignment1Id);
      assert.equal(reminders.length, 1);
      assert.equal(reminders[0].scheduled_time, extendedDeadline - (120 * 60 * 1000));
    });

    // 7. Scheduler Triggers Reminder -> In-App Notification
    await test('Scheduler: detects due reminder and creates student in-app notification', async () => {
      // Force reminder scheduled_time into past
      const reminders = reminderRepository.findByResource('assignment', assignment1Id);
      reminderRepository.update(reminders[0].id, { scheduled_time: Date.now() - 1000 });

      // Trigger scheduler
      const report = reminderScheduler.processDueReminders(Date.now());
      assert.ok(report.processedCount >= 1);
      assert.ok(report.triggeredIds.includes(reminders[0].id));

      // Verify student notification feed via API
      const notifRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/notifications',
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(notifRes.status, 200);
      const assignmentNotif = notifRes.body.notifications.find(n => n.related_resource_id === reminders[0].id);
      assert.ok(assignmentNotif, 'In-app notification should exist for due assignment');
      assert.equal(assignmentNotif.read, false);
      assert.ok(assignmentNotif.title.includes('Assignment Due'));
    });

    // 8. Filtering & Upcoming Deadlines
    await test('Filtering: GET /api/academic/assignments with upcoming=true and status filters', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/assignments?upcoming=true',
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.assignments.length, 1);
      assert.equal(res.body.assignments[0].id, assignment1Id);
    });

    // 9. Status Completion Cancels Active Reminder
    await test('Status Lifecycle: PATCH /status to completed cancels scheduled reminder', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/assignments/${assignment1Id}/status`,
        headers: { Authorization: `Bearer ${token1}` },
        body: { status: 'completed' }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.assignment.status, 'completed');
      assert.ok(res.body.assignment.completedAt > 0);

      // Verify reminder state
      const reminders = reminderRepository.findByResource('assignment', assignment1Id);
      assert.ok(reminders.length >= 1);
    });

    // 10. Academic Progress & Analytics Summary
    await test('Progress Summary: GET /api/academic/progress calculates 100% completion rate', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/progress',
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.totalAssignments, 1);
      assert.equal(res.body.completedAssignments, 1);
      assert.equal(res.body.pendingAssignments, 0);
      assert.equal(res.body.overdueAssignments, 0);
      assert.equal(res.body.completionPercentage, 100);
      assert.ok(res.body.courseProgress.length >= 1);
    });

    // 11. Cross-User Data Isolation
    await test('Cross-User: Student 2 cannot access Student 1 course or assignment (403)', async () => {
      const courseRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${course1Id}`,
        headers: { Authorization: `Bearer ${token2}` }
      });
      assert.equal(courseRes.status, 403);
      assert.equal(courseRes.body.code, 'FORBIDDEN');

      const asgnRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/assignments/${assignment1Id}`,
        headers: { Authorization: `Bearer ${token2}` }
      });
      assert.equal(asgnRes.status, 403);
      assert.equal(asgnRes.body.code, 'FORBIDDEN');
    });

    // 12. Deletion Cleanup
    await test('Deletion: DELETE /api/academic/assignments/:id removes assignment and reminders', async () => {
      const res = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/assignments/${assignment1Id}`,
        headers: { Authorization: `Bearer ${token1}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.id, assignment1Id);

      const reminders = reminderRepository.findByResource('assignment', assignment1Id);
      assert.equal(reminders.length, 0);
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(` ACADEMIC INTEGRATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcademicIntegrationSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
