/**
 * DisruptionImpactService
 *
 * Deterministic Disruption Impact Analysis Engine for the Smart Student Commute Companion (P9).
 *
 * Evaluates the impact of real-world disruptions across candidate commute journeys:
 * - Unaffected route recognition
 * - Single-segment vs multi-segment multimodal impact attribution
 * - Travel time delays and waiting time/queuing increases
 * - Service unavailability, suspensions, and route closures
 * - Journey infeasibility and alternative connection requirements
 * - Simultaneous multiple disruption handling
 * - Strict 4-tier data provenance preservation (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 *
 * Also maintains full backward-compatibility with Day 14 Recommendation Pipeline interfaces:
 * - assessDisruptions({ corridorDisruptions, routes })
 * - calculateRouteDisruptionPenalty(route, disruptionsConsidered)
 * - calculateRouteWeatherPenalty(route, weatherContext)
 */

const {
  DISRUPTION_SEVERITIES,
  DataProvenance,
  PROVENANCE_TIERS,
  CommuteDisruption,
  JourneyDisruptionImpact,
  DISRUPTION_CATEGORIES,
  IMPACT_SCOPES,
  FEASIBILITY_REASONS
} = require('../models');
const { disruptionDataService } = require('./disruptionDataService');
const { ValidationError } = require('../errors');

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

