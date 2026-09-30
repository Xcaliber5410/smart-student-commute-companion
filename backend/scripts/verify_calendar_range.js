/**
 * Verification Script: Calendar Range & Upcoming Schedule APIs
 */

const assert = require('assert');
const { CalendarEventService } = require('../services/calendarEventService');
const { CalendarEventRepository } = require('../repositories/CalendarEventRepository');
const { StudySessionService } = require('../services/studySessionService');
const { StudySessionRepository } = require('../repositories/StudySessionRepository');
const { AssignmentRepository } = require('../repositories/AssignmentRepository');
const { CourseRepository } = require('../repositories/CourseRepository');
const { CalendarRangeService } = require('../services/calendarRangeService');
const { Course } = require('../models/Course');
const { Assignment } = require('../models/Assignment');
const { ValidationError } = require('../errors');
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
console.log(' Running Calendar Range & Upcoming Schedule Test Suite');
console.log('====================================================\n');

const db = getConnection();
const eventRepo = new CalendarEventRepository(db);
const studyRepo = new StudySessionRepository(db);
const asgnRepo = new AssignmentRepository(db);
const courseRepo = new CourseRepository(db);

const calService = new CalendarEventService(eventRepo, courseRepo);
const studyService = new StudySessionService(studyRepo, courseRepo, asgnRepo);
const rangeService = new CalendarRangeService(eventRepo, studyRepo, asgnRepo, courseRepo, db);

// Fixtures
const user1 = `stu-rng1-${Date.now()}`;
const user2 = `stu-rng2-${Date.now()}`;

db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Range User 1', 'DJSCE', 'student', ?, ?)")
  .run(user1, `${user1}@example.com`, Date.now(), Date.now());
db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Range User 2', 'DJSCE', 'student', ?, ?)")
  .run(user2, `${user2}@example.com`, Date.now(), Date.now());

const now = Date.now();
const tomorrow = now + (24 * 3600 * 1000);
const dayAfter = now + (48 * 3600 * 1000);

(async () => {
  // Populate items for User 1
  const ev1 = await calService.createEvent(user1, {
    title: 'Cloud Computing Lecture',
    event_type: 'lecture',
    start_time: tomorrow,
    end_time: tomorrow + (3600 * 1000)
  });

  const ss1 = await studyService.createSession(user1, {
    title: 'Review Cloud Arch Papers',
    planned_start_time: tomorrow + (2 * 3600 * 1000),
    planned_duration_minutes: 60
  });

  const as1 = Assignment.create({
    user_id: user1,
    title: 'Kubernetes Cluster Setup',
    due_date: dayAfter,
    priority: 'high'
  });
  asgnRepo.create(as1);

  // Populate items for User 2 (for isolation checks)
  const ev2 = await calService.createEvent(user2, {
    title: 'User 2 Private Lecture',
    event_type: 'lecture',
    start_time: tomorrow,
    end_time: tomorrow + (3600 * 1000)
  });

  // 1. Valid range retrieval
  await runAsyncTest('Range: retrieves events, study sessions, and deadlines in window', async () => {
    const schedule = await rangeService.getScheduleInRange(user1, now - 1000, dayAfter + 1000);
    assert.strictEqual(schedule.counts.events, 1);
    assert.strictEqual(schedule.counts.studySessions, 1);
    assert.strictEqual(schedule.counts.deadlines, 1);
    assert.strictEqual(schedule.counts.totalItems, 3);
    assert.strictEqual(schedule.timeline.length, 3);
  });

  // 2. Timeline chronological ordering
  await runAsyncTest('Timeline: items are ordered deterministically by start timestamp', async () => {
    const schedule = await rangeService.getScheduleInRange(user1, now - 1000, dayAfter + 1000);
    const times = schedule.timeline.map(t => t.startTime);
    for (let i = 1; i < times.length; i++) {
      assert(times[i] >= times[i - 1], 'Timeline must be in ascending order of startTime');
    }
  });

  // 3. Range validation
  await runAsyncTest('Validation: rejects range where start >= end with ValidationError', async () => {
    await assert.rejects(async () => {
      await rangeService.getScheduleInRange(user1, dayAfter, tomorrow);
    }, (err) => err instanceof ValidationError && err.statusCode === 400);
  });

  // 4. Upcoming schedule
  await runAsyncTest('Upcoming: retrieves upcoming 7-day schedule window', async () => {
    const upcoming = await rangeService.getUpcomingSchedule(user1, 7);
    assert.strictEqual(upcoming.period, 'upcoming');
    assert.strictEqual(upcoming.windowDays, 7);
    assert(upcoming.counts.totalItems >= 3);
  });

  // 5. Today's schedule
  await runAsyncTest('Today: retrieves schedule for today in IST', async () => {
    const today = await rangeService.getTodaySchedule(user1);
    assert.strictEqual(today.period, 'today');
    assert.strictEqual(today.timezone, 'Asia/Kolkata');
    assert(Array.isArray(today.timeline));
  });

  // 6. Ownership isolation
  await runAsyncTest('Isolation: User 1 schedule does not leak User 2 private items', async () => {
    const schedule1 = await rangeService.getScheduleInRange(user1, now - 1000, dayAfter + 1000);
    assert(!schedule1.timeline.some(t => t.id === ev2.id));

    const schedule2 = await rangeService.getScheduleInRange(user2, now - 1000, dayAfter + 1000);
    assert.strictEqual(schedule2.counts.events, 1);
    assert.strictEqual(schedule2.timeline[0].id, ev2.id);
  });

  console.log('\n----------------------------------------------------');
  console.log(` CALENDAR RANGE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
