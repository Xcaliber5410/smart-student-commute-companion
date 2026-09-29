/**
 * Verification Script: Student Academic Progress & Dashboard Summaries
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_academic_progress.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { courseService } = require('../services/courseService');
const { assignmentService } = require('../services/assignmentService');
const { academicProgressService } = require('../services/academicProgressService');
const { ForbiddenError } = require('../errors');

console.log('====================================================');
console.log(' Running Academic Progress & Analytics Test Suite');
console.log('====================================================\n');

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

async function run() {
  initDb();

  const user1 = userRepository.create({
    email: `prog_student1_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Anirudh Analytics',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const user2 = userRepository.create({
    email: `prog_student2_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Peer Analytics',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const emptyUser = userRepository.create({
    email: `prog_empty_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Fresh Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const authUser1 = { id: user1.id, role: 'student', email: user1.email };
  const authUser2 = { id: user2.id, role: 'student', email: user2.email };
  const authEmptyUser = { id: emptyUser.id, role: 'student', email: emptyUser.email };

  // 1. Fresh student with no courses or assignments
  await test('AcademicProgress: returns clean zeroed metrics for student with no academic data', () => {
    const summary = academicProgressService.getStudentAcademicSummary(emptyUser.id, authEmptyUser);
    assert.strictEqual(summary.totalAssignments, 0);
    assert.strictEqual(summary.completedAssignments, 0);
    assert.strictEqual(summary.pendingAssignments, 0);
    assert.strictEqual(summary.overdueAssignments, 0);
    assert.strictEqual(summary.completionPercentage, 0);
    assert.deepStrictEqual(summary.upcomingDeadlines, []);
    assert.deepStrictEqual(summary.courseProgress, []);
    assert.strictEqual(summary.priorityBreakdown.urgent, 0);
  });

  // Setup dataset for user1: 2 courses, 5 assignments
  const courseAI = courseService.createCourse(
    user1.id,
    { name: 'Artificial Intelligence', code: 'CS501', color: '#8B5CF6' },
    authUser1
  );

  const courseWeb = courseService.createCourse(
    user1.id,
    { name: 'Web Engineering', code: 'CS502', color: '#3B82F6' },
    authUser1
  );

  const now = Date.now();
  const oneDay = 86400000;

  // AI Course Tasks:
  // 1. Completed
  assignmentService.createAssignment(
    user1.id,
    { course_id: courseAI.id, title: 'Search Algorithms Lab', due_date: now - (2 * oneDay), status: 'completed' },
    authUser1
  );

  // 2. Overdue (yesterday, pending, urgent)
  assignmentService.createAssignment(
    user1.id,
    { course_id: courseAI.id, title: 'Minimax Chess Engine', due_date: now - oneDay, priority: 'urgent', status: 'pending' },
    authUser1
  );

  // 3. Upcoming (in 2 days, in_progress, high)
  assignmentService.createAssignment(
    user1.id,
    { course_id: courseAI.id, title: 'Reinforcement Learning Q-Table', due_date: now + (2 * oneDay), priority: 'high', status: 'in_progress' },
    authUser1
  );

  // Web Engineering Tasks:
  // 4. Completed
  assignmentService.createAssignment(
    user1.id,
    { course_id: courseWeb.id, title: 'PWA Manifest & Service Worker', due_date: now + (1 * oneDay), status: 'completed' },
    authUser1
  );

  // 5. Far future (in 25 days, pending, low)
  assignmentService.createAssignment(
    user1.id,
    { course_id: courseWeb.id, title: 'Final Semester Web Project', due_date: now + (25 * oneDay), priority: 'low', status: 'pending' },
    authUser1
  );

  // User 2 task
  assignmentService.createAssignment(
    user2.id,
    { title: 'User 2 Task', due_date: now + oneDay, status: 'completed' },
    authUser2
  );

  // 2. Overall Totals and Completion Rate
  await test('AcademicProgress: calculates correct total, completed, pending, and overdue counts', () => {
    const summary = academicProgressService.getStudentAcademicSummary(user1.id, authUser1, { now });
    assert.strictEqual(summary.totalAssignments, 5);
    assert.strictEqual(summary.completedAssignments, 2);
    assert.strictEqual(summary.inProgressAssignments, 1);
    assert.strictEqual(summary.pendingAssignments, 2);
    assert.strictEqual(summary.overdueAssignments, 1); // Only Minimax is overdue
    assert.strictEqual(summary.completionPercentage, 40); // 2/5 = 40%
  });

  // 3. Priority Breakdown
  await test('AcademicProgress: computes accurate priority breakdown for active deliverables', () => {
    const summary = academicProgressService.getStudentAcademicSummary(user1.id, authUser1, { now });
    assert.strictEqual(summary.priorityBreakdown.urgent, 1); // Minimax
    assert.strictEqual(summary.priorityBreakdown.high, 1);   // RL
    assert.strictEqual(summary.priorityBreakdown.low, 1);    // Final project
  });

  // 4. Upcoming Deadlines
  await test('AcademicProgress: lists upcoming non-completed deadlines due within next 7 days', () => {
    const summary = academicProgressService.getStudentAcademicSummary(user1.id, authUser1, { now });
    assert.strictEqual(summary.upcomingDeadlines.length, 1);
    assert.strictEqual(summary.upcomingDeadlines[0].title, 'Reinforcement Learning Q-Table');
    assert.strictEqual(summary.upcomingDeadlines[0].courseName, 'Artificial Intelligence');
  });

  // 5. Per-Course Breakdown
  await test('AcademicProgress: generates accurate per-course statistics and progress rates', () => {
    const summary = academicProgressService.getStudentAcademicSummary(user1.id, authUser1, { now });
    assert.strictEqual(summary.courseProgress.length, 2);

    const aiCourse = summary.courseProgress.find(c => c.courseCode === 'CS501');
    assert.ok(aiCourse);
    assert.strictEqual(aiCourse.totalAssignments, 3);
    assert.strictEqual(aiCourse.completedAssignments, 1);
    assert.strictEqual(aiCourse.pendingAssignments, 2);
    assert.strictEqual(aiCourse.overdueAssignments, 1);
    assert.strictEqual(aiCourse.completionPercentage, 33); // 1/3 = 33%

    const webCourse = summary.courseProgress.find(c => c.courseCode === 'CS502');
    assert.ok(webCourse);
    assert.strictEqual(webCourse.totalAssignments, 2);
    assert.strictEqual(webCourse.completedAssignments, 1);
    assert.strictEqual(webCourse.completionPercentage, 50); // 1/2 = 50%
  });

  // 6. Ownership Guard
  await test('AcademicProgress: rejects unauthorized cross-student access with ForbiddenError (403)', () => {
    assert.throws(
      () => academicProgressService.getStudentAcademicSummary(user1.id, authUser2),
      err => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  console.log('\n----------------------------------------------------');
  console.log(` ACADEMIC PROGRESS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
