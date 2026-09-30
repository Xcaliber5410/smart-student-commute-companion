/**
 * Verification Script: Calendar Event Management & Service
 */

const assert = require('assert');
const { CalendarEvent } = require('../models/CalendarEvent');
const { CalendarEventService } = require('../services/calendarEventService');
const { CalendarEventRepository } = require('../repositories/CalendarEventRepository');
const { CourseRepository } = require('../repositories/CourseRepository');
const { Course } = require('../models/Course');
const { ReminderRepository } = require('../repositories/ReminderRepository');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');
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
console.log(' Running Calendar Event Management Test Suite');
console.log('====================================================\n');

const db = getConnection();
const eventRepo = new CalendarEventRepository(db);
const courseRepo = new CourseRepository(db);
const reminderRepo = new ReminderRepository(db);
const service = new CalendarEventService(eventRepo, courseRepo, reminderRepo);

// Test fixtures
const user1 = `stu-cal1-${Date.now()}`;
const user2 = `stu-cal2-${Date.now()}`;

// Ensure users exist
db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Cal User', 'DJSCE', 'student', ?, ?)")
  .run(user1, `${user1}@example.com`, Date.now(), Date.now());
db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at) VALUES (?, ?, 'hash', 'Cal User 2', 'DJSCE', 'student', ?, ?)")
  .run(user2, `${user2}@example.com`, Date.now(), Date.now());

// Create courses for user1 and user2
const courseUser1 = Course.create({ user_id: user1, name: 'Operating Systems', code: 'CS301' });
courseRepo.create(courseUser1);

const courseUser2 = Course.create({ user_id: user2, name: 'Databases', code: 'CS302' });
courseRepo.create(courseUser2);

const baseStart = Date.now() + 3600000;
const baseEnd = baseStart + 3600000; // 1 hour later

let createdEventId = null;

(async () => {
  // 1. Model validation
  runTest('CalendarEvent Model: parses and validates valid event entity', () => {
    const event = CalendarEvent.create({
      user_id: user1,
      title: 'OS Lecture',
      start_time: baseStart,
      end_time: baseEnd,
      event_type: 'lecture',
      location: 'Room 402'
    });
    assert.strictEqual(event.title, 'OS Lecture');
    assert.strictEqual(event.location, 'Room 402');
    assert.strictEqual(event.status, 'scheduled');
    assert.strictEqual(event.durationMinutes, 60);
  });

  runTest('CalendarEvent Model: rejects start_time >= end_time', () => {
    assert.throws(() => {
      new CalendarEvent({
        id: 'test-invalid-time',
        user_id: user1,
        title: 'Invalid Lecture',
        start_time: baseEnd,
        end_time: baseStart
      });
    });
  });

  // 2. Service Creation
  await runAsyncTest('CalendarEventService: creates event with valid attributes for student', async () => {
    const event = await service.createEvent(user1, {
      title: 'Algorithms Seminar',
      description: 'Dynamic Programming deep-dive',
      location: 'Seminar Hall B',
      event_type: 'lecture',
      start_time: baseStart,
      end_time: baseEnd,
      reminder_enabled: 1,
      reminder_lead_time_minutes: 30
    });
    assert(event.id);
    assert.strictEqual(event.user_id, user1);
    assert.strictEqual(event.title, 'Algorithms Seminar');
    assert.strictEqual(event.location, 'Seminar Hall B');
    createdEventId = event.id;
  });

  await runAsyncTest('CalendarEventService: creates event linked to student course', async () => {
    const event = await service.createEvent(user1, {
      course_id: courseUser1.id,
      title: 'OS Lab Examination',
      event_type: 'lab',
      start_time: baseStart + 7200000,
      end_time: baseStart + 10800000
    });
    assert.strictEqual(event.course_id, courseUser1.id);
  });

  // 3. Foreign Key / Cross-Student Course Integrity
  await runAsyncTest('CalendarEventService: rejects linking event to non-existent course with NotFoundError (404)', async () => {
    await assert.rejects(async () => {
      await service.createEvent(user1, {
        course_id: 'non-existent-course-id',
        title: 'Phantom Event',
        start_time: baseStart,
        end_time: baseEnd
      });
    }, (err) => err instanceof NotFoundError && err.statusCode === 404);
  });

  await runAsyncTest('CalendarEventService: rejects linking event to another student course with ForbiddenError (403)', async () => {
    await assert.rejects(async () => {
      await service.createEvent(user1, {
        course_id: courseUser2.id, // User 2's course
        title: 'Hacked Event',
        start_time: baseStart,
        end_time: baseEnd
      });
    }, (err) => err instanceof ForbiddenError && err.statusCode === 403);
  });

  // 4. Invalid Time Range
  await runAsyncTest('CalendarEventService: rejects invalid start_time >= end_time with ValidationError (400)', async () => {
    await assert.rejects(async () => {
      await service.createEvent(user1, {
        title: 'Backwards Event',
        start_time: baseEnd,
        end_time: baseStart
      });
    }, (err) => err instanceof ValidationError && err.statusCode === 400);
  });

  // 5. Read & Ownership
  await runAsyncTest('CalendarEventService: retrieves event for owning student', async () => {
    const fetched = await service.getEventById(user1, createdEventId);
    assert.strictEqual(fetched.id, createdEventId);
    assert.strictEqual(fetched.title, 'Algorithms Seminar');
  });

  await runAsyncTest('CalendarEventService: blocks unauthorized student from reading event (403)', async () => {
    await assert.rejects(async () => {
      await service.getEventById(user2, createdEventId);
    }, (err) => err instanceof ForbiddenError && err.statusCode === 403);
  });

  // 6. Update
  await runAsyncTest('CalendarEventService: updates event attributes successfully', async () => {
    const updated = await service.updateEvent(user1, createdEventId, {
      title: 'Advanced Algorithms Seminar',
      location: 'Auditorium'
    });
    assert.strictEqual(updated.title, 'Advanced Algorithms Seminar');
    assert.strictEqual(updated.location, 'Auditorium');
  });

  // 7. Date Range Retrieval
  await runAsyncTest('CalendarEventService: retrieves events in range matching time window', async () => {
    const rangeEvents = await service.getEventsInRange(user1, baseStart - 1000, baseEnd + 1000);
    assert(rangeEvents.length >= 1);
    assert(rangeEvents.some(e => e.id === createdEventId));
  });

  // 8. Pagination & Filtering
  await runAsyncTest('CalendarEventService: lists student events with pagination and filters', async () => {
    const result = await service.listEvents(user1, {
      page: 1,
      limit: 10,
      search: 'Algorithms'
    });
    assert.strictEqual(result.page, 1);
    assert(result.data.length >= 1);
    assert.strictEqual(result.data[0].id, createdEventId);
  });

  // 9. Deletion
  await runAsyncTest('CalendarEventService: deletes event cleanly', async () => {
    const deleted = await service.deleteEvent(user1, createdEventId);
    assert.strictEqual(deleted, true);

    await assert.rejects(async () => {
      await service.getEventById(user1, createdEventId);
    }, (err) => err instanceof NotFoundError);
  });

  console.log('\n----------------------------------------------------');
  console.log(` CALENDAR SERVICE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
