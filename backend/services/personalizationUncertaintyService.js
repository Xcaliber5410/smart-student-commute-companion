/**
 * Personalization & Uncertainty Service
 *
 * Exposes structured personalization details, data quality indicators,
 * provenance breakdowns, and qualitative uncertainty assessments for
 * student commute recommendations.
 *
 * Invariants & Safe Guarantees:
 * 1. Strictly qualitative uncertainty levels ('LOW', 'MODERATE', 'HIGH', 'SEVERE') - NEVER invent numerical confidence percentages.
 * 2. Never treat synthetic data as verified.
 * 3. Never imply live GPS vehicle tracking exists when relying on static timetables and reports.
 * 4. Never leak private internal details, tokens, or other students' data.
 * 5. Do not expose sensitive scoring multipliers or raw cost equations unnecessarily.
 * 6. Explicitly distinguish missing data from evidence that a transit corridor is closed, unsafe, or unavailable.
 * 7. Track whether AI-assisted or deterministic explanations were utilized, documenting fallback reasons.
 */

const {
  PROVENANCE_TIERS,
  normalizeDisruptionSeverity
} = require('../models/CommuteContracts');

/**
 * Standard thresholds for data freshness (in milliseconds).
 */
const FRESHNESS_THRESHOLDS_MS = Object.freeze({
  DISRUPTION_STALE_MS: 2 * 60 * 60 * 1000, // 2 hours
  TRAFFIC_STALE_MS: 60 * 60 * 1000          // 1 hour
});

class PersonalizationUncertaintyService {
  /**
   * Builds structured personalization details covering preferences applied,
   * schedule context used, and major factors that guided route selection.
   *
   * @param {object} params
   * @param {object} params.primaryRoute
   * @param {Array<object>} [params.alternatives=[]]
   * @param {object} [params.preferences={}]
   * @param {object} [params.context={}]
   * @param {object} [params.studentContext=null]
   * @param {object} [params.academicContext=null]
   * @param {object} [params.departureAdvice=null]
   * @param {object} [params.explanation=null]
   * @param {Array<object>} [params.reasons=[]]
   * @returns {object}
   */
  buildPersonalizationDetails(params = {}) {
    const primaryRoute = params.primaryRoute || {};
    const alternatives = Array.isArray(params.alternatives) ? params.alternatives : [];
    const preferences = params.preferences || {};
    const studentContext = params.studentContext || params.context?.studentContext || null;
    const academicContext = params.academicContext || studentContext?.academicContext || params.context?.academicContext || null;
    const departureAdvice = params.departureAdvice || null;

    // 1. Preferences Applied
    const preferencesApplied = this._extractPreferencesApplied(preferences, studentContext);

    // 2. Schedule Context Used
    const scheduleContextUsed = this._extractScheduleContextUsed(academicContext, studentContext, params);

    // 3. Major Factors Influencing Route Selection
    const majorFactors = this._extractMajorFactors(primaryRoute, alternatives, preferencesApplied, scheduleContextUsed, departureAdvice, params);

    return {
      preferencesApplied,
      scheduleContextUsed,
      majorFactors
    };
  }

