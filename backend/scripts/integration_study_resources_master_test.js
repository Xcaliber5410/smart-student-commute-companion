/**
 * Master End-to-End Integration & Hardening Test Suite for Student Study Resources
 *
 * Verifies the complete vertical flow:
 * Authenticated Student
 * → Resource API
 * → Validation
 * → Resource Service
 * → Repository/Database
 * → Student Authorization
 * → Academic/Goal Relationships
 * → Unified Search
 * → Contextual Resource Retrieval
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_resources_master.db');
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'study-resource-master-e2e-secret-key-999';

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
  console.log(' Running Study Resources Master End-to-End Integration Suite    ');
  console.log('================================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    let tokenA, studentA;
    let tokenB, studentB;
    const runId = Date.now();

    let courseId, assignmentId, goalId, studySessionId;
    let resourceNoteId, resourceDocId, resourceLinkId, resourceRefId;

    // 1. Authentication & Student Registration
    await test('Step 1: Auth - registers and authenticates Student A and Student B', async () => {
      const emailA = `master_alice_${runId}@djsce.edu`;
      const regA = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: { email: emailA, password: 'Password123!', full_name: 'Alice Skan', college_name: 'DJSCE' }
      });
      assert.strictEqual(regA.statusCode, 201);
      studentA = regA.body.user;

      const logA = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailA, password: 'Password123!' }
      });
      assert.strictEqual(logA.statusCode, 200);
      tokenA = logA.body.token;

      const emailB = `master_bob_${runId}@djsce.edu`;
      const regB = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: { email: emailB, password: 'Password123!', full_name: 'Bob Peer', college_name: 'DJSCE' }
      });
      assert.strictEqual(regB.statusCode, 201);
      studentB = regB.body.user;

      const logB = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        body: { email: emailB, password: 'Password123!' }
      });
      assert.strictEqual(logB.statusCode, 200);
      tokenB = logB.body.token;

      assert.ok(tokenA && studentA.id);
      assert.ok(tokenB && studentB.id);
    });

    const authA = () => ({ Authorization: `Bearer ${tokenA}` });
    const authB = () => ({ Authorization: `Bearer ${tokenB}` });

    // 2. Academic & Goal Workflows Entity Setup
    await test('Step 2: Setup - provisions Course, Goal, Assignment, and Study Session for Student A', async () => {
      // Course
      const cRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: authA(),
        body: {
          name: 'Distributed Systems 401',
          code: 'CS-401',
          instructor: 'Dr. Leslie Lamport',
          color: '#6366F1',
          credits: 4
        }
      });
      assert.strictEqual(cRes.statusCode, 201);
      courseId = cRes.body.course.id;

      // Goal
      const gRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: authA(),
        body: {
          title: 'Master Consensus & Raft Protocols',
          category: 'academic',
          course_id: courseId,
          target_date: Date.now() + 86400000 * 30
        }
      });
      assert.strictEqual(gRes.statusCode, 201);
      goalId = gRes.body.goal.id;

      // Assignment
      const aRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: authA(),
        body: {
          course_id: courseId,
          goal_id: goalId,
          title: 'Build Distributed Raft Cluster',
          description: 'Implement leader election, log replication, and heartbeat timeouts in Node.js',
          due_date: Date.now() + 86400000 * 7,
          priority: 'urgent',
          status: 'in_progress'
        }
      });
      assert.strictEqual(aRes.statusCode, 201);
      assignmentId = aRes.body.assignment.id;

      // Study Session
      const sRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/calendar/study-sessions',
        headers: authA(),
        body: {
          course_id: courseId,
          goal_id: goalId,
          title: 'Deep Dive: Safety Proofs for State Machine Replication',
          notes: 'Review invariants of Paxos vs Raft leader commit steps',
          planned_start_time: Date.now() + 3600000,
          planned_duration_minutes: 60
        }
      });
      assert.strictEqual(sRes.statusCode, 201);
      studySessionId = sRes.body.studySession.id;

      assert.ok(courseId && goalId && assignmentId && studySessionId);
    });

    // 3. Validation & Malformed Input Guards
    await test('Step 3: Validation - rejects malformed resource payloads, bounds, and unauthorized calls', async () => {
      // 401 Unauthorized
      const noAuth = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        body: { title: 'No Auth Resource' }
      });
      assert.strictEqual(noAuth.statusCode, 401);

      // 400 Empty title
      const emptyTitle = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: { title: '   ' }
      });
      assert.strictEqual(emptyTitle.statusCode, 400);

      // 400 Invalid resource type
      const badType = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: {
          title: 'Valid Title',
          resource_type: 'video_clip'
        }
      });
      assert.strictEqual(badType.statusCode, 400);

      // 400 Title too long (>200 chars)
      const longTitle = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: {
          title: 'A'.repeat(201)
        }
      });
      assert.strictEqual(longTitle.statusCode, 400);

      // 400 Limit boundary > 50
      const badLimit = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?limit=55',
        headers: authA()
      });
      assert.strictEqual(badLimit.statusCode, 400);
    });

    // 4. Resource Creation & Direct Retrieval
    await test('Step 4: Resource CRUD - creates diverse resources (note, doc, link, ref) and retrieves them', async () => {
      // Note directly on course
      const rNote = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: {
          title: 'Raft Consensus Protocol Cheatsheet',
          description: 'Key states: Follower, Candidate, Leader, and term increment rules',
          resource_type: 'note',
          content: 'Election timeout randomized between 150-300ms. Heartbeat sent at 50ms intervals.',
          course_id: courseId,
          tags: ['raft', 'consensus', 'distributed-systems']
        }
      });
      assert.strictEqual(rNote.statusCode, 201);
      resourceNoteId = rNote.body.resource.id;
      assert.strictEqual(rNote.body.resource.resourceType, 'note');

      // Document directly on assignment
      const rDoc = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: {
          title: 'Raft Cluster Architecture Diagram',
          description: 'Architecture schematic for 5-node cluster RPC communication',
          resource_type: 'document',
          file_name: 'raft_cluster_spec_v2.pdf',
          file_size: 2048576,
          mime_type: 'application/pdf',
          assignment_id: assignmentId,
          tags: ['spec', 'assignment', 'diagram']
        }
      });
      assert.strictEqual(rDoc.statusCode, 201);
      resourceDocId = rDoc.body.resource.id;

      // Link directly on goal
      const rLink = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: {
          title: 'Stanford Raft Paper Interactive Visualizer',
          description: 'Animated step-by-step state machine simulation by Ongaro & Ousterhout',
          resource_type: 'link',
          url: 'https://raft.github.io',
          goal_id: goalId,
          tags: ['simulation', 'visualizer', 'stanford']
        }
      });
      assert.strictEqual(rLink.statusCode, 201);
      resourceLinkId = rLink.body.resource.id;

      // Reference on study session
      const rRef = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/resources',
        headers: authA(),
        body: {
          title: 'Paxos Made Simple - Paper Notes',
          description: 'Comparative notes on Synod single-decree Paxos vs Multi-Paxos',
          resource_type: 'reference',
          content: 'Phase 1: Prepare/Promise, Phase 2: Accept/Accepted.',
          study_session_id: studySessionId,
          tags: ['paxos', 'exam-prep', 'reference']
        }
      });
      assert.strictEqual(rRef.statusCode, 201);
      resourceRefId = rRef.body.resource.id;

      // Direct GET
      const getRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authA()
      });
      assert.strictEqual(getRes.statusCode, 200);
      assert.strictEqual(getRes.body.resource.title, 'Raft Consensus Protocol Cheatsheet');
    });

    // 5. Updates, Favorites & Archiving
    await test('Step 5: Resource Lifecycle - updates, toggles favorite, and archives/unarchives', async () => {
      // PATCH update
      const patchRes = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authA(),
        body: {
          description: 'Updated cheatsheet with log compaction and snapshotting algorithms'
        }
      });
      assert.strictEqual(patchRes.statusCode, 200);
      assert.strictEqual(patchRes.body.resource.description, 'Updated cheatsheet with log compaction and snapshotting algorithms');

      // Toggle favorite
      const favRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${resourceNoteId}/favorite`,
        headers: authA()
      });
      assert.strictEqual(favRes.statusCode, 200);
      assert.strictEqual(favRes.body.resource.isFavorite, true);

      // Archive and Unarchive
      const archRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${resourceRefId}/archive`,
        headers: authA()
      });
      assert.strictEqual(archRes.statusCode, 200);
      assert.strictEqual(archRes.body.resource.archived, true);

      const unarchRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/resources/${resourceRefId}/archive`,
        headers: authA(),
        body: { archived: false }
      });
      assert.strictEqual(unarchRes.statusCode, 200);
      assert.strictEqual(unarchRes.body.resource.archived, false);
    });

    // 6. Listing, Filtering & Pagination
    await test('Step 6: Listing & Filtering - tests type, course, and pagination partitioning', async () => {
      // List all
      const listAll = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?limit=10',
        headers: authA()
      });
      assert.strictEqual(listAll.statusCode, 200);
      assert.strictEqual(listAll.body.resources.length, 4);
      assert.strictEqual(listAll.body.pagination.total, 4);

      // Filter by type=link
      const listLink = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?type=link',
        headers: authA()
      });
      assert.strictEqual(listLink.statusCode, 200);
      assert.strictEqual(listLink.body.resources.length, 1);
      assert.strictEqual(listLink.body.resources[0].resourceType, 'link');

      // Filter by course_id
      const listCourse = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources?course_id=${courseId}`,
        headers: authA()
      });
      assert.strictEqual(listCourse.statusCode, 200);
      assert.ok(listCourse.body.resources.some(r => r.id === resourceNoteId));

      // Pagination partitioning
      const page1 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?limit=2&page=1',
        headers: authA()
      });
      const page2 = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources?limit=2&page=2',
        headers: authA()
      });
      assert.strictEqual(page1.body.resources.length, 2);
      assert.strictEqual(page2.body.resources.length, 2);
      assert.notStrictEqual(page1.body.resources[0].id, page2.body.resources[0].id);
    });

    // 7. Academic & Goal Workflows
    await test('Step 7: Workflows - links/unlinks resources and verifies goal work dashboard aggregation', async () => {
      // Goal work dashboard
      const goalWork = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/goals/${goalId}/work`,
        headers: authA()
      });
      assert.strictEqual(goalWork.statusCode, 200);
      assert.ok(Array.isArray(goalWork.body.resources), 'Goal work should contain resources array');
      assert.ok(goalWork.body.resources.some(r => r.id === resourceLinkId));

      // Dedicated course endpoint GET
      const courseResList = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/courses/${courseId}/resources`,
        headers: authA()
      });
      assert.strictEqual(courseResList.statusCode, 200);
      assert.ok(courseResList.body.resources.some(r => r.id === resourceNoteId));

      // Unlink and re-link assignment resource via dedicated workflow endpoint
      const unlinkAsgn = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/assignments/${assignmentId}/resources/${resourceDocId}`,
        headers: authA()
      });
      assert.strictEqual(unlinkAsgn.statusCode, 200);

      const checkAsgnAfterUnlink = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/assignments/${assignmentId}/resources`,
        headers: authA()
      });
      assert.strictEqual(checkAsgnAfterUnlink.body.resources.length, 0);

      const relinkAsgn = await makeRequest(server, {
        method: 'POST',
        path: `/api/academic/assignments/${assignmentId}/resources`,
        headers: authA(),
        body: {
          resource_ids: [resourceDocId]
        }
      });
      assert.strictEqual(relinkAsgn.statusCode, 200);

      const checkAsgnAfterRelink = await makeRequest(server, {
        method: 'GET',
        path: `/api/academic/assignments/${assignmentId}/resources`,
        headers: authA()
      });
      assert.strictEqual(checkAsgnAfterRelink.body.resources.length, 1);
    });

    // 8. Contextual Resource Retrieval
    await test('Step 8: Context Service - validates course, assignment, goal, study-session, and recent contexts', async () => {
      // 1. Course Context
      const courseCtx = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?courseId=${courseId}`,
        headers: authA()
      });
      assert.strictEqual(courseCtx.statusCode, 200);
      assert.strictEqual(courseCtx.body.contextType, 'course');
      assert.ok(courseCtx.body.resources.some(r => r.id === resourceNoteId && r.contextRelation.isDirect === true));
      assert.ok(courseCtx.body.resources.some(r => r.id === resourceDocId && r.contextRelation.relation === 'assignment'));

      // 2. Assignment Context
      const asgnCtx = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?assignmentId=${assignmentId}`,
        headers: authA()
      });
      assert.strictEqual(asgnCtx.statusCode, 200);
      assert.strictEqual(asgnCtx.body.contextType, 'assignment');
      assert.ok(asgnCtx.body.resources.some(r => r.id === resourceDocId && r.contextRelation.isDirect === true));
      assert.ok(asgnCtx.body.resources.some(r => r.id === resourceNoteId && r.contextRelation.relation === 'course'));

      // 3. Goal Context
      const goalCtx = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?goalId=${goalId}`,
        headers: authA()
      });
      assert.strictEqual(goalCtx.statusCode, 200);
      assert.strictEqual(goalCtx.body.contextType, 'goal');
      assert.ok(goalCtx.body.resources.some(r => r.id === resourceLinkId && r.contextRelation.isDirect === true));

      // 4. Study Session Context
      const sessionCtx = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?studySessionId=${studySessionId}`,
        headers: authA()
      });
      assert.strictEqual(sessionCtx.statusCode, 200);
      assert.strictEqual(sessionCtx.body.contextType, 'study_session');
      assert.ok(sessionCtx.body.resources.some(r => r.id === resourceRefId && r.contextRelation.isDirect === true));

      // 5. Recent/Active Context
      const recentCtx = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources/context',
        headers: authA()
      });
      assert.strictEqual(recentCtx.statusCode, 200);
      assert.strictEqual(recentCtx.body.contextType, 'recent_and_active');
      assert.ok(recentCtx.body.resources.length > 0);
    });

    // 9. Unified Cross-Domain Student Search
    await test('Step 9: Unified Search - searches study resources individually and mixed with academic entities', async () => {
      // Pure study resource search
      const srSearch = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=consensus&types=resources',
        headers: authA()
      });
      assert.strictEqual(srSearch.statusCode, 200);
      assert.ok(srSearch.body.results.length >= 1);
      assert.ok(srSearch.body.results.every(r => r.type === 'study_resource'));
      assert.strictEqual(srSearch.body.countsByType.study_resource, srSearch.body.results.length);

      // Tag matching
      const tagSearch = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=visualizer',
        headers: authA()
      });
      assert.strictEqual(tagSearch.statusCode, 200);
      assert.ok(tagSearch.body.results.some(r => r.id === resourceLinkId));

      // Mixed search: query "Raft" matches Course/Assignment/Goal and Study Resources
      const mixedSearch = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Raft',
        headers: authA()
      });
      assert.strictEqual(mixedSearch.statusCode, 200);
      const types = new Set(mixedSearch.body.results.map(r => r.type));
      assert.ok(types.has('study_resource'), 'Mixed search must include study_resource');
      assert.ok(types.has('assignment') || types.has('goal'), 'Mixed search must include academic items');

      // Deterministic ranking: exact title match scores higher than partial content match
      const exactSearch = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/search?q=${encodeURIComponent('Paxos Made Simple - Paper Notes')}`,
        headers: authA()
      });
      assert.strictEqual(exactSearch.statusCode, 200);
      assert.strictEqual(exactSearch.body.results[0].id, resourceRefId);
    });

    // 10. Student Authorization & Data Isolation
    await test('Step 10: Authorization & Isolation - guarantees Student B cannot access, modify, or search Student A resources', async () => {
      // 403 on direct GET
      const bGet = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authB()
      });
      assert.strictEqual(bGet.statusCode, 403);

      // 403 on PATCH
      const bPatch = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authB(),
        body: { title: 'Hacked Title' }
      });
      assert.strictEqual(bPatch.statusCode, 403);

      // 403 on DELETE
      const bDelete = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authB()
      });
      assert.strictEqual(bDelete.statusCode, 403);

      // 403 on context query using Student A's courseId
      const bContext = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/context?courseId=${courseId}`,
        headers: authB()
      });
      assert.strictEqual(bContext.statusCode, 403);

      // Zero cross-student leakage in search
      const bSearch = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/search?q=Raft',
        headers: authB()
      });
      assert.strictEqual(bSearch.statusCode, 200);
      assert.strictEqual(bSearch.body.results.length, 0);

      // Zero cross-student records in list
      const bList = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/resources',
        headers: authB()
      });
      assert.strictEqual(bList.statusCode, 200);
      assert.strictEqual(bList.body.resources.length, 0);
    });

    // 11. Transaction Safety & Referential Integrity
    await test('Step 11: Transaction & Cascade Integrity - validates safe decoupling on course deletion', async () => {
      // Delete course
      const delCourse = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/academic/courses/${courseId}`,
        headers: authA()
      });
      assert.strictEqual(delCourse.statusCode, 200);

      // Resource should still exist with course_id set to null (ON DELETE SET NULL)
      const checkRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authA()
      });
      assert.strictEqual(checkRes.statusCode, 200);
      assert.strictEqual(checkRes.body.resource.courseId, null);
    });

    // 12. Clean Resource Deletion
    await test('Step 12: Clean Deletion - deletes remaining resources cleanly and verifies 404', async () => {
      const delRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authA()
      });
      assert.strictEqual(delRes.statusCode, 200);

      const get404 = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/resources/${resourceNoteId}`,
        headers: authA()
      });
      assert.strictEqual(get404.statusCode, 404);
    });

    console.log('\n----------------------------------------------------------------');
    console.log(` STUDY RESOURCES MASTER E2E SUMMARY: ${passedTests} passed, ${failedTests} failed`);
    console.log('----------------------------------------------------------------\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    closeConnection();
    for (const ext of ['', '-wal', '-shm']) {
      const p = testDbPath + ext;
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
