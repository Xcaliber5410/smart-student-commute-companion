/**
 * Integration Tests for Commute Route Comparison API
 *
 * Verifies that POST /api/commute/candidates integrates RouteComparisonService:
 * 1. Exposes structured `routeComparison` object in response payload
 * 2. Exposes all required comparable attributes on compared routes
 * 3. Enriches individual candidates with deterministic score, rank, strengths, and weaknesses
 * 4. Ensures `universalBestClaim === false` and disclaimer are present
 * 5. Provides metricLeaders, metricRanges, and tradeOffNotes
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (err) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log(' Running Commute Route Comparison API Integration Tests');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`✅ PASS: ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`❌ FAIL: ${name}`);
        console.error(`   ${err.message}`);
        if (err.stack) console.error(err.stack);
        failed++;
      });
  }

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. Setup authenticated student
    const email = `comp_student_${Date.now()}@djsce.edu`;
    const password = 'Password123!';
    const regRes = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email,
      password,
      full_name: 'Comparison Student',
      college_name: 'D.J. Sanghvi College of Engineering'
    });

    assert.strictEqual(regRes.status, 201);

    const loginRes = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email, password });

    assert.strictEqual(loginRes.status, 200);
    const token = loginRes.body.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // TEST 1: Default Query exposes routeComparison structure
    await test('POST /api/commute/candidates exposes routeComparison structure', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const comp = res.body.routeComparison;

      assert.ok(comp, 'Response must expose routeComparison');
      assert.ok(Array.isArray(comp.routes), 'comp.routes must be array');
      assert.ok(comp.routes.length > 0, 'comp.routes must have at least 1 route');
      assert.ok(comp.comparisonSummary, 'comp.comparisonSummary must exist');
      assert.ok(comp.metricRanges, 'comp.metricRanges must exist');
      assert.ok(comp.provenanceSummary, 'comp.provenanceSummary must exist');

      // Check invariant: universalBestClaim is strictly false
      assert.strictEqual(comp.comparisonSummary.universalBestClaim, false);
      assert.ok(typeof comp.comparisonSummary.disclaimer === 'string');

      // Metric leaders present
      assert.ok(comp.comparisonSummary.metricLeaders);
      assert.ok(comp.comparisonSummary.metricLeaders.fastest);
      assert.ok(comp.comparisonSummary.metricLeaders.cheapest);
    });

    // TEST 2: Every route in routeComparison exposes the required 14 comparable fields
    await test('Every compared route in routeComparison exposes all 14 required fields', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00'
      });

      assert.strictEqual(res.status, 200);
      const routes = res.body.routeComparison.routes;

      for (const r of routes) {
        assert.ok(typeof r.estimatedArrivalTime === 'string', 'estimatedArrivalTime');
        assert.ok(typeof r.totalDuration === 'number', 'totalDuration');
        assert.ok(typeof r.disruptionDelay === 'number', 'disruptionDelay');
        assert.ok(typeof r.waitingTime === 'number', 'waitingTime');
        assert.ok(typeof r.walkingTime === 'number', 'walkingTime');
        assert.ok(typeof r.transfers === 'number', 'transfers');
        assert.ok(typeof r.estimatedCost === 'number', 'estimatedCost');
        assert.ok(typeof r.reliability === 'string', 'reliability');
        assert.ok(typeof r.uncertainty === 'string', 'uncertainty');
        assert.ok(Array.isArray(r.affectedSegments), 'affectedSegments');
        assert.ok(Array.isArray(r.transportModes), 'transportModes');
        assert.ok(r.provenance && typeof r.provenance === 'object', 'provenance');
        assert.ok(typeof r.deterministicScore === 'number', 'deterministicScore');
        assert.ok(Array.isArray(r.strengths), 'strengths');
        assert.ok(Array.isArray(r.weaknesses), 'weaknesses');
      }
    });

    // TEST 3: Output candidates are decorated with comparison metrics
    await test('Candidates array in API response is enriched with comparison metrics', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00'
      });

      assert.strictEqual(res.status, 200);
      const candidates = res.body.candidates;
      assert.ok(candidates.length > 0);

      const first = candidates[0];
      assert.ok(typeof first.deterministicScore === 'number', 'deterministicScore decorated');
      assert.ok(typeof first.rank === 'number', 'rank decorated');
      assert.ok(Array.isArray(first.strengths), 'strengths decorated');
      assert.ok(Array.isArray(first.weaknesses), 'weaknesses decorated');
      assert.ok(typeof first.isTied === 'boolean', 'isTied decorated');
      assert.ok(typeof first.isDuplicate === 'boolean', 'isDuplicate decorated');
    });

  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
