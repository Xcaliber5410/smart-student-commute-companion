/**
 * TransportAvailability Domain Model & Service Status Contracts
 *
 * Formal domain entities representing real-time transport service availability,
 * vehicle shortages, missed headways, delayed lines, and service suspensions
 * with strict 4-tier provenance (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC).
 *
 * Supported Statuses:
 * - AVAILABLE: Full operations, standard headways, zero added delay
 * - DELAYED: Running with noticeable route or signaling delay (e.g. +8 min)
 * - LIMITED: Reduced frequency, crowding, or auto shortages (e.g. +12 min wait)
 * - UNAVAILABLE: No vehicles currently operating / empty stand (unusable segment)
 * - SUSPENDED: Officially halted or cancelled by agency (unusable segment)
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  transportModeEnum,
  TRANSPORT_MODES
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

/**
 * Standard transport availability and service status keys.
 */
const SERVICE_AVAILABILITY_STATUSES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  DELAYED: 'DELAYED',
  LIMITED: 'LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  SUSPENDED: 'SUSPENDED'
});

const serviceAvailabilityStatusEnum = z.enum([
  'AVAILABLE',
  'DELAYED',
  'LIMITED',
  'UNAVAILABLE',
  'SUSPENDED'
]);

/**
 * Checks whether a given status allows transport usage.
 * @param {string} status
 * @returns {boolean}
 */
function isStatusUsable(status) {
  if (!status) return true;
  const s = String(status).toUpperCase();
  return s === SERVICE_AVAILABILITY_STATUSES.AVAILABLE ||
         s === SERVICE_AVAILABILITY_STATUSES.DELAYED ||
         s === SERVICE_AVAILABILITY_STATUSES.LIMITED;
}

/**
 * Normalizes input status string into standard status key.
 * @param {string} raw
 * @returns {string}
 */
function normalizeAvailabilityStatus(raw) {
  if (!raw || typeof raw !== 'string') return SERVICE_AVAILABILITY_STATUSES.AVAILABLE;
  const upper = raw.trim().toUpperCase();
  if (['AVAILABLE', 'OPERATIONAL', 'NORMAL', 'ACTIVE'].includes(upper)) {
    return SERVICE_AVAILABILITY_STATUSES.AVAILABLE;
  }
  if (['DELAYED', 'LATE', 'SLOW'].includes(upper)) {
    return SERVICE_AVAILABILITY_STATUSES.DELAYED;
  }
  if (['LIMITED', 'LIMITED_SERVICE', 'CROWDED', 'REDUCED', 'SHORTAGE'].includes(upper)) {
    return SERVICE_AVAILABILITY_STATUSES.LIMITED;
  }
  if (['UNAVAILABLE', 'EMPTY', 'REFUSAL', 'NO_SERVICE'].includes(upper)) {
    return SERVICE_AVAILABILITY_STATUSES.UNAVAILABLE;
  }
  if (['SUSPENDED', 'CANCELLED', 'BLOCKED', 'HALTED', 'STRIKE'].includes(upper)) {
    return SERVICE_AVAILABILITY_STATUSES.SUSPENDED;
  }
  return SERVICE_AVAILABILITY_STATUSES.AVAILABLE;
}

/**
 * Zod schema for ServiceStatusRecord.
 */
const serviceStatusRecordSchema = z.object({
  id: z.string().min(1, 'Status record ID is required'),
  serviceId: z.string().nullable().optional().default(null),
  lineIdentifier: z.string().nullable().optional().default(null),
  mode: transportModeEnum.optional(),
  area: z.string().max(100).optional().default(''),
  status: serviceAvailabilityStatusEnum.default(SERVICE_AVAILABILITY_STATUSES.AVAILABLE),
  expectedDelayMinutes: z.coerce.number().min(0).default(0),
  addedWaitMinutes: z.coerce.number().min(0).default(0),
  uncertaintyLevel: z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']).default('LOW'),
  reason: z.string().max(300).default(''),
  effectiveTime: z.coerce.number().int().positive().default(() => Date.now()),
  expiryTime: z.coerce.number().int().positive().default(() => Date.now() + 60 * 60 * 1000),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('HIGH'),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Transport Availability Engine').toJSON()),
  createdAt: z.coerce.number().int().positive().default(() => Date.now())
});

/**
 * Real-time service status record affecting a service, line, mode, or area.
 */
