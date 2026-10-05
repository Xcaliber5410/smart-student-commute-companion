/**
 * Smart Commute Domain Contracts & Value Objects
 *
 * Formal domain models, value objects, enums, and validation schemas
 * for the Smart Student Commute Companion (P9).
 *
 * Covers:
 * - 4-tier data provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 * - Transport modes and mode classification
 * - Disruption types and severity normalization
 * - Commute constraints (budget, walking, modes, preferences)
 * - Travel estimates with confidence intervals
 * - Route segments (RouteLeg) and Multimodal Commute Routes (CommuteRoute)
 * - Recommendation status, departure windows, and recommendation metadata
 */

const { z } = require('zod');

// ============================================================================
// 1. CONSTANTS & ENUMS
// ============================================================================

/**
 * Supported transport modes for student commuting in Mumbai.
 */
const TRANSPORT_MODES = Object.freeze({
  TRAIN: 'train',
  METRO: 'metro',
  BUS: 'bus',
  AUTO: 'auto',
  SHARED_AUTO: 'shared_auto',
  WALK: 'walk'
});

const transportModeEnum = z.enum([
  'train',
  'metro',
  'bus',
  'auto',
  'shared_auto',
  'walk'
]);

/**
 * 4-Tier Provenance Classification Scheme.
 * Distinguishes source authority, crowdsourced inputs, algorithmic estimates, and AI/rule synthesis.
 */
const PROVENANCE_TIERS = Object.freeze({
  VERIFIED: 'VERIFIED',
  USER_REPORTED: 'USER_REPORTED',
  ESTIMATED: 'ESTIMATED',
  SYNTHETIC: 'SYNTHETIC'
});

const provenanceTierEnum = z.enum([
  'VERIFIED',
  'USER_REPORTED',
  'ESTIMATED',
  'SYNTHETIC'
]);

const PROVENANCE_CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

const provenanceConfidenceEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);

/**
 * Disruption types covering both transit and road networks.
 */
const DISRUPTION_TYPES = Object.freeze({
  DELAY: 'delay',
  CANCELLATION: 'cancellation',
  CROWDING: 'crowding',
  AUTO_REFUSAL: 'auto_refusal',
  WATERLOGGING: 'waterlogging',
  MAINTENANCE: 'maintenance',
  STRIKE: 'strike',
  OTHER: 'other'
});

const disruptionTypeEnum = z.enum([
  'delay',
  'cancellation',
  'crowding',
  'auto_refusal',
  'waterlogging',
  'maintenance',
  'strike',
  'other'
]);

/**
 * Disruption severity levels.
 */
const DISRUPTION_SEVERITIES = Object.freeze({
  MINOR: 'minor',
  MODERATE: 'moderate',
  SEVERE: 'severe',
  CRITICAL: 'critical'
});

const disruptionSeverityEnum = z.enum([
  'minor',
  'moderate',
  'severe',
  'critical'
]);

/**
 * Commute route optimization preferences.
 */
const ROUTE_PREFERENCES = Object.freeze({
  BALANCED: 'balanced',
  FASTEST: 'fastest',
  CHEAPEST: 'cheapest',
  RAIN_SAFE: 'rain-safe'
});

const routePreferenceEnum = z.enum([
  'balanced',
  'fastest',
  'cheapest',
  'rain-safe'
]);

/**
 * Route leg types distinguishing walking, scheduled transit, and road legs.
 */
const LEG_TYPES = Object.freeze({
  WALK: 'WALK',
  TRANSIT: 'TRANSIT',
  AUTO: 'AUTO',
  SHARED_AUTO: 'SHARED_AUTO'
});

const legTypeEnum = z.enum([
  'WALK',
  'TRANSIT',
  'AUTO',
  'SHARED_AUTO'
]);

/**
 * Recommendation lifecycle and viability status.
 */
