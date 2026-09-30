/**
 * Verification Script: Study Session Management & Service
 */

const assert = require('assert');
const { StudySession } = require('../models/StudySession');
const { StudySessionService } = require('../services/studySessionService');
const { StudySessionRepository } = require('../repositories/StudySessionRepository');
const { CourseRepository } = require('../repositories/CourseRepository');
const { AssignmentRepository } = require('../repositories/AssignmentRepository');
const { Course } = require('../models/Course');
const { Assignment } = require('../models/Assignment');
const { ReminderRepository } = require('../repositories/ReminderRepository');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');
const { getConnection } = require('../db/connection');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

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

console.log('====================================================');
console.log(' Running Study Session Management Test Suite');
console.log('====================================================\n');

const db = getConnection();
const studyRepo = new StudySessionRepository(db);
const courseRepo = new CourseRepository(db);
const asgnRepo = new AssignmentRepository(db);
const reminderRepo = new ReminderRepository(db);
const service = new StudySessionService(studyRepo, courseRepo, asgnRepo, reminderRepo);

// Test fixtures
const user1 = `stu-std1-${Date.now()}`;
const user2 = `stu-std2-${Date.now()}`;

// Ensure users exist
db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Study User 1', 'DJSCE', 'student', ?, ?)")
  .run(user1, `${user1}@example.com`, Date.now(), Date.now());
db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Study User 2', 'DJSCE', 'student', ?, ?)")
  .run(user2, `${user2}@example.com`, Date.now(), Date.now());

// Create courses
const courseUser1 = Course.create({ user_id: user1, name: 'Computer Networks', code: 'CS401' });
courseRepo.create(courseUser1);

const courseUser2 = Course.create({ user_id: user2, name: 'Machine Learning', code: 'CS402' });
courseRepo.create(courseUser2);

// Create assignments
const asgnUser1 = Assignment.create({ user_id: user1, course_id: courseUser1.id, title: 'Socket Lab', due_date: Date.now() + 86400000 });
asgnRepo.create(asgnUser1);

const asgnUser2 = Assignment.create({ user_id: user2, course_id: courseUser2.id, title: 'Neural Net Lab', due_date: Date.now() + 86400000 });
asgnRepo.create(asgnUser2);

const baseStart = Date.now() + 1800000;
let createdSessionId = null;

