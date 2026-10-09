/**
 * Unit & Integration Tests for Personalized Route Scoring
 *
 * Verifies:
 * 1. Faster journey preference ('fastest')
 * 2. Lower-cost preference ('cheapest')
 * 3. Preference change flips route ranking between fast and cheap routes
 * 4. Fewer transfers preference ('fewest_transfers' & preferFewerTransfers)
 * 5. Reduced walking preference ('least_walking' & preferReducedWalking)
 * 6. Preferred transport modes affinity bonus
 * 7. Hard arrival deadline enforced (cannot be overridden by speed preference)
 * 8. Hard maximum transfers enforced (cannot be overridden by preferences)
 * 9. Hard budget limit enforced
 * 10. Infeasible routes never recommended as feasible
 * 11. Missing preferences fall back to documented sensible defaults
 * 12. Reliability preference ('reliable')
 * 13. Unavailable transit cost handled safely without false exactness claims (Rule 6)
 * 14. Provenance and uncertainty preserved (Rule 8)
 * 15. Pure determinism and repeatability across identical inputs
 */

const assert = require('node:assert/strict');
const {
  deterministicRouteScoringService,
  DeterministicRouteScoringService,
  SCORING_RATES,
  PREFERENCE_PROFILES,
  DEFAULT_PREFERENCES,
  HARD_CONSTRAINT_REASONS
} = require('../services/deterministicRouteScoringService');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');

