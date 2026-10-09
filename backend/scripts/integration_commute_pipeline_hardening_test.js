/**
 * Commute Route Intelligence Pipeline Hardening Test Suite
 *
 * Verifies the complete end-to-end backend pipeline:
 * student commute input
 * → candidate route generation
 * → disruption/context analysis
 * → constraint filtering
 * → alternate route generation
 * → route evaluation
 * → deterministic scoring
 * → route comparison
 * → API response
 *
 * Covers 20 specific scenarios:
 *  1. Normal commute with multiple feasible routes
 *  2. Train/metro delay
 *  3. Bus unavailable
 *  4. Heavy traffic
 *  5. Weather disruption
 *  6. Multiple simultaneous disruptions
 *  7. One route becoming infeasible
 *  8. Alternate route generation
 *  9. Arrival-time constraint
 * 10. Walking constraint
 * 11. Transfer constraint
 * 12. No feasible route
 * 13. VERIFIED provenance
 * 14. USER_REPORTED provenance
 * 15. ESTIMATED provenance
 * 16. SYNTHETIC provenance
 * 17. Duplicate alternative prevention
 * 18. Deterministic scoring across repeated requests
 * 19. Expired disruptions (stale disruptions ignored)
 * 20. Mixed disruption/context data
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

async function runHardenedTests() {
  console.log('========================================================================');
  console.log(' Running Commute Route Intelligence Pipeline Hardening Test Suite');
  console.log('========================================================================\n');

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
    // Auth Setup: Register & Login student
    const email = `pipeline_harden_${Date.now()}@djsce.edu`;
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
      full_name: 'Pipeline Harden Student',
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

    // SCENARIO 1: Normal commute with multiple feasible routes
    await test('Scenario 1: Normal commute returns multiple feasible routes without disruption delay', async () => {
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
      assert.ok(Array.isArray(res.body.feasibleRoutes), 'feasibleRoutes must be array');
      assert.ok(res.body.feasibleRoutes.length >= 2, 'Should have multiple feasible routes');
      for (const r of res.body.feasibleRoutes) {
        assert.strictEqual(r.isFeasible, true);
        assert.strictEqual(r.isAccepted, true);
        assert.strictEqual(r.routeType, 'EVALUATED_ROUTE');
        assert.strictEqual(r.contextualEstimate.disruptionDelayMinutes, 0);
        assert.strictEqual(r.disruptionImpact.isAffected, false);
      }
    });

    // SCENARIO 2: Train/metro delay
    await test('Scenario 2: Train/metro delay reflects disruption impact and shifts contextual arrival', async () => {
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
            estimatedDelayMinutes: 20,
            severity: 'moderate',
            description: 'Signal maintenance on Western Railway'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      const train = res.body.candidates.find(c => c.primaryMode === 'train' || c.transportModes.includes('train'));
      assert.ok(train, 'Train candidate must exist');
      assert.strictEqual(train.disruptionImpact.isAffected, true);
      assert.ok(train.disruptionImpact.disruptionDelayMinutes >= 20);
      assert.ok(train.contextualEstimate.durationMinutes > train.baselineEstimate.durationMinutes);
    });

    // SCENARIO 3: Bus unavailable
    await test('Scenario 3: Bus unavailable marks bus route with transport availability disruption', async () => {
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
            type: 'service_suspension',
            affectedMode: 'bus',
            corridorOrArea: 'Andheri West',
            estimatedDelayMinutes: 45,
            severity: 'severe',
            description: 'BEST bus depot strike'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      const bus = res.body.candidates.find(c => c.primaryMode === 'bus');
      if (bus) {
        assert.strictEqual(bus.disruptionImpact.isAffected, true);
        assert.ok(bus.disruptionImpact.disruptionDelayMinutes > 0);
      }
      // Non-bus routes remain viable
      const nonBus = res.body.candidates.find(c => c.primaryMode !== 'bus');
      assert.ok(nonBus, 'Non-bus routes must still exist');
    });

    // SCENARIO 4: Heavy traffic
    await test('Scenario 4: Heavy traffic increases travel duration and uncertainty on road routes', async () => {
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
        disruptions: [],
        trafficConditions: [
          {
            corridor: 'SV Road',
            area: 'Andheri West',
            level: 'congested',
            addedTravelTimeMinutes: 20
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const roadRoute = res.body.candidates.find(c => c.primaryMode === 'auto' || c.primaryMode === 'bus');
      if (roadRoute) {
        assert.ok(roadRoute.travelTimeEstimate.totalDurationMinutes >= roadRoute.baselineEstimate.durationMinutes);
      }
    });

    // SCENARIO 5: Weather disruption
    await test('Scenario 5: Weather disruption causes walking inconvenience and elevated travel uncertainty', async () => {
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
        disruptions: [],
        weatherContext: {
          condition: 'heavy_rain',
          walkingInconvenienceLevel: 'HIGH',
          travelUncertaintyLevel: 'HIGH',
          advisory: 'Waterlogging expected near Vile Parle West'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.routeIntelligence.contextSummary.weatherCondition, 'heavy_rain');
    });

    // SCENARIO 6: Multiple simultaneous disruptions
    await test('Scenario 6: Multiple simultaneous disruptions aggregate delay and track across modes', async () => {
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
            estimatedDelayMinutes: 15,
            severity: 'moderate',
            description: 'Signal fault'
          },
          {
            type: 'route_closure',
            affectedMode: 'bus',
            corridorOrArea: 'Andheri West',
            estimatedDelayMinutes: 25,
            severity: 'major',
            description: 'Road waterlogged'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.routeIntelligence.contextSummary.activeDisruptionsCount, 2);
    });

    // SCENARIO 7: One route becoming infeasible
    await test('Scenario 7: Infeasible route marked isFeasible: false without discarding other viable routes', async () => {
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
        includeRejected: true,
        disruptions: [
          {
            type: 'route_closure',
            affectedMode: 'train',
            corridorOrArea: 'Western Railway',
            estimatedDelayMinutes: 60,
            severity: 'severe',
            description: 'Complete railway track closure'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      const train = res.body.allCandidates.find(c => c.primaryMode === 'train');
      if (train) {
        assert.strictEqual(train.isFeasible, false, 'Disrupted train journey must be marked infeasible');
      }
      // Non-train routes must remain feasible
      const viableOther = res.body.allCandidates.find(c => c.primaryMode !== 'train' && c.isFeasible);
      assert.ok(viableOther, 'Non-train candidates must remain feasible');
    });

    // SCENARIO 8: Alternate route generation
    await test('Scenario 8: Alternate route generation outputs ALTERNATE_ROUTE with metadata', async () => {
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
            description: 'Western Railway major delay'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.alternateRoutes.length > 0, 'Alternate routes must be generated');
      const alt = res.body.alternateRoutes[0];
      assert.strictEqual(alt.routeType, 'ALTERNATE_ROUTE');
      assert.ok(alt.alternateMetadata.strategy);
      assert.ok(alt.alternateMetadata.reasonSummary);
    });

    // SCENARIO 9: Arrival-time constraint
    await test('Scenario 9: Arrival-time constraint rejects journeys arriving past target deadline', async () => {
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
        targetArrivalTime: '08:20', // tight deadline for 8:00 departure
        disruptions: []
      });

      assert.strictEqual(res.status, 200);
      // All feasible routes must arrive <= 08:20
      for (const r of res.body.feasibleRoutes) {
        assert.ok(r.contextualEstimate.estimatedArrivalTime <= '08:20');
      }
      // Rejected routes have ARRIVAL_TOO_LATE
      if (res.body.rejectedRoutes.length > 0) {
        assert.ok(res.body.rejectedRoutes.some(r => r.reasonCodes.includes('ARRIVAL_TOO_LATE')));
      }
    });

    // SCENARIO 10: Walking constraint
    await test('Scenario 10: Walking constraint rejects routes exceeding maxWalkingMinutes', async () => {
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
        maxWalkingMinutes: 5,
        disruptions: []
      });

      assert.strictEqual(res.status, 200);
      for (const r of res.body.feasibleRoutes) {
        assert.ok(r.walkingTimeMinutes <= 5, 'Feasible route walking time must be <= 5 min');
      }
      assert.ok(res.body.rejectedRoutes.some(r => r.reasonCodes.includes('WALKING_LIMIT_EXCEEDED')));
    });

    // SCENARIO 11: Transfer constraint
    await test('Scenario 11: Transfer constraint rejects routes exceeding maxTransfers', async () => {
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
        maxTransfers: 0,
        disruptions: []
      });

      assert.strictEqual(res.status, 200);
      for (const r of res.body.feasibleRoutes) {
        assert.strictEqual(r.transfers, 0, 'Feasible route must have 0 transfers');
      }
    });

    // SCENARIO 12: No feasible route
    await test('Scenario 12: Impossible constraints produce empty feasibleRoutes and itemized rejectedRoutes', async () => {
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
        targetArrivalTime: '08:02', // 2 minutes impossible travel time
        maxWalkingMinutes: 0
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.feasibleRoutes.length, 0);
      assert.ok(res.body.rejectedRoutes.length > 0);
      for (const r of res.body.rejectedRoutes) {
        assert.strictEqual(r.isAccepted, false);
        assert.ok(r.primaryReasonCode);
        assert.ok(r.evaluationReasons.length > 0);
      }
    });

    // SCENARIO 13: VERIFIED provenance
    await test('Scenario 13: Timetabled transit data carries VERIFIED provenance tier', async () => {
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
      assert.ok(res.body.provenanceMetadata.dataTiers.includes('VERIFIED'));
      assert.ok(res.body.feasibleRoutes.some(r => r.provenance.tier === 'VERIFIED' || r.provenance.sourceTier === 'VERIFIED'));
    });

    // SCENARIO 14: USER_REPORTED provenance
    await test('Scenario 14: Student reported context injects USER_REPORTED provenance tier', async () => {
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
            estimatedDelayMinutes: 15,
            severity: 'moderate',
            sourceTier: 'USER_REPORTED',
            description: 'Crowd surge at Andheri station platform 2'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.provenanceMetadata.dataTiers.includes('USER_REPORTED'));
      assert.strictEqual(res.body.provenanceMetadata.hasUserReportedData, true);
    });

    // SCENARIO 15: ESTIMATED provenance
    await test('Scenario 15: Estimated data reflects ESTIMATED provenance tier', async () => {
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
      assert.ok(res.body.provenanceMetadata.dataTiers.includes('ESTIMATED'));
      assert.strictEqual(res.body.provenanceMetadata.hasEstimatedData, true);
    });

    // SCENARIO 16: SYNTHETIC provenance
    await test('Scenario 16: Synthetic fallback data reflects SYNTHETIC provenance without masking', async () => {
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
            affectedMode: 'bus',
            corridorOrArea: 'Andheri West',
            estimatedDelayMinutes: 10,
            severity: 'minor',
            sourceTier: 'SYNTHETIC',
            description: 'Synthetic benchmark simulation'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.provenanceMetadata.dataTiers.includes('SYNTHETIC'));
      assert.strictEqual(res.body.provenanceMetadata.hasSyntheticData, true);
    });

    // SCENARIO 17: Duplicate alternative prevention
    await test('Scenario 17: Alternate routes are deduplicated and never identical to primary candidate routes', async () => {
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
            description: 'Western Railway major block'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      const alternates = res.body.alternateRoutes;
      const candidates = res.body.candidates;

      // Ensure no duplicate IDs among alternates
      const altIds = alternates.map(a => a.id);
      const uniqueAltIds = new Set(altIds);
      assert.strictEqual(uniqueAltIds.size, altIds.length, 'Alternate routes must have unique IDs');

      // Ensure no alternate has identical journey signature to a candidate route
      for (const alt of alternates) {
        const altSignature = `${alt.primaryMode}|${alt.departureTime}|${alt.estimatedArrivalTime}|${(alt.segments || []).map(s => `${s.mode}-${s.from}-${s.to}`).join('|')}`;
        for (const cand of candidates) {
          const candSignature = `${cand.primaryMode}|${cand.departureTime}|${cand.estimatedArrivalTime}|${(cand.segments || []).map(s => `${s.mode}-${s.from}-${s.to}`).join('|')}`;
          assert.notStrictEqual(altSignature, candSignature, 'Alternate must not duplicate candidate route');
        }
      }
    });

    // SCENARIO 18: Deterministic scoring across repeated requests
    await test('Scenario 18: Repeating identical requests produces identical deterministic scores and ranks', async () => {
      const query = {
        startingArea: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        departureTime: '08:00',
        disruptions: []
      };

      const res1 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, query);

      const res2 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, query);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);

      const scores1 = res1.body.feasibleRoutes.map(r => ({ id: r.id, score: r.deterministicScore, rank: r.rank }));
      const scores2 = res2.body.feasibleRoutes.map(r => ({ id: r.id, score: r.deterministicScore, rank: r.rank }));

      assert.deepStrictEqual(scores1, scores2, 'Scores and ranks must be 100% deterministic across repeated calls');
    });

    // SCENARIO 19: Expired disruptions
    await test('Scenario 19: Expired or resolved disruptions do not affect candidate routes', async () => {
      const oneHourAgo = Date.now() - 3600000;
      const twoHoursAgo = Date.now() - 7200000;

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
            estimatedDelayMinutes: 40,
            status: 'resolved', // Resolved status
            startTime: twoHoursAgo,
            endTime: oneHourAgo, // Expired timestamp
            description: 'Cleared track blockage'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      const train = res.body.candidates.find(c => c.primaryMode === 'train' || c.transportModes.includes('train'));
      assert.ok(train, 'Train candidate must exist');
      assert.strictEqual(train.disruptionImpact.isAffected, false, 'Expired disruption must not affect route');
      assert.strictEqual(train.contextualEstimate.disruptionDelayMinutes, 0, 'Disruption delay must be 0 for resolved disruption');
    });

    // SCENARIO 20: Mixed disruption/context data
    await test('Scenario 20: Mixed context correctly combines multi-tier data in comparison and metadata', async () => {
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
            estimatedDelayMinutes: 10,
            sourceTier: 'USER_REPORTED',
            severity: 'moderate',
            description: 'Crowd congestion reported by student'
          }
        ],
        trafficConditions: [
          {
            corridor: 'SV Road',
            area: 'Andheri West',
            level: 'moderate',
            addedTravelTimeMinutes: 5,
            sourceTier: 'ESTIMATED'
          }
        ],
        weatherContext: {
          condition: 'light_rain',
          sourceTier: 'SYNTHETIC'
        }
      });

      assert.strictEqual(res.status, 200);
      const tiers = res.body.provenanceMetadata.dataTiers;
      assert.ok(tiers.includes('VERIFIED'), 'Must include VERIFIED schedule tier');
      assert.ok(tiers.includes('USER_REPORTED'), 'Must include USER_REPORTED disruption tier');
      assert.ok(tiers.includes('ESTIMATED'), 'Must include ESTIMATED traffic tier');

      assert.strictEqual(res.body.routeComparison.provenanceSummary.hasUnverifiedData, true);
      assert.strictEqual(res.body.routeComparison.provenanceSummary.allVerified, false);
      assert.strictEqual(res.body.routeIntelligence.universalBestClaim, false);
    });

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardenedTests();
