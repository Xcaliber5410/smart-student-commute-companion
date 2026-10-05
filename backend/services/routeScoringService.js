/**
 * RouteScoringService
 *
 * Stage 6 of the Commute Recommendation Pipeline.
 * Clean interface and foundational scoring calculation for candidate routes.
 *
 * Provides a modular, multi-criteria scoring boundary:
 * - Sub-scores: time, cost, walking exertion, reliability
 * - Penalties: real-time disruptions and adverse weather exposure
 * - Weighted composite score tailored to student preferences (balanced, fastest, cheapest, rain-safe)
 *
 * Note: Serves as the architectural foundation for later implementation
 * of the final complete scoring algorithm.
 */

const { ROUTE_PREFERENCES } = require('../models');
const { disruptionImpactService } = require('./disruptionImpactService');

// Default scoring weights by preference profile (positive weights sum to 1.0)
const PREFERENCE_WEIGHTS = Object.freeze({
  [ROUTE_PREFERENCES.BALANCED]: {
    time: 0.40,
    reliability: 0.30,
    walking: 0.20,
    cost: 0.10,
    disruptionPenaltyFactor: 0.35,
    weatherPenaltyFactor: 0.25
  },
  [ROUTE_PREFERENCES.FASTEST]: {
    time: 0.60,
    reliability: 0.25,
    walking: 0.10,
    cost: 0.05,
    disruptionPenaltyFactor: 0.45,
    weatherPenaltyFactor: 0.15
  },
  [ROUTE_PREFERENCES.CHEAPEST]: {
    cost: 0.50,
    time: 0.25,
    reliability: 0.15,
    walking: 0.10,
    disruptionPenaltyFactor: 0.25,
    weatherPenaltyFactor: 0.15
  },
  [ROUTE_PREFERENCES.RAIN_SAFE]: {
    walking: 0.35,
    reliability: 0.30,
    time: 0.25,
    cost: 0.10,
    disruptionPenaltyFactor: 0.30,
    weatherPenaltyFactor: 0.50
  }
});

class RouteScoringService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.disruptionImpactService]
   * @param {object} [options.weights] - Optional custom weight configuration
   */
  constructor(options = {}) {
    this.disruptionImpactService = options.disruptionImpactService || disruptionImpactService;
    this.weights = options.weights || PREFERENCE_WEIGHTS;
  }

  /**
   * Evaluates and scores an array of viable candidate routes.
   *
   * @param {object} params
   * @param {Array<object>} params.routes - Viable CommuteRoute instances
   * @param {object} [params.constraints] - Student constraints with preference setting
   * @param {Array<object>} [params.disruptions=[]] - Evaluated disruption impacts
   * @param {object} [params.weatherContext={}] - Environmental weather context
   * @returns {Array<object>} Scored CommuteRoute instances with updated .scores
   */
  scoreRoutes({ routes = [], constraints = {}, disruptions = [], weatherContext = {} }) {
    if (!routes || routes.length === 0) {
      return [];
    }

    const preference = (constraints && constraints.preference) || ROUTE_PREFERENCES.BALANCED;
    const weightProfile = this.weights[preference] || this.weights[ROUTE_PREFERENCES.BALANCED];

    return routes.map(route => {
      const scores = this.calculateRouteScores(route, {
        weightProfile,
        disruptions,
        weatherContext
      });

      // Update route scores
      route.scores = scores;
      return route;
    });
  }

  /**
   * Calculates individual sub-scores and composite score for a single route.
   *
   * @param {object} route
   * @param {object} context
   * @returns {object} Scores object matching routeScoresSchema
   */
  calculateRouteScores(route, context = {}) {
    const { weightProfile, disruptions = [], weatherContext = {} } = context;

    // 1. Time score: 0 to 100 (faster = higher score, baseline 30 min = 80 pts)
    const durationMin = typeof route.getTotalDuration === 'function'
      ? route.getTotalDuration()
      : (route.estimate ? route.estimate.totalDurationMinutes : 45);
    const timeScore = Math.max(10, Math.min(100, Math.round(100 - (durationMin * 1.1))));

    // 2. Cost score: 0 to 100 (lower fare = higher score, 10 Rs = 95 pts, 100 Rs = 30 pts)
    const fareRupees = typeof route.getTotalFare === 'function'
      ? route.getTotalFare()
      : (route.estimate ? route.estimate.totalFareRupees : 20);
    const costScore = Math.max(10, Math.min(100, Math.round(100 - (fareRupees * 0.7))));

    // 3. Walking score: 0 to 100 (less walking exertion = higher score)
    const walkMin = typeof route.getWalkingMinutes === 'function'
      ? route.getWalkingMinutes()
      : (route.estimate ? route.estimate.walkingDurationMinutes : 15);
    const walkingScore = Math.max(10, Math.min(100, Math.round(100 - (walkMin * 2.5))));

    // 4. Reliability score: Mode inherent reliability (rail/metro > road buses)
    let reliabilityScore = 75;
    if (route.primaryMode === 'metro') reliabilityScore = 95;
    else if (route.primaryMode === 'train') reliabilityScore = 85;
    else if (route.primaryMode === 'bus') reliabilityScore = 65;
    else if (route.primaryMode === 'auto') reliabilityScore = 70;

    // 5. Disruption penalty (0 - 100)
    const disruptionPenalty = this.disruptionImpactService.calculateRouteDisruptionPenalty(
      route,
      disruptions
    );

    // 6. Weather penalty (0 - 100)
    const weatherPenalty = this.disruptionImpactService.calculateRouteWeatherPenalty(
      route,
      weatherContext
    );

    // 7. Deterministic composite score (0 - 100)
    const compositeBeforePenalties =
      (timeScore * (weightProfile.time || 0)) +
      (costScore * (weightProfile.cost || 0)) +
      (walkingScore * (weightProfile.walking || 0)) +
      (reliabilityScore * (weightProfile.reliability || 0));

    const totalPenalties =
      (disruptionPenalty * (weightProfile.disruptionPenaltyFactor || 0.35)) +
      (weatherPenalty * (weightProfile.weatherPenaltyFactor || 0.25));

    const compositeScore = Math.max(1, Math.min(100, Math.round(compositeBeforePenalties - totalPenalties)));

    return {
      compositeScore,
      timeScore,
      costScore,
      walkingScore,
      reliabilityScore,
      disruptionPenalty,
      weatherPenalty
    };
  }
}

const routeScoringService = new RouteScoringService();

module.exports = {
  RouteScoringService,
  routeScoringService,
  PREFERENCE_WEIGHTS
};
