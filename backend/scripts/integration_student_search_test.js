/**
 * Unified Student Search API Integration Test Suite
 *
 * Verifies the authenticated search endpoint:
 * 1. Unauthenticated requests are rejected with 401 Unauthorized.
 * 2. Authenticated student with empty query returns clean zero-state payload.
 * 3. Valid cross-domain search returns matches across multiple entity types.
 * 4. Normalized search result contract and course context enrichment.
 * 5. Entity type filtering and alias resolution (e.g. types=course,tasks).
 * 6. Pagination, limit, and offset controls.
 * 7. Predictable empty-result behavior on unmatched queries.
 * 8. Validation errors on invalid parameters (types, length, negative bounds).
 * 9. Strict authenticated student scoping and zero cross-user data bleeding.
 * 10. Route alias parity between /api/student/search and /api/academic/search.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_student_search_api.db');
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { initDb } = require('../db/database');
const { closeConnection } = require('../db/connection');
const { createApp } = require('../app');
const { searchAnalyticsService } = require('../services/searchAnalyticsService');
const { studentSearchService } = require('../services/studentSearchService');
const { notificationRepository } = require('../repositories/NotificationRepository');

function makeRequest(server, { method, path: reqPath, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };

    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: reqPath,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            parsed = raw;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failedTests++;
  }
}

async function run() {
  console.log('====================================================');
  console.log(' Running Unified Student Search API Integration Tests');
  console.log('====================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // -----------------------------------------------------------------
    // 1. Unauthenticated Access Guard
    // -----------------------------------------------------------------
    await test('Auth Guard: GET /api/student/search returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    // -----------------------------------------------------------------
    // 2. Authentication Setup for Primary Student & Foreign Student
    // -----------------------------------------------------------------
    let tokenA, tokenB, studentAId, studentBId;
    const runId = Date.now();
    const emailA = `search_student_a_${runId}@djsce.edu`;
    const emailB = `search_student_b_${runId}@djsce.edu`;

    await test('Auth: registers and logs in primary student A', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailA,
          password: 'Password123!',
          full_name: 'Student Searcher Alpha',
          college_name: 'DJ Sanghvi College'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      studentAId = reg.body.user.id;
      assert.ok(studentAId);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: emailA,
          password: 'Password123!'
        }
      });
      assert.strictEqual(login.statusCode, 200);
      tokenA = login.body.token;
      assert.ok(tokenA);
    });

    await test('Auth: registers and logs in second student B for isolation tests', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailB,
          password: 'Password123!',
          full_name: 'Student Searcher Beta',
          college_name: 'DJ Sanghvi College'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      studentBId = reg.body.user.id;
      assert.ok(studentBId);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: {
          email: emailB,
          password: 'Password123!'
        }
      });
      assert.strictEqual(login.statusCode, 200);
      tokenB = login.body.token;
      assert.ok(tokenB);
    });

    // -----------------------------------------------------------------
    // 3. Empty Query Handling
    // -----------------------------------------------------------------
    await test('Empty State: returns clean, zeroed search response without errors', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.query, '');
      assert.strictEqual(res.body.total, 0);
      assert.strictEqual(res.body.results.length, 0);
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.total, 0);
      assert.strictEqual(res.body.pagination.hasMore, false);
    });

    // -----------------------------------------------------------------
    // 4. Seed Comprehensive Student Domain Records for Student A
    // -----------------------------------------------------------------
    let courseAId, goalAId;

    await test('Data Setup: creates course for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          name: 'Distributed Systems & Cloud',
          code: 'CS401',
          instructor: 'Dr. Tanenbaum',
          color: '#4F46E5',
          credits: 4
        }
      });
      assert.strictEqual(res.statusCode, 201);
      courseAId = res.body.course.id;
    });

    await test('Data Setup: creates goal for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Systems Master Project',
          description: 'Build a distributed raft consensus engine',
          course_id: courseAId,
          target_date: Date.now() + 86400000 * 30
        }
      });
      assert.strictEqual(res.statusCode, 201);
      goalAId = res.body.goal.id;
    });

    await test('Data Setup: creates assignment for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          title: 'Distributed Consensus Lab 1',
          description: 'Implement RPC protocol for leader election',
          due_date: Date.now() + 86400000 * 5,
          priority: 'urgent',
          goal_id: goalAId
        }
      });
      assert.strictEqual(res.statusCode, 201);
    });

    await test('Data Setup: creates calendar event for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/events',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          title: 'Distributed Systems Midterm Review',
          description: 'Lecture Hall 401 review session',
          location: 'Lab Building 4',
          event_type: 'exam',
          start_time: Date.now() + 86400000 * 2,
          end_time: Date.now() + 86400000 * 2 + 7200000
        }
      });
      assert.strictEqual(res.statusCode, 201);
    });

    await test('Data Setup: creates study session for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          goal_id: goalAId,
          title: 'Distributed Storage Deep Dive',
          notes: 'Read Paxos and Raft papers chapter 4',
          planned_start_time: Date.now() + 3600000,
          planned_duration_minutes: 90
        }
      });
      assert.strictEqual(res.statusCode, 201);
    });

    await test('Data Setup: creates saved route for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/saved-routes',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          name: 'Fast Track to Distributed Lab',
          origin: 'Andheri Station',
          destination: 'DJSCE Computer Lab',
          preferred_mode: 'metro',
          tags: ['campus', 'fast', 'distributed']
        }
      });
      assert.strictEqual(res.statusCode, 201);
    });

    await test('Data Setup: creates commute schedule for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/schedules',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Systems Morning Commute',
          origin: 'Borivali West',
          destination: 'DJSCE Vile Parle',
          target_arrival_time: '08:45',
          days_of_week: ['Mon', 'Wed', 'Fri']
        }
      });
      assert.strictEqual(res.statusCode, 201);
    });

    let notifAId;
    await test('Data Setup: creates notification for Student A', async () => {
      const notif = notificationRepository.create({
        user_id: studentAId,
        title: 'Distributed Systems Hall Pass Ready',
        message: 'Download hall ticket for CS401 exam hall session',
        type: 'system',
        priority: 'high'
      });
      assert.ok(notif && notif.id);
      notifAId = notif.id;
    });

    let reminderAId;
    await test('Data Setup: creates reminder for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/reminders',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Consensus Project Reminder',
          message: 'Finish Raft leader election implementation',
          scheduled_time: Date.now() + 3600000,
          reminder_type: 'custom'
        }
      });
      assert.strictEqual(res.statusCode, 201);
      reminderAId = res.body.reminder.id;
    });

    let resourceAId;
    await test('Data Setup: creates study resource for Student A', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Systems Raft Consensus Guide',
          description: 'Comprehensive breakdown of Raft protocol RPC replication and safety properties',
          resource_type: 'reference',
          course_id: courseAId,
          goal_id: goalAId,
          tags: ['distributed', 'raft', 'consensus', 'guide']
        }
      });
      assert.strictEqual(res.statusCode, 201);
      resourceAId = res.body.resource.id;
    });

    // -----------------------------------------------------------------
    // 5. Valid Cross-Domain Search Endpoint Execution Across All 10 Types
    // -----------------------------------------------------------------
    await test('Search: GET /api/student/search returns matched records across all 10 student domain types', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.query, 'distributed');
      assert.ok(res.body.total >= 10, `Expected at least 10 items, received ${res.body.total}`);
      assert.ok(Array.isArray(res.body.results));

      // Verify category distribution across all 10 domains
      assert.ok(res.body.countsByType.course >= 1, 'Should find course');
      assert.ok(res.body.countsByType.goal >= 1, 'Should find goal');
      assert.ok(res.body.countsByType.assignment >= 1, 'Should find assignment');
      assert.ok(res.body.countsByType.calendar_event >= 1, 'Should find calendar event');
      assert.ok(res.body.countsByType.study_session >= 1, 'Should find study session');
      assert.ok(res.body.countsByType.study_resource >= 1, 'Should find study resource');
      assert.ok(res.body.countsByType.saved_route >= 1, 'Should find saved route');
      assert.ok(res.body.countsByType.schedule >= 1, 'Should find schedule');
      assert.ok(res.body.countsByType.notification >= 1, 'Should find notification');
      assert.ok(res.body.countsByType.reminder >= 1, 'Should find reminder');

      // Verify normalized item structure
      for (const item of res.body.results) {
        assert.ok(item.id, 'Item must have id');
        assert.ok(item.type, 'Item must have type');
        assert.ok(item.title, 'Item must have title');
        assert.ok(typeof item.relevanceScore === 'number');
        assert.ok(item.url, 'Item must have url');
        assert.ok(item.metadata, 'Item must have metadata');
      }
    });

    // -----------------------------------------------------------------
    // 6. Realistic Entity-Specific Searches
    // -----------------------------------------------------------------
    await test('Scenario: searching for a course/subject by code and title', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=CS401',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      const courseMatch = res.body.results.find(r => r.type === 'course');
      assert.ok(courseMatch, 'Must find course by code');
      assert.strictEqual(courseMatch.metadata.code, 'CS401');
      assert.strictEqual(courseMatch.title, 'Distributed Systems & Cloud');
    });

    await test('Scenario: searching for an assignment/task by descriptive content', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=RPC+protocol',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      const asgnMatch = res.body.results.find(r => r.type === 'assignment');
      assert.ok(asgnMatch, 'Must find assignment by description');
      assert.strictEqual(asgnMatch.title, 'Distributed Consensus Lab 1');
    });

    await test('Scenario: searching for a calendar event', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Midterm+Review',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      const eventMatch = res.body.results.find(r => r.type === 'calendar_event');
      assert.ok(eventMatch, 'Must find calendar event');
      assert.strictEqual(eventMatch.title, 'Distributed Systems Midterm Review');
    });

    await test('Scenario: searching for a goal', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Raft+consensus+engine',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      const goalMatch = res.body.results.find(r => r.type === 'goal');
      assert.ok(goalMatch, 'Must find goal by description');
      assert.strictEqual(goalMatch.title, 'Distributed Systems Master Project');
    });

    await test('Scenario: searching for other student entities (study session, schedule, route, notification, reminder)', async () => {
      // 1. Study Session
      const sessionRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Paxos',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(sessionRes.body.results.some(r => r.type === 'study_session'));

      // 2. Saved Route
      const routeRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Andheri+Station',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(routeRes.body.results.some(r => r.type === 'saved_route'));

      // 3. Commute Schedule
      const schedRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Borivali+West',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(schedRes.body.results.some(r => r.type === 'schedule'));

      // 4. Notification
      const notifRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Hall+Pass',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(notifRes.body.results.some(r => r.type === 'notification'));

      // 5. Reminder
      const reminderRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Consensus+Project+Reminder',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(reminderRes.body.results.some(r => r.type === 'reminder'));
    });

    await test('Scenario: searching for a study resource by tag and description', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=RPC+replication',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      const resMatch = res.body.results.find(r => r.type === 'study_resource');
      assert.ok(resMatch, 'Must find study resource by description');
      assert.strictEqual(resMatch.title, 'Distributed Systems Raft Consensus Guide');
      assert.ok(resMatch.course, 'Study resource must include course context');
      assert.strictEqual(resMatch.course.id, courseAId);
      assert.strictEqual(resMatch.metadata.resourceType, 'reference');
    });

    await test('Scenario: mixed resource + academic search results with ranking', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Consensus',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      const types = new Set(res.body.results.map(r => r.type));
      assert.ok(types.has('study_resource'), 'Should include study_resource');
      assert.ok(types.has('assignment') || types.has('goal'), 'Should include academic entity');
      for (let i = 0; i < res.body.results.length - 1; i++) {
        assert.ok(res.body.results[i].relevanceScore >= res.body.results[i + 1].relevanceScore);
      }
    });

    await test('Scenario: partial match searching matches prefixes and tokens', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distrib',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.total >= 5, 'Prefix distrib should match multiple entities');
    });

    // -----------------------------------------------------------------
    // 7. Scoping and Filtering Controls
    // -----------------------------------------------------------------
    await test('Filtering: GET /api/student/search?types=course,tasks returns only course and assignment', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&types=course,tasks',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.every(i => i.type === 'course' || i.type === 'assignment'));
      assert.ok(res.body.results.some(i => i.type === 'course'));
      assert.ok(res.body.results.some(i => i.type === 'assignment'));
    });

    await test('Filtering: GET /api/student/search?types=resources returns only study resources', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&types=resources',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      assert.ok(res.body.results.every(i => i.type === 'study_resource'));
    });

    await test('Filtering: GET /api/student/search?types=notifications,reminders returns only alerts', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&types=notifications,reminders',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 2);
      assert.ok(res.body.results.every(i => i.type === 'notification' || i.type === 'reminder'));
    });

    await test('Filtering: courseId scope restricts matches to course-associated records', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/search?q=distributed&courseId=${courseAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length > 0);
      // Non-course items like transit schedules and saved routes should NOT be included
      assert.ok(res.body.results.every(i => i.type !== 'schedule' && i.type !== 'saved_route'));
    });

    await test('Filtering: status filter applies to assignments', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&status=urgent&types=assignment',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      assert.ok(res.body.results.every(i => i.type === 'assignment'));
    });

    // -----------------------------------------------------------------
    // 8. Pagination and Limit Controls
    // -----------------------------------------------------------------
    await test('Pagination: respects limit and offset with consistent metadata', async () => {
      const page1 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&limit=2&offset=0',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(page1.statusCode, 200);
      assert.strictEqual(page1.body.limit, 2);
      assert.strictEqual(page1.body.offset, 0);
      assert.strictEqual(page1.body.results.length, 2);
      assert.strictEqual(page1.body.pagination.hasMore, true);

      const page2 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&limit=2&offset=2',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(page2.statusCode, 200);
      assert.strictEqual(page2.body.offset, 2);
      assert.strictEqual(page2.body.results.length, 2);

      const page1Ids = new Set(page1.body.results.map(r => r.id));
      for (const item of page2.body.results) {
        assert.strictEqual(page1Ids.has(item.id), false, 'Page 2 should not repeat Page 1 items');
      }
    });

    // -----------------------------------------------------------------
    // 9. Predictable Empty-Result Behavior
    // -----------------------------------------------------------------
    await test('No Results: returns empty result set for unmatched queries', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=NonExistentTermXYZ999',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.total, 0);
      assert.strictEqual(res.body.results.length, 0);
      assert.strictEqual(res.body.pagination.hasMore, false);
      for (const type of Object.keys(res.body.countsByType)) {
        assert.strictEqual(res.body.countsByType[type], 0);
      }
    });

    // -----------------------------------------------------------------
    // 10. Authorization & Security Guards
    // -----------------------------------------------------------------
    await test('Auth Guard: rejects malformed/invalid bearer token with 401 Unauthorized', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: 'Bearer invalid.token.signature' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('Isolation: Student B searching for distributed receives zero records from Student A', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.total, 0);
      assert.strictEqual(res.body.results.length, 0);
    });

    await test('Isolation: Student B cannot search Student A courseId', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/search?q=distributed&courseId=${courseAId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.total, 0);
      assert.strictEqual(res.body.results.length, 0);
    });

    await test('Isolation: Student B study resource is isolated and not visible to Student A', async () => {
      const createRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: {
          title: 'Student B Private Quantum Paper',
          description: 'Quantum physics notes',
          resource_type: 'note',
          tags: ['quantum']
        }
      });
      assert.strictEqual(createRes.statusCode, 201);
      const bResId = createRes.body.resource.id;

      // Student A searching for Quantum receives 0 results
      const resA = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Quantum',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resA.statusCode, 200);
      assert.strictEqual(resA.body.total, 0);

      // Student B searching for Quantum finds their resource
      const resB = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Quantum',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(resB.statusCode, 200);
      assert.strictEqual(resB.body.total, 1);
      assert.strictEqual(resB.body.results[0].id, bResId);
    });

    // -----------------------------------------------------------------
    // 11. Malformed Requests & Boundary Validation
    // -----------------------------------------------------------------
    await test('Validation: rejects negative offset with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&offset=-1',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects limit = 0 with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&limit=0',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects limit > 100 with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&limit=101',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects invalid entity type filter with 400 Bad Request', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&types=unsupported_type',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'BAD_REQUEST');
    });

    await test('Validation: rejects query exceeding 200 characters with 400 Bad Request', async () => {
      const longQuery = 'x'.repeat(201);
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/search?q=${longQuery}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
    });

    // -----------------------------------------------------------------
    // 12. Deterministic Ranking & Ordering
    // -----------------------------------------------------------------
    await test('Ranking: exact title match receives highest relevance score', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Distributed+Systems+%26+Cloud',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.results.length >= 1);
      // Exact title match should be at index 0 with highest score
      assert.strictEqual(res.body.results[0].type, 'course');
      assert.strictEqual(res.body.results[0].title, 'Distributed Systems & Cloud');
    });

    await test('Ranking: results ordering is completely deterministic across repeated calls', async () => {
      const run1 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const run2 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(run1.statusCode, 200);
      assert.strictEqual(run2.statusCode, 200);
      const ids1 = run1.body.results.map(r => r.id);
      const ids2 = run2.body.results.map(r => r.id);
      assert.deepStrictEqual(ids1, ids2, 'Repeated searches must produce identical result ordering');
    });

    // -----------------------------------------------------------------
    // 13. Route Alias Parity: /api/academic/search
    // -----------------------------------------------------------------
    await test('Alias Parity: GET /api/academic/search returns identical search results to /api/student/search', async () => {
      const resAcademic = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resAcademic.statusCode, 200);
      assert.strictEqual(resAcademic.body.success, true);
      assert.ok(resAcademic.body.total >= 10);
      assert.ok(resAcademic.body.results.some(i => i.type === 'course'));
      assert.ok(resAcademic.body.results.some(i => i.type === 'assignment'));
      assert.ok(resAcademic.body.results.some(i => i.type === 'study_resource'));
      assert.ok(resAcademic.body.results.some(i => i.type === 'notification'));
    });

    // -----------------------------------------------------------------
    // 14. Observability & Abuse Safeguards Tests
    // -----------------------------------------------------------------
    await test('Observability: search response attaches rate limit diagnostic headers', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['x-searchratelimit-limit'], 'Must contain limit header');
      assert.ok(res.headers['x-searchratelimit-remaining'] !== undefined, 'Must contain remaining header');
      assert.ok(res.headers['x-searchratelimit-reset'] !== undefined, 'Must contain reset header');
    });

    await test('Safeguard: rejects offset exceeding 1000 with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed&offset=1001',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Abuse Safeguard: bursts exceeding rate limit receive 429 Too Many Requests', async () => {
      searchAnalyticsService.reset();
      searchAnalyticsService.configureSafeguards({ maxRequests: 2, windowMs: 10000 });
      try {
        // First request: OK
        const res1 = await makeRequest(server, {
          method: 'GET',
          path: '/api/student/search?q=distributed',
          headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.strictEqual(res1.statusCode, 200);

        // Second request: OK (limit reached)
        const res2 = await makeRequest(server, {
          method: 'GET',
          path: '/api/student/search?q=distributed',
          headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.strictEqual(res2.statusCode, 200);

        // Third request: Rejected with 429
        const res3 = await makeRequest(server, {
          method: 'GET',
          path: '/api/student/search?q=distributed',
          headers: { Authorization: `Bearer ${tokenA}` }
        });
        assert.strictEqual(res3.statusCode, 429);
        assert.strictEqual(res3.body.code, 'TOO_MANY_REQUESTS');
      } finally {
        // Restore standard limits for subsequent calls
        searchAnalyticsService.configureSafeguards({ maxRequests: 60, windowMs: 60000 });
        searchAnalyticsService.reset();
      }
    });

    await test('Observability Telemetry: analytics summary captures metrics without raw query text leakage', async () => {
      const summary = studentSearchService.getAnalyticsSummary();
      assert.ok(summary.operationalSummary);
      assert.ok(summary.operationalSummary.totalSearches >= 0);
      assert.ok(summary.performanceLatency);
      assert.ok(summary.safeguardStatus.enabled);

      // Verify privacy preservation: summary JSON does not leak search terms
      const summaryStr = JSON.stringify(summary);
      assert.equal(summaryStr.includes('distributed'), false, 'Telemetry summary must not contain raw query terms');
    });

    console.log('\n----------------------------------------------------');
    console.log(` SEARCH API INTEGRATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
    console.log('----------------------------------------------------');

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (_) {}
    }
  }
}

run().catch(err => {
  console.error('Fatal API test error:', err);
  process.exit(1);
});