const RECOMMENDATION_STATUS = Object.freeze({
  OPTIMAL: 'OPTIMAL',
  VIABLE: 'VIABLE',
  SUBOPTIMAL: 'SUBOPTIMAL',
  COMPROMISED: 'COMPROMISED',
  INFEASIBLE: 'INFEASIBLE'
});

const recommendationStatusEnum = z.enum([
  'OPTIMAL',
  'VIABLE',
  'SUBOPTIMAL',
  'COMPROMISED',
  'INFEASIBLE'
]);

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Checks whether a mode is fixed-guideway transit (rail/metro/bus).
 * @param {string} mode
 * @returns {boolean}
 */
function isTransitMode(mode) {
  return mode === TRANSPORT_MODES.TRAIN || mode === TRANSPORT_MODES.METRO || mode === TRANSPORT_MODES.BUS;
}

/**
 * Checks whether a mode is road-based (bus/auto/shared_auto).
 * @param {string} mode
 * @returns {boolean}
 */
function isRoadMode(mode) {
  return mode === TRANSPORT_MODES.BUS || mode === TRANSPORT_MODES.AUTO || mode === TRANSPORT_MODES.SHARED_AUTO;
}

/**
 * Checks if a mode is a valid transport mode.
 * @param {string} mode
 * @returns {boolean}
 */
function isValidTransportMode(mode) {
  return Object.values(TRANSPORT_MODES).includes(mode);
}

/**
 * Normalizes legacy or varied disruption severity strings (e.g. 'low', 'medium', 'high')
 * into standardized disruption severity.
 * @param {string} input
 * @returns {'minor'|'moderate'|'severe'|'critical'}
 */
function normalizeDisruptionSeverity(input) {
  if (!input) return DISRUPTION_SEVERITIES.MODERATE;
  const lower = String(input).toLowerCase().trim();
  switch (lower) {
    case 'low':
    case 'minor':
      return DISRUPTION_SEVERITIES.MINOR;
    case 'medium':
    case 'moderate':
      return DISRUPTION_SEVERITIES.MODERATE;
    case 'high':
    case 'severe':
      return DISRUPTION_SEVERITIES.SEVERE;
    case 'critical':
      return DISRUPTION_SEVERITIES.CRITICAL;
    default:
      return DISRUPTION_SEVERITIES.MODERATE;
  }
}

// ============================================================================
// 3. PROVENANCE CONTRACT
// ============================================================================

const provenanceSchema = z.object({
  sourceTier: provenanceTierEnum,
  provider: z.string().min(1, 'Provider name is required'),
  confidence: provenanceConfidenceEnum.default(PROVENANCE_CONFIDENCE.HIGH),
  lastUpdated: z.number().int().positive().default(() => Date.now()),
  description: z.string().default('')
});

class DataProvenance {
  constructor(data) {
    const validated = provenanceSchema.parse(data);
    Object.assign(this, validated);
  }

  static verified(provider, description = '', confidence = PROVENANCE_CONFIDENCE.HIGH) {
    return new DataProvenance({
      sourceTier: PROVENANCE_TIERS.VERIFIED,
      provider,
      confidence,
      description,
      lastUpdated: Date.now()
    });
  }

  static userReported(provider, description = '', confidence = PROVENANCE_CONFIDENCE.MEDIUM) {
    return new DataProvenance({
      sourceTier: PROVENANCE_TIERS.USER_REPORTED,
      provider,
      confidence,
      description,
      lastUpdated: Date.now()
    });
  }

  static estimated(provider, description = '', confidence = PROVENANCE_CONFIDENCE.MEDIUM) {
    return new DataProvenance({
      sourceTier: PROVENANCE_TIERS.ESTIMATED,
      provider,
      confidence,
      description,
      lastUpdated: Date.now()
    });
  }

  static synthetic(provider, description = '', confidence = PROVENANCE_CONFIDENCE.HIGH) {
    return new DataProvenance({
      sourceTier: PROVENANCE_TIERS.SYNTHETIC,
      provider,
      confidence,
      description,
      lastUpdated: Date.now()
    });
  }

