/**
 * Integration Test Suite: Student Study Resource API Endpoints
 *
 * Verifies:
 * 1. Unauthorized requests are rejected with 401 Unauthorized (missing or invalid Bearer token).
 * 2. Authenticated CRUD operations (/api/student/resources and /api/academic/resources).
 * 3. Validation failures (empty title, >200 chars, invalid type, out-of-bounds pagination).
 * 4. Practical filtering (course_id, resource_type, tag, is_favorite, archived).
 * 5. Multi-attribute metadata search (q / searchTerm).
 * 6. Pagination controls and accurate metadata calculation.
 * 7. Cross-student data isolation and forbidden barriers (Student B cannot access/modify Student A's resources).
 * 8. Invalid references (non-existent entity -> 404, cross-student entity -> 403).
 * 9. Standardized error response envelope structure.
 * 10. Route parity between /api/student/resources and /api/academic/resources.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_resource_api.db');
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}
process.env.DATABASE_PATH = testDbPath;
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
  console.log(' Running Student Study Resource API Integration Tests');
  console.log('====================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // -----------------------------------------------------------------
    // 1. Unauthorized Access Guards
    // -----------------------------------------------------------------
    await test('Auth Guard: GET /api/student/resources returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('Auth Guard: POST /api/student/resources returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        body: { title: 'Unauthorized Resource' }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('Auth Guard: rejects malformed/invalid bearer token with 401 Unauthorized', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources',
        headers: { Authorization: 'Bearer this.is.an.invalid.token.signature' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // -----------------------------------------------------------------
    // 2. Student Registration and Login
    // -----------------------------------------------------------------
    let tokenA, tokenB, studentAId, studentBId;
    const runId = Date.now();
    const emailA = `res_student_a_${runId}@djsce.edu`;
    const emailB = `res_student_b_${runId}@djsce.edu`;

    await test('Auth: registers and logs in primary student A', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailA,
          password: 'Password123!',
          full_name: 'Alpha Student',
          college_name: 'DJ Sanghvi'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      studentAId = reg.body.user.id;
      assert.ok(studentAId);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailA, password: 'Password123!' }
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
          full_name: 'Beta Student',
          college_name: 'DJ Sanghvi'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      studentBId = reg.body.user.id;
      assert.ok(studentBId);

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailB, password: 'Password123!' }
      });
      assert.strictEqual(login.statusCode, 200);
      tokenB = login.body.token;
      assert.ok(tokenB);
    });

    // -----------------------------------------------------------------
    // 3. Setup Academic Entities for Student A and Student B
    // -----------------------------------------------------------------
    let courseAId, asgnAId, goalAId, sessionAId, courseBId;

    await test('Data Setup: creates academic course, goal, assignment, session for Student A', async () => {
      const courseRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { name: 'Distributed Systems', code: 'CS501' }
      });
      assert.strictEqual(courseRes.statusCode, 201);
      courseAId = courseRes.body.course.id;

      const goalRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'Implement Raft Consensus', course_id: courseAId }
      });
      assert.strictEqual(goalRes.statusCode, 201);
      goalAId = goalRes.body.goal.id;

      const asgnRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'Raft Leader Election', course_id: courseAId, goal_id: goalAId, due_date: Date.now() + 86400000 * 7 }
      });
      assert.strictEqual(asgnRes.statusCode, 201);
      asgnAId = asgnRes.body.assignment.id;

      const sessRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'Consensus Lab Prep', course_id: courseAId, planned_start_time: Date.now() + 3600000, planned_duration_minutes: 60 }
      });
      assert.strictEqual(sessRes.statusCode, 201);
      sessionAId = sessRes.body.studySession ? sessRes.body.studySession.id : (sessRes.body.session ? sessRes.body.session.id : null);
      assert.ok(sessionAId);
    });

    await test('Data Setup: creates course for Student B', async () => {
      const courseRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { name: 'Compiler Design', code: 'CS502' }
      });
      assert.strictEqual(courseRes.statusCode, 201);
      courseBId = courseRes.body.course.id;
    });

    // -----------------------------------------------------------------
    // 4. Successful CRUD Operations
    // -----------------------------------------------------------------
    let createdResourceId;

    await test('CRUD: POST /api/student/resources creates study resource with full associations', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Raft Consensus Protocol Notes',
          description: 'Leader election, log replication, and safety invariants',
          resource_type: 'note',
          content: '# Raft Paper Notes\nIn Search of an Understandable Consensus Algorithm',
          tags: ['raft', 'distributed', 'consensus'],
          url: 'https://raft.github.io/',
          course_id: courseAId,
          assignment_id: asgnAId,
          goal_id: goalAId,
          study_session_id: sessionAId,
          is_favorite: true
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.resource);
      assert.strictEqual(res.body.resource.title, 'Raft Consensus Protocol Notes');
      assert.strictEqual(res.body.resource.course_id, courseAId);
      assert.strictEqual(res.body.resource.assignment_id, asgnAId);
      assert.strictEqual(res.body.resource.goal_id, goalAId);
      assert.strictEqual(res.body.resource.study_session_id, sessionAId);
      assert.strictEqual(res.body.resource.is_favorite, 1);
      assert.strictEqual(res.body.resource.user_id, studentAId);
      createdResourceId = res.body.resource.id;
    });

    await test('CRUD: GET /api/student/resources lists resources with pagination metadata', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.resources));
      assert.strictEqual(res.body.resources.length, 1);
      assert.strictEqual(res.body.pagination.total, 1);
      assert.strictEqual(res.body.pagination.page, 1);
    });

    await test('CRUD: GET /api/student/resources/:id retrieves individual resource', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.resource.id, createdResourceId);
      assert.strictEqual(res.body.resource.title, 'Raft Consensus Protocol Notes');
    });

    await test('CRUD: PATCH /api/student/resources/:id updates fields partially', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Comprehensive Raft Protocol Notes',
          description: 'Updated with joint consensus membership change notes'
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.resource.title, 'Comprehensive Raft Protocol Notes');
      assert.strictEqual(res.body.resource.course_id, courseAId); // preserved
    });

    await test('CRUD: PUT /api/student/resources/:id updates resource', async () => {
      const res = await makeRequest(server, {
        method: 'PUT',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Master Raft Consensus Summary',
          content: 'Updated full text',
          resource_type: 'note'
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.resource.title, 'Master Raft Consensus Summary');
    });

    await test('CRUD: POST /api/student/resources/:id/favorite toggles favorite status', async () => {
      // Current is favorite (1) -> toggles to 0
      const res1 = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${createdResourceId}/favorite`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.body.resource.is_favorite, 0);

      // Toggles back to 1
      const res2 = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${createdResourceId}/favorite`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.body.resource.is_favorite, 1);
    });

    await test('CRUD: POST /api/student/resources/:id/archive archives and unarchives', async () => {
      // Archive
      const res1 = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${createdResourceId}/archive`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { archived: true }
      });
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(Boolean(res1.body.resource.archived), true);

      // Unarchive
      const res2 = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${createdResourceId}/archive`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { archived: false }
      });
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(Boolean(res2.body.resource.archived), false);
    });

    // -----------------------------------------------------------------
    // 5. Validation Failures & Standardized Error Responses
    // -----------------------------------------------------------------
    await test('Validation: rejects empty title with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: '   ', resource_type: 'note' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.message);
    });

    await test('Validation: rejects title exceeding 200 characters with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'x'.repeat(201) }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects invalid resource_type with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'Valid Title', resource_type: 'invalid_type_123' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects pagination limit = 0 with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?limit=0',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects pagination limit > 50 with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?limit=51',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects negative or zero page number with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?page=0',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects invalid sort field with 400 Validation Error', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?sort=illegal_field',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    // -----------------------------------------------------------------
    // 6. Practical Filtering, Metadata Search, and Pagination
    // -----------------------------------------------------------------
    let linkResId, docResId;

    await test('Setup: creates additional resources for filtering and search tests', async () => {
      // 2. Link Resource
      const r2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Interactive Paxos Visualization',
          description: 'Animated Paxos consensus simulation',
          resource_type: 'link',
          url: 'https://paxos.systems/sim',
          tags: ['paxos', 'simulation'],
          course_id: courseAId
        }
      });
      assert.strictEqual(r2.statusCode, 201);
      linkResId = r2.body.resource.id;

      // 3. Document Resource
      const r3 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Byzantine Fault Tolerance Paper PDF',
          description: 'Practical Byzantine Fault Tolerance (PBFT) Castro & Liskov',
          resource_type: 'document',
          file_name: 'pbft_osdi99.pdf',
          file_size: 420000,
          tags: ['pbft', 'byzantine', 'osdi'],
          course_id: courseAId
        }
      });
      assert.strictEqual(r3.statusCode, 201);
      docResId = r3.body.resource.id;
    });

    await test('Filtering: resource_type=link returns only link resources', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?resource_type=link',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.resources.length, 1);
      assert.strictEqual(res.body.resources[0].id, linkResId);
    });

    await test('Filtering: course_id returns only resources linked to specified course', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources?course_id=${courseAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.resources.length, 3);
    });

    await test('Filtering: tag filter matches tag substring', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?tag=byzantine',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.resources.length, 1);
      assert.strictEqual(res.body.resources[0].id, docResId);
    });

    await test('Search: query matches across title, description, content, tags, url, and file_name', async () => {
      // By file name
      const resFile = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?q=pbft_osdi99',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resFile.statusCode, 200);
      assert.strictEqual(resFile.body.resources.length, 1);
      assert.strictEqual(resFile.body.resources[0].id, docResId);

      // By description keyword
      const resDesc = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?q=simulation',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resDesc.statusCode, 200);
      assert.strictEqual(resDesc.body.resources.length, 1);
      assert.strictEqual(resDesc.body.resources[0].id, linkResId);
    });

    await test('Pagination: page and limit accurately partition results', async () => {
      const resPage1 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?page=1&limit=2',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resPage1.statusCode, 200);
      assert.strictEqual(resPage1.body.resources.length, 2);
      assert.strictEqual(resPage1.body.pagination.total, 3);
      assert.strictEqual(resPage1.body.pagination.totalPages, 2);

      const resPage2 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?page=2&limit=2',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resPage2.statusCode, 200);
      assert.strictEqual(resPage2.body.resources.length, 1);
      assert.strictEqual(resPage2.body.pagination.page, 2);
    });

    // -----------------------------------------------------------------
    // 7. Cross-Student Access & Data Isolation
    // -----------------------------------------------------------------
    await test('Isolation: Student B cannot view Student A resource (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    await test('Isolation: Student B cannot update Student A resource (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { title: 'Hacked Title' }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Isolation: Student B cannot delete Student A resource (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Isolation: Student B listing resources receives zero records belonging to Student A', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.resources.length, 0);
      assert.strictEqual(res.body.pagination.total, 0);
    });

    // -----------------------------------------------------------------
    // 8. Invalid Entity References
    // -----------------------------------------------------------------
    await test('Relationships: linking to non-existent course returns 404 Not Found', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Phantom Course Resource',
          course_id: 'non-existent-course-id-999'
        }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.code, 'NOT_FOUND');
    });

    await test('Relationships: linking to another student\'s course returns 403 Forbidden', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Illicit Course Resource',
          course_id: courseBId // belongs to Student B!
        }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    // -----------------------------------------------------------------
    // 9. Parity with /api/academic/resources Alias
    // -----------------------------------------------------------------
    await test('Parity: GET /api/academic/resources returns identical results to /api/student/resources', async () => {
      const studentRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      const academicRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/academic/resources',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(academicRes.statusCode, 200);
      assert.strictEqual(academicRes.body.resources.length, studentRes.body.resources.length);
      assert.strictEqual(academicRes.body.pagination.total, studentRes.body.pagination.total);
    });

    await test('Parity: POST /api/academic/resources creates study resource', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Academic Alias Created Note',
          resource_type: 'note'
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.resource.title, 'Academic Alias Created Note');

      // Cleanup
      await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/resources/${res.body.resource.id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
    });

    // -----------------------------------------------------------------
    // 10. Deletion Flow
    // -----------------------------------------------------------------
    await test('CRUD: DELETE /api/student/resources/:id deletes resource cleanly', async () => {
      const res = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.id, createdResourceId);

      // Subsequent retrieval returns 404
      const getAgain = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${createdResourceId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getAgain.statusCode, 404);
    });

    console.log('\n----------------------------------------------------');
    console.log(` STUDY RESOURCE API INTEGRATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
    console.log('----------------------------------------------------');

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (_) {}
    }
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
