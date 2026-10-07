/**
 * JourneyDisruptionImpact Domain Model
 *
 * Represents the deterministic impact of real-world disruptions on a candidate CommuteJourney.
 * Encapsulates:
 * - Impact scope (NONE, SINGLE_SEGMENT, MULTIPLE_SEGMENTS)
 * - Journey feasibility (isFeasible, feasibilityReason)
 * - Added travel time and waiting time increases
 * - Alternative connection requirements
 * - Segment-by-segment disruption attribution
 * - Explicit 4-tier data provenance preservation (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  DISRUPTION_SEVERITIES,
  normalizeDisruptionSeverity
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

/**
 * Standard disruption categories supported by the commute platform.
 */
const DISRUPTION_CATEGORIES = Object.freeze({
  TRAIN_METRO_DELAY: 'train_metro_delay',
  BUS_DELAY_UNAVAILABILITY: 'bus_delay_unavailability',
  ROAD_TRAFFIC_DISRUPTION: 'road_traffic_disruption',
  ROUTE_CLOSURE: 'route_closure',
  SERVICE_SUSPENSION: 'service_suspension',
  WEATHER_DISRUPTION: 'weather_disruption',
  OTHER_AVAILABILITY_ISSUE: 'other_availability_issue'
});

/**
 * Scope of disruption impact across the journey segments.
 */
const IMPACT_SCOPES = Object.freeze({
  NONE: 'NONE',
  SINGLE_SEGMENT: 'SINGLE_SEGMENT',
  MULTIPLE_SEGMENTS: 'MULTIPLE_SEGMENTS'
});

/**
 * Feasibility statuses explaining whether a journey remains viable.
 */
const FEASIBILITY_REASONS = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  SERVICE_SUSPENDED: 'SERVICE_SUSPENDED',
  SERVICE_CANCELLED: 'SERVICE_CANCELLED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  ROUTE_CLOSED: 'ROUTE_CLOSED',
  WEATHER_IMPASSABLE: 'WEATHER_IMPASSABLE',
  CRITICAL_DISRUPTION: 'CRITICAL_DISRUPTION'
});

const disruptionCategoryEnum = z.enum([
  'train_metro_delay',
  'bus_delay_unavailability',
  'road_traffic_disruption',
  'route_closure',
  'service_suspension',
  'weather_disruption',
  'other_availability_issue'
]);

const impactScopeEnum = z.enum(['NONE', 'SINGLE_SEGMENT', 'MULTIPLE_SEGMENTS']);

const feasibilityReasonEnum = z.enum([
  'OPERATIONAL',
  'SERVICE_SUSPENDED',
  'SERVICE_CANCELLED',
  'SERVICE_UNAVAILABLE',
  'ROUTE_CLOSED',
  'WEATHER_IMPASSABLE',
  'CRITICAL_DISRUPTION'
]);

const segmentDisruptionSchema = z.object({
  disruptionId: z.string().min(1, 'Disruption ID is required'),
  type: z.string().default('delay'),
  category: disruptionCategoryEnum.default(DISRUPTION_CATEGORIES.TRAIN_METRO_DELAY),
  severity: z.string().default(DISRUPTION_SEVERITIES.MODERATE),
  description: z.string().default(''),
  delayMinutes: z.coerce.number().min(0).default(0),
  waitingTimeMinutes: z.coerce.number().min(0).default(0),
  makesSegmentInfeasible: z.boolean().default(false),
  feasibilityReason: feasibilityReasonEnum.default(FEASIBILITY_REASONS.OPERATIONAL),
  provenance: provenanceSchema
});

const segmentImpactSchema = z.object({
  segmentIndex: z.coerce.number().int().min(0),
  mode: z.string(),
  from: z.string(),
  to: z.string(),
  serviceId: z.string().nullable().optional().default(null),
  lineIdentifier: z.string().nullable().optional().default(null),
  isAffected: z.boolean().default(false),
  isFeasible: z.boolean().default(true),
  feasibilityReason: feasibilityReasonEnum.default(FEASIBILITY_REASONS.OPERATIONAL),
  addedTravelTimeMinutes: z.coerce.number().min(0).default(0),
  addedWaitingTimeMinutes: z.coerce.number().min(0).default(0),
  totalSegmentDelayMinutes: z.coerce.number().min(0).default(0),
  disruptions: z.array(segmentDisruptionSchema).default([]),
  provenance: provenanceSchema.nullable().optional()
});

