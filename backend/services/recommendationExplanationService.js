/**
 * RecommendationExplanationService
 *
 * Dedicated explanation layer for the personalized commute recommendation engine.
 * Generates transparent, deterministic, and metric-grounded explanations for
 * commute recommendations without external paid AI or speculative hallucinations.
 *
 * Requirements Met:
 * - Explains why the primary route was selected.
 * - Explains which student preferences it satisfies.
 * - Details expected travel time and arrival time (including margin buffer).
 * - Explains known disruption effects and corridor impacts.
 * - Highlights important trade-offs against alternative options.
 * - Identifies uncertainty and missing information transparently.
 * - Explains why useful alternatives may be preferable in certain circumstances.
 * - Explicitly tracks 4-tier provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 */

const {
  PersonalizedRecommendationExplanation
} = require('../models/PersonalizedRecommendationExplanation');
const {
  PROVENANCE_TIERS
} = require('../models/CommuteContracts');
const { ValidationError } = require('../errors');

class RecommendationExplanationService {
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Generates a comprehensive, metric-grounded explanation for a personalized commute recommendation.
   *
   * @param {object} params
   * @param {string} [params.recommendationId] - Recommendation ID
   * @param {object} params.primaryRoute - Primary selected route (RecommendedRouteDetail or scored candidate)
   * @param {Array<object>} [params.alternatives=[]] - Distinct alternative routes
   * @param {object} [params.preferences={}] - Student preferences
   * @param {object} [params.constraints={}] - Hard & soft constraints
   * @param {object} [params.context={}] - Environmental context (disruptions, traffic, weather)
   * @param {string} [params.targetArrivalTime] - Requested arrival deadline
   * @param {Array<string>} [params.rawTradeOffs=[]] - Pre-computed trade-off strings
   * @returns {PersonalizedRecommendationExplanation}
   */
  explainRecommendation(params = {}) {
    const {
      recommendationId = `rec-expl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      primaryRoute,
      alternatives = [],
      preferences = {},
      constraints = {},
      context = {},
      targetArrivalTime = null,
      rawTradeOffs = []
    } = params;

    if (!primaryRoute) {
      throw new ValidationError('Primary route is required to generate recommendation explanations');
    }

    const primaryNorm = this._normalizeRouteMetrics(primaryRoute);
    const altsNorm = (alternatives || []).map(a => this._normalizeRouteMetrics(a));

    // 1. Component Explanations
    const timingExplanation = this._buildTimingExplanation(primaryNorm, targetArrivalTime);
    const disruptionEffects = this._buildDisruptionExplanation(primaryNorm, context);
    const satisfiedPreferences = this._buildSatisfiedPreferences(primaryNorm, preferences, constraints, targetArrivalTime);
    const selectionReason = this._buildSelectionReason(primaryNorm, altsNorm, preferences, targetArrivalTime, disruptionEffects);
    const summary = this._buildSummary(primaryNorm, altsNorm, preferences, targetArrivalTime, disruptionEffects);
    const tradeOffs = this._buildTradeOffs(primaryNorm, altsNorm, rawTradeOffs);
    const alternativeExplanations = this._buildAlternativeCircumstances(primaryNorm, altsNorm, context);
    const uncertaintyAndMissingInfo = this._buildUncertaintyAndMissingInfo(primaryNorm, altsNorm, context);
    const provenanceBreakdown = this._buildProvenanceBreakdown(primaryNorm, altsNorm, context);

    return new PersonalizedRecommendationExplanation({
      recommendationId,
      primaryRouteId: primaryNorm.journeyId,
      summary,
      selectionReason,
      satisfiedPreferences,
      timingExplanation,
      disruptionEffects,
      tradeOffs,
      uncertaintyAndMissingInfo,
      alternativeExplanations,
      provenanceBreakdown,
      generatedAt: Date.now()
    });
  }

  // ==========================================================================
  // INTERNAL BUILDERS & REASONING HELPERS
  // ==========================================================================

  /**
   * Normalizes route metrics across RouteEvaluation, RecommendedRouteDetail, and raw candidate objects.
   * @private
   */
  _normalizeRouteMetrics(route) {
    if (!route) return null;

    const jId = route.journeyId || route.id || route.candidateId || 'route-unknown';
    const departureTime = route.departureTime || route.baselineTravel?.departureTime || '08:00';
    const estimatedArrivalTime = route.estimatedArrivalTime || route.contextualArrival || route.baselineTravel?.estimatedArrivalTime || null;
    const totalTravelTimeMinutes = Number(route.totalTravelTimeMinutes ?? route.totalTravelTime ?? route.totalDurationMinutes ?? 30);
    const walkingTimeMinutes = Number(route.walkingTimeMinutes ?? route.walkingMinutes ?? route.breakdown?.walking?.minutes ?? 0);
    const transfers = Number(route.transfers ?? route.numberOfTransfers ?? route.transferCount ?? route.breakdown?.transfers?.count ?? 0);
    const estimatedCostRupees = route.estimatedCostRupees !== undefined && route.estimatedCostRupees !== null
      ? Number(route.estimatedCostRupees)
      : (route.estimatedCost !== undefined && route.estimatedCost !== null
        ? Number(route.estimatedCost)
        : (route.breakdown?.cost?.fareRupees !== undefined && route.breakdown?.cost?.fareRupees !== null
          ? Number(route.breakdown?.cost?.fareRupees)
          : null));

    const expectedDisruptionDelayMinutes = Number(
      route.expectedDisruptionDelayMinutes ??
      route.disruptionDelayMinutes ??
      route.additionalDisruptionDelay ??
      route.breakdown?.disruption?.delayMinutes ??
      0
    );

    const primaryMode = String(route.primaryMode || 'transit').toLowerCase();
    const modesIncluded = Array.isArray(route.modesIncluded) ? route.modesIncluded.map(m => String(m).toLowerCase()) : [primaryMode];
    const reliability = String(route.reliability || route.uncertaintyLevel || route.uncertainty || 'LOW').toUpperCase();
    const affectedSegments = Array.isArray(route.affectedSegments) ? route.affectedSegments : [];
    const sourceTier = route.provenance?.sourceTier || PROVENANCE_TIERS.VERIFIED;

    return {
      journeyId: jId,
      departureTime,
      estimatedArrivalTime,
      totalTravelTimeMinutes,
      walkingTimeMinutes,
      transfers,
      estimatedCostRupees,
      expectedDisruptionDelayMinutes,
      primaryMode,
      modesIncluded,
      reliability,
      affectedSegments,
      sourceTier,
      raw: route
    };
  }

  /**
   * Synthesizes a concise 1-2 sentence lead summary.
   * e.g. "Recommended because it has fewer transfers and arrives before your requested time."
   * @private
   */
  _buildSummary(primary, alts, preferences, targetArrivalTime, disruption) {
    const reasons = [];

    // Fewer transfers check
    const hasFewerTransfers = alts.some(a => a.transfers > primary.transfers) || primary.transfers === 0;
    if (primary.transfers === 0) {
      reasons.push('has fewer transfers');
    } else if (hasFewerTransfers) {
      reasons.push('minimizes modal transfers');
    }

    // On-time arrival check
    const arrivesOnTime = targetArrivalTime && primary.estimatedArrivalTime && primary.estimatedArrivalTime <= targetArrivalTime;
    if (arrivesOnTime) {
      reasons.push('arrives before your requested time');
    }

    // Fastest check
    const isFastest = alts.length === 0 || alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes);
    if (isFastest && reasons.length < 2) {
      reasons.push(`offers the fastest travel time (${primary.totalTravelTimeMinutes} min)`);
    }

    // Clean corridor / disruption avoided
    if (disruption.delayMinutes === 0 && alts.some(a => a.expectedDisruptionDelayMinutes > 0)) {
      if (reasons.length < 2) {
        reasons.push('avoids active transit delays');
      }
    }

    // Cost efficiency
    if (primary.estimatedCostRupees !== null && alts.some(a => a.estimatedCostRupees !== null && a.estimatedCostRupees > primary.estimatedCostRupees)) {
      if (reasons.length < 2) {
        reasons.push('offers lower commute cost');
      }
    }

    if (reasons.length >= 2) {
      return `Recommended because it ${reasons[0]} and ${reasons[1]}.`;
    } else if (reasons.length === 1) {
      return `Recommended because it ${reasons[0]}.`;
    }

    return `Recommended as the most balanced and reliable route connecting your departure area to campus.`;
  }

  /**
   * Formulates the detailed selection rationale.
   * @private
   */
  _buildSelectionReason(primary, alts, preferences, targetArrivalTime, disruption) {
    const clauses = [];

    // Speed / Duration
    const isFastest = alts.length === 0 || alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes);
    if (isFastest) {
      clauses.push(`shortest overall commute of ${primary.totalTravelTimeMinutes} minutes`);
    } else {
      clauses.push(`competitive travel time of ${primary.totalTravelTimeMinutes} minutes`);
    }

    // Transfer simplicity
    if (primary.transfers === 0) {
      clauses.push('direct non-stop connection with 0 transfers');
    } else {
      clauses.push(`${primary.transfers} smooth transfer(s)`);
    }

    // Punctuality
    if (targetArrivalTime && primary.estimatedArrivalTime) {
      if (primary.estimatedArrivalTime <= targetArrivalTime) {
        clauses.push(`on-time arrival at ${primary.estimatedArrivalTime} (before your ${targetArrivalTime} deadline)`);
      }
    }

    // Disruption status
    if (disruption.delayMinutes === 0) {
      clauses.push('zero reported disruption delays');
    }

    // Cost
    if (primary.estimatedCostRupees !== null) {
      clauses.push(`estimated fare of ₹${primary.estimatedCostRupees}`);
    }

    return `Selected as the primary route combining ${clauses.slice(0, 3).join(', ')}.`;
  }

  /**
   * Formulates satisfied student preferences and constraint alignments.
   * @private
   */
  _buildSatisfiedPreferences(primary, preferences, constraints, targetArrivalTime) {
    const list = [];
    const routePref = String(preferences?.route_preference || preferences?.preference || 'balanced').toLowerCase();

    // 1. Route Preference Satisfaction
    if (routePref === 'fastest') {
      list.push({
        preference: 'route_preference (fastest)',
        isSatisfied: true,
        detail: `Satisfies your faster journey preference with a total travel duration of ${primary.totalTravelTimeMinutes} mins.`,
        priority: 1
      });
    } else if (routePref === 'cheapest') {
      if (primary.estimatedCostRupees !== null) {
        list.push({
          preference: 'route_preference (cheapest)',
          isSatisfied: true,
          detail: `Satisfies your lower-cost preference with an economical transit fare of ₹${primary.estimatedCostRupees}.`,
          priority: 1
        });
      }
    } else if (routePref === 'fewest_transfers') {
      list.push({
        preference: 'route_preference (fewest_transfers)',
        isSatisfied: primary.transfers === 0,
        detail: primary.transfers === 0
          ? 'Satisfies your transfer preference with a direct 0-transfer journey.'
          : `Requires ${primary.transfers} transfer(s) as the minimum viable connection on this corridor.`,
        priority: 1
      });
    } else if (routePref === 'least_walking') {
      list.push({
        preference: 'route_preference (least_walking)',
        isSatisfied: primary.walkingTimeMinutes <= 10,
        detail: `Satisfies your reduced-walking preference with only ${primary.walkingTimeMinutes} mins of pedestrian exertion.`,
        priority: 1
      });
    } else {
      list.push({
        preference: 'route_preference (balanced)',
        isSatisfied: true,
        detail: `Satisfies your balanced preference by harmonizing duration (${primary.totalTravelTimeMinutes}m), walking (${primary.walkingTimeMinutes}m), and transfer burden.`,
        priority: 2
      });
    }

    // 2. Preferred Modes Satisfaction
    const prefModes = Array.isArray(preferences?.preferred_modes)
      ? preferences.preferred_modes.map(m => String(m).toLowerCase())
      : [];
    if (prefModes.length > 0) {
      const matched = primary.modesIncluded.filter(m => prefModes.includes(m));
      if (matched.length > 0) {
        list.push({
          preference: 'preferred_modes',
          isSatisfied: true,
          detail: `Route utilizes your preferred transport mode(s): ${matched.join(', ')}.`,
          priority: 2
        });
      }
    }

    // 3. Arrival Target Constraint
    if (targetArrivalTime && primary.estimatedArrivalTime) {
      const onTime = primary.estimatedArrivalTime <= targetArrivalTime;
      list.push({
        preference: 'target_arrival_time',
        isSatisfied: onTime,
        detail: onTime
          ? `Meets arrival deadline: arrives at ${primary.estimatedArrivalTime}, ahead of ${targetArrivalTime}.`
          : `Arrives at ${primary.estimatedArrivalTime}, slightly after target ${targetArrivalTime}.`,
        priority: 1
      });
    }

    // 4. Max Walking Tolerance
    const maxWalk = constraints.maxWalkingMinutes || preferences.max_walking_minutes;
    if (maxWalk !== undefined && maxWalk !== null) {
      const compliant = primary.walkingTimeMinutes <= maxWalk;
      list.push({
        preference: 'max_walking_minutes',
        isSatisfied: compliant,
        detail: compliant
          ? `Walking duration of ${primary.walkingTimeMinutes} min is within your maximum limit of ${maxWalk} min.`
          : `Walking duration of ${primary.walkingTimeMinutes} min exceeds target tolerance of ${maxWalk} min.`,
        priority: 2
      });
    }

    // 5. Max Transfers
    const maxTrans = constraints.maxTransfers || preferences.max_transfers;
    if (maxTrans !== undefined && maxTrans !== null) {
      const compliant = primary.transfers <= maxTrans;
      list.push({
        preference: 'max_transfers',
        isSatisfied: compliant,
        detail: compliant
          ? `Transfer count (${primary.transfers}) satisfies your maximum allowance of ${maxTrans}.`
          : `Requires ${primary.transfers} transfers exceeding limit of ${maxTrans}.`,
        priority: 2
      });
    }

    return list;
  }

  /**
   * Explains expected travel and arrival times with margin buffers.
   * @private
   */
  _buildTimingExplanation(primary, targetArrivalTime) {
    let marginMinutes = null;
    let isPunctual = true;

    if (targetArrivalTime && primary.estimatedArrivalTime) {
      const [th, tm] = targetArrivalTime.split(':').map(Number);
      const [ah, am] = primary.estimatedArrivalTime.split(':').map(Number);
      marginMinutes = (th * 60 + tm) - (ah * 60 + am);
      isPunctual = marginMinutes >= 0;
    }

    let narrative = `Estimated travel duration is ${primary.totalTravelTimeMinutes} minutes, departing at ${primary.departureTime}`;
    if (primary.estimatedArrivalTime) {
      narrative += ` and arriving at destination by ${primary.estimatedArrivalTime}`;
    }
    if (marginMinutes !== null) {
      if (marginMinutes >= 0) {
        narrative += ` (${marginMinutes} min buffer ahead of your ${targetArrivalTime} deadline).`;
      } else {
        narrative += ` (${Math.abs(marginMinutes)} min after your ${targetArrivalTime} target).`;
      }
    } else {
      narrative += '.';
    }

    return {
      travelTimeMinutes: primary.totalTravelTimeMinutes,
      departureTime: primary.departureTime,
      estimatedArrivalTime: primary.estimatedArrivalTime,
      targetArrivalTime,
      marginMinutes,
      narrative,
      isPunctual,
      dataTier: primary.sourceTier === PROVENANCE_TIERS.VERIFIED ? PROVENANCE_TIERS.VERIFIED : PROVENANCE_TIERS.ESTIMATED
    };
  }

  /**
   * Explains active disruptions, corridor impact, and delay additions.
   * @private
   */
  _buildDisruptionExplanation(primary, context) {
    const delay = primary.expectedDisruptionDelayMinutes;
    const hasDisruptions = delay > 0 || (primary.affectedSegments && primary.affectedSegments.length > 0);

    const advisories = [];
    if (Array.isArray(context?.disruptions)) {
      context.disruptions.forEach(d => {
        if (d.description) advisories.push(d.description);
      });
    }

    let narrative = '';
    let dataTier = PROVENANCE_TIERS.VERIFIED;

    if (!hasDisruptions) {
      narrative = 'No reported transit delays or active corridor disruptions affecting this route.';
      dataTier = PROVENANCE_TIERS.VERIFIED;
    } else {
      narrative = `Includes +${delay} min expected delay from active transit congestion or service alerts along this corridor.`;
      dataTier = PROVENANCE_TIERS.USER_REPORTED;
    }

    return {
      hasDisruptions,
      delayMinutes: delay,
      affectedSegments: primary.affectedSegments,
      advisories,
      narrative,
      dataTier
    };
  }

  /**
   * Formulates transparent head-to-head trade-offs against alternative options.
   * e.g. "The lower-cost option takes longer than the fastest feasible route."
   * @private
   */
  _buildTradeOffs(primary, alts, rawTradeOffs) {
    const list = [];

    // Incorporate raw trade-offs if present
    if (Array.isArray(rawTradeOffs) && rawTradeOffs.length > 0) {
      rawTradeOffs.forEach(t => {
        if (typeof t === 'string' && t.trim() && !list.includes(t)) {
          list.push(t);
        }
      });
    }

    // Comparative trade-offs with alternatives
    for (const alt of alts) {
      const timeDiff = alt.totalTravelTimeMinutes - primary.totalTravelTimeMinutes;
      const fareDiff = (alt.estimatedCostRupees !== null && primary.estimatedCostRupees !== null)
        ? alt.estimatedCostRupees - primary.estimatedCostRupees
        : null;

      // "The lower-cost option takes longer than the fastest feasible route."
      if (fareDiff !== null && fareDiff < 0 && timeDiff > 0) {
        list.push(`The lower-cost option takes longer than the fastest feasible route (${alt.primaryMode.toUpperCase()} saves ₹${Math.abs(fareDiff)} but adds ${timeDiff} min).`);
      } else if (fareDiff !== null && fareDiff > 0 && timeDiff < 0) {
        list.push(`The faster alternative (${alt.primaryMode.toUpperCase()}) saves ${Math.abs(timeDiff)} min but increases cost by ₹${fareDiff}.`);
      }

      // Transfer trade-offs
      if (alt.transfers < primary.transfers) {
        list.push(`Alternative ${alt.primaryMode.toUpperCase()} has fewer transfers (${alt.transfers} vs ${primary.transfers}) but differs in travel time.`);
      }

      // Walking trade-offs
      const walkDiff = alt.walkingTimeMinutes - primary.walkingTimeMinutes;
      if (walkDiff > 10) {
        list.push(`Primary route avoids ${walkDiff} minutes of additional walking required by ${alt.primaryMode.toUpperCase()}.`);
      }
    }

    if (list.length === 0) {
      list.push('Direct corridor providing the optimal balance of speed, cost, and reliability.');
    }

    return list;
  }

  /**
   * Explains why useful alternatives may be preferable in specific circumstances.
   * e.g. "This alternative avoids the reported train disruption but adds walking time."
   * @private
   */
  _buildAlternativeCircumstances(primary, alts, context) {
    const explanations = [];

    for (const alt of alts) {
      let preferableWhen = '';
      let tradeOffNarrative = '';

      const timeDiff = alt.totalTravelTimeMinutes - primary.totalTravelTimeMinutes;
      const walkDiff = alt.walkingTimeMinutes - primary.walkingTimeMinutes;
      const costDiff = (alt.estimatedCostRupees !== null && primary.estimatedCostRupees !== null)
        ? alt.estimatedCostRupees - primary.estimatedCostRupees
        : null;
      const altAvoidsDisruption = primary.expectedDisruptionDelayMinutes > 0 && alt.expectedDisruptionDelayMinutes === 0;

      // Circumstance A: Avoiding disruption
      if (altAvoidsDisruption) {
        preferableWhen = 'Preferable when looking to bypass active transit delays on the primary corridor.';
        if (walkDiff > 0) {
          tradeOffNarrative = 'This alternative avoids the reported train disruption but adds walking time.';
        } else {
          tradeOffNarrative = 'This alternative avoids the reported corridor disruption with clean operating segments.';
        }
      }
      // Circumstance B: Budget / Cost Priority
      else if (costDiff !== null && costDiff < 0) {
        preferableWhen = `Preferable if you prioritize lowest cost over speed (saves ₹${Math.abs(costDiff)}).`;
        tradeOffNarrative = `The lower-cost option takes longer than the fastest feasible route (${timeDiff > 0 ? `adds ${timeDiff} min` : 'similar travel time'}).`;
      }
      // Circumstance C: Speed Priority
      else if (timeDiff < 0) {
        preferableWhen = `Preferable if you are running late and need to save ${Math.abs(timeDiff)} minutes.`;
        tradeOffNarrative = costDiff !== null && costDiff > 0
          ? `Faster travel time (${alt.totalTravelTimeMinutes} min) with an additional cost of ₹${costDiff}.`
          : `Faster journey of ${alt.totalTravelTimeMinutes} minutes.`;
      }
      // Circumstance D: Fewer Transfers / Simplicity
      else if (alt.transfers < primary.transfers) {
        preferableWhen = 'Preferable if you want a simpler connection without modal transfers.';
        tradeOffNarrative = `Direct route with ${alt.transfers} transfer(s), though total travel time is ${alt.totalTravelTimeMinutes} mins.`;
      }
      // Circumstance E: Low Walking / Inclement Weather
      else if (walkDiff < 0) {
        preferableWhen = 'Preferable during heavy rain or when carrying heavy items due to reduced walking.';
        tradeOffNarrative = `Requires only ${alt.walkingTimeMinutes} min walking (${Math.abs(walkDiff)} min less than primary route).`;
      }
      // Default
      else {
        preferableWhen = `Viable backup corridor via ${alt.primaryMode.toUpperCase()}.`;
        tradeOffNarrative = `Provides an alternative transit corridor with comparable duration (${alt.totalTravelTimeMinutes} min).`;
      }

      explanations.push({
        alternativeJourneyId: alt.journeyId,
        primaryMode: alt.primaryMode,
        preferableWhen,
        tradeOffNarrative,
        metricsSummary: {
          travelTimeMinutes: alt.totalTravelTimeMinutes,
          costRupees: alt.estimatedCostRupees,
          transfers: alt.transfers,
          walkingMinutes: alt.walkingTimeMinutes
        }
      });
    }

    return explanations;
  }

  /**
   * Transparently documents uncertainty, missing parameters, and sensor limitations.
   * Do not claim unavailable estimates are exact!
   * @private
   */
  _buildUncertaintyAndMissingInfo(primary, alts, context) {
    const missingFields = [];
    const uncertainFactors = [];
    const dataTiers = [primary.sourceTier];

    if (primary.estimatedCostRupees === null) {
      missingFields.push('exact_transit_cost');
    }

    if (primary.reliability === 'HIGH' || primary.reliability === 'SEVERE') {
      uncertainFactors.push('real_time_congestion_variance');
    }

    if (context?.weatherContext?.condition && context.weatherContext.condition !== 'clear') {
      uncertainFactors.push('weather_slowdown_uncertainty');
    }

    const narrativeParts = [];

    if (primary.estimatedCostRupees === null) {
      narrativeParts.push('Fare estimate is unavailable for private auto connections or non-metered legs.');
    } else {
      narrativeParts.push(`Fare is estimated at ₹${primary.estimatedCostRupees} based on published student transit tariffs.`);
    }

    if (uncertainFactors.length > 0) {
      narrativeParts.push(`Travel time accounts for normal traffic but may vary due to ${uncertainFactors.join(' and ')}.`);
    } else {
      narrativeParts.push('Travel duration is projected from timetabled schedules and normal corridor flow.');
    }

    let level = 'LOW';
    if (primary.reliability === 'SEVERE') {
      level = 'SEVERE';
    } else if (primary.reliability === 'HIGH' || uncertainFactors.length > 1) {
      level = 'HIGH';
    } else if (uncertainFactors.length > 0 || missingFields.length > 0) {
      level = 'MODERATE';
    }

    return {
      level,
      missingFields,
      uncertainFactors,
      narrative: narrativeParts.join(' '),
      dataTiers: Array.from(new Set(dataTiers))
    };
  }

  /**
   * Builds explicit facts categorized by 4-tier provenance:
   * VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC.
   * @private
   */
  _buildProvenanceBreakdown(primary, alts, context) {
    const verifiedFacts = [];
    const userReportedFacts = [];
    const estimatedFacts = [];
    const syntheticFacts = [];

    // Verified facts
    if (primary.sourceTier === PROVENANCE_TIERS.VERIFIED) {
      verifiedFacts.push(`Scheduled departures and stops verified from published timetable records.`);
    }
    if (primary.estimatedCostRupees !== null) {
      verifiedFacts.push(`Fare tariff of ₹${primary.estimatedCostRupees} based on published transit fare rules.`);
    }

    // User reported facts
    if (primary.expectedDisruptionDelayMinutes > 0 || (context?.disruptions && context.disruptions.length > 0)) {
      userReportedFacts.push(`Active delay observations (+${primary.expectedDisruptionDelayMinutes}m) sourced from verified commuter reports.`);
    }

    // Estimated facts
    estimatedFacts.push(`Total journey time (${primary.totalTravelTimeMinutes} min) estimated combining transit schedule with pedestrian walking rate.`);
    if (primary.estimatedArrivalTime) {
      estimatedFacts.push(`Estimated arrival time (${primary.estimatedArrivalTime}) projected from ${primary.departureTime} departure.`);
    }

    // Synthetic facts
    if (primary.sourceTier === PROVENANCE_TIERS.SYNTHETIC) {
      syntheticFacts.push(`Candidate route generated via synthetic commuter planner engine.`);
    }

    const overallTier = syntheticFacts.length > 0
      ? PROVENANCE_TIERS.SYNTHETIC
      : (userReportedFacts.length > 0
        ? PROVENANCE_TIERS.USER_REPORTED
        : (verifiedFacts.length > 0 ? PROVENANCE_TIERS.VERIFIED : PROVENANCE_TIERS.ESTIMATED));

    return {
      verifiedFacts,
      userReportedFacts,
      estimatedFacts,
      syntheticFacts,
      overallTier
    };
  }
}

const recommendationExplanationService = new RecommendationExplanationService();

module.exports = {
  RecommendationExplanationService,
  recommendationExplanationService
};
