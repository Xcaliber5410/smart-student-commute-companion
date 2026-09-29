/**
 * Verification Script: Practical Academic Filtering, Sorting & Pagination
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.resolve(__dirname, '../data/test_academic_filtering.db');
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

console.log('====================================================');
console.log(' Running Academic Filtering & Sorting Test Suite');
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
    email: `filter_student1_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Aditya Filter',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const user2 = userRepository.create({
    email: `filter_student2_${Date.now()}@djsce.edu`,
    password: 'Password123!',
    full_name: 'Peer Filter',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  const authUser1 = { id: user1.id, role: 'student', email: user1.email };
  const authUser2 = { id: user2.id, role: 'student', email: user2.email };

  const courseCS = courseService.createCourse(
    user1.id,
    { name: 'Computer Security', code: 'CS401' },
    authUser1
  );

  const courseMath = courseService.createCourse(
    user1.id,
    { name: 'Linear Algebra', code: 'MA201' },
    authUser1
  );

  const now = Date.now();
  const oneDay = 86400000;

  // Create test dataset for user1
  // 1. Overdue task (yesterday)
  assignmentService.createAssignment(
    user1.id,
    {
      course_id: courseCS.id,
      title: 'Crypto Hash Function Lab',
      description: 'Implement SHA256 in Python',
      due_date: now - oneDay,
      priority: 'high',
      status: 'pending'
    },
    authUser1
  );

  // 2. Upcoming task in 2 days (urgent)
  assignmentService.createAssignment(
    user1.id,
    {
      course_id: courseCS.id,
      title: 'RSA Key Exchange Implementation',
      description: 'Public private key cryptography',
      due_date: now + (2 * oneDay),
      priority: 'urgent',
      status: 'in_progress'
    },
    authUser1
  );

  // 3. Upcoming task in 5 days (Math, medium)
  assignmentService.createAssignment(
    user1.id,
    {
      course_id: courseMath.id,
      title: 'Eigenvalues and Eigenvectors Quiz',
      description: 'Matrix diagonalization exercises',
      due_date: now + (5 * oneDay),
      priority: 'medium',
      status: 'pending'
    },
    authUser1
  );

  // 4. Far future task in 20 days (low)
  assignmentService.createAssignment(
    user1.id,
    {
      course_id: courseMath.id,
      title: 'Singular Value Decomposition Term Paper',
      description: 'SVD image compression application',
      due_date: now + (20 * oneDay),
      priority: 'low',
      status: 'pending'
    },
    authUser1
  );

  // 5. Completed task
  assignmentService.createAssignment(
    user1.id,
    {
      course_id: courseCS.id,
      title: 'Buffer Overflow Vulnerability Demo',
      description: 'Exploiting stack smash vulnerability',
      due_date: now + (1 * oneDay),
      priority: 'high',
      status: 'completed'
    },
    authUser1
  );

  // Create 1 task for user2 to test ownership isolation
  assignmentService.createAssignment(
    user2.id,
    {
      title: 'User 2 Private Assignment',
      due_date: now + (2 * oneDay),
      priority: 'urgent'
    },
    authUser2
  );

  // 1. Filter by course_id
  await test('Filtering: filter by course_id returns only matching course tasks', () => {
    const res = assignmentService.listAssignments(user1.id, authUser1, { course_id: courseCS.id });
    assert.strictEqual(res.assignments.length, 3);
    assert.ok(res.assignments.every(a => a.courseId === courseCS.id));
  });

  // 2. Filter by status
  await test('Filtering: filter by status returns exact status matches', () => {
    const inProg = assignmentService.listAssignments(user1.id, authUser1, { status: 'in_progress' });
    assert.strictEqual(inProg.assignments.length, 1);
    assert.strictEqual(inProg.assignments[0].title, 'RSA Key Exchange Implementation');

    const completed = assignmentService.listAssignments(user1.id, authUser1, { status: 'completed' });
    assert.strictEqual(completed.assignments.length, 1);
    assert.strictEqual(completed.assignments[0].title, 'Buffer Overflow Vulnerability Demo');
  });

  // 3. Filter by priority
  await test('Filtering: filter by priority returns items with requested urgency', () => {
    const urgent = assignmentService.listAssignments(user1.id, authUser1, { priority: 'urgent' });
    assert.strictEqual(urgent.assignments.length, 1);
    assert.strictEqual(urgent.assignments[0].priority, 'urgent');
  });

  // 4. Filter by overdue
  await test('Filtering: filter by overdue returns only incomplete past-due items', () => {
    const overdue = assignmentService.listAssignments(user1.id, authUser1, { overdue: true });
    assert.strictEqual(overdue.assignments.length, 1);
    assert.strictEqual(overdue.assignments[0].title, 'Crypto Hash Function Lab');
  });

  // 5. Filter by upcoming (next 7 days, non-completed)
  await test('Filtering: filter by upcoming returns non-completed tasks due in next 7 days', () => {
    const upcoming = assignmentService.listAssignments(user1.id, authUser1, { upcoming: true });
    // Should include: RSA (2 days) and Eigenvalues (5 days).
    // Should exclude: Buffer Overflow (completed), Crypto Hash (overdue), and SVD (20 days).
    assert.strictEqual(upcoming.assignments.length, 2);
    const titles = upcoming.assignments.map(a => a.title);
    assert.ok(titles.includes('RSA Key Exchange Implementation'));
    assert.ok(titles.includes('Eigenvalues and Eigenvectors Quiz'));
  });

  // 6. Text Search
  await test('Filtering: search keyword queries title and description', () => {
    const res = assignmentService.listAssignments(user1.id, authUser1, { search: 'diagonalization' });
    assert.strictEqual(res.assignments.length, 1);
    assert.strictEqual(res.assignments[0].title, 'Eigenvalues and Eigenvectors Quiz');
  });

  // 7. Sort by Priority
  await test('Sorting: sort_by=priority places urgent first, followed by high, medium, low', () => {
    const sorted = assignmentService.listAssignments(user1.id, authUser1, { sort_by: 'priority' });
    const priorities = sorted.assignments.map(a => a.priority);
    assert.strictEqual(priorities[0], 'urgent');
    assert.strictEqual(priorities[priorities.length - 1], 'low');
  });

  // 8. Sort by Due Date
  await test('Sorting: sort_by=due_date_asc and due_date_desc orders chronologically', () => {
    const asc = assignmentService.listAssignments(user1.id, authUser1, { sort_by: 'due_date_asc' });
    for (let i = 0; i < asc.assignments.length - 1; i++) {
      assert.ok(asc.assignments[i].dueDate <= asc.assignments[i + 1].dueDate);
    }

    const desc = assignmentService.listAssignments(user1.id, authUser1, { sort_by: 'due_date_desc' });
    for (let i = 0; i < desc.assignments.length - 1; i++) {
      assert.ok(desc.assignments[i].dueDate >= desc.assignments[i + 1].dueDate);
    }
  });

  // 9. Pagination
  await test('Pagination: limit and page accurately segments results and calculates totalPages', () => {
    const page1 = assignmentService.listAssignments(user1.id, authUser1, { limit: 2, page: 1 });
    assert.strictEqual(page1.assignments.length, 2);
    assert.strictEqual(page1.pagination.total, 5);
    assert.strictEqual(page1.pagination.totalPages, 3);
    assert.strictEqual(page1.pagination.page, 1);

    const page2 = assignmentService.listAssignments(user1.id, authUser1, { limit: 2, page: 2 });
    assert.strictEqual(page2.assignments.length, 2);
    assert.notStrictEqual(page1.assignments[0].id, page2.assignments[0].id);
  });

  // 10. Ownership Isolation
  await test('Ownership Isolation: User 1 cannot see User 2 tasks and vice versa', () => {
    const u1 = assignmentService.listAssignments(user1.id, authUser1);
    assert.ok(u1.assignments.every(a => a.userId === user1.id));
    assert.strictEqual(u1.assignments.some(a => a.title.includes('User 2')), false);

    const u2 = assignmentService.listAssignments(user2.id, authUser2);
    assert.strictEqual(u2.assignments.length, 1);
    assert.strictEqual(u2.assignments[0].userId, user2.id);
  });

  closeConnection();
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch {}
  }

  console.log('\n----------------------------------------------------');
  console.log(` ACADEMIC FILTERING SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
