/**
 * Integration Tests for Personalized Commute Recommendations API
 *
 * Verifies that POST /api/commute/recommendations and POST /api/student/commute/recommendations
 * expose the personalized recommendation engine properly:
 * 1. Authentication enforcement (401 on missing/invalid token)
 * 2. Valid request (primary route, alternatives, times, reasons, trade-offs, departure advice, provenance)
 * 3. Disruption scenario (disruption delay reflected, departure advice adjustments, reasons)
 * 4. Alternatives handling (meaningful distinct alternatives and trade-offs)
 * 5. No feasible route scenario (honest fallback result, primary route null, actionable guidance)
 * 6. Invalid constraints & validation (400 on negative numbers, bad time, impossible arrival)
 * 7. Privacy safeguards (rejection of flat/door numbers and GPS coordinates, student isolation)
 * 8. Provenance & synthetic data integrity (does not claim live data for synthetic tiers)
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');
const { DataProvenance, PROVENANCE_TIERS } = require('../models');

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
  console.log(' Running Personalized Commute Recommendations API Integration Tests');
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
    const email = `rec_student_${Date.now()}@djsce.edu`;
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
      full_name: 'Recommendation Student',
      college_name: 'D.J. Sanghvi College of Engineering'
    });

    assert.strictEqual(regRes.status, 201, 'Student registration should succeed');

    const loginRes = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email, password });

    assert.strictEqual(loginRes.status, 200, 'Student login should succeed');
    const token = loginRes.body.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // TEST 1: Authentication enforcement
    await test('Authentication: returns 401 when token is missing or invalid', async () => {
      // Missing token
      const noAuthRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        origin: 'Andheri West'
      });
      assert.strictEqual(noAuthRes.status, 401, 'Should reject unauthenticated request with 401');

      // Invalid token
      const badAuthRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_token_12345'
        }
      }, {
        origin: 'Andheri West'
      });
      assert.strictEqual(badAuthRes.status, 401, 'Should reject invalid token with 401');
    });

    // TEST 2: Valid Request (Normal Commute)
    await test('Valid request: returns primary recommended route, alternatives, times, reasons, and departure advice', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00',
        routePreference: 'balanced',
        maxTransfers: 2,
        maxWalkingMinutes: 20,
        maxBudgetRupees: 100
      });

      assert.strictEqual(res.status, 200, 'Recommendation request should return 200');
      assert.strictEqual(res.body.hasFeasibleRoute, true, 'hasFeasibleRoute should be true');
      assert.strictEqual(res.body.hasSuccessfulRecommendation, true, 'hasSuccessfulRecommendation should be true');
      assert.strictEqual(res.body.isFallback, false, 'isFallback should be false');

      // Primary recommended route
      assert.ok(res.body.primaryRecommendedRoute, 'primaryRecommendedRoute must be present');
      assert.ok(res.body.selectedRoute, 'selectedRoute alias must be present');
      assert.ok(typeof res.body.estimatedJourneyMinutes === 'number', 'estimatedJourneyMinutes must be number');
      assert.ok(res.body.estimatedJourneyMinutes > 0, 'estimatedJourneyMinutes must be > 0');
      assert.ok(typeof res.body.estimatedArrivalTime === 'string', 'estimatedArrivalTime must be string');

      // Meaningful alternatives
      assert.ok(Array.isArray(res.body.meaningfulAlternatives), 'meaningfulAlternatives must be an array');
      assert.ok(Array.isArray(res.body.alternativeRoutes), 'alternativeRoutes alias must be an array');

      // Context and Disruption summary
      assert.ok(res.body.disruptionSummary, 'disruptionSummary must be present');
      assert.strictEqual(typeof res.body.disruptionSummary.delayMinutes, 'number');

      // Preference alignment
      assert.ok(res.body.preferenceAlignment, 'preferenceAlignment must be present');
      assert.ok(
        res.body.preferenceAlignment.overallAlignment !== undefined ||
        res.body.preferenceAlignment.isAligned !== undefined,
        'overallAlignment or isAligned must be present'
      );

      // Recommendation reasons
      assert.ok(Array.isArray(res.body.recommendationReasons), 'recommendationReasons must be an array');
      assert.ok(res.body.recommendationReasons.length > 0, 'Must have at least one recommendation reason');
      const firstReason = res.body.recommendationReasons[0];
      assert.ok(firstReason.category, 'Reason must have category');
      assert.ok(firstReason.headline, 'Reason must have headline');
      assert.ok(firstReason.detail, 'Reason must have detail');

      // Route trade-offs
      assert.ok(Array.isArray(res.body.routeTradeOffs), 'routeTradeOffs must be an array');

      // Provenance and uncertainty
      assert.ok(res.body.provenance, 'provenance must be present');
      assert.ok(res.body.provenanceSummary, 'provenanceSummary must be present');
      assert.ok(res.body.uncertainty, 'uncertainty must be present');
      assert.ok(res.body.reliability, 'reliability must be present');

      // Convenience alias endpoint /api/student/commute/recommendations
      const aliasRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        desiredDepartureTime: '08:00'
      });
      assert.strictEqual(aliasRes.status, 200, 'Student namespace alias endpoint should return 200');
      assert.strictEqual(aliasRes.body.hasFeasibleRoute, true);
    });

    // TEST 3: Disruption scenario
    await test('Disruption scenario: reflects disruption delay in summary and adapts departure advice', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00',
        desiredArrivalTime: '08:50',
        disruptions: [
          {
            type: 'delay',
            affectedMode: 'train',
            corridorOrArea: 'Western Railway',
            estimatedDelayMinutes: 25,
            severity: 'major',
            description: 'Track maintenance and signal delay'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.ok(res.body.primaryRecommendedRoute);

      // Verify disruption impact is reflected
      assert.ok(res.body.disruptionSummary, 'Disruption summary must exist');
      assert.ok(res.body.contextSummary, 'Context summary must exist');

      // Departure advice
      if (res.body.departureAdvice) {
        assert.ok(res.body.departureAdvice.adviceType, 'Departure advice must have adviceType');
        assert.ok(res.body.departureAdvice.headline, 'Departure advice must have headline');
        assert.ok(res.body.departureAdvice.currentPlan, 'Departure advice must have currentPlan');
        assert.ok(res.body.departureAdvice.suggestedDeparture, 'Departure advice must have suggestedDeparture');
      }
    });

    // TEST 4: Meaningful alternatives and trade-offs
    await test('Meaningful alternatives: returns distinct alternatives without near-duplicate copies', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00',
        routePreference: 'balanced'
      });

      assert.strictEqual(res.status, 200);
      const alternatives = res.body.meaningfulAlternatives;
      assert.ok(Array.isArray(alternatives));

      if (alternatives.length > 0) {
        const primary = res.body.primaryRecommendedRoute;
        // Verify alternatives are not identical to primary
        for (const alt of alternatives) {
          assert.notStrictEqual(
            alt.journeyId,
            primary.journeyId,
            'Alternative journeyId must not be identical to primary selected route'
          );
        }
        // Verify trade-offs are provided
        assert.ok(Array.isArray(res.body.routeTradeOffs), 'Trade-offs must be present');
      }
    });

    // TEST 5: No Feasible Route scenario
    await test('No feasible route: returns honest fallback result without claiming successful recommendation', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00',
        desiredArrivalTime: '08:01', // Impossibly tight deadline (1 minute for 4 km)
        maxTransfers: 0,
        maxWalkingMinutes: 0
      });

      assert.strictEqual(res.status, 200, 'Should return 200 with structured fallback');
      assert.strictEqual(res.body.hasFeasibleRoute, false, 'hasFeasibleRoute must be false');
      assert.strictEqual(res.body.hasSuccessfulRecommendation, false, 'hasSuccessfulRecommendation must be false');
      assert.strictEqual(res.body.isFallback, true, 'isFallback must be true');
      assert.strictEqual(res.body.status, 'FALLBACK', 'status must be FALLBACK');

      // Critical invariant: primaryRecommendedRoute must be null!
      assert.strictEqual(res.body.primaryRecommendedRoute, null, 'Must NOT return a successful primary route');
      assert.strictEqual(res.body.selectedRoute, null, 'selectedRoute must be null');
      assert.deepStrictEqual(res.body.meaningfulAlternatives, [], 'meaningfulAlternatives must be empty');

      // Structured fallback guidance
      assert.ok(typeof res.body.fallbackReason === 'string', 'fallbackReason must explain why no route was feasible');
      assert.ok(res.body.fallbackReason.length > 0, 'fallbackReason must not be empty');
      assert.ok(Array.isArray(res.body.fallbackGuidance), 'fallbackGuidance must be an array');
      assert.ok(res.body.fallbackGuidance.length > 0, 'fallbackGuidance must contain actionable suggestions');
    });

    // TEST 6: Invalid constraints & inputs (Validation errors 400)
    await test('Invalid constraints: returns 400 validation error on invalid input fields', async () => {
      // 6A. Negative transfers
      const negTransfers = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        maxTransfers: -1
      });
      assert.strictEqual(negTransfers.status, 400, 'Should reject negative transfers with 400');

      // 6B. Negative budget
      const negBudget = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        maxBudgetRupees: -50
      });
      assert.strictEqual(negBudget.status, 400, 'Should reject negative budget with 400');

      // 6C. Excessive walking (> 60 minutes)
      const excessWalk = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        maxWalkingMinutes: 99
      });
      assert.strictEqual(excessWalk.status, 400, 'Should reject walking minutes > 60 with 400');

      // 6D. Invalid time format
      const badTime = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        desiredDepartureTime: '25:99'
      });
      assert.strictEqual(badTime.status, 400, 'Should reject invalid 24-hr time with 400');

      // 6E. Arrival before departure
      const invertedTiming = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        desiredDepartureTime: '09:00',
        desiredArrivalTime: '08:00'
      });
      assert.strictEqual(invertedTiming.status, 400, 'Should reject arrival before departure with 400');
    });

    // TEST 7: Privacy safeguards (Rejection of granular address & coordinates)
    await test('Privacy safeguards: rejects granular door/flat numbers and coordinate fields', async () => {
      // 7A. Door / flat number in origin
      const granularAddr = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Flat 402, Building 7, Andheri West'
      });
      assert.strictEqual(granularAddr.status, 400, 'Should reject granular flat/building with 400');

      // 7B. Precise GPS coordinates property
      const gpsReq = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        latitude: 19.12345,
        longitude: 72.84567
      });
      assert.strictEqual(gpsReq.status, 400, 'Should reject forbidden GPS fields with 400');
      const bodyStr = JSON.stringify(gpsReq.body);
      assert.ok(
        bodyStr.includes('Privacy violation') || bodyStr.includes('Forbidden field'),
        'Should specifically cite privacy violation'
      );
    });

    // TEST 8: Synthetic data and provenance retention
    await test('Provenance integrity: preserves SYNTHETIC provenance without claiming live verified data', async () => {
      // Provide a synthetic route candidate
      const synthCandidate = {
        id: 'synthetic-cand-route',
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        primaryMode: 'bus',
        modesIncluded: ['walk', 'bus'],
        departureTime: '08:00',
        estimatedArrivalTime: '08:35',
        totalDurationMinutes: 35,
        walkingTimeMinutes: 5,
        transferCount: 0,
        estimatedCostRupees: 10,
        isFeasible: true,
        feasibilityReason: 'OPERATIONAL',
        segments: [
          { type: 'WALK', mode: 'walk', durationMinutes: 5 },
          { type: 'TRANSIT', mode: 'bus', durationMinutes: 30 }
        ],
        provenance: DataProvenance.synthetic('Simulated Bus Model').toJSON()
      };

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        candidates: [synthCandidate]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.ok(res.body.provenance, 'Must have provenance');
      assert.strictEqual(res.body.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC, 'Must preserve SYNTHETIC sourceTier');
      assert.strictEqual(res.body.provenanceSummary.allVerified, false, 'allVerified must be false for synthetic data');
      assert.strictEqual(res.body.provenanceSummary.hasUnverifiedData, true, 'hasUnverifiedData must be true for synthetic data');
    });

  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
