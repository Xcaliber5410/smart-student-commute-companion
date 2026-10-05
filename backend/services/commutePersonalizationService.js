/**
 * CommutePersonalizationService
 *
 * Stage 7 of the Commute Recommendation Pipeline.
 * Selects the optimal primary route, curates distinct alternative route options,
 * calculates departure windows, and determines the overall recommendation status.
 */

const {
  RECOMMENDATION_STATUS,
  DepartureWindow,
  DataProvenance
} = require('../models');

class CommutePersonalizationService {
  /**
   * Personalizes the commute recommendation by ranking scored routes,
   * selecting diverse alternatives, and computing arrival-aligned departure windows.
   *
   * @param {object} params
   * @param {Array<object>} params.scoredRoutes - Viable routes with computed scores
   * @param {string} [params.desiredArrivalTime='09:00'] - Target arrival time (HH:MM)
   * @param {string} [params.preference='balanced'] - Student preference profile
   * @param {object} [params.context={}] - Context metadata
   * @returns {object} Personalization result
   */
  personalize({ scoredRoutes = [], desiredArrivalTime = '09:00', preference = 'balanced', context = {} }) {
    // 1. Edge Case: No viable routes found
    if (!scoredRoutes || scoredRoutes.length === 0) {
      const departureWindows = this.calculateDepartureWindow(null, desiredArrivalTime);
      return {
        status: RECOMMENDATION_STATUS.INFEASIBLE,
        recommendedRoute: null,
        alternatives: [],
        departureWindows
      };
    }

    // 2. Deterministic ranking: compositeScore DESC -> timeScore DESC -> costScore DESC -> id ASC
    const sorted = [...scoredRoutes].sort((a, b) => {
      const scoreDiff = (b.scores.compositeScore || 0) - (a.scores.compositeScore || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const timeDiff = (b.scores.timeScore || 0) - (a.scores.timeScore || 0);
      if (timeDiff !== 0) return timeDiff;

      const costDiff = (b.scores.costScore || 0) - (a.scores.costScore || 0);
      if (costDiff !== 0) return costDiff;

      return String(a.id).localeCompare(String(b.id));
    });

    // 3. Recommended route is the top-ranked viable route
    const recommendedRoute = sorted[0];

    // 4. Select up to 3 distinct alternatives (fastest, cheapest, rain-safe/low-walking)
    const alternatives = this._selectDiverseAlternatives(sorted.slice(1), recommendedRoute);

    // 5. Calculate departure windows working backwards from desiredArrivalTime
    const departureWindows = this.calculateDepartureWindow(recommendedRoute, desiredArrivalTime);

    // 6. Determine recommendation status
    const status = this._determineStatus(recommendedRoute);

    return {
      status,
      recommendedRoute,
      alternatives,
      departureWindows
    };
  }

  /**
   * Calculates departure windows backwards from target arrival time.
   *
   * @param {object|null} route - Primary recommended route
   * @param {string} desiredArrivalTime - 'HH:MM'
   * @returns {DepartureWindow}
   */
  calculateDepartureWindow(route, desiredArrivalTime = '09:00') {
    const durationMinutes = route
      ? (typeof route.getTotalDuration === 'function' ? route.getTotalDuration() : route.estimate.totalDurationMinutes)
      : 40;

    const bufferMinutes = route && route.estimate && typeof route.estimate.getBufferMinutes === 'function'
      ? route.estimate.getBufferMinutes()
      : 10;

    const safeBuffer = Math.max(10, bufferMinutes);

    // Latest safe departure = arrival - duration
    const latestSafeDepartureTime = this._subtractMinutes(desiredArrivalTime, durationMinutes);

    // Optimal departure = latest safe - buffer
    const optimalDepartureTime = this._subtractMinutes(latestSafeDepartureTime, safeBuffer);

    // Recommended window = [optimal - 5 min, optimal + 5 min]
    const recommendedWindowStart = this._subtractMinutes(optimalDepartureTime, 5);
    const recommendedWindowEnd = this._addMinutes(optimalDepartureTime, 5);

    return new DepartureWindow({
      optimalDepartureTime,
      latestSafeDepartureTime,
      recommendedWindowStart,
      recommendedWindowEnd,
      bufferMinutes: safeBuffer,
      provenance: DataProvenance.synthetic('DepartureWindowCalculator').toJSON()
    });
  }

  /**
   * Determines status based on penalties and composite score.
   * @private
   */
  _determineStatus(route) {
    if (!route) return RECOMMENDATION_STATUS.INFEASIBLE;

    const disruptionPenalty = route.scores.disruptionPenalty || 0;
    const compositeScore = route.scores.compositeScore || 0;

    if (disruptionPenalty >= 35) {
      return RECOMMENDATION_STATUS.COMPROMISED;
    }

    if (compositeScore < 50) {
      return RECOMMENDATION_STATUS.SUBOPTIMAL;
    }

    return RECOMMENDATION_STATUS.OPTIMAL;
  }

  /**
   * Curates up to 3 diverse alternative routes.
   * @private
   */
  _selectDiverseAlternatives(candidates, primaryRoute) {
    if (candidates.length === 0) return [];

    const selected = [];
    const usedIds = new Set([primaryRoute.id]);

    // 1. Candidate with lowest duration (Fastest alternative)
    const fastest = [...candidates].sort((a, b) => a.estimate.totalDurationMinutes - b.estimate.totalDurationMinutes)[0];
    if (fastest && !usedIds.has(fastest.id)) {
      if (!fastest.tags.includes('fastest')) fastest.tags.push('fastest');
      selected.push(fastest);
      usedIds.add(fastest.id);
    }

    // 2. Candidate with lowest fare (Cheapest alternative)
    const cheapest = [...candidates].sort((a, b) => a.estimate.totalFareRupees - b.estimate.totalFareRupees)[0];
    if (cheapest && !usedIds.has(cheapest.id)) {
      if (!cheapest.tags.includes('cheapest')) cheapest.tags.push('cheapest');
      selected.push(cheapest);
      usedIds.add(cheapest.id);
    }

    // 3. Next highest scored route not yet included
    for (const route of candidates) {
      if (!usedIds.has(route.id) && selected.length < 3) {
        selected.push(route);
        usedIds.add(route.id);
      }
    }

    return selected;
  }

  /**
   * Helper: subtracts minutes from 'HH:MM'.
   * @private
   */
  _subtractMinutes(hhmm, minutesToSubtract) {
    const [h, m] = (hhmm || '09:00').split(':').map(Number);
    let total = (h * 60 + m) - minutesToSubtract;
    if (total < 0) total = (total % 1440 + 1440) % 1440;

    const newH = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const newM = String(total % 60).padStart(2, '0');
    return `${newH}:${newM}`;
  }

  /**
   * Helper: adds minutes to 'HH:MM'.
   * @private
   */
  _addMinutes(hhmm, minutesToAdd) {
    const [h, m] = (hhmm || '09:00').split(':').map(Number);
    let total = (h * 60 + m) + minutesToAdd;
    total = total % 1440;

    const newH = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const newM = String(total % 60).padStart(2, '0');
    return `${newH}:${newM}`;
  }
}

const commutePersonalizationService = new CommutePersonalizationService();

module.exports = {
  CommutePersonalizationService,
  commutePersonalizationService
};
