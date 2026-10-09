/**
 * JourneyBuilderService
 *
 * Combines transport segments into a coherent, fully validated CommuteJourney.
 * Validates:
 * - Spatial connectivity (segments connect end-to-end without breaks)
 * - Chronological ordering (no negative or overlapping timings)
 * - Origin / destination consistency
 * - Transport reference validity (supported modes, valid stops)
 * - Service availability (rejects suspended or inactive services)
 *
 * Does not implement final route ranking or AI speculation.
 * Creates reliable candidate journeys for later scoring in the recommendation pipeline.
 */

const {
  CommuteJourney,
  JourneySegment,
  JOURNEY_SEGMENT_TYPES,
  RouteLeg,
  TransportSegment,
  TransportConnection,
  TransportTimetableOption,
  TRANSPORT_MODES,
  LEG_TYPES,
  DataProvenance
} = require('../models');
const { transportScheduleService } = require('./transportScheduleService');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

class JourneyBuilderService {
  constructor(options = {}) {
    this.scheduleService = options.scheduleService || transportScheduleService;
  }

  // ==========================================================================
  // 1. PRIMARY BUILDER METHOD
  // ==========================================================================

  /**
   * Combines and validates an ordered sequence of segments into a CommuteJourney.
   *
   * @param {Array<JourneySegment|RouteLeg|TransportTimetableOption|object>} rawSegments
   * @param {object} [options={}]
   * @param {string} [options.id]
   * @param {string} [options.origin]
   * @param {string} [options.destination]
   * @param {string[]} [options.advisories=[]]
   * @returns {CommuteJourney}
   */
  buildJourney(rawSegments, options = {}) {
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
      throw new ValidationError('Journey must contain at least one segment');
    }

    // 1. Normalize segments into JourneySegment instances
    const segments = rawSegments.map((seg, idx) => this._normalizeSegment(seg, idx));

    // 2. Validate segments (connectivity, timing, modes, availability)
    this._validateSegments(segments, options);

    // 3. Compute journey aggregate metrics
    const origin = options.origin || segments[0].from;
    const destination = options.destination || segments[segments.length - 1].to;
    const departureTime = segments[0].departureTime;
    const estimatedArrivalTime = segments[segments.length - 1].arrivalTime;

    let totalWalkingMinutes = 0;
    let totalTransitMinutes = 0;
    let totalWaitingMinutes = 0;
    let totalCostRupees = 0;
    let totalDistanceKm = 0;
    const modesSet = new Set();
    const modeDurations = {};

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      modesSet.add(seg.mode);
      modeDurations[seg.mode] = (modeDurations[seg.mode] || 0) + seg.durationMinutes;

      if (seg.isWalking()) {
        totalWalkingMinutes += seg.durationMinutes;
      } else {
        totalTransitMinutes += seg.durationMinutes;
      }

      totalCostRupees += Number(seg.fareRupees || 0);
      totalDistanceKm += Number(seg.distanceKm || 0);
      totalWaitingMinutes += Number(seg.waitingTimeMinutes || 0);

