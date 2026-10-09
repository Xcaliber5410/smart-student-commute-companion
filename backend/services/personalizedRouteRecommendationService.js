/**
 * PersonalizedRouteRecommendationService
 *
 * Core recommendation engine for personalized student commute journeys (P9).
 * Consumes:
 * - Candidate Route Generation (candidateRouteEngine / journeyBuilder)
 * - Environmental Context Analysis (commuteContextEngine / disruptionImpactService)
 * - Route Constraint Filtering (routeConstraintFilteringService)
 * - Alternate Route Generation (alternateRouteService)
 * - Route Evaluation & Comparison (routeEvaluationService / routeComparisonService)
 * - Deterministic & Personalized Route Scoring (deterministicRouteScoringService)
 *
 * Core Guarantees:
 * 1. Deterministic: Identical inputs and data produce identical recommendations.
 * 2. Feasibility: Infeasible routes and hard-constraint-violating routes are NEVER selected.
 * 3. Provenance Integrity: Never fabricates transit data; preserves SYNTHETIC and VERIFIED tiers.
 * 4. Deduplication: Avoids duplicate routes and does not present equivalent alternatives.
 * 5. Explainable: Explains WHY a route was selected using multi-dimensional transit reasons.
 * 6. Honest Fallback: Surfaces a structured fallback when no viable route exists.
 * 7. Modular: Follows strict dependency-injection patterns with sensible defaults.
 */

const {
  PersonalizedCommuteRecommendation,
  RecommendedRouteDetail,
  PreferenceAlignment,
  RecommendationReason,
  RECOMMENDATION_STATUS_TYPES,
  REASON_CATEGORIES,
  DataProvenance,
  PROVENANCE_TIERS
} = require('../models');

const { candidateRouteEngine } = require('./candidateRouteEngine');
const { commuteContextEngine } = require('./commuteContextEngine');
const { routeConstraintFilteringService } = require('./routeConstraintFilteringService');
const { alternateRouteService } = require('./alternateRouteService');
const { routeEvaluationService } = require('./routeEvaluationService');
const { routeComparisonService } = require('./routeComparisonService');
const { deterministicRouteScoringService } = require('./deterministicRouteScoringService');
const { recommendationExplanationService } = require('./recommendationExplanationService');
const { departureAdviceService } = require('./departureAdviceService');
const { ValidationError } = require('../errors');

/**
 * Checks if two routes are practically equivalent to avoid presenting near-duplicates as alternatives.
 *
 * @param {object} routeA
 * @param {object} routeB
 * @param {object} [thresholds={}]
 * @returns {boolean}
 */
function areRoutesEquivalent(routeA, routeB, thresholds = {}) {
  if (!routeA || !routeB) return false;
  const idA = routeA.journeyId || routeA.id;
  const idB = routeB.journeyId || routeB.id;
  if (idA === idB) return true;

  const modesA = (routeA.modesIncluded || [routeA.primaryMode] || []).map(m => String(m).toLowerCase()).sort().join(',');
  const modesB = (routeB.modesIncluded || [routeB.primaryMode] || []).map(m => String(m).toLowerCase()).sort().join(',');

  const durA = Number(routeA.totalTravelTime ?? routeA.totalDurationMinutes ?? 0);
  const durB = Number(routeB.totalTravelTime ?? routeB.totalDurationMinutes ?? 0);

  const costA = Number(routeA.estimatedCost ?? routeA.estimatedCostRupees ?? 0);
  const costB = Number(routeB.estimatedCost ?? routeB.estimatedCostRupees ?? 0);

  const transA = Number(routeA.numberOfTransfers ?? routeA.transfers ?? routeA.transferCount ?? 0);
  const transB = Number(routeB.numberOfTransfers ?? routeB.transfers ?? routeB.transferCount ?? 0);

  const maxVar = thresholds.varianceMinutes ?? 2;
  const maxCostVar = thresholds.varianceRupees ?? 5;

  return (
    modesA === modesB &&
    transA === transB &&
    Math.abs(durA - durB) <= maxVar &&
    Math.abs(costA - costB) <= maxCostVar
  );
}