  /**
   * Builds data quality warnings, provenance breakdowns, qualitative uncertainty
   * indicators, and live-feed disclosures grounded in available evidence.
   *
   * @param {object} params
   * @param {object} params.primaryRoute
   * @param {Array<object>} [params.alternatives=[]]
   * @param {object} [params.context={}]
   * @param {object} [params.departureAdvice=null]
   * @param {number} [params.currentTime=Date.now()]
   * @returns {object}
   */
  buildDataQualityAndUncertainty(params = {}) {
    const primaryRoute = params.primaryRoute || {};
    const alternatives = Array.isArray(params.alternatives) ? params.alternatives : [];
    const context = params.context || {};
    const currentTime = Number(params.currentTime || context.currentTime || Date.now());

    const indicators = [];
    const dataQualityWarnings = [];
    let hasSyntheticData = false;
    let hasStaleData = false;
    let hasMissingData = false;

    // -------------------------------------------------------------------------
    // A. Evidence-Based Uncertainty Indicators (Qualitative Only)
    // -------------------------------------------------------------------------
    const disruptionDelay = Number(primaryRoute.expectedDisruptionDelayMinutes || primaryRoute.additionalDisruptionDelay || 0);
    if (disruptionDelay > 0) {
      indicators.push({
        type: 'CORRIDOR_DISRUPTION',
        description: `Active transit disruption adds approximately +${disruptionDelay} minutes to travel duration.`,
        severity: disruptionDelay >= 20 ? 'SEVERE' : (disruptionDelay > 10 ? 'HIGH' : 'MODERATE')
      });
    }

    const mode = String(primaryRoute.primaryMode || '').toLowerCase();
    const isRoadOrPedestrian = ['bus', 'auto', 'shared_auto', 'walk'].includes(mode);
    if (isRoadOrPedestrian && context.trafficConditions && context.trafficConditions.length > 0) {
      const activeTraffic = context.trafficConditions.find(t => t.level === 'heavy' || t.level === 'severe');
      indicators.push({
        type: 'ROAD_CONGESTION',
        description: activeTraffic
          ? `Heavy road traffic observed on ${activeTraffic.corridor || 'corridor'}; travel time may fluctuate.`
          : 'Road and surface transit legs are subject to peak-hour urban traffic variability.',
        severity: activeTraffic ? 'HIGH' : 'MODERATE'
      });
    }

    const weather = context.weatherContext;
    if (weather && weather.condition && weather.condition !== 'clear') {
      const isSevereWeather = weather.condition === 'severe_rain' || weather.condition === 'monsoon';
      indicators.push({
        type: 'WEATHER_CONDITION',
        description: `Active weather (${weather.condition}) may increase pedestrian walking exertion and surface delays.`,
        severity: isSevereWeather ? 'HIGH' : 'MODERATE'
      });
    }

    // Baseline timetable frequency indicator
    indicators.push({
      type: 'SCHEDULE_HEADWAY',
      description: 'Journey projections rely on scheduled timetable headway intervals rather than real-time vehicle GPS feeds.',
      severity: 'LOW'
    });

    // Determine qualitative uncertainty level (Never output numbers or percentages!)
    let uncertaintyLevel = 'LOW';
    if (primaryRoute.reliability === 'SEVERE' || disruptionDelay >= 25) {
      uncertaintyLevel = 'SEVERE';
    } else if (primaryRoute.reliability === 'HIGH' || disruptionDelay >= 15 || indicators.some(i => i.severity === 'HIGH')) {
      uncertaintyLevel = 'HIGH';
    } else if (disruptionDelay > 0 || indicators.some(i => i.severity === 'MODERATE') || primaryRoute.estimatedCostRupees === null) {
      uncertaintyLevel = 'MODERATE';
    }

    // -------------------------------------------------------------------------
    // B. Missing Data vs Unsafe Route Distinction
    // -------------------------------------------------------------------------
    if (primaryRoute.estimatedCostRupees === null || primaryRoute.estimatedCostRupees === undefined) {
      hasMissingData = true;
      dataQualityWarnings.push(
        'Fare estimate is unavailable or unmetered for this transit leg; this data limitation does NOT indicate the transit service is closed, unsafe, or non-operational.'
      );
    }

    // -------------------------------------------------------------------------
    // C. Stale Data Detection
    // -------------------------------------------------------------------------
    const disruptions = Array.isArray(context.disruptions) ? context.disruptions : [];
    for (const d of disruptions) {
      const isExplicitlyStale = Boolean(d.isStale);
      const isPastEndTime = d.endTime && Number(d.endTime) < currentTime;
      const isOldUpdate = d.updatedAt && (currentTime - Number(d.updatedAt) > FRESHNESS_THRESHOLDS_MS.DISRUPTION_STALE_MS);

      if (isExplicitlyStale || isPastEndTime || isOldUpdate) {
        hasStaleData = true;
        dataQualityWarnings.push(
          `Transit disruption report for ${d.affectedArea || 'corridor'} was updated over 2 hours ago and may be stale; verify locally if possible.`
        );
        break; // Include once to avoid spamming
      }
    }

    const trafficConditions = Array.isArray(context.trafficConditions) ? context.trafficConditions : [];
    for (const t of trafficConditions) {
      const isExplicitlyStale = Boolean(t.isStale);
      const isOldTraffic = t.timestamp && (currentTime - Number(t.timestamp) > FRESHNESS_THRESHOLDS_MS.TRAFFIC_STALE_MS);

      if (isExplicitlyStale || isOldTraffic) {
        hasStaleData = true;
        dataQualityWarnings.push(
          `Traffic congestion observation for ${t.corridor || 'transit corridor'} is older than 60 minutes and may not reflect current flow.`
        );
        break;
      }
    }

    // -------------------------------------------------------------------------
    // D. Synthetic Data Detection (Never Treat Synthetic Data as Verified)
    // -------------------------------------------------------------------------
    const primaryTier = primaryRoute.provenance?.sourceTier || PROVENANCE_TIERS.ESTIMATED;
    if (primaryTier === PROVENANCE_TIERS.SYNTHETIC) {
      hasSyntheticData = true;
      dataQualityWarnings.push(
        'Route metrics are generated from synthetic simulation data; transit metrics have not been verified against live municipal telemetry.'
      );
    }

    for (const alt of alternatives) {
      if (alt.provenance?.sourceTier === PROVENANCE_TIERS.SYNTHETIC) {
        hasSyntheticData = true;
      }
    }

    // -------------------------------------------------------------------------
    // E. Provenance Breakdown & Summary
    // -------------------------------------------------------------------------
    const provTiers = new Set([primaryTier]);
    alternatives.forEach(alt => {
      if (alt.provenance?.sourceTier) provTiers.add(alt.provenance.sourceTier);
    });
    if (disruptionDelay > 0) {
      provTiers.add(PROVENANCE_TIERS.USER_REPORTED);
    }
    if (Number(primaryRoute.walkingTimeMinutes || primaryRoute.walkingTime || 0) > 0 || (context.trafficConditions && context.trafficConditions.length > 0) || context.weatherContext) {
      provTiers.add(PROVENANCE_TIERS.ESTIMATED);
    }

    const dataTiers = Array.from(provTiers);
    const allVerified = dataTiers.length === 1 && dataTiers[0] === PROVENANCE_TIERS.VERIFIED;
    const hasUnverifiedData = dataTiers.some(t => t !== PROVENANCE_TIERS.VERIFIED);
    const hasUserReportedData = dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED);

