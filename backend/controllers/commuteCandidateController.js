/**
 * Commute Candidate Controller
 *
 * Exposes authenticated REST endpoints for generating candidate commute journeys.
 * Does NOT pretend to rank or pick the "best route" — returns transparent,
 * diverse, feasible candidate trips with full segment breakdowns and data provenance.
 */

const {
  candidateRouteEngine,
  studentCommutePreferenceService,
  commuteContextEngine,
  commuteContextService,
  routeConstraintFilteringService,
  routeComparisonService
} = require('../services');
const { addMinutesToHHMM } = require('../services/commuteContextEngine');
const { TrafficCondition } = require('../models/TrafficCondition');
const { ServiceStatusRecord } = require('../models/TransportAvailability');
const { normalizeWeatherCondition } = require('../models/WeatherCondition');
const { success } = require('../utils/apiResponse');
const { ValidationError } = require('../errors');
const { findForbiddenPrivacyFields } = require('../models/CommutePlanInputDTO');

/**
 * Generates feasible candidate journeys connecting starting area to college destination.
 * Evaluates real-time and environmental context impacts without declaring a recommended route.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function generateCandidateJourneys(req, res, next) {
  try {
    // 1. Strict privacy-by-design check
    const forbidden = findForbiddenPrivacyFields(req.body);
    if (forbidden.length > 0) {
      throw new ValidationError(`Privacy violation: Forbidden field(s) detected: ${forbidden.join(', ')}. Precise coordinates and residential addresses are prohibited.`);
    }

    // 2. Student scope & default preferences
    const studentId = req.user.id;
    let studentPrefs = null;
    try {
      studentPrefs = studentCommutePreferenceService.getPreferences(studentId, req.user);
    } catch (err) {
      // If student has not initialized preferences yet, proceed with defaults
      studentPrefs = null;
    }

    // 3. Resolve starting area (request body overrides stored default)
    const rawOrigin = req.body.startingArea || req.body.origin || studentPrefs?.default_origin_area || studentPrefs?.defaultOriginArea;
    if (!rawOrigin || typeof rawOrigin !== 'string' || rawOrigin.trim().length === 0) {
      throw new ValidationError('Starting area is required. Please provide startingArea or configure your default origin area in profile preferences.');
    }
    const startingArea = rawOrigin.trim();

    // 4. Resolve destination
    const rawDest = req.body.collegeDestination || req.body.destination || studentPrefs?.default_destination_college || studentPrefs?.defaultDestinationCollege || 'D.J. Sanghvi College of Engineering';
    const destination = rawDest.trim();

    // 5. Resolve timing
    const departureTime = req.body.desiredDepartureTime || req.body.departureTime || null;
    const targetArrivalTime = req.body.desiredArrivalTime || req.body.targetArrivalTime || null;

    // 6. Merge constraints (request overrides stored student preferences)
    const constraints = {
      maxTransfers: req.body.maxTransfers !== undefined
        ? Number(req.body.maxTransfers)
        : (studentPrefs?.max_transfers !== undefined
          ? studentPrefs.max_transfers
          : (studentPrefs?.maxTransfers !== undefined ? studentPrefs.maxTransfers : null)),
      maxWalkingMinutes: req.body.maxWalkingMinutes !== undefined
        ? Number(req.body.maxWalkingMinutes)
        : (req.body.walkingToleranceMinutes !== undefined
          ? Number(req.body.walkingToleranceMinutes)
          : (studentPrefs?.walking_tolerance_minutes !== undefined
            ? studentPrefs.walking_tolerance_minutes
            : (studentPrefs?.walkingToleranceMinutes !== undefined ? studentPrefs.walkingToleranceMinutes : null))),
      maxBudgetRupees: req.body.maxBudgetRupees !== undefined
        ? Number(req.body.maxBudgetRupees)
        : (studentPrefs?.max_budget_rupees !== undefined
          ? studentPrefs.max_budget_rupees
          : (studentPrefs?.maxBudgetRupees !== undefined ? studentPrefs.maxBudgetRupees : null))
    };

    // 7. Merge mode preferences
    const preferences = {
      allowedModes: req.body.allowedModes || null,
      avoidModes: req.body.avoidModes || (studentPrefs?.avoid_modes || studentPrefs?.avoidModes || []),
      preferredModes: req.body.preferredModes || (studentPrefs?.preferred_modes || studentPrefs?.preferredModes || ['train', 'metro', 'bus', 'auto', 'walk']),
      preference: req.body.preference || req.body.routingPreference || studentPrefs?.preference || studentPrefs?.routingPreference || 'balanced'
    };

    const limit = req.body.limit !== undefined ? Number(req.body.limit) : 5;
    const date = req.body.date || 'Mon';
    const dayOfWeek = req.body.dayOfWeek || 'Mon';

    const allModesAvoided = Array.isArray(preferences.avoidModes) &&
      ['train', 'metro', 'bus', 'auto', 'walk'].every(m => preferences.avoidModes.includes(m));

    // 8. Generate candidates via CandidateRouteEngine (generate raw pool, filtering is executed deterministically downstream with real-time context)
    const rawCandidates = allModesAvoided
      ? []
      : await candidateRouteEngine.generateCandidates({
          origin: startingArea,
          destination,
          departureTime: departureTime || (targetArrivalTime ? undefined : '08:00'),
          targetArrivalTime,
          preferences,
          constraints,
          date,
          dayOfWeek,
          options: { limit, unfiltered: true }
        });

    // 9. Collect and assemble Unified Commute Context
    let baseContext = {};
    try {
      baseContext = await commuteContextService.collectContext({
        originArea: startingArea,
        destinationArea: destination,
        desiredArrivalTime: targetArrivalTime,
        preferredModes: preferences.preferredModes,
        constraints,
        studentId
      }, {
        currentTime: req.body.currentTime || undefined,
        dayOfWeek: dayOfWeek || undefined
      });
    } catch (ctxErr) {
      baseContext = {};
    }

    const rawDisruptions = req.body.disruptions !== undefined
      ? req.body.disruptions
      : (req.body.context?.disruptions !== undefined
        ? req.body.context.disruptions
        : (baseContext.disruptions || null));

    const normalizedDisruptions = Array.isArray(rawDisruptions)
      ? rawDisruptions.map(d => ({
          ...d,
          id: d.id || `disr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: d.type || (d.disruptionType ? String(d.disruptionType).toLowerCase() : 'delay'),
          disruptionType: d.disruptionType || d.type || 'delay',
          affectedMode: d.affectedMode || d.transportMode || d.mode || 'train',
          affectedArea: d.affectedArea || d.area || d.corridor || 'Western Railway',
          corridorOrArea: d.corridorOrArea || d.corridor || d.affectedArea || d.area || 'Western Railway',
          affectedRouteId: d.affectedRouteId || d.affectedLineOrRoute || (Array.isArray(d.affectedLines) ? d.affectedLines[0] : null) || null,
          estimatedDelayMinutes: d.estimatedDelayMinutes !== undefined
            ? Number(d.estimatedDelayMinutes)
            : (d.delayMinutes !== undefined ? Number(d.delayMinutes) : 0),
          status: d.status ? String(d.status).toLowerCase() : 'active',
          severity: d.severity || 'moderate',
          description: d.description || 'Commute disruption'
        }))
      : rawDisruptions;

    const rawTraffic = req.body.trafficConditions !== undefined
      ? req.body.trafficConditions
      : (req.body.traffic !== undefined
        ? req.body.traffic
        : (req.body.context?.trafficConditions !== undefined
          ? req.body.context.trafficConditions
          : (baseContext.trafficContext?.conditions || null)));

    const normalizedTraffic = Array.isArray(rawTraffic)
      ? rawTraffic.map(t => {
          if (t && typeof t.isActive === 'function') return t;
          let level = t.level || t.trafficLevel || 'normal';
          if (level === 'congested') level = 'heavy';
          const area = t.area || t.corridor || 'Mumbai';
          const delay = t.expectedDelayMinutes !== undefined
            ? Number(t.expectedDelayMinutes)
            : (t.delayMinutes !== undefined
              ? Number(t.delayMinutes)
              : (t.addedTravelTimeMinutes !== undefined ? Number(t.addedTravelTimeMinutes) : 0));
          const prov = t.provenance || {
            sourceTier: t.sourceTier || t.tier || 'ESTIMATED',
            provider: t.provider || 'Traffic Service',
            confidence: t.confidence || 'MEDIUM',
            description: t.description || `Traffic on ${area}`
          };
          return TrafficCondition.create({
            ...t,
            id: t.id || `traf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            area,
            level,
            expectedDelayMinutes: delay,
            provenance: prov,
            description: t.description || `Traffic on ${area}`
          });
        })
      : rawTraffic;

    const rawAvailability = req.body.availabilityRecords !== undefined
      ? req.body.availabilityRecords
      : (req.body.serviceStatusRecords !== undefined
        ? req.body.serviceStatusRecords
        : (req.body.context?.availabilityRecords !== undefined
          ? req.body.context.availabilityRecords
          : (baseContext.availabilityContext?.records || null)));

    const normalizedAvailability = Array.isArray(rawAvailability)
      ? rawAvailability.map(a => {
          if (a && typeof a.isUsable === 'function') return a;
          return ServiceStatusRecord.create({
            ...a,
            id: a.id || `avail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
          });
        })
      : rawAvailability;

    const evaluationContext = {
      ...baseContext,
      ...(req.body.context || {}),
      currentTime: req.body.currentTime || baseContext.currentTime || undefined,
      disruptions: normalizedDisruptions,
      trafficConditions: normalizedTraffic,
      trafficContext: req.body.trafficContext !== undefined
        ? req.body.trafficContext
        : (req.body.context?.trafficContext || baseContext.trafficContext || null),
      weatherContext: (() => {
        const raw = req.body.weatherContext !== undefined
          ? req.body.weatherContext
          : (req.body.weatherCondition !== undefined
            ? req.body.weatherCondition
            : (req.body.weather !== undefined
              ? req.body.weather
              : (req.body.context?.weatherContext || baseContext.weatherContext || null)));
        if (!raw) return null;
        if (typeof raw === 'string') return normalizeWeatherCondition(raw);
        if (typeof raw === 'object' && raw.condition) {
          const prov = raw.provenance || (raw.sourceTier ? {
            sourceTier: raw.sourceTier,
            tier: raw.sourceTier,
            provider: raw.provider || 'Weather Service',
            confidence: raw.confidence || 'MEDIUM',
            description: raw.description || `Weather ${raw.condition}`
          } : undefined);
          return {
            ...raw,
            condition: normalizeWeatherCondition(raw.condition),
            ...(prov ? { provenance: prov } : {})
          };
        }
        return raw;
      })(),
      availabilityRecords: normalizedAvailability,
      availabilityContext: req.body.availabilityContext !== undefined
        ? req.body.availabilityContext
        : (req.body.context?.availabilityContext || baseContext.availabilityContext || null)
    };

    // 10. Evaluate unified context impact on each candidate and distinguish baseline vs contextual impact
    const candidates = (rawCandidates || []).map(cand => {
      // 10a. Evaluate candidate through CommuteContextEngine
      const unifiedImpact = commuteContextEngine.evaluateJourney(cand, evaluationContext, {
        currentTime: req.body.currentTime || evaluationContext.currentTime
      });

      // 10b. Baseline metrics
      const baselineDuration = Number(cand.totalDurationMinutes || 0);
      const baselineArrivalTime = cand.estimatedArrivalTime || addMinutesToHHMM(cand.departureTime || '08:00', baselineDuration);

      // 10c. Contextual updates
      const updatedDurationMinutes = unifiedImpact.updatedDurationMinutes;
      const updatedArrivalTime = cand.departureTime
        ? addMinutesToHHMM(cand.departureTime, updatedDurationMinutes)
        : addMinutesToHHMM(baselineArrivalTime, unifiedImpact.totalAdditionalDelayMinutes);

      const isFeasible = unifiedImpact.isFeasible;
      const isViable = isFeasible && cand.isViable !== false;

      // 10d. Resolve provenance
      const rawCandProv = cand.provenance
        ? (typeof cand.provenance.toJSON === 'function' ? cand.provenance.toJSON() : cand.provenance)
        : null;
      const hasVerifiedSegment = (cand.segments || []).some(s =>
        s.mode === 'train' || s.mode === 'metro' ||
        s.provenance?.sourceTier === 'VERIFIED' || s.provenance?.tier === 'VERIFIED'
      );
      const candTier = (hasVerifiedSegment ? 'VERIFIED' : null) || rawCandProv?.sourceTier || rawCandProv?.tier || 'ESTIMATED';
      const candSource = rawCandProv?.provider || rawCandProv?.source || (hasVerifiedSegment ? 'Mumbai Transit GTFS Timetable Feed' : 'Candidate Route Generation Engine');

      // 10e. Build contextual impact summary
      const contextualImpact = {
        isFeasible,
        feasibilityReason: unifiedImpact.feasibilityReason,
        reasonCodes: unifiedImpact.reasonCodes,
        totalAdditionalDelayMinutes: unifiedImpact.totalAdditionalDelayMinutes,
        disruptionDelayMinutes: unifiedImpact.disruptionImpact?.totalDelayMinutes || 0,
        trafficDelayMinutes: unifiedImpact.trafficImpact?.addedTravelTimeMinutes || 0,
        weatherDelayMinutes: unifiedImpact.weatherImpact?.totalAddedTravelTimeMinutes || 0,
        availabilityDelayMinutes: unifiedImpact.transportStatus?.totalDelayMinutes || 0,
        originalDurationMinutes: baselineDuration,
        updatedDurationMinutes,
        updatedArrivalTime,
        reliabilityIndicator: unifiedImpact.reliabilityIndicator,
        uncertaintyLevel: unifiedImpact.uncertaintyLevel,
        dominantTransportStatus: unifiedImpact.dominantTransportStatus,
        affectedSegments: unifiedImpact.affectedSegments,
        unavailableSegments: unifiedImpact.unavailableSegments,
        disruptionImpact: unifiedImpact.disruptionImpact,
        trafficImpact: unifiedImpact.trafficImpact,
        weatherImpact: unifiedImpact.weatherImpact,
        transportAvailability: unifiedImpact.transportStatus,
        advisories: unifiedImpact.advisories,
        dataTiers: unifiedImpact.dataTiers,
        provenance: unifiedImpact.provenance
      };

      // 10f. Build segments with contextual segment-level impacts
      const segments = (cand.segments || []).map((seg, idx) => {
        const segIndex = seg.segmentIndex !== undefined ? seg.segmentIndex : idx;
        const affSeg = unifiedImpact.affectedSegments?.find(s => s.segmentIndex === segIndex);
        const unavailSeg = unifiedImpact.unavailableSegments?.find(s => s.segmentIndex === segIndex);
        const rawSegProv = seg.provenance
          ? (typeof seg.provenance.toJSON === 'function' ? seg.provenance.toJSON() : seg.provenance)
          : null;
        const tier = rawSegProv?.sourceTier || rawSegProv?.tier || 'ESTIMATED';
        const source = rawSegProv?.provider || rawSegProv?.source || 'Journey Segment Engine';

        return {
          segmentIndex: segIndex,
          type: seg.type,
          mode: seg.mode,
          from: seg.from,
          to: seg.to,
          departureTime: seg.departureTime,
          arrivalTime: seg.arrivalTime,
          durationMinutes: seg.durationMinutes,
          waitingTimeMinutes: seg.waitingTimeMinutes,
          distanceKm: seg.distanceKm,
          fareRupees: seg.fareRupees,
          serviceId: seg.serviceId,
          lineIdentifier: seg.lineIdentifier,
          lineInfo: seg.lineInfo,
          status: unavailSeg ? unavailSeg.status : seg.status,
          isAffected: Boolean(affSeg),
          isUsable: affSeg ? affSeg.isUsable : true,
          contextDelayMinutes: affSeg ? affSeg.delayMinutes : 0,
          contextReasons: affSeg ? affSeg.reasons : [],
          contextImpacts: affSeg ? affSeg.impacts : null,
          provenance: {
            tier,
            sourceTier: tier,
            source,
            provider: source,
            confidence: rawSegProv?.confidence || 'MEDIUM',
            description: rawSegProv?.description || 'Deterministic segment timing'
          }
        };
      });

      const baselineEstimate = {
        durationMinutes: baselineDuration,
        departureTime: cand.departureTime || '08:00',
        estimatedArrivalTime: baselineArrivalTime,
        waitingTimeMinutes: cand.totalWaitingTimeMinutes || 0,
        walkingTimeMinutes: cand.walkingTimeMinutes || 0,
        transitTimeMinutes: cand.transitTimeMinutes || 0,
        transferCount: cand.transferCount || 0,
        estimatedCostRupees: cand.estimatedCostRupees || 0,
        totalDistanceKm: cand.totalDistanceKm || 0
      };

      const contextualEstimate = {
        durationMinutes: updatedDurationMinutes,
        departureTime: cand.departureTime || '08:00',
        estimatedArrivalTime: updatedArrivalTime,
        totalAdditionalDelayMinutes: unifiedImpact.totalAdditionalDelayMinutes || 0,
        disruptionDelayMinutes: unifiedImpact.disruptionImpact?.totalDelayMinutes || 0,
        trafficDelayMinutes: unifiedImpact.trafficImpact?.addedTravelTimeMinutes || 0,
        waitingTimeMinutes: cand.totalWaitingTimeMinutes || 0,
        walkingTimeMinutes: cand.walkingTimeMinutes || 0,
        transitTimeMinutes: cand.transitTimeMinutes || 0,
        transferCount: cand.transferCount || 0,
        estimatedCostRupees: cand.estimatedCostRupees || 0,
        totalDistanceKm: cand.totalDistanceKm || 0,
        reliability: unifiedImpact.reliabilityIndicator || 'LOW',
        uncertainty: unifiedImpact.uncertaintyLevel || 'LOW',
        isFeasible: isViable,
        feasibilityReason: unifiedImpact.feasibilityReason || 'OPERATIONAL'
      };

      const disruptionImpact = {
        isAffected: Boolean(unifiedImpact.disruptionImpact?.isAffected),
        totalDelayMinutes: unifiedImpact.totalAdditionalDelayMinutes || 0,
        disruptionDelayMinutes: unifiedImpact.disruptionImpact?.totalDelayMinutes || 0,
        trafficDelayMinutes: unifiedImpact.trafficImpact?.addedTravelTimeMinutes || 0,
        affectedSegments: unifiedImpact.affectedSegments || [],
        unavailableSegments: unifiedImpact.unavailableSegments || [],
        advisories: unifiedImpact.advisories || []
      };

      return {
        id: cand.id,
        candidateId: cand.id,
        routeType: 'EVALUATED_ROUTE',
        origin: cand.origin,
        destination: cand.destination,
        departureTime: cand.departureTime || '08:00',
        estimatedArrivalTime: updatedArrivalTime,
        totalDurationMinutes: updatedDurationMinutes,
        estimatedTravelTimeMinutes: updatedDurationMinutes,
        baselineEstimate,
        contextualEstimate,
        travelTimeEstimate: {
          baseline: baselineEstimate,
          contextual: contextualEstimate,
          totalDurationMinutes: updatedDurationMinutes,
          additionalDelayMinutes: unifiedImpact.totalAdditionalDelayMinutes || 0
        },
        disruptionImpact,
        baselineTravel: baselineEstimate,
        contextualImpact,
        isFeasible,
        isViable,
        feasibilityReason: unifiedImpact.feasibilityReason,
        reasonCodes: unifiedImpact.reasonCodes,
        additionalDisruptionDelayMinutes: unifiedImpact.disruptionImpact?.totalDelayMinutes || 0,
        totalAdditionalDelayMinutes: unifiedImpact.totalAdditionalDelayMinutes || 0,
        affectedSegments: unifiedImpact.affectedSegments || [],
        unavailableSegments: unifiedImpact.unavailableSegments || [],
        trafficImpact: unifiedImpact.trafficImpact,
        weatherImpact: unifiedImpact.weatherImpact,
        transportAvailability: unifiedImpact.transportStatus,
        totalWaitingTimeMinutes: cand.totalWaitingTimeMinutes || 0,
        walkingTimeMinutes: cand.walkingTimeMinutes || 0,
        transitTimeMinutes: cand.transitTimeMinutes || 0,
        transferCount: cand.transferCount || 0,
        transfers: cand.transferCount || 0,
        walking: {
          durationMinutes: cand.walkingTimeMinutes || 0,
          distanceKm: cand.totalDistanceKm || 0
        },
        cost: {
          rupees: cand.estimatedCostRupees || 0,
          isFree: cand.estimatedCostRupees === 0
        },
        estimatedCostRupees: cand.estimatedCostRupees || 0,
        totalDistanceKm: cand.totalDistanceKm || 0,
        reliability: unifiedImpact.reliabilityIndicator || 'LOW',
        uncertainty: unifiedImpact.uncertaintyLevel || 'LOW',
        primaryMode: cand.primaryMode,
        modesIncluded: cand.modesIncluded,
        transportModes: cand.modesIncluded || [cand.primaryMode],
        advisories: unifiedImpact.advisories || [],
        provenance: {
          tier: candTier,
          sourceTier: candTier,
          source: candSource,
          provider: candSource,
          confidence: rawCandProv?.confidence || 'MEDIUM',
          description: rawCandProv?.description || 'Deterministic timetable propagation with real-time context integration',
          contextTiers: unifiedImpact.dataTiers,
          contextProvider: unifiedImpact.provenance?.provider
        },
        limitations: 'Timetable baseline with real-time and environmental context adjustments. Deterministic candidate evaluation only.',
        segments
      };
    });

    const allDataTiers = new Set(['VERIFIED', 'ESTIMATED']);
    (evaluationContext.disruptions || []).forEach(d => {
      const tier = d.provenance?.sourceTier || d.provenance?.tier || d.sourceTier || d.provenance_tier || d.tier;
      if (tier) allDataTiers.add(tier);
    });
    (evaluationContext.trafficConditions || []).forEach(t => {
      const tier = t.provenance?.sourceTier || t.provenance?.tier || t.sourceTier || t.tier;
      if (tier) allDataTiers.add(tier);
    });
    if (evaluationContext.weatherContext?.provenance?.sourceTier) {
      allDataTiers.add(evaluationContext.weatherContext.provenance.sourceTier);
    } else if (evaluationContext.weatherContext?.sourceTier) {
      allDataTiers.add(evaluationContext.weatherContext.sourceTier);
    }
    (evaluationContext.availabilityRecords || []).forEach(a => {
      const tier = a.provenance?.sourceTier || a.provenance?.tier || a.sourceTier || a.tier;
      if (tier) allDataTiers.add(tier);
    });
    candidates.forEach(cand => {
      (cand.contextualImpact?.dataTiers || []).forEach(tier => allDataTiers.add(tier));
    });

    // 11. Run deterministic Route Constraint Filtering stage
    const filterResult = routeConstraintFilteringService.filterCandidates(candidates, {
      constraints,
      preferences,
      targetArrivalTime,
      context: evaluationContext
    });

    // Decorate candidates with deterministic constraint filtering results
    const evaluatedCandidates = candidates.map(cand => {
      const evalItem = filterResult.allEvaluations.find(e => e.candidateId === cand.id);
      return {
        ...cand,
        isAccepted: evalItem ? evalItem.isAccepted : true,
        filterStatus: evalItem ? evalItem.status : 'ACCEPTED',
        constraintViolations: evalItem ? evalItem.violations : [],
        rejectionReasonCodes: evalItem ? evalItem.reasonCodes : [],
        softPreferences: evalItem ? evalItem.softPreferences : null
      };
    });

    const includeRejected = req.body.includeRejected === true || req.query.includeRejected === 'true';
    const acceptedCandidates = evaluatedCandidates.filter(c => c.isAccepted);
    const outputCandidates = includeRejected ? evaluatedCandidates : acceptedCandidates;

    // 12. Run deterministic Route Comparison stage
    const comparisonResult = routeComparisonService.compareRoutes(outputCandidates, evaluationContext);

    // Decorate output candidates with structured comparison metrics
    const decoratedCandidates = outputCandidates.map(cand => {
      const compItem = comparisonResult.routes.find(r => r.journeyId === cand.id);
      const evalReasons = [
        ...(compItem ? compItem.strengths : []),
        ...(compItem ? compItem.weaknesses : []),
        ...(cand.advisories || [])
      ];

      return {
        ...cand,
        routeType: 'EVALUATED_ROUTE',
        deterministicScore: compItem ? compItem.deterministicScore : undefined,
        scoreBreakdown: compItem ? compItem.breakdown : undefined,
        rank: compItem ? compItem.rank : undefined,
        strengths: compItem ? compItem.strengths : [],
        weaknesses: compItem ? compItem.weaknesses : [],
        evaluationReasons: evalReasons,
        isTied: compItem ? compItem.isTied : false,
        tieBreakerReason: compItem ? compItem.tieBreakerReason : null,
        isDuplicate: compItem ? compItem.isDuplicate : false,
        duplicateOf: compItem ? compItem.duplicateOf : null,
        isNearDuplicate: compItem ? compItem.isNearDuplicate : false,
        nearDuplicateOf: compItem ? compItem.nearDuplicateOf : null
      };
    });

    // 13. Generate Alternate Routes for disrupted or affected journeys (or when alternatives requested)
    let alternateRoutes = [];
    const hasDisruptedCorridors = candidates.some(c =>
      !c.isFeasible ||
      (c.contextualImpact?.totalAdditionalDelayMinutes > 0) ||
      (c.contextualImpact?.affectedSegments?.length > 0) ||
      (c.contextualImpact?.unavailableSegments?.length > 0)
    );

    const shouldGenerateAlternates = req.body.includeAlternates !== false &&
      (hasDisruptedCorridors || req.body.includeAlternates === true || req.query?.includeAlternates === 'true' || rawCandidates.length > 0);

    if (shouldGenerateAlternates && rawCandidates.length > 0) {
      try {
        const altResult = await candidateRouteEngine.generateAlternatesForCandidates(rawCandidates, evaluationContext, {
          targetArrivalTime,
          constraints,
          preferences,
          date,
          dayOfWeek,
          maxAlternates: 4
        });
        const rawAlternates = altResult.alternates || [];

        if (rawAlternates.length > 0) {
          const alternateJourneys = rawAlternates.map(a => a.journey);
          const altComparison = routeComparisonService.compareRoutes(alternateJourneys, evaluationContext);

          alternateRoutes = rawAlternates.map(alt => {
            const aj = alt.journey;
            const aImpact = alt.contextualImpact || {};
            const compItem = altComparison.routes.find(r => r.journeyId === aj.id);

            const altBaselineDuration = Number(aj.totalDurationMinutes || 0);
            const altBaselineArrival = aj.estimatedArrivalTime || addMinutesToHHMM(aj.departureTime || '08:00', altBaselineDuration);
            const altUpdatedDuration = aImpact.updatedDurationMinutes || altBaselineDuration;
            const altUpdatedArrival = aImpact.updatedArrivalTime || addMinutesToHHMM(aj.departureTime || '08:00', altUpdatedDuration);

            const baselineEstimate = {
              durationMinutes: altBaselineDuration,
              departureTime: aj.departureTime || '08:00',
              estimatedArrivalTime: altBaselineArrival,
              waitingTimeMinutes: aj.totalWaitingTimeMinutes || 0,
              walkingTimeMinutes: aj.walkingTimeMinutes || 0,
              transitTimeMinutes: aj.transitTimeMinutes || 0,
              transferCount: aj.transferCount || 0,
              estimatedCostRupees: aj.estimatedCostRupees || 0,
              totalDistanceKm: aj.totalDistanceKm || 0
            };

            const contextualEstimate = {
              durationMinutes: altUpdatedDuration,
              departureTime: aj.departureTime || '08:00',
              estimatedArrivalTime: altUpdatedArrival,
              totalAdditionalDelayMinutes: aImpact.totalAdditionalDelayMinutes || 0,
              disruptionDelayMinutes: aImpact.disruptionImpact?.totalDelayMinutes || 0,
              trafficDelayMinutes: aImpact.trafficImpact?.addedTravelTimeMinutes || 0,
              waitingTimeMinutes: aj.totalWaitingTimeMinutes || 0,
              walkingTimeMinutes: aj.walkingTimeMinutes || 0,
              transitTimeMinutes: aj.transitTimeMinutes || 0,
              transferCount: aj.transferCount || 0,
              estimatedCostRupees: aj.estimatedCostRupees || 0,
              reliability: aImpact.reliabilityIndicator || 'LOW',
              uncertainty: aImpact.uncertaintyLevel || 'LOW',
              isFeasible: alt.isFeasible !== false,
              feasibilityReason: aImpact.feasibilityReason || 'OPERATIONAL'
            };

            const evalReasons = [
              ...(compItem ? compItem.strengths : []),
              ...(compItem ? compItem.weaknesses : []),
              `Alternate strategy: ${alt.alternateMetadata?.strategy || 'MODE_SHIFT'} (${alt.alternateMetadata?.reasonSummary || 'Alternate route to avoid disruption'})`
            ];

            return {
              id: aj.id,
              candidateId: aj.id,
              routeType: 'ALTERNATE_ROUTE',
              origin: aj.origin,
              destination: aj.destination,
              departureTime: aj.departureTime || '08:00',
              estimatedArrivalTime: altUpdatedArrival,
              totalDurationMinutes: altUpdatedDuration,
              estimatedTravelTimeMinutes: altUpdatedDuration,
              baselineEstimate,
              contextualEstimate,
              travelTimeEstimate: {
                baseline: baselineEstimate,
                contextual: contextualEstimate,
                totalDurationMinutes: altUpdatedDuration,
                additionalDelayMinutes: aImpact.totalAdditionalDelayMinutes || 0
              },
              disruptionImpact: {
                isAffected: Boolean(aImpact.disruptionImpact?.isAffected),
                totalDelayMinutes: aImpact.totalAdditionalDelayMinutes || 0,
                disruptionDelayMinutes: aImpact.disruptionImpact?.totalDelayMinutes || 0,
                trafficDelayMinutes: aImpact.trafficImpact?.addedTravelTimeMinutes || 0,
                affectedSegments: aImpact.affectedSegments || [],
                unavailableSegments: aImpact.unavailableSegments || [],
                advisories: aj.advisories || []
              },
              affectedSegments: aImpact.affectedSegments || [],
              unavailableSegments: aImpact.unavailableSegments || [],
              primaryMode: aj.primaryMode,
              modesIncluded: aj.modesIncluded,
              transportModes: aj.modesIncluded || [aj.primaryMode],
              transfers: aj.transferCount || 0,
              transferCount: aj.transferCount || 0,
              walking: {
                durationMinutes: aj.walkingTimeMinutes || 0,
                distanceKm: aj.walkingDistanceKm || 0
              },
              walkingTimeMinutes: aj.walkingTimeMinutes || 0,
              walkingDistanceKm: aj.walkingDistanceKm || 0,
              cost: {
                rupees: aj.estimatedCostRupees || 0,
                isFree: aj.estimatedCostRupees === 0
              },
              estimatedCostRupees: aj.estimatedCostRupees || 0,
              reliability: aImpact.reliabilityIndicator || 'LOW',
              uncertainty: aImpact.uncertaintyLevel || 'LOW',
              isFeasible: alt.isFeasible !== false,
              feasibilityReason: aImpact.feasibilityReason || 'OPERATIONAL',
              alternateMetadata: {
                ...alt.alternateMetadata,
                strategy: alt.alternateMetadata?.strategyType || alt.alternateMetadata?.strategy,
                strategyType: alt.alternateMetadata?.strategyType || alt.alternateMetadata?.strategy,
                reasonSummary: alt.alternateMetadata?.differenceReason || alt.alternateMetadata?.reasonSummary,
                differenceReason: alt.alternateMetadata?.differenceReason || alt.alternateMetadata?.reasonSummary
              },
              provenance: aj.provenance?.toJSON ? aj.provenance.toJSON() : aj.provenance,
              deterministicScore: compItem ? compItem.deterministicScore : undefined,
              scoreBreakdown: compItem ? compItem.breakdown : undefined,
              strengths: compItem ? compItem.strengths : [],
              weaknesses: compItem ? compItem.weaknesses : [],
              evaluationReasons: evalReasons,
              segments: aj.segments
            };
          });
        }
      } catch (altErr) {
        alternateRoutes = [];
      }
    }

    const weatherCond = evaluationContext.weatherContext?.condition ||
      (typeof evaluationContext.weatherContext === 'string' ? evaluationContext.weatherContext : 'clear');
    const trafficLvl = evaluationContext.trafficContext?.level ||
      (Array.isArray(evaluationContext.trafficConditions) && evaluationContext.trafficConditions.length > 0 ? 'congested' : 'normal');
    const dominantAvail = evaluationContext.availabilityContext?.status || 'AVAILABLE';

    const feasibleRoutes = decoratedCandidates.filter(c => c.isFeasible && c.isAccepted);
    const rejectedRoutes = filterResult.rejected.map(r => ({
      candidateId: r.candidateId,
      isAccepted: false,
      primaryReasonCode: r.primaryReasonCode,
      reasonCodes: r.reasonCodes,
      violations: r.violations,
      evaluationReasons: r.violations.map(v => v.message),
      metrics: r.evaluatedMetrics
    }));

    return success(res, {
      totalEvaluatedCount: evaluatedCandidates.length,
      candidateCount: decoratedCandidates.length,
      feasibleCandidateCount: feasibleRoutes.length,
      infeasibleCandidateCount: decoratedCandidates.filter(c => !c.isFeasible).length,
      acceptedCandidateCount: filterResult.summary.acceptedCount,
      rejectedCandidateCount: filterResult.summary.rejectedCount,
      feasibleRoutes,
      rejectedRoutes,
      alternateRoutes,
      candidates: decoratedCandidates,
      allCandidates: evaluatedCandidates,
      routeComparison: comparisonResult,
      rejectedCandidates: rejectedRoutes,
      filterSummary: filterResult.summary,
      routeIntelligence: {
        evaluatedRoutes: decoratedCandidates,
        feasibleRoutes,
        alternateRoutes,
        rejectedRoutes,
        comparison: comparisonResult,
        contextSummary: {
          weatherCondition: weatherCond,
          trafficLevel: trafficLvl,
          dominantTransportStatus: dominantAvail,
          activeDisruptionsCount: Array.isArray(evaluationContext.disruptions) ? evaluationContext.disruptions.length : 0,
          hasInfeasibleCandidates: evaluatedCandidates.some(c => !c.isFeasible)
        },
        provenanceSummary: comparisonResult.provenanceSummary,
        universalBestClaim: false,
        disclaimer: 'Deterministic route intelligence based on scheduled timetables, environmental context, and active transport availability. Not an AI recommendation engine.'
      },
      queryContext: {
        studentId,
        startingArea,
        collegeDestination: destination,
        departureTime: departureTime || '08:00',
        targetArrivalTime: targetArrivalTime || null,
        appliedConstraints: constraints,
        appliedPreferences: preferences
      },
      contextSummary: {
        weatherCondition: weatherCond,
        trafficLevel: trafficLvl,
        dominantTransportStatus: dominantAvail,
        activeDisruptionsCount: Array.isArray(evaluationContext.disruptions) ? evaluationContext.disruptions.length : 0,
        hasInfeasibleCandidates: evaluatedCandidates.some(c => !c.isFeasible),
        filterSummary: filterResult.summary
      },
      provenanceMetadata: {
        dataTiers: Array.from(allDataTiers),
        hasEstimatedData: allDataTiers.has('ESTIMATED'),
        hasUserReportedData: allDataTiers.has('USER_REPORTED'),
        hasVerifiedData: allDataTiers.has('VERIFIED'),
        hasSyntheticData: allDataTiers.has('SYNTHETIC'),
        limitations: 'Timetable estimates with real-time/forecasted environmental and transport context. Deterministic candidate evaluation only.'
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateCandidateJourneys
};
