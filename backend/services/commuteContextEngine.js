/**
 * CommuteContextEngine
 *
 * Unified Commute Context Engine for the Smart Student Commute Companion (P9).
 * Combines environmental conditions and transport service information into a normalized
 * journey impact summary without duplicating underlying calculations.
 *
 * Architecture:
 *   Candidate Journey
 *          ↓
 *   Disruptions (disruptionImpactService)
 *          +
 *   Traffic (trafficService)
 *          +
 *   Weather (weatherContextService)
 *          +
 *   Transport Availability (transportAvailabilityService)
 *          ↓
 *   Unified Journey Impact (UnifiedJourneyImpact)
 *
 * Guarantees:
 * - 100% deterministic
 * - No AI/LLM guesswork
 * - Does not select or rank the best route
 * - Clean orchestration of existing context services
 * - Complete 4-tier data provenance aggregation
 */

const {
  PROVENANCE_TIERS,
  DataProvenance
} = require('../models/CommuteContracts');
const {
  UnifiedJourneyImpact,
  UNIFIED_REASON_CODES,
  UNIFIED_FEASIBILITY_STATUSES
} = require('../models/UnifiedJourneyImpact');
const { disruptionImpactService } = require('./disruptionImpactService');
const { trafficService } = require('./trafficService');
const { weatherContextService } = require('./weatherContextService');
const { transportAvailabilityService } = require('./transportAvailabilityService');
const { ValidationError } = require('../errors');

/**
 * Adds minutes to an HH:MM time string with 24-hour clock wrapping.
 * @param {string} timeStr - 'HH:MM'
 * @param {number} minutesToAdd
 * @returns {string} - 'HH:MM'
 */
function addMinutesToHHMM(timeStr, minutesToAdd) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return '08:00';
  }
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + Math.round(minutesToAdd)) % 1440;
  const wrapped = total < 0 ? total + 1440 : total;
  const newH = Math.floor(wrapped / 60).toString().padStart(2, '0');
  const newM = (wrapped % 60).toString().padStart(2, '0');
  return `${newH}:${newM}`;
}

/**
 * Creates a DataProvenance instance for a specific tier.
 * @param {string} tier
 * @param {string} provider
 * @param {string} description
 * @returns {DataProvenance}
 */
function createCompositeProvenance(tier, provider, description) {
  switch (tier) {
    case PROVENANCE_TIERS.VERIFIED:
      return DataProvenance.verified(provider, description);
    case PROVENANCE_TIERS.USER_REPORTED:
      return DataProvenance.userReported(provider, description);
    case PROVENANCE_TIERS.ESTIMATED:
      return DataProvenance.estimated(provider, description);
    case PROVENANCE_TIERS.SYNTHETIC:
      return DataProvenance.synthetic(provider, description);
    default:
      return DataProvenance.estimated(provider, description);
  }
}

class CommuteContextEngine {
  /**
   * @param {object} [options={}]
   * @param {object} [options.disruptionImpactService]
   * @param {object} [options.trafficService]
   * @param {object} [options.weatherContextService]
   * @param {object} [options.transportAvailabilityService]
   */
  constructor(options = {}) {
    this.disruptionImpactService = options.disruptionImpactService || disruptionImpactService;
    this.trafficService = options.trafficService || trafficService;
    this.weatherContextService = options.weatherContextService || weatherContextService;
    this.transportAvailabilityService = options.transportAvailabilityService || transportAvailabilityService;
  }

