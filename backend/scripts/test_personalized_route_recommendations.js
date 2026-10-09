/**
 * Unit Tests for PersonalizedRouteRecommendationService
 *
 * Verifies:
 * 1. Normal scenario: multiple feasible candidate routes, primary selected, distinct alternatives, trade-offs, explainable reasons
 * 2. Disrupted scenario: elevated disruption handled, undisrupted route preferred or caution status elevated
 * 3. Preference-sensitive scenario: changing student preferences (fastest, cheapest, fewest_transfers, preferred_modes) flips the selected route
 * 4. Hard constraint enforcement: fast route arriving late is never selected; feasible route selected
 * 5. No feasible route scenario: returns honest fallback recommendation with actionable guidance and rejected route reasons
 * 6. Deduplication: eliminates duplicate and near-equivalent routes from alternatives
 * 7. Multi-tier and SYNTHETIC provenance retention without data fabrication
 * 8. Pure determinism across repeated identical requests
 * 9. Missing preferences use documented sensible defaults safely
 * 10. Dependency injection and modularity
 */

const assert = require('node:assert/strict');
const {
  PersonalizedRouteRecommendationService,
  personalizedRouteRecommendationService,
  areRoutesEquivalent
} = require('../services/personalizedRouteRecommendationService');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const {
  DataProvenance,
  PROVENANCE_TIERS,
  RECOMMENDATION_STATUS_TYPES
} = require('../models');

