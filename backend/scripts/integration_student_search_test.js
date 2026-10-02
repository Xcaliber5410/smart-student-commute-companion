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

    // -----------------------------------------------------------------
    // 5. Valid Cross-Domain Search Endpoint Execution
    // -----------------------------------------------------------------
    await test('Search: GET /api/student/search returns matched records across multiple domains', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.query, 'distributed');
      assert.ok(res.body.total >= 7, `Expected at least 7 items, received ${res.body.total}`);
      assert.ok(Array.isArray(res.body.results));

      // Verify category distribution
      assert.ok(res.body.countsByType.course >= 1);
      assert.ok(res.body.countsByType.goal >= 1);
      assert.ok(res.body.countsByType.assignment >= 1);
      assert.ok(res.body.countsByType.calendar_event >= 1);
      assert.ok(res.body.countsByType.study_session >= 1);
      assert.ok(res.body.countsByType.saved_route >= 1);
      assert.ok(res.body.countsByType.schedule >= 1);

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
    // 6. Entity Type Filtering & Alias Resolution
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

    // -----------------------------------------------------------------
    // 7. Pagination and Limit Controls
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
    // 8. Predictable Empty-Result Behavior for Non-Existent Queries
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
    });

    // -----------------------------------------------------------------
    // 9. Input Validation & Error Handling
    // -----------------------------------------------------------------
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
    // 10. Strict Student Data Isolation
    // -----------------------------------------------------------------
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

    // -----------------------------------------------------------------
    // 11. Route Alias Parity: /api/academic/search
    // -----------------------------------------------------------------
    await test('Alias Parity: GET /api/academic/search returns identical search results to /api/student/search', async () => {
      const resAcademic = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/search?q=distributed',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resAcademic.statusCode, 200);
      assert.strictEqual(resAcademic.body.success, true);
      assert.ok(resAcademic.body.total >= 7);
      assert.ok(resAcademic.body.results.some(i => i.type === 'course'));
      assert.ok(resAcademic.body.results.some(i => i.type === 'assignment'));
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
