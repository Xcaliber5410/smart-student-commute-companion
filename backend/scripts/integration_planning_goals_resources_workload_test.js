/**
 * Integration Test Suite: Planning Engine with Goals, Resources & Workload Integration
 *
 * Verifies that the deterministic study planning engine:
 * 1. Goal-Linked Work: Prioritizes assignments linked to goals (+0.5 boost) and populates item.goal_id
 * 2. Approaching Deadlines: Elevates priority (urgent <= 24h, high <= 48h) and prioritizes near-term work
 * 3. Workload-Heavy Periods: Detects heavy days via workload analysis and steers non-urgent work away from heavy days
 * 4. Resource Association: Seamlessly associates contextual study materials (resource_id) to assignment & goal items
 * 5. Mixed Priorities: Schedules a realistic mix of urgent, high, medium, low, goal-linked deliverables deterministically
 * 6. Already-Completed Work: Strictly avoids planning completed/submitted assignments or completed/100% progress goals
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studyResourceRepository } = require('../repositories/StudyResourceRepository');
const { studyPlanningService, StudyPlanningService } = require('../services/studyPlanningService');
const { workloadAnalysisService } = require('../services/workloadAnalysisService');
const { resourceContextService } = require('../services/resourceContextService');
const { Assignment } = require('../models/Assignment');
const { Goal } = require('../models/Goal');
const { Course } = require('../models/Course');
const { CalendarEvent } = require('../models/CalendarEvent');
const { StudyResource } = require('../models/StudyResource');
const { getDateKeyIST, IST_OFFSET_MS, formatInMumbaiTime } = require('../utils/timezone');

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

console.log('================================================================');
console.log(' Running Study Planning: Goals, Resources & Workload Test Suite ');
console.log('================================================================\n');

const db = getConnection();

// Seed test student
const student = `stu-plan-grw-${Date.now()}`;
db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
  VALUES (?, ?, 'hash', 'Integration Student', 'DJSCE', 'student', ?, ?)
`).run(student, `${student}@example.com`, Date.now(), Date.now());

// Create courses
const crsAlgorithms = Course.create({ user_id: student, name: 'Advanced Algorithms', code: 'CS401', color: '#6366F1' });
const crsDatabase = Course.create({ user_id: student, name: 'Distributed Databases', code: 'CS402', color: '#10B981' });
courseRepository.create(crsAlgorithms);
courseRepository.create(crsDatabase);

// Anchor times to tomorrow 00:00 IST
const now = Date.now();
const tomorrowDate = new Date(now + 86400000);
const tomorrowKey = getDateKeyIST(tomorrowDate.getTime());
const [tY, tM, tD] = tomorrowKey.split('-').map(Number);
const tomorrow00 = Date.UTC(tY, tM - 1, tD, 0, 0, 0, 0) - IST_OFFSET_MS;

const day1 = tomorrow00;
const day2 = day1 + 86400000;
const day3 = day2 + 86400000;
const day4 = day3 + 86400000;
const day5 = day4 + 86400000;

(async () => {
  // =========================================================================
  // 1. GOAL-LINKED WORK
  // =========================================================================
  await runAsyncTest('Goal-Linked Work: assigns priority boost to goal-supported assignment and sets item.goal_id', async () => {
    // Create an active goal
    const goalAlgoMastery = Goal.create({
      user_id: student,
      course_id: crsAlgorithms.id,
      title: 'Master Graph Algorithms',
      target_date: day4 + (18 * 3600000),
      progress: 30,
      status: 'in_progress'
    });
    goalRepository.create(goalAlgoMastery);

    // Two assignments due at exact same time with same base priority 'medium'
    // Assignment A is linked to goalAlgoMastery, Assignment B is unlinked
    const asgnGoalLinked = Assignment.create({
      user_id: student,
      course_id: crsAlgorithms.id,
      goal_id: goalAlgoMastery.id,
      title: 'Graph Traversal Problem Set',
      due_date: day3 + (18 * 3600000),
      priority: 'medium',
      status: 'pending',
      created_at: now,
      updated_at: now
    });
    const asgnStandard = Assignment.create({
      user_id: student,
      course_id: crsAlgorithms.id,
      title: 'Sorting Benchmark Analysis',
      due_date: day3 + (18 * 3600000),
      priority: 'medium',
      status: 'pending',
      created_at: now,
      updated_at: now
    });

    assignmentRepository.create(asgnGoalLinked);
    assignmentRepository.create(asgnStandard);

    const planResult = await studyPlanningService.generateStudyPlan(student, {
      startDate: day1,
      days: 3,
      now: day1,
      includeGoals: false // isolate assignment ordering
    });

    assert.ok(planResult.items.length >= 2, 'Should plan both assignments');
    const firstItem = planResult.items[0];
    const secondItem = planResult.items[1];

    // Goal-linked assignment should be scheduled FIRST due to goal boost
    assert.strictEqual(firstItem.assignment_id, asgnGoalLinked.id, 'Goal-linked assignment should be scheduled before unlinked assignment');
    assert.strictEqual(firstItem.goal_id, goalAlgoMastery.id, 'Planned item must reference the supported goal_id');
    assert.strictEqual(firstItem.course_id, crsAlgorithms.id, 'Planned item must reference the course_id');
    assert.strictEqual(secondItem.assignment_id, asgnStandard.id, 'Unlinked assignment scheduled after');
    assert.strictEqual(secondItem.goal_id, null, 'Unlinked item has null goal_id');
    assert.ok(planResult.summary.goalLinkedItemsCount >= 1, 'Summary reflects goalLinkedItemsCount');
  });

  // =========================================================================
  // 2. DEADLINE PRIORITY
  // =========================================================================
  await runAsyncTest('Deadline Priority: approaching deadlines receive elevated priority and earlier scheduling', async () => {
    // Clear out assignments for this test by creating distinct user
    const studentDeadlines = `stu-deadlines-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Deadline Student', 'DJSCE', 'student', ?, ?)
    `).run(studentDeadlines, `${studentDeadlines}@example.com`, Date.now(), Date.now());

    // Deliverable 1: due in 20 hours (approaching <= 24h) -> base priority was 'low'
    const urgentAsgn = Assignment.create({
      user_id: studentDeadlines,
      course_id: crsDatabase.id,
      title: 'Tomorrow Morning Schema Quiz',
      due_date: day1 + (20 * 3600000), // 8:00 PM tomorrow
      priority: 'low',
      status: 'pending'
    });

    // Deliverable 2: due in 4 days -> base priority was 'high'
    const laterHighAsgn = Assignment.create({
      user_id: studentDeadlines,
      course_id: crsDatabase.id,
      title: 'Semester Project Milestone 1',
      due_date: day4 + (18 * 3600000),
      priority: 'high',
      status: 'pending'
    });

    assignmentRepository.create(urgentAsgn);
    assignmentRepository.create(laterHighAsgn);

    const planResult = await studyPlanningService.generateStudyPlan(studentDeadlines, {
      startDate: day1,
      days: 5,
      now: day1
    });

    assert.ok(planResult.items.length >= 2, 'Should plan both assignments');
    const firstItem = planResult.items[0];

    // Quiz due tomorrow morning must be planned before the 4-day later project
    assert.strictEqual(firstItem.assignment_id, urgentAsgn.id, 'Urgent near-deadline deliverable scheduled first');
    assert.strictEqual(firstItem.priority, 'urgent', 'Approaching <= 24h deadline elevates priority from low to urgent');
    assert.ok(firstItem.planned_date < urgentAsgn.due_date, 'Scheduled strictly before deadline');
  });

  // =========================================================================
  // 3. WORKLOAD-HEAVY PERIODS
  // =========================================================================
  await runAsyncTest('Workload-Heavy Periods: detects heavy days and steers non-urgent work to lighter days', async () => {
    const studentWorkload = `stu-workload-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Workload Student', 'DJSCE', 'student', ?, ?)
    `).run(studentWorkload, `${studentWorkload}@example.com`, Date.now(), Date.now());

    // Make Day 1 a heavy day: 4 hours of lectures from 09:00 to 13:00 (240 minutes)
    const heavyLecture = CalendarEvent.create({
      user_id: studentWorkload,
      course_id: crsAlgorithms.id,
      title: 'Marathon Systems Workshop',
      event_type: 'lecture',
      start_time: day1 + (9 * 3600000),
      end_time: day1 + (13 * 3600000),
      status: 'scheduled'
    });
    calendarEventRepository.create(heavyLecture);

    // Verify workloadAnalysisService classifies day1 as heavy
    const workloadSummary = await workloadAnalysisService.getWorkloadSummary(studentWorkload, {
      start: day1,
      end: day3
    });
    assert.strictEqual(workloadSummary.summary.heavyDaysCount, 1, 'Should detect 1 heavy day');
    assert.strictEqual(workloadSummary.dailyBreakdown[0].isHeavyDay, true, 'Day 1 is heavy');
    assert.strictEqual(workloadSummary.dailyBreakdown[1].isHeavyDay, false, 'Day 2 is light');

    // Deliverable due on Day 3 (not urgent on Day 1)
    const asgnFlexible = Assignment.create({
      user_id: studentWorkload,
      course_id: crsAlgorithms.id,
      title: 'Database Indexing Essay',
      due_date: day3 + (18 * 3600000),
      priority: 'medium',
      status: 'pending'
    });
    assignmentRepository.create(asgnFlexible);

    const planResult = await studyPlanningService.generateStudyPlan(studentWorkload, {
      startDate: day1,
      days: 3,
      now: day1
    });

    assert.ok(planResult.items.length >= 1, 'Should generate plan item');
    const plannedItem = planResult.items[0];

    // The planned item should steer AWAY from Day 1 (heavy) and be scheduled on Day 2 (light)
    const day1Key = getDateKeyIST(day1);
    const day2Key = getDateKeyIST(day2);
    const plannedDateKey = getDateKeyIST(plannedItem.planned_date);

    assert.strictEqual(plannedDateKey, day2Key, `Non-urgent deliverable steered away from heavy Day 1 (${day1Key}) to light Day 2 (${day2Key})`);
    assert.ok(planResult.summary.workloadAnalysis, 'Plan summary includes workloadAnalysis');
    assert.strictEqual(planResult.summary.workloadAnalysis.heavyDaysCount, 1, 'Reports 1 heavy day in plan summary');
    assert.deepStrictEqual(planResult.summary.workloadAnalysis.heavyDates, [day1Key]);
  });

  // =========================================================================
  // 4. RESOURCE ASSOCIATION
  // =========================================================================
  await runAsyncTest('Resource Association: seamlessly attaches contextual study resources to planned items', async () => {
    const studentResources = `stu-resources-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Resource Student', 'DJSCE', 'student', ?, ?)
    `).run(studentResources, `${studentResources}@example.com`, Date.now(), Date.now());

    // 1. Assignment with study resource
    const asgnAlgo = Assignment.create({
      user_id: studentResources,
      course_id: crsAlgorithms.id,
      title: 'Dynamic Programming Knapsack Problem',
      due_date: day2 + (18 * 3600000),
      priority: 'high',
      status: 'pending'
    });
    assignmentRepository.create(asgnAlgo);

    const resAlgoNotes = StudyResource.create({
      user_id: studentResources,
      course_id: crsAlgorithms.id,
      assignment_id: asgnAlgo.id,
      title: 'Knapsack DP Cheatsheet & Recurrence Formulas',
      resource_type: 'note',
      content: 'Optimal substructure: dp[w] = max(dp[w], dp[w - wt[i]] + val[i])',
      is_favorite: 1
    });
    studyResourceRepository.create(resAlgoNotes);

    // 2. Goal with study resource
    const goalDb = Goal.create({
      user_id: studentResources,
      course_id: crsDatabase.id,
      title: 'Master B-Tree Index Implementation',
      target_date: day3 + (18 * 3600000),
      progress: 20,
      status: 'in_progress'
    });
    goalRepository.create(goalDb);

    const resDbPaper = StudyResource.create({
      user_id: studentResources,
      course_id: crsDatabase.id,
      goal_id: goalDb.id,
      title: 'B-Trees and High-Concurrency Indexing Paper',
      resource_type: 'reference',
      url: 'https://example.com/btree-paper.pdf',
      is_favorite: 1
    });
    studyResourceRepository.create(resDbPaper);

    const planResult = await studyPlanningService.generateStudyPlan(studentResources, {
      startDate: day1,
      days: 3,
      now: day1
    });

    const asgnItem = planResult.items.find(i => i.assignment_id === asgnAlgo.id);
    const goalItem = planResult.items.find(i => i.goal_id === goalDb.id);

    assert.ok(asgnItem, 'Assignment item was planned');
    assert.strictEqual(asgnItem.resource_id, resAlgoNotes.id, 'Assignment plan item has attached resource_id');
    assert.ok(asgnItem.description.includes(resAlgoNotes.title), 'Description mentions attached study resource');

    assert.ok(goalItem, 'Goal milestone item was planned');
    assert.strictEqual(goalItem.resource_id, resDbPaper.id, 'Goal plan item has attached resource_id');
    assert.ok(goalItem.description.includes(resDbPaper.title), 'Description mentions supporting study resource');

    assert.ok(planResult.summary.resourcesAssociatedCount >= 2, 'Summary reflects at least 2 resources associated');
    assert.ok(planResult.summary.associatedResourceIds.includes(resAlgoNotes.id), 'Summary includes assignment resource ID');
    assert.ok(planResult.summary.associatedResourceIds.includes(resDbPaper.id), 'Summary includes goal resource ID');
  });

  // =========================================================================
  // 5. MIXED PRIORITIES SCHEDULING
  // =========================================================================
  await runAsyncTest('Mixed Priorities: orders urgent, high, medium, goal-linked deliverables deterministically', async () => {
    const studentMixed = `stu-mixed-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Mixed Student', 'DJSCE', 'student', ?, ?)
    `).run(studentMixed, `${studentMixed}@example.com`, Date.now(), Date.now());

    // Goal
    const goalWeb = Goal.create({
      user_id: studentMixed,
      course_id: crsAlgorithms.id,
      title: 'Competitive Programming Bronze to Silver',
      target_date: day3 + (18 * 3600000),
      progress: 50,
      status: 'in_progress'
    });
    goalRepository.create(goalWeb);

    // Urgent deliverable (due in 24h)
    const asgnUrgent = Assignment.create({
      user_id: studentMixed,
      course_id: crsAlgorithms.id,
      title: 'Tomorrow Morning Urgent Lab Exam',
      due_date: day1 + (18 * 3600000),
      priority: 'urgent',
      status: 'pending'
    });

    // Medium priority but goal-linked deliverable (due on day 3)
    const asgnGoalLinked = Assignment.create({
      user_id: studentMixed,
      course_id: crsAlgorithms.id,
      goal_id: goalWeb.id,
      title: 'DP Contest Problem Solutions',
      due_date: day3 + (18 * 3600000),
      priority: 'medium',
      status: 'pending'
    });

    // Plain medium deliverable (due on day 3)
    const asgnPlainMedium = Assignment.create({
      user_id: studentMixed,
      course_id: crsAlgorithms.id,
      title: 'General Documentation Review',
      due_date: day3 + (18 * 3600000),
      priority: 'medium',
      status: 'pending'
    });

    // Low priority deliverable (due on day 4)
    const asgnLow = Assignment.create({
      user_id: studentMixed,
      course_id: crsAlgorithms.id,
      title: 'Optional Reading Paper',
      due_date: day4 + (18 * 3600000),
      priority: 'low',
      status: 'pending'
    });

    assignmentRepository.create(asgnUrgent);
    assignmentRepository.create(asgnGoalLinked);
    assignmentRepository.create(asgnPlainMedium);
    assignmentRepository.create(asgnLow);

    const planResult = await studyPlanningService.generateStudyPlan(studentMixed, {
      startDate: day1,
      days: 4,
      now: day1
    });

    assert.ok(planResult.items.length >= 4, 'All deliverables planned');

    // 1. Urgent lab must be first
    assert.strictEqual(planResult.items[0].assignment_id, asgnUrgent.id, 'Urgent assignment is first item');
    assert.strictEqual(planResult.items[0].priority, 'urgent');

    // 2. Between the two day 3 deliverables, the goal-linked one must be scheduled before plain medium
    const goalLinkedIdx = planResult.items.findIndex(i => i.assignment_id === asgnGoalLinked.id);
    const plainMediumIdx = planResult.items.findIndex(i => i.assignment_id === asgnPlainMedium.id);
    assert.ok(goalLinkedIdx < plainMediumIdx, 'Goal-linked medium assignment scheduled before plain medium assignment');

    // 3. Low priority scheduled last
    const lowIdx = planResult.items.findIndex(i => i.assignment_id === asgnLow.id);
    assert.ok(lowIdx > goalLinkedIdx && lowIdx > plainMediumIdx, 'Low priority item scheduled after higher priority items');
  });

  // =========================================================================
  // 6. ALREADY-COMPLETED WORK
  // =========================================================================
  await runAsyncTest('Already-Completed Work: strictly avoids planning completed, submitted, and 100% goals', async () => {
    const studentDone = `stu-done-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Done Student', 'DJSCE', 'student', ?, ?)
    `).run(studentDone, `${studentDone}@example.com`, Date.now(), Date.now());

    // Completed assignment
    const asgnCompleted = Assignment.create({
      user_id: studentDone,
      course_id: crsAlgorithms.id,
      title: 'Already Submitted Homework 1',
      due_date: day2 + (18 * 3600000),
      priority: 'high',
      status: 'completed'
    });

    // Another completed assignment
    const asgnCompleted2 = Assignment.create({
      user_id: studentDone,
      course_id: crsAlgorithms.id,
      title: 'Completed Quiz 2',
      due_date: day2 + (18 * 3600000),
      priority: 'urgent',
      status: 'completed'
    });

    // Cancelled assignment
    const asgnCancelled = Assignment.create({
      user_id: studentDone,
      course_id: crsAlgorithms.id,
      title: 'Dropped Lab Assignment',
      due_date: day2 + (18 * 3600000),
      priority: 'urgent',
      status: 'cancelled'
    });

    // Completed goal
    const goalCompleted = Goal.create({
      user_id: studentDone,
      course_id: crsAlgorithms.id,
      title: 'Completed Goal Milestone',
      target_date: day2 + (18 * 3600000),
      progress: 100,
      status: 'completed'
    });

    // Goal at 100% progress
    const goal100 = Goal.create({
      user_id: studentDone,
      course_id: crsAlgorithms.id,
      title: '100 Percent Done Goal',
      target_date: day2 + (18 * 3600000),
      progress: 100,
      status: 'in_progress'
    });

    // Only 1 pending deliverable
    const asgnActive = Assignment.create({
      user_id: studentDone,
      course_id: crsAlgorithms.id,
      title: 'Active Pending Project',
      due_date: day2 + (18 * 3600000),
      priority: 'medium',
      status: 'pending'
    });

    assignmentRepository.create(asgnCompleted);
    assignmentRepository.create(asgnCompleted2);
    assignmentRepository.create(asgnCancelled);
    assignmentRepository.create(asgnActive);
    goalRepository.create(goalCompleted);
    goalRepository.create(goal100);

    // Assess needs: verify counts
    const assessment = await studyPlanningService.assessWorkloadAndNeeds(studentDone, {
      startDate: day1,
      days: 3,
      now: day1
    });

    assert.strictEqual(assessment.needs.upcomingAssignmentsCount, 1, 'Only 1 upcoming assignment identified in assessment');
    assert.strictEqual(assessment.needs.activeGoalsCount, 0, 'Completed and 100% goals excluded from needs assessment');

    // Generate study plan
    const planResult = await studyPlanningService.generateStudyPlan(studentDone, {
      startDate: day1,
      days: 3,
      now: day1
    });

    assert.strictEqual(planResult.items.length, 1, 'Only the active pending deliverable is planned');
    assert.strictEqual(planResult.items[0].assignment_id, asgnActive.id, 'Planned item is the active deliverable');
    assert.strictEqual(planResult.summary.assignmentsCoveredCount, 1, 'Assignments covered is exactly 1');
    assert.strictEqual(planResult.summary.goalsCoveredCount, 0, 'Goals covered is 0');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n----------------------------------------------------');
  console.log(` PLANNING GOALS, RESOURCES & WORKLOAD: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