  isVerified() {
    return this.sourceTier === PROVENANCE_TIERS.VERIFIED;
  }

  isUserReported() {
    return this.sourceTier === PROVENANCE_TIERS.USER_REPORTED;
  }

  isEstimated() {
    return this.sourceTier === PROVENANCE_TIERS.ESTIMATED;
  }

  isSynthetic() {
    return this.sourceTier === PROVENANCE_TIERS.SYNTHETIC;
  }

  toJSON() {
    return {
      sourceTier: this.sourceTier,
      provider: this.provider,
      confidence: this.confidence,
      lastUpdated: this.lastUpdated,
      description: this.description
    };
  }
}

// ============================================================================
// 4. DISRUPTION IMPACT CONTRACT
// ============================================================================

const disruptionImpactSchema = z.object({
  id: z.string().optional(),
  type: disruptionTypeEnum,
  severity: disruptionSeverityEnum,
  affectedMode: transportModeEnum,
  corridorOrArea: z.string().min(2, 'Corridor or area is required').max(100),
  description: z.string().max(300).default(''),
  estimatedDelayMinutes: z.number().int().min(0).default(0),
  provenance: provenanceSchema.default(() => DataProvenance.userReported('Community Commuter Feed').toJSON())
});

// ============================================================================
// 5. COMMUTE CONSTRAINT CONTRACT
// ============================================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const commuteConstraintSchema = z.object({
  maxBudgetRupees: z.coerce.number().min(0, 'Budget cannot be negative').max(2000, 'Budget cannot exceed ₹2000').default(100),
  walkingToleranceMinutes: z.coerce.number().int().min(5, 'Walking tolerance must be at least 5 minutes').max(60, 'Walking tolerance cannot exceed 60 minutes').default(20),
  preferredModes: z.array(transportModeEnum).min(1, 'At least one transport mode must be selected').default([
    TRANSPORT_MODES.TRAIN,
    TRANSPORT_MODES.METRO,
    TRANSPORT_MODES.BUS,
    TRANSPORT_MODES.AUTO,
    TRANSPORT_MODES.WALK
  ]),
  preference: routePreferenceEnum.default(ROUTE_PREFERENCES.BALANCED),
  maxTransfers: z.coerce.number().int().min(0, 'Transfers cannot be negative').max(5, 'Transfers cannot exceed 5').default(3),
  desiredArrivalTime: z.string().trim().regex(timeRegex, 'Desired arrival time must be in HH:MM format').optional(),
  requireWheelchairAccess: z.boolean().default(false),
  allowSharedRides: z.boolean().default(true)
});

class CommuteConstraint {
  constructor(data = {}) {
    const validated = commuteConstraintSchema.parse(data);
    Object.assign(this, validated);
  }

  allowsMode(mode) {
    return this.preferredModes.includes(mode);
  }

  isWithinBudget(fareRupees) {
    return Number(fareRupees) <= this.maxBudgetRupees;
  }

  isWithinWalkingLimit(minutes) {
    return Number(minutes) <= this.walkingToleranceMinutes;
  }

  toJSON() {
    return {
      maxBudgetRupees: this.maxBudgetRupees,
      walkingToleranceMinutes: this.walkingToleranceMinutes,
      preferredModes: [...this.preferredModes],
      preference: this.preference,
      maxTransfers: this.maxTransfers,
      desiredArrivalTime: this.desiredArrivalTime || null,
      requireWheelchairAccess: this.requireWheelchairAccess,
      allowSharedRides: this.allowSharedRides
    };
  }
}

// ============================================================================
// 6. TRAVEL ESTIMATE CONTRACT
// ============================================================================

