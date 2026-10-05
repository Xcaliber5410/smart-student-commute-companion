/**
 * ConstraintFilterService
 *
 * Stage 5 of the Commute Recommendation Pipeline.
 * Evaluates candidate routes against student commute constraints
 * (budget, walking tolerance, allowed transport modes, transfers, shared rides).
 *
 * Provides clear reasons for any route exclusions.
 */

const { CommuteConstraint, CommuteRoute, TRANSPORT_MODES } = require('../models');

// Constraint violation reason codes
const VIOLATION_REASONS = Object.freeze({
  DISALLOWED_MODE: 'DISALLOWED_MODE',
  EXCEEDS_BUDGET: 'EXCEEDS_BUDGET',
  EXCEEDS_WALKING_LIMIT: 'EXCEEDS_WALKING_LIMIT',
  EXCEEDS_MAX_TRANSFERS: 'EXCEEDS_MAX_TRANSFERS',
  SHARED_RIDES_DISALLOWED: 'SHARED_RIDES_DISALLOWED'
});

class ConstraintFilterService {
  /**
   * Evaluates candidate routes against user constraints and separates viable from rejected routes.
   *
   * @param {Array<CommuteRoute>} candidateRoutes - List of generated routes
   * @param {CommuteConstraint|object} constraints - Student constraints
   * @returns {object} Filter result containing viable routes, filtered routes with reasons, and summary stats
   */
  filterRoutes(candidateRoutes = [], constraints = {}) {
    const constraintObj = constraints instanceof CommuteConstraint
      ? constraints
      : new CommuteConstraint(constraints);

    const viableRoutes = [];
    const filteredRoutes = [];

    for (const route of candidateRoutes) {
      const evaluation = this.evaluateRoute(route, constraintObj);
      if (evaluation.isViable) {
        viableRoutes.push(route);
      } else {
        filteredRoutes.push({
          route,
          reason: evaluation.reason,
          violatedConstraint: evaluation.violatedConstraint,
          details: evaluation.details
        });
      }
    }

    return {
      viableRoutes,
      filteredRoutes,
      summary: {
        totalCandidates: candidateRoutes.length,
        viableCount: viableRoutes.length,
        filteredCount: filteredRoutes.length
      }
    };
  }

  /**
   * Evaluates a single route against constraints.
   *
   * @param {CommuteRoute} route
   * @param {CommuteConstraint} constraints
   * @returns {{ isViable: boolean, reason?: string, violatedConstraint?: string, details?: object }}
   */
  evaluateRoute(route, constraints) {
    // 1. Check transport modes included
    const modes = route.modesIncluded || [];
    for (const mode of modes) {
      // Walking is an intrinsic connector, always allowed unless explicitly forbidden
      if (mode === TRANSPORT_MODES.WALK) {
        continue;
      }

      if (!constraints.allowsMode(mode)) {
        return {
          isViable: false,
          reason: VIOLATION_REASONS.DISALLOWED_MODE,
          violatedConstraint: 'preferredModes',
          details: { mode, preferredModes: constraints.preferredModes }
        };
      }
    }

    // 2. Check shared rides constraint
    if (!constraints.allowSharedRides && modes.includes(TRANSPORT_MODES.SHARED_AUTO)) {
      return {
        isViable: false,
        reason: VIOLATION_REASONS.SHARED_RIDES_DISALLOWED,
        violatedConstraint: 'allowSharedRides',
        details: { allowSharedRides: false }
      };
    }

    // 3. Check budget constraint
    const totalFare = typeof route.getTotalFare === 'function'
      ? route.getTotalFare()
      : (route.estimate ? route.estimate.totalFareRupees : 0);

    if (!constraints.isWithinBudget(totalFare)) {
      return {
        isViable: false,
        reason: VIOLATION_REASONS.EXCEEDS_BUDGET,
        violatedConstraint: 'maxBudgetRupees',
        details: { totalFare, maxBudgetRupees: constraints.maxBudgetRupees }
      };
    }

    // 4. Check walking tolerance constraint
    const walkingMinutes = typeof route.getWalkingMinutes === 'function'
      ? route.getWalkingMinutes()
      : (route.estimate ? route.estimate.walkingDurationMinutes : 0);

    if (!constraints.isWithinWalkingLimit(walkingMinutes)) {
      return {
        isViable: false,
        reason: VIOLATION_REASONS.EXCEEDS_WALKING_LIMIT,
        violatedConstraint: 'walkingToleranceMinutes',
        details: { walkingMinutes, walkingToleranceMinutes: constraints.walkingToleranceMinutes }
      };
    }

    // 5. Check transfer count limit
    const transferCount = typeof route.getTransferCount === 'function'
      ? route.getTransferCount()
      : (route.estimate ? route.estimate.transferCount : 0);

    if (transferCount > constraints.maxTransfers) {
      return {
        isViable: false,
        reason: VIOLATION_REASONS.EXCEEDS_MAX_TRANSFERS,
        violatedConstraint: 'maxTransfers',
        details: { transferCount, maxTransfers: constraints.maxTransfers }
      };
    }

    return { isViable: true };
  }
}

const constraintFilterService = new ConstraintFilterService();

module.exports = {
  ConstraintFilterService,
  constraintFilterService,
  VIOLATION_REASONS
};
