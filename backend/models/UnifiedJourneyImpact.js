/**
 * UnifiedJourneyImpact Domain Model
 *
 * Represents the normalized composite impact of environmental and transport context
 * (disruptions + road traffic + weather conditions + transport availability/service status)
 * on a candidate CommuteJourney.
 *
 * Characteristics:
 * - 100% deterministic (no AI/LLM, no heuristic guessing)
 * - Transparent aggregation of delays, uncertainty, affected segments, and unavailable legs
 * - Human-readable reason codes explaining commute impacts
 * - Complete 4-tier data provenance tracking across all active context components
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

/**
 * Standard reason codes exposed by the Unified Commute Context Engine.
 */
const UNIFIED_REASON_CODES = Object.freeze({
  CLEAN_JOURNEY: 'CLEAN_JOURNEY',
  DISRUPTION_DELAY: 'DISRUPTION_DELAY',
  ROAD_TRAFFIC_CONGESTION: 'ROAD_TRAFFIC_CONGESTION',
  SEVERE_TRAFFIC: 'SEVERE_TRAFFIC',
  WEATHER_IMPACT: 'WEATHER_IMPACT',
  WEATHER_IMPASSABLE: 'WEATHER_IMPASSABLE',
  TRANSIT_SERVICE_DEGRADED: 'TRANSIT_SERVICE_DEGRADED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_SUSPENDED: 'SERVICE_SUSPENDED',
  JOURNEY_INFEASIBLE: 'JOURNEY_INFEASIBLE',
  MULTIPLE_SIMULTANEOUS_IMPACTS: 'MULTIPLE_SIMULTANEOUS_IMPACTS',
  MIXED_PROVENANCE: 'MIXED_PROVENANCE'
});

/**
 * Journey feasibility status codes.
 */
const UNIFIED_FEASIBILITY_STATUSES = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  SERVICE_SUSPENDED: 'SERVICE_SUSPENDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  ROUTE_CLOSED: 'ROUTE_CLOSED',
  SEVERE_TRAFFIC: 'SEVERE_TRAFFIC',
  WEATHER_IMPASSABLE: 'WEATHER_IMPASSABLE',
  CRITICAL_DISRUPTION: 'CRITICAL_DISRUPTION',
  JOURNEY_INFEASIBLE: 'JOURNEY_INFEASIBLE'
});

const reliabilityIndicatorEnum = z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']);

const unifiedSegmentImpactSchema = z.object({
  segmentIndex: z.coerce.number().int().min(0),
  mode: z.string(),
  from: z.string(),
  to: z.string(),
  isAffected: z.boolean().default(false),
  isUsable: z.boolean().default(true),
  delayMinutes: z.coerce.number().min(0).default(0),
  reasons: z.array(z.string()).default([]),
  impacts: z.object({
    disruption: z.any().nullable().optional().default(null),
    traffic: z.any().nullable().optional().default(null),
    weather: z.any().nullable().optional().default(null),
    availability: z.any().nullable().optional().default(null)
  }).default({})
});

const unavailableSegmentSchema = z.object({
  segmentIndex: z.coerce.number().int().min(0),
  mode: z.string(),
  from: z.string(),
  to: z.string(),
  status: z.string(),
  reason: z.string(),
  source: z.string().default('transport_availability')
});