const confidenceIntervalSchema = z.object({
  minMinutes: z.number().min(0, 'minMinutes must be >= 0'),
  maxMinutes: z.number().min(0, 'maxMinutes must be >= 0')
}).refine(data => data.minMinutes <= data.maxMinutes, {
  message: 'minMinutes must be less than or equal to maxMinutes'
});

const travelEstimateSchema = z.object({
  totalDurationMinutes: z.number().min(0, 'Total duration must be >= 0'),
  walkingDurationMinutes: z.number().min(0).default(0),
  transitDurationMinutes: z.number().min(0).default(0),
  totalDistanceKm: z.number().min(0).default(0),
  walkingDistanceKm: z.number().min(0).default(0),
  totalFareRupees: z.number().min(0).default(0),
  transferCount: z.number().int().min(0).default(0),
  confidenceInterval: confidenceIntervalSchema,
  provenance: provenanceSchema.default(() => DataProvenance.estimated('GTFS & OSRM Engine').toJSON())
});

class TravelEstimate {
  constructor(data) {
    const validated = travelEstimateSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  getBufferMinutes() {
    return Math.max(0, this.confidenceInterval.maxMinutes - this.totalDurationMinutes);
  }

  isZeroFare() {
    return this.totalFareRupees === 0;
  }

  toJSON() {
    return {
      totalDurationMinutes: this.totalDurationMinutes,
      walkingDurationMinutes: this.walkingDurationMinutes,
      transitDurationMinutes: this.transitDurationMinutes,
      totalDistanceKm: this.totalDistanceKm,
      walkingDistanceKm: this.walkingDistanceKm,
      totalFareRupees: this.totalFareRupees,
      transferCount: this.transferCount,
      confidenceInterval: {
        minMinutes: this.confidenceInterval.minMinutes,
        maxMinutes: this.confidenceInterval.maxMinutes
      },
      provenance: this.provenance.toJSON()
    };
  }
}

// ============================================================================
// 7. ROUTE SEGMENT (LEG) CONTRACT
// ============================================================================

const lineInfoSchema = z.object({
  agency: z.string().default(''),
  lineName: z.string().default(''),
  routeShortName: z.string().default(''),
  platform: z.string().optional().default(''),
  headsign: z.string().optional().default('')
}).nullable().optional();

const routeLegSchema = z.object({
  legIndex: z.number().int().min(0),
  type: legTypeEnum,
  mode: transportModeEnum,
  from: z.string().min(2, 'Origin point is required').max(100),
  to: z.string().min(2, 'Destination point is required').max(100),
  departureTime: z.string().regex(timeRegex, 'Departure time must be HH:MM'),
  arrivalTime: z.string().regex(timeRegex, 'Arrival time must be HH:MM'),
  durationMinutes: z.number().min(0),
  distanceKm: z.number().min(0).default(0),
  fareRupees: z.number().min(0).default(0),
  lineInfo: lineInfoSchema.default(null),
  instructions: z.string().default(''),
  provenance: provenanceSchema
});

class RouteLeg {
  constructor(data) {
    const validated = routeLegSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  isTransit() {
    return this.type === LEG_TYPES.TRANSIT;
  }

  isWalking() {
    return this.type === LEG_TYPES.WALK;
  }

  isRoad() {
    return this.type === LEG_TYPES.AUTO || this.type === LEG_TYPES.SHARED_AUTO;
  }

  toJSON() {
    return {
      legIndex: this.legIndex,
      type: this.type,
      mode: this.mode,
      from: this.from,
      to: this.to,
      departureTime: this.departureTime,
      arrivalTime: this.arrivalTime,
      durationMinutes: this.durationMinutes,
      distanceKm: this.distanceKm,
      fareRupees: this.fareRupees,
      lineInfo: this.lineInfo ? { ...this.lineInfo } : null,
      instructions: this.instructions,
      provenance: this.provenance.toJSON()
    };
  }
}

// ============================================================================
// 8. COMMUTE ROUTE CONTRACT
// ============================================================================

const routeScoresSchema = z.object({
  compositeScore: z.number().min(0).max(100),
  timeScore: z.number().min(0).max(100).default(100),
  costScore: z.number().min(0).max(100).default(100),
  walkingScore: z.number().min(0).max(100).default(100),
  reliabilityScore: z.number().min(0).max(100).default(100),
  disruptionPenalty: z.number().min(0).default(0),
  weatherPenalty: z.number().min(0).default(0)
});

const commuteRouteSchema = z.object({
  id: z.string().min(1, 'Route ID is required'),
  title: z.string().min(2, 'Route title is required').max(100),
  summary: z.string().default(''),
  primaryMode: transportModeEnum,
  modesIncluded: z.array(transportModeEnum).min(1, 'At least one mode required'),
  estimate: travelEstimateSchema,
  legs: z.array(routeLegSchema).min(1, 'Route must have at least one segment/leg'),
  scores: routeScoresSchema,
  tags: z.array(z.string()).default([]),
  isViable: z.boolean().default(true),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Deterministic Routing Engine').toJSON())
});

class CommuteRoute {
  constructor(data) {
    const validated = commuteRouteSchema.parse(data);
    Object.assign(this, validated);
    this.estimate = new TravelEstimate(validated.estimate);
    this.legs = validated.legs.map(leg => new RouteLeg(leg));
    this.provenance = new DataProvenance(validated.provenance);
  }

