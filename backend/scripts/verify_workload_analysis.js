/**
 * Verification Script: Workload & Conflict Analysis Service
 */

const assert = require('assert');
const { CalendarEventService } = require('../services/calendarEventService');
const { CalendarEventRepository } = require('../repositories/CalendarEventRepository');
const { StudySessionService } = require('../services/studySessionService');
const { StudySessionRepository } = require('../repositories/StudySessionRepository');
const { AssignmentRepository } = require('../repositories/AssignmentRepository');
const { CourseRepository } = require('../repositories/CourseRepository');
const { WorkloadAnalysisService } = require('../services/workloadAnalysisService');
const { Assignment } = require('../models/Assignment');
const { parseMumbaiTimeToEpoch } = require('../utils/timezone');
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
console.log(' Running Workload & Conflict Analysis Test Suite');
console.log('====================================================\n');

const db = getConnection();
const eventRepo = new CalendarEventRepository(db);
const studyRepo = new StudySessionRepository(db);
const asgnRepo = new AssignmentRepository(db);
const courseRepo = new CourseRepository(db);

const calService = new CalendarEventService(eventRepo, courseRepo);
const studyService = new StudySessionService(studyRepo, courseRepo, asgnRepo);
const workloadService = new WorkloadAnalysisService(eventRepo, studyRepo, asgnRepo, db);

// Fixtures
const userEmpty = `stu-empty-${Date.now()}`;
const userBusy = `stu-busy-${Date.now()}`;
const userOther = `stu-other-${Date.now()}`;

for (const u of [userEmpty, userBusy, userOther]) {
  db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Test User', 'DJSCE', 'student', ?, ?)")
    .run(u, `${u}@example.com`, Date.now(), Date.now());
}

// Ensure items land reliably during daytime (10:00 AM IST) tomorrow
const tomorrowDate = new Date(Date.now() + 86400000);
const baseStart = parseMumbaiTimeToEpoch('10:00', tomorrowDate);

(async () => {
  // 1. Empty schedule check
  await runAsyncTest('Empty Schedule: returns zeroed metrics and zero conflicts', async () => {
    const workload = await workloadService.getWorkloadSummary(userEmpty, { days: 7 });
    assert.strictEqual(workload.summary.totalEvents, 0);
    assert.strictEqual(workload.summary.totalStudySessions, 0);
    assert.strictEqual(workload.summary.totalPlannedStudyMinutes, 0);
    assert.strictEqual(workload.summary.totalAssignmentsDue, 0);
    assert.strictEqual(workload.summary.heavyDaysCount, 0);
    assert.strictEqual(workload.hasConflicts, false);
    assert.strictEqual(workload.conflicts.length, 0);
  });

  // Setup items for busy student
  // Event 1: 10:00 to 12:00 (120 mins)
  const ev1 = await calService.createEvent(userBusy, {
    title: 'Computer Networks Lecture',
    event_type: 'lecture',
    start_time: baseStart,
    end_time: baseStart + (120 * 60000)
  });

  // Study Session 1: 11:30 to 13:00 (overlaps with Event 1 by 30 mins)
  const ss1 = await studyService.createSession(userBusy, {
    title: 'CN Lab Experiment Prep',
    planned_start_time: baseStart + (90 * 60000), // starts at 11:30
    planned_duration_minutes: 90 // ends at 13:00
  });

  // Study Session 2: 13:00 to 15:00 (consecutive to ss1, does NOT overlap!)
  const ss2 = await studyService.createSession(userBusy, {
    title: 'Maths Problem Set',
    planned_start_time: baseStart + (180 * 60000), // starts at 13:00
    planned_duration_minutes: 120 // ends at 15:00
  });

  // 2 Assignments due on same day at 16:00 and 18:00
  const as1 = Assignment.create({ user_id: userBusy, title: 'CN Lab Report', due_date: baseStart + (6 * 3600000) });
  const as2 = Assignment.create({ user_id: userBusy, title: 'Calculus Assignment 4', due_date: baseStart + (8 * 3600000) });
  asgnRepo.create(as1);
  asgnRepo.create(as2);

  // 2. Conflict Detection
  await runAsyncTest('Conflict Detection: detects overlapping event and study session interval', async () => {
    const report = await workloadService.analyzeConflicts(userBusy, {
      start: baseStart - 1000,
      end: baseStart + (24 * 3600000)
    });

    assert.strictEqual(report.hasConflicts, true);
    assert.strictEqual(report.totalConflicts, 1);
    const conflict = report.conflicts[0];
    assert.strictEqual(conflict.overlapMinutes, 30);
    assert.strictEqual(conflict.severity, 'high');
    assert(conflict.firstItem.id === ev1.id || conflict.secondItem.id === ev1.id);
    assert(conflict.firstItem.id === ss1.id || conflict.secondItem.id === ss1.id);
  });

  // 3. Consecutive Non-Overlapping Boundaries
  await runAsyncTest('Boundary Check: consecutive non-overlapping items do not trigger false conflicts', async () => {
    const report = await workloadService.analyzeConflicts(userBusy, {
      start: baseStart + (80 * 60000), // 11:20
      end: baseStart + (300 * 60000)   // 15:00
    });
    // Should still only have 1 conflict (between ev1 and ss1), NOT between ss1 and ss2
    assert.strictEqual(report.totalConflicts, 1);
  });

  // 4. Workload Aggregation & Heavy Day Detection
  await runAsyncTest('Workload Analysis: computes daily commitments and flags heavy day', async () => {
    const workload = await workloadService.getWorkloadSummary(userBusy, {
      start: baseStart - 1000,
      end: baseStart + (24 * 3600000)
    });

    assert.strictEqual(workload.summary.totalEvents, 1);
    assert.strictEqual(workload.summary.totalStudySessions, 2);
    assert.strictEqual(workload.summary.totalPlannedStudyMinutes, 210); // 90 + 120
    assert.strictEqual(workload.summary.totalAssignmentsDue, 2);
    assert.strictEqual(workload.summary.heavyDaysCount, 1);
    assert(workload.summary.totalPlannedStudyHours > 3);

    // Verify daily breakdown has isHeavyDay: true
    const tomorrowKey = workloadService.getDateKeyIST(baseStart);
    const day = workload.dailyBreakdown.find(d => d.date === tomorrowKey);
    assert(day, `Daily breakdown should contain entry for ${tomorrowKey}`);
    assert.strictEqual(day.isHeavyDay, true);
    assert.strictEqual(day.assignmentsDueCount, 2);
    assert.strictEqual(day.eventsCount, 1);
    assert.strictEqual(day.studySessionsCount, 2);
    assert.strictEqual(day.loadLevel, 'heavy'); // total commitment: 120 + 210 = 330 mins >= 240
  });

  // 5. Ownership Isolation
  await runAsyncTest('Ownership Isolation: User 3 workload does not leak User 2 commitments or conflicts', async () => {
    const reportOther = await workloadService.analyzeConflicts(userOther, { days: 7 });
    assert.strictEqual(reportOther.hasConflicts, false);
    assert.strictEqual(reportOther.conflicts.length, 0);

    const workloadOther = await workloadService.getWorkloadSummary(userOther, { days: 7 });
    assert.strictEqual(workloadOther.summary.totalEvents, 0);
    assert.strictEqual(workloadOther.summary.heavyDaysCount, 0);
  });

  console.log('\n----------------------------------------------------');
  console.log(` WORKLOAD ANALYSIS SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