class ServiceStatusRecord {
  constructor(data) {
    try {
      const validated = serviceStatusRecordSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid service status record: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method for creating a normalized ServiceStatusRecord.
   * @param {object} input
   * @returns {ServiceStatusRecord}
   */
  static create(input = {}) {
    const now = Date.now();
    const durationMs = (input.durationMinutes || 60) * 60 * 1000;
    const effectiveTime = input.effectiveTime !== undefined ? Number(input.effectiveTime) : now;
    const expiryTime = input.expiryTime !== undefined ? Number(input.expiryTime) : (effectiveTime + durationMs);
    const id = input.id || `avail-${now}-${Math.random().toString(36).substring(2, 7)}`;
    const status = normalizeAvailabilityStatus(input.status);

    return new ServiceStatusRecord({
      ...input,
      id,
      status,
      effectiveTime,
      expiryTime,
      createdAt: input.createdAt || now
    });
  }

  /**
   * Checks whether this status record is active at the given time.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isActive(currentTime = Date.now()) {
    return this.effectiveTime <= currentTime && currentTime <= this.expiryTime;
  }

  /**
   * Checks whether this status record has expired.
   * @param {number} [currentTime=Date.now()]
   * @returns {boolean}
   */
  isExpired(currentTime = Date.now()) {
    return currentTime > this.expiryTime;
  }

  /**
   * Checks whether the transport service/entity is currently usable.
   * @returns {boolean}
   */
  isUsable() {
    return isStatusUsable(this.status);
  }

  /**
   * Checks if this record matches a candidate journey segment.
   * @param {object} segment
   * @returns {boolean}
   */
  matchesSegment(segment) {
    if (!segment) return false;

    // 1. Exact service ID match (e.g. 'BEST-201', 'WR-SLOW')
    if (this.serviceId && segment.serviceId) {
      if (String(this.serviceId).toLowerCase() === String(segment.serviceId).toLowerCase()) {
        return true;
      }
    }

    // 2. Line identifier match (e.g. 'Line-1', '201')
    if (this.lineIdentifier && (segment.lineIdentifier || segment.serviceId)) {
      const segLine = String(segment.lineIdentifier || segment.serviceId || '').toLowerCase();
      const thisLine = String(this.lineIdentifier).toLowerCase();
      if (segLine.includes(thisLine) || thisLine.includes(segLine)) {
        return true;
      }
    }

    // 3. Mode match with Area / Stop corridor match
    if (this.mode && segment.mode && String(this.mode).toLowerCase() === String(segment.mode).toLowerCase()) {
      if (!this.area) return true; // generic mode impact across region

      const cleanArea = String(this.area).toLowerCase().trim();
      const from = String(segment.from || '').toLowerCase();
      const to = String(segment.to || '').toLowerCase();

      if (from.includes(cleanArea) || cleanArea.includes(from) ||
          to.includes(cleanArea) || cleanArea.includes(to)) {
        return true;
      }

      // Token overlap check (e.g. 'Andheri' in 'Andheri West' and 'Andheri Station West')
      const areaTokens = cleanArea.split(/[^a-z0-9]+/).filter(t => t.length > 3 && !['station', 'road'].includes(t));
      if (areaTokens.length > 0 && areaTokens.some(t => from.includes(t) || to.includes(t))) {
        return true;
      }
    }

    return false;
  }

  toJSON() {
    return {
      id: this.id,
      serviceId: this.serviceId,
      lineIdentifier: this.lineIdentifier,
      mode: this.mode,
      area: this.area,
      status: this.status,
      expectedDelayMinutes: this.expectedDelayMinutes,
      addedWaitMinutes: this.addedWaitMinutes,
      uncertaintyLevel: this.uncertaintyLevel,
      reason: this.reason,
      effectiveTime: this.effectiveTime,
      expiryTime: this.expiryTime,
      confidence: this.confidence,
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      createdAt: this.createdAt
    };
  }
}

/**
 * Value object representing the impact of transport availability on a single journey segment.
 */
class SegmentAvailabilityImpact {
  constructor(data = {}) {
    this.segmentIndex = Number(data.segmentIndex || 0);
    this.mode = data.mode || TRANSPORT_MODES.WALK;
    this.from = data.from || '';
    this.to = data.to || '';
    this.status = normalizeAvailabilityStatus(data.status);
    this.isUsable = data.isUsable !== undefined ? Boolean(data.isUsable) : isStatusUsable(this.status);
    this.addedTravelTimeMinutes = Number(data.addedTravelTimeMinutes || 0);
    this.addedWaitMinutes = Number(data.addedWaitMinutes || 0);
    this.totalDelayMinutes = Number(data.totalDelayMinutes || (this.addedTravelTimeMinutes + this.addedWaitMinutes));
    this.uncertaintyLevel = data.uncertaintyLevel || 'LOW';
    this.reason = data.reason || '';
    this.advisory = data.advisory || '';
    this.recordId = data.recordId || null;
    this.provenance = data.provenance instanceof DataProvenance
      ? data.provenance
      : new DataProvenance(data.provenance || DataProvenance.estimated('Segment Availability Engine').toJSON());
  }

  toJSON() {
    return {
      segmentIndex: this.segmentIndex,
      mode: this.mode,
      from: this.from,
      to: this.to,
      status: this.status,
      isUsable: this.isUsable,
      addedTravelTimeMinutes: this.addedTravelTimeMinutes,
      addedWaitMinutes: this.addedWaitMinutes,
      totalDelayMinutes: this.totalDelayMinutes,
      uncertaintyLevel: this.uncertaintyLevel,
      reason: this.reason,
      advisory: this.advisory,
      recordId: this.recordId,
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance
    };
  }
}

/**
 * Value object representing the overall transport availability impact on a candidate CommuteJourney.
 */
class JourneyAvailabilityImpact {
  constructor(data = {}) {
    this.journeyId = data.journeyId || null;
    this.isUsable = data.isUsable !== undefined ? Boolean(data.isUsable) : true;
    this.status = normalizeAvailabilityStatus(data.status);
    this.totalAddedTravelTimeMinutes = Number(data.totalAddedTravelTimeMinutes || 0);
    this.totalAddedWaitMinutes = Number(data.totalAddedWaitMinutes || 0);
    this.totalDelayMinutes = Number(data.totalDelayMinutes || (this.totalAddedTravelTimeMinutes + this.totalAddedWaitMinutes));
    this.originalDurationMinutes = Number(data.originalDurationMinutes || 0);
    this.updatedDurationMinutes = Number(data.updatedDurationMinutes || (this.originalDurationMinutes + this.totalDelayMinutes));
    this.uncertaintyLevel = data.uncertaintyLevel || 'LOW';
    this.unusableReason = data.unusableReason || null;
    this.affectedSegmentsCount = Number(data.affectedSegmentsCount || 0);
    this.affectedSegmentIndices = Array.isArray(data.affectedSegmentIndices) ? [...data.affectedSegmentIndices] : [];
    this.segmentImpacts = Array.isArray(data.segmentImpacts)
      ? data.segmentImpacts.map(s => (s instanceof SegmentAvailabilityImpact ? s : new SegmentAvailabilityImpact(s)))
      : [];
    this.advisories = Array.isArray(data.advisories) ? [...data.advisories] : [];
    this.dataTiers = Array.isArray(data.dataTiers) ? [...data.dataTiers] : [];
    this.provenance = data.provenance instanceof DataProvenance
      ? data.provenance
      : new DataProvenance(data.provenance || DataProvenance.estimated('Journey Availability Engine').toJSON());
    this.evaluatedAt = data.evaluatedAt || Date.now();
  }

  isAvailable() {
    return this.isUsable && this.totalDelayMinutes === 0 && this.status === SERVICE_AVAILABILITY_STATUSES.AVAILABLE;
  }

  hasDegradedService() {
    return this.isUsable && (this.status === SERVICE_AVAILABILITY_STATUSES.DELAYED ||
                             this.status === SERVICE_AVAILABILITY_STATUSES.LIMITED ||
                             this.totalDelayMinutes > 0);
  }

  get dominantStatus() {
    return this.status;
  }

  isBlocked() {
    return !this.isUsable;
  }

  hasVerifiedData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.VERIFIED);
  }

