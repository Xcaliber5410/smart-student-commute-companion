/**
 * TransportSegment Domain Model
 *
 * Represents a single directed link along a transit service line or multimodal corridor.
 * Encapsulates from/to stops, coarse areas, mode, distance, duration, fare, and status.
 *
 * Key Capabilities:
 * - Stable identifiers for graph traversal
 * - Seamless conversion to RouteLeg for recommendation pipelines
 * - Active/inactive and disruption status tracking
 */

const { z } = require('zod');
const {
  transportModeEnum,
  LEG_TYPES,
  RouteLeg,
  DataProvenance,
  provenanceSchema
} = require('./CommuteContracts');

const segmentStatusEnum = z.enum([
  'ACTIVE',
  'INACTIVE',
  'DISRUPTED',
  'SUSPENDED'
]);

const transportSegmentSchema = z.object({
  id: z.string().min(1, 'Segment ID is required'),
  serviceId: z.string().nullable().optional().default(null),
  mode: transportModeEnum,
  lineIdentifier: z.string().min(1, 'Line identifier is required'),
  fromStopId: z.string().min(1, 'Origin stop ID is required'),
  toStopId: z.string().min(1, 'Destination stop ID is required'),
  fromArea: z.string().min(2, 'Origin area is required').max(100),
  toArea: z.string().min(2, 'Destination area is required').max(100),
  distanceKm: z.coerce.number().min(0, 'Distance must be non-negative').default(0),
  durationMinutes: z.coerce.number().min(0, 'Duration must be non-negative').default(0),
  fareRupees: z.coerce.number().min(0, 'Fare must be non-negative').default(0),
  stopSequence: z.coerce.number().int().min(1).default(1),
  status: segmentStatusEnum.default('ACTIVE'),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Transit Network Model').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class TransportSegment {
  constructor(data) {
    const validated = transportSegmentSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = validated.provenance instanceof DataProvenance
      ? validated.provenance
      : new DataProvenance(validated.provenance);
  }

  /**
   * Checks whether the segment is currently active and usable for route candidate generation.
   * @returns {boolean}
   */
  isOperational() {
    return this.status === 'ACTIVE';
  }

  /**
   * Translates the segment into a pipeline-ready RouteLeg.
   * @param {object} [overrides={}]
   * @returns {RouteLeg}
   */
  toRouteLeg(overrides = {}) {
    let type = LEG_TYPES.TRANSIT;
    if (this.mode === 'walk') {
      type = LEG_TYPES.WALK;
    } else if (this.mode === 'auto') {
      type = LEG_TYPES.AUTO;
    } else if (this.mode === 'shared_auto') {
      type = LEG_TYPES.SHARED_AUTO;
    }

    const duration = overrides.durationMinutes !== undefined ? overrides.durationMinutes : this.durationMinutes;
    const departureTime = overrides.departureTime || '08:00';
    const [depH, depM] = departureTime.split(':').map(Number);
    const totalM = (isNaN(depH) ? 8 : depH) * 60 + (isNaN(depM) ? 0 : depM) + duration;
    const arrH = Math.floor((totalM / 60) % 24).toString().padStart(2, '0');
    const arrM = Math.floor(totalM % 60).toString().padStart(2, '0');
    const arrivalTime = overrides.arrivalTime || `${arrH}:${arrM}`;

    return new RouteLeg({
      legIndex: overrides.legIndex !== undefined ? overrides.legIndex : Math.max(0, this.stopSequence - 1),
      type,
      mode: this.mode,
      from: overrides.from || this.fromArea || this.fromStopId,
      to: overrides.to || this.toArea || this.toStopId,
      departureTime,
      arrivalTime,
      durationMinutes: duration,
      distanceKm: overrides.distanceKm !== undefined ? overrides.distanceKm : this.distanceKm,
      fareRupees: overrides.fareRupees !== undefined ? overrides.fareRupees : this.fareRupees,
      lineInfo: {
        agency: 'Mumbai Transit',
        lineName: this.lineIdentifier,
        routeShortName: this.lineIdentifier
      },
      instructions: overrides.instructions || `Take ${this.lineIdentifier} from ${this.fromArea} to ${this.toArea}`,
      provenance: this.provenance.toJSON(),
      ...overrides
    });
  }

  /**
   * Deserializes SQLite row into TransportSegment instance.
   * @param {object} row
   * @returns {TransportSegment|null}
   */
  static fromRow(row) {
    if (!row) return null;
    return new TransportSegment({
      id: row.id,
      serviceId: row.service_id || null,
      mode: row.mode,
      lineIdentifier: row.line_identifier,
      fromStopId: row.from_stop_id,
      toStopId: row.to_stop_id,
      fromArea: row.from_area,
      toArea: row.to_area,
      distanceKm: Number(row.distance_km || 0),
      durationMinutes: Number(row.duration_minutes || 0),
      fareRupees: Number(row.fare_rupees || 0),
      stopSequence: Number(row.stop_sequence || 1),
      status: row.status || 'ACTIVE',
      provenance: {
        sourceTier: row.provenance_tier || 'ESTIMATED',
        provider: row.provider || 'Transit Network Model',
        confidence: 'HIGH',
        lastUpdated: Number(row.updated_at || row.created_at || Date.now())
      },
      createdAt: Number(row.created_at || Date.now()),
      updatedAt: Number(row.updated_at || Date.now())
    });
  }

  /**
   * Serializes instance into SQLite row format.
   * @returns {object}
   */
  toRow() {
    return {
      id: this.id,
      service_id: this.serviceId,
      mode: this.mode,
      line_identifier: this.lineIdentifier,
      from_stop_id: this.fromStopId,
      to_stop_id: this.toStopId,
      from_area: this.fromArea,
      to_area: this.toArea,
      distance_km: this.distanceKm,
      duration_minutes: this.durationMinutes,
      fare_rupees: this.fareRupees,
      stop_sequence: this.stopSequence,
      status: this.status,
      provenance_tier: this.provenance.sourceTier,
      provider: this.provenance.provider,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  /**
   * JSON representation.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      serviceId: this.serviceId,
      mode: this.mode,
      lineIdentifier: this.lineIdentifier,
      fromStopId: this.fromStopId,
      toStopId: this.toStopId,
      fromArea: this.fromArea,
      toArea: this.toArea,
      distanceKm: this.distanceKm,
      durationMinutes: this.durationMinutes,
      fareRupees: this.fareRupees,
      stopSequence: this.stopSequence,
      status: this.status,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  TransportSegment,
  transportSegmentSchema,
  segmentStatusEnum
};
