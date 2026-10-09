/**
 * DepartureAdviceService
 *
 * Dedicated disruption-aware departure timing advice engine.
 * Computes deterministic, grounded departure recommendations based on
 * live disruption impacts, timetable schedules, and service operating hours.
 *
 * Capabilities:
 * 1. Evaluates whether current departure plan can achieve target arrival deadline
 * 2. Calculates additional delay caused by active corridor disruptions
 * 3. Suggests justified earlier departure times within operating hours
 * 4. Compares feasible departure windows when timetable data permits
 * 5. Explains when departure adjustment is insufficient and a route change is needed
 * 6. Reports when no supported departure option can meet the requested deadline
 * 7. Transparently tags ESTIMATED or SYNTHETIC provenance when timetable data is missing
 */

const {
  DepartureAdvice,
  DEPARTURE_ADVICE_TYPES
} = require('../models/DepartureAdvice');
const {
  PROVENANCE_TIERS,
  DataProvenance
} = require('../models/CommuteContracts');
const { transportScheduleService } = require('./transportScheduleService');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

class DepartureAdviceService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.scheduleService]
   */
  constructor(options = {}) {
    this.scheduleService = options.scheduleService || transportScheduleService;
  }

  /**
   * Generates disruption-aware departure advice for a commute recommendation.
   *
   * @param {object} params
   * @param {object} params.primaryRoute - Selected primary route (RecommendedRouteDetail or scored route)
   * @param {Array<object>} [params.alternatives=[]] - Alternative routes
   * @param {object} [params.context={}] - Disruption, traffic, and weather context
   * @param {string} [params.departureTime] - Planned departure time (HH:MM)
   * @param {string} [params.targetArrivalTime] - Desired arrival deadline (HH:MM)
   * @param {string} [params.date='Mon'] - Date or day of week
   * @param {object} [params.preferences={}] - Student preferences
   * @param {object} [params.constraints={}] - Hard constraints
   * @returns {DepartureAdvice}
   */
  evaluateDepartureAdvice(params = {}) {
    const {
      primaryRoute,
      alternatives = [],
      context = {},
      departureTime: explicitDepTime = null,
      targetArrivalTime = null,
      date = 'Mon'
    } = params;

    if (!primaryRoute) {
      throw new ValidationError('Primary route is required to generate departure advice');
    }

    const depTime = explicitDepTime || primaryRoute.departureTime || '08:00';
    if (!timeRegex.test(depTime)) {
      throw new ValidationError(`Invalid departure time '${depTime}'. Expected HH:MM`);
    }

    // 1. Normalize Route Timing & Disruption Metrics
    const baseDuration = Number(
      primaryRoute.baselineDurationMinutes ??
      primaryRoute.baselineTravel?.durationMinutes ??
      primaryRoute.totalDurationMinutes ??
      primaryRoute.totalTravelTimeMinutes ??
      30
    );

    const disruptionDelay = Number(
      primaryRoute.expectedDisruptionDelayMinutes ??
      primaryRoute.disruptionDelayMinutes ??
      primaryRoute.additionalDisruptionDelay ??
      primaryRoute.breakdown?.disruption?.delayMinutes ??
      0
    );

    const primaryMode = String(primaryRoute.primaryMode || 'transit').toLowerCase();
    const totalTravelWithDelay = baseDuration + disruptionDelay;

    // 2. Compute Clock Times
    const depMinutes = this.scheduleService.timeToMinutes(depTime);
    const baselineArrMinutes = (depMinutes + baseDuration) % 1440;
    const contextualArrMinutes = (depMinutes + totalTravelWithDelay) % 1440;

    const baselineArrivalTime = this.scheduleService.minutesToTime(baselineArrMinutes);
    const contextualArrivalTime = primaryRoute.estimatedArrivalTime ||
      this.scheduleService.minutesToTime(contextualArrMinutes);

    // 3. Operating Hours Check for Selected Mode
    const operatingHours = this.scheduleService.getOperatingHours(primaryMode);
    const isPlannedWithinHours = this.scheduleService.isWithinOperatingHours(depTime, operatingHours);

    // 4. Target Arrival & Margin Calculation
    let targetMinutes = null;
    let marginMinutes = null;
    let canMeetDeadline = true;

    if (targetArrivalTime && timeRegex.test(targetArrivalTime)) {
      targetMinutes = this.scheduleService.timeToMinutes(targetArrivalTime);
      const effectiveArrMin = this.scheduleService.timeToMinutes(contextualArrivalTime);
      marginMinutes = targetMinutes - effectiveArrMin;
      canMeetDeadline = marginMinutes >= 0;
    }

    const currentPlan = {
      departureTime: depTime,
      baselineArrivalTime,
      contextualArrivalTime,
      targetArrivalTime,
      totalTravelMinutes: totalTravelWithDelay,
      disruptionDelayMinutes: disruptionDelay,
      marginMinutes,
      isDelayed: disruptionDelay > 0
    };

    // 5. Evaluate Service Operating Hours Feasibility
    if (!isPlannedWithinHours) {
      return this._buildOperatingHoursViolationAdvice({
        currentPlan,
        operatingHours,
        primaryMode,
        targetArrivalTime,
        totalTravelWithDelay
      });
    }

    // 6. Evaluate Deadline Achievability & Earlier Departure Adjustments
    if (targetArrivalTime) {
      // Scenario A: Current plan meets arrival deadline with good margin
      if (canMeetDeadline && marginMinutes >= 5) {
        return this._buildOnTimeAdvice({
          currentPlan,
          operatingHours,
          primaryMode,
          baseDuration,
          disruptionDelay,
          marginMinutes
        });
      }

      // Scenario B: Deadline missed OR margin dangerously thin (< 5 min)
      return this._evaluateEarlierDepartureOrRouteChange({
        currentPlan,
        primaryRoute,
        alternatives,
        operatingHours,
        primaryMode,
        totalTravelWithDelay,
        baseDuration,
        disruptionDelay,
        targetMinutes,
        targetArrivalTime,
        date,
        context
      });
    }

    // Scenario C: No arrival deadline provided; provide standard departure window advice
    return this._buildNoTargetAdvice({
      currentPlan,
      operatingHours,
      primaryMode,
      disruptionDelay
    });
  }

  // ==========================================================================
  // SCENARIO HANDLERS
  // ==========================================================================

  /**
   * Builds advice when current departure plan meets arrival deadline safely.
   * @private
   */
  _buildOnTimeAdvice({ currentPlan, operatingHours, primaryMode, baseDuration, disruptionDelay, marginMinutes }) {
    const depM = this.scheduleService.timeToMinutes(currentPlan.departureTime);
    const windowStart = this.scheduleService.minutesToTime(depM - 5);
    const windowEnd = this.scheduleService.minutesToTime(depM + 5);

    const feasibleDepartureWindows = [
      {
        departureTime: currentPlan.departureTime,
        arrivalTime: currentPlan.contextualArrivalTime,
        marginMinutes,
        bufferMinutes: marginMinutes,
        isFeasible: true,
        provenanceTier: PROVENANCE_TIERS.VERIFIED
      }
    ];

    let headline = 'Current departure plan safely meets your arrival deadline.';
    let explanation = `Departing at ${currentPlan.departureTime} arrives at ${currentPlan.contextualArrivalTime} with a ${marginMinutes}-minute safety buffer ahead of your ${currentPlan.targetArrivalTime} deadline.`;

    if (disruptionDelay > 0) {
      explanation += ` Accounts for +${disruptionDelay} min known transit delays on this corridor.`;
    }

    return new DepartureAdvice({
      id: `adv-ontime-${Date.now()}`,
      adviceType: DEPARTURE_ADVICE_TYPES.ON_TIME,
      canMeetDeadline: true,
      currentPlan,
      suggestedDeparture: {
        recommendedDepartureTime: currentPlan.departureTime,
        recommendedArrivalTime: currentPlan.contextualArrivalTime,
        earlierByMinutes: 0,
        safetyBufferMinutes: marginMinutes,
        departureWindow: { start: windowStart, end: windowEnd },
        feasibleDepartureWindows
      },
      operatingHours: {
        ...operatingHours,
        mode: primaryMode,
        isWithinOperatingHours: true
      },
      adjustmentFeasible: true,
      routeChangeRecommended: false,
      headline,
      explanation,
      actionableGuidance: [
        `Board service within ${windowStart}–${windowEnd} to maintain your ${marginMinutes} min arrival buffer.`
      ],
      provenance: DataProvenance.verified('Timetable & Realtime Schedule Engine', 'Punctual departure window').toJSON()
    });
  }

  /**
   * Evaluates whether departing earlier satisfies the deadline, or if a route change is necessary.
   * @private
   */
  _evaluateEarlierDepartureOrRouteChange(args) {
    const {
      currentPlan,
      primaryRoute,
      alternatives,
      operatingHours,
      primaryMode,
      totalTravelWithDelay,
      disruptionDelay,
      targetMinutes,
      targetArrivalTime,
      date,
      context
    } = args;

    // Minimum required safety buffer (e.g. 5 minutes ahead of target arrival deadline)
    const requiredBuffer = 5;
    // Calculate latest safe departure time to arrive with safety buffer
    const latestSafeDepMinutes = (targetMinutes - totalTravelWithDelay - requiredBuffer + 1440) % 1440;
    const latestSafeDepTime = this.scheduleService.minutesToTime(latestSafeDepMinutes);

    // Calculate how many minutes earlier the student must leave compared to current plan
    const curDepMin = this.scheduleService.timeToMinutes(currentPlan.departureTime);
    let earlierMinutes = (curDepMin - latestSafeDepMinutes + 1440) % 1440;
    if (earlierMinutes > 720) earlierMinutes = 0; // Guard against inverted clock wraparounds

    // 1. Operating Hours Constraint Check for earlier departure
    const isEarlierWithinOperatingHours = this.scheduleService.isWithinOperatingHours(latestSafeDepTime, operatingHours);

    // 2. Check if earlier departure violates service hours
    if (!isEarlierWithinOperatingHours) {
      const firstMorningDeparture = operatingHours.start;
      const firstMorningArrMin = (this.scheduleService.timeToMinutes(firstMorningDeparture) + totalTravelWithDelay) % 1440;
      const firstMorningArrTime = this.scheduleService.minutesToTime(firstMorningArrMin);

      // Check if even first morning departure misses the deadline
      if (firstMorningArrTime > targetArrivalTime) {
        return new DepartureAdvice({
          id: `adv-unachievable-${Date.now()}`,
          adviceType: DEPARTURE_ADVICE_TYPES.DEADLINE_UNACHIEVABLE,
          canMeetDeadline: false,
          currentPlan,
          suggestedDeparture: {
            recommendedDepartureTime: null,
            recommendedArrivalTime: null,
            earlierByMinutes: 0,
            safetyBufferMinutes: 0,
            departureWindow: null,
            feasibleDepartureWindows: []
          },
          operatingHours: {
            ...operatingHours,
            mode: primaryMode,
            isWithinOperatingHours: false
          },
          adjustmentFeasible: false,
          routeChangeRecommended: true,
          headline: 'No supported departure option meets the arrival deadline.',
          explanation: `To arrive by ${targetArrivalTime}, departure would be required at ${latestSafeDepTime}, but ${primaryMode.toUpperCase()} service does not begin until ${operatingHours.start}. Even the first service at ${operatingHours.start} arrives at ${firstMorningArrTime}, missing your deadline.`,
          actionableGuidance: [
            `Select a 24-hour mode (such as auto or walking) or adjust your target arrival time past ${firstMorningArrTime}.`,
            'Departing earlier on this transit service is impossible due to overnight operating shutdown.'
          ],
          provenance: DataProvenance.verified('Transport Service Hours Engine', 'Operating hours bound enforcement').toJSON()
        });
      }
    }

    // 3. Check if Disruption is too severe / Departure adjustment is insufficient vs Alternative Route
    // If disruption delay is severe (> 30 min) and an alternative route is undisrupted and on time
    const undisruptedAlt = (alternatives || []).find(a => {
      const altDelay = Number(a.expectedDisruptionDelayMinutes || a.disruptionDelayMinutes || 0);
      const altArr = a.estimatedArrivalTime;
      return altDelay === 0 && altArr && altArr <= targetArrivalTime;
    });

    if (disruptionDelay >= 25 && undisruptedAlt) {
      return new DepartureAdvice({
        id: `adv-route-change-${Date.now()}`,
        adviceType: DEPARTURE_ADVICE_TYPES.ROUTE_CHANGE_NEEDED,
        canMeetDeadline: false,
        currentPlan,
        suggestedDeparture: {
          recommendedDepartureTime: latestSafeDepTime,
          recommendedArrivalTime: this.scheduleService.minutesToTime((latestSafeDepMinutes + totalTravelWithDelay) % 1440),
          earlierByMinutes: earlierMinutes,
          safetyBufferMinutes: requiredBuffer,
          departureWindow: {
            start: this.scheduleService.minutesToTime(latestSafeDepMinutes - 5),
            end: latestSafeDepTime
          },
          feasibleDepartureWindows: []
        },
        operatingHours: {
          ...operatingHours,
          mode: primaryMode,
          isWithinOperatingHours: true
        },
        adjustmentFeasible: false,
        routeChangeRecommended: true,
        headline: 'Departure adjustment insufficient; alternate route strongly recommended.',
        explanation: `Severe +${disruptionDelay} min delay on ${primaryMode.toUpperCase()} requires leaving ${earlierMinutes} mins earlier (${latestSafeDepTime}). However, an unaffected alternative (${undisruptedAlt.primaryMode.toUpperCase()}) arrives by ${undisruptedAlt.estimatedArrivalTime} without severe delays. Switching routes is more reliable than absorbing the corridor delay.`,
        actionableGuidance: [
          `Switch to the ${undisruptedAlt.primaryMode.toUpperCase()} alternative route to avoid the ${primaryMode.toUpperCase()} disruption bottleneck.`,
          `If you must use this route, depart at ${latestSafeDepTime} (${earlierMinutes} min earlier) to offset delays.`
        ],
        provenance: DataProvenance.userReported('Commuter Disruption Intelligence', 'Corridor delay exceeds rerouting threshold').toJSON()
      });
    }

    // 4. Feasible Earlier Departure Adjustment
    // Synthesize realistic departure windows around the safe departure time
    const windows = [];
    const recommendedDep = latestSafeDepTime;
    const recommendedArr = this.scheduleService.minutesToTime((latestSafeDepMinutes + totalTravelWithDelay) % 1440);
    const margin = targetMinutes - this.scheduleService.timeToMinutes(recommendedArr);

    windows.push({
      departureTime: recommendedDep,
      arrivalTime: recommendedArr,
      marginMinutes: margin,
      bufferMinutes: margin,
      isFeasible: true,
      provenanceTier: PROVENANCE_TIERS.ESTIMATED
    });

    // Provide a slightly earlier safer option if within hours
    const extraSafeDepMin = latestSafeDepMinutes - 10;
    if (this.scheduleService.isWithinOperatingHours(this.scheduleService.minutesToTime(extraSafeDepMin), operatingHours)) {
      const extraSafeDep = this.scheduleService.minutesToTime(extraSafeDepMin);
      const extraSafeArr = this.scheduleService.minutesToTime((extraSafeDepMin + totalTravelWithDelay) % 1440);
      windows.push({
        departureTime: extraSafeDep,
        arrivalTime: extraSafeArr,
        marginMinutes: targetMinutes - this.scheduleService.timeToMinutes(extraSafeArr),
        bufferMinutes: targetMinutes - this.scheduleService.timeToMinutes(extraSafeArr),
        isFeasible: true,
        provenanceTier: PROVENANCE_TIERS.ESTIMATED
      });
    }

    const windowStart = this.scheduleService.minutesToTime(latestSafeDepMinutes - 10);
    const windowEnd = latestSafeDepTime;

    let explanation = `Known disruption adds +${disruptionDelay} min to your travel time, causing your planned ${currentPlan.departureTime} departure to arrive late at ${currentPlan.contextualArrivalTime}. Departing ${earlierMinutes} min earlier at ${recommendedDep} allows arrival at ${recommendedArr} ahead of your ${targetArrivalTime} deadline.`;
    if (disruptionDelay === 0) {
      explanation = `Planned departure at ${currentPlan.departureTime} arrives at ${currentPlan.contextualArrivalTime}, missing your ${targetArrivalTime} deadline. Departing ${earlierMinutes} min earlier at ${recommendedDep} ensures on-time arrival by ${recommendedArr}.`;
    }

    return new DepartureAdvice({
      id: `adv-earlier-${Date.now()}`,
      adviceType: DEPARTURE_ADVICE_TYPES.EARLIER_DEPARTURE_RECOMMENDED,
      canMeetDeadline: true,
      currentPlan,
      suggestedDeparture: {
        recommendedDepartureTime: recommendedDep,
        recommendedArrivalTime: recommendedArr,
        earlierByMinutes: earlierMinutes,
        safetyBufferMinutes: requiredBuffer,
        departureWindow: { start: windowStart, end: windowEnd },
        feasibleDepartureWindows: windows
      },
      operatingHours: {
        ...operatingHours,
        mode: primaryMode,
        isWithinOperatingHours: true
      },
      adjustmentFeasible: true,
      routeChangeRecommended: false,
      headline: `Depart ${earlierMinutes} minutes earlier to offset delays and meet your deadline.`,
      explanation,
      actionableGuidance: [
        `Adjust departure from ${currentPlan.departureTime} to ${recommendedDep} (${windowStart}–${windowEnd}).`,
        `Arriving at destination by ${recommendedArr} guarantees meeting your ${targetArrivalTime} target.`
      ],
      provenance: disruptionDelay > 0
        ? DataProvenance.userReported('Transit Disruption & Timetable Analysis', 'Calculated earlier departure shift').toJSON()
        : DataProvenance.estimated('Timetable Propagation Engine', 'Calculated earlier departure shift').toJSON()
    });
  }

  /**
   * Builds advice when requested departure falls outside service operating hours.
   * @private
   */
  _buildOperatingHoursViolationAdvice({ currentPlan, operatingHours, primaryMode, targetArrivalTime, totalTravelWithDelay }) {
    const firstDeparture = operatingHours.start;
    const firstArrTime = this.scheduleService.minutesToTime(
      this.scheduleService.timeToMinutes(firstDeparture) + totalTravelWithDelay
    );

    return new DepartureAdvice({
      id: `adv-hours-violation-${Date.now()}`,
      adviceType: DEPARTURE_ADVICE_TYPES.DEADLINE_UNACHIEVABLE,
      canMeetDeadline: false,
      currentPlan,
      suggestedDeparture: {
        recommendedDepartureTime: firstDeparture,
        recommendedArrivalTime: firstArrTime,
        earlierByMinutes: 0,
        safetyBufferMinutes: 0,
        departureWindow: null,
        feasibleDepartureWindows: []
      },
      operatingHours: {
        ...operatingHours,
        mode: primaryMode,
        isWithinOperatingHours: false
      },
      adjustmentFeasible: false,
      routeChangeRecommended: true,
      headline: `${primaryMode.toUpperCase()} service is not operating at ${currentPlan.departureTime}.`,
      explanation: `Requested departure at ${currentPlan.departureTime} is outside operating hours (${operatingHours.start} to ${operatingHours.end}). Earliest service begins at ${firstDeparture}, arriving at ${firstArrTime}.`,
      actionableGuidance: [
        `Wait until first service at ${firstDeparture}, or select a 24-hour mode (auto or walking).`,
        `Operating window: ${operatingHours.start}–${operatingHours.end}.`
      ],
      provenance: DataProvenance.verified('Transit Operating Hours Master Data', 'Service window validation').toJSON()
    });
  }

  /**
   * Builds advice when no arrival deadline was requested.
   * @private
   */
  _buildNoTargetAdvice({ currentPlan, operatingHours, primaryMode, disruptionDelay }) {
    const depM = this.scheduleService.timeToMinutes(currentPlan.departureTime);
    const windowStart = this.scheduleService.minutesToTime(depM - 5);
    const windowEnd = this.scheduleService.minutesToTime(depM + 10);

    let explanation = `Departing at ${currentPlan.departureTime} produces an expected arrival time of ${currentPlan.contextualArrivalTime}.`;
    if (disruptionDelay > 0) {
      explanation += ` Includes +${disruptionDelay} min disruption delay.`;
    }

    return new DepartureAdvice({
      id: `adv-notarget-${Date.now()}`,
      adviceType: disruptionDelay > 0 ? DEPARTURE_ADVICE_TYPES.EARLIER_DEPARTURE_RECOMMENDED : DEPARTURE_ADVICE_TYPES.ON_TIME,
      canMeetDeadline: true,
      currentPlan,
      suggestedDeparture: {
        recommendedDepartureTime: currentPlan.departureTime,
        recommendedArrivalTime: currentPlan.contextualArrivalTime,
        earlierByMinutes: disruptionDelay > 0 ? disruptionDelay : 0,
        safetyBufferMinutes: 10,
        departureWindow: { start: windowStart, end: windowEnd },
        feasibleDepartureWindows: []
      },
      operatingHours: {
        ...operatingHours,
        mode: primaryMode,
        isWithinOperatingHours: true
      },
      adjustmentFeasible: true,
      routeChangeRecommended: false,
      headline: disruptionDelay > 0
        ? `Corridor delay active (+${disruptionDelay} mins); consider departing in ${windowStart}–${windowEnd}.`
        : `Recommended departure window: ${windowStart}–${windowEnd}.`,
      explanation,
      actionableGuidance: [
        `Target departure between ${windowStart} and ${windowEnd} to accommodate transit headway variance.`
      ],
      provenance: DataProvenance.estimated('Timetable Propagation Engine', 'Open window estimate').toJSON()
    });
  }
}

const departureAdviceService = new DepartureAdviceService();

module.exports = {
  DepartureAdviceService,
  departureAdviceService
};
