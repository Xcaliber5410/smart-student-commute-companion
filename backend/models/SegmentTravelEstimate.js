/**
 * SegmentTravelEstimate Domain Model
 *
 * Represents the comprehensive travel estimate and scheduled options response for a transport segment.
 * Answers:
 * "Given a transport segment and requested departure window, what scheduled options are available
 *  and what is the expected travel time?"
 *
 * Encapsulates service availability, operating hours, waiting times, duration, confidence intervals,
 * and 4-tier provenance labeling.
 */

const { z } = require('zod');
const {
  transportModeEnum,
  TravelEstimate,
  DataProvenance,
  provenanceSchema
} = require('./CommuteContracts');
const { TransportTimetableOption } = require('./TransportTimetableOption');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const operatingHoursSchema = z.object({
  start: z.string().regex(timeRegex),
  end: z.string().regex(timeRegex)
});

const travelTimeSummarySchema = z.object({
  waitingTimeMinutes: z.coerce.number().min(0),
  segmentDurationMinutes: z.coerce.number().min(0),
  totalDurationMinutes: z.coerce.number().min(0),
  confidenceInterval: z.object({
    minMinutes: z.coerce.number().min(0),
    maxMinutes: z.coerce.number().min(0)
  }).refine(ci => ci.minMinutes <= ci.maxMinutes, {
    message: 'minMinutes must be <= maxMinutes'
  })
});

const availabilityReasonEnum = z.enum([
  'OPERATIONAL',
  'OUTSIDE_OPERATING_HOURS',
  'NO_SERVICE_ON_DAY',
  'SERVICE_SUSPENDED',
  'NO_TRIPS_IN_WINDOW',
  'INVALID_SEGMENT'
]);

const segmentTravelEstimateSchema = z.object({
  segmentId: z.string().nullable().optional().default(null),
  serviceId: z.string().nullable().optional().default(null),
  lineIdentifier: z.string().default('TRANSIT'),
  mode: transportModeEnum,
  fromStopId: z.string().min(1),
  toStopId: z.string().min(1),
  fromArea: z.string().min(2).max(100),
  toArea: z.string().min(2).max(100),
  distanceKm: z.coerce.number().min(0).default(0),
  fareRupees: z.coerce.number().min(0).default(0),
  requestedTime: z.string().regex(timeRegex),
  requestedDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  dayOfWeek: z.string().default('Mon'),
  isServiceAvailable: z.boolean().default(true),
  availabilityReason: availabilityReasonEnum.default('OPERATIONAL'),
  operatingHours: operatingHoursSchema.default({ start: '05:00', end: '23:30' }),
  departures: z.array(z.any()).default([]),
  nextAvailableDeparture: z.any().nullable().optional().default(null),
  expectedTravelTime: travelTimeSummarySchema,
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Timetable & Travel Estimate Engine').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now())
});

class SegmentTravelEstimate {
  constructor(data) {
    const validated = segmentTravelEstimateSchema.parse(data);
    Object.assign(this, validated);

    // Instantiate domain instances for departures
    this.departures = (validated.departures || []).map(d =>
      d instanceof TransportTimetableOption ? d : new TransportTimetableOption(d)
    );

    this.nextAvailableDeparture = validated.nextAvailableDeparture
      ? (validated.nextAvailableDeparture instanceof TransportTimetableOption
          ? validated.nextAvailableDeparture
          : new TransportTimetableOption(validated.nextAvailableDeparture))
      : null;

    this.provenance = validated.provenance instanceof DataProvenance
      ? validated.provenance
      : new DataProvenance(validated.provenance);
  }

  /**
   * Converts the segment estimate into the canonical TravelEstimate contract object.
   * @returns {TravelEstimate}
   */
  toTravelEstimate() {
    const isWalking = this.mode === 'walk';
    return new TravelEstimate({
      totalDurationMinutes: this.expectedTravelTime.totalDurationMinutes,
      walkingDurationMinutes: isWalking ? this.expectedTravelTime.segmentDurationMinutes : 0,
      transitDurationMinutes: !isWalking ? this.expectedTravelTime.segmentDurationMinutes : 0,
      totalDistanceKm: this.distanceKm,
      walkingDistanceKm: isWalking ? this.distanceKm : 0,
      totalFareRupees: this.fareRupees,
      transferCount: 0,
      confidenceInterval: {
        minMinutes: this.expectedTravelTime.confidenceInterval.minMinutes,
        maxMinutes: this.expectedTravelTime.confidenceInterval.maxMinutes
      },
      provenance: this.provenance.toJSON()
    });
  }

  toJSON() {
    return {
      segmentId: this.segmentId,
      serviceId: this.serviceId,
      lineIdentifier: this.lineIdentifier,
      mode: this.mode,
      fromStopId: this.fromStopId,
      toStopId: this.toStopId,
      fromArea: this.fromArea,
      toArea: this.toArea,
      distanceKm: this.distanceKm,
      fareRupees: this.fareRupees,
      requestedTime: this.requestedTime,
      requestedDate: this.requestedDate,
      dayOfWeek: this.dayOfWeek,
      isServiceAvailable: this.isServiceAvailable,
      availabilityReason: this.availabilityReason,
      operatingHours: { ...this.operatingHours },
      departures: this.departures.map(d => d.toJSON()),
      nextAvailableDeparture: this.nextAvailableDeparture ? this.nextAvailableDeparture.toJSON() : null,
      expectedTravelTime: {
        waitingTimeMinutes: this.expectedTravelTime.waitingTimeMinutes,
        segmentDurationMinutes: this.expectedTravelTime.segmentDurationMinutes,
        totalDurationMinutes: this.expectedTravelTime.totalDurationMinutes,
        confidenceInterval: {
          minMinutes: this.expectedTravelTime.confidenceInterval.minMinutes,
          maxMinutes: this.expectedTravelTime.confidenceInterval.maxMinutes
        }
      },
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt
    };
  }
}

module.exports = {
  SegmentTravelEstimate,
  segmentTravelEstimateSchema
};