  getTransferCount() {
    return Math.max(0, this.legs.filter(l => l.isTransit()).length - 1);
  }

  getTotalFare() {
    return this.estimate.totalFareRupees;
  }

  getTotalDuration() {
    return this.estimate.totalDurationMinutes;
  }

  getWalkingMinutes() {
    return this.estimate.walkingDurationMinutes;
  }

  hasMode(mode) {
    return this.modesIncluded.includes(mode);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      summary: this.summary,
      primaryMode: this.primaryMode,
      modesIncluded: [...this.modesIncluded],
      estimate: this.estimate.toJSON(),
      legs: this.legs.map(l => l.toJSON()),
      scores: { ...this.scores },
      tags: [...this.tags],
      isViable: this.isViable,
      provenance: this.provenance.toJSON()
    };
  }
}

// ============================================================================
// 9. DEPARTURE WINDOW & RECOMMENDATION METADATA CONTRACT
// ============================================================================

const departureWindowSchema = z.object({
  optimalDepartureTime: z.string().regex(timeRegex, 'Time must be HH:MM'),
  latestSafeDepartureTime: z.string().regex(timeRegex, 'Time must be HH:MM'),
  recommendedWindowStart: z.string().regex(timeRegex, 'Time must be HH:MM'),
  recommendedWindowEnd: z.string().regex(timeRegex, 'Time must be HH:MM'),
  bufferMinutes: z.number().min(0).default(10),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Departure Window Calculator').toJSON())
});

class DepartureWindow {
  constructor(data) {
    const validated = departureWindowSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  toJSON() {
    return {
      optimalDepartureTime: this.optimalDepartureTime,
      latestSafeDepartureTime: this.latestSafeDepartureTime,
      recommendedWindowStart: this.recommendedWindowStart,
      recommendedWindowEnd: this.recommendedWindowEnd,
      bufferMinutes: this.bufferMinutes,
      provenance: this.provenance.toJSON()
    };
  }
}

const recommendationExplanationSchema = z.object({
  summary: z.string().min(1, 'Summary explanation is required'),
  primaryReason: z.string().default(''),
  tradeOffs: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  aiGenerated: z.boolean().default(false),
  aiProvider: z.string().default('Deterministic Rule Engine'),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Explanation Engine').toJSON())
});

class RecommendationExplanation {
  constructor(data) {
    const validated = recommendationExplanationSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  toJSON() {
    return {
      summary: this.summary,
      primaryReason: this.primaryReason,
      tradeOffs: [...this.tradeOffs],
      warnings: [...this.warnings],
      aiGenerated: this.aiGenerated,
      aiProvider: this.aiProvider,
      provenance: this.provenance.toJSON()
    };
  }
}

// ============================================================================
// 10. COMMUTE RECOMMENDATION CONTRACT
// ============================================================================

const weatherContextSchema = z.object({
  condition: z.string().default('clear'),
  rainProbability: z.number().min(0).max(100).default(0),
  temperatureC: z.number().optional(),
  advisory: z.string().default('')
});

const commuteRecommendationSchema = z.object({
  id: z.string().min(1, 'Recommendation ID is required'),
  requestId: z.string().min(1, 'Request ID is required'),
  status: recommendationStatusEnum,
  recommendedRoute: commuteRouteSchema.nullable(),
  alternatives: z.array(commuteRouteSchema).default([]),
  departureWindows: departureWindowSchema,
  explanation: recommendationExplanationSchema,
  disruptionsConsidered: z.array(disruptionImpactSchema).default([]),
  weatherContext: weatherContextSchema.default({ condition: 'clear', rainProbability: 0, advisory: '' }),
  generatedAt: z.number().int().positive().default(() => Date.now()),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Multimodal Recommendation Engine').toJSON())
});

class CommuteRecommendation {
  constructor(data) {
    const validated = commuteRecommendationSchema.parse(data);
    Object.assign(this, validated);
    this.recommendedRoute = validated.recommendedRoute ? new CommuteRoute(validated.recommendedRoute) : null;
    this.alternatives = validated.alternatives.map(r => new CommuteRoute(r));
    this.departureWindows = new DepartureWindow(validated.departureWindows);
    this.explanation = new RecommendationExplanation(validated.explanation);
    this.provenance = new DataProvenance(validated.provenance);
  }