  /**
   * Evaluates the unified context impact on an individual candidate journey.
   *
   * Orchestrates:
   * 1. Disruption Impact Analysis
   * 2. Road Traffic Conditions Impact
   * 3. Environmental Weather Context Impact
   * 4. Transport Availability & Service-Status Impact
   *
   * @param {object} journey - CommuteJourney or trip candidate with segments array
   * @param {object} [context={}] - Context containing disruptions, traffic, weather, availability
   * @param {object} [options={}] - Options (e.g. currentTime)
   * @returns {UnifiedJourneyImpact}
   */
  evaluateJourney(journey, context = {}, options = {}) {
    if (!journey) {
      throw new ValidationError('Candidate journey is required for unified context evaluation');
    }

    const segments = journey.segments || journey.legs || [];
    const originalDuration = Number(journey.totalDurationMinutes || journey.durationMinutes || 0);
    const evaluatedAt = options.currentTime || context.currentTime || Date.now();
    const evalOptions = { ...options, currentTime: evaluatedAt };

    // 1. Resolve Disruption Impact via disruptionImpactService
    const disruptions = context.disruptions || options.disruptions || null;
    const disruptionImpact = this.disruptionImpactService.evaluateJourneyImpact(
      journey,
      disruptions,
      evalOptions
    );

    // 2. Resolve Traffic Impact via trafficService
    const trafficConditions = context.trafficConditions ||
      options.trafficConditions ||
      (context.trafficContext?.conditions) ||
      null;
    const trafficImpact = this.trafficService.evaluateJourneyTrafficImpact(
      journey,
      trafficConditions,
      evalOptions
    );

    // 3. Resolve Weather Impact via weatherContextService
    const weatherCtx = context.weatherContext ||
      options.weatherContext ||
      context.weatherCondition ||
      options.weatherCondition ||
      null;
    const weatherImpact = this.weatherContextService.evaluateJourneyWeatherImpact(
      journey,
      weatherCtx,
      evalOptions
    );

    // 4. Resolve Transport Availability Impact via transportAvailabilityService
    const availabilityRecords = context.availabilityRecords ||
      options.availabilityRecords ||
      (context.availabilityContext?.records) ||
      null;
    const availabilityImpact = this.transportAvailabilityService.evaluateJourneyAvailability(
      journey,
      availabilityRecords,
      evalOptions
    );

    // 5. Aggregate Delays Deterministically
    const disruptionDelay = disruptionImpact.totalDelayMinutes || 0;
    const trafficDelay = trafficImpact.addedTravelTimeMinutes || 0;
    const weatherDelay = weatherImpact.totalAddedTravelTimeMinutes || 0;
    const availabilityDelay = availabilityImpact.totalDelayMinutes || 0;

    const totalAdditionalDelayMinutes = Math.round(
      disruptionDelay + trafficDelay + weatherDelay + availabilityDelay
    );
    const updatedDurationMinutes = originalDuration + totalAdditionalDelayMinutes;

    // 6. Evaluate Segment-by-Segment Impacts & Usability
    const affectedSegments = [];
    const unavailableSegments = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segIndex = seg.segmentIndex !== undefined ? seg.segmentIndex : i;

      // Disruption segment details
      const disSeg = disruptionImpact.segmentImpacts?.find(s => s.segmentIndex === segIndex) || null;
      const isDisAffected = Boolean(disSeg && disSeg.isAffected);
      const disSegDelay = disSeg ? (disSeg.addedTravelTimeMinutes + disSeg.addedWaitingTimeMinutes) : 0;
      const disInfeasible = Boolean(disSeg && disSeg.makesSegmentInfeasible);

      // Traffic segment details
      const trafSeg = trafficImpact.segmentImpacts?.find(s => s.segmentIndex === segIndex) || null;
      const isTrafAffected = Boolean(trafSeg && trafSeg.isAffected);
      const trafSegDelay = trafSeg ? trafSeg.addedDelayMinutes : 0;

      // Weather segment details
      const isRoadWeather = weatherImpact.roadDelay?.affectedRoadSegmentIndices?.includes(segIndex) || false;
      const isOutdoorWalk = weatherImpact.affectedOutdoorSegments?.some(s => s.segmentIndex === segIndex) || false;
      const roadCount = Math.max(1, weatherImpact.roadDelay?.affectedRoadSegmentsCount || 1);
      const weatherRoadDelay = isRoadWeather ? Math.round(weatherImpact.roadDelay.estimatedDelayMinutes / roadCount) : 0;
      const weatherSegDelay = weatherRoadDelay;
      const isWeatherActive = Boolean(weatherImpact.weatherCondition && weatherImpact.weatherCondition !== 'clear');
      const isWeatherAffected = isWeatherActive && (isRoadWeather || (isOutdoorWalk && weatherImpact.walkingInconvenience?.level !== 'NONE'));

      // Availability segment details
      const availSeg = availabilityImpact.segmentImpacts?.find(s => s.segmentIndex === segIndex) || null;
      const isAvailAffected = Boolean(availSeg && (availSeg.status !== 'AVAILABLE' || availSeg.totalDelayMinutes > 0));
      const availSegDelay = availSeg ? availSeg.totalDelayMinutes : 0;
      const isAvailUsable = availSeg ? availSeg.isUsable : true;

      // Segment overall usability
      const segIsUsable = !disInfeasible && isAvailUsable;
      const segIsAffected = isDisAffected || isTrafAffected || isWeatherAffected || isAvailAffected;
      const segTotalDelay = Math.round(disSegDelay + trafSegDelay + weatherSegDelay + availSegDelay);

      // Segment reason notes
      const segReasons = [];
      if (isDisAffected && disSeg?.description) segReasons.push(disSeg.description);
      if (isTrafAffected) segReasons.push(`Road traffic (${trafSeg?.trafficLevel || 'congestion'})`);
      if (isRoadWeather) segReasons.push(`Weather road slowdown (${weatherRoadDelay}m)`);
      if (isOutdoorWalk && weatherImpact.walkingInconvenience?.level !== 'NONE') {
        segReasons.push(`Outdoor walking in ${weatherImpact.weatherCondition}`);
      }
      if (isAvailAffected && availSeg?.reason) segReasons.push(availSeg.reason);

      const segmentImpact = {
        segmentIndex: segIndex,
        mode: seg.mode || 'walk',
        from: seg.from || '',
        to: seg.to || '',
        isAffected: segIsAffected,
        isUsable: segIsUsable,
        delayMinutes: segTotalDelay,
        reasons: segReasons,
        impacts: {
          disruption: isDisAffected ? {
            isAffected: disSeg.isAffected,
            delayMinutes: disSegDelay,
            makesSegmentInfeasible: disSeg.makesSegmentInfeasible,
            severity: disSeg.severity
          } : null,
          traffic: isTrafAffected ? {
            isAffected: trafSeg.isAffected,
            trafficLevel: trafSeg.trafficLevel,
            delayMinutes: trafSegDelay
          } : null,
          weather: isWeatherAffected ? {
            isRoadWeather,
            isOutdoorWalk,
            delayMinutes: weatherSegDelay
          } : null,
          availability: isAvailAffected ? {
            status: availSeg.status,
            isUsable: availSeg.isUsable,
            delayMinutes: availSegDelay,
            uncertaintyLevel: availSeg.uncertaintyLevel
          } : null
        }
      };

      if (segIsAffected || !segIsUsable) {
        affectedSegments.push(segmentImpact);
      }

      if (!segIsUsable) {
        unavailableSegments.push({
          segmentIndex: segIndex,
          mode: seg.mode || 'walk',
          from: seg.from || '',
          to: seg.to || '',
          status: !isAvailUsable ? (availSeg?.status || 'UNAVAILABLE') : 'DISRUPTED',
          reason: (!isAvailUsable ? availSeg?.reason : disSeg?.description) || 'Segment is unavailable or disrupted',
          source: !isAvailUsable ? 'transport_availability' : 'disruption'
        });
      }
    }