const unifiedJourneyImpactSchema = z.object({
  journeyId: z.string().min(1, 'Journey ID is required'),
  isFeasible: z.boolean().default(true),
  feasibilityReason: z.string().default(UNIFIED_FEASIBILITY_STATUSES.OPERATIONAL),
  reasonCodes: z.array(z.string()).default([]),
  totalAdditionalDelayMinutes: z.coerce.number().min(0).default(0),
  totalEstimatedAdditionalDelayMinutes: z.coerce.number().min(0).optional(),
  originalDurationMinutes: z.coerce.number().min(0).default(0),
  updatedDurationMinutes: z.coerce.number().min(0).default(0),
  affectedSegments: z.array(unifiedSegmentImpactSchema).default([]),
  unavailableSegments: z.array(unavailableSegmentSchema).default([]),
  disruptionImpact: z.any().nullable().optional().default(null),
  trafficImpact: z.any().nullable().optional().default(null),
  weatherImpact: z.any().nullable().optional().default(null),
  transportStatus: z.any().nullable().optional().default(null),
  dominantTransportStatus: z.string().default('AVAILABLE'),
  reliabilityIndicator: reliabilityIndicatorEnum.default('LOW'),
  uncertaintyLevel: reliabilityIndicatorEnum.default('LOW'),
  advisories: z.array(z.string()).default([]),
  dataTiers: z.array(z.string()).default([]),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Unified Impact Engine').toJSON()),
  evaluatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class UnifiedJourneyImpact {
  /**
   * @param {object} data
   */
  constructor(data) {
    try {
      const copy = { ...data };
      if (copy.totalEstimatedAdditionalDelayMinutes === undefined) {
        copy.totalEstimatedAdditionalDelayMinutes = copy.totalAdditionalDelayMinutes;
      }
      if (!copy.updatedDurationMinutes && copy.originalDurationMinutes !== undefined) {
        copy.updatedDurationMinutes = copy.originalDurationMinutes + (copy.totalAdditionalDelayMinutes || 0);
      }
      if (!copy.dominantTransportStatus && copy.transportStatus?.dominantStatus) {
        copy.dominantTransportStatus = copy.transportStatus.dominantStatus;
      }
      if (!copy.reliabilityIndicator && copy.uncertaintyLevel) {
        copy.reliabilityIndicator = copy.uncertaintyLevel;
      } else if (!copy.uncertaintyLevel && copy.reliabilityIndicator) {
        copy.uncertaintyLevel = copy.reliabilityIndicator;
      }

      const validated = unifiedJourneyImpactSchema.parse(copy);
      Object.assign(this, validated);

      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid unified journey impact: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method for clean baseline journeys (zero impacts).
   * @param {object} journey
   * @param {object} [options={}]
   * @returns {UnifiedJourneyImpact}
   */
  static clean(journey, options = {}) {
    const journeyId = journey?.id || 'journey-clean';
    const originalDuration = Number(journey?.totalDurationMinutes || journey?.durationMinutes || 0);
    const evaluatedAt = options.currentTime || Date.now();

    return new UnifiedJourneyImpact({
      journeyId,
      isFeasible: true,
      feasibilityReason: UNIFIED_FEASIBILITY_STATUSES.OPERATIONAL,
      reasonCodes: [UNIFIED_REASON_CODES.CLEAN_JOURNEY],
      totalAdditionalDelayMinutes: 0,
      totalEstimatedAdditionalDelayMinutes: 0,
      originalDurationMinutes: originalDuration,
      updatedDurationMinutes: originalDuration,
      affectedSegments: [],
      unavailableSegments: [],
      disruptionImpact: {
        isAffected: false,
        totalDelayMinutes: 0,
        advisories: [],
        dataTiers: [PROVENANCE_TIERS.ESTIMATED]
      },
      trafficImpact: {
        level: 'normal',
        addedTravelTimeMinutes: 0,
        isImpractical: false,
        advisories: [],
        dataTiers: [PROVENANCE_TIERS.ESTIMATED]
      },
      weatherImpact: {
        condition: 'clear',
        totalAddedTravelTimeMinutes: 0,
        isImpractical: false,
        advisories: [],
        dataTiers: [PROVENANCE_TIERS.ESTIMATED]
      },
      transportStatus: {
        dominantStatus: 'AVAILABLE',
        isUsable: true,
        totalDelayMinutes: 0,
        uncertaintyLevel: 'LOW',
        advisories: [],
        dataTiers: [PROVENANCE_TIERS.ESTIMATED]
      },
      dominantTransportStatus: 'AVAILABLE',
      reliabilityIndicator: 'LOW',
      uncertaintyLevel: 'LOW',
      advisories: ['Normal commute conditions — no active disruptions, traffic bottlenecks, or weather impacts detected.'],
      dataTiers: [PROVENANCE_TIERS.ESTIMATED],
      provenance: DataProvenance.estimated(
        'Commute Context Engine',
        'Clean baseline commute context (unaffected)'
      ).toJSON(),
      evaluatedAt
    });
  }

  /**
   * Checks whether the journey has zero added delays or negative impacts.
   * @returns {boolean}
   */
  isClean() {
    return this.isFeasible &&
      this.totalAdditionalDelayMinutes === 0 &&
      this.affectedSegments.length === 0 &&
      this.unavailableSegments.length === 0 &&
      this.reasonCodes.includes(UNIFIED_REASON_CODES.CLEAN_JOURNEY);
  }

  /**
   * Checks whether disruptions contributed to the unified impact.
   * @returns {boolean}
   */
  hasDisruptions() {
    return this.reasonCodes.includes(UNIFIED_REASON_CODES.DISRUPTION_DELAY) ||
      Boolean(this.disruptionImpact?.isAffected);
  }

  /**
   * Checks whether vehicular road traffic contributed to the impact.
   * @returns {boolean}
   */
  hasTraffic() {
    return this.reasonCodes.includes(UNIFIED_REASON_CODES.ROAD_TRAFFIC_CONGESTION) ||
      this.reasonCodes.includes(UNIFIED_REASON_CODES.SEVERE_TRAFFIC) ||
      Boolean(this.trafficImpact?.addedTravelTimeMinutes > 0);
  }

  /**
   * Checks whether weather conditions contributed to the impact.
   * @returns {boolean}
   */
  hasWeatherImpact() {
    return this.reasonCodes.includes(UNIFIED_REASON_CODES.WEATHER_IMPACT) ||
      this.reasonCodes.includes(UNIFIED_REASON_CODES.WEATHER_IMPASSABLE) ||
      Boolean(this.weatherImpact?.totalAddedTravelTimeMinutes > 0);
  }

  /**
   * Checks whether public transit or vehicle availability issues were detected.
   * @returns {boolean}
   */
  hasAvailabilityIssues() {
    return this.dominantTransportStatus !== 'AVAILABLE' ||
      this.reasonCodes.includes(UNIFIED_REASON_CODES.TRANSIT_SERVICE_DEGRADED) ||
      this.reasonCodes.includes(UNIFIED_REASON_CODES.SERVICE_UNAVAILABLE) ||
      this.reasonCodes.includes(UNIFIED_REASON_CODES.SERVICE_SUSPENDED);
  }

  /**
   * Checks whether any journey segment is unusable.
   * @returns {boolean}
   */
  hasUnavailableSegments() {
    return this.unavailableSegments.length > 0;
  }

  /**
   * Checks whether a specific data provenance tier was involved.
   * @param {string} tier
   * @returns {boolean}
   */
  hasProvenanceTier(tier) {
    return this.dataTiers.includes(tier);
  }

  /**
   * Serializes the domain instance into a standardized JSON representation.
   * @returns {object}
   */
  toJSON() {
    return {
      journeyId: this.journeyId,
      isFeasible: this.isFeasible,
      feasibilityReason: this.feasibilityReason,
      reasonCodes: [...this.reasonCodes],
      totalAdditionalDelayMinutes: this.totalAdditionalDelayMinutes,
      totalEstimatedAdditionalDelayMinutes: this.totalAdditionalDelayMinutes,
      originalDurationMinutes: this.originalDurationMinutes,
      updatedDurationMinutes: this.updatedDurationMinutes,
      affectedSegments: this.affectedSegments.map(s => ({ ...s })),
      unavailableSegments: this.unavailableSegments.map(s => ({ ...s })),
      disruptionImpact: this.disruptionImpact,
      trafficImpact: this.trafficImpact,
      weatherImpact: this.weatherImpact,
      transportStatus: this.transportStatus,
      dominantTransportStatus: this.dominantTransportStatus,
      reliabilityIndicator: this.reliabilityIndicator,
      uncertaintyLevel: this.uncertaintyLevel,
      advisories: [...this.advisories],
      dataTiers: [...this.dataTiers],
      provenance: this.provenance.toJSON(),
      evaluatedAt: this.evaluatedAt
    };
  }
}

module.exports = {
  UnifiedJourneyImpact,
  UNIFIED_REASON_CODES,
  UNIFIED_FEASIBILITY_STATUSES,
  unifiedJourneyImpactSchema,
  unifiedSegmentImpactSchema,
  unavailableSegmentSchema
};
