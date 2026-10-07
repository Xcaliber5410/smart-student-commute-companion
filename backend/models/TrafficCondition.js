/**
 * TrafficCondition Domain Model & Traffic Context Contracts
 *
 * Represents real-world road traffic congestion, bottlenecks, and delays
 * with 4-tier provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 *
 * Traffic Levels:
 * - normal: Free-flow road traffic, 0 min added delay
 * - moderate: Slight slowdown / traffic signals, ~5-8 min delay
 * - heavy: Dense peak congestion, ~10-18 min delay (+12 min road travel)
 * - severe: Gridlock / standstill, ~25-40 min delay (route may become impractical)
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  PROVENANCE_CONFIDENCE
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

/**
 * Standard traffic levels.
 */
const TRAFFIC_LEVELS = Object.freeze({
  NORMAL: 'normal',
  MODERATE: 'moderate',
  HEAVY: 'heavy',
  SEVERE: 'severe'
});

const trafficLevelEnum = z.enum(['normal', 'moderate', 'heavy', 'severe']);

/**
 * Standard baseline travel time delays (minutes) by traffic level.
 */
const TRAFFIC_LEVEL_DELAYS = Object.freeze({
  [TRAFFIC_LEVELS.NORMAL]: 0,
  [TRAFFIC_LEVELS.MODERATE]: 6,
  [TRAFFIC_LEVELS.HEAVY]: 12,
  [TRAFFIC_LEVELS.SEVERE]: 28
});

/**
 * Road transport modes subject to vehicular road traffic.
 */
const ROAD_TRANSPORT_MODES = Object.freeze(['auto', 'shared_auto', 'bus']);

const trafficConditionSchema = z.object({
  id: z.string().min(1, 'Traffic condition ID is required'),
  area: z.string().min(2, 'Affected area or corridor is required').max(100),
  level: trafficLevelEnum.default(TRAFFIC_LEVELS.NORMAL),
  expectedDelayMinutes: z.coerce.number().min(0).default(0),
  description: z.string().max(300).default(''),
  affectedModes: z.array(z.string()).default([...ROAD_TRANSPORT_MODES]),
  startTime: z.coerce.number().int().positive().default(() => Date.now()),
  expiryTime: z.coerce.number().int().positive().default(() => Date.now() + 60 * 60 * 1000),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Traffic Density Heuristic').toJSON()),
  createdAt: z.coerce.number().int().positive().default(() => Date.now())
});

