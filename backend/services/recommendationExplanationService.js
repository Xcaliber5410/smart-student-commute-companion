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
 * - Explains why an earlier departure may help.
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

/**
 * Converts a 24-hour HH:MM time string to user-friendly "H:MM AM/PM" format.
 * e.g. "09:00" -> "9:00 AM", "14:30" -> "2:30 PM".
 * @param {string|null} timeHHMM
 * @returns {string}
 */
function formatTimeAMPM(timeHHMM) {
  if (!timeHHMM || typeof timeHHMM !== 'string' || !timeHHMM.includes(':')) {
    return timeHHMM || '';
  }
  const [hStr, mStr] = timeHHMM.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return timeHHMM;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

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
   * @param {object} [params.academicContext] - Academic schedule context
   * @param {object} [params.studentContext] - Full student context
   * @param {object} [params.departureAdvice] - Disruption-aware departure advice
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
      targetArrivalTime: explicitTargetArrivalTime = null,
      rawTradeOffs = [],
      academicContext: directAcademicContext = null,
      studentContext = null,
      departureAdvice: directDepartureAdvice = null
    } = params;

    const academicContext = directAcademicContext ||
      context?.academicContext ||
      context?.studentContext?.academicContext ||
      studentContext?.academicContext ||
      null;

    const departureAdvice = directDepartureAdvice ||
      context?.departureAdvice ||
      null;

    let targetArrivalTime = explicitTargetArrivalTime;
    if (!targetArrivalTime && academicContext?.isDestinationMatched && academicContext?.nextClass?.startTimeHHMM) {
      targetArrivalTime = academicContext.nextClass.startTimeHHMM;
    }

    if (!primaryRoute) {
      throw new ValidationError('Primary route is required to generate recommendation explanations');
    }

    const primaryNorm = this._normalizeRouteMetrics(primaryRoute);
    const altsNorm = (alternatives || []).map(a => this._normalizeRouteMetrics(a));

    // 1. Earlier departure evaluation
    const earlierDepartureExplanation = this._buildEarlierDepartureExplanation(
      primaryNorm,
      targetArrivalTime,
      academicContext,
      departureAdvice,
      context
    );

    // 2. Component Explanations
    const timingExplanation = this._buildTimingExplanation(primaryNorm, targetArrivalTime, academicContext, earlierDepartureExplanation);
    const disruptionEffects = this._buildDisruptionExplanation(primaryNorm, context);
    const satisfiedPreferences = this._buildSatisfiedPreferences(primaryNorm, altsNorm, preferences, constraints, targetArrivalTime, academicContext);
    const selectionReason = this._buildSelectionReason(primaryNorm, altsNorm, preferences, targetArrivalTime, disruptionEffects, academicContext);
    const summary = this._buildSummary(primaryNorm, altsNorm, preferences, targetArrivalTime, disruptionEffects, academicContext, earlierDepartureExplanation);
    const tradeOffs = this._buildTradeOffs(primaryNorm, altsNorm, rawTradeOffs);
    const alternativeExplanations = this._buildAlternativeCircumstances(primaryNorm, altsNorm, context);
    const uncertaintyAndMissingInfo = this._buildUncertaintyAndMissingInfo(primaryNorm, altsNorm, context);
    const provenanceBreakdown = this._buildProvenanceBreakdown(primaryNorm, altsNorm, context);

    const academicScheduleExplanation = academicContext && academicContext.hasAcademicContext ? {
      hasAcademicContext: true,
      eventTitle: academicContext.nextClass?.title || null,
      eventStartTime: academicContext.nextClass?.startTimeHHMM || null,
      location: academicContext.nextClass?.location || null,
      isDestinationMatched: Boolean(academicContext.isDestinationMatched),
      scheduleConflicts: academicContext.scheduleConflicts || [],
      narrative: academicContext.isDestinationMatched
        ? `Commute aligned with scheduled ${academicContext.nextClass?.eventType || 'class'} '${academicContext.nextClass?.title}' starting at ${academicContext.nextClass?.startTimeHHMM}.`
        : (academicContext.nextClass
          ? `Class '${academicContext.nextClass.title}' location (${academicContext.nextClass.location || 'unspecified'}) does not match commute destination; no destination connection inferred.`
          : 'Academic events present in calendar.')
    } : null;

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
      academicScheduleExplanation,
      earlierDepartureExplanation,
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
   * Synthesizes a concise 1-2 sentence lead summary grounded strictly in actual data.
   * e.g. "Recommended because this route has fewer transfers and is estimated to arrive before your 9:00 AM class."
   * @private
   */
  _buildSummary(primary, alts, preferences, targetArrivalTime, disruption, academicContext, earlierDeparture) {
    const reasons = [];

    // 1. Fewer transfers check
    // Must be supported by actual candidate data!
    const hasFewerTransfers = alts.length > 0 && alts.some(a => a.transfers > primary.transfers);
    if (hasFewerTransfers) {
      reasons.push('this route has fewer transfers');
    } else if (primary.transfers === 0 && alts.length > 0 && alts.every(a => a.transfers === 0)) {
      reasons.push('this route provides a direct 0-transfer connection');
    }

    // 2. Schedule and deadline alignment check
    // Must be supported by actual schedule data and route arrival!
    const hasMatchedClass = academicContext?.nextClass && academicContext?.isDestinationMatched;
    const classTime = hasMatchedClass ? academicContext.nextClass.startTimeHHMM : null;
    const arrivesBeforeClass = classTime && primary.estimatedArrivalTime && primary.estimatedArrivalTime <= classTime;

    if (arrivesBeforeClass) {
      const timeFormatted = formatTimeAMPM(classTime);
      const eventType = academicContext.nextClass.eventType || 'class';
      const title = academicContext.nextClass.title;
      const titleClause = title && title.toLowerCase() !== 'class' && title.toLowerCase() !== 'lecture'
        ? ` ('${title}')`
        : '';
      reasons.push(`is estimated to arrive before your ${timeFormatted} ${eventType}${titleClause}`);
    } else if (targetArrivalTime && primary.estimatedArrivalTime && primary.estimatedArrivalTime <= targetArrivalTime) {
      reasons.push('arrives before your requested time');
    }

    // 3. Travel time / Duration check
    // Invariant: Never claim a route is fastest unless the evaluated candidates support that conclusion!
    const isStrictlyFastest = alts.length > 0 && alts.every(a => a.totalTravelTimeMinutes > primary.totalTravelTimeMinutes);
    const isTiedFastest = alts.length > 0 && alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes) && alts.some(a => a.totalTravelTimeMinutes === primary.totalTravelTimeMinutes);
    if (isStrictlyFastest && reasons.length < 2) {
      reasons.push(`offers the fastest travel time (${primary.totalTravelTimeMinutes} min)`);
    } else if (isTiedFastest && reasons.length < 2) {
      reasons.push(`shares the lowest travel duration (${primary.totalTravelTimeMinutes} min)`);
    } else if (alts.length === 0 && reasons.length < 2) {
      reasons.push(`provides an estimated travel time of ${primary.totalTravelTimeMinutes} min`);
    }

    // 4. Disruption avoidance check
    if (disruption.delayMinutes === 0 && alts.length > 0 && alts.some(a => a.expectedDisruptionDelayMinutes > 0)) {
      if (reasons.length < 2) {
        reasons.push('avoids active transit delays');
      }
    }

    // 5. Cost efficiency check
    if (primary.estimatedCostRupees !== null && alts.length > 0 && alts.every(a => a.estimatedCostRupees === null || a.estimatedCostRupees >= primary.estimatedCostRupees) && alts.some(a => a.estimatedCostRupees !== null && a.estimatedCostRupees > primary.estimatedCostRupees)) {
      if (reasons.length < 2) {
        reasons.push('offers lower commute cost');
      }
    }

    // Combine reasons cleanly
    if (reasons.length >= 2) {
      const r0 = reasons[0].startsWith('this route ') ? reasons[0] : `this route ${reasons[0]}`;
      const r1 = reasons[1];
      return `Recommended because ${r0} and ${r1}.`;
    } else if (reasons.length === 1) {
      const r0 = reasons[0].startsWith('this route ') ? reasons[0] : `this route ${reasons[0]}`;
      return `Recommended because ${r0}.`;
    }

    return `Recommended as the most balanced and reliable route connecting your departure area to campus.`;
  }

  /**
   * Formulates the detailed selection rationale.
   * @private
   */
  _buildSelectionReason(primary, alts, preferences, targetArrivalTime, disruption, academicContext) {
    const clauses = [];

    // Speed / Duration - only claim shortest if candidates actually prove it!
    const isStrictlyFastest = alts.length > 0 && alts.every(a => a.totalTravelTimeMinutes > primary.totalTravelTimeMinutes);
    const isTiedFastest = alts.length > 0 && alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes);
    if (isStrictlyFastest) {
      clauses.push(`shortest overall commute of ${primary.totalTravelTimeMinutes} minutes among evaluated routes`);
    } else if (isTiedFastest && alts.length > 0) {
      clauses.push(`tied for shortest commute at ${primary.totalTravelTimeMinutes} minutes`);
    } else {
      clauses.push(`competitive travel time of ${primary.totalTravelTimeMinutes} minutes`);
    }

    // Transfer simplicity
    const hasFewerTransfers = alts.length > 0 && alts.some(a => a.transfers > primary.transfers);
    if (primary.transfers === 0) {
      clauses.push('direct non-stop connection with 0 transfers');
    } else if (hasFewerTransfers) {
      clauses.push(`${primary.transfers} transfer(s), fewer than alternative routes`);
    } else {
      clauses.push(`${primary.transfers} smooth transfer(s)`);
    }

    // Punctuality & schedule alignment
    if (academicContext?.nextClass && academicContext?.isDestinationMatched) {
      const classTime = academicContext.nextClass.startTimeHHMM;
      if (primary.estimatedArrivalTime && primary.estimatedArrivalTime <= classTime) {
        clauses.push(`estimated arrival at ${primary.estimatedArrivalTime} before your ${formatTimeAMPM(classTime)} class`);
      }
    } else if (targetArrivalTime && primary.estimatedArrivalTime) {
      if (primary.estimatedArrivalTime <= targetArrivalTime) {
        clauses.push(`on-time arrival at ${primary.estimatedArrivalTime} (before your ${targetArrivalTime} deadline)`);
      }
    }

    // Disruption status
    if (disruption.delayMinutes === 0) {
      clauses.push('zero reported disruption delays');
    } else {
      clauses.push(`buffered for +${disruption.delayMinutes}m expected disruption delay`);
    }

    // Cost
    if (primary.estimatedCostRupees !== null) {
      clauses.push(`estimated fare of ₹${primary.estimatedCostRupees}`);
    }

    return `Selected as the primary route combining ${clauses.slice(0, 3).join(', ')}.`;
  }

  /**
   * Explains why an earlier departure may help.
   * Grounded in disruption delays, required arrival buffers, and schedule deadlines.
   *
   * @param {object} primary - Normalized primary route
   * @param {string|null} targetArrivalTime - Target arrival deadline
   * @param {object|null} academicContext - Resolved academic schedule context
   * @param {object|null} departureAdvice - Pre-computed departure advice
   * @param {object} context - Context containing disruptions/weather
   * @returns {object} earlierDepartureExplanation
   * @private
   */
  _buildEarlierDepartureExplanation(primary, targetArrivalTime, academicContext, departureAdvice, context) {
    // Case 1: Pre-computed DepartureAdvice is supplied
    if (departureAdvice) {
      const adviceType = departureAdvice.adviceType;
      const isEarlier = adviceType === 'EARLIER_DEPARTURE_RECOMMENDED';
      const earlierBy = departureAdvice.suggestedDeparture?.earlierByMinutes || 0;
      const recDepTime = departureAdvice.suggestedDeparture?.recommendedDepartureTime || null;
      const reasons = [];

      if (isEarlier) {
        if (primary.expectedDisruptionDelayMinutes > 0) {
          reasons.push(`Absorbs +${primary.expectedDisruptionDelayMinutes} min expected delay from active transit congestion along this corridor.`);
        }
        if (departureAdvice.academicScheduleInfluence?.isExamDay) {
          reasons.push(`Provides the required 20-minute safety buffer before your scheduled exam starts.`);
        } else if (departureAdvice.academicScheduleInfluence?.hasAcademicContext) {
          reasons.push(`Ensures a 10-minute punctuality buffer before your class begins on campus.`);
        }
        if (departureAdvice.currentPlan?.marginMinutes !== null && departureAdvice.currentPlan.marginMinutes < (departureAdvice.suggestedDeparture?.safetyBufferMinutes || 10)) {
          reasons.push(`Eliminates tight margin risk to ensure arrival before your deadline (${departureAdvice.currentPlan.targetArrivalTime}).`);
        }
        if (reasons.length === 0) {
          reasons.push(`Provides additional buffer time to ensure on-time arrival before your scheduled deadline.`);
        }
      }

      let narrative = '';
      if (isEarlier) {
        narrative = `Departing ${earlierBy} minutes earlier (at ${recDepTime}) is recommended: ${reasons.join(' ')}`;
      } else if (adviceType === 'ROUTE_CHANGE_NEEDED') {
        narrative = 'Severe corridor disruptions make departure timing adjustments insufficient; switching to an alternative transit route is recommended.';
      } else if (adviceType === 'DEADLINE_UNACHIEVABLE') {
        narrative = 'Transit service hours or travel duration cannot achieve the requested arrival deadline on this corridor.';
      } else {
        narrative = `Current planned departure at ${primary.departureTime} allows sufficient travel buffer to arrive on schedule without requiring an earlier departure.`;
      }

      return {
        isEarlierDepartureRecommended: isEarlier,
        earlierByMinutes: earlierBy,
        recommendedDepartureTime: recDepTime,
        reasons,
        narrative,
        actionableGuidance: departureAdvice.actionableGuidance || [],
        provenanceTier: departureAdvice.provenance?.sourceTier || PROVENANCE_TIERS.ESTIMATED
      };
    }

    // Case 2: Standalone evaluation when DepartureAdvice is not pre-computed
    const delay = primary.expectedDisruptionDelayMinutes || 0;
    const target = targetArrivalTime || (academicContext?.isDestinationMatched ? academicContext?.nextClass?.startTimeHHMM : null);

    let marginMinutes = null;
    if (target && primary.estimatedArrivalTime) {
      const [th, tm] = target.split(':').map(Number);
      const [ah, am] = primary.estimatedArrivalTime.split(':').map(Number);
      marginMinutes = (th * 60 + tm) - (ah * 60 + am);
    }

    const isExam = Boolean(academicContext?.isExamDay);
    const requiredBuffer = isExam ? 20 : (academicContext?.isDestinationMatched ? 10 : 5);
    const reasons = [];
    let isEarlier = false;
    let earlierBy = 0;
    let recDepTime = null;

    if (delay > 0) {
      reasons.push(`Absorbs +${delay} min active disruption delay along this corridor.`);
      isEarlier = true;
      earlierBy += delay;
    }

    if (marginMinutes !== null && marginMinutes < requiredBuffer) {
      const deficit = requiredBuffer - marginMinutes;
      reasons.push(isExam
        ? `Provides the required 20-minute safety buffer before your scheduled exam.`
        : `Preserves a ${requiredBuffer}-minute arrival buffer before your ${target} schedule.`
      );
      isEarlier = true;
      earlierBy = Math.max(earlierBy, deficit);
    }

    if (isEarlier && earlierBy > 0 && primary.departureTime) {
      const [dh, dm] = primary.departureTime.split(':').map(Number);
      const newMinutes = (dh * 60 + dm - earlierBy + 1440) % 1440;
      const rh = Math.floor(newMinutes / 60).toString().padStart(2, '0');
      const rm = (newMinutes % 60).toString().padStart(2, '0');
      recDepTime = `${rh}:${rm}`;
    }

    let narrative = '';
    if (isEarlier) {
      narrative = `Departing ${earlierBy} minutes earlier (at ${recDepTime}) is recommended: ${reasons.join(' ')}`;
    } else {
      narrative = `Current planned departure at ${primary.departureTime} allows sufficient travel buffer to arrive on schedule without requiring an earlier departure.`;
    }

    return {
      isEarlierDepartureRecommended: isEarlier,
      earlierByMinutes: earlierBy,
      recommendedDepartureTime: recDepTime,
      reasons,
      narrative,
      actionableGuidance: isEarlier
        ? [`Aim to leave by ${recDepTime} to ensure on-time arrival.`]
        : ['Your current departure schedule is on track.'],
      provenanceTier: primary.sourceTier === PROVENANCE_TIERS.SYNTHETIC ? PROVENANCE_TIERS.SYNTHETIC : PROVENANCE_TIERS.ESTIMATED
    };
  }

  /**
   * Formulates satisfied student preferences and constraint alignments.
   * Grounded in evaluated candidate routes without fabricated claims.
   * @private
   */
  _buildSatisfiedPreferences(primary, alts, preferences, constraints, targetArrivalTime, academicContext) {
    const list = [];
    const routePref = String(preferences?.route_preference || preferences?.preference || 'balanced').toLowerCase();

    // 1. Route Preference Satisfaction - never claim fastest or cheapest unless candidate data supports it!
    if (routePref === 'fastest') {
      const isFastestAmongEvaluated = alts.length === 0 || alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes);
      if (isFastestAmongEvaluated) {
        list.push({
          preference: 'route_preference (fastest)',
          isSatisfied: true,
          detail: `Satisfies your faster journey preference with a total travel duration of ${primary.totalTravelTimeMinutes} mins.`,
          priority: 1
        });
      } else {
        const fasterAlts = alts.filter(a => a.totalTravelTimeMinutes < primary.totalTravelTimeMinutes);
        const minDuration = Math.min(...fasterAlts.map(a => a.totalTravelTimeMinutes));
        list.push({
          preference: 'route_preference (fastest)',
          isSatisfied: false,
          detail: `Travel duration is ${primary.totalTravelTimeMinutes} mins; a faster alternative exists (${minDuration} mins) but was deprioritized due to constraints, transfers, or disruptions.`,
          priority: 1
        });
      }
    } else if (routePref === 'cheapest') {
      if (primary.estimatedCostRupees !== null) {
        const isCheapestAmongEvaluated = alts.length === 0 || alts.every(a => a.estimatedCostRupees === null || a.estimatedCostRupees >= primary.estimatedCostRupees);
        if (isCheapestAmongEvaluated) {
          list.push({
            preference: 'route_preference (cheapest)',
            isSatisfied: true,
            detail: `Satisfies your lower-cost preference with an economical transit fare of ₹${primary.estimatedCostRupees}.`,
            priority: 1
          });
        } else {
          const cheaperAlts = alts.filter(a => a.estimatedCostRupees !== null && a.estimatedCostRupees < primary.estimatedCostRupees);
          const minFare = Math.min(...cheaperAlts.map(a => a.estimatedCostRupees));
          list.push({
            preference: 'route_preference (cheapest)',
            isSatisfied: false,
            detail: `Estimated fare is ₹${primary.estimatedCostRupees}; a lower-cost option exists (₹${minFare}) but was deprioritized due to speed, transfers, or corridor alerts.`,
            priority: 1
          });
        }
      } else {
        list.push({
          preference: 'route_preference (cheapest)',
          isSatisfied: false,
          detail: 'Fare data is unavailable for this route; cost satisfaction cannot be verified.',
          priority: 1
        });
      }
    } else if (routePref === 'fewest_transfers') {
      const hasFewestTransfers = alts.length === 0 || alts.every(a => a.transfers >= primary.transfers);
      if (primary.transfers === 0) {
        list.push({
          preference: 'route_preference (fewest_transfers)',
          isSatisfied: true,
          detail: 'Satisfies your transfer preference with a direct 0-transfer journey.',
          priority: 1
        });
      } else if (hasFewestTransfers) {
        list.push({
          preference: 'route_preference (fewest_transfers)',
          isSatisfied: true,
          detail: `Minimizes modal transfers with ${primary.transfers} transfer(s), the lowest viable connection on this corridor.`,
          priority: 1
        });
      } else {
        list.push({
          preference: 'route_preference (fewest_transfers)',
          isSatisfied: false,
          detail: `Requires ${primary.transfers} transfer(s); an alternative with fewer transfers exists but was deprioritized.`,
          priority: 1
        });
      }
    } else if (routePref === 'least_walking') {
      const hasLeastWalking = alts.length === 0 || alts.every(a => a.walkingTimeMinutes >= primary.walkingTimeMinutes);
      list.push({
        preference: 'route_preference (least_walking)',
        isSatisfied: primary.walkingTimeMinutes <= 10 || hasLeastWalking,
        detail: `Satisfies your reduced-walking preference with ${primary.walkingTimeMinutes} mins of pedestrian exertion.`,
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

    // 3. Academic Schedule Constraint
    if (academicContext?.nextClass && academicContext?.isDestinationMatched) {
      const classDeadline = academicContext.nextClass.startTimeHHMM;
      const arrivesBeforeClass = primary.estimatedArrivalTime ? primary.estimatedArrivalTime <= classDeadline : true;
      list.push({
        preference: 'academic_schedule',
        isSatisfied: arrivesBeforeClass,
        detail: arrivesBeforeClass
          ? `Aligned with upcoming ${academicContext.nextClass.eventType || 'class'} '${academicContext.nextClass.title}' at ${classDeadline} (${primary.estimatedArrivalTime ? `arrives at ${primary.estimatedArrivalTime}` : 'on-time'}).`
          : `Arrives at ${primary.estimatedArrivalTime}, after upcoming class '${academicContext.nextClass.title}' (${classDeadline}) starts.`,
        priority: 1
      });
    }

    // 4. Arrival Target Constraint
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

    // 5. Max Walking Tolerance
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

    // 6. Max Transfers
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
   * Explains expected travel and arrival times with margin buffers and departure adjustments.
   * @private
   */
  _buildTimingExplanation(primary, targetArrivalTime, academicContext, earlierAdvice) {
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

    if (academicContext?.nextClass && academicContext?.isDestinationMatched) {
      narrative += ` Aligned with '${academicContext.nextClass.title}' (${academicContext.nextClass.startTimeHHMM}).`;
    }

    if (earlierAdvice?.isEarlierDepartureRecommended) {
      narrative += ` Departing earlier by ${earlierAdvice.earlierByMinutes} mins (at ${earlierAdvice.recommendedDepartureTime}) is recommended to preserve your arrival buffer.`;
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

    const isPrimaryFastest = alts.length === 0 || alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes);

    // Comparative trade-offs with alternatives
    for (const alt of alts) {
      const timeDiff = alt.totalTravelTimeMinutes - primary.totalTravelTimeMinutes;
      const fareDiff = (alt.estimatedCostRupees !== null && primary.estimatedCostRupees !== null)
        ? alt.estimatedCostRupees - primary.estimatedCostRupees
        : null;

      // "The lower-cost option takes longer than the fastest feasible route."
      if (fareDiff !== null && fareDiff < 0 && timeDiff > 0) {
        if (isPrimaryFastest) {
          list.push(`The lower-cost option takes longer than the fastest feasible route (${alt.primaryMode.toUpperCase()} saves ₹${Math.abs(fareDiff)} but adds ${timeDiff} min).`);
        } else {
          list.push(`The lower-cost option takes longer than the primary route (${alt.primaryMode.toUpperCase()} saves ₹${Math.abs(fareDiff)} but adds ${timeDiff} min).`);
        }
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
    const isPrimaryFastest = alts.length === 0 || alts.every(a => a.totalTravelTimeMinutes >= primary.totalTravelTimeMinutes);

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
        const speedRef = isPrimaryFastest ? 'the fastest feasible route' : 'the primary route';
        tradeOffNarrative = `The lower-cost option takes longer than ${speedRef} (${timeDiff > 0 ? `adds ${timeDiff} min` : 'similar travel time'}).`;
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
  recommendationExplanationService,
  formatTimeAMPM
};
