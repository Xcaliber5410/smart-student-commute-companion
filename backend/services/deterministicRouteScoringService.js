/**
 * DeterministicRouteScoringService
 *
 * Provides a deterministic, explainable, and transparent scoring service
 * for candidate commute routes using route evaluations and commute context.
 *
 * Scoring Criteria:
 * - Total travel time (baseline scheduled duration)
 * - Disruption-related unexpected delay
 * - Road traffic congestion delay
 * - Station / stop waiting time
 * - Walking burden and pedestrian exertion
 * - Number of modal transfers / interchanges
 * - Estimated monetary cost / fare
 * - Route feasibility & operational status
 * - Unavailable / affected segments count
 * - Reliability / uncertainty level
 * - Transport availability & context impact
 *
 * Key Invariants:
 * - Infeasible routes NEVER outrank feasible routes (strict feasibility tiering)
 * - 100% deterministic: identical route & context always produce identical scores and ranks
 * - 100% explainable: every deducted point is itemized with human-readable rationale
 * - Preserves 4-tier data provenance without loss
 * - Personalized student preferences are intentionally decoupled and deferred
 */

const { RouteEvaluation } = require('../models/RouteEvaluation');
const { routeEvaluationService } = require('./routeEvaluationService');
const { ValidationError } = require('../errors');

// Standard explainable penalty rates (calibrated for Mumbai student transit)
const SCORING_RATES = Object.freeze({
  BASE_SCORE: 100.0,
  TRAVEL_TIME_PER_MINUTE: 0.5,      // 0.5 pts / min scheduled travel time
  DISRUPTION_PER_MINUTE: 1.2,       // 1.2 pts / min unexpected delay (high friction)
  TRAFFIC_PER_MINUTE: 0.8,          // 0.8 pts / min road congestion delay
  WAITING_PER_MINUTE: 0.8,          // 0.8 pts / min station/stop waiting time
  WALKING_PER_MINUTE: 0.7,          // 0.7 pts / min pedestrian walking exertion
  EXCESS_WALK_PER_MINUTE: 0.5,      // Additional 0.5 pts / min for walking beyond 15 min
  PER_TRANSFER: 5.0,                // 5.0 pts per modal transfer
  PER_RUPEE_COST: 0.15,             // 0.15 pts per Rupee (economic student friction)
  PER_AFFECTED_SEGMENT: 3.0,        // 3.0 pts per affected segment risk
  UNCERTAINTY_PENALTIES: Object.freeze({
    LOW: 0.0,
    MODERATE: 4.0,
    HIGH: 10.0,
    SEVERE: 20.0
  }),
  INFEASIBLE_PENALTY: 1000.0        // Heavy penalty ensuring infeasible routes score 0
});

