/**
 * RouteEvaluationService
 *
 * Service responsible for evaluating candidate commute journeys after Day 16
 * contextual disruption analysis.
 *
 * Capabilities:
 * - Consolidates baseline journey travel metrics and contextual real-time impacts
 * - Computes total travel time, disruption delays, waiting time, walking burden, transfers, and cost
 * - Evaluates route reliability, feasibility, and segment-level status
 * - Detects transparent, explainable route weaknesses
 * - Reuses existing CommuteJourney, CommuteContextEngine, and UnifiedJourneyImpact models
 */

const { RouteEvaluation, ROUTE_WEAKNESS_CODES } = require('../models/RouteEvaluation');
const { commuteContextEngine } = require('./commuteContextEngine');
const { UnifiedJourneyImpact } = require('../models/UnifiedJourneyImpact');
const { ValidationError } = require('../errors');

class RouteEvaluationService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.commuteContextEngine] - Injected CommuteContextEngine instance
   */
  constructor(options = {}) {
    this.commuteContextEngine = options.commuteContextEngine || commuteContextEngine;
  }

  /**
   * Evaluates a single candidate commute journey against its commute context.
   *
   * @param {object} journey - Candidate CommuteJourney instance
   * @param {object} [contextOrImpact={}] - UnifiedJourneyImpact instance or Stage 1/2 Commute Context
   * @param {object} [options={}] - Optional configuration and thresholds
   * @returns {RouteEvaluation}
   */
  evaluateRoute(journey, contextOrImpact = {}, options = {}) {
    if (!journey) {
      throw new ValidationError('Candidate commute journey is required for evaluation');
    }

    let unifiedImpact;
    if (contextOrImpact instanceof UnifiedJourneyImpact) {
      unifiedImpact = contextOrImpact;
    } else if (contextOrImpact && contextOrImpact.updatedDurationMinutes !== undefined && contextOrImpact.affectedSegments !== undefined) {
      unifiedImpact = new UnifiedJourneyImpact(contextOrImpact);
    } else {
      unifiedImpact = this.commuteContextEngine.evaluateJourney(journey, contextOrImpact, options);
    }

    return RouteEvaluation.fromJourneyAndImpact(journey, unifiedImpact, options);
  }

  /**
   * Batch evaluates an array of candidate commute journeys.
   *
   * @param {Array<object>} journeys - Array of CommuteJourney instances
   * @param {object|Array<object>} [contextOrImpacts={}] - Shared context or matching impact array
   * @param {object} [options={}] - Optional configuration
   * @returns {Array<RouteEvaluation>}
   */
  evaluateRoutes(journeys = [], contextOrImpacts = {}, options = {}) {
    if (!Array.isArray(journeys) || journeys.length === 0) {
      return [];
    }

    return journeys.map((journey, idx) => {
      const matchingImpact = Array.isArray(contextOrImpacts)
        ? contextOrImpacts[idx] || {}
        : contextOrImpacts;
      return this.evaluateRoute(journey, matchingImpact, options);
    });
  }
}

const routeEvaluationService = new RouteEvaluationService();

module.exports = {
  RouteEvaluationService,
  routeEvaluationService,
  ROUTE_WEAKNESS_CODES
};