    // 7. Determine Overall Journey Feasibility
    const dominantAvailabilityStatus = availabilityImpact.status ||
      availabilityImpact.dominantStatus ||
      'AVAILABLE';

    const isFeasible = disruptionImpact.isFeasible !== false &&
      !trafficImpact.isImpractical &&
      !weatherImpact.isImpractical &&
      availabilityImpact.isUsable !== false &&
      unavailableSegments.length === 0;

    let feasibilityReason = UNIFIED_FEASIBILITY_STATUSES.OPERATIONAL;
    if (!isFeasible) {
      if (availabilityImpact.isUsable === false) {
        feasibilityReason = dominantAvailabilityStatus === 'SUSPENDED'
          ? UNIFIED_FEASIBILITY_STATUSES.SERVICE_SUSPENDED
          : UNIFIED_FEASIBILITY_STATUSES.SERVICE_UNAVAILABLE;
      } else if (disruptionImpact.isFeasible === false) {
        feasibilityReason = disruptionImpact.feasibilityReason || UNIFIED_FEASIBILITY_STATUSES.CRITICAL_DISRUPTION;
      } else if (trafficImpact.isImpractical) {
        feasibilityReason = UNIFIED_FEASIBILITY_STATUSES.SEVERE_TRAFFIC;
      } else if (weatherImpact.isImpractical) {
        feasibilityReason = UNIFIED_FEASIBILITY_STATUSES.WEATHER_IMPASSABLE;
      } else {
        feasibilityReason = UNIFIED_FEASIBILITY_STATUSES.JOURNEY_INFEASIBLE;
      }
    }

