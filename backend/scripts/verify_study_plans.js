/**
 * Verification Test Suite for Student Study Plan Domain (Migration 010)
 *
 * Verifies:
 * 1. Migration 010: creates study_plans and study_plan_items tables with all 12 indexes
 * 2. Models: StudyPlan and StudyPlanItem schema validation, creation, toJSON, and helpers
 * 3. Validators: Zod schemas for plans, items, and filters (camelCase / snake_case mapping)
 * 4. Repository (Plans): create, findById, findByUserId, update, delete
 * 5. Repository (Items): create, createBatch, findById, findByPlanId, relational filtering
 * 6. Relationships: courses, assignments, goals, study sessions, and study resources
 * 7. Distinction: clearly separates actual calendar study sessions from planned study work
 * 8. Plan Progress: calculation of progress percentage and duration metrics
 * 9. Authorization & Isolation: Student B cannot access Student A plans or items
 * 10. Referential Integrity & Safe Decoupling: ON DELETE SET NULL on academic entities
 * 11. Migration Rollback: down() and up() work cleanly
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_plans_domain.db');
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection, getConnection } = require('../db/connection');
const migrationRunner = require('../migrations/migrationRunner');
const migration010 = require('../migrations/scripts/010_student_study_plans');

const {
  StudyPlan,
  studyPlanSchema,
  StudyPlanItem,
  studyPlanItemSchema
} = require('../models');

const {
  createStudyPlanSchema,
  updateStudyPlanSchema,
  studyPlanFilterSchema,
  createStudyPlanItemSchema,
  updateStudyPlanItemSchema,
  studyPlanItemFilterSchema
} = require('../validators');

const { StudyPlanRepository } = require('../repositories/StudyPlanRepository');

let passed = 0;
let failed = 0;

async function test(name, fn) {
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

async function run() {
  console.log('====================================================');
  console.log(' Running Student Study Plan Domain Verification     ');
  console.log('====================================================\n');

  initDb();
  const db = getConnection();
  db.pragma('foreign_keys = ON');
  migrationRunner.runMigrations(db);
  const repo = new StudyPlanRepository(db);

  try {
    // -----------------------------------------------------------------
    // 1. Migration 010 Verification
    // -----------------------------------------------------------------
    await test('Migration 010: applied migrations list includes 010_student_study_plans', () => {
      const applied = migrationRunner.getAppliedMigrations(db);
      assert.ok(applied.includes('010_student_study_plans'), 'Migration 010 must be in applied list');
    });

    await test('Migration 010: verifies study_plans table structure and columns', () => {
      const cols = db.prepare('PRAGMA table_info(study_plans)').all();
      const colNames = cols.map(c => c.name);
      const expected = ['id', 'user_id', 'title', 'description', 'start_date', 'end_date', 'status', 'created_at', 'updated_at'];
      for (const col of expected) {
        assert.ok(colNames.includes(col), `study_plans must have column ${col}`);
      }
    });

    await test('Migration 010: verifies study_plan_items table structure and columns', () => {
      const cols = db.prepare('PRAGMA table_info(study_plan_items)').all();
      const colNames = cols.map(c => c.name);
      const expected = [
        'id', 'user_id', 'plan_id', 'course_id', 'assignment_id', 'goal_id',
        'study_session_id', 'resource_id', 'title', 'description', 'planned_date',
        'duration_minutes', 'priority', 'status', 'order_index', 'completed_at',
        'created_at', 'updated_at'
      ];
      for (const col of expected) {
        assert.ok(colNames.includes(col), `study_plan_items must have column ${col}`);
      }
    });

    await test('Migration 010: verifies indexes for study_plans and study_plan_items', () => {
      const planIdxs = db.prepare('PRAGMA index_list(study_plans)').all().map(i => i.name);
      assert.ok(planIdxs.includes('idx_study_plans_user_id'));
      assert.ok(planIdxs.includes('idx_study_plans_user_status'));
      assert.ok(planIdxs.includes('idx_study_plans_user_dates'));

      const itemIdxs = db.prepare('PRAGMA index_list(study_plan_items)').all().map(i => i.name);
      assert.ok(itemIdxs.includes('idx_study_plan_items_user_id'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_plan_id'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_user_date'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_user_status'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_course_id'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_assignment_id'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_goal_id'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_study_session_id'));
      assert.ok(itemIdxs.includes('idx_study_plan_items_resource_id'));
    });

    // -----------------------------------------------------------------
    // 2. Domain Models Verification
    // -----------------------------------------------------------------
    await test('Model: StudyPlan instantiates with valid defaults and normalizations', () => {
      const now = Date.now();
      const plan = StudyPlan.create({
        user_id: 'user-alice-1',
        title: 'Midterm Prep Week',
        startDate: now,
        endDate: now + 86400000 * 7
      });

      assert.ok(plan.id.startsWith('plan-'));
      assert.strictEqual(plan.user_id, 'user-alice-1');
      assert.strictEqual(plan.title, 'Midterm Prep Week');
      assert.strictEqual(plan.status, 'active');
      assert.strictEqual(plan.start_date, now);
      assert.strictEqual(plan.end_date, now + 86400000 * 7);

      const json = plan.toJSON();
      assert.strictEqual(json.userId, 'user-alice-1');
      assert.strictEqual(json.startDate, now);
    });

    await test('Model: StudyPlanItem instantiates with valid defaults, getters, and helpers', () => {
      const now = Date.now();
      const item = StudyPlanItem.create({
        user_id: 'user-alice-1',
        title: 'Read Lamport 1978 Logical Clocks Paper',
        plannedDate: now + 3600000,
        durationMinutes: 60,
        priority: 'high'
      });

      assert.ok(item.id.startsWith('plan-item-'));
      assert.strictEqual(item.user_id, 'user-alice-1');
      assert.strictEqual(item.title, 'Read Lamport 1978 Logical Clocks Paper');
      assert.strictEqual(item.duration_minutes, 60);
      assert.strictEqual(item.priority, 'high');
      assert.strictEqual(item.status, 'planned');
      assert.strictEqual(item.isCompleted, false);
      assert.strictEqual(item.isOverdue(now), false);
      assert.strictEqual(item.isOverdue(now + 7200000), true);

      const json = item.toJSON();
      assert.strictEqual(json.durationMinutes, 60);
      assert.strictEqual(json.priority, 'high');
    });

    await test('Model: StudyPlan validates that start_date must be on or before end_date', () => {
      const now = Date.now();
      assert.throws(() => {
        new StudyPlan({
          id: 'p1',
          user_id: 'u1',
          title: 'Invalid Plan',
          start_date: now + 10000,
          end_date: now,
          status: 'active',
          created_at: now,
          updated_at: now
        });
      }, /start_date must be on or before end_date/);
    });

    // -----------------------------------------------------------------
    // 3. Validation Layer Verification
    // -----------------------------------------------------------------
    await test('Validators: createStudyPlanSchema handles camelCase and transforms correctly', () => {
      const now = Date.now();
      const parsed = createStudyPlanSchema.parse({
        title: '  Finals Revision Plan  ',
        startDate: now,
        endDate: now + 86400000 * 14
      });
      assert.strictEqual(parsed.title, 'Finals Revision Plan');
      assert.strictEqual(parsed.start_date, now);
      assert.strictEqual(parsed.end_date, now + 86400000 * 14);
      assert.strictEqual(parsed.status, 'active');
    });

    await test('Validators: createStudyPlanItemSchema validates duration, priority, and relations', () => {
      const now = Date.now();
      const parsed = createStudyPlanItemSchema.parse({
        planId: 'plan-123',
        courseId: 'course-456',
        title: 'Solve Assignment 3 Questions',
        plannedDate: now + 86400000,
        durationMinutes: 90,
        priority: 'urgent'
      });
      assert.strictEqual(parsed.plan_id, 'plan-123');
      assert.strictEqual(parsed.course_id, 'course-456');
      assert.strictEqual(parsed.duration_minutes, 90);
      assert.strictEqual(parsed.priority, 'urgent');
      assert.strictEqual(parsed.status, 'planned');
    });

    await test('Validators: filter schemas enforce positive bounds and pagination', () => {
      const filter = studyPlanItemFilterSchema.parse({
        page: '2',
        limit: '15',
        priority: 'high',
        status: 'in_progress'
      });
      assert.strictEqual(filter.page, 2);
      assert.strictEqual(filter.limit, 15);
      assert.strictEqual(filter.priority, 'high');
      assert.strictEqual(filter.status, 'in_progress');
    });

    // -----------------------------------------------------------------
    // 4. Repository CRUD & Queries
    // -----------------------------------------------------------------
    const runId = Date.now();
    const studentA = `user-student-alice-${runId}`;
    const studentB = `user-student-bob-${runId}`;

    // Seed test users in users table
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', ?, 'DJSCE', 'student', ?, ?),
             (?, ?, 'hash', ?, 'DJSCE', 'student', ?, ?)
    `).run(
      studentA, `alice_${runId}@djsce.edu`, 'Alice Skan', Date.now(), Date.now(),
      studentB, `bob_${runId}@djsce.edu`, 'Bob Peer', Date.now(), Date.now()
    );

    let planA1, planA2;
    await test('Repository: createPlan and findPlanById retrieve saved plans', () => {
      const now = Date.now();
      planA1 = repo.createPlan({
        user_id: studentA,
        title: 'Distributed Systems Mastery Sprint',
        description: 'Prepare for midterm and Raft implementation',
        start_date: now,
        end_date: now + 86400000 * 14
      });
      assert.ok(planA1.id);

      const found = repo.findPlanById(planA1.id, studentA);
      assert.ok(found);
      assert.strictEqual(found.title, 'Distributed Systems Mastery Sprint');
      assert.strictEqual(found.user_id, studentA);

      // Student B cannot find Student A plan
      const foreign = repo.findPlanById(planA1.id, studentB);
      assert.strictEqual(foreign, null);
    });

    await test('Repository: findPlansByUserId lists plans with filtering and pagination', () => {
      const now = Date.now();
      planA2 = repo.createPlan({
        user_id: studentA,
        title: 'Machine Learning Lab Prep',
        start_date: now + 86400000 * 20,
        end_date: now + 86400000 * 25,
        status: 'completed'
      });

      const listAll = repo.findPlansByUserId(studentA);
      assert.strictEqual(listAll.total, 2);
      assert.strictEqual(listAll.data.length, 2);

      const listActive = repo.findPlansByUserId(studentA, { status: 'active' });
      assert.strictEqual(listActive.total, 1);
      assert.strictEqual(listActive.data[0].id, planA1.id);

      const bobPlans = repo.findPlansByUserId(studentB);
      assert.strictEqual(bobPlans.total, 0);
    });

    await test('Repository: updatePlan and deletePlan manage plan lifecycle', () => {
      const updated = repo.updatePlan(planA1.id, studentA, {
        description: 'Updated sprint goals with consensus algorithms',
        status: 'completed'
      });
      assert.strictEqual(updated.description, 'Updated sprint goals with consensus algorithms');
      assert.strictEqual(updated.status, 'completed');

      // Reset status to active for child items tests
      repo.updatePlan(planA1.id, studentA, { status: 'active' });
    });

    // -----------------------------------------------------------------
    // 5. Repository Items (Planned Study Work)
    // -----------------------------------------------------------------
    // Seed an academic course, assignment, goal, study session, and study resource
    const now = Date.now();
    const courseId = `course-${now}`;
    const asgnId = `asgn-${now}`;
    const goalId = `goal-${now}`;
    const sessionId = `study-${now}`;
    const resourceId = `res-${now}`;

    db.prepare(`
      INSERT INTO courses (id, user_id, name, code, created_at, updated_at)
      VALUES (?, ?, 'Distributed Systems', 'CS-401', ?, ?)
    `).run(courseId, studentA, now, now);

    db.prepare(`
      INSERT INTO assignments (id, user_id, course_id, title, due_date, created_at, updated_at)
      VALUES (?, ?, ?, 'Build Raft Cluster', ?, ?, ?)
    `).run(asgnId, studentA, courseId, now + 86400000 * 5, now, now);

    db.prepare(`
      INSERT INTO goals (id, user_id, course_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Master Raft Consensus', 'in_progress', ?, ?)
    `).run(goalId, studentA, courseId, now, now);

    db.prepare(`
      INSERT INTO study_sessions (id, user_id, course_id, title, planned_start_time, planned_duration_minutes, created_at, updated_at)
      VALUES (?, ?, ?, 'Focus Block: Raft RPCs', ?, 60, ?, ?)
    `).run(sessionId, studentA, courseId, now + 86400000, now, now);

    db.prepare(`
      INSERT INTO study_resources (id, user_id, course_id, title, resource_type, created_at, updated_at)
      VALUES (?, ?, ?, 'Raft Cheatsheet', 'note', ?, ?)
    `).run(resourceId, studentA, courseId, now, now);

    let item1;
    await test('Repository: createItem creates planned study work with full relational bindings', () => {
      item1 = repo.createItem({
        user_id: studentA,
        plan_id: planA1.id,
        course_id: courseId,
        assignment_id: asgnId,
        goal_id: goalId,
        resource_id: resourceId,
        title: 'Review Raft Leader Election State Machine',
        description: 'Read sections 5.1 and 5.2 of the Stanford paper',
        planned_date: now + 3600000,
        duration_minutes: 45,
        priority: 'high'
      });

      assert.ok(item1.id);
      assert.strictEqual(item1.plan_id, planA1.id);
      assert.strictEqual(item1.course_id, courseId);
      assert.strictEqual(item1.assignment_id, asgnId);
      assert.strictEqual(item1.goal_id, goalId);
      assert.strictEqual(item1.resource_id, resourceId);
      assert.strictEqual(item1.duration_minutes, 45);
      assert.strictEqual(item1.status, 'planned');
    });

    await test('Repository: createItemsBatch atomically creates multiple planned items', () => {
      const batch = repo.createItemsBatch([
        {
          plan_id: planA1.id,
          course_id: courseId,
          title: 'Implement RequestVote RPC Handler',
          planned_date: now + 7200000,
          duration_minutes: 60,
          priority: 'urgent'
        },
        {
          plan_id: planA1.id,
          course_id: courseId,
          title: 'Implement AppendEntries Heartbeat Timer',
          planned_date: now + 10800000,
          duration_minutes: 60,
          priority: 'medium'
        },
        {
          plan_id: planA1.id,
          title: 'Independent Review of Paxos Comparison',
          planned_date: now + 86400000,
          duration_minutes: 30,
          priority: 'low'
        }
      ], studentA);

      assert.strictEqual(batch.length, 3);
      assert.ok(batch[0].id);
      assert.strictEqual(batch[0].user_id, studentA);
    });

    await test('Repository: findItemsByPlanId returns all items sorted by date and order', () => {
      const items = repo.findItemsByPlanId(planA1.id, studentA);
      assert.strictEqual(items.length, 4);
      assert.strictEqual(items[0].id, item1.id);
    });

    await test('Repository: findItemsByUserId supports course, priority, and date filters', () => {
      const courseItems = repo.findItemsByUserId(studentA, { courseId });
      assert.strictEqual(courseItems.total, 3);

      const urgentItems = repo.findItemsByUserId(studentA, { priority: 'urgent' });
      assert.strictEqual(urgentItems.total, 1);
      assert.strictEqual(urgentItems.data[0].title, 'Implement RequestVote RPC Handler');

      // Student B isolation check
      const bobItems = repo.findItemsByUserId(studentB);
      assert.strictEqual(bobItems.total, 0);
    });

    await test('Repository: findUpcomingItems and findOverdueItems query temporal windows', () => {
      const upcoming = repo.findUpcomingItems(studentA, { days: 7, now });
      assert.ok(upcoming.length >= 3);

      // Verify overdue query with simulated future time
      const overdue = repo.findOverdueItems(studentA, now + 86400000 * 2);
      assert.ok(overdue.length >= 3);
    });

    // -----------------------------------------------------------------
    // 6. Separation of Actual Study Session from Planned Study Work
    // -----------------------------------------------------------------
    await test('Distinct Domains: planned study work links to actual calendar session upon execution', () => {
      // 1. Initial planned state: not yet linked to an actual calendar session
      assert.strictEqual(item1.study_session_id, null);

      // 2. Student schedules/links actual recorded study session
      const linked = repo.linkItemToStudySession(item1.id, sessionId, studentA);
      assert.strictEqual(linked.study_session_id, sessionId);

      // 3. Mark completed
      const completed = repo.updateItem(item1.id, studentA, {
        status: 'completed'
      });
      assert.strictEqual(completed.status, 'completed');
      assert.ok(completed.completed_at > 0);
      assert.strictEqual(completed.study_session_id, sessionId);

      // 4. Verify actual calendar study session row remains independent in study_sessions table
      const sessionRow = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId);
      assert.ok(sessionRow);
      assert.strictEqual(sessionRow.title, 'Focus Block: Raft RPCs');
    });

    // -----------------------------------------------------------------
    // 7. Plan Progress & Duration Summary
    // -----------------------------------------------------------------
    await test('Repository: getPlanSummary computes progress metrics and planned minutes', () => {
      const summary = repo.getPlanSummary(planA1.id, studentA);
      assert.ok(summary);
      assert.strictEqual(summary.metrics.totalItems, 4);
      assert.strictEqual(summary.metrics.completedItems, 1);
      assert.strictEqual(summary.metrics.plannedItems, 3);
      assert.strictEqual(summary.metrics.totalPlannedMinutes, 195); // 45 + 60 + 60 + 30
      assert.strictEqual(summary.metrics.completedMinutes, 45);
      assert.strictEqual(summary.metrics.progressPercentage, 25);
    });

    // -----------------------------------------------------------------
    // 8. Referential Cascades & Safe Decoupling
    // -----------------------------------------------------------------
    await test('Safe Decoupling: deleting course, assignment, goal, session, resource sets foreign keys to NULL', () => {
      // Delete the course (cascades to assignments/goals in some schemas or decouples)
      db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);

      const checkItem = repo.findItemById(item1.id, studentA);
      assert.ok(checkItem, 'Planned study item must not be deleted when course is removed');
      assert.strictEqual(checkItem.course_id, null, 'course_id should be set to null');

      // Delete study session
      db.prepare('DELETE FROM study_sessions WHERE id = ?').run(sessionId);
      const checkItem2 = repo.findItemById(item1.id, studentA);
      assert.strictEqual(checkItem2.study_session_id, null, 'study_session_id should be set to null');

      // Delete study resource
      db.prepare('DELETE FROM study_resources WHERE id = ?').run(resourceId);
      const checkItem3 = repo.findItemById(item1.id, studentA);
      assert.strictEqual(checkItem3.resource_id, null, 'resource_id should be set to null');
    });

    await test('Plan Cascade: deleting a study plan cascades and deletes child plan items', () => {
      const deleted = repo.deletePlan(planA1.id, studentA);
      assert.strictEqual(deleted, true);

      // Plan should be gone
      assert.strictEqual(repo.findPlanById(planA1.id, studentA), null);

      // Child items should be deleted via ON DELETE CASCADE
      const remainingItems = repo.findItemsByPlanId(planA1.id, studentA);
      assert.strictEqual(remainingItems.length, 0);
    });

    // -----------------------------------------------------------------
    // 9. Migration Rollback & Re-application
    // -----------------------------------------------------------------
    await test('Migration 010: down() drops tables and indexes cleanly; up() restores them', () => {
      migration010.down(db);

      const planTableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_plans'").get();
      assert.strictEqual(planTableCheck, undefined, 'study_plans table must be dropped');

      const itemTableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_plan_items'").get();
      assert.strictEqual(itemTableCheck, undefined, 'study_plan_items table must be dropped');

      // Restore
      migration010.up(db);
      const restored = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study_plans'").get();
      assert.ok(restored, 'study_plans table must be restored');
    });

    console.log('\n----------------------------------------------------');
    console.log(` STUDY PLANS DOMAIN SUMMARY: ${passed} passed, ${failed} failed`);
    console.log('----------------------------------------------------');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    closeConnection();
    for (const ext of ['', '-wal', '-shm']) {
      const p = testDbPath + ext;
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
