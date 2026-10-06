/**
 * JourneySegment Domain Model
 *
 * Represents an individual ordered segment / leg within a candidate CommuteJourney.
 * Encapsulates mode, endpoints, departure/arrival timestamps, waiting times,
 * distance, fare, transit line information, and explicit 4-tier provenance.
 */

const { z } = require('zod');
const {
  transportModeEnum,
  legTypeEnum,
  LEG_TYPES,
  RouteLeg,
  DataProvenance,
  provenanceSchema
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const JOURNEY_SEGMENT_TYPES = Object.freeze({
  WALK: 'walk',
  TRANSIT: 'transit',
  AUTO: 'auto',
  SHARED_AUTO: 'shared_auto',
  TRANSFER: 'transfer'
});

const journeySegmentTypeEnum = z.preprocess(val => {
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (['train', 'metro', 'bus'].includes(lower)) return 'transit';
    return lower;
  }
  return val;
}, z.enum(['walk', 'transit', 'auto', 'shared_auto', 'transfer']));

const lineInfoSchema = z.object({
  agency: z.string().default(''),
  lineName: z.string().default(''),
  routeShortName: z.string().default(''),
  platform: z.string().optional().default(''),
  headsign: z.string().optional().default('')
}).nullable().optional();

const journeySegmentSchema = z.object({
  segmentIndex: z.coerce.number().int().min(0).default(0),
  type: journeySegmentTypeEnum.default(JOURNEY_SEGMENT_TYPES.TRANSIT),
  mode: transportModeEnum,
  from: z.string().min(2, 'Origin location is required').max(100),
  to: z.string().min(2, 'Destination location is required').max(100),
  departureTime: z.string().regex(timeRegex, 'Departure time must be in HH:MM format'),
  arrivalTime: z.string().regex(timeRegex, 'Arrival time must be in HH:MM format'),
  durationMinutes: z.coerce.number().min(0, 'Duration must be non-negative'),
  waitingTimeMinutes: z.coerce.number().min(0, 'Waiting time must be non-negative').default(0),
  distanceKm: z.coerce.number().min(0, 'Distance must be non-negative').default(0),
  fareRupees: z.coerce.number().min(0, 'Fare must be non-negative').default(0),
  serviceId: z.string().nullable().optional().default(null),
  lineIdentifier: z.string().nullable().optional().default(null),
  lineInfo: lineInfoSchema.default(null),
  instructions: z.string().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DISRUPTED', 'OPERATIONAL', 'CANCELLED']).default('ACTIVE'),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Journey Segment Model').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now())
});

class JourneySegment {
  constructor(data) {
    try {
      const validated = journeySegmentSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid journey segment: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Checks whether the segment is a fixed-guideway transit ride (train, metro, bus).
   * @returns {boolean}
   */
  isTransit() {
    if (this.isTransfer() || this.mode === 'walk') return false;
    const t = String(this.type || '').toLowerCase();
    return t === 'transit' || this.mode === 'train' || this.mode === 'metro' || this.mode === 'bus';
  }

  /**
   * Checks whether the segment is a pedestrian walk or walking access.
   * @returns {boolean}
   */
  isWalking() {
    const t = String(this.type || '').toLowerCase();
    return t === 'walk' || t === 'transfer' || this.mode === 'walk';
  }

  /**
   * Checks whether the segment is a transfer / interchange.
   * @returns {boolean}
   */
  isTransfer() {
    const t = String(this.type || '').toLowerCase();
    return t === 'transfer';
  }

  /**
   * Translates the journey segment into a pipeline-ready RouteLeg instance.
   * @param {object} [overrides={}]
   * @returns {RouteLeg}
   */
  toRouteLeg(overrides = {}) {
    let legType = LEG_TYPES.TRANSIT;
    const t = String(this.type || '').toLowerCase();
    if (t === 'walk' || t === 'transfer' || this.mode === 'walk') {
      legType = LEG_TYPES.WALK;
    } else if (t === 'auto' || this.mode === 'auto') {
      legType = LEG_TYPES.AUTO;
    } else if (t === 'shared_auto' || this.mode === 'shared_auto') {
      legType = LEG_TYPES.SHARED_AUTO;
    }

    return new RouteLeg({
      legIndex: overrides.legIndex !== undefined ? overrides.legIndex : this.segmentIndex,
      type: legType,
      mode: this.mode,
      from: this.from,
      to: this.to,
      departureTime: this.departureTime,
      arrivalTime: this.arrivalTime,
      durationMinutes: this.durationMinutes,
      distanceKm: this.distanceKm,
      fareRupees: this.fareRupees,
      lineInfo: this.lineInfo || {
        agency: 'Mumbai Transit',
        lineName: this.lineIdentifier || this.mode,
        routeShortName: this.lineIdentifier || this.mode
      },
      instructions: this.instructions || `Take ${this.lineIdentifier || this.mode} from ${this.from} to ${this.to}`,
      provenance: this.provenance.toJSON(),
      ...overrides
    });
  }

  /**
   * Creates a JourneySegment from a RouteLeg.
   * @param {RouteLeg} leg
   * @param {object} [overrides={}]
   * @returns {JourneySegment}
   */
  static fromRouteLeg(leg, overrides = {}) {
    return new JourneySegment({
      segmentIndex: leg.legIndex,
      type: leg.type,
      mode: leg.mode,
      from: leg.from,
      to: leg.to,
      departureTime: leg.departureTime,
      arrivalTime: leg.arrivalTime,
      durationMinutes: leg.durationMinutes,
      waitingTimeMinutes: overrides.waitingTimeMinutes || 0,
      distanceKm: leg.distanceKm,
      fareRupees: leg.fareRupees,
      lineInfo: leg.lineInfo,
      instructions: leg.instructions,
      provenance: leg.provenance.toJSON(),
      ...overrides
    });
  }

  toJSON() {
    return {
      segmentIndex: this.segmentIndex,
      type: this.type,
      mode: this.mode,
      from: this.from,
      to: this.to,
      departureTime: this.departureTime,
      arrivalTime: this.arrivalTime,
      durationMinutes: this.durationMinutes,
      waitingTimeMinutes: this.waitingTimeMinutes,
      distanceKm: this.distanceKm,
      fareRupees: this.fareRupees,
      serviceId: this.serviceId,
      lineIdentifier: this.lineIdentifier,
      lineInfo: this.lineInfo,
      instructions: this.instructions,
      status: this.status,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt
    };
  }
}

module.exports = {
  JourneySegment,
  journeySegmentSchema,
  journeySegmentTypeEnum,
  JOURNEY_SEGMENT_TYPES
};