function runTests() {
  console.log('====================================================');
  console.log(' Running Personalized Route Scoring Tests');
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
    const additionalDelay = overrides.totalAdditionalDelay ?? (overrides.additionalDisruptionDelay ?? 0);
    const totalTravelTime = overrides.totalTravelTime ?? (baseline + additionalDelay);

    return new RouteEvaluation({
      journeyId: overrides.journeyId || 'cand-eval-1',
      origin: overrides.origin || 'Andheri West',
      destination: overrides.destination || 'D.J. Sanghvi College of Engineering',
      departureTime: overrides.departureTime || '08:00',
      estimatedArrivalTime: overrides.estimatedArrivalTime || '08:30',
      updatedArrivalTime: overrides.updatedArrivalTime || overrides.estimatedArrivalTime || '08:30',
      totalTravelTime,
      baselineTravelTime: baseline,
      additionalDisruptionDelay: overrides.additionalDisruptionDelay ?? 0,
      totalAdditionalDelay: additionalDelay,
      waitingTime: overrides.waitingTime ?? 3,
      walkingTime: overrides.walkingTime ?? 5,
      transitTime: overrides.transitTime ?? 22,
      numberOfTransfers: overrides.numberOfTransfers ?? 1,
      estimatedCost: (overrides.estimatedCost !== undefined && overrides.estimatedCost !== null) ? overrides.estimatedCost : 0,
      isCostAvailable: overrides.isCostAvailable !== undefined
        ? overrides.isCostAvailable
        : (overrides.estimatedCost !== null && overrides.estimatedCost !== undefined),
      isCostExact: overrides.isCostExact ?? false,
      totalDistanceKm: overrides.totalDistanceKm ?? 5.0,
      primaryMode: overrides.primaryMode || 'metro',
      modesIncluded: overrides.modesIncluded || ['walk', 'metro'],
      isFeasible: overrides.isFeasible !== undefined ? overrides.isFeasible : true,
      feasibilityReason: overrides.feasibilityReason || 'OPERATIONAL',
      affectedSegments: overrides.affectedSegments || [],
      unavailableSegments: overrides.unavailableSegments || [],
      reliability: overrides.reliability || 'LOW',
      uncertainty: overrides.uncertainty || 'LOW',
      trafficImpact: overrides.trafficImpact || { level: 'normal', addedTravelTimeMinutes: 0 },
      weatherImpact: overrides.weatherImpact || { condition: 'clear', totalAddedTravelTimeMinutes: 0 },
      transportStatus: overrides.transportStatus || { dominantStatus: 'AVAILABLE', isUsable: true },
      reasonCodes: overrides.reasonCodes || [],
      weaknesses: overrides.weaknesses || [],
      advisories: overrides.advisories || [],
      dataTiers: overrides.dataTiers || [PROVENANCE_TIERS.VERIFIED],
      provenance: overrides.provenance || DataProvenance.verified('Transit Feed', 'Official GTFS schedule')
    });
  }

  // 1. Faster journey preference ('fastest')
  test('Faster journey preference: ranks faster route higher when prioritizing speed', () => {
    const fastRoute = createEval({
      journeyId: 'route-fast',
      baselineTravelTime: 20,
      estimatedCost: 60,
      numberOfTransfers: 1
    });
    const slowRoute = createEval({
      journeyId: 'route-slow',
      baselineTravelTime: 45,
      estimatedCost: 15,
      numberOfTransfers: 1
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [slowRoute, fastRoute],
      {},
      { preferences: { route_preference: 'fastest' } }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-fast');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[1].journeyId, 'route-slow');
    assert.strictEqual(ranked[1].rank, 2);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    assert.strictEqual(ranked[0].breakdown.personalization.profile, 'fastest');
  });

  // 2. Lower-cost preference ('cheapest')
  test('Lower-cost preference: ranks affordable route higher when prioritizing budget', () => {
    const fastExpensiveRoute = createEval({
      journeyId: 'route-expensive',
      baselineTravelTime: 25,
      estimatedCost: 80,
      numberOfTransfers: 1
    });
    const slowCheapRoute = createEval({
      journeyId: 'route-cheap',
      baselineTravelTime: 38,
      estimatedCost: 10,
      numberOfTransfers: 1
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [fastExpensiveRoute, slowCheapRoute],
      {},
      { preferences: { route_preference: 'cheapest' } }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-cheap');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[1].journeyId, 'route-expensive');
    assert.strictEqual(ranked[1].rank, 2);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    assert.strictEqual(ranked[0].breakdown.personalization.profile, 'cheapest');
  });

  // 3. Changing preferences flips ranking between fast and cheap routes
  test('Preference flip: changing preference from fastest to cheapest reverses ranking', () => {
    const routeFast = createEval({
      journeyId: 'route-fast-metro',
      baselineTravelTime: 22,
      estimatedCost: 55,
      numberOfTransfers: 1
    });
    const routeCheap = createEval({
      journeyId: 'route-cheap-bus',
      baselineTravelTime: 36,
      estimatedCost: 12,
      numberOfTransfers: 1
    });

    // Fastest preference
    const rankedFast = deterministicRouteScoringService.scoreAndRankRoutes(
      [routeCheap, routeFast],
      {},
      { preferences: { route_preference: 'fastest' } }
    );
    assert.strictEqual(rankedFast[0].journeyId, 'route-fast-metro', 'Fastest preference should choose fast metro');

    // Cheapest preference
    const rankedCheap = deterministicRouteScoringService.scoreAndRankRoutes(
      [routeFast, routeCheap],
      {},
      { preferences: { route_preference: 'cheapest' } }
    );
    assert.strictEqual(rankedCheap[0].journeyId, 'route-cheap-bus', 'Cheapest preference should choose cheap bus');
  });

  // 4. Fewer transfers preference ('fewest_transfers' & preferFewerTransfers)
  test('Fewer transfers: direct route outranks transfer route under fewest_transfers preference', () => {
    const transferRoute = createEval({
      journeyId: 'route-with-transfers',
      baselineTravelTime: 28,
      numberOfTransfers: 2,
      estimatedCost: 20
    });
    const directRoute = createEval({
      journeyId: 'route-direct',
      baselineTravelTime: 32,
      numberOfTransfers: 0,
      estimatedCost: 20
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [transferRoute, directRoute],
      {},
      { preferences: { route_preference: 'fewest_transfers', prefer_fewer_transfers: true } }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-direct');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    const directBonus = ranked[0].breakdown.personalization.bonuses.find(b => b.type === 'DIRECT_ROUTE_BONUS');
    assert.ok(directBonus, 'Direct route should receive DIRECT_ROUTE_BONUS');
  });

  // 5. Reduced walking preference ('least_walking' & walkingToleranceMinutes)
  test('Reduced walking: low-walking route outranks high-walking route under least_walking preference', () => {
    const highWalkRoute = createEval({
      journeyId: 'route-high-walk',
      baselineTravelTime: 25,
      walkingTime: 22,
      numberOfTransfers: 0
    });
    const lowWalkRoute = createEval({
      journeyId: 'route-low-walk',
      baselineTravelTime: 32,
      walkingTime: 4,
      numberOfTransfers: 0
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [highWalkRoute, lowWalkRoute],
      {},
      { preferences: { route_preference: 'least_walking', walking_tolerance_minutes: 10 } }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-low-walk');
    assert.strictEqual(ranked[0].rank, 1);
    assert.ok(ranked[0].compositeScore > ranked[1].compositeScore);
    const walkBonus = ranked[0].breakdown.personalization.bonuses.find(b => b.type === 'LOW_WALKING_BONUS');
    assert.ok(walkBonus, 'Low walking route should receive LOW_WALKING_BONUS');
  });

  // 6. Preferred transport modes affinity bonus
  test('Preferred modes: route using preferred mode receives affinity bonus and ranks higher', () => {
    const busRoute = createEval({
      journeyId: 'route-bus',
      baselineTravelTime: 30,
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus']
    });
    const metroRoute = createEval({
      journeyId: 'route-metro',
      baselineTravelTime: 30,
      primaryMode: 'metro',
      modesIncluded: ['walk', 'metro']
    });

    // Prefer metro
    const rankedMetro = deterministicRouteScoringService.scoreAndRankRoutes(
      [busRoute, metroRoute],
      {},
      { preferences: { preferred_modes: ['metro'] } }
    );
    assert.strictEqual(rankedMetro[0].journeyId, 'route-metro');
    const metroBonus = rankedMetro[0].breakdown.personalization.bonuses.find(b => b.type === 'PREFERRED_MODE_MATCH');
    assert.ok(metroBonus, 'Metro route should receive PREFERRED_MODE_MATCH bonus');

    // Prefer bus
    const rankedBus = deterministicRouteScoringService.scoreAndRankRoutes(
      [metroRoute, busRoute],
      {},
      { preferences: { preferred_modes: ['bus'] } }
    );
    assert.strictEqual(rankedBus[0].journeyId, 'route-bus');
    const busBonus = rankedBus[0].breakdown.personalization.bonuses.find(b => b.type === 'PREFERRED_MODE_MATCH');
    assert.ok(busBonus, 'Bus route should receive PREFERRED_MODE_MATCH bonus');
  });

  // 7. Hard arrival deadline enforced (cannot be overridden by speed preference)
  test('Hard arrival deadline: fast route arriving late is marked infeasible and cannot outrank feasible route', () => {
    const fastLateRoute = createEval({
      journeyId: 'route-fast-late',
      baselineTravelTime: 15,
      departureTime: '08:50',
      estimatedArrivalTime: '09:15',
      updatedArrivalTime: '09:15',
      numberOfTransfers: 0
    });
    const slowerOnTimeRoute = createEval({
      journeyId: 'route-slower-ontime',
      baselineTravelTime: 35,
      departureTime: '08:15',
      estimatedArrivalTime: '08:50',
      updatedArrivalTime: '08:50',
      numberOfTransfers: 1
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [fastLateRoute, slowerOnTimeRoute],
      {},
      {
        preferences: { route_preference: 'fastest' },
        constraints: { targetArrivalTime: '09:00' }
      }
    );

    // On-time route must win rank 1
    assert.strictEqual(ranked[0].journeyId, 'route-slower-ontime');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[0].isFeasible, true);
    assert.strictEqual(ranked[0].feasibilityTier, 1);

    // Late route must be infeasible with tier 0 and compositeScore 0
    assert.strictEqual(ranked[1].journeyId, 'route-fast-late');
    assert.strictEqual(ranked[1].rank, 2);
    assert.strictEqual(ranked[1].isFeasible, false);
    assert.strictEqual(ranked[1].feasibilityTier, 0);
    assert.strictEqual(ranked[1].compositeScore, 0.0);
    assert.ok(ranked[1].reasonCodes.includes(HARD_CONSTRAINT_REASONS.ARRIVAL_TOO_LATE));
  });

  // 8. Hard maximum transfers enforced
  test('Hard max transfers: route exceeding hard transfer limit is rejected regardless of speed', () => {
    const multiTransferFast = createEval({
      journeyId: 'route-multi-transfer',
      baselineTravelTime: 18,
      numberOfTransfers: 3
    });
    const singleTransferModerate = createEval({
      journeyId: 'route-single-transfer',
      baselineTravelTime: 30,
      numberOfTransfers: 1
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [multiTransferFast, singleTransferModerate],
      {},
      {
        preferences: { route_preference: 'fastest' },
        hardConstraints: { maxTransfers: 1 }
      }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-single-transfer');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[0].isFeasible, true);

    assert.strictEqual(ranked[1].journeyId, 'route-multi-transfer');
    assert.strictEqual(ranked[1].isFeasible, false);
    assert.strictEqual(ranked[1].compositeScore, 0.0);
    assert.ok(ranked[1].reasonCodes.includes(HARD_CONSTRAINT_REASONS.TOO_MANY_TRANSFERS));
  });

  // 9. Hard budget limit enforced
  test('Hard budget limit: route exceeding hard budget limit is rejected as infeasible', () => {
    const expensiveRoute = createEval({
      journeyId: 'route-luxury-auto',
      baselineTravelTime: 20,
      estimatedCost: 150
    });
    const budgetRoute = createEval({
      journeyId: 'route-train',
      baselineTravelTime: 32,
      estimatedCost: 15
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [expensiveRoute, budgetRoute],
      {},
      {
        constraints: { maxBudgetRupees: 50 }
      }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-train');
    assert.strictEqual(ranked[0].isFeasible, true);

    assert.strictEqual(ranked[1].journeyId, 'route-luxury-auto');
    assert.strictEqual(ranked[1].isFeasible, false);
    assert.strictEqual(ranked[1].compositeScore, 0.0);
    assert.ok(ranked[1].reasonCodes.includes(HARD_CONSTRAINT_REASONS.BUDGET_EXCEEDED));
  });

  // 10. Infeasible routes never recommended as feasible (Rule 2)
  test('Infeasible routes: cancelled/disrupted route receives score 0.0 and never outranks feasible routes', () => {
    const cancelledRoute = createEval({
      journeyId: 'route-cancelled',
      baselineTravelTime: 15,
      isFeasible: false,
      feasibilityReason: 'WATERLOGGED_TRACKS',
      modesIncluded: ['metro']
    });
    const operationalRoute = createEval({
      journeyId: 'route-operational',
      baselineTravelTime: 40,
      isFeasible: true,
      modesIncluded: ['bus']
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [cancelledRoute, operationalRoute],
      {},
      { preferences: { route_preference: 'fastest', preferred_modes: ['metro'] } }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-operational');
    assert.strictEqual(ranked[0].rank, 1);
    assert.strictEqual(ranked[0].feasibilityTier, 1);

    assert.strictEqual(ranked[1].journeyId, 'route-cancelled');
    assert.strictEqual(ranked[1].rank, 2);
    assert.strictEqual(ranked[1].feasibilityTier, 0);
    assert.strictEqual(ranked[1].compositeScore, 0.0);
  });

  // 11. Missing preferences fall back to documented sensible defaults (Rule 3)
  test('Missing preferences: defaults safely to balanced profile without crashing', () => {
    const route = createEval({
      journeyId: 'route-default-check',
      baselineTravelTime: 30,
      estimatedCost: 20
    });

    const scoredEmpty = deterministicRouteScoringService.scoreRoute(route, {}, {});
    const scoredNull = deterministicRouteScoringService.scoreRoute(route, {}, { preferences: null });

    assert.strictEqual(scoredEmpty.breakdown.personalization.profile, 'balanced');
    assert.strictEqual(scoredNull.breakdown.personalization.profile, 'balanced');
    assert.strictEqual(scoredEmpty.compositeScore, scoredNull.compositeScore);
    assert.strictEqual(scoredEmpty.breakdown.travelTime.ratePerMinute, SCORING_RATES.TRAVEL_TIME_PER_MINUTE);
  });

  // 12. Reliability preference ('reliable')
  test('Reliability preference: penalizes uncertain/disrupted routes and rewards high predictability', () => {
    const uncertainDisruptedRoute = createEval({
      journeyId: 'route-uncertain',
      baselineTravelTime: 25,
      additionalDisruptionDelay: 12,
      reliability: 'HIGH',
      trafficImpact: { addedTravelTimeMinutes: 8 }
    });
    const predictableRoute = createEval({
      journeyId: 'route-predictable',
      baselineTravelTime: 30,
      additionalDisruptionDelay: 0,
      reliability: 'LOW',
      trafficImpact: { addedTravelTimeMinutes: 0 }
    });

    const ranked = deterministicRouteScoringService.scoreAndRankRoutes(
      [uncertainDisruptedRoute, predictableRoute],
      {},
      { preferences: { route_preference: 'reliable', prefer_reliable: true } }
    );

    assert.strictEqual(ranked[0].journeyId, 'route-predictable');
    assert.strictEqual(ranked[0].rank, 1);
    const reliabilityBonus = ranked[0].breakdown.personalization.bonuses.find(b => b.type === 'HIGH_RELIABILITY_BONUS');
    assert.ok(reliabilityBonus, 'Predictable route should receive HIGH_RELIABILITY_BONUS');
  });

  // 13. Unavailable transit cost handled safely without false exactness claims (Rule 6)
  test('Unavailable cost: handles null cost gracefully and does not claim unavailable estimate is exact', () => {
    const routeNoCost = createEval({
      journeyId: 'route-no-cost',
      estimatedCost: null
    });
    const routeEstimatedCost = createEval({
      journeyId: 'route-est-cost',
      estimatedCost: 35,
      isCostExact: false
    });

    const scoredNoCost = deterministicRouteScoringService.scoreRoute(routeNoCost);
    assert.strictEqual(scoredNoCost.breakdown.cost.fareRupees, null);
    assert.strictEqual(scoredNoCost.breakdown.cost.isAvailable, false);
    assert.strictEqual(scoredNoCost.breakdown.cost.isExact, false);
    assert.ok(scoredNoCost.breakdown.cost.description.includes('unavailable'));

    const scoredEstCost = deterministicRouteScoringService.scoreRoute(routeEstimatedCost);
    assert.strictEqual(scoredEstCost.breakdown.cost.fareRupees, 35);
    assert.strictEqual(scoredEstCost.breakdown.cost.isAvailable, true);
    assert.strictEqual(scoredEstCost.breakdown.cost.isExact, false);
    assert.strictEqual(scoredEstCost.breakdown.cost.isEstimated, true);
  });

  // 14. Provenance and uncertainty preserved (Rule 8)
  test('Provenance preservation: preserves source provenance and uncertainty in score output', () => {
    const customProvenance = DataProvenance.verified('MMRDA Metro Line 2A', 'Real-time GTFS feed');
    const route = createEval({
      journeyId: 'route-prov-check',
      provenance: customProvenance,
      dataTiers: [PROVENANCE_TIERS.VERIFIED],
      reliability: 'LOW',
      uncertainty: 'LOW'
    });

    const scored = deterministicRouteScoringService.scoreRoute(route);
    assert.strictEqual(scored.provenance.provider, 'MMRDA Metro Line 2A');
    assert.strictEqual(scored.provenance.sourceTier, PROVENANCE_TIERS.VERIFIED);
    assert.deepStrictEqual(scored.dataTiers, [PROVENANCE_TIERS.VERIFIED]);
  });

  // 15. Pure determinism and repeatability across identical calls (Rule 4)
  test('Determinism: repeated invocations with identical preferences produce identical scores and ranks', () => {
    const route1 = createEval({ journeyId: 'route-det-1', baselineTravelTime: 25, estimatedCost: 30 });
    const route2 = createEval({ journeyId: 'route-det-2', baselineTravelTime: 35, estimatedCost: 15 });
    const options = { preferences: { route_preference: 'fastest', preferred_modes: ['metro'] } };

    const runA = deterministicRouteScoringService.scoreAndRankRoutes([route1, route2], {}, options);
    const runB = deterministicRouteScoringService.scoreAndRankRoutes([route1, route2], {}, options);

    assert.strictEqual(runA.length, runB.length);
    for (let i = 0; i < runA.length; i++) {
      assert.strictEqual(runA[i].journeyId, runB[i].journeyId);
      assert.strictEqual(runA[i].compositeScore, runB[i].compositeScore);
      assert.strictEqual(runA[i].rank, runB[i].rank);
      assert.strictEqual(runA[i].totalPenalties, runB[i].totalPenalties);
    }
  });

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
