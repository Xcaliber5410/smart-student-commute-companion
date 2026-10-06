/**
 * TransportTimetableOption Domain Model
 *
 * Represents a single scheduled or frequency-based departure opportunity along a transport segment.
 * Encapsulates departure/arrival times, travel duration, waiting time, frequency, fare, and provenance.
 *
 * Key Capabilities:
 * - Direct conversion to RouteLeg for recommendation pipelines
 * - Explicit provenance labeling (VERIFIED, ESTIMATED, SYNTHETIC)
 * - Waiting time and total travel duration calculation
 */

const { z } = require('zod');
const {
  transportModeEnum,
  LEG_TYPES,
  RouteLeg,
  DataProvenance,
  provenanceSchema
} = require('./CommuteContracts');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timetableOptionSchema = z.object({
  id: z.string().min(1, 'Option ID is required'),
  tripIdentifier: z.string().min(1, 'Trip identifier is required'),
  serviceId: z.string().nullable().optional().default(null),
  lineIdentifier: z.string().min(1, 'Line identifier is required'),
  mode: transportModeEnum,
  fromStopId: z.string().min(1, 'Origin stop ID is required'),
  toStopId: z.string().min(1, 'Destination stop ID is required'),
  fromArea: z.string().min(2, 'Origin area is required').max(100),
  toArea: z.string().min(2, 'Destination area is required').max(100),
  scheduledDeparture: z.string().regex(timeRegex, 'Departure time must be HH:MM'),
  scheduledArrival: z.string().regex(timeRegex, 'Arrival time must be HH:MM'),
  durationMinutes: z.coerce.number().min(0, 'Duration must be non-negative'),
  waitingTimeMinutes: z.coerce.number().min(0, 'Waiting time must be non-negative').default(0),
  totalDurationMinutes: z.coerce.number().min(0, 'Total duration must be non-negative'),
  frequencyMinutes: z.coerce.number().positive().nullable().optional().default(null),
  fareRupees: z.coerce.number().min(0, 'Fare must be non-negative').default(0),
  operatingDays: z.array(z.string()).default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
  status: z.enum(['OPERATIONAL', 'DELAYED', 'CANCELLED']).default('OPERATIONAL'),
  isAvailable: z.boolean().default(true),
  provenance: provenanceSchema.default(() => DataProvenance.synthetic('Timetable & Travel Estimate Engine').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now())
});

class TransportTimetableOption {
  constructor(data) {
    // Auto-calculate totalDurationMinutes if not explicitly passed
    if (data && data.totalDurationMinutes === undefined && data.durationMinutes !== undefined) {
      data.totalDurationMinutes = Number(data.durationMinutes) + Number(data.waitingTimeMinutes || 0);
    }
    const validated = timetableOptionSchema.parse(data);
    Object.assign(this, validated);
    this.provenance = validated.provenance instanceof DataProvenance
      ? validated.provenance
      : new DataProvenance(validated.provenance);
  }

  /**
   * Translates the scheduled option into a pipeline-ready RouteLeg.
   * @param {number} [legIndex=0]
   * @param {object} [overrides={}]
   * @returns {RouteLeg}
   */
  toRouteLeg(legIndex = 0, overrides = {}) {
    let type = LEG_TYPES.TRANSIT;
    if (this.mode === 'walk') {
      type = LEG_TYPES.WALK;
    } else if (this.mode === 'auto') {
      type = LEG_TYPES.AUTO;
    } else if (this.mode === 'shared_auto') {
      type = LEG_TYPES.SHARED_AUTO;
    }

    return new RouteLeg({
      legIndex,
      type,
      mode: this.mode,
      from: this.fromArea || this.fromStopId,
      to: this.toArea || this.toStopId,
      departureTime: this.scheduledDeparture,
      arrivalTime: this.scheduledArrival,
      durationMinutes: this.durationMinutes,
      distanceKm: overrides.distanceKm !== undefined ? overrides.distanceKm : 0,
      fareRupees: this.fareRupees,
      lineInfo: {
        agency: overrides.agency || 'Mumbai Transit',
        lineName: this.lineIdentifier,
        routeShortName: this.lineIdentifier,
        headsign: overrides.headsign || `${this.toArea}`
      },
      instructions: overrides.instructions || `Take ${this.lineIdentifier} from ${this.fromArea} at ${this.scheduledDeparture}`,
      provenance: this.provenance.toJSON(),
      ...overrides
    });
  }

  /**
   * Creates a TransportTimetableOption from a static or database TransportSchedule instance.
   * @param {object} schedule
   * @param {object} [options={}]
   * @returns {TransportTimetableOption}
   */
  static fromSchedule(schedule, options = {}) {
    const requestedTime = options.requestedTime || schedule.departureTime;
    const [reqH, reqM] = requestedTime.split(':').map(Number);
    const [depH, depM] = schedule.departureTime.split(':').map(Number);

    let wait = (depH * 60 + depM) - (reqH * 60 + reqM);
    if (wait < 0) {
      // Midnight crossing: requested 23:55, dep 00:15
      wait = (1440 - (reqH * 60 + reqM)) + (depH * 60 + depM);
    }

    return new TransportTimetableOption({
      id: `opt-${schedule.id || schedule.tripIdentifier}-${Date.now()}`,
      tripIdentifier: schedule.tripIdentifier,
      serviceId: schedule.serviceId,
      lineIdentifier: options.lineIdentifier || schedule.serviceId || 'TRANSIT',
      mode: options.mode || 'train',
      fromStopId: schedule.fromStopId,
      toStopId: schedule.toStopId,
      fromArea: options.fromArea || schedule.fromStopId,
      toArea: options.toArea || schedule.toStopId,
      scheduledDeparture: schedule.departureTime,
      scheduledArrival: schedule.arrivalTime,
      durationMinutes: Number(schedule.durationMinutes),
      waitingTimeMinutes: wait,
      totalDurationMinutes: Number(schedule.durationMinutes) + wait,
      frequencyMinutes: options.frequencyMinutes || null,
      fareRupees: options.fareRupees || 0,
      operatingDays: schedule.operatingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      status: schedule.status || 'OPERATIONAL',
      isAvailable: schedule.status === 'OPERATIONAL',
      provenance: schedule.provenance || DataProvenance.verified('Official Timetable Schedule').toJSON()
    });
  }

  toJSON() {
    return {
      id: this.id,
      tripIdentifier: this.tripIdentifier,
      serviceId: this.serviceId,
      lineIdentifier: this.lineIdentifier,
      mode: this.mode,
      fromStopId: this.fromStopId,
      toStopId: this.toStopId,
      fromArea: this.fromArea,
      toArea: this.toArea,
      scheduledDeparture: this.scheduledDeparture,
      scheduledArrival: this.scheduledArrival,
      durationMinutes: this.durationMinutes,
      waitingTimeMinutes: this.waitingTimeMinutes,
      totalDurationMinutes: this.totalDurationMinutes,
      frequencyMinutes: this.frequencyMinutes,
      fareRupees: this.fareRupees,
      operatingDays: [...this.operatingDays],
      status: this.status,
      isAvailable: this.isAvailable,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt
    };
  }
}

module.exports = {
  TransportTimetableOption,
  timetableOptionSchema
};