    // 8. Determine Reliability Indicator / Uncertainty Level
    const uncertaintyRanks = { LOW: 0, MODERATE: 1, HIGH: 2, SEVERE: 3 };
    let maxRank = 0;

    if (!isFeasible) {
      maxRank = 3;
    } else {
      // Availability uncertainty
      if (availabilityImpact.uncertaintyLevel && uncertaintyRanks[availabilityImpact.uncertaintyLevel] !== undefined) {
        maxRank = Math.max(maxRank, uncertaintyRanks[availabilityImpact.uncertaintyLevel]);
      }
      // Weather uncertainty
      const weatherUncertainty = weatherImpact.travelUncertainty?.level;
      if (weatherUncertainty && uncertaintyRanks[weatherUncertainty] !== undefined) {
        maxRank = Math.max(maxRank, uncertaintyRanks[weatherUncertainty]);
      }
      // Traffic level
      if (trafficImpact.trafficLevel === 'severe') maxRank = Math.max(maxRank, 3);
      else if (trafficImpact.trafficLevel === 'heavy') maxRank = Math.max(maxRank, 2);
      else if (trafficImpact.trafficLevel === 'moderate') maxRank = Math.max(maxRank, 1);

      // Disruption severity
      const disSeverity = disruptionImpact.segmentImpacts?.[0]?.severity;
      if (disSeverity === 'critical' || disSeverity === 'severe') maxRank = Math.max(maxRank, 3);
      else if (disSeverity === 'moderate') maxRank = Math.max(maxRank, 1);
    }

    const rankLevels = ['LOW', 'MODERATE', 'HIGH', 'SEVERE'];
    const reliabilityIndicator = rankLevels[maxRank];

    // 9. Collect Unique Provenance Tiers
    const allTiers = new Set([
      ...(disruptionImpact.dataTiers || []),
      ...(trafficImpact.dataTiers || []),
      ...(weatherImpact.dataTiers || []),
      ...(availabilityImpact.dataTiers || [])
    ]);
    const dataTiers = Array.from(allTiers).filter(Boolean);
    if (dataTiers.length === 0) {
      dataTiers.push(PROVENANCE_TIERS.ESTIMATED);
    }

    // 10. Generate Reason Codes
    const reasonCodes = [];
    const activeImpactSources = [];

    if (disruptionImpact.isAffected || disruptionDelay > 0) {
      reasonCodes.push(UNIFIED_REASON_CODES.DISRUPTION_DELAY);
      activeImpactSources.push('disruption');
    }

