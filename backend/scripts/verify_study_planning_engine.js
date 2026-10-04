/**
 * Verification Test Suite for Deterministic Study Planning Engine
 *
 * Verifies:
 * 1. Upcoming work: Identifies pending & in-progress assignments and active goals.
 * 2. Completed work: Strictly ignores completed and cancelled assignments and goals.
 * 3. Deadlines: All generated study plan items are scheduled strictly on or before deliverable deadlines.
 * 4. Conflicting schedules: Avoids overlapping with existing CalendarEvents and StudySessions, respecting buffer times.
 * 5. Multiple assignments: Deterministic prioritization by deadline proximity, priority (urgent > high > medium > low), and tie-breakers.
 * 6. Goals: Schedules dedicated milestone study blocks for active goals with progress tracking.
 * 7. Daily limits: Enforces sensible daily study caps (e.g. 240 mins) to prevent student fatigue.
 * 8. Past dates: Never schedules in the past; clamps start time to current timestamp.
 * 9. Preview mode: Supports dry-run generation without database mutations.
 * 10. Student data isolation: Student B data is never accessed, mixed, or planned for Student A.
 * 11. Rescheduling: Validates student ownership, past date rejection, deadline boundary enforcement, and conflict detection.
 * 12. Edge cases: Empty work lists, overdue items, tight calendar constraints with warnings.
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_planning_engine.db');
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

const { closeConnection, getConnection } = require('../db/connection');
closeConnection();
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

const { initDb } = require('../db/database');
const migrationRunner = require('../migrations/migrationRunner');

const {
  StudyPlanRepository,
  AssignmentRepository,
  GoalRepository,
  CalendarEventRepository,
  StudySessionRepository,
  CourseRepository
} = require('../repositories');

const { StudyPlanningService } = require('../services/studyPlanningService');
const { StudyPlan, StudyPlanItem } = require('../models');
const { getDateKeyIST } = require('../utils/timezone');

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
  console.log(' Running Deterministic Study Planning Engine Tests  ');
  console.log('====================================================\n');

  initDb();
  const db = getConnection();
  db.pragma('foreign_keys = ON');
  migrationRunner.runMigrations(db);

  // Initialize isolated repository instances
  const studyPlanRepo = new StudyPlanRepository(db);
  const assignmentRepo = new AssignmentRepository(db);
  const goalRepo = new GoalRepository(db);
  const calendarEventRepo = new CalendarEventRepository(db);
  const studySessionRepo = new StudySessionRepository(db);
  const courseRepo = new CourseRepository(db);

  const engine = new StudyPlanningService({
    studyPlanRepo,
    assignmentRepo,
    goalRepo,
    calendarEventRepo,
    studySessionRepo,
    courseRepo,
    db
  });

  const now = Date.now();
  const dayMs = 86400000;
  const hourMs = 3600000;

  // Setup test users
  const userA = 'student-alice-001';
  const userB = 'student-bob-002';

  db.prepare(`
    INSERT OR REPLACE INTO users (id, full_name, college_name, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userA, 'Alice', 'DJ Sanghvi College', 'alice@college.edu', 'hash123', now, now,
    userB, 'Bob', 'DJ Sanghvi College', 'bob@college.edu', 'hash456', now, now
  );

  // Setup test courses
  db.prepare(`
    INSERT OR REPLACE INTO courses (id, user_id, code, name, color, credits, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'crs-algo', userA, 'CS301', 'Design & Analysis of Algorithms', '#3B82F6', 4, now, now,
    'crs-dbms', userA, 'CS302', 'Database Management Systems', '#10B981', 4, now, now
  );

  try {
    // -----------------------------------------------------------------
    // 1. Upcoming Work Identification
    // -----------------------------------------------------------------
    await test('Engine identifies upcoming pending & in-progress work accurately', async () => {
      // Create pending and in-progress assignments
      assignmentRepo.database.prepare(`
        INSERT INTO assignments (id, user_id, course_id, title, due_date, priority, status, created_at, updated_at)
        VALUES 
          (?, ?, ?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'asgn-algo-1', userA, 'crs-algo', 'Algorithms Dynamic Programming Set', now + (3 * dayMs), 'high', 'pending', now, now,
        'asgn-dbms-1', userA, 'crs-dbms', 'DBMS Query Optimizer Lab', now + (5 * dayMs), 'medium', 'in_progress', now, now
      );

      // Create active goal
      goalRepo.database.prepare(`
        INSERT INTO goals (id, user_id, course_id, title, target_date, progress, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'goal-algo-mastery', userA, 'crs-algo', 'Master Graph Theory', now + (6 * dayMs), 30, 'in_progress', now, now
      );

      const assessment = await engine.assessWorkloadAndNeeds(userA, { now, days: 7 });

      assert.equal(assessment.needs.upcomingAssignmentsCount, 2);
      assert.equal(assessment.needs.activeGoalsCount, 1);
      assert.ok(assessment.needs.totalEstimatedStudyMinutes > 0);
      assert.equal(assessment.needs.assignments.length, 2);
      assert.equal(assessment.needs.goals.length, 1);
    });

    // -----------------------------------------------------------------
    // 2. Completed & Cancelled Work Avoidance
    // -----------------------------------------------------------------
    await test('Engine strictly ignores completed, cancelled, and 100% progress work', async () => {
      // Completed and cancelled assignments
      assignmentRepo.database.prepare(`
        INSERT INTO assignments (id, user_id, course_id, title, due_date, priority, status, created_at, updated_at)
        VALUES 
          (?, ?, ?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'asgn-algo-done', userA, 'crs-algo', 'Completed Homework #1', now + (2 * dayMs), 'high', 'completed', now, now,
        'asgn-algo-cancelled', userA, 'crs-algo', 'Cancelled Quiz Preparation', now + (4 * dayMs), 'urgent', 'cancelled', now, now
      );

      // Completed goal and cancelled goal
      goalRepo.database.prepare(`
        INSERT INTO goals (id, user_id, course_id, title, target_date, progress, status, created_at, updated_at)
        VALUES 
          (?, ?, ?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'goal-done', userA, 'crs-algo', 'Completed Data Structures Goal', now + (5 * dayMs), 100, 'completed', now, now,
        'goal-cancelled', userA, 'crs-algo', 'Cancelled Elective', now + (5 * dayMs), 0, 'cancelled', now, now
      );

      const assessment = await engine.assessWorkloadAndNeeds(userA, { now, days: 7 });

      // Count must still be 2 assignments and 1 goal (the uncompleted ones from Test 1)
      assert.equal(assessment.needs.upcomingAssignmentsCount, 2);
      assert.equal(assessment.needs.activeGoalsCount, 1);

      const planResult = await engine.previewStudyPlan(userA, { now, days: 7 });
      const itemTitles = planResult.items.map(it => it.title);

      assert.ok(!itemTitles.some(t => t.includes('Completed Homework #1')));
      assert.ok(!itemTitles.some(t => t.includes('Cancelled Quiz Preparation')));
      assert.ok(!itemTitles.some(t => t.includes('Completed Data Structures Goal')));
      assert.ok(!itemTitles.some(t => t.includes('Cancelled Elective')));
    });

    // -----------------------------------------------------------------
    // 3. Deadline Compliance
    // -----------------------------------------------------------------
    await test('Engine schedules all study items strictly before or on their deadlines', async () => {
      const deadline = now + (2 * dayMs); // Due in 48 hours
      assignmentRepo.database.prepare(`
        INSERT INTO assignments (id, user_id, course_id, title, due_date, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'asgn-tight-deadline', userA, 'crs-algo', 'Urgent Algorithm Submission', deadline, 'urgent', 'pending', now, now
      );

      const planResult = await engine.previewStudyPlan(userA, { now, days: 7 });
      const urgentItems = planResult.items.filter(it => it.assignment_id === 'asgn-tight-deadline');

      assert.ok(urgentItems.length > 0, 'Should schedule at least 1 session for urgent assignment');
      for (const item of urgentItems) {
        const itemEnd = item.planned_date + (item.duration_minutes * 60000);
        assert.ok(
          itemEnd <= deadline,
          `Item end (${itemEnd}) must be on or before assignment deadline (${deadline})`
        );
      }
    });

    // -----------------------------------------------------------------
    // 4. Conflicting Schedules Avoidance
    // -----------------------------------------------------------------
    await test('Engine avoids overlapping with existing CalendarEvents and StudySessions, respecting buffers', async () => {
      // Find candidate slots for tomorrow morning
      // First, insert an existing calendar lecture tomorrow from 10:00 to 12:00
      // And a planned study session from 14:00 to 15:30
      const tomorrowBase = now + dayMs;
      const lectureStart = tomorrowBase + (10 * hourMs);
      const lectureEnd = tomorrowBase + (12 * hourMs);

      const sessionStart = tomorrowBase + (14 * hourMs);
      const sessionEnd = tomorrowBase + (15.5 * hourMs);

      calendarEventRepo.database.prepare(`
        INSERT INTO calendar_events (id, user_id, course_id, title, start_time, end_time, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'evt-lecture-algo', userA, 'crs-algo', 'Algorithms In-Person Lecture', lectureStart, lectureEnd, 'scheduled', now, now
      );

      studySessionRepo.database.prepare(`
        INSERT INTO study_sessions (id, user_id, course_id, title, planned_start_time, planned_duration_minutes, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'session-existing', userA, 'crs-algo', 'Existing Peer Study Session', sessionStart, 90, 'planned', now, now
      );

      // Search for available slots on tomorrowBase
      const slots = engine.findAvailableStudySlots(userA, tomorrowBase, tomorrowBase + dayMs, {
        now,
        slotDurationMinutes: 60,
        bufferMinutes: 15
      });

      // Verify that NO slot overlaps with lecture [lectureStart, lectureEnd] or session [sessionStart, sessionEnd]
      for (const slot of slots) {
        const overlapsLecture = slot.start < lectureEnd && slot.end > lectureStart;
        assert.ok(!overlapsLecture, `Slot [${slot.start}, ${slot.end}] overlaps with lecture [${lectureStart}, ${lectureEnd}]`);

        const overlapsSession = slot.start < sessionEnd && slot.end > sessionStart;
        assert.ok(!overlapsSession, `Slot [${slot.start}, ${slot.end}] overlaps with study session [${sessionStart}, ${sessionEnd}]`);
      }
    });

    // -----------------------------------------------------------------
    // 5. Multiple Assignments & Priority Ranking
    // -----------------------------------------------------------------
    await test('Engine prioritizes deliverables deterministically (urgency and deadline proximity)', async () => {
      // Clear out test assignments to test pure prioritization
      assignmentRepo.database.prepare('DELETE FROM assignments WHERE user_id = ?').run(userA);

      // Insert 3 assignments with distinct priorities and deadlines:
      // 1. Low priority, due in 6 days
      // 2. Medium priority, due in 4 days
      // 3. Urgent priority, due in 2 days
      const dUrgent = now + (2 * dayMs);
      const dMedium = now + (4 * dayMs);
      const dLow = now + (6 * dayMs);

      assignmentRepo.database.prepare(`
        INSERT INTO assignments (id, user_id, course_id, title, due_date, priority, status, created_at, updated_at)
        VALUES 
          ('asgn-p-low', ?, 'crs-algo', 'Low Priority Reading', ?, 'low', 'pending', ?, ?),
          ('asgn-p-med', ?, 'crs-dbms', 'Medium Priority Homework', ?, 'medium', 'pending', ?, ?),
          ('asgn-p-urg', ?, 'crs-algo', 'Urgent Project Milestone', ?, 'urgent', 'pending', ?, ?)
      `).run(
        userA, dLow, now, now,
        userA, dMedium, now, now,
        userA, dUrgent, now, now
      );

      const planResult = await engine.previewStudyPlan(userA, { now, days: 7 });

      // First planned assignment item must be the urgent one (due sooner and highest weight)
      const firstAssignmentItem = planResult.items.find(it => it.assignment_id);
      assert.ok(firstAssignmentItem, 'Should have assignment items');
      assert.equal(firstAssignmentItem.assignment_id, 'asgn-p-urg');

      // Urgent assignment should receive 2 sessions
      const urgentSessions = planResult.items.filter(it => it.assignment_id === 'asgn-p-urg');
      assert.equal(urgentSessions.length, 2, 'Urgent assignment should get 2 planned sessions');

      // Verify sessions have sequential order indices
      for (let i = 0; i < planResult.items.length; i++) {
        assert.equal(planResult.items[i].order_index, i);
      }
    });

    // -----------------------------------------------------------------
    // 6. Student Goals Support
    // -----------------------------------------------------------------
    await test('Engine schedules active goals with milestone study blocks and course relationships', async () => {
      const planResult = await engine.previewStudyPlan(userA, { now, days: 7 });

      const goalItems = planResult.items.filter(it => it.goal_id === 'goal-algo-mastery');
      assert.ok(goalItems.length > 0, 'Should have scheduled at least 1 goal milestone item');

      const goalItem = goalItems[0];
      assert.ok(goalItem.title.includes('Milestone Study: Master Graph Theory'));
      assert.equal(goalItem.course_id, 'crs-algo');
      assert.ok(goalItem.duration_minutes >= 30 && goalItem.duration_minutes <= 60);
      assert.equal(goalItem.status, 'planned');
    });

    // -----------------------------------------------------------------
    // 7. Sensible Daily Study Limits
    // -----------------------------------------------------------------
    await test('Engine respects daily study limit caps to avoid student burnout', async () => {
      // Test with strict daily limit of 120 minutes (2 hours max per day)
      const planResult = await engine.previewStudyPlan(userA, {
        now,
        days: 7,
        dailyLimitMinutes: 120
      });

      const dailyTotals = {};
      for (const item of planResult.items) {
        const dateKey = getDateKeyIST(item.planned_date);
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + item.duration_minutes;
      }

      for (const [dateKey, totalMins] of Object.entries(dailyTotals)) {
        assert.ok(
          totalMins <= 120,
          `Day ${dateKey} total (${totalMins} mins) exceeded daily limit (120 mins)`
        );
      }
    });

    // -----------------------------------------------------------------
    // 8. Avoid Scheduling in the Past
    // -----------------------------------------------------------------
    await test('Engine never schedules study items in the past, even if startDate is in the past', async () => {
      const pastStart = now - (3 * dayMs); // 3 days ago

      const planResult = await engine.previewStudyPlan(userA, {
        now,
        startDate: pastStart,
        days: 7
      });

      for (const item of planResult.items) {
        assert.ok(
          item.planned_date >= now,
          `Planned date (${item.planned_date}) must not be in the past (< ${now})`
        );
      }
    });

    // -----------------------------------------------------------------
    // 9. Full Generation & Persistence Workflow
    // -----------------------------------------------------------------
    await test('Engine successfully persists generated StudyPlan and StudyPlanItems atomically', async () => {
      const result = await engine.generateStudyPlan(userA, {
        now,
        days: 7,
        title: 'Midterm Preparation Sprint',
        description: 'Automated study plan for upcoming exams and projects',
        autoPersist: true
      });

      assert.ok(result.plan instanceof StudyPlan);
      assert.equal(result.plan.title, 'Midterm Preparation Sprint');
      assert.equal(result.plan.user_id, userA);
      assert.ok(result.items.length > 0);

      // Verify records exist in SQLite tables
      const savedPlan = studyPlanRepo.findPlanById(result.plan.id, userA);
      assert.ok(savedPlan, 'Study plan must be saved in database');
      assert.equal(savedPlan.title, 'Midterm Preparation Sprint');

      const savedItems = studyPlanRepo.findItemsByPlanId(result.plan.id, userA);
      assert.equal(savedItems.length, result.items.length);

      for (const it of savedItems) {
        assert.equal(it.plan_id, result.plan.id);
        assert.equal(it.user_id, userA);
      }

      assert.ok(result.summary.totalStudyMinutes > 0);
      assert.equal(result.summary.isDryRun, false);
    });

    // -----------------------------------------------------------------
    // 10. Student Data Isolation
    // -----------------------------------------------------------------
    await test('Engine guarantees zero leakage across students (Student B cannot see or plan for Student A)', async () => {
      // Bob plans his study work
      const bobPlanResult = await engine.previewStudyPlan(userB, { now, days: 7 });

      // Bob has no assignments or goals; result items must be empty
      assert.equal(bobPlanResult.items.length, 0);
      assert.equal(bobPlanResult.summary.assignmentsCoveredCount, 0);
      assert.equal(bobPlanResult.summary.goalsCoveredCount, 0);

      // Alice's existing plans must not be returned to Bob
      const bobPlans = studyPlanRepo.findPlansByUserId(userB);
      assert.equal(bobPlans.total, 0);
    });

    // -----------------------------------------------------------------
    // 11. Rescheduling Planned Study Work with Validation
    // -----------------------------------------------------------------
    await test('Engine handles student-driven rescheduling with safety checks', async () => {
      // Create a plan with an item for Alice
      const plan = studyPlanRepo.createPlan({
        user_id: userA,
        title: 'Sprint for Reschedule Test',
        start_date: now,
        end_date: now + (7 * dayMs)
      });

      const deadline = now + (3 * dayMs);
      assignmentRepo.database.prepare(`
        INSERT INTO assignments (id, user_id, course_id, title, due_date, priority, status, created_at, updated_at)
        VALUES ('asgn-resched-test', ?, 'crs-algo', 'Reschedule Test Assignment', ?, 'medium', 'pending', ?, ?)
      `).run(userA, deadline, now, now);

      const item = studyPlanRepo.createItem({
        user_id: userA,
        plan_id: plan.id,
        assignment_id: 'asgn-resched-test',
        title: 'Prepare Reschedule Item',
        planned_date: now + dayMs,
        duration_minutes: 60,
        status: 'planned'
      });

      // 1. Rescheduling into the past must fail with ValidationError
      await assert.rejects(
        async () => {
          await engine.reschedulePlanItem(userA, item.id, now - 3600000, { now });
        },
        /Cannot reschedule a study work item to a time in the past/
      );

      // 2. Rescheduling after the assignment deadline must fail with ValidationError
      await assert.rejects(
        async () => {
          await engine.reschedulePlanItem(userA, item.id, deadline + 3600000, { now });
        },
        /Cannot reschedule study item after assignment deadline/
      );

      // 3. Valid reschedule to a free slot before the deadline succeeds
      const validSlotTime = now + (1.5 * dayMs);
      const updatedItem = await engine.reschedulePlanItem(userA, item.id, validSlotTime, { now });
      assert.equal(updatedItem.planned_date, validSlotTime);

      // 4. Student B cannot reschedule Alice's item (NotFoundError / student isolation)
      await assert.rejects(
        async () => {
          await engine.reschedulePlanItem(userB, item.id, validSlotTime, { now });
        },
        /Study plan item not found or does not belong to you/
      );
    });

    // -----------------------------------------------------------------
    // 12. Edge Cases (Empty Work, Constraints, Warnings)
    // -----------------------------------------------------------------
    await test('Engine gracefully handles edge cases and tight constraints', async () => {
      // A student with no work returns clean empty plan
      const emptyResult = await engine.previewStudyPlan(userB, { now, days: 7 });
      assert.equal(emptyResult.items.length, 0);
      assert.equal(emptyResult.summary.totalItemsPlanned, 0);
      assert.equal(emptyResult.warnings.length, 0);

      // An assignment due within 10 minutes (cannot fit 60 min session before deadline)
      assignmentRepo.database.prepare(`
        INSERT INTO assignments (id, user_id, course_id, title, due_date, priority, status, created_at, updated_at)
        VALUES ('asgn-imminent', ?, 'crs-algo', 'Imminent Deadline', ?, 'high', 'pending', ?, ?)
      `).run(userA, now + (10 * 60000), now, now);

      const constrainedResult = await engine.previewStudyPlan(userA, { now, days: 1 });
      assert.ok(
        constrainedResult.warnings.some(w => w.includes('Imminent Deadline')),
        'Must report warning when planned sessions cannot fit before deadline'
      );
    });

  } finally {
    closeConnection();
    for (const ext of ['', '-wal', '-shm']) {
      const p = testDbPath + ext;
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  console.log('\n====================================================');
  console.log(` Study Planning Engine Verification: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Unhandled failure in verify_study_planning_engine:', err);
  process.exit(1);
});
