/**
 * Verification Script: Student Goal Workflows and Academic Associations
 *
 * Validates practical integration of goals with assignments and study sessions:
 * 1. Valid goal/task association.
 * 2. Invalid ownership association (preventing cross-student linking).
 * 3. Goal progress based on related work (assignments and study session durations).
 * 4. Completion behavior (auto-completion at 100%, auto-reopen on rollback).
 * 5. Removing/changing relationships (unlinking tasks/sessions and progress adjustment).
 * 6. Cross-user isolation and authorization checks.
 * 7. Transactional atomicity during batch associations.
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const { runMigrations } = require('../migrations/migrationRunner');
const { goalService, assignmentService, studySessionService } = require('../services');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Student Goal Workflow Integration Suite');
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

  async function testAsync(name, fn) {
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

  const now = Date.now();
  const studentA = {
    id: `usr-wf-a-${now}`,
    email: `student_wf_a_${now}@college.edu`,
    role: 'student'
  };

  const studentB = {
    id: `usr-wf-b-${now}`,
    email: `student_wf_b_${now}@college.edu`,
    role: 'student'
  };

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student Alpha', 'student', 'DJSCE', ?, ?)
  `).run(studentA.id, studentA.email, now, now);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student Beta', 'student', 'DJSCE', ?, ?)
  `).run(studentB.id, studentB.email, now, now);

  // Setup Course for Student A
  const courseA = {
    id: `course-wf-${now}`,
    user_id: studentA.id,
    name: 'Distributed Systems',
    code: 'CS401',
    created_at: now,
    updated_at: now
  };
  db.prepare(`
    INSERT INTO courses (id, user_id, name, code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(courseA.id, courseA.user_id, courseA.name, courseA.code, courseA.created_at, courseA.updated_at);

  // -------------------------------------------------------------
  // Test 1: Valid goal creation and direct task creation with goal_id
  // -------------------------------------------------------------
  let goal1 = null;
  let task1 = null;
  let task2 = null;

  test('Valid goal and task creation with goal_id association', () => {
    goal1 = goalService.createGoal(studentA.id, {
      title: 'Master Distributed Systems Labs',
      description: 'Complete all assignments and attend study sessions',
      course_id: courseA.id,
      unit: 'assignments',
      target_value: 2
    }, studentA);

    assert(goal1, 'Goal should be created');
    assert.strictEqual(goal1.title, 'Master Distributed Systems Labs');
    assert.strictEqual(goal1.status, 'in_progress');
    assert.strictEqual(goal1.progress, 0);

    task1 = assignmentService.createAssignment(studentA.id, {
      title: 'Lab 1: Raft Consensus',
      due_date: now + 86400000,
      course_id: courseA.id,
      goal_id: goal1.id
    }, studentA);

    assert(task1, 'Task 1 should be created');
    assert.strictEqual(task1.goalId, goal1.id);

    task2 = assignmentService.createAssignment(studentA.id, {
      title: 'Lab 2: MapReduce Engine',
      due_date: now + 172800000,
      course_id: courseA.id,
      goal_id: goal1.id
    }, studentA);

    assert(task2, 'Task 2 should be created');
    assert.strictEqual(task2.goalId, goal1.id);
  });

  // -------------------------------------------------------------
  // Test 2: Invalid ownership associations are rejected
  // -------------------------------------------------------------
  test('Invalid ownership association: Student B cannot create task linked to Student A goal', () => {
    assert.throws(() => {
      assignmentService.createAssignment(studentB.id, {
        title: 'Unauthorized Task',
        due_date: now + 86400000,
        goal_id: goal1.id
      }, studentB);
    }, (err) => {
      assert(err instanceof ForbiddenError, 'Should throw ForbiddenError');
      assert(err.message.includes('another student'), 'Should indicate goal belongs to another student');
      return true;
    });
  });

  test('Invalid ownership association: Student B cannot link their existing task to Student A goal', () => {
    // Create Student B task without goal
    const bTask = assignmentService.createAssignment(studentB.id, {
      title: 'Beta Task',
      due_date: now + 86400000
    }, studentB);

    assert.throws(() => {
      assignmentService.updateAssignment(bTask.id, {
        goal_id: goal1.id
      }, studentB);
    }, (err) => {
      assert(err instanceof ForbiddenError, 'Should throw ForbiddenError');
      return true;
    });

    assert.throws(() => {
      goalService.linkAssignments(goal1.id, [bTask.id], studentA);
    }, (err) => {
      assert(err instanceof ForbiddenError, 'Should reject linking other student task');
      return true;
    });
  });

  // -------------------------------------------------------------
  // Test 3: Goal progress dynamically reflects related work
  // -------------------------------------------------------------
  test('Goal progress updates based on related completed work (50% on 1 of 2 completed)', () => {
    // Complete task 1
    const updatedTask1 = assignmentService.updateStatus(task1.id, 'completed', studentA);
    assert.strictEqual(updatedTask1.status, 'completed');

    const refreshedGoal = goalService.getGoal(studentA.id, goal1.id, studentA);
    assert.strictEqual(refreshedGoal.current_value, 1, 'Current value should be 1');
    assert.strictEqual(refreshedGoal.progress, 50, 'Progress should be 50%');
    assert.strictEqual(refreshedGoal.status, 'in_progress', 'Status should still be in_progress');
    assert.strictEqual(refreshedGoal.completed_at, null, 'completed_at should be null');
  });

  // -------------------------------------------------------------
  // Test 4: Completion behavior (100% triggers completed status)
  // -------------------------------------------------------------
  test('Completion behavior: 100% completed work automatically completes goal', () => {
    // Complete task 2
    const updatedTask2 = assignmentService.updateStatus(task2.id, 'completed', studentA);
    assert.strictEqual(updatedTask2.status, 'completed');

    const refreshedGoal = goalService.getGoal(studentA.id, goal1.id, studentA);
    assert.strictEqual(refreshedGoal.current_value, 2, 'Current value should be 2');
    assert.strictEqual(refreshedGoal.progress, 100, 'Progress should be 100%');
    assert.strictEqual(refreshedGoal.status, 'completed', 'Status should transition to completed');
    assert(refreshedGoal.completed_at > 0, 'completed_at should be set');
  });

  // -------------------------------------------------------------
  // Test 5: Reopening task reverts goal completion
  // -------------------------------------------------------------
  test('Completion behavior: Reopening a task automatically reverts goal completion to in_progress', () => {
    assignmentService.updateStatus(task2.id, 'pending', studentA);

    const refreshedGoal = goalService.getGoal(studentA.id, goal1.id, studentA);
    assert.strictEqual(refreshedGoal.current_value, 1, 'Current value should revert to 1');
    assert.strictEqual(refreshedGoal.progress, 50, 'Progress should revert to 50%');
    assert.strictEqual(refreshedGoal.status, 'in_progress', 'Status should revert to in_progress');
    assert.strictEqual(refreshedGoal.completed_at, null, 'completed_at should be reset to null');
  });

  // -------------------------------------------------------------
  // Test 6: Removing/changing relationships updates progress
  // -------------------------------------------------------------
  test('Removing/changing relationships: unlinking assignment recalibrates goal progress', () => {
    // Unlink the pending task2, leaving only completed task1
    const unlinkRes = goalService.unlinkAssignment(goal1.id, task2.id, studentA);
    assert.strictEqual(unlinkRes.unlinkedAssignmentId, task2.id);

    const refreshedGoal = goalService.getGoal(studentA.id, goal1.id, studentA);
    // Now only 1 task is linked, and it is completed!
    assert.strictEqual(refreshedGoal.current_value, 1);
    // Target was 2, so 1/2 is 50%
    assert.strictEqual(refreshedGoal.progress, 50);

    // Now unlink completed task1 as well
    goalService.unlinkAssignment(goal1.id, task1.id, studentA);
    const emptyGoal = goalService.getGoal(studentA.id, goal1.id, studentA);
    assert.strictEqual(emptyGoal.current_value, 0);
  });

  // -------------------------------------------------------------
  // Test 7: Batch link assignments with transaction and atomicity
  // -------------------------------------------------------------
  test('Batch linking assignments updates goal in single atomic transaction', () => {
    const task3 = assignmentService.createAssignment(studentA.id, {
      title: 'Lab 3: Paxos Replication',
      due_date: now + 200000000,
      course_id: courseA.id
    }, studentA);

    const linkRes = goalService.linkAssignments(goal1.id, [task1.id, task3.id], studentA);
    assert.strictEqual(linkRes.assignments.length, 2);

    const workSummary = goalService.getGoalWorkSummary(goal1.id, studentA);
    assert.strictEqual(workSummary.assignments.length, 2);
    assert.strictEqual(workSummary.assignmentSummary.total, 2);
    assert.strictEqual(workSummary.assignmentSummary.completed, 1); // task1 is completed
    assert.strictEqual(workSummary.assignmentSummary.pending, 1);   // task3 is pending
  });

  // -------------------------------------------------------------
  // Test 8: Study sessions integration with time-based goals
  // -------------------------------------------------------------
  let studyGoal = null;
  let session1 = null;

  await testAsync('Study sessions integration: completed study time drives goal progress', async () => {
    studyGoal = goalService.createGoal(studentA.id, {
      title: 'Log 5 Hours of Distributed Systems Study',
      description: 'Prepare for midterm with focused revision blocks',
      course_id: courseA.id,
      unit: 'hours',
      target_value: 5
    }, studentA);

    assert.strictEqual(studyGoal.progress, 0);

    // Create planned study session for 120 mins (2 hours)
    session1 = await studySessionService.createSession(studentA.id, {
      title: 'Raft Paper Reading Session',
      planned_start_time: now + 3600000,
      planned_duration_minutes: 120,
      course_id: courseA.id,
      goal_id: studyGoal.id
    });

    assert.strictEqual(session1.goal_id, studyGoal.id);

    // Planned session has 0 completed minutes yet
    let goalState = goalService.getGoal(studentA.id, studyGoal.id, studentA);
    assert.strictEqual(goalState.progress, 0);

    // Mark session as completed (120 minutes = 2 hours)
    await studySessionService.updateStatus(studentA.id, session1.id, 'completed', 120);

    goalState = goalService.getGoal(studentA.id, studyGoal.id, studentA);
    assert.strictEqual(goalState.current_value, 2, 'Current value should be 2 hours');
    assert.strictEqual(goalState.progress, 40, '2 out of 5 hours is 40%');

    // Create second study session for 180 mins (3 hours)
    const session2 = await studySessionService.createSession(studentA.id, {
      title: 'Consensus Problem Solving',
      planned_start_time: now + 7200000,
      planned_duration_minutes: 180,
      course_id: courseA.id,
      goal_id: studyGoal.id
    });

    // Complete session 2 with 180 minutes -> total 300 minutes = 5 hours (100%!)
    await studySessionService.updateStatus(studentA.id, session2.id, 'completed', 180);

    goalState = goalService.getGoal(studentA.id, studyGoal.id, studentA);
    assert.strictEqual(goalState.current_value, 5, 'Current value should be 5 hours');
    assert.strictEqual(goalState.progress, 100, '5 out of 5 hours is 100%');
    assert.strictEqual(goalState.status, 'completed', 'Goal should automatically complete');
    assert(goalState.completed_at > 0, 'completed_at should be set');
  });

  // -------------------------------------------------------------
  // Test 9: Study session cross-user isolation
  // -------------------------------------------------------------
  await testAsync('Study session cross-user isolation prevents unauthorized linking', async () => {
    // Student B creates a study session
    const bSession = await studySessionService.createSession(studentB.id, {
      title: 'Student B Study Session',
      planned_start_time: now + 3600000,
      planned_duration_minutes: 60
    });

    // Student B tries to link to Student A's goal
    await assert.rejects(async () => {
      await studySessionService.updateSession(studentB.id, bSession.id, {
        goal_id: studyGoal.id
      });
    }, (err) => {
      assert(err instanceof ForbiddenError);
      return true;
    });

    // Student A tries to link Student B's session to Student A's goal
    assert.throws(() => {
      goalService.linkStudySessions(studyGoal.id, [bSession.id], studentA);
    }, (err) => {
      assert(err instanceof ForbiddenError);
      return true;
    });
  });

  // -------------------------------------------------------------
  // Test 10: Cross-user access guards on goal work summary & sync
  // -------------------------------------------------------------
  test('Cross-user isolation on goal work endpoints', () => {
    assert.throws(() => {
      goalService.getGoalWorkSummary(goal1.id, studentB);
    }, (err) => {
      assert(err instanceof ForbiddenError);
      return true;
    });

    assert.throws(() => {
      goalService.syncGoalProgressFromWork(goal1.id, studentB);
    }, (err) => {
      assert(err instanceof ForbiddenError);
      return true;
    });
  });

  console.log('\n----------------------------------------------------');
  console.log(` GOAL WORKFLOW TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }
  console.log('ALL GOAL WORKFLOW TESTS PASSED! 🎉\n');
}

run().catch(err => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