class DisruptionImpactService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.disruptionDataService]
   */
  constructor(options = {}) {
    this.disruptionDataService = options.disruptionDataService || disruptionDataService;
  }

  // ==========================================================================
  // DAY 16: CANDIDATE JOURNEY DISRUPTION IMPACT ANALYSIS
  // ==========================================================================

  /**
   * Evaluates the deterministic impact of active disruptions on a candidate journey.
   *
   * @param {object} journey - CommuteJourney, CommuteRoute, or candidate trip object
   * @param {Array<object>} [disruptions=null] - Optional disruptions array (defaults to active disruptions)
   * @param {object} [options={}] - Options (e.g. { checkActive: true, currentTime })
   * @returns {JourneyDisruptionImpact}
   */
  evaluateJourneyImpact(journey, disruptions = null, options = {}) {
    if (!journey) {
      throw new ValidationError('Candidate journey is required for disruption impact evaluation');
    }

    // Resolve disruptions: explicit array or fetch from repository
    let activeDisruptions = disruptions;
    if (!activeDisruptions) {
      try {
        activeDisruptions = this.disruptionDataService.getActiveDisruptions();
      } catch (err) {
        activeDisruptions = [];
      }
    }

    const segments = journey.segments || journey.legs || [];
    const originalDuration = Number(journey.totalDurationMinutes || journey.durationMinutes || 0);

    if (segments.length === 0 || !activeDisruptions || activeDisruptions.length === 0) {
      return JourneyDisruptionImpact.unaffected(journey, options);
    }

    const segmentImpacts = [];
    const affectedSegmentIndices = [];
    let totalAddedTravel = 0;
    let totalAddedWait = 0;
    let isJourneyFeasible = true;
    let journeyFeasibilityReason = FEASIBILITY_REASONS.OPERATIONAL;
    const allDisruptions = [];
    const advisories = [];
    const allTiers = new Set();
    let firstFailingSegment = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segMatches = this.matchDisruptionsToSegment(seg, activeDisruptions, options);
      const segImpact = this.calculateSegmentImpact(seg, segMatches, options);
      segmentImpacts.push(segImpact);

      if (segImpact.isAffected) {
        affectedSegmentIndices.push(segImpact.segmentIndex);
        totalAddedTravel += segImpact.addedTravelTimeMinutes;
        totalAddedWait += segImpact.addedWaitingTimeMinutes;

        for (const d of segImpact.disruptions) {
          allDisruptions.push(d);
          if (d.description && !advisories.includes(d.description)) {
            advisories.push(d.description);
          }
          if (d.provenance?.sourceTier) {
            allTiers.add(d.provenance.sourceTier);
          }
        }

        if (!segImpact.isFeasible) {
          isJourneyFeasible = false;
          if (journeyFeasibilityReason === FEASIBILITY_REASONS.OPERATIONAL) {
            journeyFeasibilityReason = segImpact.feasibilityReason;
            firstFailingSegment = seg;
          }
        }
      }
    }

    const affectedCount = affectedSegmentIndices.length;

    if (affectedCount === 0) {
      return JourneyDisruptionImpact.unaffected(journey, options);
    }

    const impactScope = affectedCount === 1
      ? IMPACT_SCOPES.SINGLE_SEGMENT
      : IMPACT_SCOPES.MULTIPLE_SEGMENTS;

    const totalDelayMinutes = totalAddedTravel + totalAddedWait;
    const updatedDurationMinutes = originalDuration + totalDelayMinutes;

    // Alternative connection requirement logic
    let requiresAlternative = false;
    let alternativeReason = null;

    if (!isJourneyFeasible) {
      requiresAlternative = true;
      const segMode = String(firstFailingSegment?.mode || 'transit').toUpperCase();
      const segFrom = firstFailingSegment?.from || 'origin';
      const segTo = firstFailingSegment?.to || 'destination';
      alternativeReason = `${segMode} connection from ${segFrom} to ${segTo} is infeasible (${journeyFeasibilityReason}). Alternative connection required.`;
    } else if (totalDelayMinutes >= 35) {
      requiresAlternative = true;
      alternativeReason = `Cumulative disruption delay of +${totalDelayMinutes} mins exceeds acceptable threshold (35 mins). Alternative route recommended.`;
    }

    // Determine overall provenance tier
    const dataTiers = Array.from(allTiers);
    let overallTier = PROVENANCE_TIERS.VERIFIED;
    if (dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED)) {
      overallTier = PROVENANCE_TIERS.USER_REPORTED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.ESTIMATED)) {
      overallTier = PROVENANCE_TIERS.ESTIMATED;
    } else if (dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC)) {
      overallTier = PROVENANCE_TIERS.SYNTHETIC;
    }

    const overallProvenance = {
      sourceTier: overallTier,
      provider: allDisruptions[0]?.provenance?.provider || 'Disruption Impact Engine',
      confidence: allDisruptions.some(d => d.provenance.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM',
      lastUpdated: Date.now(),
      description: `Evaluated ${allDisruptions.length} disruption(s) across tiers: ${dataTiers.join(', ')}`
    };

    return new JourneyDisruptionImpact({
      journeyId: journey.id || `journey-${Date.now()}`,
      isAffected: true,
      isFeasible: isJourneyFeasible,
      feasibilityReason: journeyFeasibilityReason,
      impactScope,
      affectedSegmentsCount: affectedCount,
      affectedSegmentIndices,
      addedTravelTimeMinutes: totalAddedTravel,
      addedWaitingTimeMinutes: totalAddedWait,
      totalDelayMinutes,
      originalDurationMinutes: originalDuration,
      updatedDurationMinutes,
      requiresAlternative,
      alternativeReason,
      segmentImpacts,
      disruptions: allDisruptions,
      advisories,
      dataTiers,
      provenance: overallProvenance,
      evaluatedAt: options.evaluatedAt || Date.now()
    });
  }

  /**
   * Evaluates an array of candidate journeys against active or provided disruptions.
   *
   * @param {Array<object>} journeys
   * @param {Array<object>} [disruptions=null]
   * @param {object} [options={}]
   * @returns {Array<{ journey: object, impact: JourneyDisruptionImpact, updatedJourney?: object }>}
   */
  evaluateCandidateJourneys(journeys = [], disruptions = null, options = {}) {
    if (!Array.isArray(journeys)) {
      throw new ValidationError('Journeys must be provided as an array');
    }

    return journeys.map(journey => {
      const impact = this.evaluateJourneyImpact(journey, disruptions, options);
      if (options.decorate === true) {
        journey.disruptionImpact = impact;
        return journey;
      }
      return {
        journey,
        impact,
        updatedJourney: options.applyImpact ? this.applyImpactToJourney(journey, impact, options) : undefined
      };
    });
  }

  /**
   * Matches candidate disruptions against an individual journey segment.
   *
   * @param {object} segment - JourneySegment or RouteLeg
   * @param {Array<object>} [disruptions=[]]
   * @param {object} [options={}]
   * @returns {Array<object>} Matching disruption objects
   */
  matchDisruptionsToSegment(segment, disruptions = [], options = {}) {
    const matches = [];
    const segMode = String(segment.mode || '').toLowerCase();
    const segFrom = String(segment.from || '').toLowerCase();
    const segTo = String(segment.to || '').toLowerCase();
    const segServiceId = String(segment.serviceId || '').toUpperCase();
    const segLineId = String(segment.lineIdentifier || '').toUpperCase();
    const segLineName = String(segment.lineInfo?.lineName || '').toUpperCase();
    const segShortName = String(segment.lineInfo?.routeShortName || '').toUpperCase();

    for (const rawDisruption of disruptions) {
      const d = rawDisruption instanceof CommuteDisruption ? rawDisruption.toJSON() : rawDisruption;

      // Active status check
      if (options.checkActive !== false) {
        if (d.status && d.status !== 'active') continue;
        if (d.startTime && d.endTime) {
          const now = options.currentTime || Date.now();
          if (now < d.startTime || now > d.endTime) continue;
        }
      }

      const dMode = String(d.affectedMode || d.transportMode || d.transport_mode || '').toLowerCase();
      const dRouteId = String(d.affectedRouteId || d.affectedLineOrRoute || d.affected_line_or_route || d.affected_route_id || '').toUpperCase();
      const dArea = String(d.affectedArea || d.corridorOrArea || d.affected_area || d.area || '').toLowerCase();

      // 1. Line / Service ID match
      let routeMatched = false;
      if (dRouteId) {
        if (
          (segServiceId && (segServiceId === dRouteId || segServiceId.includes(dRouteId) || dRouteId.includes(segServiceId))) ||
          (segLineId && (segLineId === dRouteId || segLineId.includes(dRouteId) || dRouteId.includes(segLineId))) ||
          (segLineName && (segLineName === dRouteId || segLineName.includes(dRouteId) || dRouteId.includes(segLineName))) ||
          (segShortName && (segShortName === dRouteId || segShortName.includes(dRouteId) || dRouteId.includes(segShortName)))
        ) {
          routeMatched = true;
        }
      }

      // 2. Mode match
      let modeMatched = false;
      if (!dMode || dMode === 'all') {
        modeMatched = true;
      } else if (dMode === segMode) {
        modeMatched = true;
      } else if ((dMode === 'auto' || dMode === 'shared_auto') && (segMode === 'auto' || segMode === 'shared_auto')) {
        modeMatched = true;
      }

      // 3. Area / Corridor match
      let areaMatched = false;
      if (!dArea) {
        areaMatched = routeMatched;
      } else {
        areaMatched = this._isLocationOrCorridorMatch(dArea, segFrom, segTo);
      }

      // Match Decision:
      // A: Explicit Route ID matched AND area matches (or area not restricted)
      if (routeMatched && (!dArea || areaMatched)) {
        matches.push(d);
      }
      // B: Mode and Area matched when Route ID was not restricted
      else if (!dRouteId && modeMatched && areaMatched) {
        matches.push(d);
      }
    }

    return matches;
  }

  /**
   * Calculates the disruption impact metrics for an individual segment.
   *
   * @param {object} segment
   * @param {Array<object>} matchingDisruptions
   * @param {object} [options={}]
   * @returns {object}
   */
  calculateSegmentImpact(segment, matchingDisruptions = [], options = {}) {
    const segIndex = segment.segmentIndex !== undefined ? segment.segmentIndex : 0;
    const mode = segment.mode || 'walk';
    const from = segment.from || '';
    const to = segment.to || '';

    if (!matchingDisruptions || matchingDisruptions.length === 0) {
      return {
        segmentIndex: segIndex,
        mode,
        from,
        to,
        serviceId: segment.serviceId || null,
        lineIdentifier: segment.lineIdentifier || null,
        isAffected: false,
        isFeasible: true,
        feasibilityReason: FEASIBILITY_REASONS.OPERATIONAL,
        addedTravelTimeMinutes: 0,
        addedWaitingTimeMinutes: 0,
        totalSegmentDelayMinutes: 0,
        disruptions: [],
        provenance: null
      };
    }

    let addedTravelTime = 0;
    let addedWaitingTime = 0;
    let isFeasible = true;
    let feasibilityReason = FEASIBILITY_REASONS.OPERATIONAL;
    const processedDisruptions = [];
    const tiers = [];

    for (const d of matchingDisruptions) {
      const category = this.classifyDisruptionCategory(d);
      const severity = d.severity || DISRUPTION_SEVERITIES.MODERATE;
      const baseDelay = Number(d.estimatedDelayMinutes || 0) || (SEVERITY_BASE_DELAYS[severity] || 15);

      let segDelay = 0;
      let segWait = 0;
      let makesInfeasible = false;
      let reason = FEASIBILITY_REASONS.OPERATIONAL;

      const type = String(d.type || d.disruptionType || '').toLowerCase();

      if (category === DISRUPTION_CATEGORIES.ROUTE_CLOSURE) {
        makesInfeasible = true;
        reason = FEASIBILITY_REASONS.ROUTE_CLOSED;
        segDelay = baseDelay;
      } else if (category === DISRUPTION_CATEGORIES.SERVICE_SUSPENSION) {
        makesInfeasible = true;
        reason = FEASIBILITY_REASONS.SERVICE_SUSPENDED;
        segDelay = baseDelay;
      } else if (type === 'cancellation' || (category === DISRUPTION_CATEGORIES.BUS_DELAY_UNAVAILABILITY && type === 'cancellation')) {
        makesInfeasible = true;
        reason = FEASIBILITY_REASONS.SERVICE_CANCELLED;
        segDelay = baseDelay;
      } else if (category === DISRUPTION_CATEGORIES.WEATHER_DISRUPTION && severity === 'critical') {
        makesInfeasible = true;
        reason = FEASIBILITY_REASONS.WEATHER_IMPASSABLE;
        segDelay = baseDelay;
      } else if (type === 'auto_refusal') {
        segWait = baseDelay;
      } else if (type === 'crowding') {
        segWait = Math.round(baseDelay * 0.7);
        segDelay = Math.round(baseDelay * 0.3);
      } else {
        segDelay = baseDelay;
      }

      if (makesInfeasible) {
        isFeasible = false;
        if (feasibilityReason === FEASIBILITY_REASONS.OPERATIONAL) {
          feasibilityReason = reason;
        }
      }

      addedTravelTime += segDelay;
      addedWaitingTime += segWait;

      const rawProv = d.provenance
        ? (typeof d.provenance.toJSON === 'function' ? d.provenance.toJSON() : d.provenance)
        : {
            sourceTier: d.provenance_tier || PROVENANCE_TIERS.USER_REPORTED,
            provider: d.provider || 'Disruption Feed',
            confidence: d.confidence || 'MEDIUM',
            description: d.description || ''
          };
      const tier = rawProv.sourceTier || rawProv.tier || PROVENANCE_TIERS.USER_REPORTED;
      tiers.push(tier);

      processedDisruptions.push({
        disruptionId: String(d.id || `disr-${Date.now()}`),
        type: type || 'delay',
        category,
        severity,
        description: d.description || '',
        delayMinutes: segDelay,
        waitingTimeMinutes: segWait,
        makesSegmentInfeasible: makesInfeasible,
        feasibilityReason: reason,
        provenance: {
          sourceTier: tier,
          provider: rawProv.provider || 'Disruption Feed',
          confidence: rawProv.confidence || 'MEDIUM',
          lastUpdated: rawProv.lastUpdated || Date.now(),
          description: rawProv.description || ''
        }
      });
    }

    const primaryTier = tiers.includes(PROVENANCE_TIERS.USER_REPORTED)
      ? PROVENANCE_TIERS.USER_REPORTED
      : (tiers.includes(PROVENANCE_TIERS.ESTIMATED)
        ? PROVENANCE_TIERS.ESTIMATED
        : (tiers.includes(PROVENANCE_TIERS.SYNTHETIC)
          ? PROVENANCE_TIERS.SYNTHETIC
          : PROVENANCE_TIERS.VERIFIED));

    const segmentProvenance = {
      sourceTier: primaryTier,
      provider: processedDisruptions[0]?.provenance?.provider || 'Disruption Feed',
      confidence: processedDisruptions[0]?.provenance?.confidence || 'MEDIUM',
      lastUpdated: Date.now(),
      description: `Segment affected by ${processedDisruptions.length} disruption(s)`
    };

    return {
      segmentIndex: segIndex,
      mode,
      from,
      to,
      serviceId: segment.serviceId || null,
      lineIdentifier: segment.lineIdentifier || null,
      isAffected: true,
      isFeasible,
      feasibilityReason,
      addedTravelTimeMinutes: addedTravelTime,
      addedWaitingTimeMinutes: addedWaitingTime,
      totalSegmentDelayMinutes: addedTravelTime + addedWaitingTime,
      disruptions: processedDisruptions,
      provenance: segmentProvenance
    };
  }

  /**
   * Categorizes a disruption into one of the supported standard disruption categories.
   *
   * @param {object} disruption
   * @returns {string} One of DISRUPTION_CATEGORIES
   */
  classifyDisruptionCategory(disruption) {
    const type = String(disruption.type || disruption.disruptionType || disruption.disruption_type || '').toLowerCase();
    const desc = String(disruption.description || disruption.title || '').toLowerCase();
    const mode = String(disruption.affectedMode || disruption.transportMode || disruption.transport_mode || '').toLowerCase();

    // 1. Explicit Route Closure
    if (type === 'route_closure' || type === 'closure') {
      return DISRUPTION_CATEGORIES.ROUTE_CLOSURE;
    }

    // 2. Weather-related disruption
    if (type === 'waterlogging' || type === 'weather' || type === 'flood' || desc.includes('waterlog') || desc.includes('flooding') || desc.includes('heavy rain') || desc.includes('submerged')) {
      return DISRUPTION_CATEGORIES.WEATHER_DISRUPTION;
    }

    // 3. Transport Service Suspension
    if (type === 'service_suspension' || type === 'suspension' || type === 'strike' || desc.includes('suspended') || desc.includes('strike') || desc.includes('mega block') || desc.includes('no service')) {
      return DISRUPTION_CATEGORIES.SERVICE_SUSPENSION;
    }

    // 4. Description mentions closure
    if (desc.includes('closed') || desc.includes('closure') || desc.includes('shut down') || desc.includes('barricaded')) {
      return DISRUPTION_CATEGORIES.ROUTE_CLOSURE;
    }

    // 4. Train / Metro delay
    if (mode === 'train' || mode === 'metro') {
      if (type === 'cancellation') {
        return DISRUPTION_CATEGORIES.SERVICE_SUSPENSION;
      }
      return DISRUPTION_CATEGORIES.TRAIN_METRO_DELAY;
    }

    // 5. Bus delay / unavailability
    if (mode === 'bus') {
      return DISRUPTION_CATEGORIES.BUS_DELAY_UNAVAILABILITY;
    }

    // 6. Road / traffic disruption
    if (mode === 'auto' || mode === 'shared_auto' || type === 'traffic' || type === 'auto_refusal' || desc.includes('traffic') || desc.includes('refusal') || desc.includes('congestion')) {
      return DISRUPTION_CATEGORIES.ROAD_TRAFFIC_DISRUPTION;
    }

    // 7. General availability issue
    return DISRUPTION_CATEGORIES.OTHER_AVAILABILITY_ISSUE;
  }

  /**
   * Applies disruption impact to produce an updated journey view/clone.
   *
   * @param {object} journey
   * @param {JourneyDisruptionImpact} impact
   * @param {object} [options={}]
   * @returns {object}
   */
  applyImpactToJourney(journey, impact, options = {}) {
    if (!journey || !impact) return journey;

    const originalArrivalTime = journey.estimatedArrivalTime || '08:30';
    const updatedArrivalTime = addMinutesToHHMM(originalArrivalTime, impact.totalDelayMinutes);

    const updatedSegments = (journey.segments || []).map((seg, idx) => {
      const segImpact = impact.segmentImpacts?.find(s => s.segmentIndex === idx);
      if (!segImpact || !segImpact.isAffected) {
        return seg;
      }
      const updatedDuration = Number(seg.durationMinutes || 0) + segImpact.addedTravelTimeMinutes;
      const updatedWait = Number(seg.waitingTimeMinutes || 0) + segImpact.addedWaitingTimeMinutes;
      const updatedStatus = !segImpact.isFeasible ? 'SUSPENDED' : 'DISRUPTED';

      return {
        ...seg,
        durationMinutes: updatedDuration,
        waitingTimeMinutes: updatedWait,
        status: updatedStatus
      };
    });

    const mergedAdvisories = Array.from(new Set([...(journey.advisories || []), ...(impact.advisories || [])]));

    return {
      ...journey,
      estimatedArrivalTime: updatedArrivalTime,
      totalDurationMinutes: impact.updatedDurationMinutes,
      totalWaitingTimeMinutes: Number(journey.totalWaitingTimeMinutes || 0) + impact.addedWaitingTimeMinutes,
      isViable: journey.isViable && impact.isFeasible,
      advisories: mergedAdvisories,
      segments: updatedSegments,
      disruptionImpact: impact.toJSON ? impact.toJSON() : impact
    };
  }

  /**
   * Spatial/corridor overlap checking between a disruption area and segment endpoints.
   * @private
   */
  _isLocationOrCorridorMatch(disruptionArea, fromLocation, toLocation) {
    if (!disruptionArea) return true;
    const cleanArea = String(disruptionArea).toLowerCase().trim();
    const cleanFrom = String(fromLocation || '').toLowerCase().trim();
    const cleanTo = String(toLocation || '').toLowerCase().trim();

    // Direct containment
    if (cleanFrom.includes(cleanArea) || cleanTo.includes(cleanArea) || cleanArea.includes(cleanFrom) || cleanArea.includes(cleanTo)) {
      return true;
    }

    // Corridor hyphen / "to" split (e.g. "Dadar - Andheri", "Borivali to Vile Parle")
    const corridorParts = cleanArea
      .split(/[-–—]|\bto\b/)
      .map(p => p.trim().replace(/(station|stn|west|east|metro|bus|stop|road)/g, '').trim())
      .filter(p => p.length >= 3);

    if (corridorParts.length >= 2) {
      for (const part of corridorParts) {
        if (cleanFrom.includes(part) || cleanTo.includes(part)) {
          return true;
        }
      }

      // Western Railway stations corridor index check
      const wrStations = ['churchgate', 'dadar', 'bandra', 'santacruz', 'vile parle', 'andheri', 'jogeshwari', 'goregaon', 'malad', 'kandivali', 'borivali'];
      const idx1 = wrStations.findIndex(s => corridorParts[0].includes(s) || s.includes(corridorParts[0]));
      const idx2 = wrStations.findIndex(s => corridorParts[1].includes(s) || s.includes(corridorParts[1]));
      if (idx1 !== -1 && idx2 !== -1) {
        const minIdx = Math.min(idx1, idx2);
        const maxIdx = Math.max(idx1, idx2);
        const fromIdx = wrStations.findIndex(s => cleanFrom.includes(s));
        const toIdx = wrStations.findIndex(s => cleanTo.includes(s));
        if ((fromIdx >= minIdx && fromIdx <= maxIdx) || (toIdx >= minIdx && toIdx <= maxIdx)) {
          return true;
        }
      }
    }

    // Keyword matching for specific transit hotspots (e.g. "Milan Subway", "Andheri Station West")
    const keywords = cleanArea
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['station', 'west', 'east', 'metro', 'road', 'line'].includes(w));

    for (const kw of keywords) {
      if (cleanFrom.includes(kw) || cleanTo.includes(kw)) {
        return true;
      }
    }

    return false;
  }

  // ==========================================================================
  // DAY 14 PRESERVED METHODS (FOR RECOMMENDATION PIPELINE COMPATIBILITY)
  // ==========================================================================

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
        disruptionType: disruption.disruptionType || disruption.disruption_type || disruption.type || 'delay',
        affectedMode: disruption.transportMode || disruption.transport_mode || disruption.affectedMode || 'train',
        affectedLine: disruption.affectedLineOrRoute || disruption.affected_line_or_route || disruption.affectedRouteId || '',
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
      const affectsRoute = legs.some(leg => {
        if (leg.mode !== impact.affectedMode) {
          return false;
        }

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

    const walkingMinutes = typeof route.getWalkingMinutes === 'function'
      ? route.getWalkingMinutes()
      : (route.estimate ? route.estimate.walkingDurationMinutes : 0);

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
  SEVERITY_PENALTY_POINTS,
  DISRUPTION_CATEGORIES,
  IMPACT_SCOPES,
  FEASIBILITY_REASONS,
  addMinutesToHHMM
};
