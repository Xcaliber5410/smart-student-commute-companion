/**
 * TransportAvailabilityService
 *
 * Provides a normalized transport availability and service-status layer
 * for student commute decision making.
 *
 * Core Capabilities:
 * - Determines whether a transport service or segment is usable in the commute context.
 * - Quantifies additional delays, added wait times, and travel uncertainty for degraded services.
 * - Identifies unavailable autos, missed buses, reduced headways, and service suspensions.
 * - Preserves explicit 4-tier data provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 * - Enforces effective/expiry timestamps, discarding stale service reports.
 *
 * Supported Statuses:
 * - AVAILABLE: Full operations, standard headway, 0 added delay
 * - DELAYED: Operating with en-route or signaling delays (+8 min)
 * - LIMITED: Reduced frequency, crowding, or auto shortages (+12-15 min wait)
 * - UNAVAILABLE: No vehicles currently operating / empty stands (unusable)
 * - SUSPENDED: Officially halted or cancelled by agency (unusable)
 */

const {
  SERVICE_AVAILABILITY_STATUSES,
  isStatusUsable,
  normalizeAvailabilityStatus,
  ServiceStatusRecord,
  SegmentAvailabilityImpact,
  JourneyAvailabilityImpact
} = require('../models/TransportAvailability');
const {
  DataProvenance,
  PROVENANCE_TIERS,
  TRANSPORT_MODES
} = require('../models/CommuteContracts');

/**
 * Adds minutes to an HH:MM time string with 24-hour clock wrapping.
 * @param {string} timeStr - 'HH:MM'
 * @param {number} minutesToAdd
 * @returns {string} - 'HH:MM'
 */
function addMinutesToHHMM(timeStr, minutesToAdd) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return '08:00';
  }
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + Math.round(minutesToAdd)) % 1440;
  const wrapped = total < 0 ? total + 1440 : total;
  const newH = Math.floor(wrapped / 60).toString().padStart(2, '0');
  const newM = (wrapped % 60).toString().padStart(2, '0');
  return `${newH}:${newM}`;
}

class TransportAvailabilityService {
  /**
   * @param {object} [options={}]
   * @param {ServiceStatusRecord[]} [options.inMemoryRecords]
   */
  constructor(options = {}) {
    this.inMemoryRecords = Array.isArray(options.inMemoryRecords) ? [...options.inMemoryRecords] : [];
    this._prototypeRecords = null;
  }

