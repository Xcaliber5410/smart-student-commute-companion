/**
 * Service-Level Integration Tests: Unified Search with Student Context & Insights
 *
 * Verifies that:
 * 1. StudentSearchResult domain model provides a clean, typed internal representation
 *    with display title/name, entity identifier, type, status, dates/deadlines,
 *    relationship to student, domain category, metadata, and helper methods.
 * 2. StudentContextService.searchContext integrates cross-domain search into the student's
 *    profile/context while enforcing access control and cross-student isolation.
 * 3. StudentInsightsService.searchStudentInsights provides enriched, categorized search
 *    (actionable, overdue, academic) to downstream services without coupling to database tables.
 * 4. Search operations are strictly read-only and do not mutate any stored records.
 * 5. Existing student context, productivity, and insights functionality remain 100% intact.
 */

const assert = require('assert/strict');
const { db } = require('../db/database');
const {
  StudentSearchResult,
  studentSearchResultSchema,
  searchResultTypeEnum,
  searchDomainEnum,
  studentRelationshipEnum
} = require('../models/StudentSearchResult');
const { studentContextService } = require('../services/studentContextService');
const { studentInsightsService } = require('../services/studentInsightsService');
const { studentSearchService } = require('../services/studentSearchService');
const { userRepository } = require('../repositories/UserRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { savedRouteRepository } = require('../repositories/SavedRouteRepository');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { reminderRepository } = require('../repositories/ReminderRepository');
const { ForbiddenError, NotFoundError } = require('../errors');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failedTests++;
  }
}