/**
 * Deterministically generates a stable recommendation ID for repeatable queries.
 *
 * @param {object} params
 * @returns {string}
 */
function generateDeterministicRecId(params = {}) {
  const origin = String(params.origin || params.startingArea || 'unknown').toLowerCase().replace(/\s+/g, '-');
  const dest = String(params.destination || params.collegeDestination || 'campus').toLowerCase().replace(/\s+/g, '-');
  const dep = String(params.departureTime || '0800').replace(':', '');
  const student = String(params.studentId || 'std');
  return `rec-${origin}-to-${dest}-${dep}-${student}`;
}

class PersonalizedRouteRecommendationService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.candidateRouteEngine]
   * @param {object} [options.commuteContextEngine]
   * @param {object} [options.routeConstraintFilteringService]
   * @param {object} [options.alternateRouteService]
   * @param {object} [options.routeEvaluationService]
   * @param {object} [options.routeComparisonService]
   * @param {object} [options.routeScoringService]
   */
  constructor(options = {}) {
    this.candidateRouteEngine = options.candidateRouteEngine || candidateRouteEngine;
    this.commuteContextEngine = options.commuteContextEngine || commuteContextEngine;
    this.constraintFilteringService = options.routeConstraintFilteringService || routeConstraintFilteringService;
    this.alternateRouteService = options.alternateRouteService || alternateRouteService;
    this.routeEvaluationService = options.routeEvaluationService || routeEvaluationService;
    this.routeComparisonService = options.routeComparisonService || routeComparisonService;
    this.routeScoringService = options.routeScoringService || deterministicRouteScoringService;
    this.explanationService = options.recommendationExplanationService || options.explanationService || recommendationExplanationService;
    this.departureAdviceService = options.departureAdviceService || departureAdviceService;
  }

  /**
   * Generates a personalized commute recommendation for a student.
   *
   * Orchestrates the complete pipeline:
   * 1. Obtains or generates candidate journeys
   * 2. Evaluates environmental context (traffic, weather, disruptions, availability)
   * 3. Applies hard feasibility constraints (deadline, walking limit, transfers, budget)
   * 4. Evaluates and scores candidates with student preferences
   * 5. Explores resilience alternates when disruptions are present
   * 6. Deduplicates candidates and eliminates equivalent alternatives
   * 7. Selects top primary route and distinct alternative routes
   * 8. Performs head-to-head trade-off analysis
   * 9. Synthesizes transparent, explainable recommendation reasons
   * 10. Reports an actionable fallback recommendation when no viable route exists
   *
   * @param {object} params - Request parameters or commute input
   * @param {object} [options={}] - Pipeline execution controls and overrides
   * @returns {Promise<PersonalizedCommuteRecommendation>}
   */
  async getRecommendation(params = {}, options = {}) {
    if (!params || typeof params !== 'object') {
      throw new ValidationError('Commute recommendation request parameters are required');
    }

    const studentId = params.studentId || options.studentId || null;
    const origin = params.startingArea || params.originArea || params.origin || options.origin;
    const destination = params.collegeDestination || params.destinationArea || params.destination || options.destination || 'D.J. Sanghvi College of Engineering';
    const departureTime = params.desiredDepartureTime || params.departureTime || options.departureTime || '08:00';
    const targetArrivalTime = params.desiredArrivalTime || params.targetArrivalTime || params.arrivalDeadline || options.targetArrivalTime || null;

    // Normalizing preferences and hard constraints
    const preferences = params.preferences || params.studentPreferences || options.preferences || {};
    const constraints = {
      ...(params.constraints || params.hardConstraints || options.constraints || {}),
      ...(targetArrivalTime ? { targetArrivalTime } : {})
    };

    const context = params.context || options.context || {
      currentTime: Date.now(),
      disruptions: [],
      trafficConditions: [],
      weatherContext: { condition: 'clear', totalAddedTravelTimeMinutes: 0 },
      availability: { dominantStatus: 'AVAILABLE', isUsable: true }
    };

    // -------------------------------------------------------------------------
    // STAGE 1: OBTAIN OR GENERATE CANDIDATE JOURNEYS
    // -------------------------------------------------------------------------
    let rawCandidates = [];
    if (Array.isArray(params.evaluations) && params.evaluations.length > 0) {
      // Pre-evaluated routes supplied directly
      return this._recommendFromEvaluations(params.evaluations, {
        studentId,
        origin,
        destination,
        departureTime,
        targetArrivalTime,
        preferences,
        constraints,
        context,
        options
      });
    } else if (Array.isArray(params.candidates) && params.candidates.length > 0) {
      rawCandidates = params.candidates;
    } else if (Array.isArray(params.candidateRoutes) && params.candidateRoutes.length > 0) {
      rawCandidates = params.candidateRoutes;
    } else if (Array.isArray(options.candidateRoutes) && options.candidateRoutes.length > 0) {
      rawCandidates = options.candidateRoutes;
    } else {
      if (!origin) {
        throw new ValidationError('Origin / starting area is required to generate commute recommendations');
      }

      rawCandidates = await this.candidateRouteEngine.generateCandidates({
        startingArea: origin,
        collegeDestination: destination,
        desiredDepartureTime: departureTime,
        desiredArrivalTime: targetArrivalTime,
        maxTransfers: constraints.maxTransfers,
        maxWalkingMinutes: constraints.maxWalkingMinutes,
        maxBudgetRupees: constraints.maxBudgetRupees,
        allowedModes: constraints.allowedModes,
        avoidModes: constraints.avoidModes,
        options: { unfiltered: true, ...options }
      });
    }

    if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
      return PersonalizedCommuteRecommendation.createFallback({
        id: options.recommendationId || generateDeterministicRecId(params),
        studentId,
        reason: 'No candidate transit routes could be generated connecting your origin to destination.',
        guidance: [
          'Verify that starting area and destination names match recognized campus transit zones.',
          'Try widening departure timing or allowing walking / shared auto legs.'
        ],
        studentPreferences: preferences,
        context
      });
    }

    // -------------------------------------------------------------------------
    // STAGE 2: HARD CONSTRAINT FILTERING
    // -------------------------------------------------------------------------
    const filterOptions = {
      constraints,
      preferences,
      targetArrivalTime,
      context
    };

    const filterResult = this.constraintFilteringService.filterCandidates(rawCandidates, filterOptions);
    const acceptedCandidates = filterResult.accepted.map(e => e.journey || e.candidate || e);

    if (acceptedCandidates.length === 0) {
      // Invariant: Do not automatically select a route that violates hard constraints!
      const rejectedItems = filterResult.rejected || [];
      const primaryViolation = rejectedItems[0]?.hardViolations?.[0]?.message ||
        rejectedItems[0]?.reasonCodes?.[0] ||
        'All candidate routes violate your specified schedule or travel constraints.';

      const guidance = [];
      const codes = new Set(rejectedItems.flatMap(r => r.reasonCodes || []));
      if (codes.has('ARRIVAL_TOO_LATE')) {
        guidance.push('Consider departing 15–20 minutes earlier to ensure on-time arrival before your deadline.');
      }
      if (codes.has('WALKING_LIMIT_EXCEEDED')) {
        guidance.push('Consider relaxing walking limits slightly to allow short pedestrian connections.');
      }
      if (codes.has('TOO_MANY_TRANSFERS')) {
        guidance.push('Increase allowable transfers to 2 or 3 to uncover connected transit options.');
      }
      if (codes.has('BUDGET_EXCEEDED')) {
        guidance.push('Increase budget limit or select public bus/train options with student fares.');
      }
      if (guidance.length === 0) {
        guidance.push('Relax request constraints or select alternate travel windows.');
      }

      return PersonalizedCommuteRecommendation.createFallback({
        id: options.recommendationId || generateDeterministicRecId(params),
        studentId,
        reason: primaryViolation,
        guidance,
        studentPreferences: preferences,
        rejectedRoutes: rejectedItems,
        context
      });
    }

    // -------------------------------------------------------------------------
    // STAGE 3: EVALUATE CANDIDATES AGAINST CONTEXT (Disruptions, Traffic, Weather)
    // -------------------------------------------------------------------------
    let evaluations = this.routeEvaluationService.evaluateRoutes(acceptedCandidates, context, options);

    // Keep only viable and operational routes
    evaluations = evaluations.filter(ev => Boolean(ev.isFeasible));

    if (evaluations.length === 0) {
      return PersonalizedCommuteRecommendation.createFallback({
        id: options.recommendationId || generateDeterministicRecId(params),
        studentId,
        reason: 'All candidate routes are currently obstructed by severe transit disruptions or service cancellations.',
        guidance: [
          'Monitor real-time transit alerts for corridor clearance updates.',
          'Consider seeking alternative road or rail corridors away from active waterlogging or track closures.'
        ],
        studentPreferences: preferences,
        context
      });
    }

    // -------------------------------------------------------------------------
    // STAGE 4: DISCOVER RESILIENT ALTERNATES IF PRIMARY CORRIDOR IS DISRUPTED
    // -------------------------------------------------------------------------
    if (options.includeAlternates !== false && evaluations.length > 0) {
      const disruptedCandidates = evaluations.filter(ev => Number(ev.additionalDisruptionDelay || 0) > 0);
      if (disruptedCandidates.length > 0 && typeof this.alternateRouteService.generateAlternatesForJourney === 'function') {
        try {
          const alternateJourneys = await this.alternateRouteService.generateAlternatesForJourney(
            disruptedCandidates[0],
            context,
            options
          );
          if (Array.isArray(alternateJourneys) && alternateJourneys.length > 0) {
            const rawAlts = alternateJourneys.map(a => a.journey || a);
            const filteredAlts = this.constraintFilteringService.filterCandidates(rawAlts, filterOptions);
            const validAlts = filteredAlts.accepted.map(e => e.journey || e.candidate || e);
            const evaluatedAlts = this.routeEvaluationService.evaluateRoutes(validAlts, context, options)
              .filter(ev => Boolean(ev.isFeasible));
            evaluations.push(...evaluatedAlts);
          }
        } catch (err) {
          // Resilience: failure in alternate generation does not crash the recommendation
        }
      }
    }

    // -------------------------------------------------------------------------
    // STAGE 5: DEDUPLICATION & EQUIVALENT ALTERNATIVES FILTERING
    // -------------------------------------------------------------------------
    // Eliminate exact duplicates by journeyId or identical route signatures
    const uniqueEvaluations = [];
    const seenIds = new Set();

    for (const ev of evaluations) {
      const jId = ev.journeyId;
      if (!seenIds.has(jId)) {
        seenIds.add(jId);
        uniqueEvaluations.push(ev);
      }
    }

    // -------------------------------------------------------------------------
    // STAGE 6: PERSONALIZED DETERMINISTIC SCORING & RANKING
    // -------------------------------------------------------------------------
    return this._recommendFromEvaluations(uniqueEvaluations, {
      studentId,
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      preferences,
      constraints,
      context,
      options
    });
  }

  /**
   * Internal helper: completes scoring, ranking, trade-off analysis, and recommendation assembly.
   *
   * @private
   */
  _recommendFromEvaluations(evaluations, meta) {
    const {
      studentId,
      departureTime,
      targetArrivalTime,
      preferences,
      constraints,
      context,
      options
    } = meta;

    // Invariant: Apply deterministic personalized scoring
    const scoredRoutes = this.routeScoringService.scoreAndRankRoutes(
      evaluations,
      context,
      { preferences, constraints, targetArrivalTime }
    );

    // Keep only feasible routes
    const feasibleScored = scoredRoutes.filter(r => Boolean(r.isFeasible) && r.feasibilityTier > 0);

    if (feasibleScored.length === 0) {
      return PersonalizedCommuteRecommendation.createFallback({
        id: options.recommendationId || generateDeterministicRecId(meta),
        studentId,
        reason: 'No feasible routes remain after personalized constraint and operational evaluation.',
        guidance: ['Adjust timing preferences or relax hard constraints to view viable journeys.'],
        studentPreferences: preferences,
        context
      });
    }

    // 1. Primary Selected Route (highest composite score & deterministic rank #1)
    const primaryRoute = feasibleScored[0];

    // 2. Filter Distinct Alternative Routes
    // Invariant: Avoid duplicate routes and avoid presenting equivalent alternatives as meaningfully different!
    const distinctAlternatives = [];
    for (let i = 1; i < feasibleScored.length; i++) {
      const candidateAlt = feasibleScored[i];

      // Check equivalence against primary route
      if (areRoutesEquivalent(primaryRoute, candidateAlt)) {
        continue;
      }

      // Check equivalence against already selected alternatives
      const isAlreadyRepresented = distinctAlternatives.some(chosen =>
        areRoutesEquivalent(chosen, candidateAlt)
      );

      if (!isAlreadyRepresented) {
        distinctAlternatives.push(candidateAlt);
      }

      if (distinctAlternatives.length >= 3) {
        break; // Max 3 diverse alternatives
      }
    }

    // -------------------------------------------------------------------------
    // STAGE 7: HEAD-TO-HEAD TRADE-OFF ANALYSIS
    // -------------------------------------------------------------------------
    const tradeOffs = [];
    distinctAlternatives.forEach(alt => {
      try {
        const pairComparison = this.routeComparisonService.comparePair(
          primaryRoute.evaluation || primaryRoute,
          alt.evaluation || alt,
          context
        );
        if (pairComparison?.tradeOffSummary && pairComparison.tradeOffSummary.length > 0) {
          tradeOffs.push(...pairComparison.tradeOffSummary);
        }
      } catch (err) {
        // Fallback manual delta computation
        const durationDiff = alt.totalTravelTime - primaryRoute.totalTravelTime;
        const costDiff = (alt.breakdown?.cost?.fareRupees ?? 0) - (primaryRoute.breakdown?.cost?.fareRupees ?? 0);
        if (durationDiff !== 0) {
          const fasterMode = String(durationDiff > 0 ? (primaryRoute.primaryMode || primaryRoute.journeyId) : (alt.primaryMode || alt.journeyId));
          tradeOffs.push(`${fasterMode.toUpperCase()} is faster by ${Math.abs(durationDiff)} min`);
        }
        if (costDiff !== 0) {
          const cheaperMode = String(costDiff > 0 ? (primaryRoute.primaryMode || primaryRoute.journeyId) : (alt.primaryMode || alt.journeyId));
          tradeOffs.push(`${cheaperMode.toUpperCase()} is ₹${Math.abs(costDiff)} cheaper`);
        }
      }
    });

    // -------------------------------------------------------------------------
    // STAGE 8: RECOMMENDATION REASONS & EXPLANATION
    // -------------------------------------------------------------------------
    const reasons = [];

    // Reason: Punctual Arrival Deadline
    if (targetArrivalTime && primaryRoute.estimatedArrivalTime) {
      if (primaryRoute.estimatedArrivalTime <= targetArrivalTime) {
        reasons.push(new RecommendationReason({
          category: REASON_CATEGORIES.SCHEDULE_DEADLINE,
          headline: `Guarantees arrival by ${primaryRoute.estimatedArrivalTime}`,
          detail: `Arrives at destination by ${primaryRoute.estimatedArrivalTime}, safely ahead of your ${targetArrivalTime} deadline.`,
          priority: 1,
          dataTier: primaryRoute.provenance?.sourceTier || PROVENANCE_TIERS.VERIFIED
        }));
      }
    }

    // Reason: Disruption Avoidance
    const disruptionMinutes = Number(primaryRoute.breakdown?.disruption?.delayMinutes || 0);
    if (disruptionMinutes === 0) {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.DISRUPTION_AVOIDANCE,
        headline: 'Clear route free from reported delays',
        detail: 'Operates on unobstructed transit segments without active service alerts.',
        priority: 2,
        dataTier: PROVENANCE_TIERS.VERIFIED
      }));
    } else {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.DISRUPTION_AVOIDANCE,
        headline: `Buffered for +${disruptionMinutes} min expected congestion`,
        detail: `Includes a deterministic delay buffer of ${disruptionMinutes} minutes for active transit congestion.`,
        priority: 2,
        dataTier: primaryRoute.provenance?.sourceTier || PROVENANCE_TIERS.USER_REPORTED
      }));
    }

    // Reason: Preference Profile Alignment
    const appliedProfile = primaryRoute.breakdown?.personalization?.profile || 'balanced';
    if (appliedProfile === 'fastest') {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.EFFICIENCY,
        headline: `Minimal commute duration: ${primaryRoute.totalTravelTime} mins`,
        detail: `Optimized for speed matching your faster journey preference.`,
        priority: 1,
        dataTier: PROVENANCE_TIERS.ESTIMATED
      }));
    } else if (appliedProfile === 'cheapest') {
      const fare = primaryRoute.breakdown?.cost?.fareRupees ?? 0;
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.AFFORDABILITY,
        headline: `Lowest transit fare: ₹${fare}`,
        detail: `Economical student journey matching your lower-cost preference.`,
        priority: 1,
        dataTier: PROVENANCE_TIERS.VERIFIED
      }));
    } else if (appliedProfile === 'fewest_transfers' || primaryRoute.breakdown?.transfers?.count === 0) {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.EFFICIENCY,
        headline: 'Direct seamless connection',
        detail: 'Operates without complex interchange transfers between transit modes.',
        priority: 2,
        dataTier: PROVENANCE_TIERS.VERIFIED
      }));
    } else if (appliedProfile === 'least_walking') {
      const walkTime = primaryRoute.breakdown?.walking?.minutes ?? 0;
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.LOW_WALKING,
        headline: `Minimal walking burden: ${walkTime} mins`,
        detail: `Sheltered transit connection with reduced pedestrian exertion.`,
        priority: 2,
        dataTier: PROVENANCE_TIERS.ESTIMATED
      }));
    }

    // Reason: Preferred Modes Match
    const preferredMatched = primaryRoute.breakdown?.personalization?.bonuses
      ?.find(b => b.type === 'PREFERRED_MODE_MATCH');
    if (preferredMatched) {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.PREFERENCE_MATCH,
        headline: 'Matches preferred transport modes',
        detail: preferredMatched.description,
        priority: 3,
        dataTier: PROVENANCE_TIERS.VERIFIED
      }));
    }

    // -------------------------------------------------------------------------
    // STAGE 9: WARNINGS & NOTICES
    // -------------------------------------------------------------------------
    const warnings = [];
    if (disruptionMinutes > 10) {
      warnings.push(`Expected disruption delay of +${disruptionMinutes} minutes on this route.`);
    }
    if (primaryRoute.breakdown?.uncertainty?.level === 'HIGH' || primaryRoute.breakdown?.uncertainty?.level === 'SEVERE') {
      warnings.push('Elevated route uncertainty due to active traffic congestion or weather conditions.');
    }

    // -------------------------------------------------------------------------
    // STAGE 10: ASSEMBLE DOMAIN RECOMMENDATION ENTITY & EXPLANATIONS
    // -------------------------------------------------------------------------
    const recId = options.recommendationId || generateDeterministicRecId(meta);

    let explanation = null;
    try {
      explanation = this.explanationService.explainRecommendation({
        recommendationId: recId,
        primaryRoute,
        alternatives: distinctAlternatives,
        preferences,
        constraints,
        context,
        targetArrivalTime,
        rawTradeOffs: tradeOffs
      });
    } catch (err) {
      // Explanation generation failure must not crash the recommendation
    }

    // Generate disruption-aware departure advice
    let departureAdvice = null;
    try {
      departureAdvice = this.departureAdviceService.evaluateDepartureAdvice({
        primaryRoute,
        alternatives: distinctAlternatives,
        context,
        departureTime,
        targetArrivalTime,
        date: options.date || options.dayOfWeek || 'Mon',
        preferences,
        constraints
      });
    } catch (err) {
      // Departure advice failure must not crash the recommendation
    }

    return PersonalizedCommuteRecommendation.fromEvaluatedRoute(primaryRoute, {
      id: recId,
      studentId,
      alternatives: distinctAlternatives,
      preferences,
      context,
      targetArrivalTime,
      tradeOffs,
      warnings,
      reasons,
      explanation,
      departureAdvice,
      generatedAt: options.generatedAt || Date.now()
    });
  }
}

const personalizedRouteRecommendationService = new PersonalizedRouteRecommendationService();

module.exports = {
  PersonalizedRouteRecommendationService,
  personalizedRouteRecommendationService,
  areRoutesEquivalent,
  generateDeterministicRecId
};
