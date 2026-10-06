/**
 * TransportConnection Domain Model
 *
 * Represents a connection, interchange, walking transfer, or feeder link between
 * relevant stops or landmark areas (e.g. Metro Station ↔ Bus Stop, Station ↔ College Area).
 *
 * Essential for modeling realistic journeys:
 * Area A → Walk → Metro Station → Metro → Bus Stop → Bus → College Area → Walk
 */

const { z } = require('zod');
const {
  LEG_TYPES,
  RouteLeg,
  DataProvenance,
  provenanceSchema
} = require('./CommuteContracts');

const connectionTypeEnum = z.enum([
  'TRANSFER',
  'WALKING_ACCESS',
  'FEEDER_SHUTTLE',
  'INTERCHANGE'
]);

const connectionModeEnum = z.enum([
  'walk',
  'auto',
  'shared_auto',
  'bus'
]);

const transportConnectionSchema = z.object({
  id: z.string().min(1, 'Connection ID is required'),
  fromStopId: z.string().min(1, 'From stop ID is required'),
  toStopId: z.string().min(1, 'To stop ID is required'),
  fromArea: z.string().min(2, 'From area is required').max(100),
  toArea: z.string().min(2, 'To area is required').max(100),
  connectionType: connectionTypeEnum.default('TRANSFER'),
  mode: connectionModeEnum.default('walk'),
  durationMinutes: z.coerce.number().min(0, 'Duration must be non-negative').default(5),
  distanceKm: z.coerce.number().min(0, 'Distance must be non-negative').default(0),
  fareRupees: z.coerce.number().min(0, 'Fare must be non-negative').default(0),
  isAccessible: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Transit Network Model').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class TransportConnection {
  constructor(data) {
    const validated = transportConnectionSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = validated.provenance instanceof DataProvenance
      ? validated.provenance
      : new DataProvenance(validated.provenance);
  }

  isOperational() {
    return this.status === 'ACTIVE';
  }

  isInterchange() {
    return this.connectionType === 'TRANSFER' || this.connectionType === 'INTERCHANGE';
  }

  toRouteLeg(overrides = {}) {
    let type = LEG_TYPES.WALK;
    if (this.mode === 'auto') {
      type = LEG_TYPES.AUTO;
    } else if (this.mode === 'shared_auto') {
      type = LEG_TYPES.SHARED_AUTO;
    } else if (this.mode === 'bus') {
      type = LEG_TYPES.TRANSIT;
    }

    const duration = overrides.durationMinutes !== undefined ? overrides.durationMinutes : this.durationMinutes;
    const departureTime = overrides.departureTime || '08:00';
    const [depH, depM] = departureTime.split(':').map(Number);
    const totalM = (isNaN(depH) ? 8 : depH) * 60 + (isNaN(depM) ? 0 : depM) + duration;
    const arrH = Math.floor((totalM / 60) % 24).toString().padStart(2, '0');
    const arrM = Math.floor(totalM % 60).toString().padStart(2, '0');
    const arrivalTime = overrides.arrivalTime || `${arrH}:${arrM}`;

    const defaultLineId = this.connectionType === 'WALKING_ACCESS'
      ? 'WALK-ACCESS'
      : (this.connectionType === 'FEEDER_SHUTTLE' ? 'FEEDER-SHUTTLE' : 'INTERCHANGE-WALK');

    return new RouteLeg({
      legIndex: overrides.legIndex !== undefined ? overrides.legIndex : 0,
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
        agency: this.connectionType === 'FEEDER_SHUTTLE' ? 'Shared Auto Stand' : 'Pedestrian',
        lineName: defaultLineId,
        routeShortName: defaultLineId
      },
      instructions: overrides.instructions || (this.mode === 'walk' ? `Walk from ${this.fromArea} to ${this.toArea}` : `Take feeder connection to ${this.toArea}`),
      provenance: this.provenance.toJSON(),
      ...overrides
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new TransportConnection({
      id: row.id,
      fromStopId: row.from_stop_id,
      toStopId: row.to_stop_id,
      fromArea: row.from_area,
      toArea: row.to_area,
      connectionType: row.connection_type || 'TRANSFER',
      mode: row.mode || 'walk',
      durationMinutes: Number(row.duration_minutes || 5),
      distanceKm: Number(row.distance_km || 0),
      fareRupees: Number(row.fare_rupees || 0),
      isAccessible: Boolean(row.is_accessible !== undefined ? row.is_accessible : 1),
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

  toRow() {
    return {
      id: this.id,
      from_stop_id: this.fromStopId,
      to_stop_id: this.toStopId,
      from_area: this.fromArea,
      to_area: this.toArea,
      connection_type: this.connectionType,
      mode: this.mode,
      duration_minutes: this.durationMinutes,
      distance_km: this.distanceKm,
      fare_rupees: this.fareRupees,
      is_accessible: this.isAccessible ? 1 : 0,
      status: this.status,
      provenance_tier: this.provenance.sourceTier,
      provider: this.provenance.provider,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  toJSON() {
    return {
      id: this.id,
      fromStopId: this.fromStopId,
      toStopId: this.toStopId,
      fromArea: this.fromArea,
      toArea: this.toArea,
      connectionType: this.connectionType,
      mode: this.mode,
      durationMinutes: this.durationMinutes,
      distanceKm: this.distanceKm,
      fareRupees: this.fareRupees,
      isAccessible: this.isAccessible,
      status: this.status,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  TransportConnection,
  transportConnectionSchema,
  connectionTypeEnum,
  connectionModeEnum
};
