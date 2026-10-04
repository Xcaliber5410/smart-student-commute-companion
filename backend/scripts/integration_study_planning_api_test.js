/**
 * Integration Test Suite: Student Study Planning API Endpoints
 *
 * Verifies:
 * 1. Unauthorized requests are rejected with 401 Unauthorized (missing or invalid Bearer token).
 * 2. Plan generation (/api/student/study-plans/generate and /api/student/study-plans).
 * 3. Retrieving current active plan (/api/student/study-plans/current) and list (/api/student/study-plans).
 * 4. Date and date-range filtering on planned items (/api/student/study-plans/items).
 * 5. Plan recalculation and duplicate item prevention.
 * 6. Planned item status updates (planned -> completed -> skipped) and removal.
 * 7. Student authorization and data isolation (Student B cannot view/mutate Student A's plans/items).
 * 8. Validation failures and standardized error envelopes.
 * 9. Empty planning periods with clean zero-item states.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.resolve(__dirname, '../data/test_study_planning_api.db');
process.env.DATABASE_PATH = testDbPath;
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

const { closeConnection } = require('../db/connection');
closeConnection();
for (const ext of ['', '-wal', '-shm']) {
  const p = testDbPath + ext;
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

const { initDb } = require('../db/database');
const { createApp } = require('../app');
const { getDateKeyIST } = require('../utils/timezone');

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
  console.log(' Running Student Study Planning API Integration Tests');
  console.log('====================================================\n');

  initDb();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // -----------------------------------------------------------------
    // 1. Unauthorized Access Guards
    // -----------------------------------------------------------------
    await test('Auth Guard: GET /api/student/study-plans returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('Auth Guard: POST /api/student/study-plans/generate returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/generate',
        body: { days: 7 }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('Auth Guard: GET /api/student/study-plans/items returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/items'
      });
      assert.strictEqual(res.statusCode, 401);
    });

    await test('Auth Guard: rejects invalid bearer token with 401 Unauthorized', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans',
        headers: { Authorization: 'Bearer invalid.token.payload' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    // -----------------------------------------------------------------
    // 2. Student Registration and Authentication
    // -----------------------------------------------------------------
    let tokenA, tokenB, studentAId, studentBId;
    const runId = Date.now();
    const emailA = `plan_student_a_${runId}@djsce.edu`;
    const emailB = `plan_student_b_${runId}@djsce.edu`;

    await test('Auth: registers and logs in primary student A', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailA,
          password: 'Password123!',
          full_name: 'Alice Planner',
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
      assert.ok(tokenA, 'Student A must have a bearer token');
    });

    await test('Auth: registers and logs in second student B', async () => {
      const reg = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/register',
        body: {
          email: emailB,
          password: 'Password123!',
          full_name: 'Bob Planner',
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
      assert.ok(tokenB, 'Student B must have a bearer token');
    });

    // -----------------------------------------------------------------
    // 3. Empty Planning State Handling
    // -----------------------------------------------------------------
    await test('Empty State: GET /api/student/study-plans/current returns null when no plan exists', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/current',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.plan, null);
      assert.deepStrictEqual(res.body.items, []);
    });

    await test('Empty State: POST /api/student/study-plans/generate with no deliverables generates empty plan cleanly', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/generate',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { days: 7 }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.plan.id);
      assert.strictEqual(res.body.items.length, 0);
      assert.strictEqual(res.body.summary.totalItemsPlanned, 0);
    });

    // -----------------------------------------------------------------
    // 4. Setup Academic Work for Student A
    // -----------------------------------------------------------------
    let courseAId, asgn1Id, asgn2Id, goalId;
    const now = Date.now();
    const dayMs = 86400000;

    await test('Setup: creates courses, assignments, and goals for student A', async () => {
      // Create Course
      const crsRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/courses',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          code: 'CS401',
          name: 'Distributed Systems',
          color: '#3B82F6',
          credits: 4
        }
      });
      assert.strictEqual(crsRes.statusCode, 201);
      courseAId = crsRes.body.course.id;

      // Create Assignment 1 (Urgent, due in 2 days)
      const asgn1Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          title: 'Consensus Algorithms Lab (Raft/Paxos)',
          due_date: now + (2 * dayMs),
          priority: 'urgent'
        }
      });
      assert.strictEqual(asgn1Res.statusCode, 201);
      asgn1Id = asgn1Res.body.assignment.id;

      // Create Assignment 2 (Medium, due in 5 days)
      const asgn2Res = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/assignments',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          title: 'CAP Theorem Essay',
          due_date: now + (5 * dayMs),
          priority: 'medium'
        }
      });
      assert.strictEqual(asgn2Res.statusCode, 201);
      asgn2Id = asgn2Res.body.assignment.id;

      // Create Goal
      const goalRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/academic/goals',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          course_id: courseAId,
          title: 'Complete Distributed Systems Project',
          target_date: now + (6 * dayMs),
          target_value: 10,
          current_value: 2,
          unit: 'chapters'
        }
      });
      assert.strictEqual(goalRes.statusCode, 201);
      goalId = goalRes.body.goal.id;
    });

    // -----------------------------------------------------------------
    // 5. Generate Study Plan via API
    // -----------------------------------------------------------------
    let generatedPlanId = null;
    let scheduledItems = [];

    await test('Plan Generation: POST /api/student/study-plans/generate creates practical planned items', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/generate',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: {
          title: 'Sprint for Distributed Systems',
          description: 'Preparation for Raft lab and CAP theorem essay',
          days: 7,
          dailyLimitMinutes: 240
        }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.plan);
      assert.strictEqual(res.body.plan.title, 'Sprint for Distributed Systems');
      assert.strictEqual(res.body.plan.userId, studentAId);

      generatedPlanId = res.body.plan.id;
      scheduledItems = res.body.items;

      assert.ok(scheduledItems.length > 0, 'Should have generated plan items');
      assert.ok(res.body.summary.totalStudyMinutes > 0);
      assert.ok(res.body.summary.assignmentsCoveredCount >= 2);
      assert.ok(res.body.summary.goalsCoveredCount >= 1);

      // Verify urgent assignment is scheduled before due date
      const urgentItems = scheduledItems.filter(it => it.assignmentId === asgn1Id);
      assert.ok(urgentItems.length > 0);
      for (const it of urgentItems) {
        assert.ok(it.plannedDate <= now + (2 * dayMs));
      }
    });

    // -----------------------------------------------------------------
    // 6. Retrieve Current Plan & Plan Details
    // -----------------------------------------------------------------
    await test('Plan Retrieval: GET /api/student/study-plans/current returns active plan with metrics', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/current',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.plan);
      assert.strictEqual(res.body.plan.id, generatedPlanId);
      assert.ok(res.body.items.length >= scheduledItems.length);
      assert.ok(res.body.summary.totalMinutes > 0);
      assert.strictEqual(res.body.summary.progressPercentage, 0);
    });

    await test('Plan Retrieval: GET /api/student/study-plans/:id returns plan details', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/${generatedPlanId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.plan.id, generatedPlanId);
      assert.ok(Array.isArray(res.body.items));
    });

    await test('Plan Retrieval: GET /api/student/study-plans lists paginated plans', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans?page=1&limit=10',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.plans));
      assert.ok(res.body.pagination.total >= 1);
    });

    // -----------------------------------------------------------------
    // 7. Date & Range Filtering on Plan Items
    // -----------------------------------------------------------------
    await test('Date Filtering: GET /api/student/study-plans/items filters by exact date YYYY-MM-DD', async () => {
      assert.ok(scheduledItems.length > 0);
      const firstItemDateKey = getDateKeyIST(scheduledItems[0].plannedDate);

      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/items?date=${firstItemDateKey}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.items));
      assert.ok(res.body.items.length > 0);

      // Verify all returned items fall on this IST date
      for (const item of res.body.items) {
        assert.strictEqual(getDateKeyIST(item.plannedDate), firstItemDateKey);
      }
    });

    await test('Date Range Filtering: GET /api/student/study-plans/items filters by range and assignmentId', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/items?assignmentId=${asgn1Id}&startDate=${now}&endDate=${now + 7 * dayMs}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.items.every(it => it.assignmentId === asgn1Id));
    });

    // -----------------------------------------------------------------
    // 8. Recalculation & Duplicate Prevention
    // -----------------------------------------------------------------
    await test('Recalculation: POST /api/student/study-plans/recalculate avoids duplicate planned items', async () => {
      const countBefore = scheduledItems.length;

      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/student/study-plans/recalculate',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { planId: generatedPlanId }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.summary.recalculated, true);

      // Query database directly to ensure no duplicates exist for assignment 1
      const itemsRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/items?planId=${generatedPlanId}&assignmentId=${asgn1Id}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(itemsRes.statusCode, 200);
      // Urgent assignment should still have 2 planned sessions, not 4 (no duplicates!)
      assert.strictEqual(itemsRes.body.items.length, 2);
    });

    // -----------------------------------------------------------------
    // 9. Planned Item Status Update & Removal
    // -----------------------------------------------------------------
    let targetItemId = null;

    await test('Item Status: PATCH /api/student/study-plans/items/:id/status marks item completed', async () => {
      const currentRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/current',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(currentRes.statusCode, 200);
      assert.ok(currentRes.body.items.length > 0);
      targetItemId = currentRes.body.items[0].id;

      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/study-plans/items/${targetItemId}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'completed' }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.item.status, 'completed');
      assert.ok(res.body.item.completedAt > 0);

      // Verify current plan progress increased
      const planRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/current',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(planRes.statusCode, 200);
      assert.ok(planRes.body.summary.progressPercentage > 0);
      assert.strictEqual(planRes.body.summary.completedItems, 1);
    });

    await test('Item Deletion: DELETE /api/student/study-plans/items/:id removes planned item', async () => {
      const res = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/student/study-plans/items/${targetItemId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);

      // Item lookup should now 404
      const lookup = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/items/${targetItemId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(lookup.statusCode, 404);
    });

    // -----------------------------------------------------------------
    // 10. Student Authorization & Data Isolation
    // -----------------------------------------------------------------
    await test('Authorization: Student B cannot view or recalculate Student A plans', async () => {
      // Bob tries to view Alice's plan
      const viewRes = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/${generatedPlanId}`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(viewRes.statusCode, 404);

      // Bob tries to recalculate Alice's plan
      const recalcRes = await makeRequest(server, {
        method: 'POST',
        path: `/api/student/study-plans/${generatedPlanId}/recalculate`,
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(recalcRes.statusCode, 404);

      // Bob queries plan items
      const bobItems = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/items',
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      assert.strictEqual(bobItems.statusCode, 200);
      assert.strictEqual(bobItems.body.items.length, 0);
    });

    // -----------------------------------------------------------------
    // 11. Invalid Request Validation & Error Envelopes
    // -----------------------------------------------------------------
    await test('Validation: rejects invalid status payload with 400 VALIDATION_ERROR', async () => {
      const itemsRes = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/items',
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.ok(itemsRes.body.items.length > 0);
      const validItem = itemsRes.body.items[0].id;

      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/student/study-plans/items/${validItem}/status`,
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { status: 'unknown_status_flag' }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('Validation: rejects invalid date query with 400 VALIDATION_ERROR', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/student/study-plans/items?date=not-a-valid-date',
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    // -----------------------------------------------------------------
    // 12. Plan Deletion & Cleanup
    // -----------------------------------------------------------------
    await test('Plan Deletion: DELETE /api/student/study-plans/:id deletes plan and cascades items', async () => {
      const res = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/student/study-plans/${generatedPlanId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);

      // Plan lookup returns 404
      const lookup = await makeRequest(server, {
        method: 'GET',
        path: `/api/student/study-plans/${generatedPlanId}`,
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      assert.strictEqual(lookup.statusCode, 404);
    });

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

  console.log('\n====================================================');
  console.log(` Study Planning API Integration: ${passedTests} passed, ${failedTests} failed`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Unhandled failure in integration_study_planning_api_test:', err);
  process.exit(1);
});
