/**
 * TransportStop Domain Model
 *
 * Represents an ordered station, halt, or landmark stop along a transport service line.
 */

const { z } = require('zod');
const { DataProvenance, provenanceSchema } = require('./CommuteContracts');

const transportStopSchema = z.object({
  id: z.string().min(1, 'Stop ID is required'),
  serviceId: z.string().min(1, 'Service ID is required'),
  stopId: z.string().min(1, 'Transit stop code is required'),
  stopName: z.string().min(2, 'Stop name must be at least 2 characters').max(100),
  area: z.string().min(2, 'Area is required').max(100),
  stopSequence: z.number().int().min(0, 'Stop sequence must be non-negative'),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  isTransitHub: z.boolean().default(false),
  provenance: provenanceSchema.default(() => DataProvenance.verified('Official Transit Stops Dataset').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now())
});

class TransportStop {
  constructor(data) {
    const validated = transportStopSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  static fromRow(row) {
    if (!row) return null;
    return new TransportStop({
      id: row.id,
      serviceId: row.service_id,
      stopId: row.stop_id,
      stopName: row.stop_name,
      area: row.area,
      stopSequence: Number(row.stop_sequence),
      lat: Number(row.lat),
      lon: Number(row.lon),
      isTransitHub: Boolean(row.is_transit_hub),
      provenance: {
        sourceTier: row.provenance_tier || 'VERIFIED',
        provider: row.provider || 'Official Transit Dataset',
        confidence: row.confidence || 'HIGH',
        lastUpdated: Number(row.created_at)
      },
      createdAt: Number(row.created_at)
    });
  }

  toRow() {
    return {
      id: this.id,
      service_id: this.serviceId,
      stop_id: this.stopId,
      stop_name: this.stopName,
      area: this.area,
      stop_sequence: this.stopSequence,
      lat: this.lat,
      lon: this.lon,
      is_transit_hub: this.isTransitHub ? 1 : 0,
      provenance_tier: this.provenance.sourceTier,
      created_at: this.createdAt
    };
  }

  toJSON() {
    return {
      id: this.id,
      serviceId: this.serviceId,
      stopId: this.stopId,
      stopName: this.stopName,
      area: this.area,
      stopSequence: this.stopSequence,
      lat: this.lat,
      lon: this.lon,
      isTransitHub: this.isTransitHub,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt
    };
  }
}

module.exports = {
  TransportStop,
  transportStopSchema
};
