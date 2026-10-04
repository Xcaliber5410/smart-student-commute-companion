/**
 * Integration Test Suite: Student Study Resource Academic & Planning Workflow Integration
 *
 * Verifies:
 * 1. Course Workflow Integration:
 *    - Linking study resources to courses/subjects.
 *    - Listing resources supporting a course.
 *    - Unlinking resources from a course while preserving the resource entity.
 * 2. Assignment Workflow Integration:
 *    - Linking study materials and reference guides to assignments/tasks.
 *    - Retrieving resources associated with an assignment.
 *    - Unlinking resources from an assignment.
 * 3. Student Goal Workflow Integration:
 *    - Linking supporting resources to student goals.
 *    - Retrieving resources supporting a goal.
 *    - Inclusion of study resources in Goal Work Summary (dashboard aggregation).
 *    - Unlinking resources from a goal.
 * 4. Calendar & Study Session Workflow Integration:
 *    - Linking study session materials to scheduled study sessions.
 *    - Retrieving resources attached to a study session.
 *    - Unlinking resources from a study session.
 * 5. Strict Student Isolation & Authorization Guards:
 *    - Cross-student access is rejected with 403 Forbidden or 404 Not Found.
 *    - Student B cannot link Student A's resources.
 *    - Student B cannot link resources to Student A's entities.
 *    - Student B cannot view or unlink Student A's workflow resources.
 * 6. Transaction Safety & Multi-Entity Atomicity:
 *    - Batch linking fails cleanly and atomically if any resource is missing or belongs to another student.
 * 7. Non-Destructive Workflow Entity Lifecycle (Safe Decoupling):
 *    - Deleting course/assignment/goal/session decouples resource foreign keys to NULL without deleting the study resources.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_resource_workflows.db');
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
  console.log('================================================================');
  console.log(' Running Resource Workflow Integration Tests (Academic & Planning)');
  console.log('================================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    let tokenA, tokenB, studentAId, studentBId;
    const runId = Date.now();
    const emailA = `wkflow_student_a_${runId}@djsce.edu`;
    const emailB = `wkflow_student_b_${runId}@djsce.edu`;

    // -----------------------------------------------------------------
    // Setup Students A & B
    // -----------------------------------------------------------------
    await test('Auth: register and login student A', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailA,
          password: 'Password123!',
          full_name: 'Workflow Student A',
          college_name: 'DJ Sanghvi'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      studentAId = reg.body.user.id;

      const login = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailA, password: 'Password123!' }
      });
      assert.strictEqual(login.statusCode, 200);
      tokenA = login.body.token;
      assert.ok(tokenA);
    });

    await test('Auth: register and login student B (for isolation tests)', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailB,
          password: 'Password123!',
          full_name: 'Workflow Student B',
          college_name: 'DJ Sanghvi'
        }
      });
      assert.strictEqual(reg.statusCode, 201);
      studentBId = reg.body.user.id;

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
    // 1. Course Workflow Integration
    // -----------------------------------------------------------------
    let courseAId, resourceA1Id, resourceA2Id;

    await test('Course Workflow: create course and study resources for student A', async () => {
      const cRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          name: 'Distributed Systems',
          code: 'CS301',
          credits: 4,
          color: '#3498db'
        }
      });
      assert.strictEqual(cRes.statusCode, 201);
      courseAId = cRes.body.course.id;
      assert.ok(courseAId);

      const r1Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Systems Lecture Slides',
          resource_type: 'document',
          url: 'https://materials.djsce.edu/cs301/slides.pdf'
        }
      });
      assert.strictEqual(r1Res.statusCode, 201);
      resourceA1Id = r1Res.body.resource.id;

      const r2Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Raft Consensus Paper',
          resource_type: 'document',
          url: 'https://raft.github.io/raft.pdf'
        }
      });
      assert.strictEqual(r2Res.statusCode, 201);
      resourceA2Id = r2Res.body.resource.id;
    });

    await test('Course Workflow: link resources to course via POST /api/academic/courses/:id/resources', async () => {
      const linkRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          resource_ids: [resourceA1Id, resourceA2Id]
        }
      });
      assert.strictEqual(linkRes.statusCode, 200);
      assert.strictEqual(linkRes.body.success, true);
      assert.strictEqual(linkRes.body.linkedCount, 2);
    });

    await test('Course Workflow: retrieve course resources via GET /api/academic/courses/:id/resources', async () => {
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.success, true);
      assert.strictEqual(getRes.body.resources.length, 2);
      const ids = getRes.body.resources.map(r => r.id);
      assert.ok(ids.includes(resourceA1Id));
      assert.ok(ids.includes(resourceA2Id));
    });

    await test('Course Workflow: unlink resource from course via DELETE /api/academic/courses/:id/resources/:resourceId', async () => {
      const unlinkRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/courses/${courseAId}/resources/${resourceA1Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(unlinkRes.statusCode, 200);
      assert.strictEqual(unlinkRes.body.success, true);
      assert.strictEqual(unlinkRes.body.unlinked, true);

      // Verify course only has resourceA2Id now
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resources.length, 1);
      assert.strictEqual(getRes.body.resources[0].id, resourceA2Id);

      // Verify resourceA1 still exists and can be retrieved directly
      const r1Res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceA1Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(r1Res.statusCode, 200);
      assert.strictEqual(r1Res.body.resource.course_id, null);
    });

    // -----------------------------------------------------------------
    // 2. Assignment Workflow Integration
    // -----------------------------------------------------------------
    let assignmentAId, resourceA3Id;

    await test('Assignment Workflow: create assignment and study resource for student A', async () => {
      const aRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          title: 'Implement Raft Consensus Protocol',
          description: 'Build leader election and log replication',
          due_date: Date.now() + 86400000 * 7,
          priority: 'high'
        }
      });
      assert.strictEqual(aRes.statusCode, 201);
      assignmentAId = aRes.body.assignment.id;
      assert.ok(assignmentAId);

      const r3Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Raft Visualizer Simulator',
          resource_type: 'link',
          url: 'https://thesecretlivesofdata.com/raft/'
        }
      });
      assert.strictEqual(r3Res.statusCode, 201);
      resourceA3Id = r3Res.body.resource.id;
    });

    await test('Assignment Workflow: link resources to assignment via POST /api/academic/assignments/:id/resources', async () => {
      const linkRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/assignments/${assignmentAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          resource_ids: [resourceA2Id, resourceA3Id]
        }
      });
      assert.strictEqual(linkRes.statusCode, 200);
      assert.strictEqual(linkRes.body.success, true);
      assert.strictEqual(linkRes.body.linkedCount, 2);
    });

    await test('Assignment Workflow: retrieve assignment resources via GET /api/academic/assignments/:id/resources', async () => {
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/assignments/${assignmentAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resources.length, 2);
      const ids = getRes.body.resources.map(r => r.id);
      assert.ok(ids.includes(resourceA2Id));
      assert.ok(ids.includes(resourceA3Id));
    });

    await test('Assignment Workflow: unlink resource from assignment via DELETE /api/academic/assignments/:id/resources/:resourceId', async () => {
      const unlinkRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/assignments/${assignmentAId}/resources/${resourceA2Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(unlinkRes.statusCode, 200);
      assert.strictEqual(unlinkRes.body.unlinked, true);

      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/assignments/${assignmentAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resources.length, 1);
      assert.strictEqual(getRes.body.resources[0].id, resourceA3Id);
    });

    // -----------------------------------------------------------------
    // 3. Goal Workflow & Work Summary Integration
    // -----------------------------------------------------------------
    let goalAId, resourceA4Id;

    await test('Goal Workflow: create goal and study resource for student A', async () => {
      const gRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Master Distributed Consensus & Storage',
          course_id: courseAId,
          target_date: Date.now() + 86400000 * 30,
          target_value: 100,
          current_value: 20
        }
      });
      assert.strictEqual(gRes.statusCode, 201);
      goalAId = gRes.body.goal.id;
      assert.ok(goalAId);

      const r4Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Paxos Made Simple Paper',
          resource_type: 'document',
          url: 'https://lamport.azurewebsites.net/pubs/paxos-simple.pdf'
        }
      });
      assert.strictEqual(r4Res.statusCode, 201);
      resourceA4Id = r4Res.body.resource.id;
    });

    await test('Goal Workflow: link resources to goal via POST /api/academic/goals/:id/resources', async () => {
      const linkRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/goals/${goalAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          resource_ids: [resourceA3Id, resourceA4Id]
        }
      });
      assert.strictEqual(linkRes.statusCode, 200);
      assert.strictEqual(linkRes.body.linkedCount, 2);
    });

    await test('Goal Workflow: retrieve goal resources via GET /api/academic/goals/:id/resources', async () => {
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resources.length, 2);
    });

    await test('Goal Workflow: GET /api/academic/goals/:id/work returns supporting study resources in dashboard summary', async () => {
      const workRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}/work`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(workRes.statusCode, 200);
      assert.strictEqual(workRes.body.success, true);
      assert.ok(Array.isArray(workRes.body.resources), 'resources array must be present in goal work summary');
      assert.strictEqual(workRes.body.resources.length, 2);
      const resIds = workRes.body.resources.map(r => r.id);
      assert.ok(resIds.includes(resourceA3Id));
      assert.ok(resIds.includes(resourceA4Id));
    });

    await test('Goal Workflow: unlink resource from goal via DELETE /api/academic/goals/:id/resources/:resourceId', async () => {
      const unlinkRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/goals/${goalAId}/resources/${resourceA3Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(unlinkRes.statusCode, 200);
      assert.strictEqual(unlinkRes.body.unlinked, true);

      const workRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}/work`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(workRes.statusCode, 200);
      assert.strictEqual(workRes.body.resources.length, 1);
      assert.strictEqual(workRes.body.resources[0].id, resourceA4Id);
    });

    // -----------------------------------------------------------------
    // 4. Calendar & Study Session Workflow Integration
    // -----------------------------------------------------------------
    let sessionId, resourceA5Id;

    await test('Study Session Workflow: create study session and resource for student A', async () => {
      const sRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Systems Deep Dive Session',
          course_id: courseAId,
          planned_start_time: Date.now() + 86400000,
          planned_duration_minutes: 120
        }
      });
      assert.strictEqual(sRes.statusCode, 201);
      sessionId = sRes.body.studySession.id;
      assert.ok(sessionId);

      const r5Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Distributed Transactions Cheatsheet',
          resource_type: 'reference',
          content: '2PC, 3PC, Saga Pattern and isolation levels.'
        }
      });
      assert.strictEqual(r5Res.statusCode, 201);
      resourceA5Id = r5Res.body.resource.id;
    });

    await test('Study Session Workflow: link resources via POST /api/calendar/study-sessions/:id/resources', async () => {
      const linkRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/calendar/study-sessions/${sessionId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          resource_ids: [resourceA4Id, resourceA5Id]
        }
      });
      assert.strictEqual(linkRes.statusCode, 200);
      assert.strictEqual(linkRes.body.linkedCount, 2);
    });

    await test('Study Session Workflow: retrieve resources via GET /api/calendar/study-sessions/:id/resources', async () => {
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/calendar/study-sessions/${sessionId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resources.length, 2);
      const ids = getRes.body.resources.map(r => r.id);
      assert.ok(ids.includes(resourceA4Id));
      assert.ok(ids.includes(resourceA5Id));
    });

    await test('Study Session Workflow: unlink resource via DELETE /api/calendar/study-sessions/:id/resources/:resourceId', async () => {
      const unlinkRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/calendar/study-sessions/${sessionId}/resources/${resourceA4Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(unlinkRes.statusCode, 200);
      assert.strictEqual(unlinkRes.body.unlinked, true);

      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/calendar/study-sessions/${sessionId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resources.length, 1);
      assert.strictEqual(getRes.body.resources[0].id, resourceA5Id);
    });

    // -----------------------------------------------------------------
    // 5. Strict Student Isolation & Authorization Guards
    // -----------------------------------------------------------------
    let resourceBId, courseBId;

    await test('Isolation Setup: create resource and course for student B', async () => {
      const rRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: {
          title: 'Student B Private Math Notes',
          resource_type: 'note',
          content: 'Secret calculus equations.'
        }
      });
      assert.strictEqual(rRes.statusCode, 201);
      resourceBId = rRes.body.resource.id;

      const cRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenB}` },
        body: {
          name: 'Calculus I',
          code: 'MATH101',
          credits: 4
        }
      });
      assert.strictEqual(cRes.statusCode, 201);
      courseBId = cRes.body.course.id;
    });

    await test('Auth Guard: Student B cannot view Student A course resources (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Auth Guard: Student B cannot link their resource to Student A course (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { resource_ids: [resourceBId] }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Auth Guard: Student B cannot link Student A resource to Student B course (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/courses/${courseBId}/resources`,
        headers: { Authorization: `Bearer ${tokenB}` },
        body: { resource_ids: [resourceA1Id] }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Auth Guard: Student B cannot view Student A assignment resources (403 Forbidden)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/assignments/${assignmentAId}/resources`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 403);
    });

    await test('Auth Guard: Student B cannot view Student A goal resources or work summary (403/404)', async () => {
      const res1 = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}/resources`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.ok([403, 404].includes(res1.statusCode));

      const res2 = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalAId}/work`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.ok([403, 404].includes(res2.statusCode));
    });

    await test('Auth Guard: Student B cannot view Student A study session resources (403/404)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/calendar/study-sessions/${sessionId}/resources`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.ok([403, 404].includes(res.statusCode));
    });

    // -----------------------------------------------------------------
    // 6. Transaction Safety & Pre-flight Batch Atomicity
    // -----------------------------------------------------------------
    await test('Transaction Safety: batch link with one invalid resource rolls back cleanly', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const res = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          resource_ids: [resourceA1Id, nonExistentUuid]
        }
      });
      // Should reject with 404 Not Found
      assert.strictEqual(res.statusCode, 404);

      // Verify that resourceA1 was NOT linked as a partial mutation
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(getRes.statusCode, 200);
      const ids = getRes.body.resources.map(r => r.id);
      assert.ok(!ids.includes(resourceA1Id), 'Partial link must be rolled back on pre-flight error');
    });

    await test('Transaction Safety: batch link with foreign student resource rejects and rolls back', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          resource_ids: [resourceA1Id, resourceBId]
        }
      });
      // Should reject with 403 Forbidden
      assert.strictEqual(res.statusCode, 403);

      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      const ids = getRes.body.resources.map(r => r.id);
      assert.ok(!ids.includes(resourceA1Id));
    });

    // -----------------------------------------------------------------
    // 7. Non-Destructive Entity Lifecycle (Safe Decoupling)
    // -----------------------------------------------------------------
    await test('Safe Decoupling: deleting course decouples linked resources to NULL without deleting them', async () => {
      // First link resourceA2 to courseA
      await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/courses/${courseAId}/resources`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { resource_ids: [resourceA2Id] }
      });

      // Delete courseA
      const delRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/courses/${courseAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(delRes.statusCode, 200);

      // ResourceA2 must still exist
      const r2Res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceA2Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(r2Res.statusCode, 200);
      assert.strictEqual(r2Res.body.resource.course_id, null, 'Course ID must be safely set to NULL on course deletion');
    });

    await test('Safe Decoupling: deleting assignment decouples linked resource to NULL without deleting it', async () => {
      // Delete assignmentA
      const delRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/assignments/${assignmentAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(delRes.statusCode, 200);

      // ResourceA3 must still exist
      const r3Res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceA3Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(r3Res.statusCode, 200);
      assert.strictEqual(r3Res.body.resource.assignment_id, null, 'Assignment ID must be safely set to NULL on assignment deletion');
    });

    await test('Safe Decoupling: deleting goal decouples linked resource to NULL without deleting it', async () => {
      // Delete goalA
      const delRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/goals/${goalAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(delRes.statusCode, 200);

      // ResourceA4 must still exist
      const r4Res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceA4Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(r4Res.statusCode, 200);
      assert.strictEqual(r4Res.body.resource.goal_id, null, 'Goal ID must be safely set to NULL on goal deletion');
    });

    await test('Safe Decoupling: deleting study session decouples linked resource to NULL without deleting it', async () => {
      // Delete session
      const delRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/calendar/study-sessions/${sessionId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(delRes.statusCode, 200);

      // ResourceA5 must still exist
      const r5Res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceA5Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(r5Res.statusCode, 200);
      assert.strictEqual(r5Res.body.resource.study_session_id, null, 'Study session ID must be safely set to NULL on session deletion');
    });

  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
  }

  console.log('\n================================================================');
  console.log(` WORKFLOW INTEGRATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('ALL WORKFLOW INTEGRATION TESTS PASSED! 🎉\n');
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
