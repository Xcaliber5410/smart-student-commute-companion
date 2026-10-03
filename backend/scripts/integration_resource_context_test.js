/**
 * Resource Context Service & API Integration Test Suite
 *
 * Verifies contextual study resource retrieval for active academic work:
 * 1. Course Context: direct resources + child deliverables (assignments, goals, sessions)
 * 2. Assignment Context: direct resources + parent course material + parent goal material
 * 3. Goal Context: direct resources + parent course material + linked assignments & sessions
 * 4. Study Session Context: direct resources + parent course material + linked goal & task
 * 5. Recent & Active Workload Context: favorites + recently updated + active deliverables
 * 6. Student Authorization & Scoping: strict barriers preventing cross-student context bleeding
 * 7. Deduplication, deterministic ranking, and sensible limits
 * 8. HTTP API Integration & route alias parity (/student/resources/context & /academic/resources/context)
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_resource_context.db');
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
const { resourceContextService } = require('../services/resourceContextService');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

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
  console.log(' Running Resource Context Service Integration Tests');
  console.log('====================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // -----------------------------------------------------------------
    // 1. Setup Student A and Student B Accounts
    // -----------------------------------------------------------------
    let tokenA, tokenB, studentA, studentB;
    const runId = Date.now();
    const emailA = `context_student_a_${runId}@djsce.edu`;
    const emailB = `context_student_b_${runId}@djsce.edu`;

    await test('Auth Setup: registers Student A and Student B', async () => {
      const regA = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: { email: emailA, password: 'Password123!', full_name: 'Student A', college_name: 'DJSCE' }
      });
      assert.strictEqual(regA.statusCode, 201);
      studentA = regA.body.user;

      const loginA = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailA, password: 'Password123!' }
      });
      assert.strictEqual(loginA.statusCode, 200);
      tokenA = loginA.body.token;

      const regB = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: { email: emailB, password: 'Password123!', full_name: 'Student B', college_name: 'DJSCE' }
      });
      assert.strictEqual(regB.statusCode, 201);
      studentB = regB.body.user;

      const loginB = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailB, password: 'Password123!' }
      });
      assert.strictEqual(loginB.statusCode, 200);
      tokenB = loginB.body.token;
    });

    // -----------------------------------------------------------------
    // 2. Seed Academic Hierarchy for Student A
    // -----------------------------------------------------------------
    let courseAId, goalAId, asgnAId, sessionAId;

    await test('Data Setup: creates course, goal, assignment, and study session for Student A', async () => {
      // 1. Course: CS401 Distributed Systems
      const cRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { name: 'Distributed Systems', code: 'CS401', instructor: 'Dr. Tanenbaum', credits: 4 }
      });
      assert.strictEqual(cRes.statusCode, 201);
      courseAId = cRes.body.course.id;

      // 2. Goal: Raft Consensus Master Project (linked to course)
      const gRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { title: 'Raft Consensus Master Project', course_id: courseAId, target_date: Date.now() + 86400000 * 30 }
      });
      assert.strictEqual(gRes.statusCode, 201);
      goalAId = gRes.body.goal.id;

      // 3. Assignment: Lab 1 Leader Election (linked to course & goal)
      const aRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Lab 1 Leader Election',
          course_id: courseAId,
          goal_id: goalAId,
          due_date: Date.now() + 86400000 * 5,
          priority: 'urgent',
          status: 'in_progress'
        }
      });
      assert.strictEqual(aRes.statusCode, 201);
      asgnAId = aRes.body.assignment.id;

      // 4. Study Session: Paxos & Raft Reading (linked to course & goal)
      const sRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Paxos & Raft Paper Review',
          course_id: courseAId,
          goal_id: goalAId,
          planned_start_time: Date.now() + 3600000,
          planned_duration_minutes: 60
        }
      });
      assert.strictEqual(sRes.statusCode, 201);
      sessionAId = sRes.body.studySession.id;
    });

    // -----------------------------------------------------------------
    // 3. Seed Study Resources linked across the hierarchy
    // -----------------------------------------------------------------
    let resCourseOnlyId, resGoalOnlyId, resAsgnDirectId, resSessionDirectId, resStandaloneFavoriteId;

    await test('Data Setup: creates categorized study resources for Student A', async () => {
      // Resource 1: Direct course syllabus / lecture notes
      const r1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'CS401 Course Lecture Slides & Syllabus',
          resource_type: 'document',
          course_id: courseAId,
          tags: ['syllabus', 'lecture']
        }
      });
      assert.strictEqual(r1.statusCode, 201);
      resCourseOnlyId = r1.body.resource.id;

      // Resource 2: Goal supporting architecture document
      const r2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Raft Consensus Architecture Specification',
          resource_type: 'reference',
          goal_id: goalAId,
          tags: ['raft', 'architecture']
        }
      });
      assert.strictEqual(r2.statusCode, 201);
      resGoalOnlyId = r2.body.resource.id;

      // Resource 3: Direct assignment starter code / guide
      const r3 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Lab 1 RPC Implementation Notes',
          resource_type: 'note',
          assignment_id: asgnAId,
          tags: ['rpc', 'lab1'],
          is_favorite: 1
        }
      });
      assert.strictEqual(r3.statusCode, 201);
      resAsgnDirectId = r3.body.resource.id;

      // Resource 4: Study session paper link
      const r4 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'In Search of an Understandable Consensus Algorithm (Ongaro)',
          resource_type: 'link',
          url: 'https://raft.github.io/raft.pdf',
          study_session_id: sessionAId,
          tags: ['reading', 'paper']
        }
      });
      assert.strictEqual(r4.statusCode, 201);
      resSessionDirectId = r4.body.resource.id;

      // Resource 5: Standalone Favorite Resource
      const r5 = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'General Operating Systems Cheat Sheet',
          resource_type: 'note',
          is_favorite: 1,
          tags: ['os', 'cheatsheet']
        }
      });
      assert.strictEqual(r5.statusCode, 201);
      resStandaloneFavoriteId = r5.body.resource.id;
    });

    // -----------------------------------------------------------------
    // 4. Service Unit / Integration Tests: Course Context
    // -----------------------------------------------------------------
    await test('Service: getContextForCourse retrieves direct and all child deliverable resources', async () => {
      const result = resourceContextService.getContextForCourse(studentA, courseAId);
      assert.strictEqual(result.contextType, 'course');
      assert.strictEqual(result.entity.id, courseAId);
      assert.strictEqual(result.entity.code, 'CS401');

      // Direct count = 1 (Course Lecture Slides)
      assert.strictEqual(result.summary.directCount, 1);
      assert.strictEqual(result.directResources[0].id, resCourseOnlyId);

      // Related: assignmentResources, goalResources, sessionResources
      assert.strictEqual(result.summary.assignmentCount, 1);
      assert.strictEqual(result.relatedResources.assignmentResources[0].id, resAsgnDirectId);
      assert.strictEqual(result.summary.goalCount, 1);
      assert.strictEqual(result.relatedResources.goalResources[0].id, resGoalOnlyId);
      assert.strictEqual(result.summary.sessionCount, 1);
      assert.strictEqual(result.relatedResources.sessionResources[0].id, resSessionDirectId);

      // Unified deduplicated list includes all 4
      assert.strictEqual(result.summary.total, 4);
      const unifiedIds = new Set(result.resources.map(r => r.id));
      assert.ok(unifiedIds.has(resCourseOnlyId));
      assert.ok(unifiedIds.has(resAsgnDirectId));
      assert.ok(unifiedIds.has(resGoalOnlyId));
      assert.ok(unifiedIds.has(resSessionDirectId));

      // Direct resource has isDirect: true
      const directItem = result.resources.find(r => r.id === resCourseOnlyId);
      assert.strictEqual(directItem.contextRelation.isDirect, true);
      assert.strictEqual(directItem.contextRelation.relation, 'direct');
    });

    await test('Service: getContextForCourse supports type filtering', async () => {
      const result = resourceContextService.getContextForCourse(studentA, courseAId, { resourceType: 'link' });
      assert.strictEqual(result.resources.length, 1);
      assert.strictEqual(result.resources[0].id, resSessionDirectId);
      assert.strictEqual(result.resources[0].resource_type, 'link');
    });

    // -----------------------------------------------------------------
    // 5. Service Unit / Integration Tests: Assignment Context
    // -----------------------------------------------------------------
    await test('Service: getContextForAssignment retrieves direct, parent course, and goal resources', async () => {
      const result = resourceContextService.getContextForAssignment(studentA, asgnAId);
      assert.strictEqual(result.contextType, 'assignment');
      assert.strictEqual(result.entity.id, asgnAId);
      assert.strictEqual(result.entity.title, 'Lab 1 Leader Election');

      // Direct assignment resource
      assert.strictEqual(result.summary.directCount, 1);
      assert.strictEqual(result.directResources[0].id, resAsgnDirectId);

      // Parent course material
      assert.strictEqual(result.summary.courseCount, 1);
      assert.strictEqual(result.courseResources[0].id, resCourseOnlyId);

      // Parent goal material
      assert.strictEqual(result.summary.goalCount, 1);
      assert.strictEqual(result.goalResources[0].id, resGoalOnlyId);

      // Total unified = 3 (resAsgnDirectId, resCourseOnlyId, resGoalOnlyId)
      assert.strictEqual(result.summary.total, 3);
      // Direct resource is ranked #1
      assert.strictEqual(result.resources[0].id, resAsgnDirectId);
      assert.strictEqual(result.resources[0].contextRelation.isDirect, true);
    });

    // -----------------------------------------------------------------
    // 6. Service Unit / Integration Tests: Goal Context
    // -----------------------------------------------------------------
    await test('Service: getContextForGoal retrieves direct, course, assignment, and session resources', async () => {
      const result = resourceContextService.getContextForGoal(studentA, goalAId);
      assert.strictEqual(result.contextType, 'goal');
      assert.strictEqual(result.entity.id, goalAId);

      // Direct goal resource
      assert.strictEqual(result.summary.directCount, 1);
      assert.strictEqual(result.directResources[0].id, resGoalOnlyId);

      // Parent course material
      assert.strictEqual(result.summary.courseCount, 1);
      assert.strictEqual(result.courseResources[0].id, resCourseOnlyId);

      // Assignment material under this goal
      assert.strictEqual(result.summary.assignmentCount, 1);
      assert.strictEqual(result.assignmentResources[0].id, resAsgnDirectId);

      // Session material under this goal
      assert.strictEqual(result.summary.sessionCount, 1);
      assert.strictEqual(result.sessionResources[0].id, resSessionDirectId);

      // Direct resource is ranked #1
      assert.strictEqual(result.resources[0].id, resGoalOnlyId);
      assert.strictEqual(result.resources[0].contextRelation.isDirect, true);
    });

    // -----------------------------------------------------------------
    // 7. Service Unit / Integration Tests: Study Session Context
    // -----------------------------------------------------------------
    await test('Service: getContextForStudySession retrieves direct, course, and goal resources', async () => {
      const result = resourceContextService.getContextForStudySession(studentA, sessionAId);
      assert.strictEqual(result.contextType, 'study_session');
      assert.strictEqual(result.entity.id, sessionAId);

      // Direct session resource
      assert.strictEqual(result.summary.directCount, 1);
      assert.strictEqual(result.directResources[0].id, resSessionDirectId);

      // Parent course material
      assert.strictEqual(result.summary.courseCount, 1);
      assert.strictEqual(result.courseResources[0].id, resCourseOnlyId);

      // Goal material
      assert.strictEqual(result.summary.goalCount, 1);
      assert.strictEqual(result.goalResources[0].id, resGoalOnlyId);

      // Direct session resource ranked #1
      assert.strictEqual(result.resources[0].id, resSessionDirectId);
    });

    // -----------------------------------------------------------------
    // 8. Service Unit / Integration Tests: Recent & Active Workload Context
    // -----------------------------------------------------------------
    await test('Service: getRecentAndActiveContext retrieves favorites and active deliverable resources', async () => {
      const result = resourceContextService.getRecentAndActiveContext(studentA);
      assert.strictEqual(result.contextType, 'recent_and_active');

      // Favorites should include resAsgnDirectId and resStandaloneFavoriteId
      assert.ok(result.summary.favoritesCount >= 2);
      const favIds = new Set(result.favorites.map(r => r.id));
      assert.ok(favIds.has(resAsgnDirectId));
      assert.ok(favIds.has(resStandaloneFavoriteId));

      // Active work resources should capture resources tied to in_progress assignment
      assert.ok(result.summary.activeWorkCount >= 1);
      assert.ok(result.activeWorkResources.some(r => r.id === resAsgnDirectId));

      // Unified list should deduplicate and place favorites first
      assert.ok(result.resources.length >= 3);
      assert.ok(result.resources[0].is_favorite === 1 || result.resources[0].is_favorite === true);
    });

    // -----------------------------------------------------------------
    // 9. Student Scoping & Authorization Barriers
    // -----------------------------------------------------------------
    await test('Auth Guard: Student B cannot request context for Student A course (403 Forbidden)', async () => {
      assert.throws(
        () => resourceContextService.getContextForCourse(studentB, courseAId),
        (err) => err instanceof ForbiddenError && err.statusCode === 403
      );
    });

    await test('Auth Guard: Student B cannot request context for Student A assignment (403 Forbidden)', async () => {
      assert.throws(
        () => resourceContextService.getContextForAssignment(studentB, asgnAId),
        (err) => err instanceof ForbiddenError && err.statusCode === 403
      );
    });

    await test('Auth Guard: Student B cannot request context for Student A goal (403 Forbidden)', async () => {
      assert.throws(
        () => resourceContextService.getContextForGoal(studentB, goalAId),
        (err) => err instanceof ForbiddenError && err.statusCode === 403
      );
    });

    await test('Auth Guard: Student B cannot request context for Student A session (403 Forbidden)', async () => {
      assert.throws(
        () => resourceContextService.getContextForStudySession(studentB, sessionAId),
        (err) => err instanceof ForbiddenError && err.statusCode === 403
      );
    });

    await test('Validation: non-existent entity throws 404 NotFoundError', async () => {
      assert.throws(
        () => resourceContextService.getContextForCourse(studentA, 'course-non-existent-999'),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });

    // -----------------------------------------------------------------
    // 10. HTTP Endpoint Integration Tests (/api/student/resources/context)
    // -----------------------------------------------------------------
    await test('HTTP API: GET /api/student/resources/context requires authentication (401)', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?courseId=${courseAId}`
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    await test('HTTP API: GET /api/student/resources/context?courseId returns course context', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?courseId=${courseAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.contextType, 'course');
      assert.strictEqual(res.body.entity.id, courseAId);
      assert.ok(res.body.resources.length >= 3);
    });

    await test('HTTP API: GET /api/student/resources/context?assignmentId returns assignment context', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?assignmentId=${asgnAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.contextType, 'assignment');
      assert.strictEqual(res.body.entity.id, asgnAId);
      assert.strictEqual(res.body.directResources[0].id, resAsgnDirectId);
    });

    await test('HTTP API: GET /api/student/resources/context?goalId returns goal context', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?goalId=${goalAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.contextType, 'goal');
      assert.strictEqual(res.body.entity.id, goalAId);
    });

    await test('HTTP API: GET /api/student/resources/context?studySessionId returns study session context', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?studySessionId=${sessionAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.contextType, 'study_session');
      assert.strictEqual(res.body.entity.id, sessionAId);
    });

    await test('HTTP API: GET /api/student/resources/context with no params returns recent & active context', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources/context',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.contextType, 'recent_and_active');
      assert.ok(res.body.favorites.length >= 2);
    });

    await test('HTTP API: Student B receives 403 Forbidden when requesting Student A course context', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?courseId=${courseAId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    // -----------------------------------------------------------------
    // 11. Route Alias Parity: /api/academic/resources/context
    // -----------------------------------------------------------------
    await test('HTTP API Parity: GET /api/academic/resources/context returns identical context', async () => {
      const resAcademic = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/resources/context?assignmentId=${asgnAId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(resAcademic.statusCode, 200);
      assert.strictEqual(resAcademic.body.success, true);
      assert.strictEqual(resAcademic.body.contextType, 'assignment');
      assert.strictEqual(resAcademic.body.entity.id, asgnAId);
      assert.strictEqual(resAcademic.body.directResources[0].id, resAsgnDirectId);
    });

    console.log('\n----------------------------------------------------');
    console.log(` RESOURCE CONTEXT INTEGRATION SUMMARY: ${passedTests} passed, ${failedTests} failed`);
    console.log('----------------------------------------------------');

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
  }
}

run().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
