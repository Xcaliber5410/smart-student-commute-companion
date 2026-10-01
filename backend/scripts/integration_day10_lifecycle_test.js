/**
 * End-to-End Master Lifecycle Integration Test: Student Goals & Productivity (Day 10)
 *
 * Verifies the full integrated student academic productivity chain:
 *
 * Student
 *  ↓
 * Creates Goal
 *  ↓
 * Associates Course / Tasks
 *  ↓
 * Completes Assignments
 *  ↓
 * Completes Study Sessions
 *  ↓
 * Goal Progress Changes
 *  ↓
 * Productivity Metrics Update
 *  ↓
 * Student Insights API Reflects Current State
 *
 * Key Tests:
 * 1. Empty state responses on newly registered students.
 * 2. Goal creation, retrieval, and schema validation.
 * 3. Invalid relationships (Student B cannot link Student A's course or goal).
 * 4. Invalid state transitions (cancelled -> completed).
 * 5. Assignment -> Goal relationship with automatic progress calibration.
 * 6. Study Session -> Goal relationship with time tracking.
 * 7. Completed work drives goal progress to 100% and auto-completes goal.
 * 8. Overdue deliverables detected and cleared upon completion.
 * 9. Productivity metrics reflect actual stored completions and study durations.
 * 10. Student Insights / Overview API reflects full synchronized state.
 * 11. Notification count integrated dynamically.
 * 12. Ownership isolation and zero cross-student data bleeding.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_day10_lifecycle_master.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');
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

async function runMasterLifecycleTests() {
  console.log('====================================================');
  console.log(' Running Day 10 Master Goal & Productivity Lifecycle');
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
  const emailA = `skan_day10_a_${runId}@djsce.edu`;
  const emailB = `skan_day10_b_${runId}@djsce.edu`;

  let tokenA = null;
  let userAId = null;
  let tokenB = null;
  let userBId = null;

  let courseAId = null;
  let goalAId = null;
  let task1Id = null;
  let task2Id = null;
  let overdueTaskId = null;
  let studySessionId = null;

  try {
    // -----------------------------------------------------------------
    // Phase 1: Authentication & Empty State Responses
    // -----------------------------------------------------------------
    await test('Phase 1.1: Register and login Student A', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          full_name: 'Aditya Skan',
          email: emailA,
          password: 'Password@123',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      userAId = reg.body.user.id;

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailA, password: 'Password@123' }
      });
      assert.strictEqual(login.statusCode, 200);
      tokenA = login.body.token;
      assert.ok(tokenA);
    });

    await test('Phase 1.2: Register and login Student B (for isolation)', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          full_name: 'Peer Student B',
          email: emailB,
          password: 'Password@123',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      userBId = reg.body.user.id;

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailB, password: 'Password@123' }
      });
      assert.strictEqual(login.statusCode, 200);
      tokenB = login.body.token;
      assert.ok(tokenB);
    });

    await test('Phase 1.3: Empty-state response on student insights endpoint', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      const { insights } = res.body;
      assert.strictEqual(insights.student.id, userAId);
      assert.strictEqual(insights.unreadNotificationsCount, 0);
      assert.strictEqual(insights.activeGoals.length, 0);
      assert.strictEqual(insights.goalProgress.total, 0);
      assert.strictEqual(insights.upcomingAssignments.length, 0);
      assert.strictEqual(insights.overdueAssignments.length, 0);
      assert.strictEqual(insights.upcomingStudySessions.length, 0);
      assert.strictEqual(insights.productivityMetrics.assignments.allTime.total, 0);
    });

    // -----------------------------------------------------------------
    // Phase 2: Course Creation & Goal Creation
    // -----------------------------------------------------------------
    await test('Phase 2.1: Student A creates course', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          name: 'Operating Systems',
          code: 'CS301',
          color: '#4F46E5',
          credits: 4
        }
      });
      assert.strictEqual(res.statusCode, 201);
      courseAId = res.body.course.id;
      assert.ok(courseAId);
    });

    await test('Phase 2.2: Goal creation with course association and validation', async () => {
      const now = Date.now();
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Master Virtual Memory & Paging',
          description: 'Complete all assignments and study blocks on memory management',
          course_id: courseAId,
          target_date: now + (7 * 86400000),
          status: 'in_progress',
          progress: 0
        }
      });
      assert.strictEqual(res.statusCode, 201);
      goalAId = res.body.goal.id;
      assert.strictEqual(res.body.goal.title, 'Master Virtual Memory & Paging');
      assert.strictEqual(res.body.goal.progress, 0);
      assert.strictEqual(res.body.goal.status, 'in_progress');
      assert.strictEqual(res.body.goal.courseId, courseAId);
    });

    await test('Phase 2.3: Goal retrieval by ID', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.goal.id, goalAId);
      assert.strictEqual(res.body.goal.title, 'Master Virtual Memory & Paging');
    });

    // -----------------------------------------------------------------
    // Phase 3: Invalid Relationships & State Transitions
    // -----------------------------------------------------------------
    await test('Phase 3.1: Student B cannot link their goal to Student A course (403)', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: {
          title: 'Foreign Goal',
          course_id: courseAId // belongs to Student A
        }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Phase 3.2: Student B cannot access Student A goal (403)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Phase 3.3: Invalid state transition validation (cancelled -> completed fails)', async () => {
      // Create temporary goal to test cancellation transition
      const tempGoal = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'Cancelled Goal Test' }
      });
      const tempId = tempGoal.body.goal.id;

      // Cancel goal
      await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/goals/${tempId}/cancel`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      // Try to complete cancelled goal directly (should fail 400)
      const invalidComplete = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/goals/${tempId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'completed' }
      });
      assert.strictEqual(invalidComplete.statusCode, 400);

      // Cleanup
      await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/goals/${tempId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
    });

    // -----------------------------------------------------------------
    // Phase 4: Assignment -> Goal Association (Upcoming & Overdue)
    // -----------------------------------------------------------------
    const now = Date.now();

    await test('Phase 4.1: Create upcoming Task 1 linked to Course and Goal', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Virtual Memory Lab 1',
          course_id: courseAId,
          goal_id: goalAId,
          due_date: now + (2 * 86400000), // 2 days future
          priority: 'high',
          status: 'in_progress'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      task1Id = res.body.assignment.id;
    });

    await test('Phase 4.2: Create upcoming Task 2 linked to Course and Goal', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Page Replacement Algorithm Benchmark',
          course_id: courseAId,
          goal_id: goalAId,
          due_date: now + (4 * 86400000), // 4 days future
          priority: 'medium',
          status: 'pending'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      task2Id = res.body.assignment.id;
    });

    await test('Phase 4.3: Create Overdue Task linked to Goal', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Read OS Dino Book Chapters 18-20',
          course_id: courseAId,
          goal_id: goalAId,
          due_date: now - (86400000), // 1 day past
          priority: 'urgent',
          status: 'pending'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      overdueTaskId = res.body.assignment.id;
    });

    // -----------------------------------------------------------------
    // Phase 5: Study Session -> Goal Association
    // -----------------------------------------------------------------
    await test('Phase 5.1: Create Study Session linked to Goal and Course', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Deep Dive: LRU vs FIFO Paging',
          course_id: courseAId,
          goal_id: goalAId,
          planned_start_time: now + (3 * 3600000), // 3 hours future
          planned_duration_minutes: 60
        }
      });
      assert.strictEqual(res.statusCode, 201);
      studySessionId = res.body.studySession.id;
    });

    // -----------------------------------------------------------------
    // Phase 6: Student Insights Pre-Completion Verification
    // -----------------------------------------------------------------
    await test('Phase 6.1: Student Insights reflects upcoming work, overdue task, and 0% progress', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const { insights } = res.body;

      // Active goal verified
      assert.strictEqual(insights.activeGoals.length, 1);
      assert.strictEqual(insights.activeGoals[0].id, goalAId);
      assert.strictEqual(insights.activeGoals[0].progress, 0);
      assert.ok(insights.activeGoals[0].course);
      assert.strictEqual(insights.activeGoals[0].course.code, 'CS301');

      // Upcoming assignments (Task 1 & Task 2)
      assert.strictEqual(insights.upcomingAssignments.length, 2);

      // Overdue assignment (1 overdue)
      assert.strictEqual(insights.overdueAssignments.length, 1);
      assert.strictEqual(insights.overdueAssignments[0].id, overdueTaskId);

      // Upcoming study session
      assert.strictEqual(insights.upcomingStudySessions.length, 1);
      assert.strictEqual(insights.upcomingStudySessions[0].id, studySessionId);
    });

    // -----------------------------------------------------------------
    // Phase 7: Complete Work -> Goal Progress Changes Dynamically
    // -----------------------------------------------------------------
    await test('Phase 7.1: Completing Task 1 automatically recalibrates goal progress (1/3 = 33%)', async () => {
      const updateRes = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/assignments/${task1Id}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'completed' }
      });
      assert.strictEqual(updateRes.statusCode, 200);

      // Fetch goal: progress must be 33%
      const goalRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(goalRes.statusCode, 200);
      assert.strictEqual(goalRes.body.goal.progress, 33);
      assert.strictEqual(goalRes.body.goal.status, 'in_progress');
    });

    await test('Phase 7.2: Completing Study Session updates recorded study duration', async () => {
      const updateRes = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/calendar/study-sessions/${studySessionId}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          status: 'completed',
          actual_duration_minutes: 60
        }
      });
      assert.strictEqual(updateRes.statusCode, 200);
      assert.strictEqual(updateRes.body.studySession.status, 'completed');
    });

    // -----------------------------------------------------------------
    // Phase 8: Productivity Metrics Update
    // -----------------------------------------------------------------
    await test('Phase 8.1: Productivity metrics update with factual completed tasks & study hours', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/productivity',
        headers: { Authorization: `Bearer ${tokenA}` },
        query: { range: 'week' }
      });
      assert.strictEqual(res.statusCode, 200);
      const productivity = res.body;

      // Completed task count
      assert.strictEqual(productivity.assignments.completedInPeriod, 1);
      // Completed study duration
      assert.strictEqual(productivity.studySessions.completedSessions, 1);
      assert.strictEqual(productivity.studySessions.completedMinutes, 60);
      assert.strictEqual(productivity.studySessions.completedHours, 1);

      // By-course study breakdown
      const osCourseStats = productivity.studySessions.byCourse.find(c => c.courseName === 'Operating Systems');
      assert.ok(osCourseStats);
      assert.strictEqual(osCourseStats.completedMinutes, 60);
    });

    // -----------------------------------------------------------------
    // Phase 9: Complete Remaining Tasks -> Goal Progress Reaches 100% & Auto-Completes
    // -----------------------------------------------------------------
    await test('Phase 9.1: Completing Task 2 and Overdue Task drives Goal to 100% and auto-completes', async () => {
      // Complete Task 2
      await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/assignments/${task2Id}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'completed' }
      });

      // Complete Overdue Task
      await makeRequest(server, {
        method: 'PATCH',
        path: `/api/academic/assignments/${overdueTaskId}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'completed' }
      });

      // Fetch Goal: 3/3 tasks completed -> progress = 100%, status = 'completed'
      const goalRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(goalRes.statusCode, 200);
      assert.strictEqual(goalRes.body.goal.progress, 100);
      assert.strictEqual(goalRes.body.goal.status, 'completed');
      assert.ok(goalRes.body.goal.completedAt);
    });

    // -----------------------------------------------------------------
    // Phase 10: Student Insights API Reflects Current State
    // -----------------------------------------------------------------
    await test('Phase 10.1: Student Insights API reflects cleared overdue backlog, completed goal, and zeroed active goals', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const { insights } = res.body;

      // Active goals is 0 because the goal is completed
      assert.strictEqual(insights.activeGoals.length, 0);
      assert.strictEqual(insights.summary.activeGoalsCount, 0);

      // Goal progress summary shows 1 completed goal
      assert.strictEqual(insights.goalProgress.total, 1);
      assert.strictEqual(insights.goalProgress.active, 0);
      assert.strictEqual(insights.goalProgress.completed, 1);

      // Overdue backlog cleared
      assert.strictEqual(insights.overdueAssignments.length, 0);
      assert.strictEqual(insights.summary.overdueAssignmentsCount, 0);

      // Upcoming assignments list cleared (all completed)
      assert.strictEqual(insights.upcomingAssignments.length, 0);
    });

    // -----------------------------------------------------------------
    // Phase 11: Notification Count Integration
    // -----------------------------------------------------------------
    await test('Phase 11.1: Notification count updates dynamically in insights overview', async () => {
      // Insert unread notification
      notificationRepository.create({
        user_id: userAId,
        title: 'Goal Achieved!',
        message: 'Congratulations on completing your Virtual Memory goal!',
        type: 'reminder',
        read: false
      });

      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.insights.unreadNotificationsCount, 1);
      assert.strictEqual(res.body.insights.summary.unreadNotificationsCount, 1);
    });

    // -----------------------------------------------------------------
    // Phase 12: Ownership Isolation Check
    // -----------------------------------------------------------------
    await test('Phase 12.1: Student B insights is completely isolated with 0 goals, 0 tasks, 0 notifications', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/insights',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const { insights } = res.body;
      assert.strictEqual(insights.student.id, userBId);
      assert.strictEqual(insights.unreadNotificationsCount, 0);
      assert.strictEqual(insights.activeGoals.length, 0);
      assert.strictEqual(insights.goalProgress.total, 0);
      assert.strictEqual(insights.upcomingAssignments.length, 0);
      assert.strictEqual(insights.overdueAssignments.length, 0);
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
  console.log(` MASTER LIFECYCLE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    console.error('SOME LIFECYCLE TESTS FAILED! ❌');
    process.exit(1);
  } else {
    console.log('ALL DAY 10 MASTER LIFECYCLE TESTS PASSED! 🎉\n');
  }
}

runMasterLifecycleTests().catch(err => {
  console.error('Fatal lifecycle test error:', err);
  process.exit(1);
});