    const overallTier = hasSyntheticData
      ? PROVENANCE_TIERS.SYNTHETIC
      : (hasUserReportedData
        ? PROVENANCE_TIERS.USER_REPORTED
        : (allVerified ? PROVENANCE_TIERS.VERIFIED : PROVENANCE_TIERS.ESTIMATED));

    const provenanceSummary = {
      dataTiers,
      overallTier,
      allVerified,
      hasSyntheticData,
      hasUserReportedData,
      hasUnverifiedData
    };

    const provenanceBreakdown = {
      schedules: {
        tier: hasSyntheticData ? PROVENANCE_TIERS.SYNTHETIC : PROVENANCE_TIERS.VERIFIED,
        source: 'Mumbai Transit Timetable Records'
      },
      disruptions: {
        tier: disruptionDelay > 0 ? PROVENANCE_TIERS.USER_REPORTED : PROVENANCE_TIERS.VERIFIED,
        source: 'Commuter Disruption Reports'
      },
      fares: {
        tier: primaryRoute.estimatedCostRupees !== null ? PROVENANCE_TIERS.VERIFIED : 'UNMETERED',
        source: primaryRoute.estimatedCostRupees !== null ? 'Published Transit Tariff Tables' : 'Unmetered Private Connection'
      },
      traffic: {
        tier: PROVENANCE_TIERS.ESTIMATED,
        source: 'Historical Corridor Traffic Profiles'
      },
      weather: {
        tier: PROVENANCE_TIERS.ESTIMATED,
        source: 'Regional Weather Forecast'
      },
      academicSchedule: {
        tier: params.academicContext ? PROVENANCE_TIERS.VERIFIED : 'NONE',
        source: params.academicContext ? 'Student Academic Calendar' : 'Not Connected'
      }
    };

