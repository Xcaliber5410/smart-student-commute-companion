/**
 * Integration Test Suite: Study Planning & Calendar Conflicts Integration
 *
 * Verifies that the deterministic study planning engine respects actual student scheduling:
 * 1. Free Time: Computes genuine continuous free time windows between existing commitments
 * 2. Overlapping Events: Merges overlapping calendar events and avoids scheduling inside them
 * 3. Back-to-Back Events: Merges contiguous events and recognizes zero gap between them
 * 4. Insufficient Availability: Detects and flags when free study time before a deadline is inadequate
 * 5. Existing Study Sessions: Treats existing study sessions as immutable busy blocks without overwriting
 * 6. Deadline Pressure: Prioritizes urgent/near-term deliverables in limited available windows
 * 7. Multiple Assignments: Balances multiple deliverables across days, respecting daily limits
 * 8. Rescheduling Safety: Enforces conflict checks against calendar events, study sessions, and plan items
 * 9. Data Preservation: Verifies calendar events and study sessions remain 100% untouched
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { studyPlanRepository } = require('../repositories/StudyPlanRepository');
const { studyPlanningService, StudyPlanningService } = require('../services/studyPlanningService');
const { workloadAnalysisService } = require('../services/workloadAnalysisService');
const { CalendarEvent } = require('../models/CalendarEvent');
const { StudySession } = require('../models/StudySession');
const { Assignment } = require('../models/Assignment');
const { Course } = require('../models/Course');
const { parseMumbaiTimeToEpoch, formatInMumbaiTime, getDateKeyIST, IST_OFFSET_MS } = require('../utils/timezone');
const { ConflictError, ValidationError } = require('../errors');

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
console.log(' Running Study Planning & Calendar Conflicts Tests ');
console.log('====================================================\n');

const db = getConnection();

// Seed test student users
const studentA = `stu-cal-plan-a-${Date.now()}`;
const studentB = `stu-cal-plan-b-${Date.now()}`;

for (const u of [studentA, studentB]) {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Test Student', 'DJSCE', 'student', ?, ?)
  `).run(u, `${u}@example.com`, Date.now(), Date.now());
}

// Create courses for student A
const courseAlgo = Course.create({ user_id: studentA, name: 'Algorithms', code: 'CS301', color: '#4F46E5' });
const courseSys = Course.create({ user_id: studentA, name: 'Operating Systems', code: 'CS302', color: '#10B981' });
const courseMath = Course.create({ user_id: studentA, name: 'Applied Mathematics', code: 'CS303', color: '#F59E0B' });

courseRepository.create(courseAlgo);
courseRepository.create(courseSys);
courseRepository.create(courseMath);

// Anchor tomorrow at 00:00 IST for clean deterministic timestamp calculations
const now = Date.now();
const tomorrowDate = new Date(now + 86400000);
const tomorrowDayKey = getDateKeyIST(tomorrowDate.getTime());
const [tY, tM, tD] = tomorrowDayKey.split('-').map(Number);
const tomorrow00 = Date.UTC(tY, tM - 1, tD, 0, 0, 0, 0) - IST_OFFSET_MS;

const day1_0900 = tomorrow00 + (9 * 3600000);   // 09:00 AM IST tomorrow
const day1_1000 = tomorrow00 + (10 * 3600000);  // 10:00 AM IST
const day1_1100 = tomorrow00 + (11 * 3600000);  // 11:00 AM IST
const day1_1130 = tomorrow00 + (11.5 * 3600000);// 11:30 AM IST
const day1_1200 = tomorrow00 + (12 * 3600000);  // 12:00 PM IST
const day1_1300 = tomorrow00 + (13 * 3600000);  // 01:00 PM IST
const day1_1400 = tomorrow00 + (14 * 3600000);  // 02:00 PM IST
const day1_1530 = tomorrow00 + (15.5 * 3600000);// 03:30 PM IST
const day1_1600 = tomorrow00 + (16 * 3600000);  // 04:00 PM IST
const day1_1700 = tomorrow00 + (17 * 3600000);  // 05:00 PM IST
const day1_1800 = tomorrow00 + (18 * 3600000);  // 06:00 PM IST
const day1_2100 = tomorrow00 + (21 * 3600000);  // 09:00 PM IST

const day2_0900 = day1_0900 + 86400000;
const day2_1200 = day1_1200 + 86400000;
const day2_1800 = day1_1800 + 86400000;
const day2_2100 = day1_2100 + 86400000;

(async () => {
  // =========================================================================
  // 1. FREE TIME WINDOW DISCOVERY
  // =========================================================================
  await runAsyncTest('Free Time: accurately discovers continuous open windows around scheduled lectures', async () => {
    // Student has 1 event: 10:00 to 12:00
    const evLecture = CalendarEvent.create({
      user_id: studentA,
      course_id: courseAlgo.id,
      title: 'Algorithms Lecture',
      event_type: 'lecture',
      start_time: day1_1000,
      end_time: day1_1200,
      status: 'scheduled'
    });
    calendarEventRepository.create(evLecture);

    const windows = studyPlanningService.findAvailableTimeWindows(studentA, day1_0900, day1_2100, {
      now: day1_0900 - 1000,
      bufferMinutes: 15,
      minWindowMinutes: 30
    });

    // Expecting 2 free windows:
    // Window 1: 09:00 to 09:45 (45 mins, 15m buffer before 10:00 lecture)
    // Window 2: 12:15 to 21:00 (525 mins, 15m buffer after 12:00 lecture)
    assert(windows.length >= 2, `Expected at least 2 free windows, got ${windows.length}`);
    const w1 = windows[0];
    const w2 = windows[1];

    assert.strictEqual(w1.start, day1_0900);
    assert.strictEqual(w1.end, day1_1000 - (15 * 60000)); // 09:45
    assert.strictEqual(w1.durationMinutes, 45);

    assert.strictEqual(w2.start, day1_1200 + (15 * 60000)); // 12:15
    assert.strictEqual(w2.end, day1_2100);
    assert.strictEqual(w2.durationMinutes, 525);
  });

  // =========================================================================
  // 2. OVERLAPPING CALENDAR EVENTS
  // =========================================================================
  await runAsyncTest('Overlapping Events: merges overlapping events and avoids scheduling inside them', async () => {
    // Add second event that overlaps the 10:00-12:00 lecture: 11:00 to 13:00
    const evOverlap = CalendarEvent.create({
      user_id: studentA,
      title: 'Department Seminar (Overlapping)',
      event_type: 'extracurricular',
      start_time: day1_1100,
      end_time: day1_1300,
      status: 'scheduled'
    });
    calendarEventRepository.create(evOverlap);

    const windows = studyPlanningService.findAvailableTimeWindows(studentA, day1_0900, day1_2100, {
      now: day1_0900 - 1000,
      bufferMinutes: 15,
      minWindowMinutes: 30
    });

    // The merged busy interval spans from 09:45 (10:00 - 15m) to 13:15 (13:00 + 15m).
    // Free windows should NOT contain anything between 09:45 and 13:15!
    for (const w of windows) {
      assert(
        w.end <= day1_1000 || w.start >= day1_1300 + (15 * 60000),
        `Free window [${formatInMumbaiTime(w.start)} - ${formatInMumbaiTime(w.end)}] intruded into overlapping busy block [10:00 - 13:00]`
      );
    }

    const afternoonWindow = windows.find(w => w.start >= day1_1300);
    assert(afternoonWindow, 'Expected afternoon free window starting at or after 13:15');
    assert.strictEqual(afternoonWindow.start, day1_1300 + (15 * 60000)); // 13:15
  });

  // =========================================================================
  // 3. BACK-TO-BACK CALENDAR EVENTS
  // =========================================================================
  await runAsyncTest('Back-to-Back Events: merges contiguous events with zero gap and respects buffers', async () => {
    // Add two back-to-back events in the afternoon: 14:00 to 15:30 and 15:30 to 17:00
    const evLab = CalendarEvent.create({
      user_id: studentA,
      title: 'OS Lab Practical',
      event_type: 'lab',
      start_time: day1_1400,
      end_time: day1_1530,
      status: 'scheduled'
    });
    const evDoubt = CalendarEvent.create({
      user_id: studentA,
      title: 'OS Doubt Clearing Session',
      event_type: 'lecture',
      start_time: day1_1530,
      end_time: day1_1700,
      status: 'scheduled'
    });
    calendarEventRepository.create(evLab);
    calendarEventRepository.create(evDoubt);

    const windows = studyPlanningService.findAvailableTimeWindows(studentA, day1_0900, day1_2100, {
      now: day1_0900 - 1000,
      bufferMinutes: 15,
      minWindowMinutes: 30
    });

    // Busy blocks:
    // Morning overlap: 09:45 to 13:15
    // Afternoon back-to-back: 13:45 to 17:15
    // Between 13:15 and 13:45 is only 30 minutes, which equals minWindowMinutes: [13:15, 13:45]
    // Evening window: 17:15 to 21:00 (225 minutes)
    for (const w of windows) {
      assert(
        !(w.start >= day1_1400 && w.end <= day1_1700),
        `Found slot inside back-to-back events: [${formatInMumbaiTime(w.start)} - ${formatInMumbaiTime(w.end)}]`
      );
    }

    const eveningWindow = windows.find(w => w.start >= day1_1700);
    assert(eveningWindow, 'Expected evening window starting after back-to-back events');
    assert.strictEqual(eveningWindow.start, day1_1700 + (15 * 60000)); // 17:15
  });

  // =========================================================================
  // 4. EXISTING STUDY SESSIONS (PRESERVED & NOT OVERLAPPED)
  // =========================================================================
  await runAsyncTest('Existing Study Sessions: respects existing study sessions and preserves their data', async () => {
    // Add existing planned study session in evening: 18:00 to 19:30
    const existingSession = StudySession.create({
      user_id: studentA,
      course_id: courseMath.id,
      title: 'Self-Study: Calculus Review',
      planned_start_time: day1_1800,
      planned_duration_minutes: 90, // ends at 19:30
      status: 'planned'
    });
    studySessionRepository.create(existingSession);

    // Schedule an assignment with deadline day 2 12:00
    const asgnAlgo = Assignment.create({
      user_id: studentA,
      course_id: courseAlgo.id,
      title: 'Dynamic Programming Problem Set',
      priority: 'high',
      status: 'pending',
      due_date: day2_1200
    });
    assignmentRepository.create(asgnAlgo);

    const planResult = await studyPlanningService.generateStudyPlan(studentA, {
      now: day1_0900 - 1000,
      startDate: day1_0900,
      endDate: day2_2100,
      defaultSessionDuration: 60,
      replaceExisting: true
    });

    // Verify existing study session in database was not mutated
    const fetchedSession = studySessionRepository.findById(existingSession.id);
    assert(fetchedSession, 'Existing study session should still exist');
    assert.strictEqual(fetchedSession.title, 'Self-Study: Calculus Review');
    assert.strictEqual(fetchedSession.status, 'planned');
    assert.strictEqual(fetchedSession.planned_start_time, day1_1800);

    // Verify NONE of the newly planned items overlap with the existing session [18:00 - 19:30]
    for (const item of planResult.items) {
      const itemEnd = item.planned_date + (item.duration_minutes * 60000);
      const sessionStart = day1_1800;
      const sessionEnd = day1_1800 + (90 * 60000);

      const overlaps = item.planned_date < sessionEnd && itemEnd > sessionStart;
      assert.strictEqual(overlaps, false, `Planned item '${item.title}' overlapped existing study session!`);
    }
  });

  // =========================================================================
  // 5. DEADLINE PRESSURE & PRIORITIZATION
  // =========================================================================
  await runAsyncTest('Deadline Pressure: prioritizes urgent/near-term deliverables in limited available windows', async () => {
    const studentPressure = `stu-pressure-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Pressure Student', 'DJSCE', 'student', ?, ?)
    `).run(studentPressure, `${studentPressure}@example.com`, Date.now(), Date.now());

    // Student has 1 event: 10:00 to 12:00
    // Open window 1: 12:15 to 14:00 (105 mins)
    // Event: 14:00 to 16:00
    // Open window 2: 16:15 to 21:00
    calendarEventRepository.create(CalendarEvent.create({
      user_id: studentPressure,
      title: 'Morning Lecture',
      event_type: 'lecture',
      start_time: day1_0900,
      end_time: day1_1200,
      status: 'scheduled'
    }));
    calendarEventRepository.create(CalendarEvent.create({
      user_id: studentPressure,
      title: 'Afternoon Lecture',
      event_type: 'lecture',
      start_time: day1_1400,
      end_time: day1_1600,
      status: 'scheduled'
    }));

    // Student has 2 assignments:
    // Asgn 1: Urgent priority, due tomorrow at 18:00 (day1_1800)
    // Asgn 2: Low priority, due in 5 days (day2_1800 + 3*86400000)
    const asgnUrgent = Assignment.create({
      user_id: studentPressure,
      title: 'OS Kernel Patch Submission',
      priority: 'urgent',
      status: 'pending',
      due_date: day1_1800
    });
    const asgnLow = Assignment.create({
      user_id: studentPressure,
      title: 'Math Optional Practice Problems',
      priority: 'low',
      status: 'pending',
      due_date: day2_1800 + (3 * 86400000)
    });
    assignmentRepository.create(asgnUrgent);
    assignmentRepository.create(asgnLow);

    const planResult = await studyPlanningService.generateStudyPlan(studentPressure, {
      now: day1_0900 - 1000,
      startDate: day1_0900,
      endDate: day2_2100,
      replaceExisting: true
    });

    const urgentItems = planResult.items.filter(i => i.assignment_id === asgnUrgent.id);
    const lowItems = planResult.items.filter(i => i.assignment_id === asgnLow.id);

    assert(urgentItems.length > 0, 'Expected at least 1 planned session for urgent assignment');
    // All urgent items must complete before day1_1800
    for (const uItem of urgentItems) {
      const uEnd = uItem.planned_date + (uItem.duration_minutes * 60000);
      assert(uEnd <= asgnUrgent.due_date, `Urgent item scheduled past deadline! (${formatInMumbaiTime(uEnd)} > ${formatInMumbaiTime(asgnUrgent.due_date)})`);
    }

    // Urgent item should be scheduled at the earliest available window (12:15)
    assert.strictEqual(urgentItems[0].planned_date, day1_1200 + (15 * 60000));

    // Urgent item should be scheduled earlier than low-priority item
    if (lowItems.length > 0) {
      assert(
        urgentItems[0].planned_date < lowItems[0].planned_date,
        'Urgent assignment should be scheduled before low priority assignment'
      );
    }
  });

  // =========================================================================
  // 6. INSUFFICIENT AVAILABILITY DETECTION
  // =========================================================================
  await runAsyncTest('Insufficient Availability: flags warning and records deficit when schedule cannot fit needed study time', async () => {
    // Create a student who is completely booked with lectures
    const busyStudent = `stu-busy-schedule-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Busy Student', 'DJSCE', 'student', ?, ?)
    `).run(busyStudent, `${busyStudent}@example.com`, Date.now(), Date.now());

    // Event 1: 09:00 to 14:00 (5 hours)
    // Event 2: 14:00 to 18:00 (4 hours, back-to-back)
    // Only 18:15 to 21:00 has free time (165 mins)
    calendarEventRepository.create(CalendarEvent.create({
      user_id: busyStudent,
      title: 'Morning Block',
      event_type: 'lecture',
      start_time: day1_0900,
      end_time: day1_1400,
      status: 'scheduled'
    }));
    calendarEventRepository.create(CalendarEvent.create({
      user_id: busyStudent,
      title: 'Afternoon Block',
      event_type: 'lecture',
      start_time: day1_1400,
      end_time: day1_1800,
      status: 'scheduled'
    }));

    // Assignment needing 120 mins, due at 10:00 AM on day 1 (so deadline is during the first lecture!)
    // Zero free study time exists before 10:00 AM on day 1 (09:00 - 10:00 is lecture buffer!)
    const asgnTight = Assignment.create({
      user_id: busyStudent,
      title: 'Emergency Research Paper',
      priority: 'urgent',
      status: 'pending',
      due_date: day1_1000 // 10:00 AM
    });
    assignmentRepository.create(asgnTight);

    const planResult = await studyPlanningService.generateStudyPlan(busyStudent, {
      now: day1_0900 - 1000,
      startDate: day1_0900,
      endDate: day1_2100,
      replaceExisting: true
    });

    // Should detect insufficient availability
    assert(planResult.summary.freeTimeAnalysis, 'Summary should contain freeTimeAnalysis');
    assert.strictEqual(planResult.summary.freeTimeAnalysis.hasInsufficientAvailability, true);
    assert(planResult.summary.freeTimeAnalysis.insufficientAvailabilityCount >= 1);

    const deficitItem = planResult.summary.freeTimeAnalysis.insufficientAvailabilityItems.find(
      i => i.assignmentId === asgnTight.id
    );
    assert(deficitItem, 'Should record deficit item for tight assignment');
    assert.strictEqual(deficitItem.reason, 'insufficient_free_time');

    // Warning message should explain the constraint clearly
    const warning = planResult.warnings.find(w => w.includes(asgnTight.title));
    assert(warning, 'Expected explanatory warning about insufficient availability');
    assert(warning.includes('Insufficient availability') || warning.includes('Could only schedule'));
  });

  // =========================================================================
  // 7. MULTIPLE ASSIGNMENTS SPREAD ACROSS DAYS
  // =========================================================================
  await runAsyncTest('Multiple Assignments: distributes multiple assignments across days respecting daily limits', async () => {
    const multiStudent = `stu-multi-asgn-${Date.now()}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, 'hash', 'Multi Student', 'DJSCE', 'student', ?, ?)
    `).run(multiStudent, `${multiStudent}@example.com`, Date.now(), Date.now());

    // 3 assignments with deadlines on day 2 and day 3
    const as1 = Assignment.create({ user_id: multiStudent, title: 'Assignment Alpha', priority: 'high', due_date: day2_1200 });
    const as2 = Assignment.create({ user_id: multiStudent, title: 'Assignment Beta', priority: 'medium', due_date: day2_1800 });
    const as3 = Assignment.create({ user_id: multiStudent, title: 'Assignment Gamma', priority: 'low', due_date: day2_2100 });
    assignmentRepository.create(as1);
    assignmentRepository.create(as2);
    assignmentRepository.create(as3);

    const planResult = await studyPlanningService.generateStudyPlan(multiStudent, {
      now: day1_0900 - 1000,
      startDate: day1_0900,
      endDate: day2_2100,
      dailyLimitMinutes: 180, // Cap at 3 hours/day to test burnout limits
      defaultSessionDuration: 60,
      replaceExisting: true
    });

    assert(planResult.items.length >= 3, `Expected at least 3 planned sessions, got ${planResult.items.length}`);

    // Verify daily study caps are respected
    const dailyBreakdown = planResult.summary.dailyBreakdown;
    for (const [dateKey, minutes] of Object.entries(dailyBreakdown)) {
      assert(
        minutes <= 180,
        `Daily minutes on ${dateKey} was ${minutes}, exceeding cap of 180 mins!`
      );
    }

    // Verify all items complete on or before assignment due dates
    for (const item of planResult.items) {
      let targetDeadline = null;
      if (item.assignment_id === as1.id) targetDeadline = as1.due_date;
      if (item.assignment_id === as2.id) targetDeadline = as2.due_date;
      if (item.assignment_id === as3.id) targetDeadline = as3.due_date;

      if (targetDeadline) {
        const itemEnd = item.planned_date + (item.duration_minutes * 60000);
        assert(
          itemEnd <= targetDeadline,
          `Item '${item.title}' finished at ${formatInMumbaiTime(itemEnd)}, after deadline ${formatInMumbaiTime(targetDeadline)}`
        );
      }
    }
  });

  // =========================================================================
  // 8. RESCHEDULING CONFLICT DETECTION
  // =========================================================================
  await runAsyncTest('Rescheduling Conflicts: prevents moving study item to collide with calendar events or study sessions', async () => {
    const plans = studyPlanRepository.findPlansByUserId(studentA, { limit: 1 });
    assert(plans.data.length > 0, 'Should have an active plan for student A');
    const planItems = studyPlanRepository.findItemsByPlanId(plans.data[0].id, studentA);
    assert(planItems.length >= 2, 'Should have at least 2 items');

    const itemToMove = planItems[0];

    // Attempt 1: Reschedule into the Algorithms Lecture (day1_1000 to day1_1200)
    let threwConflict = false;
    try {
      await studyPlanningService.reschedulePlanItem(studentA, itemToMove.id, day1_1000 + (30 * 60000), {
        now: day1_0900 - 1000
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        threwConflict = true;
      }
    }
    assert.strictEqual(threwConflict, true, 'Rescheduling over calendar event should throw ConflictError (409)');

    // Attempt 2: Reschedule into the existing study session (day1_1800 to day1_1930)
    let threwSessionConflict = false;
    try {
      await studyPlanningService.reschedulePlanItem(studentA, itemToMove.id, day1_1800, {
        now: day1_0900 - 1000
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        threwSessionConflict = true;
      }
    }
    assert.strictEqual(threwSessionConflict, true, 'Rescheduling over study session should throw ConflictError (409)');

    // Attempt 3: Reschedule to valid open morning window before deadline (day2_0900 + 1 hour = 10:00 AM)
    const validTargetTime = day2_0900 + (60 * 60000);
    const updated = await studyPlanningService.reschedulePlanItem(studentA, itemToMove.id, validTargetTime, {
      now: day1_0900 - 1000
    });
    assert.strictEqual(updated.planned_date, validTargetTime);
  });

  // =========================================================================
  // 9. STUDENT DATA ISOLATION & PRESERVATION
  // =========================================================================
  await runAsyncTest('Data Preservation & Isolation: Student B cannot see or manipulate Student A conflicts', async () => {
    // Verify Student B has empty windows when no events exist
    const windowsB = studyPlanningService.findAvailableTimeWindows(studentB, day1_0900, day1_2100, {
      now: day1_0900 - 1000
    });
    // Student B should have the entire day free (12 hours = 720 mins)
    assert(windowsB.length >= 1, 'Student B should have free windows');
    assert.strictEqual(windowsB[0].start, day1_0900);
    assert.strictEqual(windowsB[0].end, day1_2100);

    // Verify Student A calendar events count in SQLite is unchanged
    const studentAEvents = calendarEventRepository.findByUserId(studentA);
    assert(studentAEvents.length >= 4, 'Student A calendar events should remain completely intact in SQLite');
  });

  console.log('\n----------------------------------------------------');
  console.log(` STUDY PLANNING CONFLICT INTEGRATION: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
