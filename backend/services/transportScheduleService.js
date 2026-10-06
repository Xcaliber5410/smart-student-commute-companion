/**
 * TransportScheduleService
 *
 * Provides timetable lookup, scheduled departure options, frequency modeling,
 * waiting time calculation, operating window validation, and travel-time estimation.
 *
 * Core Capabilities:
 * - Operating windows and day-of-week service availability checking
 * - Explicit database timetable schedule queries with GTFS provenance
 * - Deterministic synthetic headway-based timetable synthesis for high-frequency corridors
 * - Reverse lookup (finding departures to meet desired arrival times)
 * - Edge-of-day and midnight-crossing time calculation
 * - Multi-segment chronological itinerary propagation
 * - Clear 4-tier provenance tagging (VERIFIED, ESTIMATED, SYNTHETIC)
 */

const { transportRepository } = require('../repositories/TransportRepository');
const { transportNetworkRepository } = require('../repositories/TransportNetworkRepository');
const { TransportSegment } = require('../models/TransportSegment');
const { TransportConnection } = require('../models/TransportConnection');
const { TransportSchedule } = require('../models/TransportSchedule');
const { TransportTimetableOption } = require('../models/TransportTimetableOption');
const { SegmentTravelEstimate } = require('../models/SegmentTravelEstimate');
const {
  TRANSPORT_MODES,
  DataProvenance,
  PROVENANCE_TIERS,
  PROVENANCE_CONFIDENCE,
  TravelEstimate
} = require('../models/CommuteContracts');
const { ValidationError, NotFoundError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Standard operating windows for Mumbai multimodal transit networks.
 */
const DEFAULT_OPERATING_HOURS = Object.freeze({
  [TRANSPORT_MODES.TRAIN]: { start: '04:15', end: '01:15', name: 'Western Railway Suburban' }, // Night shutdown 01:16–04:14
  [TRANSPORT_MODES.METRO]: { start: '05:30', end: '23:45', name: 'Mumbai Metro Line 1' },
  [TRANSPORT_MODES.BUS]: { start: '06:00', end: '22:30', name: 'BEST Feeder Bus Services' },
  [TRANSPORT_MODES.AUTO]: { start: '06:00', end: '23:59', name: 'Auto-Rickshaw Daytime/Evening' },
  [TRANSPORT_MODES.SHARED_AUTO]: { start: '06:30', end: '22:00', name: 'Shared Auto Feeder Route' },
  [TRANSPORT_MODES.WALK]: { start: '00:00', end: '23:59', name: 'Pedestrian Walking' }
});

/**
 * Peak and off-peak headway frequencies (in minutes) by transport mode.
 */
const DEFAULT_HEADWAYS = Object.freeze({
  [TRANSPORT_MODES.METRO]: { peak: 4, offPeak: 7, night: 8 },
  [TRANSPORT_MODES.TRAIN]: { peak: 6, offPeak: 12, night: 18 },
  [TRANSPORT_MODES.BUS]: { peak: 10, offPeak: 15, night: 20 },
  [TRANSPORT_MODES.SHARED_AUTO]: { peak: 4, offPeak: 8, night: 12 },
  [TRANSPORT_MODES.AUTO]: { peak: 3, offPeak: 3, night: 5 },
  [TRANSPORT_MODES.WALK]: { peak: 0, offPeak: 0, night: 0 }
});

const DAY_ABBREVIATIONS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

class TransportScheduleService {
  constructor(options = {}) {
    this.transportRepo = options.transportRepo || transportRepository;
    this.networkRepo = options.networkRepo || transportNetworkRepository;
  }

  // ==========================================================================
  // 1. TIME UTILITIES & VALIDATION
  // ==========================================================================

  /**
   * Converts HH:MM string to minutes past midnight (0 - 1439).
   * @param {string} timeStr
   * @returns {number}
   */
  timeToMinutes(timeStr) {
    if (typeof timeStr !== 'string' || !timeRegex.test(timeStr)) {
      throw new ValidationError(`Invalid time format '${timeStr}'. Expected HH:MM in 24-hour format (00:00 - 23:59)`);
    }
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Converts minutes past midnight to HH:MM string (modulo 1440).
   * @param {number} minutes
   * @returns {string}
   */
  minutesToTime(minutes) {
    const wrapped = ((Math.floor(minutes) % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60).toString().padStart(2, '0');
    const m = (wrapped % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Calculates waiting time between requested departure and actual scheduled departure.
   * Gracefully handles midnight crossover (e.g. requested 23:50, departs 00:10).
   * @param {string} requestedTime
   * @param {string} departureTime
   * @returns {number} Wait time in minutes
   */
  calculateWaitTime(requestedTime, departureTime) {
    const reqM = this.timeToMinutes(requestedTime);
    const depM = this.timeToMinutes(departureTime);

    if (depM >= reqM) {
      return depM - reqM;
    }
    // Midnight crossing
    return (1440 - reqM) + depM;
  }

  /**
   * Normalizes arbitrary date input (Date instance, ISO string, 'Monday', 'Mon')
   * into standardized 3-letter title-case day ('Mon', 'Tue', 'Wed', etc.).
   * @param {Date|string} dateOrDay
   * @returns {string}
   */
  normalizeDayOfWeek(dateOrDay) {
    if (!dateOrDay) return 'Mon';

    if (dateOrDay instanceof Date) {
      if (isNaN(dateOrDay.getTime())) {
        throw new ValidationError('Invalid Date object provided');
      }
      return DAY_ABBREVIATIONS[dateOrDay.getDay()];
    }

    if (typeof dateOrDay === 'string') {
      const clean = dateOrDay.trim();

      // Check if ISO Date string: YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
        const parsed = new Date(clean);
        if (isNaN(parsed.getTime())) {
          throw new ValidationError(`Invalid ISO date string '${clean}'`);
        }
        return DAY_ABBREVIATIONS[parsed.getDay()];
      }

      // Check day name or abbreviation
      const lower = clean.toLowerCase();
      const match = DAY_ABBREVIATIONS.find(d => d.toLowerCase().startsWith(lower.slice(0, 3)));
      if (match) return match;
    }

    throw new ValidationError(`Invalid date or day of week identifier: '${dateOrDay}'`);
  }

  // ==========================================================================
  // 2. OPERATING HOURS & AVAILABILITY
  // ==========================================================================

  /**
   * Retrieves operating hours for a specific transport mode or segment.
   * @param {string} mode
   * @param {object|null} [segment=null]
   * @returns {{ start: string, end: string, name: string }}
   */
  getOperatingHours(mode, segment = null) {
    if (segment && segment.operatingHours) {
      return {
        start: segment.operatingHours.start || '05:00',
        end: segment.operatingHours.end || '23:30',
        name: `${segment.lineIdentifier || mode} Custom Window`
      };
    }
    return DEFAULT_OPERATING_HOURS[mode] || { start: '05:00', end: '23:30', name: `${mode} Default Window` };
  }

  /**
   * Checks whether a given time is within the service's operating hours.
   * Supports both normal daytime windows (05:30 to 23:45)
   * and overnight windows that span midnight (04:15 to 01:15 next morning).
   * @param {string} timeStr
   * @param {{ start: string, end: string }} operatingHours
   * @returns {boolean}
   */
  isWithinOperatingHours(timeStr, operatingHours) {
    const currentM = this.timeToMinutes(timeStr);
    const startM = this.timeToMinutes(operatingHours.start);
    const endM = this.timeToMinutes(operatingHours.end);

    if (startM <= endM) {
      // Normal daytime window: e.g. 05:30 to 23:45
      return currentM >= startM && currentM <= endM;
    } else {
      // Overnight window: e.g. 04:15 to 01:15 (next day)
      // Service runs from startM up to 23:59, and from 00:00 up to endM.
      // Outside window is strictly between endM and startM (e.g. 01:16 to 04:14).
      return currentM >= startM || currentM <= endM;
    }
  }

  /**
   * Checks whether a service operates on a given day of the week.
   * @param {string[]} operatingDays
   * @param {string} dayOfWeek
   * @returns {boolean}
   */
  operatesOnDay(operatingDays, dayOfWeek) {
    if (!operatingDays || !Array.isArray(operatingDays) || operatingDays.length === 0) {
      return true;
    }
    const target = dayOfWeek.slice(0, 3).toLowerCase();
    return operatingDays.some(d => d.slice(0, 3).toLowerCase() === target);
  }

  /**
   * Determines current headway based on time of day (peak vs off-peak).
   * @param {string} mode
   * @param {string} timeStr
   * @returns {number} Headway minutes
   */
  getHeadwayMinutes(mode, timeStr) {
    const headways = DEFAULT_HEADWAYS[mode] || { peak: 10, offPeak: 15, night: 20 };
    const currentM = this.timeToMinutes(timeStr);

    // Morning Peak: 07:30 (450m) to 11:00 (660m)
    // Evening Peak: 16:30 (990m) to 20:30 (1230m)
    const isPeak = (currentM >= 450 && currentM <= 660) || (currentM >= 990 && currentM <= 1230);
    if (isPeak) return headways.peak;

    // Late Night / Early Morning: before 06:30 or after 21:30
    const isNight = currentM < 390 || currentM > 1290;
    if (isNight) return headways.night;

    return headways.offPeak;
  }

  // ==========================================================================
  // 3. SEGMENT TIMETABLE LOOKUP & TRAVEL ESTIMATE
  // ==========================================================================

  /**
   * Answers the core question:
   * "Given a transport segment and requested departure window, what scheduled options
   *  are available and what is the expected travel time?"
   *
   * @param {TransportSegment|string|object} segmentOrId
   * @param {object} [options={}]
   * @param {string} [options.targetTime='08:00'] Desired departure time in HH:MM
   * @param {string} [options.targetArrivalTime] Optional desired arrival time in HH:MM
   * @param {number} [options.windowMinutes=30] Departure search window in minutes
   * @param {string|Date} [options.date='Mon'] Date or day of week
   * @param {number} [options.limit=5] Maximum number of departures to return
   * @returns {SegmentTravelEstimate}
   */
  getDeparturesForSegment(segmentOrId, options = {}) {
    // 1. Resolve and validate segment
    const segment = this._resolveSegment(segmentOrId);

    // 2. Parse and validate options
    const targetTime = options.targetTime || options.desiredDepartureTime || '08:00';
    if (!timeRegex.test(targetTime)) {
      throw new ValidationError(`Target departure time '${targetTime}' must be in HH:MM 24-hour format`);
    }

    if (options.targetArrivalTime && !timeRegex.test(options.targetArrivalTime)) {
      throw new ValidationError(`Target arrival time '${options.targetArrivalTime}' must be in HH:MM 24-hour format`);
    }

    const windowMinutes = options.windowMinutes !== undefined ? Number(options.windowMinutes) : 30;
    if (isNaN(windowMinutes) || windowMinutes < 0) {
      throw new ValidationError('Window minutes must be a non-negative number');
    }

    const dayOfWeek = this.normalizeDayOfWeek(options.date || options.dayOfWeek);
    const limit = Math.max(1, options.limit || options.maxOptions || 5);
    const operatingHours = this.getOperatingHours(segment.mode, segment);

    // 3. Check segment operational status
    if (segment.status === 'INACTIVE' || segment.status === 'SUSPENDED') {
      return new SegmentTravelEstimate({
        segmentId: segment.id,
        serviceId: segment.serviceId,
        lineIdentifier: segment.lineIdentifier,
        mode: segment.mode,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        fromArea: segment.fromArea,
        toArea: segment.toArea,
        distanceKm: segment.distanceKm || 0,
        fareRupees: segment.fareRupees || 0,
        requestedTime: targetTime,
        dayOfWeek,
        isServiceAvailable: false,
        availabilityReason: 'SERVICE_SUSPENDED',
        operatingHours,
        departures: [],
        nextAvailableDeparture: null,
        expectedTravelTime: {
          waitingTimeMinutes: 0,
          segmentDurationMinutes: segment.durationMinutes || 0,
          totalDurationMinutes: segment.durationMinutes || 0,
          confidenceInterval: { minMinutes: 0, maxMinutes: 0 }
        },
        provenance: DataProvenance.estimated('Transit Network Model', 'Segment currently inactive/suspended').toJSON()
      });
    }

    // 4. Check day-of-week operation
    const operatingDays = segment.operatingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    if (!this.operatesOnDay(operatingDays, dayOfWeek)) {
      return new SegmentTravelEstimate({
        segmentId: segment.id,
        serviceId: segment.serviceId,
        lineIdentifier: segment.lineIdentifier,
        mode: segment.mode,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        fromArea: segment.fromArea,
        toArea: segment.toArea,
        distanceKm: segment.distanceKm || 0,
        fareRupees: segment.fareRupees || 0,
        requestedTime: targetTime,
        dayOfWeek,
        isServiceAvailable: false,
        availabilityReason: 'NO_SERVICE_ON_DAY',
        operatingHours,
        departures: [],
        nextAvailableDeparture: null,
        expectedTravelTime: {
          waitingTimeMinutes: 0,
          segmentDurationMinutes: segment.durationMinutes || 0,
          totalDurationMinutes: segment.durationMinutes || 0,
          confidenceInterval: { minMinutes: 0, maxMinutes: 0 }
        },
        provenance: DataProvenance.estimated('Transit Network Model', `Service does not operate on ${dayOfWeek}`).toJSON()
      });
    }

    // 5. Check operating hours window
    const inOperatingHours = this.isWithinOperatingHours(targetTime, operatingHours);
    if (!inOperatingHours) {
      // Find the first morning departure
      const firstDepTime = operatingHours.start;
      const firstArrTime = this.minutesToTime(this.timeToMinutes(firstDepTime) + (segment.durationMinutes || 10));
      const nextAvailable = new TransportTimetableOption({
        id: `opt-next-morn-${segment.id}`,
        tripIdentifier: `TRIP_FIRST_${segment.lineIdentifier}`,
        serviceId: segment.serviceId,
        lineIdentifier: segment.lineIdentifier,
        mode: segment.mode,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        fromArea: segment.fromArea,
        toArea: segment.toArea,
        scheduledDeparture: firstDepTime,
        scheduledArrival: firstArrTime,
        durationMinutes: segment.durationMinutes || 10,
        waitingTimeMinutes: this.calculateWaitTime(targetTime, firstDepTime),
        totalDurationMinutes: (segment.durationMinutes || 10) + this.calculateWaitTime(targetTime, firstDepTime),
        frequencyMinutes: null,
        fareRupees: segment.fareRupees || 0,
        operatingDays,
        status: 'OPERATIONAL',
        isAvailable: true,
        provenance: DataProvenance.synthetic('Timetable Engine', 'First scheduled departure next morning').toJSON()
      });

      return new SegmentTravelEstimate({
        segmentId: segment.id,
        serviceId: segment.serviceId,
        lineIdentifier: segment.lineIdentifier,
        mode: segment.mode,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        fromArea: segment.fromArea,
        toArea: segment.toArea,
        distanceKm: segment.distanceKm || 0,
        fareRupees: segment.fareRupees || 0,
        requestedTime: targetTime,
        dayOfWeek,
        isServiceAvailable: false,
        availabilityReason: 'OUTSIDE_OPERATING_HOURS',
        operatingHours,
        departures: [],
        nextAvailableDeparture: nextAvailable,
        expectedTravelTime: {
          waitingTimeMinutes: nextAvailable.waitingTimeMinutes,
          segmentDurationMinutes: segment.durationMinutes || 0,
          totalDurationMinutes: nextAvailable.totalDurationMinutes,
          confidenceInterval: {
            minMinutes: Math.round(nextAvailable.totalDurationMinutes * 0.9),
            maxMinutes: Math.round(nextAvailable.totalDurationMinutes * 1.25)
          }
        },
        provenance: DataProvenance.synthetic('Timetable Engine', `Requested time ${targetTime} is outside operating hours (${operatingHours.start}-${operatingHours.end})`).toJSON()
      });
    }

    // 6. Look up explicit database schedules
    let dbSchedules = this.transportRepo.findSchedules(segment.fromStopId, segment.toStopId, { status: 'OPERATIONAL' });
    dbSchedules = dbSchedules.filter(sch => sch.operatesOnDay(dayOfWeek));

    let departureOptions = [];

    if (dbSchedules.length > 0) {
      // Match database timetable schedules within window [targetTime, targetTime + windowMinutes]
      const targetM = this.timeToMinutes(targetTime);
      const maxWindowM = targetM + windowMinutes;

      for (const sch of dbSchedules) {
        const depM = this.timeToMinutes(sch.departureTime);
        let adjustedDepM = depM;
        if (adjustedDepM < targetM && maxWindowM >= 1440) {
          // Midnight wrap
          adjustedDepM += 1440;
        }

        if (adjustedDepM >= targetM && adjustedDepM <= maxWindowM) {
          departureOptions.push(TransportTimetableOption.fromSchedule(sch, {
            requestedTime: targetTime,
            lineIdentifier: segment.lineIdentifier,
            mode: segment.mode,
            fromArea: segment.fromArea,
            toArea: segment.toArea,
            fareRupees: segment.fareRupees
          }));
        }
      }
    }

    // 7. Fallback to Deterministic Headway Timetable Generator if no DB rows in window
    if (departureOptions.length === 0) {
      departureOptions = this._generateHeadwayDepartures(segment, targetTime, windowMinutes, dayOfWeek, operatingHours);
    }

    // 8. If targetArrivalTime is provided, filter/sort to meet target arrival
    if (options.targetArrivalTime) {
      const arrLimitM = this.timeToMinutes(options.targetArrivalTime);
      departureOptions = departureOptions.filter(opt => this.timeToMinutes(opt.scheduledArrival) <= arrLimitM);
    }

    // Limit to requested count
    departureOptions = departureOptions.slice(0, limit);

    // 9. Construct expected travel time and confidence interval
    if (departureOptions.length === 0) {
      // No departures found strictly within the requested window
      return new SegmentTravelEstimate({
        segmentId: segment.id,
        serviceId: segment.serviceId,
        lineIdentifier: segment.lineIdentifier,
        mode: segment.mode,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        fromArea: segment.fromArea,
        toArea: segment.toArea,
        distanceKm: segment.distanceKm || 0,
        fareRupees: segment.fareRupees || 0,
        requestedTime: targetTime,
        dayOfWeek,
        isServiceAvailable: false,
        availabilityReason: 'NO_TRIPS_IN_WINDOW',
        operatingHours,
        departures: [],
        nextAvailableDeparture: null,
        expectedTravelTime: {
          waitingTimeMinutes: 0,
          segmentDurationMinutes: segment.durationMinutes || 0,
          totalDurationMinutes: segment.durationMinutes || 0,
          confidenceInterval: { minMinutes: 0, maxMinutes: 0 }
        },
        provenance: DataProvenance.estimated('Timetable Engine', `No trips found in the ${windowMinutes}m window after ${targetTime}`).toJSON()
      });
    }

    const primaryOption = departureOptions[0];
    const waitingTime = primaryOption.waitingTimeMinutes;
    const duration = primaryOption.durationMinutes;
    const totalDuration = waitingTime + duration;

    // Buffer calculation: minimum is duration (no negative travel), max adds buffer
    const minMinutes = Math.max(1, Math.round(totalDuration * 0.9));
    const maxMinutes = Math.max(minMinutes, Math.round(totalDuration * 1.25) + 2);

    return new SegmentTravelEstimate({
      segmentId: segment.id,
      serviceId: segment.serviceId,
      lineIdentifier: segment.lineIdentifier,
      mode: segment.mode,
      fromStopId: segment.fromStopId,
      toStopId: segment.toStopId,
      fromArea: segment.fromArea,
      toArea: segment.toArea,
      distanceKm: segment.distanceKm || 0,
      fareRupees: primaryOption.fareRupees,
      requestedTime: targetTime,
      dayOfWeek,
      isServiceAvailable: true,
      availabilityReason: 'OPERATIONAL',
      operatingHours,
      departures: departureOptions,
      nextAvailableDeparture: primaryOption,
      expectedTravelTime: {
        waitingTimeMinutes: waitingTime,
        segmentDurationMinutes: duration,
        totalDurationMinutes: totalDuration,
        confidenceInterval: {
          minMinutes,
          maxMinutes
        }
      },
      provenance: primaryOption.provenance.toJSON()
    });
  }

  /**
   * Alias method for timetable estimate lookup.
   * @param {TransportSegment|string|object} segmentOrId
   * @param {object} [options={}]
   * @returns {SegmentTravelEstimate}
   */
  getTravelEstimate(segmentOrId, options = {}) {
    return this.getDeparturesForSegment(segmentOrId, options);
  }

  // ==========================================================================
  // 4. CONNECTION / TRANSFER TRAVEL ESTIMATE
  // ==========================================================================

  /**
   * Estimates travel time for pedestrian links, modal interchanges, and feeder shuttles.
   * @param {TransportConnection|string|object} connectionOrId
   * @param {object} [options={}]
   * @returns {SegmentTravelEstimate}
   */
  estimateConnection(connectionOrId, options = {}) {
    const conn = this._resolveConnection(connectionOrId);
    const targetTime = options.targetTime || '08:00';
    if (!timeRegex.test(targetTime)) {
      throw new ValidationError(`Target departure time '${targetTime}' must be in HH:MM format`);
    }

    const isTransfer = conn.connectionType === 'TRANSFER' || conn.connectionType === 'INTERCHANGE';
    const isFeeder = conn.connectionType === 'FEEDER_SHUTTLE';
    const isWalk = conn.connectionType === 'WALKING_ACCESS';
    const duration = conn.durationMinutes !== undefined ? Number(conn.durationMinutes) : (conn.durationMin !== undefined ? Number(conn.durationMin) : 3);
    const fare = conn.fareRupees !== undefined ? Number(conn.fareRupees) : (conn.fareInr !== undefined ? Number(conn.fareInr) : 0);
    const waitTime = isTransfer
      ? (conn.transferPenaltyMin !== undefined ? Number(conn.transferPenaltyMin) : 3)
      : (isFeeder ? 3 : 0);
    const totalDuration = duration + waitTime;

    const depTime = (isWalk || waitTime === 0) ? targetTime : this.minutesToTime(this.timeToMinutes(targetTime) + waitTime);
    const arrTime = this.minutesToTime(this.timeToMinutes(depTime) + duration);

    const minMinutes = Math.max(1, Math.round(totalDuration * 0.9));
    const maxMinutes = Math.max(minMinutes, Math.round(totalDuration * 1.25) + 1);

    const option = new TransportTimetableOption({
      id: `opt-conn-${conn.id}-${Date.now()}`,
      tripIdentifier: `CONN_${conn.connectionType}_${conn.fromStopId}`,
      serviceId: null,
      lineIdentifier: isTransfer ? 'Interchange Transfer' : (isWalk ? 'Walking Path' : 'Feeder Shuttle'),
      mode: conn.mode,
      fromStopId: conn.fromStopId,
      toStopId: conn.toStopId,
      fromArea: conn.fromArea,
      toArea: conn.toArea,
      scheduledDeparture: depTime,
      scheduledArrival: arrTime,
      durationMinutes: duration,
      waitingTimeMinutes: waitTime,
      totalDurationMinutes: totalDuration,
      frequencyMinutes: null,
      fareRupees: fare,
      operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      status: conn.status === 'ACTIVE' ? 'OPERATIONAL' : 'CANCELLED',
      isAvailable: conn.status === 'ACTIVE',
      provenance: DataProvenance.estimated('Pedestrian & Transfer Model', `${conn.connectionType} estimated walking/transfer time`).toJSON()
    });

    return new SegmentTravelEstimate({
      segmentId: conn.id,
      serviceId: null,
      lineIdentifier: isTransfer ? 'Interchange Transfer' : (isWalk ? 'Walking Path' : 'Feeder Shuttle'),
      mode: conn.mode,
      fromStopId: conn.fromStopId,
      toStopId: conn.toStopId,
      fromArea: conn.fromArea,
      toArea: conn.toArea,
      distanceKm: conn.distanceKm || 0,
      fareRupees: fare,
      requestedTime: targetTime,
      dayOfWeek: options.dayOfWeek || 'Mon',
      isServiceAvailable: conn.status === 'ACTIVE',
      availabilityReason: conn.status === 'ACTIVE' ? 'OPERATIONAL' : 'SERVICE_SUSPENDED',
      operatingHours: { start: '00:00', end: '23:59' },
      departures: [option],
      nextAvailableDeparture: option,
      expectedTravelTime: {
        waitingTimeMinutes: waitTime,
        segmentDurationMinutes: duration,
        totalDurationMinutes: totalDuration,
        confidenceInterval: { minMinutes, maxMinutes }
      },
      provenance: DataProvenance.estimated('Pedestrian & Transfer Model').toJSON()
    });
  }

  // ==========================================================================
  // 5. MULTI-SEGMENT JOURNEY SCHEDULE PROPAGATION
  // ==========================================================================

  /**
   * Chains multiple ordered segments and transfer connections, propagating
   * departure and arrival clocks sequentially from initial requested time.
   *
   * @param {Array<TransportSegment|TransportConnection>} steps
   * @param {object} [options={}]
   * @param {string} [options.initialDepartureTime='08:00']
   * @returns {{
   *   initialDepartureTime: string,
   *   finalArrivalTime: string,
   *   totalJourneyMinutes: number,
   *   totalWaitingMinutes: number,
   *   totalTransitMinutes: number,
   *   totalWalkingMinutes: number,
   *   totalFareRupees: number,
   *   stepEstimates: SegmentTravelEstimate[],
   *   travelEstimate: TravelEstimate
   * }}
   */
  estimateMultiSegmentJourney(steps, options = {}) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new ValidationError('Journey steps must be a non-empty array of segments or connections');
    }

    let currentTime = options.initialDepartureTime || '08:00';
    const dayOfWeek = this.normalizeDayOfWeek(options.date || options.dayOfWeek);

    const stepEstimates = [];
    let totalWaiting = 0;
    let totalTransit = 0;
    let totalWalking = 0;
    let totalFare = 0;
    let totalDistance = 0;

    for (const step of steps) {
      let est;
      if (step instanceof TransportConnection || (step.connectionType && !step.lineIdentifier)) {
        est = this.estimateConnection(step, { targetTime: currentTime, dayOfWeek });
      } else {
        est = this.getDeparturesForSegment(step, { targetTime: currentTime, dayOfWeek, windowMinutes: 45 });
      }

      stepEstimates.push(est);

      if (!est.isServiceAvailable) {
        throw new Error(`Journey interrupted at step '${est.lineIdentifier}': service unavailable (${est.availabilityReason})`);
      }

      const dep = est.nextAvailableDeparture;
      totalWaiting += est.expectedTravelTime.waitingTimeMinutes;
      if (est.mode === 'walk') {
        totalWalking += est.expectedTravelTime.segmentDurationMinutes;
      } else {
        totalTransit += est.expectedTravelTime.segmentDurationMinutes;
      }

      totalFare += est.fareRupees;
      totalDistance += est.distanceKm;

      // Clock advances to arrival of current step
      currentTime = dep.scheduledArrival;
    }

    const totalDuration = totalWaiting + totalTransit + totalWalking;
    const initialDep = options.initialDepartureTime || '08:00';
    const finalArr = currentTime;

    const minMinutes = Math.max(1, Math.round(totalDuration * 0.9));
    const maxMinutes = Math.max(minMinutes, Math.round(totalDuration * 1.2));

    const travelEstimate = new TravelEstimate({
      totalDurationMinutes: totalDuration,
      walkingDurationMinutes: totalWalking,
      transitDurationMinutes: totalTransit,
      totalDistanceKm: totalDistance,
      walkingDistanceKm: stepEstimates.filter(e => e.mode === 'walk').reduce((acc, e) => acc + e.distanceKm, 0),
      totalFareRupees: totalFare,
      transferCount: Math.max(0, stepEstimates.filter(e => e.mode !== 'walk').length - 1),
      confidenceInterval: { minMinutes, maxMinutes },
      provenance: DataProvenance.estimated('Multimodal Itinerary Engine', 'Sequential timetable propagation').toJSON()
    });

    return {
      initialDepartureTime: initialDep,
      finalArrivalTime: finalArr,
      totalJourneyMinutes: totalDuration,
      totalWaitingMinutes: totalWaiting,
      totalTransitMinutes: totalTransit,
      totalWalkingMinutes: totalWalking,
      totalFareRupees: totalFare,
      stepEstimates,
      travelEstimate
    };
  }

  // ==========================================================================
  // 6. RICH TIMETABLE SEEDER
  // ==========================================================================

  /**
   * Seeds realistic scheduled trips into SQLite for suburban trains, metro, and feeder buses.
   * @param {boolean} [force=false]
   * @returns {number} Count of seeded schedules
   */
  seedRichTimetables(force = false) {
    const existing = this.transportRepo.database.prepare('SELECT COUNT(*) as cnt FROM transport_schedules').get().cnt;
    if (existing > 5 && !force) return 0;

    const now = Date.now();
    const schedules = [];

    // A) Western Railway Suburban Trains (Mon-Fri)
    const wrTimes = [
      { dep: '07:30', arr: '07:58', trip: 'TRIP_WR_801' },
      { dep: '07:45', arr: '08:13', trip: 'TRIP_WR_802' },
      { dep: '08:00', arr: '08:28', trip: 'TRIP_WR_901' },
      { dep: '08:15', arr: '08:43', trip: 'TRIP_WR_903' },
      { dep: '08:30', arr: '08:58', trip: 'TRIP_WR_905' },
      { dep: '08:45', arr: '09:13', trip: 'TRIP_WR_907' },
      { dep: '09:00', arr: '09:28', trip: 'TRIP_WR_909' },
      { dep: '09:15', arr: '09:43', trip: 'TRIP_WR_911' },
      { dep: '09:30', arr: '09:58', trip: 'TRIP_WR_913' }
    ];

    for (const t of wrTimes) {
      schedules.push(new TransportSchedule({
        id: `sched-wr-${t.dep.replace(':', '')}`,
        serviceId: 'srv-wr-slow',
        tripIdentifier: t.trip,
        fromStopId: 'STN_BORIVALI',
        toStopId: 'STN_VILEPARLE',
        departureTime: t.dep,
        arrivalTime: t.arr,
        durationMinutes: 28,
        operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        status: 'OPERATIONAL',
        provenance: DataProvenance.verified('Western Railway GTFS Suburban Feed', 'Official suburban rail timetable').toJSON(),
        createdAt: now
      }));
    }

    // B) Western Railway Weekend Reduced Service (Sat, Sun)
    const wrWeekendTimes = [
      { dep: '08:00', arr: '08:28', trip: 'TRIP_WR_W01' },
      { dep: '08:30', arr: '08:58', trip: 'TRIP_WR_W03' },
      { dep: '09:00', arr: '09:28', trip: 'TRIP_WR_W05' }
    ];

    for (const t of wrWeekendTimes) {
      schedules.push(new TransportSchedule({
        id: `sched-wr-wknd-${t.dep.replace(':', '')}`,
        serviceId: 'srv-wr-slow',
        tripIdentifier: t.trip,
        fromStopId: 'STN_BORIVALI',
        toStopId: 'STN_VILEPARLE',
        departureTime: t.dep,
        arrivalTime: t.arr,
        durationMinutes: 28,
        operatingDays: ['Sat', 'Sun'],
        status: 'OPERATIONAL',
        provenance: DataProvenance.verified('Western Railway Weekend GTFS Feed', 'Official weekend suburban timetable').toJSON(),
        createdAt: now
      }));
    }

    // C) Mumbai Metro Line 1 (Versova to DN Nagar) - Daily Mon-Sun
    const metroTimes = [
      { dep: '08:00', arr: '08:05', trip: 'TRIP_M1_800' },
      { dep: '08:04', arr: '08:09', trip: 'TRIP_M1_804' },
      { dep: '08:08', arr: '08:13', trip: 'TRIP_M1_808' },
      { dep: '08:12', arr: '08:17', trip: 'TRIP_M1_812' },
      { dep: '08:16', arr: '08:21', trip: 'TRIP_M1_816' },
      { dep: '08:20', arr: '08:25', trip: 'TRIP_M1_820' },
      { dep: '08:24', arr: '08:29', trip: 'TRIP_M1_824' },
      { dep: '08:28', arr: '08:33', trip: 'TRIP_M1_828' },
      { dep: '08:32', arr: '08:37', trip: 'TRIP_M1_832' }
    ];

    for (const t of metroTimes) {
      schedules.push(new TransportSchedule({
        id: `sched-m1-${t.dep.replace(':', '')}`,
        serviceId: 'srv-metro-1',
        tripIdentifier: t.trip,
        fromStopId: 'METRO_VERSOVA',
        toStopId: 'METRO_DNNAGAR',
        departureTime: t.dep,
        arrivalTime: t.arr,
        durationMinutes: 5,
        operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        status: 'OPERATIONAL',
        provenance: DataProvenance.verified('MMOPL Published Headway Schedule', 'Metro Line 1 4-minute peak headway timetable').toJSON(),
        createdAt: now
      }));
    }

    // D) BEST Feeder Bus 201 (Andheri to Irla/DJ Sanghvi) - Mon-Sat
    const busTimes = [
      { dep: '08:00', arr: '08:14', trip: 'TRIP_B201_800' },
      { dep: '08:12', arr: '08:26', trip: 'TRIP_B201_812' },
      { dep: '08:24', arr: '08:38', trip: 'TRIP_B201_824' },
      { dep: '08:36', arr: '08:50', trip: 'TRIP_B201_836' },
      { dep: '08:48', arr: '09:02', trip: 'TRIP_B201_848' },
      { dep: '09:00', arr: '09:14', trip: 'TRIP_B201_900' }
    ];

    for (const t of busTimes) {
      schedules.push(new TransportSchedule({
        id: `sched-b201-${t.dep.replace(':', '')}`,
        serviceId: 'srv-best-201',
        tripIdentifier: t.trip,
        fromStopId: 'BUS_ANDHERI_W',
        toStopId: 'BUS_IRLA_DJS',
        departureTime: t.dep,
        arrivalTime: t.arr,
        durationMinutes: 14,
        operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        status: 'OPERATIONAL',
        provenance: DataProvenance.estimated('BEST Route 201 Timetable Guide', 'Feeder frequency timetable').toJSON(),
        createdAt: now
      }));
    }

    return this.transportRepo.saveSchedules(schedules);
  }

  // ==========================================================================
  // INTERNAL HELPERS
  // ==========================================================================

  /**
   * Resolves a segment from instance, ID string, or plain object.
   * @private
   */
  _resolveSegment(segmentOrId) {
    if (!segmentOrId) {
      throw new ValidationError('A valid transport segment or segment identifier is required');
    }

    if (segmentOrId instanceof TransportSegment) {
      return segmentOrId;
    }

    if (typeof segmentOrId === 'string') {
      const seg = this.networkRepo.getSegmentById(segmentOrId);
      if (!seg) {
        throw new NotFoundError(`Transport segment '${segmentOrId}' not found in network`);
      }
      return seg;
    }

    if (typeof segmentOrId === 'object') {
      if (!segmentOrId.fromStopId || !segmentOrId.toStopId || !segmentOrId.mode) {
        throw new ValidationError('Invalid transport segment object: missing required stop and mode attributes');
      }
      try {
        return segmentOrId instanceof TransportSegment ? segmentOrId : new TransportSegment(segmentOrId);
      } catch (err) {
        throw new ValidationError(`Invalid transport segment: ${err.message}`, err.issues || err);
      }
    }

    throw new ValidationError('Invalid transport segment reference');
  }

  /**
   * Resolves a connection from instance, ID string, or plain object.
   * @private
   */
  _resolveConnection(connectionOrId) {
    if (!connectionOrId) {
      throw new ValidationError('A valid transport connection or identifier is required');
    }

    if (connectionOrId instanceof TransportConnection) {
      return connectionOrId;
    }

    if (typeof connectionOrId === 'string') {
      const conn = this.networkRepo.getConnectionById(connectionOrId);
      if (!conn) {
        throw new NotFoundError(`Transport connection '${connectionOrId}' not found in network`);
      }
      return conn;
    }

    if (typeof connectionOrId === 'object') {
      try {
        return connectionOrId instanceof TransportConnection ? connectionOrId : new TransportConnection(connectionOrId);
      } catch (err) {
        throw new ValidationError(`Invalid transport connection: ${err.message}`, err.issues || err);
      }
    }

    throw new ValidationError('Invalid transport connection reference');
  }

  /**
   * Deterministically generates headway-based departure options across the departure window.
   * @private
   */
  _generateHeadwayDepartures(segment, targetTime, windowMinutes, dayOfWeek, operatingHours) {
    const isWalk = segment.mode === 'walk';
    const isRoadOnDemand = segment.mode === 'auto';
    const duration = segment.durationMinutes || (isWalk ? 5 : 10);
    const targetM = this.timeToMinutes(targetTime);

    if (isWalk) {
      // Pedestrian walking: immediate departure, 0 wait time
      const arrM = targetM + duration;
      return [
        new TransportTimetableOption({
          id: `opt-walk-${Date.now()}`,
          tripIdentifier: `WALK_${targetTime.replace(':', '')}`,
          serviceId: null,
          lineIdentifier: 'Walking',
          mode: 'walk',
          fromStopId: segment.fromStopId,
          toStopId: segment.toStopId,
          fromArea: segment.fromArea,
          toArea: segment.toArea,
          scheduledDeparture: targetTime,
          scheduledArrival: this.minutesToTime(arrM),
          durationMinutes: duration,
          waitingTimeMinutes: 0,
          totalDurationMinutes: duration,
          frequencyMinutes: null,
          fareRupees: 0,
          operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          status: 'OPERATIONAL',
          isAvailable: true,
          provenance: DataProvenance.estimated('Pedestrian Speed Engine', 'Walking speed 4.5 km/h').toJSON()
        })
      ];
    }

    if (isRoadOnDemand) {
      // Auto-Rickshaw on demand: 2-4 minute hailing wait
      const waitM = 3;
      const depM = targetM + waitM;
      const arrM = depM + duration;
      return [
        new TransportTimetableOption({
          id: `opt-auto-${Date.now()}`,
          tripIdentifier: `AUTO_${targetTime.replace(':', '')}`,
          serviceId: segment.serviceId,
          lineIdentifier: segment.lineIdentifier || 'Auto Rickshaw',
          mode: 'auto',
          fromStopId: segment.fromStopId,
          toStopId: segment.toStopId,
          fromArea: segment.fromArea,
          toArea: segment.toArea,
          scheduledDeparture: this.minutesToTime(depM),
          scheduledArrival: this.minutesToTime(arrM),
          durationMinutes: duration,
          waitingTimeMinutes: waitM,
          totalDurationMinutes: waitM + duration,
          frequencyMinutes: null,
          fareRupees: segment.fareRupees || 28,
          operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          status: 'OPERATIONAL',
          isAvailable: true,
          provenance: DataProvenance.estimated('RTA Auto Rickshaw Hailing Model', 'Average street hailing time').toJSON()
        })
      ];
    }

    // Transit modes: metro, train, bus, shared_auto
    const headway = this.getHeadwayMinutes(segment.mode, targetTime);
    const departures = [];

    // First departure starts right after targetTime aligned with headway
    const offset = Math.max(1, Math.floor(headway / 2));
    let nextDepM = targetM + offset;
    const windowEndM = targetM + windowMinutes;

    let index = 1;
    while (nextDepM <= windowEndM && departures.length < 8) {
      const depTimeStr = this.minutesToTime(nextDepM);

      // Verify the generated departure is within operating hours
      if (this.isWithinOperatingHours(depTimeStr, operatingHours)) {
        const arrTimeStr = this.minutesToTime(nextDepM + duration);
        const wait = nextDepM - targetM;

        departures.push(
          new TransportTimetableOption({
            id: `opt-synth-${segment.id}-${depTimeStr.replace(':', '')}-${index}`,
            tripIdentifier: `SYNTH_${segment.lineIdentifier}_${depTimeStr.replace(':', '')}`,
            serviceId: segment.serviceId,
            lineIdentifier: segment.lineIdentifier,
            mode: segment.mode,
            fromStopId: segment.fromStopId,
            toStopId: segment.toStopId,
            fromArea: segment.fromArea,
            toArea: segment.toArea,
            scheduledDeparture: depTimeStr,
            scheduledArrival: arrTimeStr,
            durationMinutes: duration,
            waitingTimeMinutes: wait,
            totalDurationMinutes: wait + duration,
            frequencyMinutes: headway,
            fareRupees: segment.fareRupees || 10,
            operatingDays: segment.operatingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            status: 'OPERATIONAL',
            isAvailable: true,
            provenance: DataProvenance.synthetic('Deterministic Headway Timetable Engine', `Synthetic schedule derived from ${headway}m frequency`, PROVENANCE_CONFIDENCE.MEDIUM).toJSON()
          })
        );
      }

      nextDepM += headway;
      index++;
    }

    return departures;
  }
}

const transportScheduleService = new TransportScheduleService();

module.exports = {
  TransportScheduleService,
  transportScheduleService,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_HEADWAYS
};