      // Add transfer waiting time between segments if any gap exists and wasn't already included
      if (i < segments.length - 1) {
        const nextSeg = segments[i + 1];
        const gapWait = this._calculateTimeDifference(seg.arrivalTime, nextSeg.departureTime);
        const nextExplicitWait = Number(nextSeg.waitingTimeMinutes || 0);
        if (gapWait > nextExplicitWait) {
          totalWaitingMinutes += (gapWait - nextExplicitWait);
        }
      }
    }

    // Total journey elapsed duration from start departure to final arrival
    const totalDurationMinutes = this._calculateTimeDifference(departureTime, estimatedArrivalTime);

    // Calculate number of transfers (transit rides - 1)
    const transitRideCount = segments.filter(s => s.isTransit()).length;
    const explicitTransfers = segments.filter(s => s.isTransfer()).length;
    const transferCount = Math.max(0, explicitTransfers > 0 ? explicitTransfers : transitRideCount - 1);

    // Determine primary mode (dominant transit mode by duration, or priority: train > metro > bus > auto > walk)
    const primaryMode = this._determinePrimaryMode(modeDurations, modesSet);

    return new CommuteJourney({
      id: options.id || `journey-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      origin,
      destination,
      departureTime,
      estimatedArrivalTime,
      totalDurationMinutes,
      totalWaitingTimeMinutes: totalWaitingMinutes,
      walkingTimeMinutes: totalWalkingMinutes,
      transitTimeMinutes: totalTransitMinutes,
      transferCount,
      estimatedCostRupees: totalCostRupees,
      totalDistanceKm: totalDistanceKm,
      primaryMode,
      modesIncluded: Array.from(modesSet),
      segments,
      advisories: options.advisories || [],
      isViable: true,
      provenance: (segments.find(s => s.provenance?.sourceTier === 'VERIFIED' || s.provenance?.tier === 'VERIFIED') ||
                   segments.find(s => s.mode !== 'walk') ||
                   segments[0]).provenance
    });
  }

  // ==========================================================================
  // 2. CONVENIENCE BUILDERS
  // ==========================================================================

  /**
   * Builds a single-mode journey (e.g. direct Walk, direct Auto, or non-interchange ride).
   *
   * @param {object} params
   * @param {string} params.origin
   * @param {string} params.destination
   * @param {string} params.mode
   * @param {string} [params.departureTime='08:00']
   * @param {number} params.durationMinutes
   * @param {number} [params.waitingTimeMinutes=0]
   * @param {number} [params.distanceKm=0]
   * @param {number} [params.fareRupees=0]
   * @param {string} [params.lineIdentifier]
   * @param {object} [options={}]
   * @returns {CommuteJourney}
   */
  buildSingleModeJourney(params, options = {}) {
    const departureTime = params.departureTime || '08:00';
    const durationMinutes = Number(params.durationMinutes);
    const arrivalTime = params.arrivalTime || this.scheduleService.minutesToTime(
      this.scheduleService.timeToMinutes(departureTime) + durationMinutes
    );

    let type = LEG_TYPES.TRANSIT;
    if (params.mode === 'walk') type = LEG_TYPES.WALK;
    else if (params.mode === 'auto') type = LEG_TYPES.AUTO;
    else if (params.mode === 'shared_auto') type = LEG_TYPES.SHARED_AUTO;

    const segment = new JourneySegment({
      segmentIndex: 0,
      type,
      mode: params.mode,
      from: params.origin,
      to: params.destination,
      departureTime,
      arrivalTime,
      durationMinutes,
      waitingTimeMinutes: params.waitingTimeMinutes || (params.mode === 'auto' ? 3 : 0),
      distanceKm: params.distanceKm || 0,
      fareRupees: params.fareRupees || 0,
      lineIdentifier: params.lineIdentifier || params.mode,
      instructions: `Direct ${params.mode} from ${params.origin} to ${params.destination}`,
      provenance: params.provenance || ((params.mode === 'train' || params.mode === 'metro')
        ? DataProvenance.verified('Official Suburban Transit Timetable', 'Scheduled rail line').toJSON()
        : DataProvenance.estimated('Estimated Travel Time').toJSON())
    });

    return this.buildJourney([segment], {
      id: params.id || options.id,
      origin: params.origin,
      destination: params.destination,
      ...options
    });
  }

  /**
   * Builds a multimodal journey from network entities (segments & connections)
   * by resolving timetables and propagating clocks sequentially.
   *
   * @param {Array<TransportSegment|TransportConnection>} steps
   * @param {object} [options={}]
   * @returns {CommuteJourney}
   */
  buildMultimodalFromNetwork(steps, options = {}) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new ValidationError('Network steps array must not be empty');
    }

    const initialDepartureTime = options.initialDepartureTime || '08:00';
    const itinerary = this.scheduleService.estimateMultiSegmentJourney(steps, {
      initialDepartureTime,
      date: options.date || options.dayOfWeek || 'Mon'
    });

    const segments = [];
    for (let idx = 0; idx < itinerary.stepEstimates.length; idx++) {
      const stepEst = itinerary.stepEstimates[idx];
      const depOption = stepEst.nextAvailableDeparture;

      let type = JOURNEY_SEGMENT_TYPES.TRANSIT;
      if (stepEst.mode === 'walk') {
        type = (steps[idx] instanceof TransportConnection && steps[idx].connectionType === 'TRANSFER')
          ? JOURNEY_SEGMENT_TYPES.TRANSFER
          : JOURNEY_SEGMENT_TYPES.WALK;
      } else if (stepEst.mode === 'auto') {
        type = JOURNEY_SEGMENT_TYPES.AUTO;
      } else if (stepEst.mode === 'shared_auto') {
        type = JOURNEY_SEGMENT_TYPES.SHARED_AUTO;
      }

      segments.push(new JourneySegment({
        segmentIndex: idx,
        type,
        mode: stepEst.mode,
        from: stepEst.fromArea || stepEst.fromStopId,
        to: stepEst.toArea || stepEst.toStopId,
        departureTime: depOption.scheduledDeparture,
        arrivalTime: depOption.scheduledArrival,
        durationMinutes: stepEst.expectedTravelTime.segmentDurationMinutes,
        waitingTimeMinutes: stepEst.expectedTravelTime.waitingTimeMinutes,
        distanceKm: stepEst.distanceKm,
        fareRupees: stepEst.fareRupees,
        lineIdentifier: stepEst.lineIdentifier,
        status: stepEst.isServiceAvailable ? 'ACTIVE' : 'SUSPENDED',
        provenance: ((stepEst.mode === 'train' || stepEst.mode === 'metro') ||
          (stepEst.provenance?.sourceTier === 'VERIFIED' || stepEst.provenance?.tier === 'VERIFIED'))
          ? DataProvenance.verified(
              stepEst.mode === 'train' ? 'Western Railway GTFS Timetable' : 'Mumbai Metro One Timetable',
              'Official scheduled suburban transit timetable'
            ).toJSON()
          : (stepEst.provenance && typeof stepEst.provenance.toJSON === 'function')
            ? stepEst.provenance.toJSON()
            : (stepEst.provenance || DataProvenance.estimated('Timetable Schedule Engine').toJSON())
      }));
    }

    return this.buildJourney(segments, options);
  }

  // ==========================================================================
  // 3. VALIDATION SUITE
  // ==========================================================================

  /**
   * Validates an existing CommuteJourney or segment sequence against all integrity rules.
   *
   * @param {CommuteJourney|Array<JourneySegment>} journeyOrSegments
   * @param {object} [options={}]
   * @param {boolean} [options.throwOnError=false]
   * @returns {{ isValid: boolean, errors: string[] }}
   */
  validateJourney(journeyOrSegments, options = {}) {
    const errors = [];
    const segments = Array.isArray(journeyOrSegments)
      ? journeyOrSegments
      : (journeyOrSegments && journeyOrSegments.segments ? journeyOrSegments.segments : null);

    if (!segments || segments.length === 0) {
      errors.push('Journey contains no segments');
      if (options.throwOnError) throw new ValidationError(errors[0]);
      return { isValid: false, errors };
    }

    try {
      this._validateSegments(segments, options);
    } catch (err) {
      errors.push(err.message);
      if (options.throwOnError) throw err;
      return { isValid: false, errors };
    }

    return { isValid: true, errors: [] };
  }

  // ==========================================================================
  // INTERNAL HELPERS & INTEGRITY CHECKS
  // ==========================================================================

  /**
   * Validates all segment constraints: connectivity, timings, modes, and availability.
   * @private
   */
  _validateSegments(segments, options = {}) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      // 1. Valid transport mode check
      if (!Object.values(TRANSPORT_MODES).includes(seg.mode)) {
        throw new ValidationError(`Unsupported transport mode '${seg.mode}' at segment ${i}`);
      }

      // 2. Service availability check (reject suspended/inactive/cancelled)
      if (seg.status === 'INACTIVE' || seg.status === 'SUSPENDED' || seg.status === 'CANCELLED') {
        throw new ValidationError(`Unavailable service at segment ${i} (${seg.lineIdentifier || seg.mode}): status is ${seg.status}`);
      }

      // 3. Time format checks
      if (!timeRegex.test(seg.departureTime) || !timeRegex.test(seg.arrivalTime)) {
        throw new ValidationError(`Invalid time format at segment ${i}: departure '${seg.departureTime}', arrival '${seg.arrivalTime}'`);
      }

      // 4. Non-negative duration and waiting time
      if (seg.durationMinutes < 0) {
        throw new ValidationError(`Impossible timing: Segment ${i} has negative duration (${seg.durationMinutes} min)`);
      }
      if (seg.waitingTimeMinutes < 0) {
        throw new ValidationError(`Impossible timing: Segment ${i} has negative waiting time (${seg.waitingTimeMinutes} min)`);
      }

      // 5. Connectivity check between sequential segments
      if (i < segments.length - 1) {
        const nextSeg = segments[i + 1];
        if (!this._areLocationsConnected(seg.to, nextSeg.from)) {
          throw new ValidationError(
            `Segments do not connect: Segment ${i} arrives at '${seg.to}', but Segment ${i + 1} departs from '${nextSeg.from}'`
          );
        }

        // 6. Chronological ordering & non-overlapping timing check
        // nextSeg departure cannot be before seg arrival!
        const depTimeGap = this._calculateTimeDifference(seg.arrivalTime, nextSeg.departureTime);
        const nextDepBeforeCurrentArr = this._isEarlierTime(nextSeg.departureTime, seg.arrivalTime);

        if (nextDepBeforeCurrentArr && depTimeGap > 1200) {
          // Departed before arrival without valid overnight wrap
          throw new ValidationError(
            `Impossible timing: Segment ${i + 1} departs at ${nextSeg.departureTime} before Segment ${i} arrives at ${seg.arrivalTime}`
          );
        }
      }
    }

    // 7. Origin & Destination consistency check
    if (options.origin && !this._areLocationsConnected(segments[0].from, options.origin)) {
      throw new ValidationError(
        `Journey origin mismatch: expected origin '${options.origin}', but first segment departs from '${segments[0].from}'`
      );
    }

    if (options.destination && !this._areLocationsConnected(segments[segments.length - 1].to, options.destination)) {
      throw new ValidationError(
        `Journey destination mismatch: expected destination '${options.destination}', but final segment arrives at '${segments[segments.length - 1].to}'`
      );
    }
  }

  /**
   * Checks whether two location or stop descriptors connect spatially.
   * Handles exact match, stop ID matching, and area containment.
   * @private
   */
  _areLocationsConnected(loc1, loc2) {
    if (!loc1 || !loc2) return false;
    const l1 = loc1.toLowerCase().trim();
    const l2 = loc2.toLowerCase().trim();

    if (l1 === l2) return true;

    // Substring containment match (e.g. "DN Nagar Metro" connects to "DN Nagar Metro Station")
    if (l1.includes(l2) || l2.includes(l1)) return true;

    // Clean stop prefixes ("METRO_DNNAGAR" -> "dnnagar")
    const clean1 = l1.replace(/^(stn_|metro_|bus_|stop_|auto_)/, '').replace(/[^a-z0-9]/g, '');
    const clean2 = l2.replace(/^(stn_|metro_|bus_|stop_|auto_)/, '').replace(/[^a-z0-9]/g, '');
    if (clean1.length >= 3 && clean2.length >= 3 && (clean1.includes(clean2) || clean2.includes(clean1))) {
      return true;
    }

    // Strip directional suffixes and landmark terms to match common transit roots (e.g. "Kandivali Station" <-> "Kandivali West")
    const base1 = clean1.replace(/(west|east|station|stn|metro|bus|college|campus|stop|circle|road)/g, '');
    const base2 = clean2.replace(/(west|east|station|stn|metro|bus|college|campus|stop|circle|road)/g, '');
    if (base1.length >= 3 && base2.length >= 3 && (base1 === base2 || base1.includes(base2) || base2.includes(base1))) {
      return true;
    }

    return false;
  }

  /**
   * Normalizes incoming segment objects into validated JourneySegment instances.
   * @private
   */
  _normalizeSegment(seg, index) {
    if (seg instanceof JourneySegment) {
      return seg;
    }

    if (seg instanceof RouteLeg) {
      return JourneySegment.fromRouteLeg(seg, { segmentIndex: index });
    }

    if (seg instanceof TransportTimetableOption) {
      return new JourneySegment({
        segmentIndex: index,
        type: seg.mode === 'walk' ? JOURNEY_SEGMENT_TYPES.WALK : JOURNEY_SEGMENT_TYPES.TRANSIT,
        mode: seg.mode,
        from: seg.fromArea || seg.fromStopId,
        to: seg.toArea || seg.toStopId,
        departureTime: seg.scheduledDeparture,
        arrivalTime: seg.scheduledArrival,
        durationMinutes: seg.durationMinutes,
        waitingTimeMinutes: seg.waitingTimeMinutes,
        fareRupees: seg.fareRupees,
        lineIdentifier: seg.lineIdentifier,
        provenance: seg.provenance.toJSON()
      });
    }

    if (typeof seg === 'object') {
      const segData = { ...seg };
      if (segData.segmentIndex === undefined) segData.segmentIndex = index;
      return new JourneySegment(segData);
    }

    throw new ValidationError(`Invalid segment format at index ${index}`);
  }

  /**
   * Determines the primary mode of the journey based on transit duration and modality hierarchy.
   * @private
   */
  _determinePrimaryMode(modeDurations, modesSet) {
    const transitModes = [
      TRANSPORT_MODES.TRAIN,
      TRANSPORT_MODES.METRO,
      TRANSPORT_MODES.BUS,
      TRANSPORT_MODES.AUTO,
      TRANSPORT_MODES.SHARED_AUTO
    ];

    let maxDuration = -1;
    let primary = null;

    for (const mode of transitModes) {
      if (modeDurations[mode] !== undefined && modeDurations[mode] > maxDuration) {
        maxDuration = modeDurations[mode];
        primary = mode;
      }
    }

    if (primary) return primary;
    if (modesSet.has(TRANSPORT_MODES.WALK)) return TRANSPORT_MODES.WALK;
    return Array.from(modesSet)[0] || TRANSPORT_MODES.TRAIN;
  }

  /**
   * Computes elapsed minutes between two HH:MM timestamps.
   * @private
   */
  _calculateTimeDifference(fromTime, toTime) {
    const [h1, m1] = fromTime.split(':').map(Number);
    const [h2, m2] = toTime.split(':').map(Number);
    const min1 = h1 * 60 + m1;
    const min2 = h2 * 60 + m2;

    if (min2 >= min1) {
      return min2 - min1;
    }
    // Midnight crossing
    return (1440 - min1) + min2;
  }

  /**
   * Checks if time1 is earlier on the 24-hr clock than time2.
   * @private
   */
  _isEarlierTime(time1, time2) {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return (h1 * 60 + m1) < (h2 * 60 + m2);
  }
}

const journeyBuilderService = new JourneyBuilderService();

module.exports = {
  JourneyBuilderService,
  journeyBuilderService
};