    if (trafficDelay > 0 || (trafficImpact.trafficLevel && trafficImpact.trafficLevel !== 'normal')) {
      if (trafficImpact.trafficLevel === 'severe' || trafficImpact.isImpractical) {
        reasonCodes.push(UNIFIED_REASON_CODES.SEVERE_TRAFFIC);
      } else {
        reasonCodes.push(UNIFIED_REASON_CODES.ROAD_TRAFFIC_CONGESTION);
      }
      activeImpactSources.push('traffic');
    }

    if (weatherImpact.isAffected || weatherDelay > 0 || (weatherImpact.weatherCondition && weatherImpact.weatherCondition !== 'clear')) {
      if (weatherImpact.isImpractical) {
        reasonCodes.push(UNIFIED_REASON_CODES.WEATHER_IMPASSABLE);
      } else {
        reasonCodes.push(UNIFIED_REASON_CODES.WEATHER_IMPACT);
      }
      activeImpactSources.push('weather');
    }

    if (dominantAvailabilityStatus !== 'AVAILABLE' || availabilityDelay > 0) {
      if (dominantAvailabilityStatus === 'SUSPENDED') {
        reasonCodes.push(UNIFIED_REASON_CODES.SERVICE_SUSPENDED);
      } else if (dominantAvailabilityStatus === 'UNAVAILABLE') {
        reasonCodes.push(UNIFIED_REASON_CODES.SERVICE_UNAVAILABLE);
      } else {
        reasonCodes.push(UNIFIED_REASON_CODES.TRANSIT_SERVICE_DEGRADED);
      }
      activeImpactSources.push('availability');
    }

    if (!isFeasible) {
      if (!reasonCodes.includes(UNIFIED_REASON_CODES.JOURNEY_INFEASIBLE)) {
        reasonCodes.push(UNIFIED_REASON_CODES.JOURNEY_INFEASIBLE);
      }
    }

    if (activeImpactSources.length >= 2) {
      reasonCodes.push(UNIFIED_REASON_CODES.MULTIPLE_SIMULTANEOUS_IMPACTS);
    }

    if (dataTiers.length > 1) {
      reasonCodes.push(UNIFIED_REASON_CODES.MIXED_PROVENANCE);
    }

    const isCleanJourney = activeImpactSources.length === 0 &&
      isFeasible &&
      totalAdditionalDelayMinutes === 0 &&
      affectedSegments.length === 0 &&
      unavailableSegments.length === 0;

    if (isCleanJourney) {
      reasonCodes.unshift(UNIFIED_REASON_CODES.CLEAN_JOURNEY);
    }

    // 11. Deduplicate Advisories
    const rawAdvisories = [
      ...(disruptionImpact.advisories || []),
      ...(trafficImpact.advisories || []),
      ...(weatherImpact.advisories || []),
      ...(availabilityImpact.advisories || [])
    ];
    const advisories = Array.from(new Set(rawAdvisories)).filter(Boolean);
    if (advisories.length === 0) {
      advisories.push('Normal commute conditions — no active disruptions, road traffic, or adverse weather.');
    }

