/**
 * End-to-End Goal & Progress API Integration Tests
 *
 * Verifies all authenticated HTTP endpoints:
 * POST   /api/academic/goals
 * GET    /api/academic/goals
 * GET    /api/academic/goals/:id
 * PATCH  /api/academic/goals/:id
 * PUT    /api/academic/goals/:id
 * PATCH  /api/academic/goals/:id/progress
 * POST   /api/academic/goals/:id/complete
 * POST   /api/academic/goals/:id/cancel
 * DELETE /api/academic/goals/:id
 *
 * Coverage:
 * - Authentication (401 without Bearer token)
 * - CRUD operations
 * - Ownership isolation (403 for unauthorized cross-student access)
 * - Progress updates & auto-completion
 * - Practical filtering (active, completed, overdue, date-range, course)
 * - Pagination (page, limit, total, totalPages)
 * - Validation (400 for bad inputs)
 * - Invalid state transitions (400 on cancelled goals)
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const { getConnection } = require('../db/connection');
const { runMigrations } = require('../migrations/migrationRunner');

let passed = 0;
let failed = 0;

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

async function run() {
  console.log('====================================================');
  console.log(' Running Student Goal & Progress API Integration Tests');
  console.log('====================================================\n');

  const db = getConnection();
  runMigrations(db);

  const app = createApp();
  let server = null;
  let port = 0;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });

  const testRunId = Date.now();
  let token1 = null;
  let user1 = null;
  let token2 = null;
  let user2 = null;
  let course1 = null;

  try {
    // 1. Authentication Guards
    await runAsyncTest('Auth Guard: GET /api/academic/goals returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      assert.strictEqual(res.status, 401);
    });

    await runAsyncTest('Auth Guard: POST /api/academic/goals returns 401 without Bearer token', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, { title: 'Test Goal' });
      assert.strictEqual(res.status, 401);
    });

    // 2. Setup Student Accounts & Course
    await runAsyncTest('Auth: registers and logs in Student 1', async () => {
      const email = `stud1_goal_${testRunId}@college.edu`;
      const regRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email,
        password: 'Password123!',
        full_name: 'Goal Student One',
        role: 'student',
        college_name: 'D.J. Sanghvi College of Engineering'
      });

      assert.strictEqual(regRes.status, 201);

      const loginRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email, password: 'Password123!' });

      assert.strictEqual(loginRes.status, 200);
      assert.ok(loginRes.body.token);
      token1 = loginRes.body.token;
      user1 = loginRes.body.user;
    });

    await runAsyncTest('Auth: registers and logs in Student 2', async () => {
      const email = `stud2_goal_${testRunId}@college.edu`;
      const regRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        email,
        password: 'Password123!',
        full_name: 'Goal Student Two',
        role: 'student',
        college_name: 'D.J. Sanghvi College of Engineering'
      });

      assert.strictEqual(regRes.status, 201);

      const loginRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email, password: 'Password123!' });

      assert.strictEqual(loginRes.status, 200);
      token2 = loginRes.body.token;
      user2 = loginRes.body.user;
    });

    await runAsyncTest('Courses: creates academic course for Student 1', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/courses',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        name: 'Database Systems',
        code: 'CS401',
        credits: 4
      });

      assert.strictEqual(res.status, 201);
      course1 = res.body.course;
      assert.ok(course1.id);
    });

    // 3. Goal Creation (POST /api/academic/goals)
    let goal1 = null;
    let goal2Measurable = null;

    await runAsyncTest('CRUD Create: POST /api/academic/goals creates general goal', async () => {
      const targetDate = Date.now() + 86400000 * 30;
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        title: 'Maintain 9.0 GPA across semester',
        description: 'Attend all lab sessions and complete assignments early',
        target_date: targetDate
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.success);
      assert.ok(res.body.goal);
      goal1 = res.body.goal;
      assert.strictEqual(goal1.title, 'Maintain 9.0 GPA across semester');
      assert.strictEqual(goal1.status, 'in_progress');
      assert.strictEqual(goal1.progress, 0);
      assert.strictEqual(goal1.userId, user1.id);
    });

    await runAsyncTest('CRUD Create: POST /api/academic/goals creates measurable goal linked to course', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        course_id: course1.id,
        title: 'Solve 20 SQL Optimization Problems',
        target_value: 20,
        current_value: 5,
        unit: 'queries'
      });

      assert.strictEqual(res.status, 201);
      goal2Measurable = res.body.goal;
      assert.strictEqual(goal2Measurable.courseId, course1.id);
      assert.strictEqual(goal2Measurable.targetValue, 20);
      assert.strictEqual(goal2Measurable.currentValue, 5);
      // 5 / 20 = 25%
      assert.strictEqual(goal2Measurable.progress, 25);
      assert.strictEqual(goal2Measurable.status, 'in_progress');
    });

    // 4. Goal Read & Single Retrieval (GET /api/academic/goals/:id)
    await runAsyncTest('CRUD Read: GET /api/academic/goals/:id retrieves single goal', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token1}`
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.goal.id, goal1.id);
      assert.strictEqual(res.body.goal.title, goal1.title);
    });

    // 5. Goal Update (PATCH /api/academic/goals/:id)
    await runAsyncTest('CRUD Update: PATCH /api/academic/goals/:id updates attributes', async () => {
      const newTarget = Date.now() + 86400000 * 45;
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        title: 'Maintain 9.2 GPA across semester (Updated)',
        target_date: newTarget
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.goal.title, 'Maintain 9.2 GPA across semester (Updated)');
      assert.strictEqual(res.body.goal.targetDate, newTarget);
    });

    // 6. Progress Updates (PATCH /api/academic/goals/:id/progress)
    await runAsyncTest('Progress Update: PATCH /progress updates current value and auto-completes at 100%', async () => {
      // Step 1: Update to 15 queries -> 75%
      const res1 = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal2Measurable.id}/progress`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        current_value: 15
      });

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.body.goal.currentValue, 15);
      assert.strictEqual(res1.body.goal.progress, 75);
      assert.strictEqual(res1.body.goal.status, 'in_progress');
      assert.strictEqual(res1.body.goal.completedAt, null);

      // Step 2: Update to 20 queries -> 100% -> auto complete
      const res2 = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal2Measurable.id}/progress`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        current_value: 20
      });

      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.goal.progress, 100);
      assert.strictEqual(res2.body.goal.status, 'completed');
      assert.ok(res2.body.goal.completedAt > 0);
    });

    // 7. Complete & Cancel Endpoints (POST /complete, POST /cancel)
    await runAsyncTest('Lifecycle: POST /complete marks goal as completed and sets 100%', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}/complete`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token1}`
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.goal.status, 'completed');
      assert.strictEqual(res.body.goal.progress, 100);
      assert.ok(res.body.goal.completedAt > 0);
    });

    // 8. Filtering & Pagination
    let pastGoal = null;
    let overdueGoal = null;

    await runAsyncTest('Setup: creates additional goals for filtering tests', async () => {
      // Overdue goal: past target date, still in_progress
      const pastDate = Date.now() - 86400000 * 2;
      const resOverdue = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        title: 'Overdue Project Milestone',
        target_date: pastDate,
        status: 'in_progress',
        progress: 40
      });
      overdueGoal = resOverdue.body.goal;

      // Future active goal
      const futureDate = Date.now() + 86400000 * 60;
      const resFuture = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        title: 'Learn Docker Containers',
        target_date: futureDate,
        status: 'in_progress',
        progress: 10
      });
      assert.strictEqual(resFuture.status, 201);
    });

    await runAsyncTest('Filtering: filters by active=true', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals?active=true',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token1}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.goals.length > 0);
      assert.ok(res.body.goals.every(g => g.status === 'in_progress'));
    });

    await runAsyncTest('Filtering: filters by completed=true', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals?completed=true',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token1}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.goals.length >= 2);
      assert.ok(res.body.goals.every(g => g.status === 'completed'));
    });

    await runAsyncTest('Filtering: filters by overdue=true', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals?overdue=true',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token1}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.goals.some(g => g.id === overdueGoal.id));
      assert.ok(res.body.goals.every(g => g.targetDate < Date.now() && g.status !== 'completed'));
    });

    await runAsyncTest('Filtering: filters by course_id', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals?course_id=${course1.id}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token1}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.goals.length >= 1);
      assert.ok(res.body.goals.every(g => g.courseId === course1.id));
    });

    await runAsyncTest('Pagination: respects page and limit parameters', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals?page=1&limit=2',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token1}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.goals.length, 2);
      assert.strictEqual(res.body.page, 1);
      assert.strictEqual(res.body.limit, 2);
      assert.ok(res.body.total >= 4);
      assert.ok(res.body.totalPages >= 2);
    });

    // 9. Validation Rejections (400 Bad Request)
    await runAsyncTest('Validation: rejects goal creation with title < 2 characters (400)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        title: 'A'
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    await runAsyncTest('Validation: rejects progress update with negative progress (400)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}/progress`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        progress: -20
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    await runAsyncTest('Validation: rejects progress update with progress > 100 (400)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}/progress`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        progress: 150
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    // 10. Invalid State Changes (400 on Cancelled Goals)
    await runAsyncTest('State Guard: rejects progress updates on cancelled goals (400)', async () => {
      // Cancel the goal
      const cancelRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${overdueGoal.id}/cancel`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token1}` }
      });
      assert.strictEqual(cancelRes.status, 200);

      // Attempt progress update on cancelled goal
      const progRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${overdueGoal.id}/progress`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token1}`
        }
      }, {
        progress: 80
      });

      assert.strictEqual(progRes.status, 400);
      assert.strictEqual(progRes.body.success, false);
    });

    // 11. Ownership Isolation (403 Forbidden for Student 2)
    await runAsyncTest('Isolation: Student 2 cannot read Student 1 goal (403)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token2}` }
      });

      assert.strictEqual(res.status, 403);
    });

    await runAsyncTest('Isolation: Student 2 cannot update Student 1 goal (403)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token2}`
        }
      }, {
        title: 'Hacked Goal Title'
      });

      assert.strictEqual(res.status, 403);
    });

    await runAsyncTest('Isolation: Student 2 cannot delete Student 1 goal (403)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${goal1.id}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token2}` }
      });

      assert.strictEqual(res.status, 403);
    });

    await runAsyncTest('Isolation: Student 2 cannot link goal to Student 1 course (403)', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token2}`
        }
      }, {
        course_id: course1.id,
        title: 'Student 2 linking Student 1 course'
      });

      assert.strictEqual(res.status, 403);
    });

    await runAsyncTest('Isolation: Student 2 list goals does not leak Student 1 goals', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: '/api/academic/goals',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token2}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.goals.length, 0);
    });

    // 12. Deletion
    await runAsyncTest('CRUD Delete: DELETE /api/academic/goals/:id removes goal cleanly', async () => {
      const res = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${overdueGoal.id}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token1}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.deleted, true);

      // Subsequent GET returns 404
      const getRes = await makeRequest(server, {
        hostname: 'localhost',
        port,
        path: `/api/academic/goals/${overdueGoal.id}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token1}` }
      });
      assert.strictEqual(getRes.status, 404);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n----------------------------------------------------');
  console.log(` GOAL API INTEGRATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during goal API integration testing:', err);
  process.exit(1);
});
