/**
 * TransportService Domain Model
 *
 * Represents a transit line, corridor, or feeder service (e.g. Western Railway Local,
 * Mumbai Metro Line 1, BEST Feeder Bus 201, Station-to-College Auto Shuttle).
 */

const { z } = require('zod');
const {
  transportModeEnum,
  DataProvenance,
  provenanceSchema,
  TRANSPORT_MODES
} = require('./CommuteContracts');
const { TransportStop, transportStopSchema } = require('./TransportStop');

const availabilityStatusEnum = z.enum([
  'OPERATIONAL',
  'DELAYED',
  'SUSPENDED',
  'LIMITED_SERVICE'
]);

const transportServiceSchema = z.object({
  id: z.string().min(1, 'Service ID is required'),
  mode: transportModeEnum,
  lineIdentifier: z.string().min(1, 'Line identifier is required'),
  name: z.string().min(2, 'Service name must be at least 2 characters').max(100),
  agency: z.string().min(1, 'Agency is required').max(100),
  status: availabilityStatusEnum.default('OPERATIONAL'),
  originArea: z.string().min(2, 'Origin area is required').max(100),
  destinationArea: z.string().min(2, 'Destination area is required').max(100),
  headsign: z.string().nullable().optional().default(''),
  fareType: z.enum(['FLAT', 'DISTANCE_TIERED', 'METERED']).default('FLAT'),
  baseFare: z.number().min(0).default(0),
  provenance: provenanceSchema.default(() => DataProvenance.verified('Official Transit Agency Feed').toJSON()),
  stops: z.array(transportStopSchema).default([]),
  createdAt: z.number().int().positive().default(() => Date.now()),
  updatedAt: z.number().int().positive().default(() => Date.now())
});

class TransportService {
  constructor(data) {
    const validated = transportServiceSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
    this.stops = validated.stops.map(s => (s instanceof TransportStop ? s : new TransportStop(s)));
  }

  isOperational() {
    return this.status === 'OPERATIONAL';
  }

  hasStop(stopIdOrArea) {
    if (!stopIdOrArea) return false;
    const lower = stopIdOrArea.toLowerCase();
    return this.stops.some(
      s => s.stopId.toLowerCase() === lower || s.stopName.toLowerCase().includes(lower) || s.area.toLowerCase().includes(lower)
    );
  }

  getStops() {
    return [...this.stops].sort((a, b) => a.stopSequence - b.stopSequence);
  }

  static fromRow(row, stops = []) {
    if (!row) return null;
    return new TransportService({
      id: row.id,
      mode: row.mode,
      lineIdentifier: row.line_identifier,
      name: row.name,
      agency: row.agency,
      status: row.status || 'OPERATIONAL',
      originArea: row.origin_area,
      destinationArea: row.destination_area,
      headsign: row.headsign || '',
      fareType: row.fare_type || 'FLAT',
      baseFare: Number(row.base_fare || 0),
      provenance: {
        sourceTier: row.provenance_tier || 'VERIFIED',
        provider: row.provider || 'Official Transit Dataset',
        confidence: row.confidence || 'HIGH',
        lastUpdated: Number(row.updated_at || row.created_at)
      },
      stops: stops.map(s => (s instanceof TransportStop ? s : TransportStop.fromRow(s))),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at || row.created_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      mode: this.mode,
      line_identifier: this.lineIdentifier,
      name: this.name,
      agency: this.agency,
      status: this.status,
      origin_area: this.originArea,
      destination_area: this.destinationArea,
      headsign: this.headsign || '',
      fare_type: this.fareType,
      base_fare: this.baseFare,
      provenance_tier: this.provenance.sourceTier,
      provider: this.provenance.provider,
      confidence: this.provenance.confidence,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  toJSON() {
    return {
      id: this.id,
      mode: this.mode,
      lineIdentifier: this.lineIdentifier,
      name: this.name,
      agency: this.agency,
      status: this.status,
      originArea: this.originArea,
      destinationArea: this.destinationArea,
      headsign: this.headsign,
      fareType: this.fareType,
      baseFare: this.baseFare,
      provenance: this.provenance.toJSON(),
      stops: this.stops.map(s => s.toJSON()),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  TransportService,
  transportServiceSchema,
  availabilityStatusEnum
};
