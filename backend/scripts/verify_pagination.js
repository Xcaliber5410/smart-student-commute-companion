const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');

function request(server, { method, path, headers = {}, body = null }) {
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
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
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

async function main() {
  console.log('====================================================');
  console.log(' Running Pagination & Filtering Test Suite (Task 5/7)');
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
    // 1. Populate multiple RideGroups for pagination testing
    const sampleGroups = [
      { creator_pseudonym: 'Student1', origin_area: 'Borivali', destination_college: 'DJSCE', departure_time: '08:00 AM', mode: 'train', max_members: 3 },
      { creator_pseudonym: 'Student2', origin_area: 'Andheri', destination_college: 'DJSCE', departure_time: '08:15 AM', mode: 'auto', max_members: 3 },
      { creator_pseudonym: 'Student3', origin_area: 'Bandra', destination_college: 'DJSCE', departure_time: '08:30 AM', mode: 'auto', max_members: 3 },
      { creator_pseudonym: 'Student4', origin_area: 'Dadar', destination_college: 'DJSCE', departure_time: '08:45 AM', mode: 'train', max_members: 3 },
      { creator_pseudonym: 'Student5', origin_area: 'Malad', destination_college: 'DJSCE', departure_time: '09:00 AM', mode: 'bus', max_members: 4 }
    ];

    for (const g of sampleGroups) {
      await request(server, { method: 'POST', path: '/api/ride-groups', body: g });
    }

    // Populate live reports
    await request(server, {
      method: 'POST',
      path: '/api/live-reports',
      body: { pseudonym: 'Reporter1', area: 'Andheri West', mode: 'train', message: 'Train delay 15 mins', impact: 'high' }
    });
    await request(server, {
      method: 'POST',
      path: '/api/live-reports',
      body: { pseudonym: 'Reporter2', area: 'Vile Parle', mode: 'auto', message: 'Heavy rickshaw rush', impact: 'low' }
    });

    // Populate feedback with unique recId
    const recId = `rec-pg-${Date.now()}`;
    await request(server, {
      method: 'POST',
      path: '/api/feedback',
      body: { recommendation_id: recId, is_useful: true, tags: ['fast'], comment: 'Great commute' }
    });
    await request(server, {
      method: 'POST',
      path: '/api/feedback',
      body: { recommendation_id: recId, is_useful: false, tags: ['crowded'], comment: 'Too crowded' }
    });

    // Test 1: Default pagination returns structure
    await test('GET /api/ride-groups returns default pagination metadata', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(Array.isArray(res.body.groups));
      assert(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 20);
      assert(res.body.pagination.total >= 5);
    });

    // Test 2: Custom limit and pages
    await test('GET /api/ride-groups respects custom limit parameter', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups?limit=2&page=1' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.groups.length, 2);
      assert.strictEqual(res.body.pagination.limit, 2);
      assert.strictEqual(res.body.pagination.hasNext, true);
    });

    // Test 3: Pagination offsets work correctly across pages
    await test('GET /api/ride-groups page 2 returns distinct items from page 1', async () => {
      const resPage1 = await request(server, { method: 'GET', path: '/api/ride-groups?limit=2&page=1' });
      const resPage2 = await request(server, { method: 'GET', path: '/api/ride-groups?limit=2&page=2' });

      assert.strictEqual(resPage1.status, 200);
      assert.strictEqual(resPage2.status, 200);
      assert.strictEqual(resPage2.body.pagination.page, 2);
      assert.strictEqual(resPage2.body.pagination.hasPrev, true);

      const page1Ids = resPage1.body.groups.map(g => g.id);
      const page2Ids = resPage2.body.groups.map(g => g.id);
      for (const id of page2Ids) {
        assert(!page1Ids.includes(id), `Page 2 item ${id} should not appear on Page 1`);
      }
    });

    // Test 4: Filtering by mode
    await test('GET /api/ride-groups?mode=auto filters correctly by transit mode', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups?mode=auto' });
      assert.strictEqual(res.status, 200);
      for (const g of res.body.groups) {
        assert.strictEqual(g.mode.toLowerCase(), 'auto');
      }
    });

    // Test 5: Filtering by origin area
    await test('GET /api/ride-groups?origin=Borivali filters by origin substring', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups?origin=Borivali' });
      assert.strictEqual(res.status, 200);
      assert(res.body.groups.length >= 1);
      assert(res.body.groups.every(g => g.origin_area.toLowerCase().includes('borivali')));
    });

    // Test 6: Rejection of invalid pagination parameters
    await test('GET /api/ride-groups?limit=999 rejects excessive limit (>50)', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups?limit=999' });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });

    await test('GET /api/ride-groups?page=0 rejects page < 1', async () => {
      const res = await request(server, { method: 'GET', path: '/api/ride-groups?page=0' });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });

    // Test 7: Live reports pagination & filtering
    await test('GET /api/live-reports returns pagination metadata and filters by mode', async () => {
      const res = await request(server, { method: 'GET', path: '/api/live-reports?mode=train' });
      assert.strictEqual(res.status, 200);
      assert(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      for (const r of res.body.reports) {
        assert.strictEqual(r.mode, 'train');
      }
    });

    // Test 8: Live reports filter rejection
    await test('GET /api/live-reports?mode=spaceship rejects invalid mode filter', async () => {
      const res = await request(server, { method: 'GET', path: '/api/live-reports?mode=spaceship' });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });

    // Test 9: Feedback pagination and filtering
    await test('GET /api/feedback with recommendation_id and limit paginates feedback entries', async () => {
      const res = await request(server, { method: 'GET', path: `/api/feedback?recommendation_id=${recId}&limit=1` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.feedback.length, 1);
      assert(res.body.summary);
      assert.strictEqual(res.body.pagination.total, 2);
      assert.strictEqual(res.body.pagination.totalPages, 2);
      assert.strictEqual(res.body.pagination.hasNext, true);
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` PAGINATION & FILTERING SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL PAGINATION & FILTERING CHECKS PASSED! 🎉\n');
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
