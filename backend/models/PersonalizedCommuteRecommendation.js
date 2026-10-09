/**
 * PersonalizedCommuteRecommendation Domain Models & Contracts
 *
 * Establishes formal domain contracts for personalized student commute recommendations.
 * Reuses existing RouteEvaluation, DeterministicRouteScoringService, RouteComparisonService,
 * UnifiedJourneyImpact, StudentCommutePreference, and DataProvenance models.
 *
 * Architecture Principles:
 * - Deterministic: Zero LLM hallucinations or speculative scores.
 * - Explainable: Reasons describe *why* a route is chosen, never relying on a raw score as an explanation.
 * - Resilient: Null-safe handling for missing preferences and incomplete transit data.
 * - Single Source of Truth: Reuses existing 100-point composite scoring without duplicate scoring logic.
 * - Multi-tier Provenance: Explicitly tracks VERIFIED, USER_REPORTED, ESTIMATED, and SYNTHETIC data.
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  provenanceTierEnum
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ============================================================================
// 1. CONSTANTS & ENUMS
// ============================================================================

/**
 * Standard Recommendation Status Values
 */
const RECOMMENDATION_STATUS_TYPES = Object.freeze({
  RECOMMENDED: 'RECOMMENDED',
  FEASIBLE: 'FEASIBLE',
  CAUTION: 'CAUTION',
  DEGRADED: 'DEGRADED',
  FALLBACK: 'FALLBACK',
  INFEASIBLE: 'INFEASIBLE'
});

const personalizedRecommendationStatusEnum = z.enum([
  'RECOMMENDED',
  'OPTIMAL',
  'FEASIBLE',
  'VIABLE',
  'CAUTION',
  'SUBOPTIMAL',
  'DEGRADED',
  'COMPROMISED',
  'FALLBACK',
  'INFEASIBLE'
]);

/**
 * Categories of Explainable Recommendation Reasons
 */
const REASON_CATEGORIES = Object.freeze({
  SCHEDULE_DEADLINE: 'SCHEDULE_DEADLINE',
  DISRUPTION_AVOIDANCE: 'DISRUPTION_AVOIDANCE',
  PREFERENCE_MATCH: 'PREFERENCE_MATCH',
  EFFICIENCY: 'EFFICIENCY',
  RELIABILITY: 'RELIABILITY',
  LOW_WALKING: 'LOW_WALKING',
  AFFORDABILITY: 'AFFORDABILITY',
  SAFETY_WEATHER: 'SAFETY_WEATHER',
  FALLBACK_GUIDANCE: 'FALLBACK_GUIDANCE'
});

const reasonCategoryEnum = z.enum([
  'SCHEDULE_DEADLINE',
  'DISRUPTION_AVOIDANCE',
  'PREFERENCE_MATCH',
  'EFFICIENCY',
  'RELIABILITY',
  'LOW_WALKING',
  'AFFORDABILITY',
  'SAFETY_WEATHER',
  'FALLBACK_GUIDANCE'
]);

/**
 * Preference Alignment Levels
 */
const ALIGNMENT_LEVELS = Object.freeze({
  EXCELLENT: 'EXCELLENT',
  STRONG: 'STRONG',
  MODERATE: 'MODERATE',
  POOR: 'POOR',
  NEUTRAL: 'NEUTRAL'
});

const alignmentLevelEnum = z.enum([
  'EXCELLENT',
  'STRONG',
  'MODERATE',
  'POOR',
  'NEUTRAL'
]);

// ============================================================================
// 2. RECOMMENDATION REASON DOMAIN MODEL
// ============================================================================

const recommendationReasonSchema = z.object({
  category: reasonCategoryEnum.default(REASON_CATEGORIES.EFFICIENCY),
  headline: z.string().min(1, 'Reason headline is required'),
  detail: z.string().min(1, 'Reason detail is required'),
  priority: z.coerce.number().int().min(1).default(1),
  dataTier: provenanceTierEnum.default(PROVENANCE_TIERS.ESTIMATED)
});