  isActionable() {
    return this.status !== RECOMMENDATION_STATUS.INFEASIBLE && this.recommendedRoute !== null;
  }

  hasAlternatives() {
    return this.alternatives.length > 0;
  }

  toJSON() {
    return {
      id: this.id,
      requestId: this.requestId,
      status: this.status,
      recommendedRoute: this.recommendedRoute ? this.recommendedRoute.toJSON() : null,
      alternatives: this.alternatives.map(a => a.toJSON()),
      departureWindows: this.departureWindows.toJSON(),
      explanation: this.explanation.toJSON(),
      disruptionsConsidered: this.disruptionsConsidered.map(d => ({ ...d })),
      weatherContext: { ...this.weatherContext },
      generatedAt: this.generatedAt,
      provenance: this.provenance.toJSON()
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  TRANSPORT_MODES,
  PROVENANCE_TIERS,
  PROVENANCE_CONFIDENCE,
  DISRUPTION_TYPES,
  DISRUPTION_SEVERITIES,
  ROUTE_PREFERENCES,
  LEG_TYPES,
  RECOMMENDATION_STATUS,

  // Enums
  transportModeEnum,
  provenanceTierEnum,
  provenanceConfidenceEnum,
  disruptionTypeEnum,
  disruptionSeverityEnum,
  routePreferenceEnum,
  legTypeEnum,
  recommendationStatusEnum,

  // Schemas
  provenanceSchema,
  disruptionImpactSchema,
  commuteConstraintSchema,
  confidenceIntervalSchema,
  travelEstimateSchema,
  lineInfoSchema,
  routeLegSchema,
  routeScoresSchema,
  commuteRouteSchema,
  departureWindowSchema,
  recommendationExplanationSchema,
  weatherContextSchema,
  commuteRecommendationSchema,

  // Domain Classes & Models
  DataProvenance,
  CommuteConstraint,
  RouteLeg,
  TravelEstimate,
  CommuteRoute,
  DepartureWindow,
  RecommendationExplanation,
  CommuteRecommendation,

  // Helpers
  isTransitMode,
  isRoadMode,
  isValidTransportMode,
  normalizeDisruptionSeverity
};
