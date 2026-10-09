/**
 * Integration Tests for Commute Route Intelligence API
 *
 * Verifies that POST /api/commute/candidates exposes comprehensive route intelligence:
 * 1. Normal commute:
 *    - Feasible routes with routeType: 'EVALUATED_ROUTE'
 *    - Distinguishes baselineEstimate vs contextualEstimate
 *    - Exposes travelTimeEstimate, disruptionImpact, transportModes, transfers, walking, cost,
 *      reliability/uncertainty, provenance, deterministicScore, human-readable evaluationReasons
 * 2. Disrupted commute:
 *    - disruptionImpact isAffected=true, delay minutes calculated
 *    - affectedSegments and unavailableSegments exposed
 *    - Contextual estimate updated with delay
 * 3. Multiple alternatives:
 *    - alternateRoutes exposed with routeType: 'ALTERNATE_ROUTE'
 *    - Includes alternateMetadata (strategy, reasonSummary), baseline/contextual estimates, scoring
 * 4. No feasible route:
 *    - feasibleRoutes is empty when strict constraints reject all candidates
 *    - rejectedRoutes exposes deterministic reason codes, violations, and human-readable evaluationReasons
 * 5. Mixed provenance:
 *    - Routes and summaries preserve provenance tiers (e.g., verified timetable + user-reported disruption)
 * 6. Governance & Invariants:
 *    - No claim of "personalized AI recommendation"
 *    - universalBestClaim is strictly false
 *    - Auth (401), validation (400), and privacy constraints enforced
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
  console.log(' Running Commute Route Intelligence API Integration Tests');
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
    const email = `intel_student_${Date.now()}@djsce.edu`;
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
      full_name: 'Intelligence Student',
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

    // TEST 1: Normal Commute - Baseline vs Contextual, Route Intelligence Structure
    await test('Normal commute: exposes feasible routes with baseline/contextual estimates and intelligence metadata', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        disruptions: []
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify top-level route intelligence collections
      assert.ok(Array.isArray(res.body.feasibleRoutes), 'res.body.feasibleRoutes must be array');
      assert.ok(res.body.feasibleRoutes.length > 0, 'feasibleRoutes should have entries');
      assert.ok(Array.isArray(res.body.rejectedRoutes), 'rejectedRoutes must be array');
      assert.ok(res.body.routeIntelligence, 'routeIntelligence envelope must exist');
      assert.ok(res.body.routeComparison, 'routeComparison must exist');

      // Invariant: No personalized AI recommendation claims
      const bodyStr = JSON.stringify(res.body);
      assert.ok(!bodyStr.toLowerCase().includes('personalized ai recommendation'), 'Must not claim personalized AI recommendation');
      assert.strictEqual(res.body.routeIntelligence.universalBestClaim, false);
      assert.ok(res.body.routeIntelligence.disclaimer.includes('Deterministic route intelligence'));

      // Validate evaluated route properties
      const route = res.body.feasibleRoutes[0];
      assert.strictEqual(route.routeType, 'EVALUATED_ROUTE', 'Primary feasible routes must be EVALUATED_ROUTE');
      assert.ok(typeof route.deterministicScore === 'number', 'Must have deterministic score');
      assert.ok(Array.isArray(route.evaluationReasons), 'Must have human-readable evaluation reasons');
      assert.ok(route.evaluationReasons.length > 0, 'Must have at least one evaluation reason');

      // Distinct estimates: Baseline vs Contextual
      assert.ok(route.baselineEstimate, 'Must expose baselineEstimate');
      assert.ok(typeof route.baselineEstimate.durationMinutes === 'number');
      assert.ok(typeof route.baselineEstimate.estimatedArrivalTime === 'string');

      assert.ok(route.contextualEstimate, 'Must expose contextualEstimate');
      assert.ok(typeof route.contextualEstimate.durationMinutes === 'number');
      assert.ok(typeof route.contextualEstimate.estimatedArrivalTime === 'string');
      assert.strictEqual(route.contextualEstimate.disruptionDelayMinutes, 0, 'Normal commute has 0 disruption delay');

      // Travel time estimate, Disruption impact, Modes, Transfers, Walking, Cost, Reliability, Provenance
      assert.ok(route.travelTimeEstimate, 'Must expose travelTimeEstimate');
      assert.ok(route.disruptionImpact, 'Must expose disruptionImpact');
      assert.strictEqual(route.disruptionImpact.isAffected, false);
      assert.ok(Array.isArray(route.transportModes), 'Must expose transportModes');
      assert.ok(typeof route.transfers === 'number', 'Must expose transfers');
      assert.ok(route.walking && typeof route.walking.durationMinutes === 'number', 'Must expose walking');
      assert.ok(route.cost && typeof route.cost.rupees === 'number', 'Must expose cost');
      assert.ok(typeof route.reliability === 'string', 'Must expose reliability');
      assert.ok(typeof route.uncertainty === 'string', 'Must expose uncertainty');
      assert.ok(route.provenance, 'Must expose provenance');
      assert.ok(Array.isArray(route.affectedSegments), 'Must expose affectedSegments');
      assert.ok(Array.isArray(route.unavailableSegments), 'Must expose unavailableSegments');
    });

    // TEST 2: Disrupted Commute - Delay Impact, Affected Segments, Contextual Shift
    await test('Disrupted commute: reflects disruption impact, affected segments, and contextual delay', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        disruptions: [
          {
            type: 'delay',
            affectedMode: 'train',
            corridorOrArea: 'Western Railway',
            estimatedDelayMinutes: 25,
            severity: 'major',
            description: 'Signal fault between Andheri and Vile Parle'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.feasibleRoutes.length > 0 || res.body.allCandidates.length > 0);

      // Find affected train route among candidates or feasibleRoutes
      const trainRoute = res.body.candidates.find(c =>
        c.transportModes.includes('train') || c.primaryMode === 'train'
      );

      assert.ok(trainRoute, 'Should have train candidate in pool');
      assert.strictEqual(trainRoute.disruptionImpact.isAffected, true, 'Train route should be marked affected');
      assert.ok(trainRoute.disruptionImpact.disruptionDelayMinutes >= 20, 'Should reflect disruption delay');
      assert.ok(trainRoute.contextualEstimate.durationMinutes > trainRoute.baselineEstimate.durationMinutes,
        'Contextual duration should exceed baseline duration due to disruption');
      assert.notStrictEqual(trainRoute.contextualEstimate.estimatedArrivalTime, trainRoute.baselineEstimate.estimatedArrivalTime,
        'Contextual arrival should be later than baseline arrival');
      assert.ok(trainRoute.affectedSegments.length > 0, 'Affected segments should be listed');
    });

    // TEST 3: Multiple Alternatives - Distinct Alternate Routes Generated
    await test('Multiple alternatives: exposes alternateRoutes with routeType ALTERNATE_ROUTE and strategy metadata', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        disruptions: [
          {
            type: 'delay',
            affectedMode: 'train',
            corridorOrArea: 'Western Railway',
            estimatedDelayMinutes: 30,
            severity: 'major',
            description: 'Western Railway complete block'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.alternateRoutes), 'alternateRoutes must be array');
      assert.ok(res.body.alternateRoutes.length > 0, 'Should generate alternate routes when primary mode is disrupted');

      const alternate = res.body.alternateRoutes[0];
      assert.strictEqual(alternate.routeType, 'ALTERNATE_ROUTE', 'Must have routeType ALTERNATE_ROUTE');
      assert.ok(alternate.alternateMetadata, 'Must have alternateMetadata');
      assert.ok(alternate.alternateMetadata.strategy, 'Strategy must be specified (e.g. MODE_SHIFT or BUS_INSTEAD_OF_TRAIN)');
      assert.ok(alternate.alternateMetadata.reasonSummary, 'Must provide reasonSummary for alternate route');

      // Evaluated vs Alternate distinction
      assert.notStrictEqual(alternate.routeType, 'EVALUATED_ROUTE', 'Alternate route must NOT be marked EVALUATED_ROUTE');
      assert.ok(alternate.baselineEstimate, 'Alternate must have baselineEstimate');
      assert.ok(alternate.contextualEstimate, 'Alternate must have contextualEstimate');
      assert.ok(Array.isArray(alternate.evaluationReasons), 'Alternate must have evaluationReasons');
    });

    // TEST 4: No Feasible Route - Rejected routes with deterministic reasons
    await test('No feasible route: feasibleRoutes is empty and rejectedRoutes itemizes deterministic violation reasons', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        targetArrivalTime: '08:01', // Impossibly tight deadline for 6-10 km commute
        maxTransfers: 0,
        maxWalkingMinutes: 0 // Impossibly zero walking allowed
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.feasibleRoutes.length, 0, 'feasibleRoutes must be empty when constraints are impossible');
      assert.ok(res.body.rejectedRoutes.length > 0, 'rejectedRoutes must contain rejected candidate journeys');

      const rejected = res.body.rejectedRoutes[0];
      assert.strictEqual(rejected.isAccepted, false);
      assert.ok(typeof rejected.primaryReasonCode === 'string', 'Must provide primaryReasonCode');
      assert.ok(Array.isArray(rejected.reasonCodes), 'Must provide reasonCodes array');
      assert.ok(Array.isArray(rejected.violations), 'Must provide violations detail');
      assert.ok(Array.isArray(rejected.evaluationReasons), 'Must provide human-readable evaluation reasons');
      assert.ok(rejected.evaluationReasons.length > 0, 'Must have at least one explanation message');

      // Expected deterministic codes: WALKING_LIMIT_EXCEEDED, ARRIVAL_TOO_LATE, or TOO_MANY_TRANSFERS
      const expectedCodes = ['WALKING_LIMIT_EXCEEDED', 'ARRIVAL_TOO_LATE', 'TOO_MANY_TRANSFERS', 'ROUTE_DISRUPTED'];
      const hasExpectedCode = rejected.reasonCodes.some(code => expectedCodes.includes(code));
      assert.ok(hasExpectedCode, `Rejected code must be one of ${expectedCodes.join(', ')}, got: ${rejected.reasonCodes.join(', ')}`);
    });

    // TEST 5: Mixed Provenance - Verified Schedules & User-Reported Context
    await test('Mixed provenance: routes and comparison preserve multiple provenance tiers', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        disruptions: [
          {
            type: 'delay',
            affectedMode: 'metro',
            corridorOrArea: 'Metro Line 1',
            estimatedDelayMinutes: 15,
            severity: 'moderate',
            sourceTier: 'USER_REPORTED', // Explicit student/user reported tier
            description: 'Crowd congestion reported by student on platform'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.provenanceMetadata, 'Must have provenanceMetadata');
      assert.ok(Array.isArray(res.body.provenanceMetadata.dataTiers), 'dataTiers must be an array');

      // Ensure provenance tiers are tracked on individual routes
      const routes = res.body.routeComparison.routes;
      assert.ok(routes.length > 0);
      for (const r of routes) {
        assert.ok(r.provenance, 'Route must have provenance');
        assert.ok(r.provenance.tier, 'Route provenance must have tier');
      }

      assert.ok(res.body.routeComparison.provenanceSummary, 'Must have provenanceSummary in routeComparison');
    });

    // TEST 6: Preserved Privacy, Validation, and Auth Security
    await test('Security & Privacy: enforces auth, rejection of forbidden PII fields, and validation', async () => {
      // 1. Unauthenticated request -> 401
      const unauthRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { startingArea: 'Andheri West', destination: 'D.J. Sanghvi College of Engineering' });

      assert.strictEqual(unauthRes.status, 401);

      // 2. Privacy violation with exact coordinates / home address -> 400
      const privacyRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        homeAddress: 'Flat 402, Building 3, Juhu Scheme',
        coordinates: { lat: 19.1031, lng: 72.8362 }
      });

      assert.strictEqual(privacyRes.status, 400);
      assert.ok(privacyRes.body.error);

      // 3. Validation error on negative budget -> 400
      const validRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        maxBudgetRupees: -50
      });

      assert.strictEqual(validRes.status, 400);
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