class RecommendationReason {
  constructor(data) {
    try {
      const validated = recommendationReasonSchema.parse(data);
      Object.assign(this, validated);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid recommendation reason: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  toJSON() {
    return {
      category: this.category,
      headline: this.headline,
      detail: this.detail,
      priority: this.priority,
      dataTier: this.dataTier
    };
  }
}

// ============================================================================
// 3. PREFERENCE ALIGNMENT DOMAIN MODEL
// ============================================================================

const preferenceAlignmentSchema = z.object({
  overallAlignment: alignmentLevelEnum.default(ALIGNMENT_LEVELS.NEUTRAL),
  isAligned: z.boolean().default(true),
  preferredModesMatched: z.array(z.string()).default([]),
  avoidedModesPresent: z.array(z.string()).default([]),
  isWalkingCompliant: z.boolean().nullable().default(null),
  walkingMinutes: z.coerce.number().min(0).default(0),
  walkingToleranceMinutes: z.coerce.number().min(0).nullable().default(null),
  isBudgetCompliant: z.boolean().nullable().default(null),
  estimatedCostRupees: z.coerce.number().min(0).nullable().default(null),
  maxBudgetRupees: z.coerce.number().min(0).nullable().default(null),
  isTransferCompliant: z.boolean().nullable().default(null),
  transferCount: z.coerce.number().int().min(0).default(0),
  maxTransfers: z.coerce.number().int().min(0).nullable().default(null),
  matchedCriteria: z.array(z.string()).default([]),
  unmatchedCriteria: z.array(z.string()).default([]),
  hasPreferences: z.boolean().default(false)
});

class PreferenceAlignment {
  constructor(data = {}) {
    try {
      const validated = preferenceAlignmentSchema.parse(data);
      Object.assign(this, validated);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid preference alignment: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Evaluates a candidate or evaluated route against student commute preferences.
   * Safe with null, undefined, or partial preferences.
   *
   * @param {object|null} route - Candidate journey, RouteEvaluation, or plain route object
   * @param {object|null} [preferences=null] - StudentCommutePreference instance or plain object
   * @returns {PreferenceAlignment}
   */
  static evaluate(route, preferences = null) {
    if (!preferences || typeof preferences !== 'object' || Object.keys(preferences).length === 0) {
      return new PreferenceAlignment({
        overallAlignment: ALIGNMENT_LEVELS.NEUTRAL,
        isAligned: true,
        hasPreferences: false,
        walkingMinutes: Number(route?.walkingTimeMinutes ?? route?.walking?.durationMinutes ?? 0),
        transferCount: Number(route?.transfers ?? route?.transferCount ?? route?.numberOfTransfers ?? 0),
        estimatedCostRupees: (route?.estimatedCostRupees !== undefined && route?.estimatedCostRupees !== null)
          ? Number(route.estimatedCostRupees)
          : ((route?.estimatedCost !== undefined && route?.estimatedCost !== null) ? Number(route.estimatedCost) : null)
      });
    }

    const preferredModes = Array.isArray(preferences.preferred_modes)
      ? preferences.preferred_modes
      : (Array.isArray(preferences.preferredModes) ? preferences.preferredModes : []);

    const avoidModes = Array.isArray(preferences.avoid_modes)
      ? preferences.avoid_modes
      : (Array.isArray(preferences.avoidModes) ? preferences.avoidModes : []);

    const walkingTolerance = preferences.walking_tolerance_minutes !== undefined && preferences.walking_tolerance_minutes !== null
      ? Number(preferences.walking_tolerance_minutes)
      : (preferences.walkingToleranceMinutes !== undefined && preferences.walkingToleranceMinutes !== null
        ? Number(preferences.walkingToleranceMinutes)
        : (preferences.maxWalkingMinutes !== undefined && preferences.maxWalkingMinutes !== null ? Number(preferences.maxWalkingMinutes) : null));

    const maxBudget = preferences.max_budget_rupees !== undefined && preferences.max_budget_rupees !== null
      ? Number(preferences.max_budget_rupees)
      : (preferences.maxBudgetRupees !== undefined && preferences.maxBudgetRupees !== null
        ? Number(preferences.maxBudgetRupees)
        : (preferences.maxCostRupees !== undefined && preferences.maxCostRupees !== null ? Number(preferences.maxCostRupees) : null));

    const maxTransfers = preferences.max_transfers !== undefined && preferences.max_transfers !== null
      ? Number(preferences.max_transfers)
      : (preferences.maxTransfers !== undefined && preferences.maxTransfers !== null ? Number(preferences.maxTransfers) : null);

    const routeModes = Array.isArray(route?.modesIncluded)
      ? route.modesIncluded
      : (Array.isArray(route?.transportModes)
        ? route.transportModes
        : (route?.primaryMode ? [route.primaryMode] : []));

    const walkingMinutes = Number(route?.walkingTimeMinutes ?? route?.walking?.durationMinutes ?? route?.walkingTime ?? 0);
    const transferCount = Number(route?.transfers ?? route?.transferCount ?? route?.numberOfTransfers ?? 0);
    const estimatedCost = (route?.estimatedCostRupees !== undefined && route?.estimatedCostRupees !== null)
      ? Number(route.estimatedCostRupees)
      : ((route?.estimatedCost !== undefined && route?.estimatedCost !== null)
        ? Number(route.estimatedCost)
        : (route?.cost?.rupees !== undefined && route?.cost?.rupees !== null ? Number(route.cost.rupees) : null));

    const matchedCriteria = [];
    const unmatchedCriteria = [];

    // 1. Preferred modes
    const preferredModesMatched = routeModes.filter(m => preferredModes.includes(m));
    if (preferredModes.length > 0) {
      if (preferredModesMatched.length > 0) {
        matchedCriteria.push(`Uses preferred mode(s): ${preferredModesMatched.join(', ')}`);
      } else {
        unmatchedCriteria.push(`Does not include any preferred modes (${preferredModes.join(', ')})`);
      }
    }

    // 2. Avoided modes
    const avoidedModesPresent = routeModes.filter(m => avoidModes.includes(m));
    if (avoidedModesPresent.length > 0) {
      unmatchedCriteria.push(`Includes avoided mode(s): ${avoidedModesPresent.join(', ')}`);
    } else if (avoidModes.length > 0) {
      matchedCriteria.push('Successfully avoids student excluded modes');
    }

    // 3. Walking tolerance
    let isWalkingCompliant = null;
    if (walkingTolerance !== null) {
      isWalkingCompliant = walkingMinutes <= walkingTolerance;
      if (isWalkingCompliant) {
        matchedCriteria.push(`Walking time of ${walkingMinutes} min is within tolerance (${walkingTolerance} min)`);
      } else {
        unmatchedCriteria.push(`Walking time of ${walkingMinutes} min exceeds preference (${walkingTolerance} min)`);
      }
    }

    // 4. Budget compliance
    let isBudgetCompliant = null;
    if (maxBudget !== null && estimatedCost !== null) {
      isBudgetCompliant = estimatedCost <= maxBudget;
      if (isBudgetCompliant) {
        matchedCriteria.push(`Estimated cost ₹${estimatedCost} fits within ₹${maxBudget} budget`);
      } else {
        unmatchedCriteria.push(`Estimated cost ₹${estimatedCost} exceeds ₹${maxBudget} budget`);
      }
    }

    // 5. Transfer compliance
    let isTransferCompliant = null;
    if (maxTransfers !== null) {
      isTransferCompliant = transferCount <= maxTransfers;
      if (isTransferCompliant) {
        matchedCriteria.push(`Transfer count (${transferCount}) satisfies limit (${maxTransfers})`);
      } else {
        unmatchedCriteria.push(`Transfer count (${transferCount}) exceeds limit (${maxTransfers})`);
      }
    }

    // Determine overall alignment level
    const hasViolations = (avoidedModesPresent.length > 0) ||
      (isWalkingCompliant === false) ||
      (isBudgetCompliant === false) ||
      (isTransferCompliant === false);

    let overallAlignment = ALIGNMENT_LEVELS.STRONG;
    let isAligned = true;

    if (hasViolations) {
      const violationCount = (avoidedModesPresent.length > 0 ? 1 : 0) +
        (isWalkingCompliant === false ? 1 : 0) +
        (isBudgetCompliant === false ? 1 : 0) +
        (isTransferCompliant === false ? 1 : 0);
      overallAlignment = violationCount >= 2 ? ALIGNMENT_LEVELS.POOR : ALIGNMENT_LEVELS.MODERATE;
      isAligned = violationCount < 2;
    } else if (matchedCriteria.length >= 2 && unmatchedCriteria.length === 0) {
      overallAlignment = ALIGNMENT_LEVELS.EXCELLENT;
    }

    return new PreferenceAlignment({
      overallAlignment,
      isAligned,
      preferredModesMatched,
      avoidedModesPresent,
      isWalkingCompliant,
      walkingMinutes,
      walkingToleranceMinutes: walkingTolerance,
      isBudgetCompliant,
      estimatedCostRupees: estimatedCost,
      maxBudgetRupees: maxBudget,
      isTransferCompliant,
      transferCount,
      maxTransfers,
      matchedCriteria,
      unmatchedCriteria,
      hasPreferences: true
    });
  }

  toJSON() {
    return {
      overallAlignment: this.overallAlignment,
      isAligned: this.isAligned,
      preferredModesMatched: [...this.preferredModesMatched],
      avoidedModesPresent: [...this.avoidedModesPresent],
      isWalkingCompliant: this.isWalkingCompliant,
      walkingMinutes: this.walkingMinutes,
      walkingToleranceMinutes: this.walkingToleranceMinutes,
      isBudgetCompliant: this.isBudgetCompliant,
      estimatedCostRupees: this.estimatedCostRupees,
      maxBudgetRupees: this.maxBudgetRupees,
      isTransferCompliant: this.isTransferCompliant,
      transferCount: this.transferCount,
      maxTransfers: this.maxTransfers,
      matchedCriteria: [...this.matchedCriteria],
      unmatchedCriteria: [...this.unmatchedCriteria],
      hasPreferences: this.hasPreferences
    };
  }
}

// ============================================================================
// 4. RECOMMENDED ROUTE DETAIL DOMAIN MODEL
// ============================================================================

const recommendedRouteDetailSchema = z.object({
  journeyId: z.string().min(1, 'Journey ID is required'),
  origin: z.string().default(''),
  destination: z.string().default(''),
  departureTime: z.string().regex(timeRegex).default('08:00'),
  estimatedArrivalTime: z.string().regex(timeRegex).default('08:30'),
  baselineArrivalTime: z.string().regex(timeRegex).optional(),
  totalTravelTimeMinutes: z.coerce.number().min(0),
  baselineDurationMinutes: z.coerce.number().min(0).default(0),
  expectedDisruptionDelayMinutes: z.coerce.number().min(0).default(0),
  waitingTimeMinutes: z.coerce.number().min(0).default(0),
  walkingTimeMinutes: z.coerce.number().min(0).default(0),
  transitTimeMinutes: z.coerce.number().min(0).default(0),
  transfers: z.coerce.number().int().min(0).default(0),
  estimatedCostRupees: z.coerce.number().min(0).nullable().default(null),
  reliability: z.string().default('LOW'),
  uncertainty: z.string().default('LOW'),
  primaryMode: z.string().default('transit'),
  modesIncluded: z.array(z.string()).default([]),
  affectedSegments: z.array(z.any()).default([]),
  unavailableSegments: z.array(z.any()).default([]),
  deterministicScore: z.coerce.number().min(0).max(100).nullable().default(null),
  scoreBreakdown: z.record(z.any()).nullable().default(null),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  segments: z.array(z.any()).default([]),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Route Evaluation Engine').toJSON())
});

class RecommendedRouteDetail {
  constructor(data) {
    try {
      const validated = recommendedRouteDetailSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid recommended route detail: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method: cleanly converts a RouteEvaluation, candidate route, or CommuteJourney
   * into a standardized RecommendedRouteDetail.
   *
   * @param {object} route
   * @returns {RecommendedRouteDetail}
   */
  static fromRoute(route) {
    if (!route || typeof route !== 'object') {
      throw new ValidationError('Route object is required to build RecommendedRouteDetail');
    }

    const journeyId = route.journeyId || route.candidateId || route.id || `journey-${Date.now()}`;
    const departureTime = route.departureTime || route.contextualEstimate?.departureTime || '08:00';
    const estimatedArrivalTime = route.updatedArrivalTime ||
      route.estimatedArrivalTime ||
      route.contextualEstimate?.estimatedArrivalTime ||
      '08:30';
    const baselineArrivalTime = route.baselineArrivalTime ||
      route.baselineEstimate?.estimatedArrivalTime ||
      estimatedArrivalTime;

    const totalTravelTimeMinutes = Number(
      route.totalTravelTime ??
      route.totalDurationMinutes ??
      route.estimatedTravelTimeMinutes ??
      route.contextualEstimate?.durationMinutes ??
      30
    );

    const baselineDurationMinutes = Number(
      route.baselineDuration ??
      route.baselineEstimate?.durationMinutes ??
      route.originalDurationMinutes ??
      totalTravelTimeMinutes
    );

    const expectedDisruptionDelayMinutes = Number(
      route.additionalDisruptionDelay ??
      route.disruptionDelayMinutes ??
      route.totalAdditionalDelayMinutes ??
      route.disruptionImpact?.totalDelayMinutes ??
      0
    );

    const waitingTimeMinutes = Number(route.waitingTime ?? route.totalWaitingTimeMinutes ?? 0);
    const walkingTimeMinutes = Number(route.walkingTime ?? route.walkingTimeMinutes ?? route.walking?.durationMinutes ?? 0);
    const transitTimeMinutes = Number(route.transitTime ?? route.transitTimeMinutes ?? 0);
    const transfers = Number(route.transfers ?? route.transferCount ?? route.numberOfTransfers ?? 0);

    const costVal = route.estimatedCostRupees ??
      route.estimatedCost ??
      route.cost?.rupees ??
      null;
    const estimatedCostRupees = (costVal !== null && costVal !== undefined) ? Number(costVal) : null;

    const reliability = route.reliability || 'LOW';
    const uncertainty = route.uncertainty || reliability;
    const primaryMode = route.primaryMode || 'transit';
    const modesIncluded = Array.isArray(route.modesIncluded) && route.modesIncluded.length > 0
      ? route.modesIncluded
      : (Array.isArray(route.transportModes) ? route.transportModes : [primaryMode]);

    const affectedSegments = Array.isArray(route.affectedSegments)
      ? route.affectedSegments
      : (Array.isArray(route.disruptionImpact?.affectedSegments) ? route.disruptionImpact.affectedSegments : []);

    const unavailableSegments = Array.isArray(route.unavailableSegments)
      ? route.unavailableSegments
      : (Array.isArray(route.disruptionImpact?.unavailableSegments) ? route.disruptionImpact.unavailableSegments : []);

    const score = (route.deterministicScore !== undefined && route.deterministicScore !== null)
      ? Number(route.deterministicScore)
      : null;

    const scoreBreakdown = route.scoreBreakdown || null;
    const strengths = Array.isArray(route.strengths) ? [...route.strengths] : [];
    const weaknesses = Array.isArray(route.weaknesses) ? [...route.weaknesses] : [];
    const segments = Array.isArray(route.segments) ? route.segments : [];

    const prov = route.provenance
      ? (typeof route.provenance.toJSON === 'function' ? route.provenance.toJSON() : route.provenance)
      : DataProvenance.estimated('Route Evaluation Engine').toJSON();

    return new RecommendedRouteDetail({
      journeyId,
      origin: route.origin || '',
      destination: route.destination || '',
      departureTime,
      estimatedArrivalTime,
      baselineArrivalTime,
      totalTravelTimeMinutes,
      baselineDurationMinutes,
      expectedDisruptionDelayMinutes,
      waitingTimeMinutes,
      walkingTimeMinutes,
      transitTimeMinutes,
      transfers,
      estimatedCostRupees,
      reliability,
      uncertainty,
      primaryMode,
      modesIncluded,
      affectedSegments,
      unavailableSegments,
      deterministicScore: score,
      scoreBreakdown,
      strengths,
      weaknesses,
      segments,
      provenance: prov
    });
  }

  toJSON() {
    return {
      journeyId: this.journeyId,
      origin: this.origin,
      destination: this.destination,
      departureTime: this.departureTime,
      estimatedArrivalTime: this.estimatedArrivalTime,
      baselineArrivalTime: this.baselineArrivalTime,
      totalTravelTimeMinutes: this.totalTravelTimeMinutes,
      baselineDurationMinutes: this.baselineDurationMinutes,
      expectedDisruptionDelayMinutes: this.expectedDisruptionDelayMinutes,
      waitingTimeMinutes: this.waitingTimeMinutes,
      walkingTimeMinutes: this.walkingTimeMinutes,
      transitTimeMinutes: this.transitTimeMinutes,
      transfers: this.transfers,
      estimatedCostRupees: this.estimatedCostRupees,
      reliability: this.reliability,
      uncertainty: this.uncertainty,
      primaryMode: this.primaryMode,
      modesIncluded: [...this.modesIncluded],
      affectedSegments: this.affectedSegments.map(s => ({ ...s })),
      unavailableSegments: this.unavailableSegments.map(s => ({ ...s })),
      deterministicScore: this.deterministicScore,
      scoreBreakdown: this.scoreBreakdown ? { ...this.scoreBreakdown } : null,
      strengths: [...this.strengths],
      weaknesses: [...this.weaknesses],
      segments: this.segments.map(s => (s && typeof s.toJSON === 'function' ? s.toJSON() : s)),
      provenance: this.provenance.toJSON()
    };
  }
}

// ============================================================================
// 5. PERSONALIZED COMMUTE RECOMMENDATION DOMAIN MODEL
// ============================================================================

const personalizedCommuteRecommendationSchema = z.object({
  id: z.string().min(1, 'Recommendation ID is required'),
  studentId: z.string().nullable().default(null),
  status: personalizedRecommendationStatusEnum.default(RECOMMENDATION_STATUS_TYPES.RECOMMENDED),
  isFallback: z.boolean().default(false),
  fallbackReason: z.string().nullable().default(null),
  fallbackGuidance: z.array(z.string()).default([]),
  selectedRoute: recommendedRouteDetailSchema.nullable().default(null),
  alternativeRoutes: z.array(recommendedRouteDetailSchema).default([]),
  estimatedTravelTimeMinutes: z.coerce.number().min(0).nullable().default(null),
  estimatedArrivalTime: z.string().regex(timeRegex).nullable().default(null),
  departureTime: z.string().regex(timeRegex).nullable().default(null),
  expectedDisruptionDelayMinutes: z.coerce.number().min(0).default(0),
  estimatedCostRupees: z.coerce.number().min(0).nullable().default(null),
  reliability: z.string().default('LOW'),
  uncertainty: z.string().default('LOW'),
  preferenceAlignment: preferenceAlignmentSchema.default(() => ({})),
  recommendationReasons: z.array(recommendationReasonSchema).default([]),
  tradeOffs: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Personalized Commute Recommendation Model').toJSON()),
  provenanceSummary: z.object({
    dataTiers: z.array(z.string()).default(['ESTIMATED']),
    allVerified: z.boolean().default(false),
    hasUnverifiedData: z.boolean().default(true)
  }).default(() => ({
    dataTiers: ['ESTIMATED'],
    allVerified: false,
    hasUnverifiedData: true
  })),
  contextSummary: z.record(z.any()).default({}),
  generatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class PersonalizedCommuteRecommendation {
  constructor(data) {
    try {
      const validated = personalizedCommuteRecommendationSchema.parse(data);
      Object.assign(this, validated);
      this.selectedRoute = validated.selectedRoute ? new RecommendedRouteDetail(validated.selectedRoute) : null;
      this.alternativeRoutes = (validated.alternativeRoutes || []).map(r => new RecommendedRouteDetail(r));
      this.preferenceAlignment = new PreferenceAlignment(validated.preferenceAlignment);
      this.recommendationReasons = (validated.recommendationReasons || []).map(r => new RecommendationReason(r));
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid personalized commute recommendation: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Checks whether this recommendation is actionable by the student.
   * False when in an infeasible or non-executable state without a selected route.
   *
   * @returns {boolean}
   */
  isActionable() {
    return this.status !== RECOMMENDATION_STATUS_TYPES.INFEASIBLE &&
      !this.isFallback &&
      this.selectedRoute !== null;
  }

  /**
   * Checks whether fallback mode is active.
   *
   * @returns {boolean}
   */
  isFallbackActive() {
    return this.isFallback || this.status === RECOMMENDATION_STATUS_TYPES.FALLBACK;
  }

  /**
   * Checks if alternative routes are available.
   *
   * @returns {boolean}
   */
  hasAlternatives() {
    return this.alternativeRoutes.length > 0;
  }

  /**
   * Checks if trade-offs are present.
   *
   * @returns {boolean}
   */
  hasTradeOffs() {
    return this.tradeOffs.length > 0;
  }

  /**
   * Checks if active warnings are present.
   *
   * @returns {boolean}
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * Checks if the recommendation aligns with student preferences.
   *
   * @returns {boolean}
   */
  isPreferenceAligned() {
    return this.preferenceAlignment.isAligned;
  }

  /**
   * Creates an honest Fallback recommendation when no routes are feasible
   * or when all viable routes violate hard constraints.
   *
   * @param {object} params
   * @param {string} [params.id]
   * @param {string} [params.studentId]
   * @param {string} params.reason - Explanation of why fallback occurred
   * @param {Array<string>} [params.guidance] - Actionable suggestions for the student
   * @param {object} [params.studentPreferences] - Optional student preferences
   * @param {object} [params.context] - Environmental context summary
   * @param {Array<object>} [params.rejectedRoutes] - Itemized rejected routes with violation codes
   * @returns {PersonalizedCommuteRecommendation}
   */
  static createFallback(params = {}) {
    const reason = params.reason || 'No feasible routes satisfy your schedule constraints and transport operating windows';
    const guidance = Array.isArray(params.guidance) && params.guidance.length > 0
      ? params.guidance
      : [
          'Consider departing 15–20 minutes earlier to widen viable timetable options.',
          'Relax walking limits or allow shared transit modes (auto/bus) to discover connected corridors.',
          'Check active corridor alerts for clearance updates on suspended transport links.'
        ];

    const alignment = PreferenceAlignment.evaluate(null, params.studentPreferences);
    const recId = params.id || `rec-fallback-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const fallbackReason = new RecommendationReason({
      category: REASON_CATEGORIES.FALLBACK_GUIDANCE,
      headline: 'No Feasible Direct Commute Available',
      detail: reason,
      priority: 1,
      dataTier: PROVENANCE_TIERS.VERIFIED
    });

    const prov = DataProvenance.estimated('Personalized Recommendation Fallback Engine', 'Deterministic fallback calculation').toJSON();

    return new PersonalizedCommuteRecommendation({
      id: recId,
      studentId: params.studentId || null,
      status: RECOMMENDATION_STATUS_TYPES.FALLBACK,
      isFallback: true,
      fallbackReason: reason,
      fallbackGuidance: guidance,
      selectedRoute: null,
      alternativeRoutes: [],
      estimatedTravelTimeMinutes: null,
      estimatedArrivalTime: null,
      departureTime: null,
      expectedDisruptionDelayMinutes: 0,
      estimatedCostRupees: null,
      reliability: 'SEVERE',
      uncertainty: 'SEVERE',
      preferenceAlignment: alignment.toJSON(),
      recommendationReasons: [fallbackReason.toJSON()],
      tradeOffs: ['All potential route candidates are currently constrained, disrupted, or unavailable.'],
      warnings: [reason],
      provenance: prov,
      provenanceSummary: {
        dataTiers: ['VERIFIED', 'ESTIMATED'],
        allVerified: false,
        hasUnverifiedData: true
      },
      contextSummary: params.context || {},
      generatedAt: Date.now()
    });
  }

  /**
   * Factory method: constructs a rich PersonalizedCommuteRecommendation from an
   * evaluated route (RouteEvaluation or candidate route) and optional comparison context.
   *
   * Formulates human-understandable recommendation reasons that explain WHY the
   * route was selected rather than relying on a raw score.
   *
   * @param {object} route - Selected RouteEvaluation, CommuteJourney, or candidate
   * @param {object} [options={}]
   * @param {Array<object>} [options.alternatives=[]] - Alternative evaluated routes
   * @param {object} [options.preferences=null] - Student preferences
   * @param {object} [options.context={}] - Unified commute context
   * @param {string} [options.studentId=null] - Student ID
   * @param {string} [options.targetArrivalTime] - Requested arrival deadline
   * @returns {PersonalizedCommuteRecommendation}
   */
  static fromEvaluatedRoute(route, options = {}) {
    if (!route || typeof route !== 'object') {
      throw new ValidationError('A valid route object is required to build a recommendation');
    }

    const selected = RecommendedRouteDetail.fromRoute(route);
    const alternatives = (options.alternatives || []).map(alt => RecommendedRouteDetail.fromRoute(alt));
    const alignment = PreferenceAlignment.evaluate(selected, options.preferences);

    // 1. Synthesize Explainable Recommendation Reasons (never raw score alone)
    const reasons = [];

    // Reason A: Schedule & Arrival Timing
    if (options.targetArrivalTime && selected.estimatedArrivalTime) {
      if (selected.estimatedArrivalTime <= options.targetArrivalTime) {
        reasons.push(new RecommendationReason({
          category: REASON_CATEGORIES.SCHEDULE_DEADLINE,
          headline: `Arrives comfortably by ${selected.estimatedArrivalTime}`,
          detail: `Arrives at destination by ${selected.estimatedArrivalTime}, meeting your ${options.targetArrivalTime} target deadline.`,
          priority: 1,
          dataTier: selected.provenance?.sourceTier || PROVENANCE_TIERS.VERIFIED
        }));
      }
    } else if (selected.estimatedArrivalTime) {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.EFFICIENCY,
        headline: `Total commute duration: ${selected.totalTravelTimeMinutes} mins`,
        detail: `Departing at ${selected.departureTime} with estimated arrival at ${selected.estimatedArrivalTime}.`,
        priority: 1,
        dataTier: selected.provenance?.sourceTier || PROVENANCE_TIERS.ESTIMATED
      }));
    }

    // Reason B: Disruption Avoidance or Clean Journey
    if (selected.expectedDisruptionDelayMinutes === 0) {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.DISRUPTION_AVOIDANCE,
        headline: 'Clear corridor without active disruption delays',
        detail: 'Selected path operates on unobstructed transit segments free from reported delays.',
        priority: 2,
        dataTier: PROVENANCE_TIERS.VERIFIED
      }));
    } else {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.DISRUPTION_AVOIDANCE,
        headline: `Buffered for +${selected.expectedDisruptionDelayMinutes} min disruption delay`,
        detail: `Includes contextual delay buffers of ${selected.expectedDisruptionDelayMinutes} minutes for active corridor congestion.`,
        priority: 3,
        dataTier: PROVENANCE_TIERS.USER_REPORTED
      }));
    }

    // Reason C: Preference Alignment
    if (alignment.hasPreferences) {
      if (alignment.preferredModesMatched.length > 0) {
        reasons.push(new RecommendationReason({
          category: REASON_CATEGORIES.PREFERENCE_MATCH,
          headline: `Matches preferred modes: ${alignment.preferredModesMatched.join(', ')}`,
          detail: `Route utilizes your preferred modes (${alignment.preferredModesMatched.join(', ')}).`,
          priority: 2,
          dataTier: PROVENANCE_TIERS.VERIFIED
        }));
      }
      if (alignment.isWalkingCompliant === true) {
        reasons.push(new RecommendationReason({
          category: REASON_CATEGORIES.LOW_WALKING,
          headline: `Walking burden within limit (${selected.walkingTimeMinutes} mins)`,
          detail: `Total walking time of ${selected.walkingTimeMinutes} min is within your ${alignment.walkingToleranceMinutes} min tolerance.`,
          priority: 3,
          dataTier: PROVENANCE_TIERS.ESTIMATED
        }));
      }
    } else if (selected.walkingTimeMinutes <= 10) {
      reasons.push(new RecommendationReason({
        category: REASON_CATEGORIES.LOW_WALKING,
        headline: `Low walking burden (${selected.walkingTimeMinutes} mins)`,
        detail: `Requires only ${selected.walkingTimeMinutes} minutes of walking across the entire journey.`,
        priority: 3,
        dataTier: PROVENANCE_TIERS.ESTIMATED
      }));
    }

    // Reason D: Cost & Budget
    if (selected.estimatedCostRupees !== null) {
      if (selected.estimatedCostRupees === 0) {
        reasons.push(new RecommendationReason({
          category: REASON_CATEGORIES.AFFORDABILITY,
          headline: 'Zero fare (walking commute)',
          detail: 'No transit fare required for this direct pedestrian route.',
          priority: 4,
          dataTier: PROVENANCE_TIERS.VERIFIED
        }));
      } else {
        reasons.push(new RecommendationReason({
          category: REASON_CATEGORIES.AFFORDABILITY,
          headline: `Estimated fare: ₹${selected.estimatedCostRupees}`,
          detail: `Affordable student commute at approximately ₹${selected.estimatedCostRupees}.`,
          priority: 4,
          dataTier: PROVENANCE_TIERS.VERIFIED
        }));
      }
    }

    // 2. Synthesize Trade-offs & Warnings
    const tradeOffs = Array.isArray(options.tradeOffs) ? [...options.tradeOffs] : [];
    if (selected.transfers > 0) {
      tradeOffs.push(`Requires ${selected.transfers} modal interchange transfer(s).`);
    } else {
      tradeOffs.push('Direct single-mode journey with 0 transfers.');
    }
    if (alternatives.length > 0) {
      const alt = alternatives[0];
      if (alt.totalTravelTimeMinutes < selected.totalTravelTimeMinutes) {
        tradeOffs.push(`Alternative ${alt.primaryMode} route is ${selected.totalTravelTimeMinutes - alt.totalTravelTimeMinutes} mins faster but has different trade-offs.`);
      }
    }

    const warnings = Array.isArray(options.warnings) ? [...options.warnings] : [];
    if (selected.expectedDisruptionDelayMinutes > 10) {
      warnings.push(`Expected disruption delay of +${selected.expectedDisruptionDelayMinutes} minutes on this route.`);
    }
    if (selected.reliability === 'HIGH' || selected.reliability === 'SEVERE') {
      warnings.push('Elevated route uncertainty due to real-time traffic or weather conditions.');
    }
    if (options.context?.weatherContext?.condition && options.context.weatherContext.condition !== 'clear') {
      warnings.push(`Weather alert: active ${options.context.weatherContext.condition} may affect walking and road legs.`);
    }

    // Determine Recommendation Status
    let status = RECOMMENDATION_STATUS_TYPES.RECOMMENDED;
    if (selected.expectedDisruptionDelayMinutes >= 20 || selected.reliability === 'SEVERE') {
      status = RECOMMENDATION_STATUS_TYPES.CAUTION;
    } else if (!alignment.isAligned) {
      status = RECOMMENDATION_STATUS_TYPES.DEGRADED;
    } else if (reasons.length > 0) {
      status = RECOMMENDATION_STATUS_TYPES.RECOMMENDED;
    } else {
      status = RECOMMENDATION_STATUS_TYPES.FEASIBLE;
    }

    // Provenance Summary
    const provTiers = new Set([selected.provenance.sourceTier]);
    alternatives.forEach(alt => provTiers.add(alt.provenance.sourceTier));
    const dataTiers = Array.from(provTiers);
    const allVerified = dataTiers.length === 1 && dataTiers[0] === PROVENANCE_TIERS.VERIFIED;
    const hasUnverifiedData = dataTiers.some(t => t !== PROVENANCE_TIERS.VERIFIED);

    const recId = options.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    return new PersonalizedCommuteRecommendation({
      id: recId,
      studentId: options.studentId || null,
      status,
      isFallback: false,
      fallbackReason: null,
      fallbackGuidance: [],
      selectedRoute: selected.toJSON(),
      alternativeRoutes: alternatives.map(a => a.toJSON()),
      estimatedTravelTimeMinutes: selected.totalTravelTimeMinutes,
      estimatedArrivalTime: selected.estimatedArrivalTime,
      departureTime: selected.departureTime,
      expectedDisruptionDelayMinutes: selected.expectedDisruptionDelayMinutes,
      estimatedCostRupees: selected.estimatedCostRupees,
      reliability: selected.reliability,
      uncertainty: selected.uncertainty,
      preferenceAlignment: alignment.toJSON(),
      recommendationReasons: reasons.map(r => r.toJSON()),
      tradeOffs,
      warnings,
      provenance: selected.provenance.toJSON(),
      provenanceSummary: {
        dataTiers,
        allVerified,
        hasUnverifiedData
      },
      contextSummary: options.context || {},
      generatedAt: options.generatedAt || Date.now()
    });
  }

  toJSON() {
    return {
      id: this.id,
      studentId: this.studentId,
      status: this.status,
      isFallback: this.isFallback,
      fallbackReason: this.fallbackReason,
      fallbackGuidance: [...this.fallbackGuidance],
      selectedRoute: this.selectedRoute ? this.selectedRoute.toJSON() : null,
      alternativeRoutes: this.alternativeRoutes.map(a => a.toJSON()),
      estimatedTravelTimeMinutes: this.estimatedTravelTimeMinutes,
      estimatedArrivalTime: this.estimatedArrivalTime,
      departureTime: this.departureTime,
      expectedDisruptionDelayMinutes: this.expectedDisruptionDelayMinutes,
      estimatedCostRupees: this.estimatedCostRupees,
      reliability: this.reliability,
      uncertainty: this.uncertainty,
      preferenceAlignment: this.preferenceAlignment.toJSON(),
      recommendationReasons: this.recommendationReasons.map(r => r.toJSON()),
      tradeOffs: [...this.tradeOffs],
      warnings: [...this.warnings],
      provenance: this.provenance.toJSON(),
      provenanceSummary: {
        dataTiers: [...this.provenanceSummary.dataTiers],
        allVerified: this.provenanceSummary.allVerified,
        hasUnverifiedData: this.provenanceSummary.hasUnverifiedData
      },
      contextSummary: { ...this.contextSummary },
      generatedAt: this.generatedAt
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants & Enums
  RECOMMENDATION_STATUS_TYPES,
  REASON_CATEGORIES,
  ALIGNMENT_LEVELS,
  personalizedRecommendationStatusEnum,
  reasonCategoryEnum,
  alignmentLevelEnum,

  // Schemas
  recommendationReasonSchema,
  preferenceAlignmentSchema,
  recommendedRouteDetailSchema,
  personalizedCommuteRecommendationSchema,

  // Domain Classes
  RecommendationReason,
  PreferenceAlignment,
  RecommendedRouteDetail,
  PersonalizedCommuteRecommendation
};