class TrafficCondition {
  constructor(data) {
    try {
      const validated = trafficConditionSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid traffic condition: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method creating a normalized TrafficCondition.
   * @param {object} input
   * @returns {TrafficCondition}
   */
  static create(input) {
    const now = Date.now();
    const level = input.level || TRAFFIC_LEVELS.NORMAL;
    const defaultDelay = TRAFFIC_LEVEL_DELAYS[level] || 0;
    const expectedDelayMinutes = input.expectedDelayMinutes !== undefined
      ? Number(input.expectedDelayMinutes)
      : defaultDelay;

    const durationMs = (input.durationMinutes || 60) * 60 * 1000;
    const startTime = input.startTime || now;
    const expiryTime = input.expiryTime || input.endTime || (startTime + durationMs);
    const id = input.id || `traf-${now}-${Math.random().toString(36).substring(2, 7)}`;

    return new TrafficCondition({
      ...input,
      id,
      level,
      expectedDelayMinutes,
      startTime,
      expiryTime,
      createdAt: input.createdAt || now
    });
  }

  /**
   * Checks whether this condition is currently active.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isActive(currentTime = Date.now()) {
    return this.startTime <= currentTime && currentTime <= this.expiryTime;
  }

  /**
   * Checks whether this condition has expired.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isExpired(currentTime = Date.now()) {
    return currentTime > this.expiryTime;
  }

  /**
   * Checks whether a specific transport mode is affected by this road traffic condition.
   * @param {string} mode
   * @returns {boolean}
   */
  affectsMode(mode) {
    if (!mode) return false;
    const lower = String(mode).toLowerCase();
    return this.affectedModes.some(m => m.toLowerCase() === lower);
  }

  /**
   * Checks whether this condition affects a given area or landmark.
   * @param {string} location
   * @returns {boolean}
   */
  affectsArea(location) {
    if (!location) return false;
    const cleanLoc = String(location).toLowerCase().trim();
    const cleanArea = String(this.area).toLowerCase().trim();
    return cleanLoc.includes(cleanArea) || cleanArea.includes(cleanLoc);
  }

  /**
   * Serializes the condition to plain JSON.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      area: this.area,
      level: this.level,
      expectedDelayMinutes: this.expectedDelayMinutes,
      description: this.description,
      affectedModes: [...this.affectedModes],
      startTime: this.startTime,
      expiryTime: this.expiryTime,
      confidence: this.confidence,
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      createdAt: this.createdAt
    };
  }
}

/**
 * Zod schema for TrafficContext envelope.
 */
const trafficContextSchema = z.object({
  level: trafficLevelEnum.default(TRAFFIC_LEVELS.NORMAL),
  expectedDelayMinutes: z.coerce.number().min(0).default(0),
  advisory: z.string().default('Normal road traffic conditions'),
  conditions: z.array(z.any()).default([]),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Traffic Context Engine').toJSON()),
  evaluatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class TrafficContext {
  constructor(data = {}) {
    const validated = trafficContextSchema.parse(data);
    Object.assign(this, validated);
    this.conditions = (validated.conditions || []).map(c => (c instanceof TrafficCondition ? c : new TrafficCondition(c)));
    this.provenance = validated.provenance instanceof DataProvenance
      ? validated.provenance
      : new DataProvenance(validated.provenance);
  }

  static normal(options = {}) {
    return new TrafficContext({
      level: TRAFFIC_LEVELS.NORMAL,
      expectedDelayMinutes: 0,
      advisory: 'Normal road traffic conditions with standard free-flow speeds',
      conditions: [],
      provenance: DataProvenance.verified('Traffic Context Engine', 'No significant road congestion reported').toJSON(),
      evaluatedAt: options.evaluatedAt || Date.now()
    });
  }

  toJSON() {
    return {
      level: this.level,
      expectedDelayMinutes: this.expectedDelayMinutes,
      advisory: this.advisory,
      conditions: this.conditions.map(c => c.toJSON()),
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

/**
 * Result representing the impact of traffic conditions on a candidate journey.
 */
class JourneyTrafficImpact {
  constructor(data) {
    this.journeyId = data.journeyId;
    this.isAffected = Boolean(data.isAffected);
    this.trafficLevel = data.trafficLevel || TRAFFIC_LEVELS.NORMAL;
    this.addedTravelTimeMinutes = Number(data.addedTravelTimeMinutes || 0);
    this.originalDurationMinutes = Number(data.originalDurationMinutes || 0);
    this.updatedDurationMinutes = Number(data.updatedDurationMinutes || this.originalDurationMinutes);
    this.isImpractical = Boolean(data.isImpractical);
    this.impracticalReason = data.impracticalReason || null;
    this.affectedSegmentsCount = Number(data.affectedSegmentsCount || 0);
    this.affectedSegmentIndices = Array.isArray(data.affectedSegmentIndices) ? [...data.affectedSegmentIndices] : [];
    this.segmentImpacts = Array.isArray(data.segmentImpacts) ? data.segmentImpacts : [];
    this.advisories = Array.isArray(data.advisories) ? [...data.advisories] : [];
    this.dataTiers = Array.isArray(data.dataTiers) ? [...data.dataTiers] : [];
    this.provenance = data.provenance instanceof DataProvenance
      ? data.provenance
      : new DataProvenance(data.provenance || DataProvenance.estimated('Traffic Impact Engine').toJSON());
    this.evaluatedAt = data.evaluatedAt || Date.now();
  }

  isUnaffected() {
    return !this.isAffected;
  }

  hasVerifiedConditions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.VERIFIED);
  }

  hasUserReportedConditions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED);
  }

  hasEstimatedConditions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.ESTIMATED);
  }

  hasSyntheticConditions() {
    return this.dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC);
  }

  toJSON() {
    return {
      journeyId: this.journeyId,
      isAffected: this.isAffected,
      trafficLevel: this.trafficLevel,
      addedTravelTimeMinutes: this.addedTravelTimeMinutes,
      originalDurationMinutes: this.originalDurationMinutes,
      updatedDurationMinutes: this.updatedDurationMinutes,
      isImpractical: this.isImpractical,
      impracticalReason: this.impracticalReason,
      affectedSegmentsCount: this.affectedSegmentsCount,
      affectedSegmentIndices: [...this.affectedSegmentIndices],
      segmentImpacts: this.segmentImpacts.map(s => ({ ...s })),
      advisories: [...this.advisories],
      dataTiers: [...this.dataTiers],
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

module.exports = {
  TrafficCondition,
  TrafficContext,
  JourneyTrafficImpact,
  TRAFFIC_LEVELS,
  TRAFFIC_LEVEL_DELAYS,
  ROAD_TRANSPORT_MODES,
  trafficLevelEnum,
  trafficConditionSchema,
  trafficContextSchema
};