  /**
   * Seeds realistic prototype status records across Mumbai transit networks.
   *
   * @param {number} [currentTime=Date.now()]
   * @returns {ServiceStatusRecord[]}
   */
  seedPrototypeStatusRecords(currentTime = Date.now()) {
    const oneHourAhead = currentTime + 60 * 60 * 1000;
    const twoHoursAhead = currentTime + 2 * 60 * 60 * 1000;

    return [
      // 1. VERIFIED: Suburban Local Train Delay
      new ServiceStatusRecord({
        id: 'avail-wr-slow-delayed',
        serviceId: 'WR-SLOW',
        lineIdentifier: 'WR-SLOW',
        mode: TRANSPORT_MODES.TRAIN,
        area: 'Western Railway Slow Corridor',
        status: SERVICE_AVAILABILITY_STATUSES.DELAYED,
        expectedDelayMinutes: 8,
        addedWaitMinutes: 4,
        uncertaintyLevel: 'MODERATE',
        reason: 'Signal inspection between Bandra and Mahim; trains running 8 mins behind schedule',
        effectiveTime: currentTime - 20 * 60 * 1000,
        expiryTime: twoHoursAhead,
        confidence: 'HIGH',
        provenance: DataProvenance.verified(
          'Western Railway Divisional Operations',
          'Official signal delay notification on slow corridor'
        ).toJSON(),
        createdAt: currentTime - 20 * 60 * 1000
      }),

      // 2. USER_REPORTED: Auto Shortage / High Demand Queue
      new ServiceStatusRecord({
        id: 'avail-andheri-auto-shortage',
        serviceId: null,
        lineIdentifier: null,
        mode: TRANSPORT_MODES.AUTO,
        area: 'Andheri West',
        status: SERVICE_AVAILABILITY_STATUSES.LIMITED,
        expectedDelayMinutes: 0,
        addedWaitMinutes: 14,
        uncertaintyLevel: 'HIGH',
        reason: 'Severe auto-rickshaw shortage and long queues outside Andheri West Station',
        effectiveTime: currentTime - 10 * 60 * 1000,
        expiryTime: oneHourAhead,
        confidence: 'MEDIUM',
        provenance: DataProvenance.userReported(
          'Student Commuter Crowd Feed',
          'Multiple commuters report 15+ min wait at station auto stand'
        ).toJSON(),
        createdAt: currentTime - 10 * 60 * 1000
      }),

      // 3. ESTIMATED: BEST Feeder Bus Missed Trip / Extended Headway
      new ServiceStatusRecord({
        id: 'avail-best-201-missed-trip',
        serviceId: 'BEST-201',
        lineIdentifier: 'BEST-201',
        mode: TRANSPORT_MODES.BUS,
        area: 'Vile Parle - Juhu',
        status: SERVICE_AVAILABILITY_STATUSES.LIMITED,
        expectedDelayMinutes: 5,
        addedWaitMinutes: 15,
        uncertaintyLevel: 'HIGH',
        reason: 'Missed scheduled departure; next BEST 201 arrival interval extended from 8 to 22 mins',
        effectiveTime: currentTime - 5 * 60 * 1000,
        expiryTime: oneHourAhead,
        confidence: 'HIGH',
        provenance: DataProvenance.estimated(
          'BEST Real-time Fleet Telemetry Engine',
          'GPS bus telemetry indicates headway gap on route 201'
        ).toJSON(),
        createdAt: currentTime - 5 * 60 * 1000
      }),

      // 4. USER_REPORTED: Shared Auto Stand Empty / Unavailable
      new ServiceStatusRecord({
        id: 'avail-vileparle-sharedauto-empty',
        serviceId: 'AUTO-SHUTTLE-DJS',
        lineIdentifier: 'DJS-SHUTTLE',
        mode: TRANSPORT_MODES.SHARED_AUTO,
        area: 'Vile Parle West',
        status: SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE,
        expectedDelayMinutes: 0,
        addedWaitMinutes: 0,
        uncertaintyLevel: 'SEVERE',
        reason: 'Station shared auto stand completely empty; drivers refusing trips toward SV Road',
        effectiveTime: currentTime - 15 * 60 * 1000,
        expiryTime: oneHourAhead,
        confidence: 'MEDIUM',
        provenance: DataProvenance.userReported(
          'Student Commuter Crowd Feed',
          'Zero shared autos available outside Vile Parle West platform exit'
        ).toJSON(),
        createdAt: currentTime - 15 * 60 * 1000
      }),

      // 5. VERIFIED: Metro Line Power Suspension
      new ServiceStatusRecord({
        id: 'avail-metro-line1-suspended',
        serviceId: 'Line-1',
        lineIdentifier: 'Line-1',
        mode: TRANSPORT_MODES.METRO,
        area: 'Versova - DN Nagar',
        status: SERVICE_AVAILABILITY_STATUSES.SUSPENDED,
        expectedDelayMinutes: 0,
        addedWaitMinutes: 0,
        uncertaintyLevel: 'SEVERE',
        reason: 'Power traction rail maintenance; Metro Line 1 service temporarily suspended between Versova and DN Nagar',
        effectiveTime: currentTime,
        expiryTime: twoHoursAhead,
        confidence: 'HIGH',
        provenance: DataProvenance.verified(
          'MMOPL Metro Operations Control',
          'Emergency traction power block announcement'
        ).toJSON(),
        createdAt: currentTime
      }),

      // 6. SYNTHETIC: Baseline Available Operations
      new ServiceStatusRecord({
        id: 'avail-metro-line1-normal',
        serviceId: 'Line-1-Main',
        lineIdentifier: 'Line-1',
        mode: TRANSPORT_MODES.METRO,
        area: 'Andheri - Ghatkopar',
        status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE,
        expectedDelayMinutes: 0,
        addedWaitMinutes: 0,
        uncertaintyLevel: 'LOW',
        reason: 'Normal operations with 4-minute standard peak headways',
        effectiveTime: currentTime,
        expiryTime: twoHoursAhead,
        confidence: 'HIGH',
        provenance: DataProvenance.synthetic(
          'Transport Availability Simulation Model'
        ).toJSON(),
        createdAt: currentTime
      })
    ];
  }

