/**
 * Unit Tests for RouteComparisonService
 *
 * Verifies:
 * 1. Clearly different routes (multimodal train vs direct bus vs auto vs walk)
 * 2. Tied routes & deterministic tie-breaking reasons
 * 3. Disrupted routes with delay, affected segments, and reliability degradation
 * 4. Mixed transport modes across routes
 * 5. Different provenance tiers (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * 6. Duplicate and near-duplicate routes detection and optional filtering
 * 7. Invariant: universalBestClaim is strictly FALSE (no universal best claim)
 * 8. All 14 required comparable attributes exposed on every route
 * 9. Pairwise route comparison (comparePair)
 * 10. Metric leaders, ranges, and trade-off notes
 */

const assert = require('node:assert/strict');
const {
  routeComparisonService,
  RouteComparisonService,
  DEFAULT_THRESHOLDS
} = require('../services/routeComparisonService');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');

function runTests() {
  console.log('========================================================');
  console.log(' Running Route Comparison Service Unit Tests');
  console.log('========================================================\n');

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

  // Helper factory for creating test RouteEvaluation instances
  function createRoute(overrides = {}) {
    const baseline = overrides.baselineTravelTime ?? 30;
    const additionalDelay = overrides.additionalDisruptionDelay ?? 0;
    const totalTravelTime = overrides.totalTravelTime ?? (baseline + additionalDelay);

    return new RouteEvaluation({
      journeyId: overrides.journeyId || `cand-${Math.random().toString(36).substring(2, 7)}`,
      origin: overrides.origin || 'Andheri West',
      destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
      departureTime: overrides.departureTime || '08:00',
      estimatedArrivalTime: overrides.estimatedArrivalTime || '08:30',
      updatedArrivalTime: overrides.updatedArrivalTime || overrides.estimatedArrivalTime || '08:30',
      totalTravelTime,
      baselineTravelTime: baseline,
      additionalDisruptionDelay: additionalDelay,
      totalAdditionalDelay: additionalDelay,
      waitingTime: overrides.waitingTime ?? 4,
      walkingTime: overrides.walkingTime ?? 6,
      transitTime: overrides.transitTime ?? 20,
      numberOfTransfers: overrides.numberOfTransfers ?? 1,
      estimatedCost: overrides.estimatedCost ?? 20,
      totalDistanceKm: overrides.totalDistanceKm ?? 5.0,
      primaryMode: overrides.primaryMode || 'train',
      modesIncluded: overrides.modesIncluded || ['walk', 'train'],
      isFeasible: overrides.isFeasible !== undefined ? overrides.isFeasible : true,
      feasibilityReason: overrides.feasibilityReason || 'OPERATIONAL',
      affectedSegments: overrides.affectedSegments || [],
      unavailableSegments: overrides.unavailableSegments || [],
      reliability: overrides.reliability || 'LOW',
      uncertainty: overrides.uncertainty || 'LOW',
      trafficImpact: overrides.trafficImpact || { level: 'normal', addedTravelTimeMinutes: 0 },
      weatherImpact: overrides.weatherImpact || { condition: 'clear', totalAddedTravelTimeMinutes: 0, walkingInconvenienceLevel: 'NONE', travelUncertaintyLevel: 'LOW' },
      transportStatus: overrides.transportStatus || { dominantStatus: 'AVAILABLE', isUsable: true },
      reasonCodes: overrides.reasonCodes || [],
      weaknesses: overrides.weaknesses || [],
      advisories: overrides.advisories || [],
      dataTiers: overrides.dataTiers || [PROVENANCE_TIERS.VERIFIED],
      provenance: overrides.provenance || DataProvenance.verified('Western Railway', 'Official GTFS schedule')
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Expose all 14 required comparable attributes on every route
  // ---------------------------------------------------------------------------
  test('All 14 required comparable fields are exposed on every evaluated route', () => {
    const r1 = createRoute({ journeyId: 'route-train-1' });
    const r2 = createRoute({ journeyId: 'route-bus-1' });

    const result = routeComparisonService.compareRoutes([r1, r2]);

    assert.strictEqual(result.routes.length, 2);
    for (const route of result.routes) {
      // 1. estimated arrival time
      assert.ok(typeof route.estimatedArrivalTime === 'string', 'estimatedArrivalTime must be string');
      // 2. total duration
      assert.ok(typeof route.totalDuration === 'number', 'totalDuration must be number');
      // 3. disruption delay
      assert.ok(typeof route.disruptionDelay === 'number', 'disruptionDelay must be number');
      // 4. waiting time
      assert.ok(typeof route.waitingTime === 'number', 'waitingTime must be number');
      // 5. walking time
      assert.ok(typeof route.walkingTime === 'number', 'walkingTime must be number');
      // 6. transfers
      assert.ok(typeof route.transfers === 'number', 'transfers must be number');
      // 7. estimated cost
      assert.ok(typeof route.estimatedCost === 'number', 'estimatedCost must be number');
      // 8. reliability / uncertainty
      assert.ok(typeof route.reliability === 'string', 'reliability must be string');
      assert.ok(typeof route.uncertainty === 'string', 'uncertainty must be string');
      // 9. affected segments
      assert.ok(Array.isArray(route.affectedSegments), 'affectedSegments must be array');
      // 10. transport modes
      assert.ok(Array.isArray(route.transportModes), 'transportModes must be array');
      // 11. provenance
      assert.ok(route.provenance && typeof route.provenance === 'object', 'provenance must be object');
      // 12. deterministic score
      assert.ok(typeof route.deterministicScore === 'number', 'deterministicScore must be number');
      // 13. strengths
      assert.ok(Array.isArray(route.strengths), 'strengths must be array');
      // 14. weaknesses
      assert.ok(Array.isArray(route.weaknesses), 'weaknesses must be array');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Clearly different routes (Train vs Bus vs Walk vs Auto)
  // ---------------------------------------------------------------------------
  test('Clearly different routes: compares multi-criteria profiles without single-metric bias', () => {
    const fastTrain = createRoute({
      journeyId: 'route-fast-train',
      totalTravelTime: 25,
      baselineTravelTime: 25,
      estimatedCost: 15,
      walkingTime: 6,
      numberOfTransfers: 1,
      primaryMode: 'train',
      modesIncluded: ['walk', 'train']
    });

    const cheapWalk = createRoute({
      journeyId: 'route-direct-walk',
      totalTravelTime: 45,
      baselineTravelTime: 45,
      estimatedCost: 0,
      walkingTime: 45,
      numberOfTransfers: 0,
      primaryMode: 'walk',
      modesIncluded: ['walk']
    });

    const directAuto = createRoute({
      journeyId: 'route-direct-auto',
      totalTravelTime: 22,
      baselineTravelTime: 22,
      estimatedCost: 95,
      walkingTime: 2,
      numberOfTransfers: 0,
      primaryMode: 'auto',
      modesIncluded: ['auto']
    });

    const result = routeComparisonService.compareRoutes([fastTrain, cheapWalk, directAuto]);

    assert.strictEqual(result.routes.length, 3);
    const leaders = result.comparisonSummary.metricLeaders;

    // Fastest is auto (22m)
    assert.deepStrictEqual(leaders.fastest.journeyIds, ['route-direct-auto']);
    assert.strictEqual(leaders.fastest.value, 22);

    // Cheapest is walk (₹0)
    assert.deepStrictEqual(leaders.cheapest.journeyIds, ['route-direct-walk']);
    assert.strictEqual(leaders.cheapest.value, 0);

    // Least walking is auto (2m)
    assert.deepStrictEqual(leaders.leastWalking.journeyIds, ['route-direct-auto']);
    assert.strictEqual(leaders.leastWalking.value, 2);

    // Fewest transfers is auto and walk (0 transfers)
    assert.ok(leaders.fewestTransfers.journeyIds.includes('route-direct-auto'));
    assert.ok(leaders.fewestTransfers.journeyIds.includes('route-direct-walk'));

    // Check strengths and weaknesses
    const autoResult = result.routes.find(r => r.journeyId === 'route-direct-auto');
    assert.ok(autoResult.strengths.some(s => s.includes('Fastest travel time')), 'Auto has fastest strength');
    assert.ok(autoResult.weaknesses.some(w => w.includes('High monetary cost')), 'Auto has high cost weakness');

    const walkResult = result.routes.find(r => r.journeyId === 'route-direct-walk');
    assert.ok(walkResult.strengths.some(s => s.includes('Zero fare')), 'Walk has zero fare strength');
    assert.ok(walkResult.weaknesses.some(w => w.includes('High walking burden')), 'Walk has high walking weakness');

    // Invariant: universalBestClaim must be false
    assert.strictEqual(result.comparisonSummary.universalBestClaim, false);
    assert.ok(result.comparisonSummary.disclaimer.length > 0);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Tied routes & deterministic tie-breaking
  // ---------------------------------------------------------------------------
  test('Tied routes: identifies ties and records deterministic tie-breaker reason', () => {
    // Two routes with identical baseline metrics, one with slightly lower duration
    const routeA = createRoute({
      journeyId: 'cand-tied-b',
      baselineTravelTime: 30,
      totalTravelTime: 30,
      estimatedCost: 20,
      numberOfTransfers: 1,
      walkingTime: 10
    });

    const routeB = createRoute({
      journeyId: 'cand-tied-a',
      baselineTravelTime: 30,
      totalTravelTime: 30,
      estimatedCost: 20,
      numberOfTransfers: 1,
      walkingTime: 10
    });

    const result = routeComparisonService.compareRoutes([routeA, routeB]);

    assert.strictEqual(result.routes.length, 2);
    assert.strictEqual(result.comparisonSummary.hasTies, true);

    const r0 = result.routes[0];
    const r1 = result.routes[1];

    assert.strictEqual(r0.isTied, true);
    assert.strictEqual(r1.isTied, true);
    // Identical metrics broken alphabetically by journeyId: cand-tied-a before cand-tied-b
    assert.strictEqual(r0.journeyId, 'cand-tied-a');
    assert.strictEqual(r1.journeyId, 'cand-tied-b');
    assert.strictEqual(r0.tieBreakerReason, 'TIED_SCORE_BROKEN_BY_JOURNEY_ID');
  });

  test('Tied score broken by travel time', () => {
    // Route 1: 32 mins, ₹15 -> deductions: 32*0.5 (16) + 15*0.15 (2.25) = 18.25
    // Route 2: 30 mins, ₹22 -> deductions: 30*0.5 (15) + 22*0.15 (3.30) = 18.30 (very close)
    // Create routes with exact score match by calibration
    const r1 = createRoute({
      journeyId: 'route-tie-faster',
      baselineTravelTime: 28,
      totalTravelTime: 28,
      estimatedCost: 30, // 28*0.5=14, 30*0.15=4.5 -> penalty 18.5
      walkingTime: 5,
      numberOfTransfers: 0
    });

    const r2 = createRoute({
      journeyId: 'route-tie-slower',
      baselineTravelTime: 37,
      totalTravelTime: 37,
      estimatedCost: 0, // 37*0.5=18.5, 0*0.15=0 -> penalty 18.5
      walkingTime: 5,
      numberOfTransfers: 0
    });

    const result = routeComparisonService.compareRoutes([r1, r2]);

    assert.strictEqual(result.routes[0].deterministicScore, result.routes[1].deterministicScore);
    assert.strictEqual(result.routes[0].journeyId, 'route-tie-faster');
    assert.strictEqual(result.routes[0].isTied, true);
    assert.strictEqual(result.routes[0].tieBreakerReason, 'TIED_SCORE_BROKEN_BY_TOTAL_DURATION');
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Disrupted routes
  // ---------------------------------------------------------------------------
  test('Disrupted routes: accurately flags delay, affected segments, and elevated uncertainty', () => {
    const normalRoute = createRoute({
      journeyId: 'route-normal',
      baselineTravelTime: 30,
      totalTravelTime: 30,
      additionalDisruptionDelay: 0,
      affectedSegments: [],
      reliability: 'LOW',
      uncertainty: 'LOW'
    });

    const disruptedRoute = createRoute({
      journeyId: 'route-disrupted',
      baselineTravelTime: 30,
      totalTravelTime: 45,
      additionalDisruptionDelay: 15,
      affectedSegments: [
        { mode: 'train', line: 'Western Railway', issue: 'Overhead wire malfunction at Bandra' }
      ],
      reliability: 'HIGH',
      uncertainty: 'HIGH'
    });

    const result = routeComparisonService.compareRoutes([normalRoute, disruptedRoute]);

    assert.strictEqual(result.comparisonSummary.hasDisruptedRoutes, true);
    const dRoute = result.routes.find(r => r.journeyId === 'route-disrupted');

    assert.strictEqual(dRoute.disruptionDelay, 15);
    assert.strictEqual(dRoute.affectedSegments.length, 1);
    assert.strictEqual(dRoute.uncertainty, 'HIGH');
    assert.ok(dRoute.weaknesses.some(w => w.includes('+15 mins unexpected delay')));
    assert.ok(dRoute.weaknesses.some(w => w.includes('impacted by active alerts')));

    const nRoute = result.routes.find(r => r.journeyId === 'route-normal');
    assert.ok(nRoute.strengths.some(s => s.includes('Zero disruption delay')));
    assert.ok(nRoute.deterministicScore > dRoute.deterministicScore);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Mixed transport modes
  // ---------------------------------------------------------------------------
  test('Mixed transport modes: supports train, metro, bus, auto, walk, and multimodal journeys', () => {
    const metroBus = createRoute({
      journeyId: 'route-metro-bus',
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro', 'bus'],
      numberOfTransfers: 1,
      totalTravelTime: 35
    });

    const directTrain = createRoute({
      journeyId: 'route-train',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      numberOfTransfers: 0,
      totalTravelTime: 28
    });

    const busAuto = createRoute({
      journeyId: 'route-bus-auto',
      primaryMode: 'bus',
      modesIncluded: ['bus', 'auto'],
      numberOfTransfers: 1,
      totalTravelTime: 40
    });

    const result = routeComparisonService.compareRoutes([metroBus, directTrain, busAuto]);

    assert.strictEqual(result.routes.length, 3);
    const mRoute = result.routes.find(r => r.journeyId === 'route-metro-bus');
    assert.deepStrictEqual(mRoute.transportModes, ['walk', 'metro', 'bus']);
    assert.strictEqual(mRoute.primaryMode, 'metro');

    const bRoute = result.routes.find(r => r.journeyId === 'route-bus-auto');
    assert.deepStrictEqual(bRoute.transportModes, ['bus', 'auto']);
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Different provenance tiers
  // ---------------------------------------------------------------------------
  test('Different provenance: preserves data tiers and flags unverified data in summary', () => {
    const verifiedRoute = createRoute({
      journeyId: 'route-verified',
      provenance: DataProvenance.verified('BEST Transit', 'Official timetable')
    });

    const reportedRoute = createRoute({
      journeyId: 'route-user-reported',
      provenance: DataProvenance.userReported('Student crowd report', 'Live student report', 'MEDIUM')
    });

    const syntheticRoute = createRoute({
      journeyId: 'route-synthetic',
      provenance: DataProvenance.synthetic('Fallback model')
    });

    const result = routeComparisonService.compareRoutes([verifiedRoute, reportedRoute, syntheticRoute]);

    const prov = result.provenanceSummary;
    assert.strictEqual(prov.allVerified, false);
    assert.strictEqual(prov.hasUnverifiedData, true);
    assert.ok(prov.dataTiers.includes(PROVENANCE_TIERS.VERIFIED));
    assert.ok(prov.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED));
    assert.ok(prov.dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC));
    assert.strictEqual(prov.confidenceBreakdown[PROVENANCE_TIERS.VERIFIED], 1);
    assert.strictEqual(prov.confidenceBreakdown[PROVENANCE_TIERS.USER_REPORTED], 1);
    assert.strictEqual(prov.confidenceBreakdown[PROVENANCE_TIERS.SYNTHETIC], 1);

    // Each route exposes its own provenance object
    assert.strictEqual(result.routes.find(r => r.journeyId === 'route-verified').provenance.sourceTier, PROVENANCE_TIERS.VERIFIED);
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Duplicate and near-duplicate routes
  // ---------------------------------------------------------------------------
  test('Duplicate and near-duplicate routes: detects duplicates without discarding, with filter option', () => {
    const original = createRoute({
      journeyId: 'route-orig',
      departureTime: '08:00',
      estimatedArrivalTime: '08:35',
      totalTravelTime: 35,
      estimatedCost: 15,
      numberOfTransfers: 1,
      primaryMode: 'train',
      modesIncluded: ['walk', 'train']
    });

    // Exact duplicate
    const exactDup = createRoute({
      journeyId: 'route-exact-dup',
      departureTime: '08:00',
      estimatedArrivalTime: '08:35',
      totalTravelTime: 35,
      estimatedCost: 15,
      numberOfTransfers: 1,
      primaryMode: 'train',
      modesIncluded: ['walk', 'train']
    });

    // Near duplicate (same modes, cost, transfers, but 1 min duration difference)
    const nearDup = createRoute({
      journeyId: 'route-near-dup',
      departureTime: '08:00',
      estimatedArrivalTime: '08:36',
      totalTravelTime: 36,
      estimatedCost: 15,
      numberOfTransfers: 1,
      primaryMode: 'train',
      modesIncluded: ['walk', 'train']
    });

    // Run without filtering
    const result = routeComparisonService.compareRoutes([original, exactDup, nearDup]);

    assert.strictEqual(result.routes.length, 3);
    assert.strictEqual(result.comparisonSummary.hasDuplicates, true);
    assert.strictEqual(result.comparisonSummary.hasNearDuplicates, true);

    const dupRoute = result.routes.find(r => r.journeyId === 'route-exact-dup');
    assert.strictEqual(dupRoute.isDuplicate, true);
    assert.strictEqual(dupRoute.duplicateOf, 'route-orig');

    const nearRoute = result.routes.find(r => r.journeyId === 'route-near-dup');
    assert.strictEqual(nearRoute.isNearDuplicate, true);
    assert.strictEqual(nearRoute.nearDuplicateOf, 'route-orig');

    // Duplicate groups structure
    assert.ok(result.duplicateGroups.length >= 1);

    // Run with filterDuplicates: true
    const filteredResult = routeComparisonService.compareRoutes([original, exactDup, nearDup], {}, { filterDuplicates: true });
    assert.strictEqual(filteredResult.routes.length, 2);
    assert.ok(!filteredResult.routes.some(r => r.journeyId === 'route-exact-dup'));
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Pairwise route comparison (comparePair)
  // ---------------------------------------------------------------------------
  test('comparePair: provides head-to-head metric deltas and trade-off summary', () => {
    const routeTrain = createRoute({
      journeyId: 'cand-train',
      totalTravelTime: 28,
      estimatedCost: 10,
      walkingTime: 8,
      numberOfTransfers: 1
    });

    const routeAuto = createRoute({
      journeyId: 'cand-auto',
      totalTravelTime: 20,
      estimatedCost: 80,
      walkingTime: 2,
      numberOfTransfers: 0
    });

    const pair = routeComparisonService.comparePair(routeTrain, routeAuto);

    assert.strictEqual(pair.deltas.durationDifferenceMinutes, -8); // Auto is 8 min faster
    assert.strictEqual(pair.deltas.costDifferenceRupees, 70); // Auto is ₹70 more expensive
    assert.strictEqual(pair.deltas.walkingDifferenceMinutes, -6); // Auto requires 6 min less walk
    assert.strictEqual(pair.deltas.transfersDifference, -1); // Auto has 1 fewer transfer

    assert.strictEqual(pair.winnerByMetric.speed, 'cand-auto');
    assert.strictEqual(pair.winnerByMetric.cost, 'cand-train');
    assert.strictEqual(pair.winnerByMetric.walking, 'cand-auto');
    assert.strictEqual(pair.winnerByMetric.transfers, 'cand-auto');
    assert.strictEqual(pair.universalBestClaim, false);
    assert.ok(pair.tradeOffSummary.length >= 3);
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Empty array and invalid input handling
  // ---------------------------------------------------------------------------
  test('Input validation: handles empty array and throws on invalid non-array inputs', () => {
    const emptyResult = routeComparisonService.compareRoutes([]);
    assert.strictEqual(emptyResult.routes.length, 0);
    assert.strictEqual(emptyResult.comparisonSummary.totalRoutesCompared, 0);
    assert.strictEqual(emptyResult.comparisonSummary.universalBestClaim, false);

    assert.throws(() => {
      routeComparisonService.compareRoutes(null);
    }, /Routes must be provided as an array/);

    assert.throws(() => {
      routeComparisonService.comparePair(null, createRoute());
    }, /Both routeA and routeB are required/);
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Infeasible route handling
  // ---------------------------------------------------------------------------
  test('Infeasible route: ranked lower than feasible routes with transparent infeasibility weakness', () => {
    const feasibleSlow = createRoute({
      journeyId: 'route-feasible-slow',
      totalTravelTime: 65,
      isFeasible: true
    });

    const infeasibleFast = createRoute({
      journeyId: 'route-infeasible-fast',
      totalTravelTime: 15,
      isFeasible: false,
      feasibilityReason: 'SERVICE_SUSPENDED'
    });

    const result = routeComparisonService.compareRoutes([infeasibleFast, feasibleSlow]);

    assert.strictEqual(result.routes[0].journeyId, 'route-feasible-slow');
    assert.strictEqual(result.routes[0].rank, 1);
    assert.strictEqual(result.routes[1].journeyId, 'route-infeasible-fast');
    assert.strictEqual(result.routes[1].rank, 2);
    assert.ok(result.routes[1].weaknesses.some(w => w.includes('SERVICE_SUSPENDED')));
  });

  // Print summary
  console.log('\n========================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