    // 12. Build Composite Provenance
    let compositeTier = PROVENANCE_TIERS.ESTIMATED;
    if (dataTiers.length === 1) {
      compositeTier = dataTiers[0];
    } else if (dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED)) {
      compositeTier = PROVENANCE_TIERS.USER_REPORTED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.VERIFIED)) {
      compositeTier = PROVENANCE_TIERS.VERIFIED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.ESTIMATED)) {
      compositeTier = PROVENANCE_TIERS.ESTIMATED;
    } else {
      compositeTier = PROVENANCE_TIERS.SYNTHETIC;
    }

    const provenance = createCompositeProvenance(
      compositeTier,
      'Commute Context Engine',
      `Unified context aggregated from ${dataTiers.join(', ')} sources`
    );

    // 13. Construct Unified Output
    return new UnifiedJourneyImpact({
      journeyId: journey.id || 'journey-candidate',
      isFeasible,
      feasibilityReason,
      reasonCodes,
      totalAdditionalDelayMinutes,
      totalEstimatedAdditionalDelayMinutes: totalAdditionalDelayMinutes,
      originalDurationMinutes: originalDuration,
      updatedDurationMinutes,
      affectedSegments,
      unavailableSegments,
      disruptionImpact: {
        isAffected: disruptionImpact.isAffected,
        isFeasible: disruptionImpact.isFeasible,
        totalDelayMinutes: disruptionDelay,
        feasibilityReason: disruptionImpact.feasibilityReason,
        advisories: disruptionImpact.advisories || [],
        dataTiers: disruptionImpact.dataTiers || []
      },
      trafficImpact: {
        level: trafficImpact.trafficLevel || 'normal',
        addedTravelTimeMinutes: trafficDelay,
        isImpractical: trafficImpact.isImpractical || false,
        advisories: trafficImpact.advisories || [],
        dataTiers: trafficImpact.dataTiers || []
      },
      weatherImpact: {
        condition: weatherImpact.weatherCondition || 'clear',
        totalAddedTravelTimeMinutes: weatherDelay,
        walkingInconvenience: weatherImpact.walkingInconvenience || null,
        roadDelay: weatherImpact.roadDelay || null,
        travelUncertainty: weatherImpact.travelUncertainty || null,
        affectedOutdoorSegments: weatherImpact.affectedOutdoorSegments || [],
        shelteredSegments: weatherImpact.shelteredSegments || [],
        isImpractical: weatherImpact.isImpractical || false,
        advisories: weatherImpact.advisories || [],
        dataTiers: weatherImpact.dataTiers || []
      },
      transportStatus: {
        dominantStatus: dominantAvailabilityStatus,
        status: dominantAvailabilityStatus,
        isUsable: availabilityImpact.isUsable !== false,
        totalDelayMinutes: availabilityDelay,
        uncertaintyLevel: availabilityImpact.uncertaintyLevel || 'LOW',
        advisories: availabilityImpact.advisories || [],
        dataTiers: availabilityImpact.dataTiers || []
      },
      dominantTransportStatus: dominantAvailabilityStatus,
      reliabilityIndicator,
      uncertaintyLevel: reliabilityIndicator,
      advisories,
      dataTiers,
      provenance: provenance.toJSON(),
      evaluatedAt
    });
  }

  /**
   * Batch evaluates multiple candidate journeys against the unified context.
   *
   * @param {Array<object>} journeys
   * @param {object} [context={}]
   * @param {object} [options={}]
   * @returns {UnifiedJourneyImpact[]}
   */
  evaluateCandidateJourneys(journeys, context = {}, options = {}) {
    if (!Array.isArray(journeys)) {
      return [];
    }
    return journeys.map(journey => this.evaluateJourney(journey, context, options));
  }

  /**
   * Decorates a candidate journey with the unified impact evaluation, updating its duration
   * and arrival time without mutating other core attributes.
   *
   * @param {object} journey
   * @param {UnifiedJourneyImpact} unifiedImpact
   * @param {object} [options={}]
   * @returns {object} Updated journey
   */
  applyUnifiedImpactToJourney(journey, unifiedImpact, options = {}) {
    if (!journey || !unifiedImpact) return journey;

    journey.unifiedImpact = unifiedImpact;
    journey.totalDurationMinutes = unifiedImpact.updatedDurationMinutes;
    if (journey.durationMinutes !== undefined) {
      journey.durationMinutes = unifiedImpact.updatedDurationMinutes;
    }

    if (journey.departureTime) {
      journey.estimatedArrivalTime = addMinutesToHHMM(
        journey.departureTime,
        unifiedImpact.updatedDurationMinutes
      );
    }

    journey.isViable = unifiedImpact.isFeasible;
    if (!unifiedImpact.isFeasible) {
      journey.viabilityReason = unifiedImpact.feasibilityReason;
    }

    return journey;
  }
}

const commuteContextEngine = new CommuteContextEngine();

module.exports = {
  CommuteContextEngine,
  commuteContextEngine,
  addMinutesToHHMM
};
