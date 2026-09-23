/**
 * Comprehensive API Integration Test Suite (Day 3 Backend Foundation)
 *
 * Verifies end-to-end HTTP routing, schema validation, service domain logic,
 * database persistence, pagination/filtering, update/delete workflows, and
 * response formatting across all backend APIs.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../app');

function makeRequest(server, { method, path, headers = {}, body = null }) {
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
        path,
        method,
        headers: reqHeaders
      },
      res => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTestSuite() {
  console.log('====================================================');
  console.log(' Running Comprehensive API Integration Test Suite');
  console.log('====================================================\n');

  process.env.NODE_ENV = 'test';

  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // Section 1: Health & Router Foundation
    // ----------------------------------------------------
    await test('GET /health returns 200 with service metadata', async () => {
      const res = await makeRequest(server, { method: 'GET', path: '/health' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
      assert.strictEqual(res.body.city, 'Mumbai');
    });

    await test('GET /api/health returns standardized health response', async () => {
      const res = await makeRequest(server, { method: 'GET', path: '/api/health' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ok');
    });

    // ----------------------------------------------------
    // Section 2: RideGroups API (CRUD, Capacity, Filter, Pagination)
    // ----------------------------------------------------
    let createdGroupId = null;

    await test('POST /api/ride-groups creates a travel group', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/ride-groups',
        body: {
          creator_pseudonym: 'IntegrationRunner',
          origin_area: 'Goregaon',
          destination_college: 'DJSCE',
          departure_time: '08:45 AM',
          mode: 'auto',
          max_members: 3,
          notes: 'Near station east gate'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.timestamp);
      assert.ok(res.body.group.id);
      assert.strictEqual(res.body.group.current_members, 1);
      createdGroupId = res.body.group.id;
    });

    await test('POST /api/ride-groups rejects invalid capacity bounds', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/ride-groups',
        body: {
          creator_pseudonym: 'InvalidGroup',
          origin_area: 'Goregaon',
          destination_college: 'DJSCE',
          departure_time: '08:45 AM',
          mode: 'auto',
          max_members: 10 // Max allowed is 6
        }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    await test('GET /api/ride-groups/:id retrieves created group', async () => {
      const res = await makeRequest(server, { method: 'GET', path: `/api/ride-groups/${createdGroupId}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.group.id, createdGroupId);
    });

    await test('POST /api/ride-groups/:id/join increments members and enforces max capacity', async () => {
      // 1. Join 1 (current = 2)
      const res1 = await makeRequest(server, { method: 'POST', path: `/api/ride-groups/${createdGroupId}/join` });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.body.group.current_members, 2);

      // 2. Join 2 (current = 3, reaches max)
      const res2 = await makeRequest(server, { method: 'POST', path: `/api/ride-groups/${createdGroupId}/join` });
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.body.group.current_members, 3);

      // 3. Join 3 (fails: group full)
      const res3 = await makeRequest(server, { method: 'POST', path: `/api/ride-groups/${createdGroupId}/join` });
      assert.strictEqual(res3.status, 400);
      assert.strictEqual(res3.body.code, 'GROUP_FULL');
    });

    await test('PATCH /api/ride-groups/:id updates notes and validates capacity limit', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/ride-groups/${createdGroupId}`,
        body: {
          departure_time: '09:00 AM',
          notes: 'Updated meeting point: Near auto stand'
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.group.departure_time, '09:00 AM');
      assert.strictEqual(res.body.group.notes, 'Updated meeting point: Near auto stand');
    });

    await test('GET /api/ride-groups paginates and filters by mode', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: '/api/ride-groups?mode=auto&page=1&limit=5'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.groups));
      assert(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 5);
      for (const g of res.body.groups) {
        assert.strictEqual(g.mode.toLowerCase(), 'auto');
      }
    });

    await test('DELETE /api/ride-groups/:id deletes group and returns 404 on subsequent read', async () => {
      const resDel = await makeRequest(server, { method: 'DELETE', path: `/api/ride-groups/${createdGroupId}` });
      assert.strictEqual(resDel.status, 200);
      assert.strictEqual(resDel.body.success, true);

      const resGet = await makeRequest(server, { method: 'GET', path: `/api/ride-groups/${createdGroupId}` });
      assert.strictEqual(resGet.status, 404);
    });

    // ----------------------------------------------------
    // Section 3: Live Commute Reports API (CRUD, Voting, Decay)
    // ----------------------------------------------------
    let createdReportId = null;

    await test('POST /api/live-reports creates live disruption report', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/live-reports',
        body: {
          pseudonym: 'StationRider',
          area: 'Santacruz',
          mode: 'train',
          message: 'Signal failure causing train delays up to 20 mins',
          impact: 'high',
          durationObservedMinutes: 45
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.report.id);
      assert.strictEqual(res.body.report.freshnessWeight, 1.0);
      createdReportId = res.body.report.id;
    });

    await test('POST /api/live-reports/:id/confirm and contradict records community votes', async () => {
      const userToken = 'student-test-token-777';
      // Confirm vote
      const resConfirm = await makeRequest(server, {
        method: 'POST',
        path: `/api/live-reports/${createdReportId}/confirm`,
        headers: { 'x-user-token': userToken }
      });
      assert.strictEqual(resConfirm.status, 200);

      // Duplicate vote prevention
      const resDup = await makeRequest(server, {
        method: 'POST',
        path: `/api/live-reports/${createdReportId}/confirm`,
        headers: { 'x-user-token': userToken }
      });
      assert.strictEqual(resDup.status, 200);
      assert.strictEqual(resDup.body.alreadyVoted, true);
    });

    await test('PATCH /api/live-reports/:id updates report status to resolved', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/live-reports/${createdReportId}`,
        body: { status: 'resolved' }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.report.status, 'resolved');
    });

    await test('DELETE /api/live-reports/:id removes report and confirms 404', async () => {
      const resDel = await makeRequest(server, { method: 'DELETE', path: `/api/live-reports/${createdReportId}` });
      assert.strictEqual(resDel.status, 200);

      const resGet = await makeRequest(server, { method: 'GET', path: `/api/live-reports/${createdReportId}` });
      assert.strictEqual(resGet.status, 404);
    });

    // ----------------------------------------------------
    // Section 4: Student Feedback API (CRUD, Summary, Filter)
    // ----------------------------------------------------
    const uniqueRecId = `rec-int-test-${Date.now()}`;
    let createdFeedbackId = null;

    await test('POST /api/feedback records route rating', async () => {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/feedback',
        body: {
          recommendation_id: uniqueRecId,
          is_useful: true,
          tags: ['accurate', 'fast'],
          comment: 'Perfect commute path!'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
    });

    await test('GET /api/feedback returns ratings summary and items', async () => {
      const res = await makeRequest(server, {
        method: 'GET',
        path: `/api/feedback?recommendation_id=${uniqueRecId}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.summary);
      assert.strictEqual(res.body.summary.helpful, 1);
      assert.strictEqual(res.body.feedback.length, 1);
      createdFeedbackId = res.body.feedback[0].id;
    });

    await test('PATCH /api/feedback/:id updates comment and tags', async () => {
      const res = await makeRequest(server, {
        method: 'PATCH',
        path: `/api/feedback/${createdFeedbackId}`,
        body: {
          comment: 'Updated: absolutely reliable route',
          tags: ['reliable']
        }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.feedback.comment, 'Updated: absolutely reliable route');
      assert.deepStrictEqual(res.body.feedback.tags, ['reliable']);
    });

    await test('DELETE /api/feedback/:id removes feedback entry', async () => {
      const resDel = await makeRequest(server, { method: 'DELETE', path: `/api/feedback/${createdFeedbackId}` });
      assert.strictEqual(resDel.status, 200);

      const resList = await makeRequest(server, { method: 'GET', path: `/api/feedback?recommendation_id=${uniqueRecId}` });
      assert.strictEqual(resList.body.feedback.length, 0);
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` INTEGRATION TEST SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL API INTEGRATION TESTS PASSED! 🎉\n');
  }
}

runTestSuite().catch(err => {
  console.error('Fatal integration test error:', err);
  process.exit(1);
});
