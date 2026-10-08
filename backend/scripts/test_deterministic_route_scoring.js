/**
 * Unit Tests for DeterministicRouteScoringService
 *
 * Verifies:
 * 1. Fast vs Slow route
 * 2. Disrupted vs Unaffected route
 * 3. Infeasible route (must NEVER outrank feasible routes)
 * 4. Fewer-transfer route
 * 5. High-walking route
 * 6. Uncertain route
 * 7. Tied / Near-tied routes & deterministic tie-breaking
 * 8. Explainability & itemized penalty breakdown
 * 9. Provenance preservation
 */

const assert = require('node:assert/strict');
const {
  deterministicRouteScoringService,
  DeterministicRouteScoringService,
  SCORING_RATES
} = require('../services/deterministicRouteScoringService');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');

function runTests() {
  console.log('====================================================');
  console.log(' Running DeterministicRouteScoringService Unit Tests');
  console.log('====================================================\n');

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

  // Helper factory for RouteEvaluation instances
  function createEval(overrides = {}) {
    const baseline = overrides.baselineTravelTime ?? 30;
    const additionalDelay = overrides.totalAdditionalDelay ?? 0;
    const totalTravelTime = overrides.totalTravelTime ?? (baseline + additionalDelay);

    return new RouteEvaluation({
      journeyId: overrides.journeyId || 'cand-eval-1',
      origin: overrides.origin || 'Andheri West',
      destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
      departureTime: overrides.departureTime || '08:00',
      estimatedArrivalTime: overrides.estimatedArrivalTime || '08:30',
      updatedArrivalTime: overrides.updatedArrivalTime || '08:30',
      totalTravelTime,
      baselineTravelTime: baseline,
      additionalDisruptionDelay: overrides.additionalDisruptionDelay ?? 0,
      totalAdditionalDelay: additionalDelay,
      waitingTime: overrides.waitingTime ?? 3,
      walkingTime: overrides.walkingTime ?? 6,
      transitTime: overrides.transitTime ?? 21,
      numberOfTransfers: overrides.numberOfTransfers ?? 1,
      estimatedCost: overrides.estimatedCost ?? 20,
      totalDistanceKm: overrides.totalDistanceKm ?? 4.0,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
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
      provenance: overrides.provenance || DataProvenance.verified('Transit Feed', 'Official GTFS schedule')
    });
  }

  // 1. Fast vs Slow Route
  test('Fast vs slow route: faster route receives higher composite score and rank #1', () => {
    const fastRoute = createEval({ journeyId: 'route-fast', baselineTravelTime: 20 });
    const slowRoute = createEval({ journeyId: 'route-slow', baselineTravelTime: 60 });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes([slowRoute, fastRoute]);

    assert.strictEqual(ranked.length, 2);
    assert.strictEqual(ranked[0].journeyId, 'route-fast');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[1].journeyId, 'route-slow');
    assert.strictEqual(ranked[1].rank, 2);

    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    assert.ok(ranked[0].breakdown.travelTime.pointsDeducted < ranked[1].breakdown.travelTime.pointsDeducted);
  });

  // 2. Disrupted vs Unaffected Route
  test('Disrupted vs unaffected route: unaffected route outranks disrupted route', () => {
    const cleanRoute = createEval({
      journeyId: 'route-clean',
      baselineTravelTime: 30,
      additionalDisruptionDelay: 0
    });
    const disruptedRoute = createEval({
      journeyId: 'route-disrupted',
      baselineTravelTime: 30,
      additionalDisruptionDelay: 20,
      totalAdditionalDelay: 20,
      affectedSegments: [{ segmentIndex: 1, mode: 'train', delayMinutes: 20 }]
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes([disruptedRoute, cleanRoute]);

    assert.strictEqual(ranked[0].journeyId, 'route-clean');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[1].journeyId, 'route-disrupted');
    assert.strictEqual(ranked[1].rank, 2);

    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    assert.strictEqual(ranked[0].breakdown.disruption.pointsDeducted, 0);
    assert.ok(ranked[1].breakdown.disruption.pointsDeducted > 0);
  });

  // 3. Infeasible Route (CRITICAL INVARIANT: NEVER OUTRANKS FEASIBLE ROUTES)
  test('Infeasible route: infeasible route NEVER outranks feasible route regardless of speed', () => {
    // Fast route that is cancelled/suspended (infeasible)
    const cancelledFastRoute = createEval({
      journeyId: 'route-fast-cancelled',
      baselineTravelTime: 12,
      isFeasible: false,
      feasibilityReason: 'SERVICE_SUSPENDED',
      unavailableSegments: [{ segmentIndex: 0, mode: 'train', status: 'SUSPENDED' }]
    });

    // Slow route that is fully feasible
    const slowFeasibleRoute = createEval({
      journeyId: 'route-slow-feasible',
      baselineTravelTime: 55,
      isFeasible: true,
      feasibilityReason: 'OPERATIONAL'
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes([cancelledFastRoute, slowFeasibleRoute]);

    assert.strictEqual(ranked.length, 2);
    // Feasible route MUST be ranked #1
    assert.strictEqual(ranked[0].journeyId, 'route-slow-feasible');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[0].feasibilityTier, 1);
    assert.strictEqual(ranked[0].isFeasible, true);

    // Infeasible route MUST be ranked #2 and have score 0
    assert.strictEqual(ranked[1].journeyId, 'route-fast-cancelled');
    assert.strictEqual(ranked[1].rank, 2);
    assert.strictEqual(ranked[1].feasibilityTier, 0);
    assert.strictEqual(ranked[1].isFeasible, false);
    assert.strictEqual(ranked[1].compositeScore, 0.0);
  });

  // 4. Fewer-Transfer Route
  test('Fewer-transfer route: direct route outranks multi-transfer route with equal travel time', () => {
    const directRoute = createEval({
      journeyId: 'route-direct',
      baselineTravelTime: 35,
      numberOfTransfers: 0
    });
    const multiTransferRoute = createEval({
      journeyId: 'route-multi-transfer',
      baselineTravelTime: 35,
      numberOfTransfers: 2
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes([multiTransferRoute, directRoute]);

    assert.strictEqual(ranked[0].journeyId, 'route-direct');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    assert.strictEqual(ranked[0].breakdown.transfers.pointsDeducted, 0);
    assert.strictEqual(ranked[1].breakdown.transfers.pointsDeducted, 10.0); // 2 transfers * 5 pts
  });

  // 5. High-Walking Route
  test('High-walking route: low-walking route outranks route with heavy pedestrian exertion', () => {
    const lowWalkRoute = createEval({
      journeyId: 'route-low-walk',
      baselineTravelTime: 40,
      walkingTime: 5
    });
    const highWalkRoute = createEval({
      journeyId: 'route-high-walk',
      baselineTravelTime: 40,
      walkingTime: 25 // 25 min walk triggers excess walk penalty
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes([highWalkRoute, lowWalkRoute]);

    assert.strictEqual(ranked[0].journeyId, 'route-low-walk');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);

    // Excess walking (> 15 min) incurs base 25 * 0.7 = 17.5 plus excess 10 * 0.5 = 5.0 -> 22.5 pts
    assert.strictEqual(ranked[1].breakdown.walking.pointsDeducted, 22.5);
  });

  // 6. Uncertain Route
  test('Uncertain route: high predictability route outranks route with high uncertainty risk', () => {
    const reliableRoute = createEval({
      journeyId: 'route-reliable',
      baselineTravelTime: 30,
      reliability: 'LOW',
      uncertainty: 'LOW'
    });
    const volatileRoute = createEval({
      journeyId: 'route-volatile',
      baselineTravelTime: 30,
      reliability: 'HIGH',
      uncertainty: 'HIGH'
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes([volatileRoute, reliableRoute]);

    assert.strictEqual(ranked[0].journeyId, 'route-reliable');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    assert.strictEqual(ranked[0].breakdown.uncertainty.pointsDeducted, 0);
    assert.strictEqual(ranked[1].breakdown.uncertainty.pointsDeducted, 10.0);
  });

  // 7. Tied / Near-Tied Routes & Deterministic Tie-Breaking
  test('Tied / near-tied routes: deterministic tie-breaking produces identical repeatable ordering', () => {
    const routeAlpha = createEval({
      journeyId: 'route-alpha',
      baselineTravelTime: 30,
      walkingTime: 8,
      waitingTime: 4,
      numberOfTransfers: 1,
      estimatedCost: 20
    });
    const routeBeta = createEval({
      journeyId: 'route-beta',
      baselineTravelTime: 30,
      walkingTime: 8,
      waitingTime: 4,
      numberOfTransfers: 1,
      estimatedCost: 20
    });

    // Run 1
    const run1 = deterministicRouteScoringService.scoreAndRankRoutes([routeBeta, routeAlpha]);
    // Run 2 (passed in reverse)
    const run2 = deterministicRouteScoringService.scoreAndRankRoutes([routeAlpha, routeBeta]);

    assert.strictEqual(run1[0].compositeScore, run1[1].compositeScore);
    assert.strictEqual(run2[0].compositeScore, run2[1].compositeScore);

    // Alphabetical tie-breaking: 'route-alpha' before 'route-beta'
    assert.strictEqual(run1[0].journeyId, 'route-alpha');
    assert.strictEqual(run1[0].rank, 1);
    assert.strictEqual(run1[1].journeyId, 'route-beta');
    assert.strictEqual(run1[1].rank, 2);

    assert.strictEqual(run2[0].journeyId, 'route-alpha');
    assert.strictEqual(run2[1].journeyId, 'route-beta');
  });

  // 8. Explainability & Breakdown Inspection
  test('Explainability: returns transparent penalty breakdown and human-readable explanation', () => {
    const route = createEval({
      journeyId: 'route-explainable',
      baselineTravelTime: 30,
      walkingTime: 10,
      waitingTime: 5,
      numberOfTransfers: 1,
      estimatedCost: 25,
      additionalDisruptionDelay: 10,
      reliability: 'MODERATE'
    });

    const result = deterministicRouteScoringService.scoreRoute(route);

    assert.ok(result.breakdown, 'Must contain breakdown');
    assert.strictEqual(result.breakdown.baseScore, 100);
    assert.ok(result.breakdown.travelTime.pointsDeducted > 0);
    assert.ok(result.breakdown.disruption.pointsDeducted > 0);
    assert.ok(result.breakdown.waiting.pointsDeducted > 0);
    assert.ok(result.breakdown.walking.pointsDeducted > 0);
    assert.ok(result.breakdown.transfers.pointsDeducted > 0);
    assert.ok(result.breakdown.cost.pointsDeducted > 0);
    assert.ok(result.breakdown.uncertainty.pointsDeducted > 0);

    assert.ok(Array.isArray(result.explanations));
    assert.ok(result.explanations.length >= 5);
    result.explanations.forEach(exp => {
      assert.strictEqual(typeof exp, 'string');
      assert.ok(exp.length > 5);
    });
  });

  // 9. Provenance Preservation
  test('Provenance: preserves sourceTier and dataTiers in scoring output', () => {
    const route = createEval({
      journeyId: 'route-prov',
      dataTiers: [PROVENANCE_TIERS.VERIFIED, PROVENANCE_TIERS.ESTIMATED],
      provenance: DataProvenance.verified('Official Mumbai Rail Timetable', 'Direct feed')
    });

    const result = deterministicRouteScoringService.scoreRoute(route);

    assert.ok(result.dataTiers.includes(PROVENANCE_TIERS.VERIFIED));
    assert.ok(result.dataTiers.includes(PROVENANCE_TIERS.ESTIMATED));
    assert.strictEqual(result.provenance.sourceTier, PROVENANCE_TIERS.VERIFIED);
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runTests();