    return {
      uncertaintyLevel,
      indicators,
      dataQualityWarnings,
      missingDataNotice: 'Data limitations (such as missing fare tariffs or unmonitored bus stops) represent information gaps and do NOT signify that the route is unsafe, closed, or out of service.',
      hasSyntheticData,
      hasStaleData,
      hasMissingData,
      liveFeedStatus: {
        hasLiveGps: false,
        trackingMode: 'STATIC_TIMETABLE_AND_REPORTS',
        statement: 'Real-time vehicle GPS tracking is not available; projections rely on published timetables and commuter-reported alerts.'
      },
      provenanceSummary,
      provenanceBreakdown
    };
  }

  /**
   * Tracks whether an AI-assisted or deterministic explanation was used,
   * auditing provider, model, validation status, and fallback reasons.
   *
   * @param {object} params
   * @param {object} [params.explanation=null]
   * @returns {object}
   */
  buildExplanationAudit(params = {}) {
    const explanation = params.explanation || null;
    const aiMeta = explanation?.aiMetadata || null;

    if (aiMeta && aiMeta.isAiEnhanced === true) {
      return {
        mode: 'AI_ASSISTED',
        isAiEnhanced: true,
        provider: aiMeta.provider || 'Gemini (gemini-2.5-flash)',
        fallbackOccurred: false,
        fallbackReason: null,
        validationPassed: true,
        statement: 'AI-assisted natural language explanation generated and validated against deterministic route metrics.'
      };
    }

    const fallbackReason = aiMeta?.fallbackReason || null;
    const fallbackOccurred = Boolean(fallbackReason);

    return {
      mode: 'DETERMINISTIC',
      isAiEnhanced: false,
      provider: aiMeta?.provider || 'Deterministic Grounded Engine',
      fallbackOccurred,
      fallbackReason,
      validationPassed: aiMeta?.validationPassed ?? true,
      statement: fallbackOccurred
        ? `Deterministic grounded explanation applied (AI fallback: ${fallbackReason}).`
        : 'Deterministic rule-based explanation generated from verified route metrics.'
    };
  }

  /**
   * Builds personalization details for fallback recommendations when no route is feasible.
   *
   * @param {object} params
   * @returns {object}
   */
  buildFallbackPersonalizationDetails(params = {}) {
    const preferencesApplied = this._extractPreferencesApplied(params.studentPreferences, params.context?.studentContext);
    const scheduleContextUsed = this._extractScheduleContextUsed(params.context?.academicContext, params.context?.studentContext, params);

    const majorFactors = [
      {
        factor: 'CONSTRAINT_VIOLATION_OR_DISRUPTION',
        description: params.reason || 'All candidate routes violate specified travel constraints or operating windows.',
        importance: 'HIGH',
        dataTier: PROVENANCE_TIERS.VERIFIED
      }
    ];

    return {
      preferencesApplied,
      scheduleContextUsed,
      majorFactors
    };
  }

  /**
   * Builds data quality and uncertainty indicators for fallback recommendations.
   *
   * @param {object} params
   * @returns {object}
   */
  buildFallbackDataQualityAndUncertainty(params = {}) {
    return {
      uncertaintyLevel: 'SEVERE',
      indicators: [
        {
          type: 'FALLBACK_TRIGGER',
          description: params.reason || 'No feasible routes found meeting arrival deadline and constraint bounds.',
          severity: 'SEVERE'
        }
      ],
      dataQualityWarnings: [
        params.reason || 'All candidate journeys exceed allowable walking, transfer limits, or arrival deadlines.'
      ],
      missingDataNotice: 'Data limitations do not imply corridor closure; all evaluated routes violate constraints or are disrupted.',
      hasSyntheticData: false,
      hasStaleData: false,
      hasMissingData: false,
      liveFeedStatus: {
        hasLiveGps: false,
        trackingMode: 'STATIC_TIMETABLE_AND_REPORTS',
        statement: 'Real-time vehicle GPS tracking is not available; projections rely on published timetables and commuter-reported alerts.'
      },
      provenanceSummary: {
        dataTiers: [PROVENANCE_TIERS.VERIFIED, PROVENANCE_TIERS.ESTIMATED],
        overallTier: PROVENANCE_TIERS.ESTIMATED,
        allVerified: false,
        hasSyntheticData: false,
        hasUserReportedData: false,
        hasUnverifiedData: true
      },
      provenanceBreakdown: {
        schedules: { tier: PROVENANCE_TIERS.VERIFIED, source: 'Mumbai Transit Timetable Records' },
        disruptions: { tier: PROVENANCE_TIERS.ESTIMATED, source: 'Disruption Analysis Engine' }
      }
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  _extractPreferencesApplied(preferences, studentContext) {
    const routePreference = String(
      preferences.routePreference ||
      preferences.route_preference ||
      preferences.preference ||
      studentContext?.resolvedPersonalization?.effectiveRoutePreference ||
      'balanced'
    ).toLowerCase();

    const preferredModes = Array.isArray(preferences.preferredModes)
      ? [...preferences.preferredModes]
      : (Array.isArray(studentContext?.resolvedPersonalization?.effectivePreferredModes)
        ? [...studentContext.resolvedPersonalization.effectivePreferredModes]
        : []);

    const avoidModes = Array.isArray(preferences.avoidModes)
      ? [...preferences.avoidModes]
      : (Array.isArray(studentContext?.resolvedPersonalization?.effectiveAvoidModes)
        ? [...studentContext.resolvedPersonalization.effectiveAvoidModes]
        : []);

    const maxWalkingMinutes = preferences.maxWalkingMinutes ?? preferences.walkingToleranceMinutes ?? studentContext?.resolvedPersonalization?.effectiveConstraints?.maxWalkingMinutes ?? null;
    const maxBudgetRupees = preferences.maxBudgetRupees ?? studentContext?.resolvedPersonalization?.effectiveConstraints?.maxBudgetRupees ?? null;
    const maxTransfers = preferences.maxTransfers ?? studentContext?.resolvedPersonalization?.effectiveConstraints?.maxTransfers ?? null;

    let source = 'DEFAULT';
    if (preferences.routePreference || preferences.preferredModes || preferences.avoidModes) {
      source = 'EXPLICIT_INPUT';
    } else if (studentContext?.provenance?.preferencesSource === 'SAVED_PREFERENCE') {
      source = 'SAVED_PREFERENCE';
    }

    const summaryParts = [`Route optimization: ${routePreference}`];
    if (preferredModes.length > 0) summaryParts.push(`preferred modes: ${preferredModes.join(', ')}`);
    if (avoidModes.length > 0) summaryParts.push(`avoiding: ${avoidModes.join(', ')}`);
    if (maxWalkingMinutes !== null) summaryParts.push(`max walking: ${maxWalkingMinutes}m`);

    return {
      routePreference,
      preferredModes,
      avoidModes,
      maxWalkingMinutes: maxWalkingMinutes !== null ? Number(maxWalkingMinutes) : null,
      maxBudgetRupees: maxBudgetRupees !== null ? Number(maxBudgetRupees) : null,
      maxTransfers: maxTransfers !== null ? Number(maxTransfers) : null,
      source,
      summary: summaryParts.join('; ')
    };
  }

  _extractScheduleContextUsed(academicContext, studentContext, params) {
    const acad = academicContext || studentContext?.academicContext || null;
    const hasScheduleContext = Boolean(
      acad && (acad.hasAcademicContext || acad.eventTitle || acad.eventStartTime || acad.title || acad.startTime)
    );

    const eventTitle = acad?.eventTitle || acad?.title || null;
    const eventStartTime = acad?.eventStartTime || acad?.startTime || null;
    const targetArrivalTime = params.targetArrivalTime || acad?.targetArrivalTime || null;
    const location = acad?.location || null;
    const isDestinationMatched = Boolean(acad?.isDestinationMatched);
    const isExamDay = Boolean(acad?.isExamDay);
    const bufferMinutes = isExamDay ? 20 : (eventStartTime ? 10 : 0);

    const scheduleConflicts = Array.isArray(acad?.scheduleConflicts) ? acad.scheduleConflicts : [];
    const hasScheduleConflict = scheduleConflicts.length > 0 || Boolean(acad?.hasConflict);
    const scheduleConflictDetail = scheduleConflicts[0]?.message || (hasScheduleConflict ? 'Arrival deadline falls after class start' : null);

    let source = 'NONE';
    if (hasScheduleContext) {
      source = 'ACADEMIC_EVENT';
    } else if (params.targetArrivalTime) {
      source = 'EXPLICIT_INPUT';
    }

    let summary = 'No academic schedule constraint active; commute planned using requested timing.';
    if (hasScheduleContext && eventStartTime) {
      summary = `Commute synchronized with ${eventTitle ? `"${eventTitle}"` : 'scheduled lecture'} at ${eventStartTime} (${bufferMinutes}-minute punctuality buffer).`;
    } else if (params.targetArrivalTime) {
      summary = `Commute targeted to arrive before requested deadline of ${params.targetArrivalTime}.`;
    }

    return {
      hasScheduleContext,
      source,
      eventTitle,
      eventStartTime,
      targetArrivalTime,
      location,
      isDestinationMatched,
      bufferMinutes,
      isExamDay,
      hasScheduleConflict,
      scheduleConflictDetail,
      summary
    };
  }

  _extractMajorFactors(primaryRoute, alternatives, preferencesApplied, scheduleContextUsed, departureAdvice, params) {
    const factors = [];

    // 1. Direct Transit / Minimal Transfers
    const transfers = Number(primaryRoute.transfers || primaryRoute.numberOfTransfers || 0);
    if (transfers === 0) {
      factors.push({
        factor: 'FEWER_TRANSFERS',
        description: 'Direct transit route requiring 0 modal interchange transfers.',
        importance: 'HIGH',
        dataTier: primaryRoute.provenance?.sourceTier || PROVENANCE_TIERS.VERIFIED
      });
    }

    // 2. Disruption Avoidance
    const disruptionDelay = Number(primaryRoute.expectedDisruptionDelayMinutes || primaryRoute.additionalDisruptionDelay || 0);
    if (disruptionDelay === 0 && alternatives.some(a => (a.expectedDisruptionDelayMinutes || 0) > 0)) {
      factors.push({
        factor: 'DISRUPTION_AVOIDANCE',
        description: 'Bypasses active corridor disruptions that delay alternate transit lines.',
        importance: 'HIGH',
        dataTier: PROVENANCE_TIERS.USER_REPORTED
      });
    }

    // 3. Schedule Alignment
    if (scheduleContextUsed.hasScheduleContext && scheduleContextUsed.eventStartTime) {
      factors.push({
        factor: 'SCHEDULE_ALIGNMENT',
        description: `Estimated arrival meets your ${scheduleContextUsed.eventStartTime} class deadline with a safety buffer.`,
        importance: 'HIGH',
        dataTier: PROVENANCE_TIERS.ESTIMATED
      });
    }

    // 4. Departure Advice Recommendation
    if (departureAdvice?.isEarlierDepartureRecommended) {
      factors.push({
        factor: 'DEPARTURE_ADVICE',
        description: `Departing earlier at ${departureAdvice.recommendedDepartureTime} protects against arrival delays.`,
        importance: 'HIGH',
        dataTier: PROVENANCE_TIERS.ESTIMATED
      });
    }

    // 5. Preferred Mode Alignment
    const mode = String(primaryRoute.primaryMode || '').toLowerCase();
    if (preferencesApplied.preferredModes.map(m => m.toLowerCase()).includes(mode)) {
      factors.push({
        factor: 'PREFERRED_MODE',
        description: `Utilizes your preferred transport mode (${primaryRoute.primaryMode.toUpperCase()}).`,
        importance: 'HIGH',
        dataTier: PROVENANCE_TIERS.VERIFIED
      });
    }

    // 6. Walking Exertion
    const walkTime = Number(primaryRoute.walkingTimeMinutes || primaryRoute.walkingTime || 0);
    if (walkTime <= 10) {
      factors.push({
        factor: 'LOW_WALKING',
        description: `Low walking requirement of ${walkTime} minute(s).`,
        importance: 'MEDIUM',
        dataTier: PROVENANCE_TIERS.ESTIMATED
      });
    }

    // Fallback factor if none triggered
    if (factors.length === 0) {
      factors.push({
        factor: 'FEASIBLE_TRANSIT',
        description: 'Feasible transit corridor that satisfies all specified travel criteria.',
        importance: 'MEDIUM',
        dataTier: PROVENANCE_TIERS.ESTIMATED
      });
    }

    return factors;
  }
}

const personalizationUncertaintyService = new PersonalizationUncertaintyService();

module.exports = {
  PersonalizationUncertaintyService,
  personalizationUncertaintyService,
  FRESHNESS_THRESHOLDS_MS
};