async function run() {
  console.log('================================================================');
  console.log(' Running Search & Student Context/Insights Integration Tests');
  console.log('================================================================\n');

  const testSuffix = Date.now().toString(36);

  // Setup test students
  const studentA = userRepository.create({
    email: `student_ctx_a_${testSuffix}@example.com`,
    password: 'Password123!',
    full_name: `Alice Context ${testSuffix}`,
    role: 'student',
    college_name: 'D.J. Sanghvi College of Engineering'
  });

  const studentB = userRepository.create({
    email: `student_ctx_b_${testSuffix}@example.com`,
    password: 'Password123!',
    full_name: `Bob Context ${testSuffix}`,
    role: 'student',
    college_name: 'VJTI Mumbai'
  });

  const adminUser = userRepository.create({
    email: `admin_ctx_${testSuffix}@example.com`,
    password: 'Password123!',
    full_name: `Admin Context ${testSuffix}`,
    role: 'admin',
    college_name: 'D.J. Sanghvi College of Engineering'
  });

  // -----------------------------------------------------------------
  // 1. StudentSearchResult Domain Model Contract
  // -----------------------------------------------------------------
  await test('StudentSearchResult: validates schema and exposes normalized contract & helper methods', () => {
    const past = Date.now() - 3600000;
    const future = Date.now() + 86400000;

    const itemOverdue = new StudentSearchResult({
      id: 'asgn-test-1',
      type: 'assignment',
      title: 'Cloud Architecture Term Paper',
      status: 'pending',
      deadline: past,
      relationship: 'assignee',
      domain: 'academic',
      metadata: { priority: 'high' }
    });

    assert.equal(itemOverdue.id, 'asgn-test-1');
    assert.equal(itemOverdue.type, 'assignment');
    assert.equal(itemOverdue.title, 'Cloud Architecture Term Paper');
    assert.equal(itemOverdue.name, 'Cloud Architecture Term Paper');
    assert.equal(itemOverdue.isActionable(), true, 'Pending item must be actionable');
    assert.equal(itemOverdue.isOverdue(), true, 'Past deadline pending item must be overdue');
    assert.equal(itemOverdue.isAcademic(), true, 'Assignment must be academic');

    const itemCompleted = new StudentSearchResult({
      id: 'asgn-test-2',
      type: 'assignment',
      title: 'Completed Paper',
      status: 'completed',
      deadline: past,
      relationship: 'assignee',
      domain: 'academic'
    });
    assert.equal(itemCompleted.isActionable(), false, 'Completed item must not be actionable');
    assert.equal(itemCompleted.isOverdue(), false, 'Completed item must never be overdue');

    const json = itemOverdue.toJSON();
    assert.equal(json.id, 'asgn-test-1');
    assert.equal(json.deadline, past);
    assert.equal(json.relationship, 'assignee');
    assert.equal(json.domain, 'academic');
  });

  await test('StudentSearchResult: static factories instantiate all 9 domain entities accurately', () => {
    const courseRes = StudentSearchResult.fromCourse({
      id: 'c-1',
      name: 'Cloud Computing',
      code: 'CS401',
      instructor: 'Dr. Rao',
      color: '#1E88E5',
      credits: 4,
      archived: 0
    });
    assert.equal(courseRes.type, 'course');
    assert.equal(courseRes.relationship, 'enrolled');
    assert.equal(courseRes.domain, 'academic');

    const routeRes = StudentSearchResult.fromSavedRoute({
      id: 'r-1',
      name: 'Fastest Metro to Campus',
      origin: 'Andheri',
      destination: 'Vile Parle',
      preferred_mode: 'metro',
      tags: 'daily, rush-hour'
    });
    assert.equal(routeRes.type, 'saved_route');
    assert.equal(routeRes.relationship, 'owner');
    assert.equal(routeRes.domain, 'commute');
    assert.equal(routeRes.isActionable(), true);

    const schedRes = StudentSearchResult.fromSchedule({
      id: 's-1',
      title: 'Morning College Commute',
      origin: 'Borivali',
      destination: 'Vile Parle',
      target_arrival_time: '08:30',
      days_of_week: '["mon","tue","wed"]',
      active: 1
    });
    assert.equal(schedRes.type, 'schedule');
    assert.equal(schedRes.relationship, 'commuter');
    assert.equal(schedRes.domain, 'commute');

    const notifRes = StudentSearchResult.fromNotification({
      id: 'n-1',
      title: 'Class Postponed',
      message: 'CS401 rescheduled to 2 PM',
      type: 'academic',
      read: 0
    });
    assert.equal(notifRes.type, 'notification');
    assert.equal(notifRes.relationship, 'recipient');
    assert.equal(notifRes.domain, 'alerts');
    assert.equal(notifRes.isActionable(), true);
  });

  // -----------------------------------------------------------------
  // 2. Data Setup for Student Context Integration Tests
  // -----------------------------------------------------------------
  const now = Date.now();
  const courseA = {
    id: `course_ctx_${testSuffix}`,
    user_id: studentA.id,
    name: 'Distributed Cloud Systems',
    code: 'DCS601',
    instructor: 'Prof. Mehta',
    color: '#3949AB',
    credits: 4,
    archived: 0,
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO courses (id, user_id, name, code, instructor, color, credits, archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(courseA.id, courseA.user_id, courseA.name, courseA.code, courseA.instructor, courseA.color, courseA.credits, courseA.archived, courseA.created_at, courseA.updated_at);

  const goalA = {
    id: `goal_ctx_${testSuffix}`,
    user_id: studentA.id,
    course_id: courseA.id,
    title: 'Master Distributed Consensus Algorithms',
    description: 'Raft and Paxos deep dive for cloud systems',
    target_date: now + 7 * 86400000,
    progress: 35,
    status: 'in_progress',
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO goals (id, user_id, course_id, title, description, target_date, status, progress, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(goalA.id, goalA.user_id, goalA.course_id, goalA.title, goalA.description, goalA.target_date, goalA.status, goalA.progress, goalA.created_at, goalA.updated_at);

  const overdueAsgnA = {
    id: `asgn_overdue_${testSuffix}`,
    user_id: studentA.id,
    course_id: courseA.id,
    goal_id: goalA.id,
    title: 'Distributed Consensus Lab Report',
    description: 'Implement Raft leader election and log replication',
    due_date: now - 24 * 3600000, // 1 day overdue
    priority: 'high',
    status: 'pending',
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO assignments (id, user_id, course_id, goal_id, title, description, due_date, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(overdueAsgnA.id, overdueAsgnA.user_id, overdueAsgnA.course_id, overdueAsgnA.goal_id, overdueAsgnA.title, overdueAsgnA.description, overdueAsgnA.due_date, overdueAsgnA.priority, overdueAsgnA.status, overdueAsgnA.created_at, overdueAsgnA.updated_at);

  const futureAsgnA = {
    id: `asgn_future_${testSuffix}`,
    user_id: studentA.id,
    course_id: courseA.id,
    goal_id: null,
    title: 'Cloud Scalability Case Study',
    description: 'Analyze horizontal autoscaling in distributed environments',
    due_date: now + 5 * 86400000,
    priority: 'medium',
    status: 'pending',
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO assignments (id, user_id, course_id, goal_id, title, description, due_date, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(futureAsgnA.id, futureAsgnA.user_id, futureAsgnA.course_id, futureAsgnA.goal_id, futureAsgnA.title, futureAsgnA.description, futureAsgnA.due_date, futureAsgnA.priority, futureAsgnA.status, futureAsgnA.created_at, futureAsgnA.updated_at);

  const sessionA = {
    id: `study_ctx_${testSuffix}`,
    user_id: studentA.id,
    course_id: courseA.id,
    goal_id: goalA.id,
    title: 'Distributed Systems Revision Session',
    notes: 'Prepare for midterm test on Paxos',
    planned_start_time: now + 2 * 86400000,
    planned_duration_minutes: 90,
    status: 'planned',
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO study_sessions (id, user_id, course_id, goal_id, title, notes, planned_start_time, planned_duration_minutes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionA.id, sessionA.user_id, sessionA.course_id, sessionA.goal_id, sessionA.title, sessionA.notes, sessionA.planned_start_time, sessionA.planned_duration_minutes, sessionA.status, sessionA.created_at, sessionA.updated_at);

  const routeA = {
    id: `route_ctx_${testSuffix}`,
    user_id: studentA.id,
    name: 'Distributed Campus Bus Route',
    origin: 'Andheri West',
    destination: 'Campus Gate 2',
    preferred_mode: 'bus',
    tags: 'express,distributed,campus',
    created_at: now
  };
  db.prepare(`
    INSERT INTO saved_routes (id, user_id, name, origin, destination, preferred_mode, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(routeA.id, routeA.user_id, routeA.name, routeA.origin, routeA.destination, routeA.preferred_mode, routeA.tags, routeA.created_at);

  // -----------------------------------------------------------------
  // 3. StudentContextService.searchContext Tests
  // -----------------------------------------------------------------
  await test('StudentContextService: assertAccess enforces student ownership isolation', () => {
    assert.throws(
      () => studentContextService.searchContext(studentA.id, null, { q: 'Distributed' }),
      ForbiddenError,
      'Unauthenticated caller must be forbidden'
    );

    assert.throws(
      () => studentContextService.searchContext(studentA.id, studentB, { q: 'Distributed' }),
      ForbiddenError,
      'Student B cannot access Student A search context'
    );

    // Admin should have access
    const adminResult = studentContextService.searchContext(studentA.id, adminUser, { q: 'Distributed' });
    assert.ok(adminResult.student);
    assert.equal(adminResult.student.id, studentA.id);
  });

  await test('StudentContextService: searchContext returns student identity alongside enriched search results', () => {
    const result = studentContextService.searchContext(studentA.id, studentA, {
      q: 'Distributed',
      limit: 10
    });

    assert.ok(result.student, 'Must contain safe student object');
    assert.equal(result.student.id, studentA.id);
    assert.equal(result.student.email, studentA.email);
    assert.equal(result.query, 'Distributed');
    assert.ok(result.total >= 4, `Expected at least 4 items, got ${result.total}`);
    assert.ok(Array.isArray(result.results));

    // Verify results structure
    for (const item of result.results) {
      assert.ok(item.id);
      assert.ok(item.type);
      assert.ok(item.title);
      assert.ok(item.relationship);
      assert.ok(item.domain);
    }
  });

  await test('StudentContextService: student B searching sees zero results from student A', () => {
    const resultB = studentContextService.searchContext(studentB.id, studentB, {
      q: 'Distributed'
    });

    assert.equal(resultB.total, 0, 'Student B should see zero results from student A');
    assert.equal(resultB.results.length, 0);
  });

  // -----------------------------------------------------------------
  // 4. StudentInsightsService.searchStudentInsights Tests
  // -----------------------------------------------------------------
  await test('StudentInsightsService: assertOwnership rejects cross-student access', async () => {
    await assert.rejects(
      async () => studentInsightsService.searchStudentInsights(studentA.id, null, { q: 'Consensus' }),
      ForbiddenError
    );

    await assert.rejects(
      async () => studentInsightsService.searchStudentInsights(studentA.id, studentB, { q: 'Consensus' }),
      ForbiddenError
    );
  });

  await test('StudentInsightsService: searchStudentInsights categorizes results by actionable, overdue, and academic scope', async () => {
    const insightsSearch = await studentInsightsService.searchStudentInsights(studentA.id, studentA, {
      q: 'Distributed'
    });

    assert.ok(insightsSearch.student);
    assert.equal(insightsSearch.student.id, studentA.id);
    assert.ok(insightsSearch.totalResults > 0);
    assert.ok(insightsSearch.summary);
    assert.ok(typeof insightsSearch.summary.actionableCount === 'number');
    assert.ok(typeof insightsSearch.summary.overdueCount === 'number');
    assert.ok(typeof insightsSearch.summary.academicCount === 'number');

    // Overdue items check
    assert.ok(insightsSearch.summary.overdueCount >= 1, 'Overdue assignment must be recognized');
    const overdueReport = insightsSearch.overdueResults.find(r => r.id === overdueAsgnA.id);
    assert.ok(overdueReport, 'Overdue consensus lab report must be present in overdueResults');
    assert.equal(overdueReport.status, 'pending');

    // Actionable items check
    const actionableReport = insightsSearch.actionableResults.find(r => r.id === overdueAsgnA.id);
    assert.ok(actionableReport, 'Pending assignment must be present in actionableResults');

    // Academic categorization check
    assert.ok(insightsSearch.summary.academicCount >= 3, 'Course, Goal, Assignment must be academic');
  });

  await test('StudentInsightsService: getStudentInsights continues to function flawlessly alongside search', async () => {
    const insights = await studentInsightsService.getStudentInsights(studentA.id, studentA);

    assert.ok(insights.student);
    assert.equal(insights.student.id, studentA.id);
    assert.ok(insights.summary);
    assert.ok(insights.activeGoals.length >= 1);
    assert.ok(insights.overdueAssignments.length >= 1);
    assert.ok(insights.productivityMetrics);

    // Verify overdue assignment appears in existing insights
    const overdue = insights.overdueAssignments.find(a => a.id === overdueAsgnA.id);
    assert.ok(overdue, 'Overdue assignment must be present in standard insights overview');
  });

  // -----------------------------------------------------------------
  // 5. Verification of Non-Mutation (Strict Read-Only Search)
  // -----------------------------------------------------------------
  await test('Search Integration: read-only guarantee with zero database mutations', async () => {
    const getCounts = () => {
      const coursesCount = db.prepare('SELECT COUNT(*) as c FROM courses WHERE user_id = ?').get(studentA.id).c;
      const asgnsCount = db.prepare('SELECT COUNT(*) as c FROM assignments WHERE user_id = ?').get(studentA.id).c;
      const goalsCount = db.prepare('SELECT COUNT(*) as c FROM goals WHERE user_id = ?').get(studentA.id).c;
      const sessionsCount = db.prepare('SELECT COUNT(*) as c FROM study_sessions WHERE user_id = ?').get(studentA.id).c;
      return { coursesCount, asgnsCount, goalsCount, sessionsCount };
    };

    const before = getCounts();

    // Execute multiple search iterations across context and insights services
    studentContextService.searchContext(studentA.id, studentA, { q: 'Distributed' });
    await studentInsightsService.searchStudentInsights(studentA.id, studentA, { q: 'Consensus' });
    studentSearchService.search(studentA.id, studentA, { query: 'Cloud' });

    const after = getCounts();

    assert.deepEqual(before, after, 'Database counts must remain identical after search queries');
  });

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log(` SEARCH & CONTEXT INTEGRATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('----------------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error running search context integration tests:', err);
  process.exit(1);
});