  /**
   * Retrieves active, non-expired status records.
   *
   * @param {object} [options={}]
   * @param {number} [options.currentTime=Date.now()]
   * @param {ServiceStatusRecord[]} [options.records]
   * @returns {ServiceStatusRecord[]}
   */
  getActiveRecords(options = {}) {
    const currentTime = options.currentTime || Date.now();
    const recordsToInspect = [
      ...(Array.isArray(options.records) ? options.records : []),
      ...this.inMemoryRecords,
      ...(this._prototypeRecords || [])
    ];

    return recordsToInspect
      .map(r => (r instanceof ServiceStatusRecord ? r : new ServiceStatusRecord(r)))
      .filter(r => r.isActive(currentTime));
  }

  /**
   * Evaluates whether a transport service or segment is usable for the requested context.
   *
   * @param {object} segment Journey segment or transit entity
   * @param {object} [options={}]
   * @returns {{ usable: boolean, status: string, reason?: string, record?: ServiceStatusRecord }}
   */
  isSegmentUsable(segment, options = {}) {
    if (!segment) return { usable: true, status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE };

    // Pedestrian walking is always usable
    if (segment.mode === TRANSPORT_MODES.WALK || segment.type === 'walk') {
      return { usable: true, status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE };
    }

    const activeRecords = this.getActiveRecords(options);
    const matchingRecords = activeRecords.filter(r => r.matchesSegment(segment));

    // If matching records indicate UNAVAILABLE or SUSPENDED, segment is NOT usable
    const blockingRecord = matchingRecords.find(r => !r.isUsable());
    if (blockingRecord) {
      return {
        usable: false,
        status: blockingRecord.status,
        reason: blockingRecord.reason || `Transport service is ${blockingRecord.status.toLowerCase()}`,
        record: blockingRecord
      };
    }

    // If degraded (DELAYED, LIMITED)
    const degradedRecord = matchingRecords.find(r => r.status === SERVICE_AVAILABILITY_STATUSES.LIMITED || r.status === SERVICE_AVAILABILITY_STATUSES.DELAYED);
    if (degradedRecord) {
      return {
        usable: true,
        status: degradedRecord.status,
        reason: degradedRecord.reason,
        record: degradedRecord
      };
    }

    return {
      usable: true,
      status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE
    };
  }

