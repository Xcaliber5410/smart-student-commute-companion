/**
 * Route Constraint Filtering Test Suite
 *
 * Verifies deterministic constraint filtering stage:
 * - Clear separation between HARD constraints (invalidating routes) and SOFT preferences (guiding ranking)
 * - Deterministic reason codes (ARRIVAL_TOO_LATE, TOO_MANY_TRANSFERS, WALKING_LIMIT_EXCEEDED,
 *   BUDGET_EXCEEDED, SERVICE_UNAVAILABLE, OPERATING_HOURS_VIOLATED, ROUTE_DISRUPTED, EXCLUDED_MODE, DISALLOWED_MODE)
 * - Preservation of rejected routes with itemized violation details (no silent discard)
 * - Soft preference affinity calculation and tracking
 * - Batch filtering summary telemetry and rejection breakdown
 */

const assert = require('node:assert/strict');
const {
  routeConstraintFilteringService,
  RouteConstraintFilteringService,
  CONSTRAINT_TYPES,
  HARD_CONSTRAINT_REASON_CODES,
  SOFT_PREFERENCE_CODES
} = require('../services/routeConstraintFilteringService');
const { candidateRouteEngine } = require('../services/candidateRouteEngine');

async function runConstraintFilteringTests() {
  console.log('========================================================');
  console.log(' Running Route Constraint Filtering Test Suite');
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
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Accepted Clean Route
  // ---------------------------------------------------------------------------
  test('Accepted route: passes all hard constraints within limits', () => {
    const journey = {
      id: 'cand-clean-1',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train'],
      departureTime: '08:00',
      estimatedArrivalTime: '08:42',
      totalDurationMinutes: 42,
      transferCount: 0,
      walkingTimeMinutes: 7,
      estimatedCostRupees: 15,
      isFeasible: true,
      segments: [
        { mode: 'walk', departureTime: '08:00', status: 'OPERATIONAL' },
        { mode: 'train', departureTime: '08:08', lineIdentifier: 'WR-SLOW', status: 'OPERATIONAL' },
        { mode: 'walk', departureTime: '08:35', status: 'OPERATIONAL' }
      ]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      targetArrivalTime: '08:50',
      constraints: {
        maxTransfers: 1,
        maxWalkingMinutes: 15,
        maxBudgetRupees: 50
      },
      preferences: {
        preferredModes: ['train']
      }
    });

    assert.strictEqual(result.isAccepted, true);
    assert.strictEqual(result.status, 'ACCEPTED');
    assert.strictEqual(result.primaryReasonCode, null);
    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.reasonCodes.length, 0);
    assert.strictEqual(result.softPreferences.isPreferredModeUsed, true);
    assert.deepStrictEqual(result.softPreferences.preferredModesMatched, ['train']);
  });

  // ---------------------------------------------------------------------------
  // 2. Rejected Route: ARRIVAL_TOO_LATE
  // ---------------------------------------------------------------------------
  test('Rejected route: ARRIVAL_TOO_LATE when estimated arrival exceeds target deadline', () => {
    const journey = {
      id: 'cand-late-1',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      departureTime: '08:00',
      estimatedArrivalTime: '09:05',
      totalDurationMinutes: 65,
      transferCount: 0,
      walkingTimeMinutes: 8,
      estimatedCostRupees: 20,
      isFeasible: true,
      segments: [
        { mode: 'bus', departureTime: '08:08', status: 'OPERATIONAL' }
      ]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      targetArrivalTime: '08:50'
    });

    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.ARRIVAL_TOO_LATE);
    assert.ok(result.reasonCodes.includes('ARRIVAL_TOO_LATE'));
    const viol = result.violations.find(v => v.reasonCode === 'ARRIVAL_TOO_LATE');
    assert.ok(viol);
    assert.strictEqual(viol.constraintType, CONSTRAINT_TYPES.HARD);
    assert.strictEqual(viol.threshold, '08:50');
    assert.strictEqual(viol.actualValue, '09:05');
  });

  // ---------------------------------------------------------------------------
  // 3. Rejected Route: ARRIVAL_TOO_LATE via contextual delay update
  // ---------------------------------------------------------------------------
  test('Rejected route: ARRIVAL_TOO_LATE triggered by real-time contextual delay', () => {
    const journey = {
      id: 'cand-context-delayed',
      primaryMode: 'auto',
      modesIncluded: ['auto'],
      departureTime: '08:00',
      estimatedArrivalTime: '08:45', // Baseline on time
      totalDurationMinutes: 45,
      contextualImpact: {
        updatedArrivalTime: '09:12', // Delayed past 09:00 deadline by traffic
        updatedDurationMinutes: 72,
        isFeasible: true
      },
      segments: [{ mode: 'auto', departureTime: '08:00', status: 'OPERATIONAL' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      targetArrivalTime: '09:00'
    });

    assert.strictEqual(result.isAccepted, false);
    assert.ok(result.reasonCodes.includes('ARRIVAL_TOO_LATE'));
    const viol = result.violations.find(v => v.reasonCode === 'ARRIVAL_TOO_LATE');
    assert.strictEqual(viol.actualValue, '09:12');
  });

  // ---------------------------------------------------------------------------
  // 4. Rejected Route: TOO_MANY_TRANSFERS
  // ---------------------------------------------------------------------------
  test('Rejected route: TOO_MANY_TRANSFERS when transfer count exceeds maxTransfers limit', () => {
    const journey = {
      id: 'cand-multi-transfer',
      primaryMode: 'train',
      modesIncluded: ['walk', 'train', 'metro', 'bus'],
      transferCount: 3,
      walkingTimeMinutes: 10,
      estimatedCostRupees: 40,
      segments: [{ mode: 'train' }, { mode: 'metro' }, { mode: 'bus' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      constraints: {
        maxTransfers: 1
      }
    });

    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.TOO_MANY_TRANSFERS);
    const viol = result.violations.find(v => v.reasonCode === 'TOO_MANY_TRANSFERS');
    assert.strictEqual(viol.actualValue, 3);
    assert.strictEqual(viol.threshold, 1);
  });

  // ---------------------------------------------------------------------------
  // 5. Rejected Route: WALKING_LIMIT_EXCEEDED
  // ---------------------------------------------------------------------------
  test('Rejected route: WALKING_LIMIT_EXCEEDED when walking time exceeds maxWalkingMinutes', () => {
    const journey = {
      id: 'cand-excess-walking',
      primaryMode: 'walk',
      modesIncluded: ['walk'],
      walkingTimeMinutes: 35,
      transferCount: 0,
      segments: [{ mode: 'walk' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      constraints: {
        maxWalkingMinutes: 20
      }
    });

    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.WALKING_LIMIT_EXCEEDED);
    const viol = result.violations.find(v => v.reasonCode === 'WALKING_LIMIT_EXCEEDED');
    assert.strictEqual(viol.actualValue, 35);
    assert.strictEqual(viol.threshold, 20);
  });

  // ---------------------------------------------------------------------------
  // 6. Rejected Route: BUDGET_EXCEEDED
  // ---------------------------------------------------------------------------
  test('Rejected route: BUDGET_EXCEEDED when estimated fare exceeds maxBudgetRupees', () => {
    const journey = {
      id: 'cand-costly-auto',
      primaryMode: 'auto',
      modesIncluded: ['auto'],
      estimatedCostRupees: 140,
      segments: [{ mode: 'auto' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      constraints: {
        maxBudgetRupees: 60
      }
    });

    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.BUDGET_EXCEEDED);
    const viol = result.violations.find(v => v.reasonCode === 'BUDGET_EXCEEDED');
    assert.strictEqual(viol.actualValue, 140);
    assert.strictEqual(viol.threshold, 60);
  });

  // ---------------------------------------------------------------------------
  // 7. Rejected Route: EXCLUDED_MODE & DISALLOWED_MODE
  // ---------------------------------------------------------------------------
  test('Rejected route: EXCLUDED_MODE when journey includes avoidModes', () => {
    const journey = {
      id: 'cand-with-auto',
      primaryMode: 'auto',
      modesIncluded: ['walk', 'auto'],
      segments: [{ mode: 'walk' }, { mode: 'auto' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      preferences: {
        avoidModes: ['auto']
      }
    });

    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.EXCLUDED_MODE);
  });

  test('Rejected route: DISALLOWED_MODE when journey includes mode not in allowedModes whitelist', () => {
    const journey = {
      id: 'cand-with-bus',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      segments: [{ mode: 'walk' }, { mode: 'bus' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      preferences: {
        allowedModes: ['train', 'metro'] // Walk is implicitly allowed, but bus is not
      }
    });

    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.DISALLOWED_MODE);
  });

  // ---------------------------------------------------------------------------
  // 8. Rejected Route: SERVICE_UNAVAILABLE & OPERATING_HOURS_VIOLATED
  // ---------------------------------------------------------------------------
  test('Rejected route: SERVICE_UNAVAILABLE when segment or context reports inactive/suspended service', () => {
    const journey = {
      id: 'cand-cancelled-service',
      primaryMode: 'train',
      modesIncluded: ['train'],
      segments: [
        { mode: 'train', lineIdentifier: 'WR-AC', status: 'CANCELLED' }
      ]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey);
    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.SERVICE_UNAVAILABLE);
  });

  test('Rejected route: OPERATING_HOURS_VIOLATED when transit departs outside schedule window', () => {
    const journey = {
      id: 'cand-night-departure',
      primaryMode: 'train',
      modesIncluded: ['train'],
      segments: [
        {
          mode: 'train',
          lineIdentifier: 'WR-SLOW',
          departureTime: '02:30', // Western Railway runs ~04:15 to 01:15
          status: 'OPERATIONAL',
          isTransit: () => true
        }
      ]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey);
    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.OPERATING_HOURS_VIOLATED);
  });

  // ---------------------------------------------------------------------------
  // 9. Rejected Route: ROUTE_DISRUPTED
  // ---------------------------------------------------------------------------
  test('Rejected route: ROUTE_DISRUPTED when context marks route infeasible due to severe disruption', () => {
    const journey = {
      id: 'cand-flooded-track',
      primaryMode: 'train',
      modesIncluded: ['train'],
      isFeasible: false,
      feasibilityReason: 'CRITICAL_DISRUPTION: Tracks submerged between Bandra and Mahim',
      segments: [{ mode: 'train', status: 'OPERATIONAL' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey);
    assert.strictEqual(result.isAccepted, false);
    assert.strictEqual(result.primaryReasonCode, HARD_CONSTRAINT_REASON_CODES.ROUTE_DISRUPTED);
  });

  // ---------------------------------------------------------------------------
  // 10. Soft Preferences Separation: Does NOT reject route
  // ---------------------------------------------------------------------------
  test('Soft preferences: non-preferred modes or sub-optimal attributes do NOT reject route', () => {
    const journey = {
      id: 'cand-bus-soft',
      primaryMode: 'bus',
      modesIncluded: ['walk', 'bus'],
      estimatedArrivalTime: '08:45',
      totalDurationMinutes: 45,
      transferCount: 0,
      walkingTimeMinutes: 8,
      estimatedCostRupees: 20,
      isFeasible: true,
      segments: [{ mode: 'bus', departureTime: '08:05', status: 'OPERATIONAL' }]
    };

    const result = routeConstraintFilteringService.evaluateRoute(journey, {
      targetArrivalTime: '09:00',
      preferences: {
        preferredModes: ['train', 'metro'], // Bus is not in preferred modes, but is NOT avoided
        preference: 'cheapest'
      }
    });

    // Hard constraints passed!
    assert.strictEqual(result.isAccepted, true);
    assert.strictEqual(result.status, 'ACCEPTED');
    assert.strictEqual(result.violations.length, 0);

    // Soft preferences captured
    assert.strictEqual(result.softPreferences.isPreferredModeUsed, false);
    assert.deepStrictEqual(result.softPreferences.preferredModesMissed, ['train', 'metro']);
    assert.ok(result.softPreferences.affinityScore > 0);
    assert.ok(result.softPreferences.notes.length > 0);
  });

  // ---------------------------------------------------------------------------
  // 11. Multi-Constraint Violations & Deterministic Rejection Breakdown
  // ---------------------------------------------------------------------------
  test('filterCandidates: partitions multiple candidates without silently dropping invalid routes', () => {
    const candidates = [
      // 1. Clean valid train
      {
        id: 'cand-valid-train',
        primaryMode: 'train',
        modesIncluded: ['walk', 'train'],
        estimatedArrivalTime: '08:40',
        transferCount: 0,
        walkingTimeMinutes: 7,
        estimatedCostRupees: 15,
        isFeasible: true,
        segments: [{ mode: 'train', departureTime: '08:05', status: 'OPERATIONAL' }]
      },
      // 2. Late bus (ARRIVAL_TOO_LATE)
      {
        id: 'cand-late-bus',
        primaryMode: 'bus',
        modesIncluded: ['walk', 'bus'],
        estimatedArrivalTime: '09:20',
        transferCount: 0,
        walkingTimeMinutes: 8,
        estimatedCostRupees: 20,
        isFeasible: true,
        segments: [{ mode: 'bus', departureTime: '08:05', status: 'OPERATIONAL' }]
      },
      // 3. Multi-transfer (TOO_MANY_TRANSFERS)
      {
        id: 'cand-excess-transfers',
        primaryMode: 'metro',
        modesIncluded: ['walk', 'metro', 'bus', 'train'],
        estimatedArrivalTime: '08:45',
        transferCount: 3,
        walkingTimeMinutes: 8,
        estimatedCostRupees: 35,
        isFeasible: true,
        segments: [{ mode: 'metro', departureTime: '08:05', status: 'OPERATIONAL' }]
      },
      // 4. Over-budget auto (BUDGET_EXCEEDED)
      {
        id: 'cand-pricey-auto',
        primaryMode: 'auto',
        modesIncluded: ['auto'],
        estimatedArrivalTime: '08:35',
        transferCount: 0,
        walkingTimeMinutes: 2,
        estimatedCostRupees: 180,
        isFeasible: true,
        segments: [{ mode: 'auto', departureTime: '08:00', status: 'OPERATIONAL' }]
      }
    ];

    const filterResult = routeConstraintFilteringService.filterCandidates(candidates, {
      targetArrivalTime: '09:00',
      constraints: {
        maxTransfers: 1,
        maxWalkingMinutes: 15,
        maxBudgetRupees: 100
      }
    });

    assert.strictEqual(filterResult.summary.totalEvaluated, 4);
    assert.strictEqual(filterResult.accepted.length, 1);
    assert.strictEqual(filterResult.rejected.length, 3);
    assert.strictEqual(filterResult.summary.acceptedCount, 1);
    assert.strictEqual(filterResult.summary.rejectedCount, 3);

    // Verified: No routes silently discarded
    const acceptedIds = filterResult.accepted.map(a => a.candidateId);
    const rejectedIds = filterResult.rejected.map(r => r.candidateId);
    assert.deepStrictEqual(acceptedIds, ['cand-valid-train']);
    assert.ok(rejectedIds.includes('cand-late-bus'));
    assert.ok(rejectedIds.includes('cand-excess-transfers'));
    assert.ok(rejectedIds.includes('cand-pricey-auto'));

    // Breakdown counts
    assert.strictEqual(filterResult.summary.rejectionBreakdown.ARRIVAL_TOO_LATE, 1);
    assert.strictEqual(filterResult.summary.rejectionBreakdown.TOO_MANY_TRANSFERS, 1);
    assert.strictEqual(filterResult.summary.rejectionBreakdown.BUDGET_EXCEEDED, 1);
  });

  // ---------------------------------------------------------------------------
  // 12. CandidateRouteEngine Integration
  // ---------------------------------------------------------------------------
  test('CandidateRouteEngine integration: engine.filterCandidates works seamlessly', () => {
    const dummy = [{
      id: 'cand-test-engine',
      primaryMode: 'train',
      modesIncluded: ['train'],
      estimatedArrivalTime: '08:45',
      transferCount: 0,
      walkingTimeMinutes: 5,
      estimatedCostRupees: 10,
      isFeasible: true,
      segments: [{ mode: 'train', departureTime: '08:10', status: 'OPERATIONAL' }]
    }];

    const result = candidateRouteEngine.filterCandidates(dummy, {
      targetArrivalTime: '09:00'
    });

    assert.ok(result);
    assert.strictEqual(result.summary.totalEvaluated, 1);
    assert.strictEqual(result.accepted.length, 1);
  });

  console.log('\n========================================================');
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runConstraintFilteringTests();
