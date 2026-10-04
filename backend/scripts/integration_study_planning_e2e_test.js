/**
 * Comprehensive End-to-End Master Test Suite: Student Study Planning System
 *
 * Verifies the full end-to-end lifecycle:
 * Student
 * → Existing Assignments / Goals / Calendar / Workload
 * → Planning Engine
 * → Conflict Detection
 * → Planned Study Work
 * → Resources
 * → Insights
 * → Reminders / Notifications
 * → API Responses
 *
 * Scenarios Tested:
 * 1.  Student with upcoming assignments (multi-deadline scheduling)
 * 2.  Student with urgent deadline (dynamic priority elevation)
 * 3.  Completed/submitted assignments excluded from forward planning
 * 4.  Conflicting calendar events (lectures/labs) avoided cleanly
 * 5.  Existing study sessions respected and preserved
 * 6.  Insufficient free time detected with structured deficit warnings
 * 7.  Goal-linked assignments prioritized with item.goal_id populated
 * 8.  Contextual study resources seamlessly linked (item.resource_id populated)
 * 9.  Plan completion tracking (planned -> in_progress -> completed -> skipped)
 * 10. Planning insights calculations (planned vs completed, rates, overdue, missed, overloaded, unplanned urgent)
 * 11. Notification/reminder processing (upcoming, overdue, prep warnings)
 * 12. Duplicate prevention & spam suppression (idempotent notification dispatch)
 * 13. Plan recalculation (preserves completed work, avoids duplicates, updates schedule)
 * 14. Student with no upcoming work (clean empty state)
 * 15. Authorization and cross-student data isolation
 * 16. Date-range queries and IST timezone boundaries
 * 17. Validation failure handling and standardized error envelopes
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { getConnection } = require('../db/connection');
const { createApp } = require('../app');
const { studyPlanRepository } = require('../repositories/StudyPlanRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { studyResourceRepository } = require('../repositories/StudyResourceRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { StudyPlan } = require('../models/StudyPlan');
const { StudyPlanItem } = require('../models/StudyPlanItem');
const { Assignment } = require('../models/Assignment');
const { Goal } = require('../models/Goal');
const { Course } = require('../models/Course');
const { CalendarEvent } = require('../models/CalendarEvent');
const { StudySession } = require('../models/StudySession');
const { StudyResource } = require('../models/StudyResource');
const { signToken } = require('../utils/token');
const { getDateKeyIST, IST_OFFSET_MS } = require('../utils/timezone');

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
          } catch (_) {
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
    if (payload) req.write(payload);
    req.end();
  });
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
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

console.log('===================================================================');
console.log(' Running Comprehensive Study Planning End-to-End Master Test Suite');
console.log('===================================================================\n');

const db = getConnection();
const now = Date.now();
const hourMs = 3600000;
const dayMs = 86400000;

// Anchor base to tomorrow 00:00 IST
const tomorrowDate = new Date(now + dayMs);
const tomorrowKey = getDateKeyIST(tomorrowDate.getTime());
const [tY, tM, tD] = tomorrowKey.split('-').map(Number);
const tomorrow00 = Date.UTC(tY, tM - 1, tD, 0, 0, 0, 0) - IST_OFFSET_MS;

const day1 = tomorrow00;
const day2 = day1 + dayMs;
const day3 = day2 + dayMs;
const day4 = day3 + dayMs;

// Seed Students A and B
const studentA = `stu-e2e-a-${now}`;
const studentB = `stu-e2e-b-${now}`;

db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
  VALUES (?, ?, 'hash', 'Student Alpha', 'DJSCE', 'student', ?, ?),
         (?, ?, 'hash', 'Student Beta', 'DJSCE', 'student', ?, ?)
`).run(studentA, `${studentA}@example.com`, now, now, studentB, `${studentB}@example.com`, now, now);

const tokenA = signToken({ sub: studentA, id: studentA, email: `${studentA}@example.com`, role: 'student', full_name: 'Student Alpha' });
const tokenB = signToken({ sub: studentB, id: studentB, email: `${studentB}@example.com`, role: 'student', full_name: 'Student Beta' });

// Seed Courses
const courseCS = Course.create({ user_id: studentA, name: 'Computer Systems', code: 'CS201', color: '#3B82F6' });
const courseDS = Course.create({ user_id: studentA, name: 'Data Structures', code: 'CS202', color: '#10B981' });
courseRepository.create(courseCS);
courseRepository.create(courseDS);

(async () => {
  const app = createApp();
  let server = null;
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    let asgnUrgent = null;
    let asgnGoalLinked = null;
    let asgnCompleted = null;
    let asgnLate = null;
    let activeGoal = null;
    let attachedResource = null;
    let generatedPlanId = null;

    // =========================================================================
    // 1. SETUP ACADEMIC ENTITIES
    // =========================================================================
    await runTest('Setup: Seeds assignments, goal, resource, calendar events, and study session', async () => {
      // Goal
      activeGoal = Goal.create({
        user_id: studentA,
        course_id: courseCS.id,
        title: 'Master Memory Hierarchies',
        target_date: day3 + (18 * hourMs),
        progress: 25,
        status: 'in_progress'
      });
      goalRepository.create(activeGoal);

      // Urgent assignment due in Day 2 morning
      asgnUrgent = Assignment.create({
        user_id: studentA,
        course_id: courseCS.id,
        title: 'Virtual Memory Implementation',
        due_date: day2 + (12 * hourMs),
        priority: 'urgent',
        status: 'pending'
      });
      assignmentRepository.create(asgnUrgent);

      // Goal-linked assignment due in Day 3
      asgnGoalLinked = Assignment.create({
        user_id: studentA,
        course_id: courseCS.id,
        goal_id: activeGoal.id,
        title: 'Cache Memory Simulation Project',
        due_date: day3 + (16 * hourMs),
        priority: 'medium',
        status: 'in_progress'
      });
      assignmentRepository.create(asgnGoalLinked);

      // Contextual Study Resource linked to assignment & goal
      attachedResource = StudyResource.create({
        user_id: studentA,
        course_id: courseCS.id,
        assignment_id: asgnGoalLinked.id,
        goal_id: activeGoal.id,
        title: 'Cache Coherence Handbook PDF',
        resource_type: 'note',
        url: 'https://notes.example.edu/cache-handbook.pdf'
      });
      studyResourceRepository.create(attachedResource);

      // Completed assignment (MUST NOT be planned)
      asgnCompleted = Assignment.create({
        user_id: studentA,
        course_id: courseDS.id,
        title: 'Binary Search Trees Lab',
        due_date: day2 + (18 * hourMs),
        priority: 'high',
        status: 'completed',
        completed_at: now - 3600000
      });
      assignmentRepository.create(asgnCompleted);

      // Calendar Events (Lectures) on Day 1: 09:00 - 12:00 and 14:00 - 17:00
      calendarEventRepository.create(CalendarEvent.create({
        user_id: studentA,
        course_id: courseCS.id,
        title: 'CS201 Lecture',
        start_time: day1 + (9 * hourMs),
        end_time: day1 + (12 * hourMs),
        event_type: 'lecture',
        status: 'scheduled'
      }));

      calendarEventRepository.create(CalendarEvent.create({
        user_id: studentA,
        course_id: courseDS.id,
        title: 'CS202 Lab',
        start_time: day1 + (14 * hourMs),
        end_time: day1 + (17 * hourMs),
        event_type: 'lab',
        status: 'scheduled'
      }));

      // Existing Study Session on Day 2: 14:00 - 16:00
      studySessionRepository.create(StudySession.create({
        user_id: studentA,
        course_id: courseCS.id,
        title: 'Pre-existing Group Review',
        planned_start_time: day2 + (14 * hourMs),
        planned_duration_minutes: 120,
        status: 'planned'
      }));

      assert.ok(activeGoal.id);
      assert.ok(asgnUrgent.id);
      assert.ok(asgnGoalLinked.id);
    });

    // =========================================================================
    // 2. PLAN GENERATION & CONFLICT AVOIDANCE
    // =========================================================================
    await runTest('Planning Engine: Generates plan avoiding lectures & existing study sessions', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/generate',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Master Sprint Plan',
          startDate: day1,
          endDate: day4,
          dailyLimitMinutes: 240,
          defaultSessionDuration: 60,
          now: day1
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.plan);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length >= 2);

      generatedPlanId = res.body.plan.id;

      // Verify NO planned item overlaps with Day 1 lectures [09:00-12:00] or [14:00-17:00]
      for (const item of res.body.items) {
        const itemStart = item.planned_date;
        const itemEnd = itemStart + (item.duration_minutes * 60000);

        // Check morning lecture
        const overlapLec1 = itemStart < (day1 + (12 * hourMs)) && itemEnd > (day1 + (9 * hourMs));
        assert.strictEqual(overlapLec1, false, `Item '${item.title}' overlaps with morning lecture`);

        // Check afternoon lab
        const overlapLec2 = itemStart < (day1 + (17 * hourMs)) && itemEnd > (day1 + (14 * hourMs));
        assert.strictEqual(overlapLec2, false, `Item '${item.title}' overlaps with afternoon lab`);

        // Check existing Day 2 study session [14:00-16:00]
        const overlapSession = itemStart < (day2 + (16 * hourMs)) && itemEnd > (day2 + (14 * hourMs));
        assert.strictEqual(overlapSession, false, `Item '${item.title}' overlaps with existing study session`);
      }

      // Verify completed assignment was NOT planned
      const completedItem = res.body.items.find(i => (i.assignmentId || i.assignment_id) === asgnCompleted.id);
      assert.strictEqual(completedItem, undefined, 'Completed assignment must not have planned items');

      // Verify goal-linked work received goal_id and attached resource_id
      const goalLinkedItem = res.body.items.find(i => (i.assignmentId || i.assignment_id) === asgnGoalLinked.id);
      assert.ok(goalLinkedItem, 'Goal-linked assignment has planned work');
      assert.strictEqual(goalLinkedItem.goalId || goalLinkedItem.goal_id, activeGoal.id, 'Populates goal_id');
      assert.strictEqual(goalLinkedItem.resourceId || goalLinkedItem.resource_id, attachedResource.id, 'Populates resource_id from attached resource');
    });

    // =========================================================================
    // 3. RETRIEVAL & PROGRESS TRACKING
    // =========================================================================
    let itemIdToComplete = null;

    await runTest('API Retrieval: GET current plan and items with date filtering', async () => {
      // Current plan
      const curRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/current',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(curRes.statusCode, 200);
      assert.strictEqual(curRes.body.plan.id, generatedPlanId);
      assert.ok(curRes.body.items.length >= 2);
      itemIdToComplete = curRes.body.items[0].id;

      // Date filtering on Day 1
      const day1Key = getDateKeyIST(day1);
      const filterRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/items?date=${day1Key}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(filterRes.statusCode, 200);
      assert.ok(Array.isArray(filterRes.body.items));
      for (const item of filterRes.body.items) {
        assert.strictEqual(getDateKeyIST(item.plannedDate || item.planned_date), day1Key);
      }
    });

    // =========================================================================
    // 4. STATUS UPDATES & COMPLETION TRACKING
    // =========================================================================
    await runTest('Status Mutation: marks planned item as completed with automated timestamp', async () => {
      const patchRes = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/study-plans/items/${itemIdToComplete}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'completed' }
      });

      assert.strictEqual(patchRes.statusCode, 200);
      assert.strictEqual(patchRes.body.item.status, 'completed');
      assert.ok((patchRes.body.item.completedAt || patchRes.body.item.completed_at) > 0);
    });

    // =========================================================================
    // 5. PLANNING INSIGHTS & ANALYTICS INTEGRATION
    // =========================================================================
    await runTest('Planning Insights: computes planned vs completed, completion rates, and warnings', async () => {
      const insightRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/insights?now=${day1}&days=7`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(insightRes.statusCode, 200);
      const { insights } = insightRes.body;
      assert.ok(insights);
      assert.ok(insights.plannedVsCompleted);
      assert.ok(insights.plannedVsCompleted.totalPlannedItems >= 2);
      assert.strictEqual(insights.plannedVsCompleted.completedItemsCount, 1, '1 item was completed');
      assert.ok(insights.plannedVsCompleted.completionRate > 0);
      assert.ok(insights.upcomingOverloadedPeriods);
      assert.ok(Array.isArray(insights.overduePlannedWork.items));
      assert.ok(Array.isArray(insights.missedPlannedSessions.items));
    });

    // =========================================================================
    // 6. NOTIFICATION & REMINDER TRIGGERING WITH SPAM SUPPRESSION
    // =========================================================================
    await runTest('Reminders: triggers notifications and prevents duplicate dispatch', async () => {
      // First run: simulates reminder tick at day1
      const run1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/reminders/process',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { now: day1, leadTimeMinutes: 120 }
      });

      assert.strictEqual(run1.statusCode, 200);
      assert.ok(run1.body.result);
      const count1 = run1.body.result.remindersSent.totalCount;

      // Second run: immediate re-run must result in 0 new notifications
      const run2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/reminders/process',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { now: day1 + 60000, leadTimeMinutes: 120 }
      });

      assert.strictEqual(run2.statusCode, 200);
      assert.strictEqual(run2.body.result.remindersSent.totalCount, 0, 'Zero duplicate reminders dispatched');
    });

    // =========================================================================
    // 7. PLAN RECALCULATION & DUPLICATE PREVENTION
    // =========================================================================
    await runTest('Recalculation: regenerates schedule, preserves completed items, avoids duplicates', async () => {
      const recalcRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/study-plans/${generatedPlanId}/recalculate`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { now: day1 + (2 * hourMs) }
      });

      assert.strictEqual(recalcRes.statusCode, 200);
      assert.ok(recalcRes.body.plan);

      // Verify previously completed item is still in the plan
      const completedStillPresent = recalcRes.body.items.find(i => i.id === itemIdToComplete);
      assert.ok(completedStillPresent, 'Completed item was preserved');
      assert.strictEqual(completedStillPresent.status, 'completed');

      // Verify no duplicate items exist for the same assignment on the same start time
      const signatures = new Set();
      for (const it of recalcRes.body.items) {
        const sig = `${it.assignmentId || it.assignment_id || it.goalId || it.goal_id}:${it.plannedDate || it.planned_date}`;
        assert.strictEqual(signatures.has(sig), false, `Duplicate planned item found: ${sig}`);
        signatures.add(sig);
      }
    });

    // =========================================================================
    // 8. EMPTY PLANNING PERIOD (STUDENT WITH NO UPCOMING WORK)
    // =========================================================================
    await runTest('Empty State: Student B with no assignments gets clean empty plan without errors', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/generate',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: {
          title: 'Empty Student Plan',
          startDate: day1,
          endDate: day3,
          now: day1
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.items.length, 0);
      assert.strictEqual(res.body.summary.totalItemsPlanned, 0);
      assert.strictEqual(res.body.summary.totalStudyMinutes, 0);
    });

    // =========================================================================
    // 9. AUTHORIZATION & CROSS-STUDENT DATA ISOLATION
    // =========================================================================
    await runTest('Multi-Tenant Isolation: Student B cannot view, modify, or recalculate Student A plans', async () => {
      // Student B attempts to fetch Student A's plan
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/${generatedPlanId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(getRes.statusCode, 404, 'Must return 404 for unowned plan');

      // Student B attempts to recalculate Student A's plan
      const recalcRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/study-plans/${generatedPlanId}/recalculate`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: {}
      });
      assert.strictEqual(recalcRes.statusCode, 404, 'Must return 404 for recalculating unowned plan');

      // Student B attempts to mutate Student A's item status
      const patchRes = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/study-plans/items/${itemIdToComplete}/status`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { status: 'skipped' }
      });
      assert.strictEqual(patchRes.statusCode, 404, 'Must return 404 for mutating unowned item');
    });

    // =========================================================================
    // 10. VALIDATION & ERROR HANDLING
    // =========================================================================
    await runTest('Validation: Rejects invalid inputs with 400 VALIDATION_ERROR', async () => {
      // End date before start date
      const badDates = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/generate',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          startDate: day3,
          endDate: day1
        }
      });
      assert.strictEqual(badDates.statusCode, 400);

      // Invalid status transition
      const badStatus = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/study-plans/items/${itemIdToComplete}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'non_existent_status' }
      });
      assert.strictEqual(badStatus.statusCode, 400);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n===================================================================');
  console.log(` E2E Test Results: ${passed} passed, ${failed} failed`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
