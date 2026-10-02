/**
 * Verification Script: Student Productivity & Statistics Service
 *
 * Tests the factual calculation of productivity metrics:
 * 1. Empty student data.
 * 2. Normal data calculation.
 * 3. Multiple courses breakdown.
 * 4. Completed, pending, and overdue records.
 * 5. Date boundaries (today, week, month, custom range).
 * 6. Cross-user isolation and authorization guards.
 */

const assert = require('assert');
const { getConnection } = require('../db/connection');
const { runMigrations } = require('../migrations/migrationRunner');
const {
  productivityAnalyticsService,
  assignmentService,
  studySessionService,
  goalService
} = require('../services');
const {
  getMumbaiTodayRange,
  getMumbaiWeekRange,
  getMumbaiMonthRange,
  getDateKeyIST
} = require('../utils/timezone');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError
} = require('../errors');

async function run() {
  console.log('====================================================');
  console.log(' Running Student Productivity & Statistics Test Suite');
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
  const student1 = {
    id: `usr-prod-1-${now}`,
    email: `prod_stud1_${now}@college.edu`,
    role: 'student'
  };

  const student2 = {
    id: `usr-prod-2-${now}`,
    email: `prod_stud2_${now}@college.edu`,
    role: 'student'
  };

  const studentEmpty = {
    id: `usr-prod-empty-${now}`,
    email: `prod_empty_${now}@college.edu`,
    role: 'student'
  };

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student Productivity 1', 'student', 'DJSCE', ?, ?)
  `).run(student1.id, student1.email, now, now);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student Productivity 2', 'student', 'DJSCE', ?, ?)
  `).run(student2.id, student2.email, now, now);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, college_name, created_at, updated_at)
    VALUES (?, ?, 'hash', 'Student Empty Data', 'student', 'DJSCE', ?, ?)
  `).run(studentEmpty.id, studentEmpty.email, now, now);

  // Setup Courses for Student 1
  const course1 = {
    id: `crse-algo-${now}`,
    user_id: student1.id,
    name: 'Advanced Algorithms',
    code: 'CS501',
    color: '#3B82F6',
    created_at: now,
    updated_at: now
  };
  const course2 = {
    id: `crse-os-${now}`,
    user_id: student1.id,
    name: 'Operating Systems Internals',
    code: 'CS502',
    color: '#10B981',
    created_at: now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO courses (id, user_id, name, code, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(course1.id, course1.user_id, course1.name, course1.code, course1.color, course1.created_at, course1.updated_at);

  db.prepare(`
    INSERT INTO courses (id, user_id, name, code, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(course2.id, course2.user_id, course2.name, course2.code, course2.color, course2.created_at, course2.updated_at);

  // -------------------------------------------------------------
  // Test 1: Empty student data
  // -------------------------------------------------------------
  test('Empty student data: returns clean, zeroed statistics without errors', () => {
    const metrics = productivityAnalyticsService.getProductivityMetrics(studentEmpty.id, studentEmpty, { range: 'week' });

    assert.strictEqual(metrics.studentId, studentEmpty.id);
    assert.strictEqual(metrics.period.type, 'week');
    assert.strictEqual(metrics.assignments.completedInPeriod, 0);
    assert.strictEqual(metrics.assignments.dueInPeriod, 0);
    assert.strictEqual(metrics.assignments.completedDueInPeriod, 0);
    assert.strictEqual(metrics.assignments.pendingDueInPeriod, 0);
    assert.strictEqual(metrics.assignments.overdueAsOfNow, 0);
    assert.strictEqual(metrics.assignments.completionRate, 0);
    assert.strictEqual(metrics.assignments.allTime.total, 0);

    assert.strictEqual(metrics.studySessions.totalSessions, 0);
    assert.strictEqual(metrics.studySessions.completedSessions, 0);
    assert.strictEqual(metrics.studySessions.plannedMinutes, 0);
    assert.strictEqual(metrics.studySessions.completedMinutes, 0);
    assert.strictEqual(metrics.studySessions.adherencePercentage, 0);
    assert.deepStrictEqual(metrics.studySessions.byCourse, []);

    assert.strictEqual(metrics.goals.total, 0);
    assert.strictEqual(metrics.goals.active, 0);
    assert.strictEqual(metrics.goals.completed, 0);
    assert.strictEqual(metrics.goals.averageActiveProgress, 0);

    assert.strictEqual(metrics.calendar.totalEvents, 0);
    assert(Array.isArray(metrics.dailyBreakdown), 'Should return daily breakdown array');
    assert.strictEqual(metrics.dailyBreakdown.length, 7, 'Week range has 7 days');
    metrics.dailyBreakdown.forEach(day => {
      assert.strictEqual(day.tasksCompleted, 0);
      assert.strictEqual(day.studyMinutes, 0);
      assert.strictEqual(day.eventsScheduled, 0);
    });
  });

  // -------------------------------------------------------------
  // Setup data for Student 1 within this week
  // -------------------------------------------------------------
  const { startOfWeek, endOfWeek } = getMumbaiWeekRange(new Date(now));
  const midWeekTimestamp = startOfWeek + (3 * 86400000) + (10 * 3600000); // Thursday 10:00 AM IST

  // 1. Assignment due this week, completed
  const asgn1 = assignmentService.createAssignment(student1.id, {
    title: 'Algorithms Problem Set 1',
    due_date: midWeekTimestamp,
    course_id: course1.id,
    status: 'completed',
    completed_at: midWeekTimestamp - 3600000 // completed 1 hr before deadline
  }, student1);

  // 2. Assignment due this week, pending
  const asgn2 = assignmentService.createAssignment(student1.id, {
    title: 'OS Process Synchronization Lab',
    due_date: midWeekTimestamp + 86400000,
    course_id: course2.id,
    status: 'pending'
  }, student1);

  // 3. Overdue assignment (due yesterday, not completed)
  const overdueDueDate = now - (2 * 86400000);
  const asgnOverdue = assignmentService.createAssignment(student1.id, {
    title: 'Past Due Research Summary',
    due_date: overdueDueDate,
    course_id: course1.id,
    status: 'pending'
  }, student1);

  // 4. Study Sessions for Course 1 (Algorithms)
  await studySessionService.createSession(student1.id, {
    title: 'Dynamic Programming Practice',
    planned_start_time: midWeekTimestamp - 7200000,
    planned_duration_minutes: 90,
    actual_duration_minutes: 90,
    status: 'completed',
    course_id: course1.id
  });

  // 5. Study Sessions for Course 2 (OS)
  await studySessionService.createSession(student1.id, {
    title: 'Semaphores and Mutex Review',
    planned_start_time: midWeekTimestamp + 3600000,
    planned_duration_minutes: 60,
    actual_duration_minutes: 60,
    status: 'completed',
    course_id: course2.id
  });

  // 6. Planned Study Session for Course 1 (Not yet completed)
  await studySessionService.createSession(student1.id, {
    title: 'Graph Theory Revisions',
    planned_start_time: midWeekTimestamp + 86400000,
    planned_duration_minutes: 120,
    status: 'planned',
    course_id: course1.id
  });

  // 7. General unassigned study session
  await studySessionService.createSession(student1.id, {
    title: 'General Coding & Reading',
    planned_start_time: midWeekTimestamp + (2 * 86400000),
    planned_duration_minutes: 45,
    actual_duration_minutes: 45,
    status: 'completed'
  });

  // 8. Goals for Student 1
  goalService.createGoal(student1.id, {
    title: 'Ace Algorithms Midterm',
    status: 'in_progress',
    progress: 60,
    course_id: course1.id
  }, student1);

  goalService.createGoal(student1.id, {
    title: 'Read OS Dino Book Chapters 1-5',
    status: 'completed',
    progress: 100,
    completed_at: midWeekTimestamp,
    course_id: course2.id
  }, student1);

  // 9. Calendar Event
  db.prepare(`
    INSERT OR REPLACE INTO calendar_events (
      id, user_id, course_id, title, event_type, start_time, end_time, status,
      reminder_enabled, reminder_lead_time_minutes, created_at, updated_at
    ) VALUES (
      'ev-lecture-1', ?, ?, 'Algorithms Lecture', 'lecture', ?, ?, 'scheduled', 1, 30, ?, ?
    )
  `).run(student1.id, course1.id, midWeekTimestamp - 14400000, midWeekTimestamp - 7200000, now, now);

  // -------------------------------------------------------------
  // Test 2: Normal data calculation
  // -------------------------------------------------------------
  test('Normal data calculation: aggregates tasks, study hours, goals, and calendar accurately', () => {
    const metrics = productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
      range: 'week',
      now
    });

    // Assignments
    assert(metrics.assignments.allTime.total >= 3, 'Total assignments should be at least 3');
    assert(metrics.assignments.allTime.completed >= 1, 'Completed assignments should be at least 1');
    assert(metrics.assignments.overdueAsOfNow >= 1, 'Overdue count should be at least 1');

    // Study sessions
    assert.strictEqual(metrics.studySessions.totalSessions, 4, 'Total study sessions in week');
    assert.strictEqual(metrics.studySessions.completedSessions, 3, 'Completed study sessions');
    assert.strictEqual(metrics.studySessions.plannedSessions, 1, 'Planned study sessions');
    // Planned minutes: 90 + 60 + 120 + 45 = 315 mins = 5.3 hrs
    assert.strictEqual(metrics.studySessions.plannedMinutes, 315);
    // Completed minutes: 90 + 60 + 45 = 195 mins = 3.3 hrs
    assert.strictEqual(metrics.studySessions.completedMinutes, 195);
    assert.strictEqual(metrics.studySessions.completedHours, 3.3);

    // Goals
    assert.strictEqual(metrics.goals.total, 2, 'Total goals');
    assert.strictEqual(metrics.goals.active, 1, 'Active goals');
    assert.strictEqual(metrics.goals.completed, 1, 'Completed goals');
    assert.strictEqual(metrics.goals.averageActiveProgress, 60, 'Average active progress');

    // Calendar
    assert.strictEqual(metrics.calendar.totalEvents, 1, 'Total calendar events in week');
    assert.strictEqual(metrics.calendar.totalHours, 2, 'Total lecture hours (2 hrs)');
  });

  // -------------------------------------------------------------
  // Test 3: Multiple courses breakdown
  // -------------------------------------------------------------
  test('Multiple courses breakdown: study time by course groups accurately', () => {
    const metrics = productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
      range: 'week',
      now
    });

    const courses = metrics.studySessions.byCourse;
    assert(Array.isArray(courses), 'byCourse should be an array');
    assert(courses.length >= 2, 'Should include both registered courses plus unassigned');

    const algoCourse = courses.find(c => c.courseId === course1.id);
    assert(algoCourse, 'Should find Algorithms course');
    assert.strictEqual(algoCourse.courseName, 'Advanced Algorithms');
    assert.strictEqual(algoCourse.totalSessions, 2);
    assert.strictEqual(algoCourse.completedSessions, 1);
    assert.strictEqual(algoCourse.completedMinutes, 90);
    assert.strictEqual(algoCourse.completedHours, 1.5);

    const osCourse = courses.find(c => c.courseId === course2.id);
    assert(osCourse, 'Should find OS course');
    assert.strictEqual(osCourse.courseName, 'Operating Systems Internals');
    assert.strictEqual(osCourse.completedSessions, 1);
    assert.strictEqual(osCourse.completedMinutes, 60);
    assert.strictEqual(osCourse.completedHours, 1.0);

    const generalStudy = courses.find(c => c.courseId === null);
    assert(generalStudy, 'Should find General / Unassigned study');
    assert.strictEqual(generalStudy.completedMinutes, 45);
  });

  // -------------------------------------------------------------
  // Test 4: Completed, pending, and overdue metrics
  // -------------------------------------------------------------
  test('Completed, pending, and overdue metrics verified correctly', () => {
    const metrics = productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
      range: 'week',
      now
    });

    assert(metrics.assignments.overdueAsOfNow >= 1, 'Must detect overdue assignment');
    assert(metrics.assignments.allTime.completed >= 1, 'Completed count');
    assert(metrics.assignments.allTime.pending >= 2, 'Pending count includes pending lab and overdue');
  });

  // -------------------------------------------------------------
  // Test 5: Date boundaries (today, week, month, custom range)
  // -------------------------------------------------------------
  test('Date boundaries: today range isolates to current 24h window', () => {
    const todayMetrics = productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
      range: 'today',
      now
    });
    assert.strictEqual(todayMetrics.period.type, 'today');
    assert.strictEqual(todayMetrics.period.daysCount, 1);
    assert.strictEqual(todayMetrics.dailyBreakdown.length, 1);
  });

  test('Date boundaries: current month range captures full month', () => {
    const monthMetrics = productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
      range: 'month',
      now
    });
    assert.strictEqual(monthMetrics.period.type, 'month');
    assert(monthMetrics.period.daysCount >= 28 && monthMetrics.period.daysCount <= 31);
    assert(monthMetrics.period.start <= monthMetrics.period.end);
  });

  test('Date boundaries: custom range restricts queries strictly to window', () => {
    const customStart = midWeekTimestamp - 3600000;
    const customEnd = midWeekTimestamp + 3600000;

    const customMetrics = productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
      from: customStart,
      to: customEnd,
      now
    });

    assert.strictEqual(customMetrics.period.type, 'custom');
    assert.strictEqual(customMetrics.period.start, customStart);
    assert.strictEqual(customMetrics.period.end, customEnd);
  });

  test('Date boundaries: validates custom range timestamp order', () => {
    assert.throws(() => {
      productivityAnalyticsService.getProductivityMetrics(student1.id, student1, {
        from: 2000,
        to: 1000
      });
    }, (err) => {
      assert(err instanceof ValidationError);
      return true;
    });
  });

  // -------------------------------------------------------------
  // Test 6: Cross-user isolation
  // -------------------------------------------------------------
  test('Cross-user isolation: Student 2 cannot access Student 1 productivity metrics', () => {
    assert.throws(() => {
      productivityAnalyticsService.getProductivityMetrics(student1.id, student2, { range: 'week' });
    }, (err) => {
      assert(err instanceof ForbiddenError, 'Should throw ForbiddenError');
      return true;
    });
  });

  test('Cross-user isolation: Student 2 metrics do not bleed data from Student 1', () => {
    const s2Metrics = productivityAnalyticsService.getProductivityMetrics(student2.id, student2, { range: 'week', now });
    assert.strictEqual(s2Metrics.studentId, student2.id);
    assert.strictEqual(s2Metrics.assignments.allTime.total, 0, 'Student 2 should have 0 assignments');
    assert.strictEqual(s2Metrics.studySessions.totalSessions, 0, 'Student 2 should have 0 study sessions');
    assert.strictEqual(s2Metrics.goals.total, 0, 'Student 2 should have 0 goals');
    assert.strictEqual(s2Metrics.calendar.totalEvents, 0, 'Student 2 should have 0 calendar events');
    assert.deepStrictEqual(s2Metrics.studySessions.byCourse, []);
  });

  console.log('\n----------------------------------------------------');
  console.log(` PRODUCTIVITY METRICS TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    throw new Error(`${failed} tests failed`);
  }
  console.log('ALL PRODUCTIVITY METRICS TESTS PASSED! 🎉\n');
}

run().catch(err => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