const journeyDisruptionImpactSchema = z.object({
  journeyId: z.string().min(1, 'Journey ID is required'),
  isAffected: z.boolean().default(false),
  isFeasible: z.boolean().default(true),
  feasibilityReason: feasibilityReasonEnum.default(FEASIBILITY_REASONS.OPERATIONAL),
  impactScope: impactScopeEnum.default(IMPACT_SCOPES.NONE),
  affectedSegmentsCount: z.coerce.number().int().min(0).default(0),
  affectedSegmentIndices: z.array(z.coerce.number().int()).default([]),
  addedTravelTimeMinutes: z.coerce.number().min(0).default(0),
  addedWaitingTimeMinutes: z.coerce.number().min(0).default(0),
  totalDelayMinutes: z.coerce.number().min(0).default(0),
  originalDurationMinutes: z.coerce.number().min(0),
  updatedDurationMinutes: z.coerce.number().min(0),
  requiresAlternative: z.boolean().default(false),
  alternativeReason: z.string().nullable().default(null),
  segmentImpacts: z.array(segmentImpactSchema).default([]),
  disruptions: z.array(segmentDisruptionSchema).default([]),
  advisories: z.array(z.string()).default([]),
  dataTiers: z.array(z.string()).default([]),
  provenance: provenanceSchema,
  evaluatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class JourneyDisruptionImpact {
  constructor(data) {
    try {
      const validated = journeyDisruptionImpactSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid journey disruption impact: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method to create an unaffected impact record for a candidate journey.
   * @param {object} journey
   * @param {object} [options={}]
   * @returns {JourneyDisruptionImpact}
   */
  static unaffected(journey, options = {}) {
    const originalDuration = Number(journey.totalDurationMinutes || 0);
    const provenance = DataProvenance.verified(
      'Disruption Impact Service',
      'No active disruptions detected on transit corridor or road segments'
    ).toJSON();

    return new JourneyDisruptionImpact({
      journeyId: journey.id || `journey-${Date.now()}`,
      isAffected: false,
      isFeasible: true,
      feasibilityReason: FEASIBILITY_REASONS.OPERATIONAL,
      impactScope: IMPACT_SCOPES.NONE,
      affectedSegmentsCount: 0,
      affectedSegmentIndices: [],
      addedTravelTimeMinutes: 0,
      addedWaitingTimeMinutes: 0,
      totalDelayMinutes: 0,
      originalDurationMinutes: originalDuration,
      updatedDurationMinutes: originalDuration,
      requiresAlternative: false,
      alternativeReason: null,
      segmentImpacts: (journey.segments || []).map((seg, idx) => ({
        segmentIndex: seg.segmentIndex !== undefined ? seg.segmentIndex : idx,
        mode: seg.mode || 'walk',
        from: seg.from || '',
        to: seg.to || '',
        serviceId: seg.serviceId || null,
        lineIdentifier: seg.lineIdentifier || null,
        isAffected: false,
        isFeasible: true,
        feasibilityReason: FEASIBILITY_REASONS.OPERATIONAL,
        addedTravelTimeMinutes: 0,
        addedWaitingTimeMinutes: 0,
        totalSegmentDelayMinutes: 0,
        disruptions: [],
        provenance
      })),
      disruptions: [],
      advisories: [],
      dataTiers: [PROVENANCE_TIERS.VERIFIED],
      provenance,
      evaluatedAt: options.evaluatedAt || Date.now()
    });
  }

  /**
   * Checks whether the journey is completely unaffected by disruptions.
   * @returns {boolean}
   */
  isUnaffected() {
    return !this.isAffected;
  }

  /**
   * Checks whether expected travel or waiting time increased.
   * @returns {boolean}
   */
  isDelayed() {
    return this.totalDelayMinutes > 0;
  }

  /**
   * Checks whether exactly one segment is affected.
   * @returns {boolean}
   */
  isSingleSegment() {
    return this.impactScope === IMPACT_SCOPES.SINGLE_SEGMENT;
  }

  /**
   * Checks whether multiple segments are affected.
   * @returns {boolean}
   */
  isMultipleSegments() {
    return this.impactScope === IMPACT_SCOPES.MULTIPLE_SEGMENTS;
  }

  /**
   * Checks whether the journey has been rendered infeasible.
   * @returns {boolean}
   */
  isJourneyInfeasible() {
    return !this.isFeasible;
  }

  /**
   * Checks whether an alternative connection/route is recommended.
   * @returns {boolean}
   */
  requiresAlternativeConnection() {
    return this.requiresAlternative;
  }

  /**
   * Checks if a specific provenance tier was involved in the disruption analysis.
   * @param {string} tier
   * @returns {boolean}
   */
  hasProvenanceTier(tier) {
    return this.dataTiers.includes(tier);
  }

  /**
   * Checks if verified data contributed to this impact.
   * @returns {boolean}
   */
  hasVerifiedDisruptions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.VERIFIED);
  }

  /**
   * Checks if crowdsourced commuter reports contributed.
   * @returns {boolean}
   */
  hasUserReportedDisruptions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED);
  }

  /**
   * Checks if algorithmic / environmental estimates contributed.
   * @returns {boolean}
   */
  hasEstimatedDisruptions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.ESTIMATED);
  }

  /**
   * Checks if synthetic / simulated models contributed.
   * @returns {boolean}
   */
  hasSyntheticDisruptions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC);
  }

  /**
   * Serializes the domain instance into a standardized JSON representation.
   * @returns {object}
   */
  toJSON() {
    return {
      journeyId: this.journeyId,
      isAffected: this.isAffected,
      isFeasible: this.isFeasible,
      feasibilityReason: this.feasibilityReason,
      impactScope: this.impactScope,
      affectedSegmentsCount: this.affectedSegmentsCount,
      affectedSegmentIndices: [...this.affectedSegmentIndices],
      addedTravelTimeMinutes: this.addedTravelTimeMinutes,
      addedWaitingTimeMinutes: this.addedWaitingTimeMinutes,
      totalDelayMinutes: this.totalDelayMinutes,
      originalDurationMinutes: this.originalDurationMinutes,
      updatedDurationMinutes: this.updatedDurationMinutes,
      requiresAlternative: this.requiresAlternative,
      alternativeReason: this.alternativeReason,
      segmentImpacts: this.segmentImpacts.map(s => ({
        ...s,
        disruptions: (s.disruptions || []).map(d => ({ ...d }))
      })),
      disruptions: this.disruptions.map(d => ({ ...d })),
      advisories: [...this.advisories],
      dataTiers: [...this.dataTiers],
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

module.exports = {
  JourneyDisruptionImpact,
  DISRUPTION_CATEGORIES,
  IMPACT_SCOPES,
  FEASIBILITY_REASONS,
  journeyDisruptionImpactSchema,
  segmentImpactSchema,
  segmentDisruptionSchema,
  disruptionCategoryEnum,
  impactScopeEnum,
  feasibilityReasonEnum
};
