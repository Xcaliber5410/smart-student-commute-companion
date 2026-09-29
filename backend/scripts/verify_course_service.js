/**
 * Verification Script: Student Course & Subject Management
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_academic_course.db');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { userRepository } = require('../repositories/UserRepository');
const { Course } = require('../models/Course');
const { courseService } = require('../services/courseService');
const { courseRepository } = require('../repositories/CourseRepository');
const { ConflictError, ForbiddenError, NotFoundError, BadRequestError } = require('../errors');

console.log('====================================================');
console.log(' Running Course & Subject Management Test Suite');
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
    email: `course_student1_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Anirudh Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const user2 = userRepository.create({
    email: `course_student2_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Peer Student',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const authUser1 = { id: user1.id, role: 'student', email: user1.email };
  const authUser2 = { id: user2.id, role: 'student', email: user2.email };

  let course1Id = null;

  // 1. Model Validation
  await test('Course Model: initializes and validates input fields correctly', () => {
    const course = Course.create({
      user_id: user1.id,
      name: 'Algorithms',
      code: 'CS301',
      instructor: 'Dr. Ramanujan',
      credits: 4,
      color: '#4F46E5'
    });
    assert.strictEqual(course.name, 'Algorithms');
    assert.strictEqual(course.code, 'CS301');
    assert.strictEqual(course.credits, 4);
    assert.strictEqual(course.color, '#4F46E5');
    assert.strictEqual(course.archived, 0);
  });

  // 2. Create Course
  await test('CourseService: creates course with valid attributes for student', () => {
    const created = courseService.createCourse(
      user1.id,
      {
        name: 'Operating Systems',
        code: 'CS302',
        instructor: 'Prof. Tanenbaum',
        color: '#10B981',
        credits: 4
      },
      authUser1
    );

    assert.ok(created.id);
    assert.strictEqual(created.name, 'Operating Systems');
    assert.strictEqual(created.code, 'CS302');
    assert.strictEqual(created.instructor, 'Prof. Tanenbaum');
    assert.strictEqual(created.userId, user1.id);
    assert.strictEqual(created.archived, false);
    course1Id = created.id;
  });

  // 3. Duplicate Prevention
  await test('CourseService: rejects duplicate course name for same student with ConflictError', () => {
    assert.throws(
      () => {
        courseService.createCourse(
          user1.id,
          {
            name: 'Operating Systems', // same name
            code: 'CS999'
          },
          authUser1
        );
      },
      err => err instanceof ConflictError && err.message.includes('already exists')
    );
  });

  await test('CourseService: rejects duplicate course code for same student with ConflictError', () => {
    assert.throws(
      () => {
        courseService.createCourse(
          user1.id,
          {
            name: 'Different Subject',
            code: 'CS302' // same code
          },
          authUser1
        );
      },
      err => err instanceof ConflictError && err.message.includes('already exists')
    );
  });

  await test('CourseService: allows another student to use same course code/name', () => {
    const peerCourse = courseService.createCourse(
      user2.id,
      {
        name: 'Operating Systems',
        code: 'CS302'
      },
      authUser2
    );
    assert.ok(peerCourse.id);
    assert.strictEqual(peerCourse.userId, user2.id);
  });

  // 4. Retrieve & Ownership Guard
  await test('CourseService: retrieves course by ID for owning student', () => {
    const course = courseService.getCourseById(course1Id, authUser1);
    assert.strictEqual(course.id, course1Id);
    assert.strictEqual(course.name, 'Operating Systems');
  });

  await test('CourseService: blocks unauthorized student with ForbiddenError (403)', () => {
    assert.throws(
      () => {
        courseService.getCourseById(course1Id, authUser2);
      },
      err => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  await test('CourseService: throws NotFoundError (404) for non-existent ID', () => {
    assert.throws(
      () => {
        courseService.getCourseById('course-nonexistent-123', authUser1);
      },
      err => err instanceof NotFoundError && err.statusCode === 404
    );
  });

  // 5. Update Course
  await test('CourseService: updates course attributes successfully', () => {
    const updated = courseService.updateCourse(
      course1Id,
      {
        instructor: 'Dr. Andrew S. Tanenbaum',
        credits: 5
      },
      authUser1
    );
    assert.strictEqual(updated.instructor, 'Dr. Andrew S. Tanenbaum');
    assert.strictEqual(updated.credits, 5);
  });

  // 6. Archive Course
  await test('CourseService: archives and unarchives a course', () => {
    const archived = courseService.archiveCourse(course1Id, authUser1, true);
    assert.strictEqual(archived.archived, true);

    const unarchived = courseService.archiveCourse(course1Id, authUser1, false);
    assert.strictEqual(unarchived.archived, false);
  });

  // 7. List & Filter
  await test('CourseService: lists student courses with search and pagination', () => {
    // Add second course for user1
    courseService.createCourse(
      user1.id,
      {
        name: 'Database Management Systems',
        code: 'CS303',
        instructor: 'Dr. Codd'
      },
      authUser1
    );

    const list = courseService.listCourses(user1.id, authUser1, { limit: 10, page: 1 });
    assert.strictEqual(list.courses.length, 2);
    assert.strictEqual(list.pagination.total, 2);

    const searchList = courseService.listCourses(user1.id, authUser1, { search: 'Database' });
    assert.strictEqual(searchList.courses.length, 1);
    assert.strictEqual(searchList.courses[0].name, 'Database Management Systems');
  });

  // 8. Delete Course
  await test('CourseService: deletes course cleanly', () => {
    const res = courseService.deleteCourse(course1Id, authUser1);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.id, course1Id);

    assert.throws(
      () => courseService.getCourseById(course1Id, authUser1),
      err => err instanceof NotFoundError
    );
  });

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  console.log('\n----------------------------------------------------');
  console.log(` COURSE SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