  /**
   * Evaluates availability impacts (delay, waiting time, uncertainty) on an individual segment.
   *
   * @param {object} segment Journey segment
   * @param {object} [options={}]
   * @returns {SegmentAvailabilityImpact}
   */
  evaluateSegmentAvailability(segment, options = {}) {
    const currentTime = options.currentTime || Date.now();
    const mode = segment.mode || TRANSPORT_MODES.WALK;
    const from = segment.from || '';
    const to = segment.to || '';
    const segmentIndex = segment.segmentIndex !== undefined ? segment.segmentIndex : 0;

    // 1. Pedestrian walking is immune to transit availability shortages
    if (mode === TRANSPORT_MODES.WALK || segment.type === 'walk') {
      return new SegmentAvailabilityImpact({
        segmentIndex,
        mode,
        from,
        to,
        status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE,
        isUsable: true,
        addedTravelTimeMinutes: 0,
        addedWaitMinutes: 0,
        totalDelayMinutes: 0,
        uncertaintyLevel: 'LOW',
        reason: 'Walking path is always available',
        advisory: 'Standard pedestrian walk leg',
        recordId: null,
        provenance: DataProvenance.verified('Transport Availability Engine', 'Pedestrian path self-operated').toJSON()
      });
    }

    // 2. Match active records
    const activeRecords = this.getActiveRecords(options);
    const matchingRecords = activeRecords.filter(r => r.matchesSegment(segment));

    if (matchingRecords.length === 0) {
      return new SegmentAvailabilityImpact({
        segmentIndex,
        mode,
        from,
        to,
        status: SERVICE_AVAILABILITY_STATUSES.AVAILABLE,
        isUsable: true,
        addedTravelTimeMinutes: 0,
        addedWaitMinutes: 0,
        totalDelayMinutes: 0,
        uncertaintyLevel: 'LOW',
        reason: 'Normal service operating schedule',
        advisory: 'Standard service availability',
        recordId: null,
        provenance: DataProvenance.estimated('Transport Availability Engine', 'Standard operating baseline').toJSON()
      });
    }

    // 3. Pick dominant record (prioritize SUSPENDED -> UNAVAILABLE -> LIMITED -> DELAYED)
    const priorityOrder = [
      SERVICE_AVAILABILITY_STATUSES.SUSPENDED,
      SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE,
      SERVICE_AVAILABILITY_STATUSES.LIMITED,
      SERVICE_AVAILABILITY_STATUSES.DELAYED,
      SERVICE_AVAILABILITY_STATUSES.AVAILABLE
    ];

    matchingRecords.sort((a, b) => priorityOrder.indexOf(a.status) - priorityOrder.indexOf(b.status));
    const record = matchingRecords[0];

    const isUsable = record.isUsable();
    const addedTravelTimeMinutes = isUsable ? record.expectedDelayMinutes : 0;
    const addedWaitMinutes = isUsable ? record.addedWaitMinutes : 0;
    const totalDelayMinutes = addedTravelTimeMinutes + addedWaitMinutes;

    let advisory = '';
    if (!isUsable) {
      advisory = `${mode.toUpperCase()} service is ${record.status.toLowerCase()}: ${record.reason}`;
    } else if (record.status === SERVICE_AVAILABILITY_STATUSES.LIMITED) {
      advisory = `Limited ${mode.toUpperCase()} availability: +${addedWaitMinutes} min expected wait due to ${record.reason}`;
    } else if (record.status === SERVICE_AVAILABILITY_STATUSES.DELAYED) {
      advisory = `${mode.toUpperCase()} service running with +${addedTravelTimeMinutes} min delay: ${record.reason}`;
    } else {
      advisory = 'Standard service availability';
    }

    return new SegmentAvailabilityImpact({
      segmentIndex,
      mode,
      from,
      to,
      status: record.status,
      isUsable,
      addedTravelTimeMinutes,
      addedWaitMinutes,
      totalDelayMinutes,
      uncertaintyLevel: record.uncertaintyLevel,
      reason: record.reason,
      advisory,
      recordId: record.id,
      provenance: record.provenance.toJSON()
    });
  }

