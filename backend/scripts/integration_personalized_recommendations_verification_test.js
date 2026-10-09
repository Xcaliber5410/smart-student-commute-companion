/**
 * Master Verification Test Suite for Personalized Commute Recommendations Pipeline
 *
 * Verifies the complete end-to-end pipeline:
 * student commute input
 * → candidate routes
 * → disruption/context analysis
 * → constraint filtering
 * → alternate routes
 * → route evaluation
 * → personalized scoring
 * → recommendation selection
 * → explanation generation
 * → departure advice
 * → API response
 *
 * Covers all 21 required scenarios:
 * 1. Normal commute with multiple feasible routes
 * 2. Faster-route preference
 * 3. Lower-cost preference when cost data exists
 * 4. Fewer-transfers preference
 * 5. Reduced-walking preference
 * 6. Preferred transport modes
 * 7. Hard constraints overriding soft preferences
 * 8. Train or metro disruption
 * 9. Bus unavailability
 * 10. Multiple simultaneous disruptions
 * 11. Earlier-departure advice when justified
 * 12. Arrival deadline that cannot be met
 * 13. No feasible routes
 * 14. Missing or incomplete transport data
 * 15. VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC provenance
 * 16. Explanations matching actual route metrics
 * 17. Deterministic recommendations for identical inputs
 * 18. Duplicate alternative prevention
 * 19. Expired disruptions not affecting current recommendations
 * 20. Authentication, validation, and privacy safeguards
 * 21. Existing backend regressions
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

function createCandidate(overrides = {}) {
  const departureTime = overrides.departureTime || '08:00';
  const duration = overrides.durationMinutes ?? overrides.totalDurationMinutes ?? 25;
  const [h, m] = departureTime.split(':').map(Number);
  const totalMins = (h * 60 + m + duration) % 1440;
  const arrH = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const arrM = (totalMins % 60).toString().padStart(2, '0');
  const estimatedArrivalTime = overrides.estimatedArrivalTime || `${arrH}:${arrM}`;

  return {
    id: overrides.id || `route-${Math.random().toString(36).substring(2, 7)}`,
    origin: overrides.origin || 'Andheri West',
    destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
    departureTime,
    estimatedArrivalTime,
    totalDurationMinutes: duration,
    walkingTimeMinutes: overrides.walkingTimeMinutes ?? 5,
    transferCount: overrides.transferCount ?? 0,
    estimatedCostRupees: overrides.estimatedCostRupees !== undefined ? overrides.estimatedCostRupees : 20,
    primaryMode: overrides.primaryMode || 'metro',
    modesIncluded: overrides.modesIncluded || [overrides.primaryMode || 'metro', 'walk'],
    isFeasible: overrides.isFeasible !== undefined ? overrides.isFeasible : true,
    feasibilityReason: overrides.feasibilityReason || 'OPERATIONAL',
    segments: overrides.segments || [
      {
        type: 'WALK',
        mode: 'walk',
        fromArea: overrides.origin || 'Andheri West',
        toArea: 'Andheri Metro',
        durationMinutes: overrides.walkingTimeMinutes ?? 5
      },
      {
        type: 'TRANSIT',
        mode: overrides.primaryMode || 'metro',
        lineName: 'Metro Line 1',
        fromArea: 'Andheri Metro',
        toArea: overrides.destination || 'D.J. Sanghvi College of Engineering',
        durationMinutes: duration - (overrides.walkingTimeMinutes ?? 5)
      }
    ],
    provenance: overrides.provenance || DataProvenance.verified('Transit Feed', 'Official schedule').toJSON()
  };
}

async function runVerificationSuite() {
  console.log('========================================================================');
  console.log(' Master Verification: Personalized Commute Recommendations Pipeline');
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
    // Setup authenticated student account
    const email = `master_student_${Date.now()}@djsce.edu`;
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
      full_name: 'Master Commute Student',
      college_name: 'D.J. Sanghvi College of Engineering'
    });

    assert.strictEqual(regRes.status, 201, 'Student registration must succeed');

    const loginRes = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email, password });

    assert.strictEqual(loginRes.status, 200, 'Student login must succeed');
    const token = loginRes.body.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 1. Normal commute with multiple feasible routes
    await test('1. Normal commute with multiple feasible routes', async () => {
      const candMetro = createCandidate({ id: 'c-metro', primaryMode: 'metro', durationMinutes: 25, estimatedCostRupees: 20 });
      const candBus = createCandidate({ id: 'c-bus', primaryMode: 'bus', durationMinutes: 40, estimatedCostRupees: 10 });
      const candAuto = createCandidate({ id: 'c-auto', primaryMode: 'auto', durationMinutes: 18, estimatedCostRupees: 80 });

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
        candidates: [candMetro, candBus, candAuto]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.strictEqual(res.body.hasSuccessfulRecommendation, true);
      assert.strictEqual(res.body.isFallback, false);
      assert.ok(res.body.primaryRecommendedRoute);
      assert.ok(Array.isArray(res.body.meaningfulAlternatives));
      assert.ok(res.body.meaningfulAlternatives.length > 0);
      assert.ok(Array.isArray(res.body.recommendationReasons));
      assert.ok(res.body.recommendationReasons.length > 0);
      assert.ok(Array.isArray(res.body.routeTradeOffs));
      assert.ok(res.body.provenance);
    });

    // 2. Faster-route preference
    await test('2. Faster-route preference prioritizes minimal commute duration', async () => {
      const candFast = createCandidate({ id: 'c-fast', primaryMode: 'auto', durationMinutes: 15, estimatedCostRupees: 90 });
      const candSlow = createCandidate({ id: 'c-slow', primaryMode: 'bus', durationMinutes: 35, estimatedCostRupees: 10 });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candFast, candSlow],
        routePreference: 'fastest'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-fast');
      assert.strictEqual(res.body.primaryRecommendedRoute.totalTravelTimeMinutes, 15);
      // Explanation or reason confirms speed optimization
      const hasSpeedReason = res.body.recommendationReasons.some(r =>
        r.headline.toLowerCase().includes('commute duration') ||
        r.headline.toLowerCase().includes('speed') ||
        r.detail.toLowerCase().includes('faster')
      );
      assert.ok(hasSpeedReason, 'Reasons must highlight faster journey');
    });

    // 3. Lower-cost preference when cost data exists
    await test('3. Lower-cost preference prioritizes lowest transit fare', async () => {
      const candExpensive = createCandidate({ id: 'c-exp', primaryMode: 'auto', durationMinutes: 15, estimatedCostRupees: 95 });
      const candCheap = createCandidate({ id: 'c-cheap', primaryMode: 'bus', durationMinutes: 32, estimatedCostRupees: 8 });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candExpensive, candCheap],
        routePreference: 'cheapest'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-cheap');
      assert.strictEqual(res.body.primaryRecommendedRoute.estimatedCostRupees, 8);
    });

    // 4. Fewer-transfers preference
    await test('4. Fewer-transfers preference favors direct routes over complex interchanges', async () => {
      const candDirect = createCandidate({ id: 'c-direct', primaryMode: 'train', durationMinutes: 28, transferCount: 0 });
      const candTransfer = createCandidate({ id: 'c-transfers', primaryMode: 'metro', durationMinutes: 26, transferCount: 2 });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candDirect, candTransfer],
        routePreference: 'fewest_transfers'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-direct');
      assert.strictEqual(res.body.primaryRecommendedRoute.transfers, 0);
    });

    // 5. Reduced-walking preference
    await test('5. Reduced-walking preference prioritizes low pedestrian exertion', async () => {
      const candLowWalk = createCandidate({ id: 'c-low-walk', primaryMode: 'auto', durationMinutes: 22, walkingTimeMinutes: 2 });
      const candHighWalk = createCandidate({ id: 'c-high-walk', primaryMode: 'train', durationMinutes: 20, walkingTimeMinutes: 18 });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candLowWalk, candHighWalk],
        routePreference: 'least_walking'
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-low-walk');
      assert.strictEqual(res.body.primaryRecommendedRoute.walkingTimeMinutes, 2);
    });

    // 6. Preferred transport modes
    await test('6. Preferred transport modes gives decisive score boost to preferred mode', async () => {
      const candTrain = createCandidate({ id: 'c-pref-train', primaryMode: 'train', durationMinutes: 25, estimatedCostRupees: 15 });
      const candBus = createCandidate({ id: 'c-other-bus', primaryMode: 'bus', durationMinutes: 24, estimatedCostRupees: 15 });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candTrain, candBus],
        preferredModes: ['train']
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-pref-train');
      assert.strictEqual(res.body.primaryRecommendedRoute.primaryMode, 'train');
    });

    // 7. Hard constraints overriding soft preferences
    await test('7. Hard constraints strictly override soft preferences', async () => {
      // Fast candidate violates arrival deadline (or walking limit)
      const candFastViolator = createCandidate({
        id: 'c-fast-violator',
        primaryMode: 'auto',
        departureTime: '08:30',
        durationMinutes: 40,
        estimatedArrivalTime: '09:10', // Arrives after 09:00 deadline
        walkingTimeMinutes: 25 // Exceeds 10 min walking limit
      });
      const candSlowerCompliant = createCandidate({
        id: 'c-slow-compliant',
        primaryMode: 'metro',
        departureTime: '08:00',
        durationMinutes: 45,
        estimatedArrivalTime: '08:45', // Arrives before 09:00 deadline
        walkingTimeMinutes: 6
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candFastViolator, candSlowerCompliant],
        routePreference: 'fastest', // Student prefers fastest!
        desiredArrivalTime: '09:00', // But hard deadline is 09:00
        maxWalkingMinutes: 10 // And hard walking limit is 10 min
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      // Invariant: violator is NEVER selected!
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-slow-compliant');
      assert.ok(res.body.primaryRecommendedRoute.estimatedArrivalTime <= '09:00');
    });

    // 8. Train or metro disruption
    await test('8. Train or metro disruption adds delay buffer and pivots to undisrupted alternate', async () => {
      const candTrainDisrupted = createCandidate({
        id: 'c-train-delayed',
        primaryMode: 'train',
        durationMinutes: 20,
        segments: [
          { type: 'TRANSIT', mode: 'train', lineName: 'Western Railway', corridorOrArea: 'Western Railway', durationMinutes: 20 }
        ]
      });
      const candMetroClean = createCandidate({
        id: 'c-metro-clean',
        primaryMode: 'metro',
        durationMinutes: 26,
        segments: [
          { type: 'TRANSIT', mode: 'metro', lineName: 'Metro Line 1', corridorOrArea: 'Versova-Ghatkopar', durationMinutes: 26 }
        ]
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candTrainDisrupted, candMetroClean],
        disruptions: [
          {
            type: 'delay',
            affectedMode: 'train',
            corridorOrArea: 'Western Railway',
            estimatedDelayMinutes: 30,
            severity: 'major',
            description: 'Signal failure between Bandra and Andheri'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      // Clean metro route prioritized over heavily delayed train
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-metro-clean');
      const hasAvoidanceReason = res.body.recommendationReasons.some(r =>
        r.category === 'DISRUPTION_AVOIDANCE' || r.headline.toLowerCase().includes('clear') || r.headline.toLowerCase().includes('unobstructed')
      );
      assert.ok(hasAvoidanceReason, 'Must provide disruption avoidance reason');
    });

    // 9. Bus unavailability
    await test('9. Bus unavailability penalizes or eliminates suspended bus corridor', async () => {
      const candBusSuspended = createCandidate({
        id: 'c-bus-suspended',
        primaryMode: 'bus',
        durationMinutes: 20,
        isFeasible: false,
        feasibilityReason: 'SERVICE_SUSPENDED'
      });
      const candAutoAvailable = createCandidate({
        id: 'c-auto-avail',
        primaryMode: 'auto',
        durationMinutes: 24,
        isFeasible: true,
        feasibilityReason: 'OPERATIONAL'
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candBusSuspended, candAutoAvailable]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.strictEqual(res.body.primaryRecommendedRoute.journeyId, 'c-auto-avail');
    });

    // 10. Multiple simultaneous disruptions
    await test('10. Multiple simultaneous disruptions aggregate delay buffers and elevate caution', async () => {
      const candMultiDisrupted = createCandidate({
        id: 'c-multi-disrupted',
        primaryMode: 'train',
        durationMinutes: 20,
        segments: [
          { type: 'TRANSIT', mode: 'train', fromArea: 'Andheri', toArea: 'Vile Parle', corridorOrArea: 'Western Railway', durationMinutes: 12 },
          { type: 'ROAD', mode: 'auto', fromArea: 'Vile Parle', toArea: 'D.J. Sanghvi', corridorOrArea: 'SV Road', durationMinutes: 8 }
        ]
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candMultiDisrupted],
        disruptions: [
          { type: 'delay', affectedMode: 'train', corridorOrArea: 'Western Railway', estimatedDelayMinutes: 15, severity: 'moderate' },
          { type: 'delay', affectedMode: 'auto', corridorOrArea: 'SV Road', estimatedDelayMinutes: 10, severity: 'moderate' }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.ok(res.body.disruptionSummary.delayMinutes >= 20, 'Delays across both legs must aggregate');
      assert.ok(res.body.warnings.length > 0, 'Warnings must notify of disruption delay');
    });

    // 11. Earlier-departure advice when justified
    await test('11. Earlier-departure advice when justified recommends earlier departure', async () => {
      const candMetro = createCandidate({
        id: 'c-metro-delayed',
        primaryMode: 'metro',
        departureTime: '08:00',
        durationMinutes: 25,
        estimatedArrivalTime: '08:25',
        segments: [
          { type: 'TRANSIT', mode: 'metro', fromArea: 'Versova', toArea: 'Andheri', corridorOrArea: 'Metro Line 1', durationMinutes: 25 }
        ]
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        desiredDepartureTime: '08:00',
        desiredArrivalTime: '08:42',
        candidates: [candMetro],
        disruptions: [
          { type: 'delay', affectedMode: 'metro', corridorOrArea: 'Metro Line 1', estimatedDelayMinutes: 15, severity: 'major' }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.departureAdvice, 'departureAdvice must be generated');
      assert.ok(res.body.departureAdvice.suggestedDeparture, 'suggestedDeparture must exist');
      // With 25 min base + 15 min delay = 40 min journey, 08:00 departure arrives 08:40. Margin to 08:42 is 2 min (< 5 min buffer)
      assert.strictEqual(
        res.body.departureAdvice.adviceType,
        'EARLIER_DEPARTURE_RECOMMENDED',
        'Should recommend earlier departure due to thin safety margin'
      );
      assert.ok(res.body.departureAdvice.suggestedDeparture.earlierByMinutes >= 3);
    });

    // 12. Arrival deadline that cannot be met
    await test('12. Arrival deadline that cannot be met reports honest unachievable status', async () => {
      // 50 minute journey requested at 08:00 with deadline 08:15 (unachievable)
      const candLong = createCandidate({
        id: 'c-long-journey',
        departureTime: '08:00',
        durationMinutes: 50,
        estimatedArrivalTime: '08:50'
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        desiredDepartureTime: '08:00',
        desiredArrivalTime: '08:15',
        candidates: [candLong]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, false, 'No feasible route can meet 08:15 deadline');
      assert.strictEqual(res.body.primaryRecommendedRoute, null);
      assert.strictEqual(res.body.status, 'FALLBACK');
      assert.ok(typeof res.body.fallbackReason === 'string' && res.body.fallbackReason.length > 0);
      assert.ok(Array.isArray(res.body.fallbackGuidance) && res.body.fallbackGuidance.length > 0);
    });

    // 13. No feasible routes
    await test('13. No feasible routes returns clean fallback result with actionable suggestions', async () => {
      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        desiredDepartureTime: '08:00',
        desiredArrivalTime: '08:01', // Impossibly tight
        maxTransfers: 0,
        maxWalkingMinutes: 0
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, false);
      assert.strictEqual(res.body.hasSuccessfulRecommendation, false);
      assert.strictEqual(res.body.isFallback, true);
      assert.strictEqual(res.body.status, 'FALLBACK');
      assert.strictEqual(res.body.primaryRecommendedRoute, null);
      assert.ok(typeof res.body.fallbackReason === 'string' && res.body.fallbackReason.length > 0);
      assert.ok(Array.isArray(res.body.fallbackGuidance) && res.body.fallbackGuidance.length > 0);
    });

    // 14. Missing or incomplete transport data
    await test('14. Missing or incomplete transport data handled safely without crashes or NaN', async () => {
      const candIncomplete = {
        id: 'c-incomplete-data',
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        primaryMode: 'bus',
        modesIncluded: ['bus'],
        departureTime: '08:00',
        estimatedArrivalTime: '08:30',
        totalDurationMinutes: 30,
        walkingTimeMinutes: null, // missing walking
        transferCount: null, // missing transfer count
        estimatedCostRupees: null, // missing cost
        isFeasible: true,
        feasibilityReason: 'OPERATIONAL',
        segments: [
          { type: 'TRANSIT', mode: 'bus', durationMinutes: 30 }
        ]
      };

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candIncomplete]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.ok(res.body.primaryRecommendedRoute);
      assert.strictEqual(res.body.primaryRecommendedRoute.estimatedCostRupees, null);
      assert.notStrictEqual(res.body.primaryRecommendedRoute.totalTravelTimeMinutes, NaN);
      assert.strictEqual(res.body.primaryRecommendedRoute.provenance.sourceTier, 'ESTIMATED');
    });

    // 15. VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC provenance
    await test('15. Multi-tier provenance preserves all 4 tiers without mislabeling', async () => {
      const verifiedCand = createCandidate({
        id: 'c-prov-verified',
        provenance: DataProvenance.verified('Official GTFS Timetable', 'Mumbai Transit GTFS').toJSON()
      });
      const userCand = createCandidate({
        id: 'c-prov-user',
        provenance: DataProvenance.userReported('Student Transit Report', 'Crowdsourced delay').toJSON()
      });
      const estCand = createCandidate({
        id: 'c-prov-est',
        provenance: DataProvenance.estimated('Traffic Heuristics', 'Road corridor model').toJSON()
      });
      const synthCand = createCandidate({
        id: 'c-prov-synth',
        provenance: DataProvenance.synthetic('Fallback Simulation', 'Synthetic schedule').toJSON()
      });

      // Verify each tier via individual queries
      for (const [cand, expectedTier] of [
        [verifiedCand, PROVENANCE_TIERS.VERIFIED],
        [userCand, PROVENANCE_TIERS.USER_REPORTED],
        [estCand, PROVENANCE_TIERS.ESTIMATED],
        [synthCand, PROVENANCE_TIERS.SYNTHETIC]
      ]) {
        const res = await makeRequest({
          hostname: '127.0.0.1',
          port,
          path: '/api/commute/recommendations',
          method: 'POST',
          headers: authHeaders
        }, {
          origin: 'Andheri West',
          candidates: [cand]
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.provenance.sourceTier, expectedTier);
        if (expectedTier === PROVENANCE_TIERS.SYNTHETIC) {
          assert.strictEqual(res.body.provenanceSummary.allVerified, false);
          assert.strictEqual(res.body.provenanceSummary.hasUnverifiedData, true);
        }
      }
    });

    // 16. Explanations matching actual route metrics
    await test('16. Explanations faithfully reflect actual route metrics without fabrication', async () => {
      const cand = createCandidate({
        id: 'c-metric-check',
        departureTime: '08:15',
        durationMinutes: 32,
        estimatedArrivalTime: '08:47',
        estimatedCostRupees: 18,
        walkingTimeMinutes: 7,
        transferCount: 1
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [cand]
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.explanation, 'Explanation object must exist');
      const expl = res.body.explanation;
      const rec = res.body.primaryRecommendedRoute;

      // Primary route metrics
      assert.strictEqual(rec.totalTravelTimeMinutes, 32);
      assert.strictEqual(rec.estimatedArrivalTime, '08:47');
      assert.strictEqual(rec.estimatedCostRupees, 18);
      assert.strictEqual(rec.walkingTimeMinutes, 7);
      assert.strictEqual(rec.transfers, 1);

      // Explanation metrics must match primary route without fabrication
      assert.strictEqual(expl.timingExplanation.travelTimeMinutes, 32);
      assert.strictEqual(expl.timingExplanation.departureTime, '08:15');
      assert.strictEqual(expl.timingExplanation.estimatedArrivalTime, '08:47');
      assert.ok(expl.summary, 'Summary narrative must exist');
      assert.ok(expl.selectionReason, 'Selection reason must exist');
      assert.ok(expl.summary.includes('32'), 'Summary must mention actual travel time of 32 mins');
    });

    // 17. Deterministic recommendations for identical inputs
    await test('17. Deterministic recommendations produce identical outputs for repeated inputs', async () => {
      const payload = {
        origin: 'Andheri West',
        destination: 'D.J. Sanghvi College of Engineering',
        desiredDepartureTime: '08:00',
        routePreference: 'balanced'
      };

      const res1 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, payload);

      const res2 = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, payload);

      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res1.body.primaryRecommendedRoute.journeyId, res2.body.primaryRecommendedRoute.journeyId);
      assert.strictEqual(res1.body.estimatedJourneyMinutes, res2.body.estimatedJourneyMinutes);
      assert.strictEqual(res1.body.estimatedArrivalTime, res2.body.estimatedArrivalTime);
      assert.strictEqual(res1.body.recommendationReasons.length, res2.body.recommendationReasons.length);
    });

    // 18. Duplicate alternative prevention
    await test('18. Duplicate alternative prevention eliminates near-identical route copies', async () => {
      const primary = createCandidate({
        id: 'c-distinct-primary',
        primaryMode: 'metro',
        durationMinutes: 25,
        estimatedCostRupees: 20,
        transferCount: 1
      });
      const nearDuplicate = createCandidate({
        id: 'c-near-duplicate',
        primaryMode: 'metro',
        durationMinutes: 26, // within 1 min
        estimatedCostRupees: 20,
        transferCount: 1
      });
      const trulyDistinct = createCandidate({
        id: 'c-truly-distinct',
        primaryMode: 'bus',
        durationMinutes: 45,
        estimatedCostRupees: 10,
        transferCount: 0
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [primary, nearDuplicate, trulyDistinct]
      });

      assert.strictEqual(res.status, 200);
      const alts = res.body.meaningfulAlternatives;
      // Near duplicate must NOT be presented as a meaningful alternative!
      const hasNearDuplicate = alts.some(a => a.journeyId === 'c-near-duplicate');
      assert.strictEqual(hasNearDuplicate, false, 'Near duplicate must be filtered out');
      const hasDistinct = alts.some(a => a.journeyId === 'c-truly-distinct');
      assert.strictEqual(hasDistinct, true, 'Truly distinct alternative must be preserved');
    });

    // 19. Expired disruptions not affecting current recommendations
    await test('19. Expired disruptions do not penalize current routes or inflate delays', async () => {
      const now = Date.now();
      const pastExpiryTime = now - 3600000; // Expired 1 hour ago

      const candTrain = createCandidate({
        id: 'c-train-clean-now',
        primaryMode: 'train',
        durationMinutes: 20,
        segments: [
          { type: 'TRANSIT', mode: 'train', corridorOrArea: 'Western Railway', durationMinutes: 20 }
        ]
      });

      const res = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, {
        origin: 'Andheri West',
        candidates: [candTrain],
        currentTime: now,
        disruptions: [
          {
            type: 'delay',
            affectedMode: 'train',
            corridorOrArea: 'Western Railway',
            estimatedDelayMinutes: 40,
            severity: 'major',
            endTime: pastExpiryTime, // EXPIRED
            isExpired: true,
            status: 'RESOLVED',
            description: 'Old morning signal delay resolved earlier'
          }
        ]
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.hasFeasibleRoute, true);
      assert.strictEqual(res.body.disruptionSummary.delayMinutes, 0, 'Expired disruption must add 0 delay');
      assert.strictEqual(res.body.primaryRecommendedRoute.expectedDisruptionDelayMinutes, 0);
    });

    // 20. Authentication, validation, and privacy safeguards
    await test('20. Authentication, validation, and privacy safeguards enforced strictly', async () => {
      // 20A. Unauthenticated request rejected
      const unauth = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { origin: 'Andheri West' });
      assert.strictEqual(unauth.status, 401);

      // 20B. Granular address with door/flat number rejected
      const privacyAddr = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, { origin: 'Apt 501, Sunflower CHS, Andheri West' });
      assert.strictEqual(privacyAddr.status, 400);

      // 20C. GPS telemetry rejected
      const privacyGps = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, { origin: 'Andheri West', latitude: 19.123, longitude: 72.845 });
      assert.strictEqual(privacyGps.status, 400);
      assert.ok(JSON.stringify(privacyGps.body).includes('Privacy violation'));

      // 20D. Invalid constraint value rejected
      const badConstraint = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/commute/recommendations',
        method: 'POST',
        headers: authHeaders
      }, { origin: 'Andheri West', maxTransfers: -2 });
      assert.strictEqual(badConstraint.status, 400);
    });

    // 21. Existing backend regressions
    await test('21. Existing backend endpoints and contracts remain intact without regressions', async () => {
      // 21A. GET /health
      const healthRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET'
      });
      assert.strictEqual(healthRes.status, 200);

      // 21B. Existing candidate route generation contract: POST /api/commute/candidates
      const candRes = await makeRequest({
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
      assert.strictEqual(candRes.status, 200);
      assert.ok(candRes.body.feasibleRoutes);
      assert.ok(candRes.body.rejectedRoutes);
      assert.ok(candRes.body.routeComparison);
      assert.ok(candRes.body.routeIntelligence);

      // 21C. Student commute candidates alias: POST /api/student/commute/candidates
      const studentCandRes = await makeRequest({
        hostname: '127.0.0.1',
        port,
        path: '/api/student/commute/candidates',
        method: 'POST',
        headers: authHeaders
      }, {
        startingArea: 'Andheri West',
        departureTime: '08:00'
      });
      assert.strictEqual(studentCandRes.status, 200);
    });

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(` VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
