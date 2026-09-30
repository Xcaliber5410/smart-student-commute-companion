/**
 * End-to-End Planning Workflow Integration Test
 *
 * Validates the complete planning loop:
 * Student -> Course -> Assignment -> Calendar Event -> Study Session ->
 * Reminder Auto-Scheduling -> Calendar Range -> Workload Analysis ->
 * Conflict Detection -> Reminder Trigger -> Status Completion -> Isolation.
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const { getConnection } = require('../db/connection');
const { ReminderRepository } = require('../repositories/ReminderRepository');
const { NotificationRepository } = require('../repositories/NotificationRepository');
const { NotificationService } = require('../services/notificationService');
const { ReminderScheduler } = require('../services/reminderScheduler');
const { parseMumbaiTimeToEpoch } = require('../utils/timezone');

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

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

console.log('====================================================');
console.log(' Running End-to-End Planning Workflow Integration Tests');
console.log('====================================================\n');

const app = createApp();
let server = null;
let port = 0;

const db = getConnection();
const remRepo = new ReminderRepository(db);
const notifRepo = new NotificationRepository(db);
const notifSvc = new NotificationService(notifRepo);
const scheduler = new ReminderScheduler(remRepo, notifSvc, null, db);

const testRunId = Date.now();
const student1Email = `student1-plan-${testRunId}@example.com`;
const student2Email = `student2-plan-${testRunId}@example.com`;
const password = 'Password@123';

let token1 = null;
let token2 = null;
let user1Id = null;
let user2Id = null;

let courseId = null;
let assignmentId = null;
let eventId = null;
let studySessionId = null;

// Pinned timestamps in daytime tomorrow (IST)
const tomorrowDate = new Date(Date.now() + 86400000);
const eventStart = parseMumbaiTimeToEpoch('10:00', tomorrowDate);
const eventEnd = parseMumbaiTimeToEpoch('12:00', tomorrowDate); // 120 mins
const studyStart = parseMumbaiTimeToEpoch('11:00', tomorrowDate); // Overlaps event by 60 mins!
const studyDuration = 90; // 11:00 to 12:30
const deadlineTime = parseMumbaiTimeToEpoch('17:00', tomorrowDate);

(async () => {
  try {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // 1. Auth Guard Checks
    await runAsyncTest('Auth Guard: GET /api/calendar/events returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/calendar/events',
        method: 'GET'
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    await runAsyncTest('Auth Guard: GET /api/calendar/range returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/range?start=${eventStart}&end=${eventEnd}`,
        method: 'GET'
      });
      assert.strictEqual(res.status, 401);
    });

    // 2. Authentication setup
    await runAsyncTest('Auth: registers and logs in primary student', async () => {
      const reg = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: student1Email,
        password: 'Password123!',
        full_name: 'Primary Plan Student',
        college_name: 'DJSCE'
      });
      assert.strictEqual(reg.status, 201);

      const login = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: student1Email,
        password: 'Password123!'
      });
      assert.strictEqual(login.status, 200);
      token1 = login.body.token;
      user1Id = login.body.user.id;
      assert.ok(token1);
    });

    await runAsyncTest('Auth: registers and logs in secondary student for isolation tests', async () => {
      const reg = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: student2Email,
        password: 'Password123!',
        full_name: 'Secondary Student',
        college_name: 'DJSCE'
      });
      assert.strictEqual(reg.status, 201);

      const login = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email: student2Email,
        password: 'Password123!'
      });
      assert.strictEqual(login.status, 200);
      token2 = login.body.token;
      user2Id = login.body.user.id;
      assert.ok(token2);
    });

    // 3. Create Course
    await runAsyncTest('Courses: POST /api/academic/courses creates student course', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/academic/courses',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        name: 'Distributed Systems',
        code: 'CS501',
        instructor: 'Dr. Lamport',
        credits: 4
      });
      assert.strictEqual(res.status, 201);
      courseId = (res.body.course || res.body.data || res.body).id;
      assert.ok(courseId);
    });

    // 4. Create Assignment
    await runAsyncTest('Assignments: POST /api/academic/assignments creates assignment deliverable', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/academic/assignments',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        course_id: courseId,
        title: 'Raft Consensus Protocol Implementation',
        due_date: deadlineTime,
        priority: 'urgent',
        reminder_enabled: 1
      });
      assert.strictEqual(res.status, 201);
      assignmentId = (res.body.assignment || res.body.data || res.body).id;
      assert.ok(assignmentId);
    });

    // 5. Create Calendar Event
    await runAsyncTest('Calendar: POST /api/calendar/events creates event and auto-schedules reminder', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/calendar/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        course_id: courseId,
        title: 'Distributed Systems Lecture & Viva',
        event_type: 'lecture',
        location: 'Room 501-A',
        start_time: eventStart,
        end_time: eventEnd,
        reminder_enabled: 1,
        reminder_lead_time_minutes: 30
      });
      assert.strictEqual(res.status, 201);
      eventId = (res.body.event || res.body.data || res.body).id;
      assert.ok(eventId);

      // Verify reminder scheduled
      const reminders = remRepo.findByResource('calendar_event', eventId);
      assert.strictEqual(reminders.length, 1);
      assert.strictEqual(reminders[0].status, 'scheduled');
      assert.strictEqual(reminders[0].scheduled_time, eventStart - (30 * 60 * 1000));
    });

    // 6. Create Study Session
    await runAsyncTest('Study: POST /api/calendar/study-sessions creates study session with reminder', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/calendar/study-sessions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        course_id: courseId,
        assignment_id: assignmentId,
        title: 'Raft State Machine Log Replication Coding',
        notes: 'Implement AppendEntries RPC and heartbeats',
        planned_start_time: studyStart,
        planned_duration_minutes: studyDuration,
        reminder_enabled: 1,
        reminder_lead_time_minutes: 15
      });
      assert.strictEqual(res.status, 201);
      studySessionId = (res.body.studySession || res.body.data || res.body).id;
      assert.ok(studySessionId);

      const reminders = remRepo.findByResource('study_session', studySessionId);
      assert.strictEqual(reminders.length, 1);
      assert.strictEqual(reminders[0].status, 'scheduled');
    });

    // 7. Cross-Student Guard
    await runAsyncTest('Cross-User Guard: Student 2 cannot link event or study session to Student 1 course (403)', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/calendar/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token2}`
        }
      }, {
        course_id: courseId,
        title: 'Unauthorized Event',
        start_time: eventStart,
        end_time: eventEnd
      });
      assert.strictEqual(res.status, 403);
    });

    // 8. Calendar Range Query
    await runAsyncTest('Range Query: GET /api/calendar/range returns unified chronological schedule', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/range?start=${eventStart - 3600000}&end=${deadlineTime + 3600000}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token1}`
        }
      });
      assert.strictEqual(res.status, 200);
      const payload = res.body.data || res.body;
      assert.strictEqual(payload.counts.events, 1);
      assert.strictEqual(payload.counts.studySessions, 1);
      assert.strictEqual(payload.counts.deadlines, 1);
      assert.strictEqual(payload.timeline.length, 3);

      // Chronological order verification
      const times = payload.timeline.map(t => t.startTime);
      for (let i = 1; i < times.length; i++) {
        assert(times[i] >= times[i - 1]);
      }
    });

    // 9. Conflict Detection
    await runAsyncTest('Conflicts: GET /api/calendar/conflicts accurately detects overlapping time blocks', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/conflicts?start=${eventStart - 3600000}&end=${deadlineTime + 3600000}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token1}`
        }
      });
      assert.strictEqual(res.status, 200);
      const payload = res.body.data || res.body;
      assert.strictEqual(payload.hasConflicts, true);
      assert.strictEqual(payload.totalConflicts, 1);

      const conflict = payload.conflicts[0];
      assert.strictEqual(conflict.overlapMinutes, 60); // 11:00 to 12:00 overlap
      assert.strictEqual(conflict.severity, 'high');
    });

    // 10. Workload Analysis
    await runAsyncTest('Workload: GET /api/calendar/workload computes daily commitment and load metrics', async () => {
      const res = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/workload?start=${eventStart - 3600000}&end=${deadlineTime + 3600000}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token1}`
        }
      });
      assert.strictEqual(res.status, 200);
      const payload = res.body.data || res.body;
      assert.strictEqual(payload.summary.totalEvents, 1);
      assert.strictEqual(payload.summary.totalStudySessions, 1);
      assert.strictEqual(payload.summary.totalPlannedStudyMinutes, 90);
      assert.strictEqual(payload.summary.totalAssignmentsDue, 1);
      assert.strictEqual(payload.summary.conflictsCount, 1);
    });

    // 11. Scheduler Execution -> Notification Dispatch
    await runAsyncTest('Scheduler: triggers due planning reminder and dispatches student in-app notification', async () => {
      const reminders = remRepo.findByResource('study_session', studySessionId);
      assert(reminders.length >= 1);
      const rem = reminders[0];

      // Backdate scheduled_time to past to trigger
      db.prepare("UPDATE reminders SET scheduled_time = ? WHERE id = ?")
        .run(Date.now() - 1000, rem.id);

      const report = scheduler.processDueReminders(Date.now());
      assert(report.processedCount >= 1);
      assert(report.triggeredIds.includes(rem.id));

      const notifs = notifRepo.findByUserId(user1Id);
      assert(notifs.some(n => n.title.includes('Raft State Machine Log Replication Coding')));
    });

    // 12. Lifecycle Status Transitions
    await runAsyncTest('Study Status: PATCH /status to completed cancels scheduled reminder', async () => {
      // Re-arm a reminder
      const newStudy = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: '/api/calendar/study-sessions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        title: 'Review Peer PRs',
        planned_start_time: eventStart + (24 * 3600000),
        planned_duration_minutes: 45,
        reminder_enabled: 1
      });
      const tempId = (newStudy.body.studySession || newStudy.body.data || newStudy.body).id;

      // Mark completed
      const patchRes = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/study-sessions/${tempId}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        status: 'completed',
        actual_duration_minutes: 40
      });
      assert.strictEqual(patchRes.status, 200);
      const updatedStudy = patchRes.body.studySession || patchRes.body.data || patchRes.body;
      assert.strictEqual(updatedStudy.status, 'completed');
      assert.strictEqual(updatedStudy.actualDurationMinutes, 40);

      // Verify reminder was cancelled
      const rems = remRepo.findByResource('study_session', tempId);
      assert.strictEqual(rems.length, 1);
      assert.strictEqual(rems[0].status, 'cancelled');
    });

    // 13. Cross-User Access Isolation
    await runAsyncTest('Isolation: Student 2 cannot read or modify Student 1 events or sessions (403)', async () => {
      const getEventRes = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/events/${eventId}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token2}` }
      });
      assert.strictEqual(getEventRes.status, 403);

      const getSessionRes = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/study-sessions/${studySessionId}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token2}` }
      });
      assert.strictEqual(getSessionRes.status, 403);
    });

    // 14. Deletion Cleanup
    await runAsyncTest('Deletion: DELETE removes calendar event and study session cleanly with reminder cleanup', async () => {
      const delEvent = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/events/${eventId}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token1}` }
      });
      assert.strictEqual(delEvent.status, 200);

      const delSession = await makeRequest(server, {
        hostname: '127.0.0.1',
        port,
        path: `/api/calendar/study-sessions/${studySessionId}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token1}` }
      });
      assert.strictEqual(delSession.status, 200);

      assert.strictEqual(remRepo.findByResource('calendar_event', eventId).length, 0);
      assert.strictEqual(remRepo.findByResource('study_session', studySessionId).length, 0);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(` PLANNING INTEGRATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
})();
