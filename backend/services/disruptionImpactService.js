/**
 * DisruptionImpactService
 *
 * Stage 3 & scoring auxiliary of the Commute Recommendation Pipeline.
 * Evaluates active disruptions and environmental conditions to calculate
 * delay estimates, route overlap, and impact penalties.
 */

const {
  DISRUPTION_SEVERITIES,
  DataProvenance
} = require('../models');
const { disruptionDataService } = require('./disruptionDataService');

// Baseline delay estimates in minutes by severity level
const SEVERITY_BASE_DELAYS = Object.freeze({
  [DISRUPTION_SEVERITIES.MINOR]: 5,
  [DISRUPTION_SEVERITIES.MODERATE]: 15,
  [DISRUPTION_SEVERITIES.SEVERE]: 30,
  [DISRUPTION_SEVERITIES.CRITICAL]: 60
});

// Scoring penalties (0-100) per disruption encounter
const SEVERITY_PENALTY_POINTS = Object.freeze({
  [DISRUPTION_SEVERITIES.MINOR]: 15,
  [DISRUPTION_SEVERITIES.MODERATE]: 35,
  [DISRUPTION_SEVERITIES.SEVERE]: 65,
  [DISRUPTION_SEVERITIES.CRITICAL]: 95
});

class DisruptionImpactService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.disruptionDataService]
   */
  constructor(options = {}) {
    this.disruptionDataService = options.disruptionDataService || disruptionDataService;
  }

  /**
   * Assesses active corridor disruptions and produces structured disruption impact entries.
   *
   * @param {object} params
   * @param {Array<object>} [params.corridorDisruptions=[]] - Raw or CommuteDisruption instances
   * @param {Array<object>} [params.routes=[]] - Optional candidate routes for correlation
   * @returns {Array<object>} Normalized disruption impact objects matching disruptionImpactSchema
   */
  assessDisruptions({ corridorDisruptions = [], routes = [] } = {}) {
    const impacts = [];

    for (const disruption of corridorDisruptions) {
      const severity = disruption.severity || DISRUPTION_SEVERITIES.MINOR;
      const baseDelay = SEVERITY_BASE_DELAYS[severity] || 5;

      // Adjust delay by confidence factor if present
      let delayMinutes = baseDelay;
      if (disruption.confidence === 'LOW') {
        delayMinutes = Math.max(3, Math.round(baseDelay * 0.7));
      } else if (disruption.confidence === 'HIGH') {
        delayMinutes = Math.round(baseDelay * 1.2);
      }

      const provenance = disruption.provenance instanceof DataProvenance
        ? disruption.provenance.toJSON()
        : (disruption.provenance || DataProvenance.estimated('DisruptionImpactService').toJSON());

      impacts.push({
        disruptionId: disruption.id || disruption.disruption_id || `disp-${Date.now()}`,
        disruptionType: disruption.disruptionType || disruption.disruption_type || 'delay',
        affectedMode: disruption.transportMode || disruption.transport_mode || 'train',
        affectedLine: disruption.affectedLineOrRoute || disruption.affected_line_or_route || '',
        severity,
        delayMinutes,
        description: disruption.description || disruption.title || 'Reported transit disruption',
        provenance
      });
    }

    return impacts;
  }

  /**
   * Computes disruption penalty (0-100) for a specific candidate route.
   *
   * @param {object} route - CommuteRoute instance
   * @param {Array<object>} disruptionsConsidered - Normalized disruption impacts
   * @returns {number} Penalty value between 0 and 100
   */
  calculateRouteDisruptionPenalty(route, disruptionsConsidered = []) {
    if (!disruptionsConsidered || disruptionsConsidered.length === 0) {
      return 0;
    }

    let penalty = 0;
    const legs = route.legs || [];

    for (const impact of disruptionsConsidered) {
      // Check if any route leg matches the affected mode and line
      const affectsRoute = legs.some(leg => {
        // Mode match
        if (leg.mode !== impact.affectedMode) {
          return false;
        }

        // If line is specified, check line name or short name match
        if (impact.affectedLine && leg.lineInfo) {
          const affectedUpper = impact.affectedLine.toUpperCase();
          const lineUpper = (leg.lineInfo.lineName || '').toUpperCase();
          const routeUpper = (leg.lineInfo.routeShortName || '').toUpperCase();
          return lineUpper.includes(affectedUpper) || routeUpper.includes(affectedUpper) || affectedUpper.includes(lineUpper);
        }

        return true;
      });

      if (affectsRoute) {
        const points = SEVERITY_PENALTY_POINTS[impact.severity] || 15;
        penalty += points;
      }
    }

    return Math.min(100, penalty);
  }

  /**
   * Computes weather penalty (0-100) for a candidate route based on walking exposure.
   *
   * @param {object} route - CommuteRoute instance
   * @param {object} weatherContext - { rainProbability, condition }
   * @returns {number} Penalty value between 0 and 100
   */
  calculateRouteWeatherPenalty(route, weatherContext = {}) {
    const rainProb = Number(weatherContext.rainProbability) || 0;
    if (rainProb < 20) {
      return 0;
    }

    // Walking exposure in minutes
    const walkingMinutes = typeof route.getWalkingMinutes === 'function'
      ? route.getWalkingMinutes()
      : (route.estimate ? route.estimate.walkingDurationMinutes : 0);

    // Weather penalty scales with rain probability and walking duration
    // 20+ mins walk under 80% rain yields high penalty
    const walkRatio = Math.min(1.5, walkingMinutes / 15);
    const rainFactor = rainProb / 100;
    const rawPenalty = walkRatio * rainFactor * 70;

    return Math.min(100, Math.round(rawPenalty));
  }
}

const disruptionImpactService = new DisruptionImpactService();

module.exports = {
  DisruptionImpactService,
  disruptionImpactService,
  SEVERITY_BASE_DELAYS,
  SEVERITY_PENALTY_POINTS
};