class DeterministicRouteScoringService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.routeEvaluationService]
   * @param {object} [options.rates] - Optional customized penalty rates
   */
  constructor(options = {}) {
    this.routeEvaluationService = options.routeEvaluationService || routeEvaluationService;
    this.rates = options.rates || SCORING_RATES;
  }

  /**
   * Scores a single candidate route evaluation.
   *
   * @param {RouteEvaluation|object} evaluation - RouteEvaluation instance or candidate journey
   * @param {object} [contextOrImpact={}] - Context or UnifiedJourneyImpact if evaluation not yet computed
   * @param {object} [options={}] - Options
   * @returns {object} Scored route result with score, breakdown, explanation, and rank placeholder
   */
  scoreRoute(evaluation, contextOrImpact = {}, options = {}) {
    if (!evaluation) {
      throw new ValidationError('Route evaluation or candidate journey is required for scoring');
    }

    let routeEval = evaluation;
    if (!(evaluation instanceof RouteEvaluation)) {
      routeEval = this.routeEvaluationService.evaluateRoute(evaluation, contextOrImpact, options);
    }

    const rates = this.rates;

    // 1. Scheduled Baseline Travel Time Penalty
    const baselineMinutes = Number(routeEval.baselineTravelTime || 0);
    const travelTimePenalty = Math.round(baselineMinutes * rates.TRAVEL_TIME_PER_MINUTE * 100) / 100;

    // 2. Disruption Delay Penalty
    const disruptionMinutes = Number(routeEval.additionalDisruptionDelay || 0);
    const disruptionPenalty = Math.round(disruptionMinutes * rates.DISRUPTION_PER_MINUTE * 100) / 100;

    // 3. Traffic Congestion Delay Penalty
    const trafficMinutes = Number(routeEval.trafficImpact?.addedTravelTimeMinutes || 0);
    const trafficPenalty = Math.round(trafficMinutes * rates.TRAFFIC_PER_MINUTE * 100) / 100;

    // 4. Waiting Time Penalty
    const waitingMinutes = Number(routeEval.waitingTime || 0);
    const waitingPenalty = Math.round(waitingMinutes * rates.WAITING_PER_MINUTE * 100) / 100;

    // 5. Walking Exertion Penalty (base + excess over 15 min)
    const walkingMinutes = Number(routeEval.walkingTime || 0);
    let walkingPenalty = walkingMinutes * rates.WALKING_PER_MINUTE;
    if (walkingMinutes > 15) {
      walkingPenalty += (walkingMinutes - 15) * rates.EXCESS_WALK_PER_MINUTE;
    }
    walkingPenalty = Math.round(walkingPenalty * 100) / 100;

    // 6. Transfer Friction Penalty
    const transferCount = Number(routeEval.numberOfTransfers || 0);
    const transferPenalty = Math.round(transferCount * rates.PER_TRANSFER * 100) / 100;

    // 7. Monetary Fare Penalty
    const costRupees = Number(routeEval.estimatedCost || 0);
    const costPenalty = Math.round(costRupees * rates.PER_RUPEE_COST * 100) / 100;

    // 8. Uncertainty / Reliability Penalty
    const reliabilityLevel = routeEval.reliability || 'LOW';
    const uncertaintyPenalty = rates.UNCERTAINTY_PENALTIES[reliabilityLevel] !== undefined
      ? rates.UNCERTAINTY_PENALTIES[reliabilityLevel]
      : rates.UNCERTAINTY_PENALTIES.LOW;

    // 9. Affected Segments Risk Penalty
    const affectedCount = Array.isArray(routeEval.affectedSegments) ? routeEval.affectedSegments.length : 0;
    const affectedPenalty = Math.round(affectedCount * rates.PER_AFFECTED_SEGMENT * 100) / 100;

    // 10. Feasibility Check
    const isFeasible = Boolean(routeEval.isFeasible);
    const feasibilityTier = isFeasible ? 1 : 0;
    const infeasiblePenalty = isFeasible ? 0.0 : rates.INFEASIBLE_PENALTY;

    // Aggregate Total Penalties
    const totalPenalties = Math.round((
      travelTimePenalty +
      disruptionPenalty +
      trafficPenalty +
      waitingPenalty +
      walkingPenalty +
      transferPenalty +
      costPenalty +
      uncertaintyPenalty +
      affectedPenalty +
      infeasiblePenalty
    ) * 100) / 100;

    // Final Composite Score calculation (0 to 100 scale)
    // Feasible routes: clamped between 1.0 and 100.0
    // Infeasible routes: strictly 0.0 (infeasible routes NEVER outrank feasible routes)
    let compositeScore = 0.0;
    if (isFeasible) {
      const rawScore = rates.BASE_SCORE - (totalPenalties - infeasiblePenalty);
      compositeScore = Math.max(1.0, Math.min(100.0, Math.round(rawScore * 10) / 10));
    }

    // Explainable Breakdown Structure
    const breakdown = {
      baseScore: rates.BASE_SCORE,
      travelTime: {
        minutes: baselineMinutes,
        ratePerMinute: rates.TRAVEL_TIME_PER_MINUTE,
        pointsDeducted: travelTimePenalty,
        description: `${baselineMinutes} min baseline travel time (-${travelTimePenalty} pts)`
      },
      disruption: {
        delayMinutes: disruptionMinutes,
        ratePerMinute: rates.DISRUPTION_PER_MINUTE,
        pointsDeducted: disruptionPenalty,
        description: disruptionMinutes > 0
          ? `${disruptionMinutes} min unexpected disruption delay (-${disruptionPenalty} pts)`
          : '0 min disruption delay (0 pts)'
      },
      traffic: {
        delayMinutes: trafficMinutes,
        ratePerMinute: rates.TRAFFIC_PER_MINUTE,
        pointsDeducted: trafficPenalty,
        description: trafficMinutes > 0
          ? `${trafficMinutes} min road traffic delay (-${trafficPenalty} pts)`
          : '0 min road traffic delay (0 pts)'
      },
      waiting: {
        minutes: waitingMinutes,
        ratePerMinute: rates.WAITING_PER_MINUTE,
        pointsDeducted: waitingPenalty,
        description: waitingMinutes > 0
          ? `${waitingMinutes} min station waiting time (-${waitingPenalty} pts)`
          : '0 min waiting time (0 pts)'
      },
      walking: {
        minutes: walkingMinutes,
        ratePerMinute: rates.WALKING_PER_MINUTE,
        pointsDeducted: walkingPenalty,
        description: walkingMinutes > 15
          ? `${walkingMinutes} min walking burden with high exertion penalty (-${walkingPenalty} pts)`
          : `${walkingMinutes} min walking burden (-${walkingPenalty} pts)`
      },
      transfers: {
        count: transferCount,
        ratePerTransfer: rates.PER_TRANSFER,
        pointsDeducted: transferPenalty,
        description: transferCount > 0
          ? `${transferCount} modal transfer(s) (-${transferPenalty} pts)`
          : 'Direct route with 0 transfers (0 pts)'
      },
      cost: {
        fareRupees: costRupees,
        ratePerRupee: rates.PER_RUPEE_COST,
        pointsDeducted: costPenalty,
        description: costRupees > 0
          ? `Rs ${costRupees} transit fare (-${costPenalty} pts)`
          : 'Free student walk / zero fare (0 pts)'
      },
      uncertainty: {
        level: reliabilityLevel,
        pointsDeducted: uncertaintyPenalty,
        description: uncertaintyPenalty > 0
          ? `${reliabilityLevel} reliability risk (-${uncertaintyPenalty} pts)`
          : 'LOW uncertainty / high reliability (0 pts)'
      },
      affectedSegments: {
        count: affectedCount,
        pointsDeducted: affectedPenalty,
        description: affectedCount > 0
          ? `${affectedCount} affected segment(s) (-${affectedPenalty} pts)`
          : '0 affected segments (0 pts)'
      },
      feasibility: {
        isFeasible,
        feasibilityReason: routeEval.feasibilityReason,
        pointsDeducted: infeasiblePenalty,
        description: isFeasible
          ? 'Route is operational and viable'
          : `Route is infeasible (${routeEval.feasibilityReason}) — excluded from operational ranking`
      },
      totalPenalties
    };

    // Human-Readable Explanations (Sorted by highest impact)
    const explanations = [];
    if (!isFeasible) {
      explanations.push(`Route infeasible: ${routeEval.feasibilityReason}`);
    }
    if (travelTimePenalty > 0) {
      explanations.push(`Travel time: ${baselineMinutes} min (-${travelTimePenalty} pts)`);
    }
    if (disruptionPenalty > 0) {
      explanations.push(`Disruption delay: +${disruptionMinutes} min (-${disruptionPenalty} pts)`);
    }
    if (trafficPenalty > 0) {
      explanations.push(`Road congestion: +${trafficMinutes} min (-${trafficPenalty} pts)`);
    }
    if (walkingPenalty > 0) {
      explanations.push(`Walking exertion: ${walkingMinutes} min (-${walkingPenalty} pts)`);
    }
    if (transferPenalty > 0) {
      explanations.push(`Transfers: ${transferCount} interchange(s) (-${transferPenalty} pts)`);
    }
    if (waitingPenalty > 0) {
      explanations.push(`Waiting time: ${waitingMinutes} min (-${waitingPenalty} pts)`);
    }
    if (costPenalty > 0) {
      explanations.push(`Fare cost: Rs ${costRupees} (-${costPenalty} pts)`);
    }
    if (uncertaintyPenalty > 0) {
      explanations.push(`Reliability: ${reliabilityLevel} uncertainty (-${uncertaintyPenalty} pts)`);
    }
    if (affectedPenalty > 0) {
      explanations.push(`Risk: ${affectedCount} affected segment(s) (-${affectedPenalty} pts)`);
    }

    return {
      journeyId: routeEval.journeyId,
      origin: routeEval.origin,
      destination: routeEval.destination,
      departureTime: routeEval.departureTime,
      estimatedArrivalTime: routeEval.estimatedArrivalTime,
      updatedArrivalTime: routeEval.updatedArrivalTime,
      totalTravelTime: routeEval.totalTravelTime,
      baselineTravelTime: routeEval.baselineTravelTime,
      isFeasible,
      feasibilityTier,
      feasibilityReason: routeEval.feasibilityReason,
      compositeScore,
      totalPenalties,
      breakdown,
      explanations,
      weaknesses: routeEval.weaknesses || [],
      reasonCodes: routeEval.reasonCodes || [],
      dataTiers: routeEval.dataTiers || [],
      provenance: routeEval.provenance,
      evaluatedAt: routeEval.evaluatedAt,
      rank: 0 // populated during scoreAndRankRoutes
    };
  }

  /**
   * Scores and deterministically ranks an array of candidate routes.
   *
   * Invariant:
   * 1. Infeasible routes (feasibilityTier = 0) NEVER outrank feasible routes (feasibilityTier = 1).
   * 2. Feasible routes are ordered by compositeScore descending (higher score is better).
   * 3. Deterministic tie-breaking on near-tied/tied routes:
   *    - Lower total travel time
   *    - Fewer transfers
   *    - Lower cost
   *    - Alphabetical journeyId
   *
   * @param {Array<RouteEvaluation|object>} evaluations - Route evaluations or candidate journeys
   * @param {object|Array<object>} [contextOrImpacts={}] - Context or unified impacts
   * @param {object} [options={}] - Options
   * @returns {Array<object>} Deterministically scored and ranked routes
   */
  scoreAndRankRoutes(evaluations = [], contextOrImpacts = {}, options = {}) {
    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      return [];
    }

    // 1. Score each route independently
    const scoredRoutes = evaluations.map((item, idx) => {
      const matchingContext = Array.isArray(contextOrImpacts)
        ? contextOrImpacts[idx] || {}
        : contextOrImpacts;
      return this.scoreRoute(item, matchingContext, options);
    });

    // 2. Deterministic sort comparator
    scoredRoutes.sort((a, b) => {
      // Rule 1: Feasible routes ALWAYS outrank infeasible routes
      if (a.feasibilityTier !== b.feasibilityTier) {
        return b.feasibilityTier - a.feasibilityTier; // 1 before 0
      }

      // Rule 2: Higher composite score first
      if (Math.abs(b.compositeScore - a.compositeScore) > 0.001) {
        return b.compositeScore - a.compositeScore;
      }

      // Rule 3: Deterministic tie-breaker 1 - Lower total travel time
      if (a.totalTravelTime !== b.totalTravelTime) {
        return a.totalTravelTime - b.totalTravelTime;
      }

      // Rule 4: Deterministic tie-breaker 2 - Fewer transfers
      const aTransfers = a.breakdown.transfers.count;
      const bTransfers = b.breakdown.transfers.count;
      if (aTransfers !== bTransfers) {
        return aTransfers - bTransfers;
      }

      // Rule 5: Deterministic tie-breaker 3 - Lower cost
      const aCost = a.breakdown.cost.fareRupees;
      const bCost = b.breakdown.cost.fareRupees;
      if (aCost !== bCost) {
        return aCost - bCost;
      }

      // Rule 6: Deterministic tie-breaker 4 - Alphabetical journey ID
      return String(a.journeyId).localeCompare(String(b.journeyId));
    });

    // 3. Assign 1-indexed ranks
    scoredRoutes.forEach((route, index) => {
      route.rank = index + 1;
    });

    return scoredRoutes;
  }
}

const deterministicRouteScoringService = new DeterministicRouteScoringService();

module.exports = {
  DeterministicRouteScoringService,
  deterministicRouteScoringService,
  SCORING_RATES
};