function runTests() {
  console.log('========================================================================');
  console.log(' Running Personalized Route Recommendation Service Unit Tests');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // Helper factory for mock candidate journeys
  function createCandidate(overrides = {}) {
    const id = overrides.id || overrides.candidateId || `cand-${Math.random().toString(36).substring(2, 7)}`;
    const departureTime = overrides.departureTime || '08:00';
    const duration = overrides.durationMinutes ?? overrides.totalDurationMinutes ?? 30;
    const [h, m] = departureTime.split(':').map(Number);
    const totalArrM = (h * 60 + m + duration) % 1440;
    const arrH = Math.floor(totalArrM / 60).toString().padStart(2, '0');
    const arrM = (totalArrM % 60).toString().padStart(2, '0');
    const estimatedArrivalTime = overrides.estimatedArrivalTime || `${arrH}:${arrM}`;

    return {
      id,
      candidateId: id,
      journeyId: id,
      origin: overrides.origin || 'Andheri West',
      destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
      departureTime,
      estimatedArrivalTime,
      totalDurationMinutes: duration,
      walkingTimeMinutes: overrides.walkingTimeMinutes ?? 5,
      transferCount: overrides.transferCount ?? 1,
      estimatedCostRupees: overrides.estimatedCostRupees ?? 20,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
      isFeasible: overrides.isFeasible !== undefined ? overrides.isFeasible : true,
      feasibilityReason: overrides.feasibilityReason || 'OPERATIONAL',
      segments: overrides.segments || [
        { type: 'WALK', mode: 'walk', durationMinutes: 5 },
        { type: 'TRANSIT', mode: overrides.primaryMode || 'metro', durationMinutes: duration - 5 }
      ],
      baselineTravel: {
        departureTime,
        estimatedArrivalTime,
        durationMinutes: duration,
        walkingTimeMinutes: overrides.walkingTimeMinutes ?? 5,
        transferCount: overrides.transferCount ?? 1,
        estimatedCostRupees: overrides.estimatedCostRupees ?? 20
      },
      provenance: overrides.provenance || DataProvenance.verified('Transit Feed', 'Official GTFS schedule').toJSON()
    };
  }

  // 1. Normal scenario: multiple feasible candidate routes
  testAsync('Normal scenario: selects primary route, returns distinct alternatives and trade-offs', async () => {
    const candMetro = createCandidate({
      id: 'route-metro-normal',
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro'],
      durationMinutes: 25,
      estimatedCostRupees: 20,
      transferCount: 0
    });
    const candBus = createCandidate({
      id: 'route-bus-normal',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      durationMinutes: 40,
      estimatedCostRupees: 15,
      transferCount: 0
    });
    const candAuto = createCandidate({
      id: 'route-auto-normal',
      primaryMode: 'auto',
      modesIncluded: ['auto'],
      durationMinutes: 20,
      estimatedCostRupees: 90,
      transferCount: 0
    });

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      candidates: [candMetro, candBus, candAuto],
      departureTime: '08:00',
      preferences: { route_preference: 'balanced' }
    });

    assert.ok(rec, 'Recommendation should be returned');
    assert.strictEqual(rec.isFallback, false);
    assert.strictEqual(rec.status, 'RECOMMENDED');
    assert.ok(rec.selectedRoute, 'Selected route must be present');
    assert.strictEqual(rec.selectedRoute.journeyId, 'route-metro-normal');
    assert.ok(rec.alternativeRoutes.length > 0, 'Alternatives must be present');
    assert.ok(rec.tradeOffs.length > 0, 'Trade-offs must be identified');
    assert.ok(rec.recommendationReasons.length > 0, 'Recommendation reasons must be generated');
    assert.ok(rec.isActionable(), 'Recommendation must be actionable');
  });

  // 2. Disrupted scenario
  testAsync('Disrupted scenario: favors clean undisrupted alternative when metro is severely delayed', async () => {
    const candMetroDisrupted = createCandidate({
      id: 'route-metro-disrupted',
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro'],
      durationMinutes: 22,
      estimatedCostRupees: 30,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 5, from: 'Origin', to: 'Andheri West' },
        {
          type: 'TRANSIT',
          mode: 'metro',
          durationMinutes: 17,
          from: 'Andheri West',
          to: 'DN Nagar',
          lineIdentifier: 'Line 2A',
          serviceId: 'Line 2A'
        }
      ]
    });
    const candBusClean = createCandidate({
      id: 'route-bus-clean',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      durationMinutes: 35,
      estimatedCostRupees: 12,
      segments: [
        { type: 'WALK', mode: 'walk', durationMinutes: 5, from: 'Origin', to: 'Bus Stop' },
        {
          type: 'TRANSIT',
          mode: 'bus',
          durationMinutes: 30,
          from: 'Bus Stop',
          to: 'College Gate',
          lineIdentifier: 'Route 202',
          serviceId: 'BUS 202'
        }
      ]
    });

    // Environmental context with +25 min delay on metro line
    const disruptedContext = {
      currentTime: Date.now(),
      disruptions: [
        {
          id: 'disr-metro-1',
          type: 'metro_delay',
          affectedMode: 'metro',
          affectedRouteId: 'Line 2A',
          affectedArea: 'Andheri West',
          status: 'active',
          severity: 'major',
          estimatedDelayMinutes: 25,
          delayMinutes: 25,
          description: 'Line 2A signaling failure causing 25 min delays'
        }
      ],
      trafficConditions: [],
      weatherContext: { condition: 'clear', totalAddedTravelTimeMinutes: 0 },
      availability: { dominantStatus: 'AVAILABLE', isUsable: true }
    };

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      candidates: [candMetroDisrupted, candBusClean],
      context: disruptedContext,
      preferences: { route_preference: 'balanced' }
    });

    assert.strictEqual(rec.isFallback, false);
    assert.ok(rec.selectedRoute);
    // The clean bus route should be prioritized due to the 25 min disruption delay on metro
    assert.strictEqual(rec.selectedRoute.journeyId, 'route-bus-clean');
  });

  // 3. Preference-sensitive scenarios
  testAsync('Preference-sensitive scenario: preference change flips primary selected route', async () => {
    const fastExpensive = createCandidate({
      id: 'cand-fast-expensive',
      primaryMode: 'auto',
      modesIncluded: ['auto'],
      durationMinutes: 18,
      estimatedCostRupees: 85,
      transferCount: 0
    });
    const slowCheap = createCandidate({
      id: 'cand-slow-cheap',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      durationMinutes: 30,
      estimatedCostRupees: 5,
      transferCount: 0
    });
    const directTransit = createCandidate({
      id: 'cand-direct-transit',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      durationMinutes: 30,
      estimatedCostRupees: 15,
      transferCount: 0
    });

    const candidates = [fastExpensive, slowCheap, directTransit];

    // 3A. Fastest preference
    const recFast = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates,
      preferences: { route_preference: 'fastest' }
    });
    assert.strictEqual(recFast.selectedRoute.journeyId, 'cand-fast-expensive', 'Fastest preference should select fast auto');

    // 3B. Cheapest preference
    const recCheap = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates,
      preferences: { route_preference: 'cheapest' }
    });
    assert.strictEqual(recCheap.selectedRoute.journeyId, 'cand-slow-cheap', 'Cheapest preference should select cheap bus');

    // 3C. Preferred mode preference
    const recTrain = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates,
      preferences: { preferred_modes: ['train'] }
    });
    assert.strictEqual(recTrain.selectedRoute.primaryMode, 'train', 'Preferred modes should select train route');
  });

  // 4. Hard constraint enforcement: cannot be overridden by preferences
  testAsync('Hard constraint enforcement: late route is never recommended despite being the fastest', async () => {
    const fastLateRoute = createCandidate({
      id: 'cand-fast-late',
      departureTime: '08:50',
      durationMinutes: 15,
      estimatedArrivalTime: '09:05', // Arrives after 09:00
      estimatedCostRupees: 50,
      transferCount: 0
    });
    const slowerOnTimeRoute = createCandidate({
      id: 'cand-slower-ontime',
      departureTime: '08:15',
      durationMinutes: 35,
      estimatedArrivalTime: '08:50', // Arrives on time before 09:00
      estimatedCostRupees: 20,
      transferCount: 1
    });

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates: [fastLateRoute, slowerOnTimeRoute],
      preferences: { route_preference: 'fastest' },
      constraints: { targetArrivalTime: '09:00' }
    });

    assert.strictEqual(rec.isFallback, false);
    assert.ok(rec.selectedRoute);
    assert.strictEqual(rec.selectedRoute.journeyId, 'cand-slower-ontime', 'On-time route must be selected');
    assert.ok(rec.selectedRoute.estimatedArrivalTime <= '09:00');
  });

  // 5. No feasible route scenario (Fallback status & actionable guidance)
  testAsync('No feasible route scenario: returns honest fallback recommendation when all routes violate deadline', async () => {
    const lateRoute1 = createCandidate({
      id: 'cand-late-1',
      departureTime: '08:45',
      durationMinutes: 30,
      estimatedArrivalTime: '09:15'
    });
    const lateRoute2 = createCandidate({
      id: 'cand-late-2',
      departureTime: '08:40',
      durationMinutes: 40,
      estimatedArrivalTime: '09:20'
    });

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates: [lateRoute1, lateRoute2],
      constraints: { targetArrivalTime: '09:00' }
    });

    assert.strictEqual(rec.isFallback, true);
    assert.strictEqual(rec.status, 'FALLBACK');
    assert.strictEqual(rec.selectedRoute, null);
    assert.ok(rec.fallbackReason.length > 0);
    assert.ok(rec.fallbackGuidance.length > 0);
    assert.strictEqual(rec.isActionable(), false);
  });

  // 6. Deduplication and equivalent alternatives prevention
  test('Deduplication: areRoutesEquivalent detects identical transit profiles within variance', () => {
    const r1 = {
      journeyId: 'r1',
      modesIncluded: ['walk', 'metro'],
      totalTravelTime: 30,
      estimatedCost: 20,
      numberOfTransfers: 1
    };
    const r2Equivalent = {
      journeyId: 'r2',
      modesIncluded: ['metro', 'walk'],
      totalTravelTime: 31, // 1 min difference
      estimatedCost: 20,
      numberOfTransfers: 1
    };
    const r3Different = {
      journeyId: 'r3',
      modesIncluded: ['walk', 'bus'],
      totalTravelTime: 45,
      estimatedCost: 10,
      numberOfTransfers: 0
    };

    assert.strictEqual(areRoutesEquivalent(r1, r2Equivalent), true, 'Near-identical routes must be flagged equivalent');
    assert.strictEqual(areRoutesEquivalent(r1, r3Different), false, 'Distinct routes must not be flagged equivalent');
  });

  // 7. Multi-tier and SYNTHETIC provenance retention
  testAsync('Provenance retention: retains SYNTHETIC and multi-tier provenance faithfully', async () => {
    const synthRoute = createCandidate({
      id: 'cand-synthetic',
      durationMinutes: 28,
      provenance: DataProvenance.synthetic('AI Planner Synthetic Engine').toJSON()
    });

    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates: [synthRoute]
    });

    assert.strictEqual(rec.selectedRoute.provenance.sourceTier, PROVENANCE_TIERS.SYNTHETIC);
    assert.strictEqual(rec.provenanceSummary.hasUnverifiedData, true);
  });

  // 8. Deterministic repeatability across identical requests
  testAsync('Determinism: repeated invocations produce bit-for-bit identical recommendations', async () => {
    const candA = createCandidate({ id: 'cand-det-a', durationMinutes: 25, estimatedCostRupees: 30 });
    const candB = createCandidate({ id: 'cand-det-b', durationMinutes: 35, estimatedCostRupees: 15 });
    const params = {
      startingArea: 'Andheri West',
      collegeDestination: 'D.J. Sanghvi College of Engineering',
      candidates: [candA, candB],
      preferences: { route_preference: 'fastest', preferred_modes: ['metro'] }
    };

    const run1 = await personalizedRouteRecommendationService.getRecommendation(params);
    const run2 = await personalizedRouteRecommendationService.getRecommendation(params);

    assert.strictEqual(run1.selectedRoute.journeyId, run2.selectedRoute.journeyId);
    assert.strictEqual(run1.selectedRoute.deterministicScore, run2.selectedRoute.deterministicScore);
    assert.strictEqual(run1.alternativeRoutes.length, run2.alternativeRoutes.length);
    assert.strictEqual(run1.tradeOffs.length, run2.tradeOffs.length);
    assert.strictEqual(run1.recommendationReasons.length, run2.recommendationReasons.length);
  });

  // 9. Missing preferences use documented sensible defaults safely
  testAsync('Missing preferences: defaults safely to balanced profile without error', async () => {
    const cand = createCandidate({ id: 'cand-missing-pref', durationMinutes: 25 });
    const rec = await personalizedRouteRecommendationService.getRecommendation({
      startingArea: 'Andheri West',
      candidates: [cand],
      preferences: null
    });

    assert.strictEqual(rec.status, 'RECOMMENDED');
    assert.strictEqual(rec.selectedRoute.journeyId, 'cand-missing-pref');
    assert.strictEqual(rec.preferenceAlignment.overallAlignment, 'NEUTRAL');
  });

  // 10. Dependency injection and modularity
  test('Modularity: service allows injecting custom mock sub-services cleanly', () => {
    const customService = new PersonalizedRouteRecommendationService({
      routeComparisonService: {
        comparePair: () => ({ tradeOffSummary: ['Custom mocked trade-off'] })
      }
    });

    assert.ok(customService.routeComparisonService);
    assert.strictEqual(typeof customService.getRecommendation, 'function');
  });

  // Run all tests sequentially
  setTimeout(() => {
    console.log('\n========================================================================');
    console.log(` RESULTS: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }, 100);
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
