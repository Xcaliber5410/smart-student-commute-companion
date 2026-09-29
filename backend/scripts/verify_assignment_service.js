/**
 * Verification Script: Student Assignment & Task Management
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_academic_assignment.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { Assignment } = require('../models/Assignment');
const { courseService } = require('../services/courseService');
const { assignmentService } = require('../services/assignmentService');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../errors');

console.log('====================================================');
console.log(' Running Assignment & Task Workflow Test Suite');
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
    email: `asgn_student1_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Anirudh Tasker',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const user2 = userRepository.create({
    email: `asgn_student2_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Peer Tasker',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const authUser1 = { id: user1.id, role: 'student', email: user1.email };
  const authUser2 = { id: user2.id, role: 'student', email: user2.email };

  const course1 = courseService.createCourse(
    user1.id,
    { name: 'Computer Networks', code: 'CS304' },
    authUser1
  );

  const course2 = courseService.createCourse(
    user2.id,
    { name: 'Microprocessors', code: 'CS305' },
    authUser2
  );

  let asgn1Id = null;
  const deadlineFuture = Date.now() + 86400000 * 3; // 3 days in future

  // 1. Model Validation
  await test('Assignment Model: parses and validates valid assignment entity', () => {
    const asgn = Assignment.create({
      user_id: user1.id,
      course_id: course1.id,
      title: 'Socket Programming Lab',
      due_date: deadlineFuture,
      priority: 'high',
      status: 'pending'
    });
    assert.strictEqual(asgn.title, 'Socket Programming Lab');
    assert.strictEqual(asgn.priority, 'high');
    assert.strictEqual(asgn.status, 'pending');
    assert.strictEqual(asgn.reminder_enabled, 1);
  });

  // 2. Create Assignment with Course Link
  await test('AssignmentService: creates assignment linked to student course', () => {
    const created = assignmentService.createAssignment(
      user1.id,
      {
        course_id: course1.id,
        title: 'TCP vs UDP Analysis Report',
        description: 'Wireshark packet capture comparison',
        due_date: deadlineFuture,
        priority: 'high'
      },
      authUser1
    );

    assert.ok(created.id);
    assert.strictEqual(created.title, 'TCP vs UDP Analysis Report');
    assert.strictEqual(created.courseId, course1.id);
    assert.strictEqual(created.status, 'pending');
    assert.strictEqual(created.priority, 'high');
    asgn1Id = created.id;
  });

  // 3. Create Standalone Task (no course)
  await test('AssignmentService: creates standalone academic task without course', () => {
    const standalone = assignmentService.createAssignment(
      user1.id,
      {
        title: 'Renew Library Card & Pay Fees',
        due_date: deadlineFuture,
        priority: 'low'
      },
      authUser1
    );

    assert.ok(standalone.id);
    assert.strictEqual(standalone.courseId, null);
    assert.strictEqual(standalone.title, 'Renew Library Card & Pay Fees');
  });

  // 4. Course Ownership Guards
  await test('AssignmentService: rejects linking task to non-existent course with NotFoundError (404)', () => {
    assert.throws(
      () => {
        assignmentService.createAssignment(
          user1.id,
          {
            course_id: 'course-does-not-exist',
            title: 'Ghost Assignment',
            due_date: deadlineFuture
          },
          authUser1
        );
      },
      err => err instanceof NotFoundError && err.statusCode === 404
    );
  });

  await test('AssignmentService: rejects linking task to another student course with ForbiddenError (403)', () => {
    assert.throws(
      () => {
        assignmentService.createAssignment(
          user1.id,
          {
            course_id: course2.id, // belongs to user2
            title: 'Stolen Course Assignment',
            due_date: deadlineFuture
          },
          authUser1
        );
      },
      err => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  // 5. Input Validation
  await test('AssignmentService: rejects invalid due_date or title', () => {
    assert.throws(
      () => {
        assignmentService.createAssignment(
          user1.id,
          {
            title: 'Valid Title',
            due_date: -100 // invalid
          },
          authUser1
        );
      },
      err => err instanceof BadRequestError
    );
  });

  // 6. Get & Ownership Isolation
  await test('AssignmentService: retrieves assignment for owning student', () => {
    const found = assignmentService.getAssignmentById(asgn1Id, authUser1);
    assert.strictEqual(found.id, asgn1Id);
    assert.strictEqual(found.title, 'TCP vs UDP Analysis Report');
  });

  await test('AssignmentService: blocks unauthorized student from reading assignment (403)', () => {
    assert.throws(
      () => assignmentService.getAssignmentById(asgn1Id, authUser2),
      err => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  // 7. Status Transitions
  await test('AssignmentService: transitions pending -> in_progress -> completed with completedAt set', () => {
    const inProg = assignmentService.updateStatus(asgn1Id, 'in_progress', authUser1);
    assert.strictEqual(inProg.status, 'in_progress');
    assert.strictEqual(inProg.completedAt, null);

    const completed = assignmentService.updateStatus(asgn1Id, 'completed', authUser1);
    assert.strictEqual(completed.status, 'completed');
    assert.ok(completed.completedAt > 0);

    // Re-open
    const reopened = assignmentService.updateStatus(asgn1Id, 'pending', authUser1);
    assert.strictEqual(reopened.status, 'pending');
    assert.strictEqual(reopened.completedAt, null);
  });

  // 8. List & Filter
  await test('AssignmentService: lists student assignments with pagination and status filter', () => {
    const list = assignmentService.listAssignments(user1.id, authUser1, { status: 'pending' });
    assert.ok(list.assignments.length >= 1);
    assert.ok(list.assignments.every(a => a.status === 'pending'));
    assert.strictEqual(list.pagination.page, 1);
  });

  // 9. Delete
  await test('AssignmentService: deletes assignment cleanly', () => {
    const res = assignmentService.deleteAssignment(asgn1Id, authUser1);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.id, asgn1Id);

    assert.throws(
      () => assignmentService.getAssignmentById(asgn1Id, authUser1),
      err => err instanceof NotFoundError
    );
  });

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  console.log('\n----------------------------------------------------');
  console.log(` ASSIGNMENT SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