  /**
   * Evaluates overall transport availability and service status across all segments of a candidate journey.
   *
   * @param {CommuteJourney|object} journey
   * @param {ServiceStatusRecord[]|null} [records=null]
   * @param {object} [options={}]
   * @returns {JourneyAvailabilityImpact}
   */
  evaluateJourneyAvailability(journey, records = null, options = {}) {
    if (!journey || !Array.isArray(journey.segments)) {
      throw new Error('Valid journey with segments array is required for availability evaluation');
    }

    const currentTime = options.currentTime || Date.now();
    const evalOptions = {
      ...options,
      currentTime,
      records: Array.isArray(records) ? records : (options.records || null)
    };

    let isJourneyUsable = true;
    let dominantStatus = SERVICE_AVAILABILITY_STATUSES.AVAILABLE;
    let unusableReason = null;
    let totalAddedTravelTimeMinutes = 0;
    let totalAddedWaitMinutes = 0;
    const affectedSegmentIndices = [];
    const segmentImpacts = [];
    const advisories = [];
    const dataTiers = new Set();

    journey.segments.forEach((seg, idx) => {
      const segImpact = this.evaluateSegmentAvailability({ ...seg, segmentIndex: idx }, evalOptions);
      segmentImpacts.push(segImpact);

      if (segImpact.provenance?.sourceTier) {
        dataTiers.add(segImpact.provenance.sourceTier);
      }

      if (!segImpact.isUsable) {
        isJourneyUsable = false;
        affectedSegmentIndices.push(idx);

        if (!unusableReason) {
          unusableReason = segImpact.reason || `Segment ${idx + 1} (${seg.mode}) is currently ${segImpact.status.toLowerCase()}`;
        }

        if (dominantStatus !== SERVICE_AVAILABILITY_STATUSES.SUSPENDED) {
          dominantStatus = segImpact.status;
        }

        if (segImpact.advisory) {
          advisories.push(segImpact.advisory);
        }
      } else if (segImpact.status !== SERVICE_AVAILABILITY_STATUSES.AVAILABLE) {
        affectedSegmentIndices.push(idx);
        totalAddedTravelTimeMinutes += segImpact.addedTravelTimeMinutes;
        totalAddedWaitMinutes += segImpact.addedWaitMinutes;

        if (dominantStatus === SERVICE_AVAILABILITY_STATUSES.AVAILABLE) {
          dominantStatus = segImpact.status;
        } else if (dominantStatus === SERVICE_AVAILABILITY_STATUSES.DELAYED && segImpact.status === SERVICE_AVAILABILITY_STATUSES.LIMITED) {
          dominantStatus = SERVICE_AVAILABILITY_STATUSES.LIMITED;
        }

        if (segImpact.advisory) {
          advisories.push(segImpact.advisory);
        }
      }
    });

    if (dataTiers.size === 0) {
      dataTiers.add(PROVENANCE_TIERS.ESTIMATED);
    }

    // Determine highest uncertainty level
    const uncertaintyRank = { LOW: 1, MODERATE: 2, HIGH: 3, SEVERE: 4 };
    let highestUncertainty = 'LOW';
    segmentImpacts.forEach(s => {
      if ((uncertaintyRank[s.uncertaintyLevel] || 1) > (uncertaintyRank[highestUncertainty] || 1)) {
        highestUncertainty = s.uncertaintyLevel;
      }
    });

    const totalDelayMinutes = totalAddedTravelTimeMinutes + totalAddedWaitMinutes;
    const originalDurationMinutes = Number(journey.totalDurationMinutes || journey.durationMinutes || 0);

    return new JourneyAvailabilityImpact({
      journeyId: journey.id,
      isUsable: isJourneyUsable,
      status: dominantStatus,
      totalAddedTravelTimeMinutes,
      totalAddedWaitMinutes,
      totalDelayMinutes,
      originalDurationMinutes,
      updatedDurationMinutes: originalDurationMinutes + totalDelayMinutes,
      uncertaintyLevel: highestUncertainty,
      unusableReason,
      affectedSegmentsCount: affectedSegmentIndices.length,
      affectedSegmentIndices,
      segmentImpacts,
      advisories,
      dataTiers: Array.from(dataTiers),
      provenance: DataProvenance.estimated(
        'TransportAvailabilityService',
        `Journey availability evaluated across ${journey.segments.length} segments`
      ).toJSON(),
      evaluatedAt: currentTime
    });
  }

  /**
   * Applies evaluated availability impact to update a candidate journey's duration, arrival, and viability.
   *
   * @param {CommuteJourney|object} journey
   * @param {JourneyAvailabilityImpact} availabilityImpact
   * @returns {CommuteJourney|object}
   */
  applyAvailabilityToJourney(journey, availabilityImpact) {
    if (!journey || !availabilityImpact) return journey;

    journey.availabilityImpact = typeof availabilityImpact.toJSON === 'function'
      ? availabilityImpact.toJSON()
      : availabilityImpact;

    if (availabilityImpact.totalDelayMinutes > 0) {
      if (journey.totalDurationMinutes !== undefined) {
        journey.totalDurationMinutes += availabilityImpact.totalDelayMinutes;
      }
      if (journey.durationMinutes !== undefined) {
        journey.durationMinutes += availabilityImpact.totalDelayMinutes;
      }

      if (journey.totalWaitingTimeMinutes !== undefined) {
        journey.totalWaitingTimeMinutes += availabilityImpact.totalAddedWaitMinutes;
      }

      const originalArrival = journey.estimatedArrivalTime || journey.arrivalTime || '08:30';
      const updatedArrival = addMinutesToHHMM(originalArrival, availabilityImpact.totalDelayMinutes);

      if (journey.estimatedArrivalTime !== undefined) {
        journey.estimatedArrivalTime = updatedArrival;
      }
      if (journey.arrivalTime !== undefined) {
        journey.arrivalTime = updatedArrival;
      }
    }

    if (!availabilityImpact.isUsable) {
      journey.isViable = false;
      journey.impracticalReason = availabilityImpact.unusableReason;
    }

    return journey;
  }
}

const transportAvailabilityService = new TransportAvailabilityService();

module.exports = {
  TransportAvailabilityService,
  transportAvailabilityService,
  SERVICE_AVAILABILITY_STATUSES,
  addMinutesToHHMM
};
