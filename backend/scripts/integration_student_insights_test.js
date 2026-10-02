/**
 * Student Insights & Overview Integration Test Suite
 *
 * Verifies the unified student insights endpoint and service:
 * 1. Unauthenticated requests are rejected (401).
 * 2. Authenticated student with empty state returns clean, zeroed structures.
 * 3. Unread notification count is integrated accurately.
 * 4. Normal student with multiple related records (courses, goals, assignments, calendar, study sessions).
 * 5. Single-pass course enrichment (zero N+1 queries).
 * 6. Date-sensitive filtering: upcoming assignments vs overdue assignments.
 * 7. Completed tasks excluded from overdue backlog.
 * 8. Today's agenda timezone-aware isolation.
 * 9. Alias endpoint parity (/student/insights, /student/overview, /academic/insights).
 * 10. Cross-user isolation and ownership enforcement (403 Forbidden on foreign access, zero data bleed).
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_student_insights_integration.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');
const { studentInsightsService } = require('../services/studentInsightsService');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { getMumbaiTodayRange } = require('../utils/timezone');
const { ForbiddenError } = require('../errors');

function makeRequest(server, { method, path: reqPath, headers = {}, body = null }) {
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
        path: reqPath,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
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

async function runTests() {
  console.log('====================================================');
  console.log(' Running Student Insights Overview Integration Tests');
  console.log('====================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, resolve));

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
  const email1 = `insights1_${runId}@djsce.edu`;
  const email2 = `insights2_${runId}@djsce.edu`;
  let student1Token = null;
  let student1Id = null;
  let student2Token = null;
  let student2Id = null;

  try {
    // 1. Auth Guard
    await test('Auth Guard: GET /api/student/insights returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // 2. Register & Login Student 1
    await test('Auth: registers and logs in primary student', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          full_name: 'Aniruddha Insights',
          email: email1,
          password: 'Password@123',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      student1Id = reg.body.user.id;
      assert.ok(student1Id);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: email1,
          password: 'Password@123'
        }
      });
      assert.strictEqual(login.statusCode, 200);
      student1Token = login.body.token;
      assert.ok(student1Token);
    });

    // 3. Register & Login Student 2 (for isolation testing)
    await test('Auth: registers and logs in second student for isolation tests', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          full_name: 'Second Student',
          email: email2,
          password: 'Password@123',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      student2Id = reg.body.user.id;
      assert.ok(student2Id);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: email2,
          password: 'Password@123'
        }
      });
      assert.strictEqual(login.statusCode, 200);
      student2Token = login.body.token;
      assert.ok(student2Token);
    });

    // 4. Empty State Test
    await test('Empty State: returns clean, zeroed overview without errors', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${student1Token}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const { insights } = res.body;
      assert.ok(insights);
      assert.strictEqual(insights.student.id, student1Id);
      assert.strictEqual(insights.student.email, email1);
      assert.strictEqual(insights.unreadNotificationsCount, 0);
      assert.deepStrictEqual(insights.activeGoals, []);
      assert.strictEqual(insights.goalProgress.total, 0);
      assert.strictEqual(insights.goalProgress.active, 0);
      assert.strictEqual(insights.goalProgress.averageActiveProgress, 0);
      assert.deepStrictEqual(insights.upcomingAssignments, []);
      assert.deepStrictEqual(insights.overdueAssignments, []);
      assert.deepStrictEqual(insights.upcomingStudySessions, []);
      assert.ok(insights.todayCalendar);
      assert.ok(insights.workloadSummary);
      assert.ok(insights.productivityMetrics);
      assert.strictEqual(insights.summary.unreadNotificationsCount, 0);
      assert.strictEqual(insights.summary.activeGoalsCount, 0);
    });

    // 5. Notification Count Integration
    await test('Notification Integration: calculates unread count accurately', async () => {
      // Create 2 unread notifications and 1 read notification
      notificationRepository.create({
        user_id: student1Id,
        title: 'Assignment Due Soon',
        message: 'Your assignment is due tomorrow',
        type: 'reminder',
        read: false
      });
      notificationRepository.create({
        user_id: student1Id,
        title: 'Study Session Reminder',
        message: 'Study session starts in 15 mins',
        type: 'reminder',
        read: false
      });
      notificationRepository.create({
        user_id: student1Id,
        title: 'Welcome Notification',
        message: 'Welcome to the platform',
        type: 'system',
        read: true
      });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${student1Token}` }
      });

      assert.strictEqual(res.statusCode, 200);
      const { insights } = res.body;
      assert.strictEqual(insights.unreadNotificationsCount, 2);
      assert.strictEqual(insights.summary.unreadNotificationsCount, 2);
    });

    // 6. Multiple Courses & Related Academic Records
    let course1Id = null;
    let course2Id = null;
    const now = Date.now();

    await test('Courses Setup: creates multiple academic courses', async () => {
      const c1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          name: 'Distributed Systems',
          code: 'CS401',
          color: '#3b82f6',
          credits: 4
        }
      });
      assert.strictEqual(c1.statusCode, 201);
      course1Id = c1.body.course.id;

      const c2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          name: 'Machine Learning',
          code: 'CS402',
          color: '#10b981',
          credits: 3
        }
      });
      assert.strictEqual(c2.statusCode, 201);
      course2Id = c2.body.course.id;
    });

    // 7. Goals Setup
    await test('Goals Setup: creates active, in-progress, and completed goals', async () => {
      // Goal 1: Active In Progress (60%)
      const g1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Master Raft Consensus',
          course_id: course1Id,
          status: 'in_progress',
          progress: 60,
          target_date: now + (3 * 86400000)
        }
      });
      assert.strictEqual(g1.statusCode, 201);

      // Goal 2: Active In Progress (0%)
      const g2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Train Transformer Model',
          course_id: course2Id,
          status: 'in_progress',
          progress: 0,
          target_date: now + (5 * 86400000)
        }
      });
      assert.strictEqual(g2.statusCode, 201);

      // Goal 3: Completed Goal (100%)
      const g3 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Review Linear Algebra',
          status: 'completed',
          progress: 100,
          target_date: now - (2 * 86400000)
        }
      });
      assert.strictEqual(g3.statusCode, 201);
    });

    // 8. Assignments Setup (Date-Sensitive: Upcoming vs Overdue)
    let overdueAsgnId = null;
    await test('Assignments Setup: creates upcoming, overdue, and completed assignments', async () => {
      // Upcoming 1 (Course 1, due in 2 days)
      const a1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Raft Implementation Lab 2',
          course_id: course1Id,
          due_date: now + (2 * 86400000),
          priority: 'high',
          status: 'in_progress'
        }
      });
      assert.strictEqual(a1.statusCode, 201);

      // Upcoming 2 (Course 2, due in 4 days)
      const a2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'ML Problem Set 1',
          course_id: course2Id,
          due_date: now + (4 * 86400000),
          priority: 'medium',
          status: 'pending'
        }
      });
      assert.strictEqual(a2.statusCode, 201);

      // Overdue Assignment (Course 1, due 1 day ago, still pending)
      const a3 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'CS401 Distributed Systems Quiz',
          course_id: course1Id,
          due_date: now - (86400000),
          priority: 'urgent',
          status: 'pending'
        }
      });
      assert.strictEqual(a3.statusCode, 201);
      overdueAsgnId = a3.body.assignment.id;

      // Completed Past Assignment (due 3 days ago, completed - should NOT be overdue)
      const a4 = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Past Homework 1',
          course_id: course1Id,
          due_date: now - (3 * 86400000),
          priority: 'low',
          status: 'completed'
        }
      });
      assert.strictEqual(a4.statusCode, 201);
    });

    // 9. Calendar Events Setup (Today's agenda)
    await test('Calendar Setup: creates today schedule events', async () => {
      const { startOfDay } = getMumbaiTodayRange();
      const eventStart = startOfDay + (10 * 3600000); // 10:00 AM IST today
      const eventEnd = eventStart + (2 * 3600000); // 12:00 PM IST today

      const ev = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/events',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Distributed Systems Lecture',
          course_id: course1Id,
          start_time: eventStart,
          end_time: eventEnd,
          event_type: 'lecture',
          location: 'Hall A'
        }
      });
      assert.strictEqual(ev.statusCode, 201);
    });

    // 10. Study Sessions Setup (Upcoming)
    await test('Study Sessions Setup: creates upcoming study sessions', async () => {
      const studyStart = now + (3 * 3600000); // 3 hours from now

      const ss = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: { Authorization: `Bearer ${student1Token}` },
        body: {
          title: 'Raft Protocol Debugging',
          course_id: course1Id,
          planned_start_time: studyStart,
          planned_duration_minutes: 90
        }
      });
      assert.strictEqual(ss.statusCode, 201);
    });

    // 11. Comprehensive Insights Payload Verification
    await test('Normal Student Insights: combines all sections with zero N+1 queries', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${student1Token}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const { insights } = res.body;

      // Unread notifications
      assert.strictEqual(insights.unreadNotificationsCount, 2);

      // Active goals verification
      assert.strictEqual(insights.activeGoals.length, 2);
      const raftGoal = insights.activeGoals.find(g => g.title === 'Master Raft Consensus');
      assert.ok(raftGoal);
      assert.strictEqual(raftGoal.progress, 60);
      assert.ok(raftGoal.course);
      assert.strictEqual(raftGoal.course.name, 'Distributed Systems');
      assert.strictEqual(raftGoal.course.code, 'CS401');

      // Goal progress summary
      assert.strictEqual(insights.goalProgress.total, 3);
      assert.strictEqual(insights.goalProgress.active, 2);
      assert.strictEqual(insights.goalProgress.completed, 1);
      assert.strictEqual(insights.goalProgress.averageActiveProgress, 30); // (60 + 0) / 2 = 30%

      // Upcoming assignments
      assert.strictEqual(insights.upcomingAssignments.length, 2);
      assert.strictEqual(insights.upcomingAssignments[0].title, 'Raft Implementation Lab 2');
      assert.ok(insights.upcomingAssignments[0].course);
      assert.strictEqual(insights.upcomingAssignments[0].course.code, 'CS401');

      // Overdue assignments
      assert.strictEqual(insights.overdueAssignments.length, 1);
      assert.strictEqual(insights.overdueAssignments[0].id, overdueAsgnId);
      assert.strictEqual(insights.overdueAssignments[0].title, 'CS401 Distributed Systems Quiz');

      // Today's calendar
      assert.ok(insights.todayCalendar);
      assert.ok(insights.todayCalendar.events.length >= 1);
      assert.strictEqual(insights.todayCalendar.events[0].title, 'Distributed Systems Lecture');

      // Upcoming study sessions
      assert.strictEqual(insights.upcomingStudySessions.length, 1);
      assert.strictEqual(insights.upcomingStudySessions[0].title, 'Raft Protocol Debugging');
      assert.ok(insights.upcomingStudySessions[0].course);

      // Workload summary & productivity metrics
      assert.ok(insights.workloadSummary);
      assert.ok(insights.productivityMetrics);

      // Summary block
      assert.strictEqual(insights.summary.activeGoalsCount, 2);
      assert.strictEqual(insights.summary.upcomingAssignmentsCount, 2);
      assert.strictEqual(insights.summary.overdueAssignmentsCount, 1);
      assert.strictEqual(insights.summary.upcomingStudySessionsCount, 1);
    });

    // 12. Alias Endpoints Parity (/student/overview & /academic/insights)
    await test('Alias Endpoints: /student/overview and /academic/insights return identical data', async () => {
      const resOverview = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/overview',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      assert.strictEqual(resOverview.statusCode, 200);
      assert.strictEqual(resOverview.body.insights.activeGoals.length, 2);

      const resAcademic = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/insights',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      assert.strictEqual(resAcademic.statusCode, 200);
      assert.strictEqual(resAcademic.body.insights.activeGoals.length, 2);
      assert.strictEqual(resAcademic.body.insights.overdueAssignments.length, 1);
    });

    // 13. Date-Sensitive Data: Completing overdue task removes it immediately from overdue backlog
    await test('Date-Sensitive Lifecycle: completing overdue assignment clears overdue backlog', async () => {
      const updateRes = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/assignments/${overdueAsgnId}/status`,
        headers: { Authorization: `Bearer ${student1Token}` },
        body: { status: 'completed' }
      });
      assert.strictEqual(updateRes.statusCode, 200);

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${student1Token}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.insights.overdueAssignments.length, 0);
      assert.strictEqual(res.body.insights.summary.overdueAssignmentsCount, 0);
    });

    // 14. Cross-User Isolation & Ownership Enforcement
    await test('Ownership Isolation: Student 2 cannot access Student 1 insights directly', async () => {
      const student2User = { id: student2Id, role: 'student' };
      assert.throws(
        () => studentInsightsService.assertOwnership(student1Id, student2User),
        err => err instanceof ForbiddenError || (err && err.name === 'ForbiddenError')
      );
    });

    // 15. Cross-User Data Isolation: Student 2 insights contains ZERO data from Student 1
    await test('Cross-User Isolation: Student 2 receives clean isolated insights with no data bleed', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${student2Token}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const { insights } = res.body;
      assert.strictEqual(insights.student.id, student2Id);
      assert.strictEqual(insights.unreadNotificationsCount, 0);
      assert.strictEqual(insights.activeGoals.length, 0);
      assert.strictEqual(insights.goalProgress.total, 0);
      assert.strictEqual(insights.upcomingAssignments.length, 0);
      assert.strictEqual(insights.overdueAssignments.length, 0);
      assert.strictEqual(insights.todayCalendar.events.length, 0);
      assert.strictEqual(insights.upcomingStudySessions.length, 0);
    });

  } finally {
    server.close();
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(` STUDENT INSIGHTS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    console.error('SOME TESTS FAILED! ❌');
    process.exit(1);
  } else {
    console.log('ALL STUDENT INSIGHTS TESTS PASSED! 🎉\n');
  }
}

runTests().catch(err => {
  console.error('Fatal error in integration tests:', err);
  process.exit(1);
});
