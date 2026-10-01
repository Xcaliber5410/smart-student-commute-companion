/**
 * Verification Script: Student Goal Domain Model & Migration 007
 */

const assert = require('assert');
const { Goal, goalSchema, goalStatusEnum } = require('../models');
const { getConnection } = require('../db/connection');
const { runMigrations, getMigrationStatus } = require('../migrations/migrationRunner');

async function run() {
  console.log('====================================================');
  console.log(' Running Student Goal Domain Model & Migration 007 Tests');
  console.log('====================================================\n');

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

  // 1. Goal Model Instantiation & Defaults
  test('Goal Model: instantiates and validates defaults', () => {
    const goal = Goal.create({
      user_id: 'usr-student-1',
      title: 'Maintain 9.0 GPA this semester'
    });

    assert.ok(goal.id.startsWith('goal-'));
    assert.strictEqual(goal.user_id, 'usr-student-1');
    assert.strictEqual(goal.course_id, null);
    assert.strictEqual(goal.title, 'Maintain 9.0 GPA this semester');
    assert.strictEqual(goal.status, 'in_progress');
    assert.strictEqual(goal.progress, 0);
    assert.strictEqual(goal.current_value, 0);
    assert.strictEqual(goal.target_value, null);
    assert.strictEqual(goal.unit, null);
    assert.strictEqual(goal.completed_at, null);
    assert.ok(goal.created_at > 0);
    assert.ok(goal.updated_at > 0);
  });

  // 2. Goal Model Validation: rejects invalid progress and status
  test('Goal Model: rejects invalid progress (< 0 or > 100)', () => {
    assert.throws(() => {
      new Goal({
        id: 'goal-invalid-1',
        user_id: 'usr-1',
        title: 'Invalid',
        progress: -5,
        created_at: Date.now(),
        updated_at: Date.now()
      });
    }, /Progress cannot be negative/);

    assert.throws(() => {
      new Goal({
        id: 'goal-invalid-2',
        user_id: 'usr-1',
        title: 'Invalid',
        progress: 105,
        created_at: Date.now(),
        updated_at: Date.now()
      });
    }, /Progress cannot exceed 100/);
  });

  test('Goal Model: rejects invalid status enum', () => {
    assert.throws(() => {
      new Goal({
        id: 'goal-invalid-3',
        user_id: 'usr-1',
        title: 'Invalid Status',
        status: 'archived_invalid',
        progress: 50,
        created_at: Date.now(),
        updated_at: Date.now()
      });
    }, /Invalid enum value/);
  });

  // 3. Measurable Target & Progress Calculation
  test('Goal Model: auto-calculates progress from measurable target and current value', () => {
    const goal = Goal.create({
      user_id: 'usr-student-1',
      title: 'Complete 20 LeetCode problems',
      target_value: 20,
      current_value: 5,
      unit: 'problems'
    });

    assert.strictEqual(goal.target_value, 20);
    assert.strictEqual(goal.current_value, 5);
    assert.strictEqual(goal.unit, 'problems');
    // 5 / 20 = 25%
    assert.strictEqual(goal.progress, 25);
    assert.strictEqual(goal.status, 'in_progress');
    assert.strictEqual(goal.completed_at, null);

    // Update progress
    goal.updateProgress({ currentValue: 20 });
    assert.strictEqual(goal.current_value, 20);
    assert.strictEqual(goal.progress, 100);
    assert.strictEqual(goal.status, 'completed');
    assert.ok(goal.completed_at > 0);
  });

  // 4. Serialization: toRow, fromRow, and toJSON
  test('Goal Model: serializes to and from DB row and JSON', () => {
    const targetDate = Date.now() + 86400000 * 30;
    const goal = Goal.create({
      user_id: 'usr-student-2',
      course_id: 'course-math-101',
      title: 'Score 90% in Calculus Exam',
      description: 'Review chapters 1 through 6',
      target_date: targetDate,
      status: 'in_progress',
      progress: 60,
      target_value: 100,
      current_value: 60,
      unit: 'marks'
    });

    const row = goal.toRow();
    assert.strictEqual(row.id, goal.id);
    assert.strictEqual(row.user_id, 'usr-student-2');
    assert.strictEqual(row.course_id, 'course-math-101');
    assert.strictEqual(row.target_date, targetDate);
    assert.strictEqual(row.status, 'in_progress');
    assert.strictEqual(row.progress, 60);
    assert.strictEqual(row.target_value, 100);
    assert.strictEqual(row.current_value, 60);

    const fromDb = Goal.fromRow(row);
    assert.strictEqual(fromDb.id, goal.id);
    assert.strictEqual(fromDb.title, goal.title);
    assert.strictEqual(fromDb.course_id, 'course-math-101');
    assert.strictEqual(fromDb.progress, 60);

    const json = fromDb.toJSON();
    assert.strictEqual(json.userId, 'usr-student-2');
    assert.strictEqual(json.courseId, 'course-math-101');
    assert.strictEqual(json.targetDate, targetDate);
    assert.strictEqual(json.currentValue, 60);
    assert.strictEqual(json.targetValue, 100);
  });

  // 5. Database Migration & Schema Execution
  test('Database Migration 007: executes migration and creates table with indexes', () => {
    const db = getConnection();
    runMigrations(db);

    // Verify goals table exists
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'").get();
    assert.ok(tableInfo, 'goals table must exist');

    // Verify columns exist
    const columns = db.prepare("PRAGMA table_info(goals)").all().map(c => c.name);
    assert.ok(columns.includes('id'));
    assert.ok(columns.includes('user_id'));
    assert.ok(columns.includes('course_id'));
    assert.ok(columns.includes('title'));
    assert.ok(columns.includes('description'));
    assert.ok(columns.includes('target_date'));
    assert.ok(columns.includes('status'));
    assert.ok(columns.includes('progress'));
    assert.ok(columns.includes('target_value'));
    assert.ok(columns.includes('current_value'));
    assert.ok(columns.includes('unit'));
    assert.ok(columns.includes('completed_at'));
    assert.ok(columns.includes('created_at'));
    assert.ok(columns.includes('updated_at'));

    // Verify indexes exist
    const indexes = db.prepare("PRAGMA index_list(goals)").all().map(i => i.name);
    assert.ok(indexes.includes('idx_goals_user_id'));
    assert.ok(indexes.includes('idx_goals_user_status'));
    assert.ok(indexes.includes('idx_goals_course_id'));
    assert.ok(indexes.includes('idx_goals_user_target_date'));
  });

  // 6. Database Operations & Foreign Key Constraints
  test('Database: inserts, retrieves, updates, and handles cascade/null FK behaviors', () => {
    const db = getConnection();
    const testUserId = `usr-goal-test-${Date.now()}`;
    const testCourseId = `course-goal-test-${Date.now()}`;

    // Insert test user and course
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Goal Test User', 'student', 'DJSCE', ?, ?)
    `).run(testUserId, `${testUserId}@college.edu`, Date.now(), Date.now());

    db.prepare(`
      INSERT INTO courses (id, user_id, name, created_at, updated_at)
      VALUES (?, ?, 'Data Structures', ?, ?)
    `).run(testCourseId, testUserId, Date.now(), Date.now());

    // Insert goal linked to course
    const goal = Goal.create({
      user_id: testUserId,
      course_id: testCourseId,
      title: 'Master Binary Search Trees',
      target_value: 5,
      current_value: 2,
      unit: 'assignments'
    });

    const insertStmt = db.prepare(`
      INSERT INTO goals (id, user_id, course_id, title, description, target_date, status, progress, target_value, current_value, unit, completed_at, created_at, updated_at)
      VALUES (@id, @user_id, @course_id, @title, @description, @target_date, @status, @progress, @target_value, @current_value, @unit, @completed_at, @created_at, @updated_at)
    `);
    insertStmt.run(goal.toRow());

    // Retrieve goal
    const retrievedRow = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal.id);
    const retrievedGoal = Goal.fromRow(retrievedRow);
    assert.strictEqual(retrievedGoal.id, goal.id);
    assert.strictEqual(retrievedGoal.title, 'Master Binary Search Trees');
    assert.strictEqual(retrievedGoal.course_id, testCourseId);
    assert.strictEqual(retrievedGoal.progress, 40);

    // Delete course -> course_id should become NULL (ON DELETE SET NULL)
    db.prepare('DELETE FROM courses WHERE id = ?').run(testCourseId);
    const rowAfterCourseDelete = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal.id);
    assert.strictEqual(rowAfterCourseDelete.course_id, null, 'course_id should be SET NULL on course deletion');

    // Delete user -> goal should be deleted (ON DELETE CASCADE)
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
    const rowAfterUserDelete = db.prepare('SELECT * FROM goals WHERE id = ?').get(goal.id);
    assert.strictEqual(rowAfterUserDelete, undefined, 'goal should be CASCADE deleted when user is deleted');
  });

  console.log('\n----------------------------------------------------');
  console.log(` GOAL DOMAIN SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during goal verification:', err);
  process.exit(1);
});
