/**
 * Verification Script: Student Goal Management Service Layer
 *
 * Tests the business logic, lifecycle states, progress calculations, and authorization guards
 * in GoalService and GoalRepository.
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const { runMigrations } = require('../migrations/migrationRunner');
const { goalService, courseService } = require('../services');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Student Goal Management Service Test Suite');
  console.log('====================================================\n');

  const db = getConnection();
  runMigrations(db);

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
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

  // Setup test users and course
  const studentA = {
    id: `usr-goal-stud-a-${Date.now()}`,
    email: `studentA_${Date.now()}@college.edu`,
    role: 'student'
  };

  const studentB = {
    id: `usr-goal-stud-b-${Date.now()}`,
    email: `studentB_${Date.now()}@college.edu`,
    role: 'student'
  };

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student A', 'student', 'DJSCE', ?, ?)
  `).run(studentA.id, studentA.email, Date.now(), Date.now());

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student B', 'student', 'DJSCE', ?, ?)
  `).run(studentB.id, studentB.email, Date.now(), Date.now());

  // Create course for Student A
  const courseA = courseService.createCourse(
    studentA.id,
    { name: 'Computer Networks', code: 'CN301', credits: 4 },
    studentA
  );

  let createdGoalA = null;
  let createdMeasurableGoalA = null;

  // 1. Successful Creation
  test('GoalService: creates general student goal with valid defaults', () => {
    const targetDate = Date.now() + 86400000 * 14;
    createdGoalA = goalService.createGoal(
      studentA.id,
      {
        title: 'Score 90+ in Networks Midterm',
        description: 'Complete all problem sets and lab assignments',
        target_date: targetDate
      },
      studentA
    );

    assert.ok(createdGoalA);
    assert.ok(createdGoalA.id.startsWith('goal-'));
    assert.strictEqual(createdGoalA.user_id, studentA.id);
    assert.strictEqual(createdGoalA.title, 'Score 90+ in Networks Midterm');
    assert.strictEqual(createdGoalA.status, 'in_progress');
    assert.strictEqual(createdGoalA.progress, 0);
    assert.strictEqual(createdGoalA.target_date, targetDate);
    assert.strictEqual(createdGoalA.completed_at, null);
  });

  test('GoalService: creates measurable goal linked to student course', () => {
    createdMeasurableGoalA = goalService.createGoal(
      studentA.id,
      {
        course_id: courseA.id,
        title: 'Solve 10 Wireshark Packet Lab Exercises',
        target_value: 10,
        current_value: 2,
        unit: 'labs'
      },
      studentA
    );

    assert.ok(createdMeasurableGoalA);
    assert.strictEqual(createdMeasurableGoalA.course_id, courseA.id);
    assert.strictEqual(createdMeasurableGoalA.target_value, 10);
    assert.strictEqual(createdMeasurableGoalA.current_value, 2);
    // 2/10 = 20%
    assert.strictEqual(createdMeasurableGoalA.progress, 20);
    assert.strictEqual(createdMeasurableGoalA.status, 'in_progress');
  });

  // 2. Retrieval
  test('GoalService: retrieves goal by ID for owner student', () => {
    const fetched = goalService.getGoal(studentA.id, createdGoalA.id, studentA);
    assert.ok(fetched);
    assert.strictEqual(fetched.id, createdGoalA.id);
    assert.strictEqual(fetched.title, createdGoalA.title);
  });

  test('GoalService: lists student goals with filtering and pagination', () => {
    const result = goalService.listGoals(
      studentA.id,
      { status: 'in_progress', page: 1, limit: 10 },
      studentA
    );

    assert.ok(result.data.length >= 2);
    assert.strictEqual(result.page, 1);
    assert.ok(result.total >= 2);
    assert.ok(result.data.every(g => g.user_id === studentA.id));
  });

  // 3. Update
  test('GoalService: updates goal attributes successfully', () => {
    const newTargetDate = Date.now() + 86400000 * 20;
    const updated = goalService.updateGoal(
      createdGoalA.id,
      {
        title: 'Score 95+ in Networks Midterm (Updated)',
        target_date: newTargetDate,
        description: 'Focus heavily on TCP flow control'
      },
      studentA
    );

    assert.strictEqual(updated.title, 'Score 95+ in Networks Midterm (Updated)');
    assert.strictEqual(updated.target_date, newTargetDate);
    assert.strictEqual(updated.description, 'Focus heavily on TCP flow control');
  });

  // 4. Progress Updates
  test('GoalService: updates progress percentage and current measurable value', () => {
    const updated = goalService.updateProgress(
      createdMeasurableGoalA.id,
      {
        current_value: 6 // 6/10 = 60%
      },
      studentA
    );

    assert.strictEqual(updated.current_value, 6);
    assert.strictEqual(updated.progress, 60);
    assert.strictEqual(updated.status, 'in_progress');
    assert.strictEqual(updated.completed_at, null);
  });

  test('GoalService: auto-completes goal when progress reaches 100%', () => {
    const updated = goalService.updateProgress(
      createdMeasurableGoalA.id,
      {
        current_value: 10 // 10/10 = 100%
      },
      studentA
    );

    assert.strictEqual(updated.current_value, 10);
    assert.strictEqual(updated.progress, 100);
    assert.strictEqual(updated.status, 'completed');
    assert.ok(updated.completed_at > 0);
  });

  // 5. Completion
  test('GoalService: completeGoal explicitly marks status completed and sets 100% progress', () => {
    const completed = goalService.completeGoal(createdGoalA.id, studentA);
    assert.strictEqual(completed.status, 'completed');
    assert.strictEqual(completed.progress, 100);
    assert.ok(completed.completed_at > 0);
  });

  // 6. Invalid Progress
  test('GoalService: rejects progress < 0 with BadRequestError', () => {
    assert.throws(() => {
      goalService.updateProgress(createdGoalA.id, { progress: -10 }, studentA);
    }, (err) => err instanceof BadRequestError && /progress/i.test(err.message));
  });

  test('GoalService: rejects progress > 100 with BadRequestError', () => {
    assert.throws(() => {
      goalService.updateProgress(createdGoalA.id, { progress: 120 }, studentA);
    }, (err) => err instanceof BadRequestError && /progress/i.test(err.message));
  });

  test('GoalService: rejects negative current_value with BadRequestError', () => {
    assert.throws(() => {
      goalService.updateProgress(createdGoalA.id, { current_value: -5 }, studentA);
    }, (err) => err instanceof BadRequestError && err.message.includes('Current value'));
  });

  // 7. Invalid State Transitions
  test('GoalService: rejects updating progress or completing cancelled goals', () => {
    // Cancel the goal
    const cancelled = goalService.cancelGoal(createdGoalA.id, studentA);
    assert.strictEqual(cancelled.status, 'cancelled');

    // Updating progress on cancelled goal throws BadRequestError
    assert.throws(() => {
      goalService.updateProgress(createdGoalA.id, { progress: 50 }, studentA);
    }, (err) => err instanceof BadRequestError && err.message.includes('cancelled'));

    // Completing cancelled goal throws BadRequestError
    assert.throws(() => {
      goalService.completeGoal(createdGoalA.id, studentA);
    }, (err) => err instanceof BadRequestError && err.message.includes('cancelled'));

    // Directly setting status to completed on cancelled goal throws BadRequestError
    assert.throws(() => {
      goalService.updateGoal(createdGoalA.id, { status: 'completed' }, studentA);
    }, (err) => err instanceof BadRequestError && err.message.includes('cancelled'));
  });

  // 8. Cross-User Access & Ownership Protection
  test('GoalService: blocks Student B from reading Student A goal (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.getGoal(studentB.id, createdMeasurableGoalA.id, studentB);
    }, (err) => err instanceof ForbiddenError);
  });

  test('GoalService: blocks Student B from updating Student A goal (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.updateGoal(createdMeasurableGoalA.id, { title: 'Hacked Goal' }, studentB);
    }, (err) => err instanceof ForbiddenError);
  });

  test('GoalService: blocks Student B from updating progress of Student A goal (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.updateProgress(createdMeasurableGoalA.id, { progress: 99 }, studentB);
    }, (err) => err instanceof ForbiddenError);
  });

  test('GoalService: blocks Student B from completing Student A goal (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.completeGoal(createdMeasurableGoalA.id, studentB);
    }, (err) => err instanceof ForbiddenError);
  });

  test('GoalService: blocks Student B from deleting Student A goal (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.deleteGoal(createdMeasurableGoalA.id, studentB);
    }, (err) => err instanceof ForbiddenError);
  });

  test('GoalService: blocks Student B from listing Student A goals (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.listGoals(studentA.id, {}, studentB);
    }, (err) => err instanceof ForbiddenError);
  });

  test('GoalService: blocks Student B from creating goal linked to Student A course (ForbiddenError)', () => {
    assert.throws(() => {
      goalService.createGoal(
        studentB.id,
        {
          course_id: courseA.id,
          title: 'Student B trying to link Student A course'
        },
        studentB
      );
    }, (err) => err instanceof ForbiddenError && err.message.includes('course belonging to another student'));
  });

  // 9. Deletion
  test('GoalService: deletes goal cleanly for owner student', () => {
    const deleted = goalService.deleteGoal(createdMeasurableGoalA.id, studentA);
    assert.strictEqual(deleted, true);

    assert.throws(() => {
      goalService.getGoal(studentA.id, createdMeasurableGoalA.id, studentA);
    }, (err) => err instanceof NotFoundError);
  });

  console.log('\n----------------------------------------------------');
  console.log(` GOAL SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during goal service verification:', err);
  process.exit(1);
});
