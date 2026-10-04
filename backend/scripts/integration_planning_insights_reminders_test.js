/**
 * Integration Test Suite: Planning Insights & Reminders Integration
 *
 * Verifies:
 * 1. Planned vs Completed Work:
 *    - Accurate calculation of total planned items, completed items, pending items, skipped items
 *    - Accurate calculation of total planned minutes, completed minutes, pending minutes
 *    - Accurate completionRate (item-based %) and completionRateMinutes (time-based %)
 * 2. Overdue Planned Work:
 *    - Detects planned study items whose scheduled start time has elapsed without completion
 * 3. Missed Planned Sessions:
 *    - Detects planned study sessions whose entire duration window has passed without completion
 * 4. Upcoming Overloaded Periods:
 *    - Connects with WorkloadAnalysisService to detect heavy days, busiest days, and overloaded periods
 * 5. Unplanned Urgent Assignments:
 *    - Detects active assignments approaching deadline (<= 48h) or marked urgent with zero planned study work
 * 6. Insufficient Preparation Warnings:
 *    - Detects upcoming assignments where allocated planned study time is less than recommended preparation
 * 7. Productivity Analytics Integration:
 *    - Verifies ProductivityAnalyticsService.getProductivityMetrics contains studyPlanning analytics
 * 8. Student Insights Integration:
 *    - Verifies StudentInsightsService.getStudentInsights contains planningInsights and enriched summary
 * 9. Notification Triggering for Upcoming Planned Study Work:
 *    - Generates reminders for sessions scheduled to start within lead time window (e.g. 60 minutes)
 * 10. Notification Triggering for Overdue Planned Items:
 *     - Generates reminders for overdue study sessions
 * 11. Notification Triggering for Deadline Preparation Warnings:
 *     - Generates high-priority warnings for impending deliverables with prep deficits
 * 12. Duplicate Prevention & Spam Suppression:
 *     - Idempotent execution: re-running reminder processing never dispatches duplicate notifications
 * 13. HTTP API Endpoints:
 *     - Authenticated GET /api/student/study-plans/insights
 *     - Authenticated POST /api/student/study-plans/reminders/process
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { getConnection } = require('../db/connection');
const { createApp } = require('../app');
const { studyPlanRepository } = require('../repositories/StudyPlanRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { studyPlanningService } = require('../services/studyPlanningService');
const { productivityAnalyticsService } = require('../services/productivityAnalyticsService');
const { studentInsightsService } = require('../services/studentInsightsService');
const { StudyPlan } = require('../models/StudyPlan');
const { StudyPlanItem } = require('../models/StudyPlanItem');
const { Assignment } = require('../models/Assignment');
const { Course } = require('../models/Course');
const { signToken } = require('../utils/token');

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

async function runAsyncTest(name, fn) {
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
console.log(' Running Planning Insights & Reminders Integration Test Suite     ');
console.log('===================================================================\n');

const db = getConnection();

// Seed test student
const timestamp = Date.now();
const studentId = `stu-insights-${timestamp}`;
const studentEmail = `student-${timestamp}@example.com`;

db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
  VALUES (?, ?, 'hash', 'Insights Test Student', 'DJSCE', 'student', ?, ?)
`).run(studentId, studentEmail, timestamp, timestamp);

const studentUser = { sub: studentId, id: studentId, email: studentEmail, role: 'student', full_name: 'Insights Test Student' };
const studentToken = signToken(studentUser);

// Seed course
const course = Course.create({
  user_id: studentId,
  name: 'Operating Systems',
  code: 'CS301',
  color: '#3B82F6'
});
courseRepository.create(course);

// Reference time: anchor to a deterministic fixed "now"
const refNow = timestamp + 100000;
const hourMs = 3600000;
const dayMs = 86400000;

(async () => {
  let createdPlan = null;
  let itemUpcoming = null;
  let itemOverdue = null;
  let itemMissed = null;
  let itemCompleted = null;
  let itemFuture = null;
  let asgnUrgentUnplanned = null;
  let asgnWithDeficit = null;
  let server = null;

  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });

  try {
    // =========================================================================
    // SETUP TEST DATA
    // =========================================================================
    await runAsyncTest('Setup: Seeds test assignments, study plan, and planned items', async () => {
      // 1. Create assignments
      // A. Urgent assignment with ZERO planned study work
      asgnUrgentUnplanned = Assignment.create({
        user_id: studentId,
        course_id: course.id,
        title: 'OS Kernel Memory Assignment',
        due_date: refNow + (20 * hourMs), // due in 20 hours
        priority: 'urgent',
        status: 'pending',
        estimated_hours: 3
      });
      assignmentRepository.create(asgnUrgentUnplanned);

      // B. Assignment due in 40 hours with deficit in preparation
      asgnWithDeficit = Assignment.create({
        user_id: studentId,
        course_id: course.id,
        title: 'Concurrency Deadlock Project',
        due_date: refNow + (40 * hourMs), // due in 40 hours
        priority: 'high',
        status: 'in_progress',
        estimated_hours: 4 // 240 mins needed
      });
      assignmentRepository.create(asgnWithDeficit);

      // 2. Create Study Plan
      createdPlan = StudyPlan.create({
        user_id: studentId,
        title: 'Midterm Prep Plan',
        start_date: refNow - (2 * dayMs),
        end_date: refNow + (5 * dayMs),
        status: 'active'
      });
      studyPlanRepository.createPlan(createdPlan);

      // 3. Create Study Plan Items with various statuses and time horizons:
      // A. Completed item (yesterday, 60m)
      itemCompleted = StudyPlanItem.create({
        user_id: studentId,
        plan_id: createdPlan.id,
        course_id: course.id,
        title: 'Review Virtual Memory Slides',
        planned_date: refNow - (24 * hourMs),
        duration_minutes: 60,
        priority: 'medium',
        status: 'completed',
        completed_at: refNow - (23 * hourMs)
      });
      studyPlanRepository.createItem(itemCompleted);

      // B. Overdue & Missed item (started 4 hours ago, 90m duration, not completed)
      itemMissed = StudyPlanItem.create({
        user_id: studentId,
        plan_id: createdPlan.id,
        course_id: course.id,
        title: 'Process Synchronization Lab',
        planned_date: refNow - (4 * hourMs),
        duration_minutes: 90,
        priority: 'high',
        status: 'planned'
      });
      studyPlanRepository.createItem(itemMissed);

      // C. Overdue item that just started 15 minutes ago (duration 60m, still ongoing window but start is past)
      itemOverdue = StudyPlanItem.create({
        user_id: studentId,
        plan_id: createdPlan.id,
        course_id: course.id,
        title: 'Page Replacement Algorithms Practice',
        planned_date: refNow - (15 * 60000), // 15 mins ago
        duration_minutes: 60,
        priority: 'medium',
        status: 'planned'
      });
      studyPlanRepository.createItem(itemOverdue);

      // D. Upcoming item starting in 30 minutes (within 60m lead time window)
      // Linked to asgnWithDeficit (duration 60m, deficit is 240 - 60 = 180m)
      itemUpcoming = StudyPlanItem.create({
        user_id: studentId,
        plan_id: createdPlan.id,
        course_id: course.id,
        assignment_id: asgnWithDeficit.id,
        title: 'Concurrency Synchronization Coding',
        planned_date: refNow + (30 * 60000), // 30 mins in future
        duration_minutes: 60,
        priority: 'urgent',
        status: 'planned'
      });
      studyPlanRepository.createItem(itemUpcoming);

      // E. Future item starting tomorrow (beyond 60m lead time)
      itemFuture = StudyPlanItem.create({
        user_id: studentId,
        plan_id: createdPlan.id,
        course_id: course.id,
        title: 'File System Design Review',
        planned_date: refNow + (24 * hourMs),
        duration_minutes: 45,
        priority: 'low',
        status: 'planned'
      });
      studyPlanRepository.createItem(itemFuture);

      assert.ok(createdPlan.id, 'Plan was created');
      assert.strictEqual(itemUpcoming.status, 'planned');
    });

    // =========================================================================
    // 1. PLANNED VS COMPLETED STUDY WORK & COMPLETION RATE
    // =========================================================================
    await runAsyncTest('Insight Calculation: planned vs completed study work and completion rate', async () => {
      const insights = await studyPlanningService.getPlanningInsights(studentId, {
        now: refNow,
        planId: createdPlan.id
      });

      assert.ok(insights.plannedVsCompleted, 'plannedVsCompleted section exists');
      const { plannedVsCompleted } = insights;

      // Total items: 5 (completed, missed, overdue, upcoming, future)
      assert.strictEqual(plannedVsCompleted.totalPlannedItems, 5);
      assert.strictEqual(plannedVsCompleted.completedItemsCount, 1);
      assert.strictEqual(plannedVsCompleted.pendingItemsCount, 4);

      // Minutes: completed = 60, total = 60 + 90 + 60 + 60 + 45 = 315
      assert.strictEqual(plannedVsCompleted.completedMinutes, 60);
      assert.strictEqual(plannedVsCompleted.totalPlannedMinutes, 315);
      assert.strictEqual(plannedVsCompleted.pendingMinutes, 255);

      // Completion rates
      // Item rate: 1/5 = 20%
      assert.strictEqual(plannedVsCompleted.completionRate, 20);
      // Minute rate: 60/315 * 100 = 19%
      assert.strictEqual(plannedVsCompleted.completionRateMinutes, 19);
    });

    // =========================================================================
    // 2. OVERDUE PLANNED WORK DETECTION
    // =========================================================================
    await runAsyncTest('Insight Calculation: detects overdue planned items whose scheduled start has passed', async () => {
      const insights = await studyPlanningService.getPlanningInsights(studentId, {
        now: refNow,
        planId: createdPlan.id
      });

      const { overduePlannedWork } = insights;
      assert.ok(overduePlannedWork, 'overduePlannedWork section exists');

      // Both itemMissed (-4h) and itemOverdue (-15m) have planned_date < now and status 'planned'
      assert.strictEqual(overduePlannedWork.count, 2);
      assert.strictEqual(overduePlannedWork.totalMinutes, 150); // 90 + 60

      const overdueIds = overduePlannedWork.items.map(i => i.id);
      assert.ok(overdueIds.includes(itemMissed.id));
      assert.ok(overdueIds.includes(itemOverdue.id));
      assert.ok(!overdueIds.includes(itemCompleted.id), 'Completed items are not overdue');
      assert.ok(!overdueIds.includes(itemUpcoming.id), 'Future items are not overdue');
    });

    // =========================================================================
    // 3. MISSED PLANNED SESSIONS DETECTION
    // =========================================================================
    await runAsyncTest('Insight Calculation: detects missed sessions whose entire duration has elapsed', async () => {
      const insights = await studyPlanningService.getPlanningInsights(studentId, {
        now: refNow,
        planId: createdPlan.id
      });

      const { missedPlannedSessions } = insights;
      assert.ok(missedPlannedSessions, 'missedPlannedSessions section exists');

      // itemMissed started 4 hours ago and was 90m duration => finished 2.5 hours ago => missed!
      // itemOverdue started 15 mins ago and was 60m duration => ends in 45 mins => start is overdue, but session window is not fully passed
      assert.strictEqual(missedPlannedSessions.count, 1);
      assert.strictEqual(missedPlannedSessions.totalMinutes, 90);
      assert.strictEqual(missedPlannedSessions.items[0].id, itemMissed.id);
    });

    // =========================================================================
    // 4. UNPLANNED URGENT ASSIGNMENTS
    // =========================================================================
    await runAsyncTest('Insight Calculation: identifies urgent assignments with zero planned study work', async () => {
      const insights = await studyPlanningService.getPlanningInsights(studentId, {
        now: refNow
      });

      const { unplannedUrgentAssignments } = insights;
      assert.ok(unplannedUrgentAssignments, 'unplannedUrgentAssignments section exists');

      // asgnUrgentUnplanned has zero planned items
      assert.ok(unplannedUrgentAssignments.count >= 1);
      const found = unplannedUrgentAssignments.assignments.find(a => a.assignmentId === asgnUrgentUnplanned.id);
      assert.ok(found, 'Found asgnUrgentUnplanned in list');
      assert.strictEqual(found.title, 'OS Kernel Memory Assignment');
      assert.strictEqual(found.priority, 'urgent');

      // asgnWithDeficit HAS an upcoming planned item (itemUpcoming), so it is not in unplanned list
      const deficitInUnplanned = unplannedUrgentAssignments.assignments.find(a => a.assignmentId === asgnWithDeficit.id);
      assert.strictEqual(deficitInUnplanned, undefined, 'Assignment with planned work should not be flagged as completely unplanned');
    });

    // =========================================================================
    // 5. INSUFFICIENT PREPARATION WARNINGS
    // =========================================================================
    await runAsyncTest('Insight Calculation: warns when an important deadline has insufficient planned prep', async () => {
      const insights = await studyPlanningService.getPlanningInsights(studentId, {
        now: refNow
      });

      const { insufficientPreparationWarnings } = insights;
      assert.ok(insufficientPreparationWarnings, 'insufficientPreparationWarnings section exists');

      // asgnWithDeficit (high priority) has default recommended 120 mins, and has itemUpcoming (60 mins) planned => deficit is 60 mins
      const warning = insufficientPreparationWarnings.warnings.find(w => w.assignmentId === asgnWithDeficit.id);
      assert.ok(warning, 'Found warning for asgnWithDeficit');
      assert.strictEqual(warning.plannedMinutes, 60);
      assert.strictEqual(warning.recommendedMinutes, 120);
      assert.strictEqual(warning.deficitMinutes, 60);
      assert.ok(warning.hoursUntilDue <= 40);
    });

    // =========================================================================
    // 6. UPCOMING OVERLOADED PERIODS DETECTION
    // =========================================================================
    await runAsyncTest('Insight Calculation: connects to workload analysis to report overloaded periods', async () => {
      const insights = await studyPlanningService.getPlanningInsights(studentId, {
        now: refNow,
        days: 7
      });

      assert.ok(insights.upcomingOverloadedPeriods, 'upcomingOverloadedPeriods section exists');
      assert.ok(Array.isArray(insights.upcomingOverloadedPeriods.overloadedDates));
      assert.ok(typeof insights.upcomingOverloadedPeriods.status === 'string');
      assert.strictEqual(insights.upcomingOverloadedPeriods.windowDays, 7);
    });

    // =========================================================================
    // 7. PRODUCTIVITY ANALYTICS INTEGRATION
    // =========================================================================
    await runAsyncTest('Analytics Architecture: ProductivityAnalyticsService includes studyPlanning', async () => {
      const metrics = productivityAnalyticsService.getProductivityMetrics(studentId, studentUser, {
        range: 'custom',
        from: refNow - (2 * dayMs),
        to: refNow + (5 * dayMs)
      });

      assert.ok(metrics.studyPlanning, 'studyPlanning section exists in productivity analytics');
      assert.strictEqual(metrics.studyPlanning.totalPlannedItems, 5);
      assert.strictEqual(metrics.studyPlanning.completedItems, 1);
      assert.strictEqual(metrics.studyPlanning.pendingItems, 4);
      assert.strictEqual(metrics.studyPlanning.completionRate, 20);
      assert.strictEqual(metrics.studyPlanning.completionRateMinutes, 19);
      assert.strictEqual(metrics.studyPlanning.overdueItems, 2);
      assert.strictEqual(metrics.studyPlanning.missedSessions, 1);
    });

    // =========================================================================
    // 8. STUDENT INSIGHTS INTEGRATION
    // =========================================================================
    await runAsyncTest('Analytics Architecture: StudentInsightsService aggregates planning insights', async () => {
      const insights = await studentInsightsService.getStudentInsights(studentId, studentUser, {
        range: 'week'
      });

      assert.ok(insights.planningInsights, 'planningInsights included in student insights payload');
      assert.strictEqual(insights.summary.plannedStudyItemsCount, 5);
      assert.strictEqual(insights.summary.planCompletionRate, 20);
      assert.strictEqual(insights.summary.overduePlannedWorkCount, 2);
      assert.strictEqual(insights.summary.missedPlannedSessionsCount, 1);
      assert.ok(insights.summary.unplannedUrgentAssignmentsCount >= 1);
    });

    // =========================================================================
    // 9. REMINDERS & NOTIFICATION TRIGGERING
    // =========================================================================
    await runAsyncTest('Reminders: triggers upcoming session, overdue session, and prep warning reminders', async () => {
      // Lead time 60 minutes: itemUpcoming is in 30 minutes, so it should trigger
      // itemOverdue and itemMissed: overdue within 48h, so they should trigger
      // asgnWithDeficit and asgnUrgentUnplanned: due <= 48h with deficits, so they trigger prep warnings
      const firstRunResults = await studyPlanningService.processPlanningReminders(studentId, {
        now: refNow,
        leadTimeMinutes: 60
      });

      assert.ok(firstRunResults, 'Processing completed');
      const { remindersSent, notifications } = firstRunResults;

      assert.strictEqual(remindersSent.upcomingCount, 1, '1 upcoming reminder sent for itemUpcoming');
      assert.strictEqual(remindersSent.overdueCount, 2, '2 overdue reminders sent for itemMissed & itemOverdue');
      assert.strictEqual(remindersSent.prepWarningCount, 2, '2 preparation warnings sent for deficit assignments');
      assert.strictEqual(remindersSent.totalCount, 5);

      // Verify upcoming reminder attributes
      const upcomingNotif = notifications.find(n => n.related_resource_type === 'study_plan_item_upcoming');
      assert.ok(upcomingNotif);
      assert.strictEqual(upcomingNotif.related_resource_id, itemUpcoming.id);
      assert.ok(upcomingNotif.title.includes('Upcoming Study'));
      assert.strictEqual(upcomingNotif.type, 'reminder');

      // Verify overdue reminder attributes
      const overdueNotif = notifications.find(n => n.related_resource_type === 'study_plan_item_overdue');
      assert.ok(overdueNotif);
      assert.ok(overdueNotif.title.includes('Overdue Study Session'));
      assert.strictEqual(overdueNotif.priority, 'high');

      // Verify preparation warning attributes
      const prepNotif = notifications.find(n => n.related_resource_type === 'assignment_prep_warning');
      assert.ok(prepNotif);
      assert.ok(prepNotif.title.includes('Preparation Warning'));
    });

    // =========================================================================
    // 10. DUPLICATE PREVENTION & SPAM SUPPRESSION
    // =========================================================================
    await runAsyncTest('Duplicate Prevention: re-running reminder processing dispatches 0 duplicates', async () => {
      // Running the exact same check 1 minute later
      const secondRunResults = await studyPlanningService.processPlanningReminders(studentId, {
        now: refNow + 60000,
        leadTimeMinutes: 60
      });

      assert.strictEqual(secondRunResults.remindersSent.upcomingCount, 0, 'No duplicate upcoming reminders');
      assert.strictEqual(secondRunResults.remindersSent.overdueCount, 0, 'No duplicate overdue reminders');
      assert.strictEqual(secondRunResults.remindersSent.prepWarningCount, 0, 'No duplicate prep warnings (24h throttled)');
      assert.strictEqual(secondRunResults.remindersSent.totalCount, 0, 'Total new reminders sent is 0');
      assert.strictEqual(secondRunResults.notifications.length, 0);

      // Check notifications in database: exactly 5 records were created and no duplicates
      const allNotifs = notificationRepository.findByUserId(studentId);
      const planNotifs = allNotifs.filter(n => 
        ['study_plan_item_upcoming', 'study_plan_item_overdue', 'assignment_prep_warning'].includes(n.related_resource_type)
      );
      assert.strictEqual(planNotifs.length, 5, 'Exact number of notifications in DB remains 5 without duplicates');
    });

    // =========================================================================
    // 11. HTTP API: GET /api/student/study-plans/insights
    // =========================================================================
    await runAsyncTest('HTTP API: GET /api/student/study-plans/insights returns 200 with insights payload', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/insights?now=${refNow}&days=7`,
        headers: {
          Authorization: `Bearer ${studentToken}`
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.insights);

      const { insights } = res.body;
      assert.strictEqual(insights.plannedVsCompleted.totalPlannedItems, 5);
      assert.strictEqual(insights.plannedVsCompleted.completionRate, 20);
      assert.strictEqual(insights.overduePlannedWork.count, 2);
      assert.strictEqual(insights.missedPlannedSessions.count, 1);
      assert.ok(insights.unplannedUrgentAssignments.count >= 1);
      assert.ok(insights.insufficientPreparationWarnings.count >= 1);
    });

    // =========================================================================
    // 12. HTTP API: POST /api/student/study-plans/reminders/process
    // =========================================================================
    await runAsyncTest('HTTP API: POST /api/student/study-plans/reminders/process returns 200 and processes safely', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/reminders/process',
        headers: {
          Authorization: `Bearer ${studentToken}`
        },
        body: { now: refNow + 120000, leadTimeMinutes: 60 }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.result);
      assert.strictEqual(res.body.result.remindersSent.totalCount, 0, 'Duplicate check holds through HTTP API');
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
  console.log(` Test Results: ${passed} passed, ${failed} failed`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