  hasUserReportedData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.USER_REPORTED);
  }

  hasEstimatedData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.ESTIMATED);
  }

  hasSyntheticData() {
    return this.dataTiers.includes(PROVENANCE_TIERS.SYNTHETIC);
  }

  toJSON() {
    return {
      journeyId: this.journeyId,
      isUsable: this.isUsable,
      status: this.status,
      totalAddedTravelTimeMinutes: this.totalAddedTravelTimeMinutes,
      totalAddedWaitMinutes: this.totalAddedWaitMinutes,
      totalDelayMinutes: this.totalDelayMinutes,
      originalDurationMinutes: this.originalDurationMinutes,
      updatedDurationMinutes: this.updatedDurationMinutes,
      uncertaintyLevel: this.uncertaintyLevel,
      unusableReason: this.unusableReason,
      affectedSegmentsCount: this.affectedSegmentsCount,
      affectedSegmentIndices: [...this.affectedSegmentIndices],
      segmentImpacts: this.segmentImpacts.map(s => s.toJSON()),
      advisories: [...this.advisories],
      dataTiers: [...this.dataTiers],
      provenance: typeof this.provenance.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

module.exports = {
  SERVICE_AVAILABILITY_STATUSES,
  serviceAvailabilityStatusEnum,
  isStatusUsable,
  normalizeAvailabilityStatus,
  serviceStatusRecordSchema,
  ServiceStatusRecord,
  SegmentAvailabilityImpact,
  JourneyAvailabilityImpact
};