(async () => {
  // 1. Model validation
  runTest('StudySession Model: parses and validates valid study session entity', () => {
    const session = StudySession.create({
      user_id: user1,
      title: 'Review Chapter 3',
      planned_start_time: baseStart,
      planned_duration_minutes: 90
    });
    assert.strictEqual(session.title, 'Review Chapter 3');
    assert.strictEqual(session.planned_duration_minutes, 90);
    assert.strictEqual(session.status, 'planned');
    assert.strictEqual(session.plannedEndTime, baseStart + (90 * 60000));
  });

  runTest('StudySession Model: rejects invalid duration <= 0', () => {
    assert.throws(() => {
      new StudySession({
        id: 'test-invalid-dur',
        user_id: user1,
        title: 'Zero Study',
        planned_start_time: baseStart,
        planned_duration_minutes: 0
      });
    });
  });

  // 2. Creation
  await runAsyncTest('StudySessionService: creates session with valid attributes for student', async () => {
    const session = await service.createSession(user1, {
      title: 'Midterm Prep',
      notes: 'Chapters 1 to 4',
      planned_start_time: baseStart,
      planned_duration_minutes: 120,
      reminder_enabled: 1,
      reminder_lead_time_minutes: 15
    });
    assert(session.id);
    assert.strictEqual(session.user_id, user1);
    assert.strictEqual(session.title, 'Midterm Prep');
    assert.strictEqual(session.planned_duration_minutes, 120);
    createdSessionId = session.id;
  });

  await runAsyncTest('StudySessionService: creates session linked to student course and assignment', async () => {
    const session = await service.createSession(user1, {
      course_id: courseUser1.id,
      assignment_id: asgnUser1.id,
      title: 'Work on Socket Lab',
      planned_start_time: baseStart + 7200000,
      planned_duration_minutes: 60
    });
    assert.strictEqual(session.course_id, courseUser1.id);
    assert.strictEqual(session.assignment_id, asgnUser1.id);
  });

  // 3. Foreign Key / Cross-Student Integrity
  await runAsyncTest('StudySessionService: rejects linking session to non-existent course with NotFoundError (404)', async () => {
    await assert.rejects(async () => {
      await service.createSession(user1, {
        course_id: 'fake-course-id',
        title: 'Fake Course Session',
        planned_start_time: baseStart,
        planned_duration_minutes: 60
      });
    }, (err) => err instanceof NotFoundError && err.statusCode === 404);
  });

  await runAsyncTest('StudySessionService: rejects linking session to another student course with ForbiddenError (403)', async () => {
    await assert.rejects(async () => {
      await service.createSession(user1, {
        course_id: courseUser2.id,
        title: 'Unauthorized Course Session',
        planned_start_time: baseStart,
        planned_duration_minutes: 60
      });
    }, (err) => err instanceof ForbiddenError && err.statusCode === 403);
  });

  await runAsyncTest('StudySessionService: rejects linking session to another student assignment with ForbiddenError (403)', async () => {
    await assert.rejects(async () => {
      await service.createSession(user1, {
        assignment_id: asgnUser2.id,
        title: 'Unauthorized Assignment Session',
        planned_start_time: baseStart,
        planned_duration_minutes: 60
      });
    }, (err) => err instanceof ForbiddenError && err.statusCode === 403);
  });

  // 4. Read & Ownership
  await runAsyncTest('StudySessionService: retrieves study session for owning student', async () => {
    const fetched = await service.getSessionById(user1, createdSessionId);
    assert.strictEqual(fetched.id, createdSessionId);
    assert.strictEqual(fetched.title, 'Midterm Prep');
  });

  await runAsyncTest('StudySessionService: blocks unauthorized student from reading session (403)', async () => {
    await assert.rejects(async () => {
      await service.getSessionById(user2, createdSessionId);
    }, (err) => err instanceof ForbiddenError && err.statusCode === 403);
  });

  // 5. Update & Status Transitions
  await runAsyncTest('StudySessionService: updates session attributes successfully', async () => {
    const updated = await service.updateSession(user1, createdSessionId, {
      title: 'Intensive Midterm Prep',
      planned_duration_minutes: 150
    });
    assert.strictEqual(updated.title, 'Intensive Midterm Prep');
    assert.strictEqual(updated.planned_duration_minutes, 150);
  });

  await runAsyncTest('StudySessionService: transitions status planned -> in_progress -> completed', async () => {
    const inProgress = await service.updateStatus(user1, createdSessionId, 'in_progress');
    assert.strictEqual(inProgress.status, 'in_progress');
    assert.strictEqual(inProgress.completed_at, null);

    const completed = await service.updateStatus(user1, createdSessionId, 'completed', 140);
    assert.strictEqual(completed.status, 'completed');
    assert.strictEqual(completed.actual_duration_minutes, 140);
    assert(completed.completed_at > 0);
  });

  // 6. Date Range Retrieval
  await runAsyncTest('StudySessionService: retrieves study sessions in range matching time window', async () => {
    const rangeSessions = await service.getSessionsInRange(user1, baseStart - 1000, baseStart + (200 * 60000));
    assert(rangeSessions.length >= 1);
    assert(rangeSessions.some(s => s.id === createdSessionId));
  });

  // 7. Pagination & Filtering
  await runAsyncTest('StudySessionService: lists student study sessions with pagination and filters', async () => {
    const result = await service.listSessions(user1, {
      page: 1,
      limit: 10,
      search: 'Midterm'
    });
    assert.strictEqual(result.page, 1);
    assert(result.data.length >= 1);
    assert.strictEqual(result.data[0].id, createdSessionId);
  });

  // 8. Deletion
  await runAsyncTest('StudySessionService: deletes study session cleanly', async () => {
    const deleted = await service.deleteSession(user1, createdSessionId);
    assert.strictEqual(deleted, true);

    await assert.rejects(async () => {
      await service.getSessionById(user1, createdSessionId);
    }, (err) => err instanceof NotFoundError);
  });

  console.log('\n----------------------------------------------------');
  console.log(` STUDY SESSION SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
