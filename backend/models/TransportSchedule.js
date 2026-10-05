/**
 * TransportSchedule Domain Model
 *
 * Represents a scheduled timetable segment between two stops along a transport service line.
 */

const { z } = require('zod');
const { DataProvenance, provenanceSchema } = require('./CommuteContracts');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

const transportScheduleSchema = z.object({
  id: z.string().min(1, 'Schedule ID is required'),
  serviceId: z.string().min(1, 'Service ID is required'),
  tripIdentifier: z.string().min(1, 'Trip identifier is required'),
  fromStopId: z.string().min(1, 'Origin stop is required'),
  toStopId: z.string().min(1, 'Destination stop is required'),
  departureTime: z.string().regex(timeRegex, 'Departure time must be in HH:MM format'),
  arrivalTime: z.string().regex(timeRegex, 'Arrival time must be in HH:MM format'),
  durationMinutes: z.number().min(0, 'Duration must be non-negative'),
  operatingDays: z.array(z.string()).default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
  status: z.enum(['OPERATIONAL', 'DELAYED', 'CANCELLED']).default('OPERATIONAL'),
  provenance: provenanceSchema.default(() => DataProvenance.verified('Official Transit Timetable Feed').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now())
});

class TransportSchedule {
  constructor(data) {
    const validated = transportScheduleSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = new DataProvenance(validated.provenance);
  }

  operatesOnDay(dayStr) {
    if (!dayStr) return true;
    const shortDay = dayStr.substring(0, 3);
    return this.operatingDays.some(d => d.toLowerCase().startsWith(shortDay.toLowerCase()));
  }

  static fromRow(row) {
    if (!row) return null;
    let days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (typeof row.operating_days === 'string') {
      try {
        days = JSON.parse(row.operating_days);
      } catch (e) {
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      }
    } else if (Array.isArray(row.operating_days)) {
      days = row.operating_days;
    }

    return new TransportSchedule({
      id: row.id,
      serviceId: row.service_id,
      tripIdentifier: row.trip_identifier,
      fromStopId: row.from_stop_id,
      toStopId: row.to_stop_id,
      departureTime: row.departure_time,
      arrivalTime: row.arrival_time,
      durationMinutes: Number(row.duration_minutes),
      operatingDays: days,
      status: row.status || 'OPERATIONAL',
      provenance: {
        sourceTier: row.provenance_tier || 'VERIFIED',
        provider: row.provider || 'Official Transit Timetable',
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
      trip_identifier: this.tripIdentifier,
      from_stop_id: this.fromStopId,
      to_stop_id: this.toStopId,
      departure_time: this.departureTime,
      arrival_time: this.arrivalTime,
      duration_minutes: this.durationMinutes,
      operating_days: JSON.stringify(this.operatingDays),
      status: this.status,
      provenance_tier: this.provenance.sourceTier,
      created_at: this.createdAt
    };
  }

  toJSON() {
    return {
      id: this.id,
      serviceId: this.serviceId,
      tripIdentifier: this.tripIdentifier,
      fromStopId: this.fromStopId,
      toStopId: this.toStopId,
      departureTime: this.departureTime,
      arrivalTime: this.arrivalTime,
      durationMinutes: this.durationMinutes,
      operatingDays: [...this.operatingDays],
      status: this.status,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt
    };
  }
}

module.exports = {
  TransportSchedule,
  transportScheduleSchema
};
