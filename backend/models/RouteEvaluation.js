/**
 * RouteEvaluation Domain Model
 *
 * Represents the comprehensive evaluation of a candidate commute journey
 * after contextual disruption, traffic, weather, and availability analysis.
 *
 * Evaluates:
 * - total travel time (baseline & context updated)
 * - additional disruption delay
 * - waiting time
 * - walking time
 * - number of transfers
 * - estimated cost
 * - affected segments
 * - unavailable segments
 * - reliability / uncertainty
 * - feasibility & operational status
 * - 4-tier data provenance
 * - transparent reason codes explaining route weaknesses
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  transportModeEnum
} = require('./CommuteContracts');
const { UNIFIED_REASON_CODES, UNIFIED_FEASIBILITY_STATUSES } = require('./UnifiedJourneyImpact');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Standard route weakness reason codes.
 */
const ROUTE_WEAKNESS_CODES = Object.freeze({
  DISRUPTION_DELAY: 'DISRUPTION_DELAY',
  ROAD_TRAFFIC_CONGESTION: 'ROAD_TRAFFIC_CONGESTION',
  SEVERE_TRAFFIC: 'SEVERE_TRAFFIC',
  WEATHER_IMPACT: 'WEATHER_IMPACT',
  WEATHER_IMPASSABLE: 'WEATHER_IMPASSABLE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  SERVICE_SUSPENDED: 'SERVICE_SUSPENDED',
  JOURNEY_INFEASIBLE: 'JOURNEY_INFEASIBLE',
  HIGH_WALKING_BURDEN: 'HIGH_WALKING_BURDEN',
  EXCESSIVE_TRANSFERS: 'EXCESSIVE_TRANSFERS',
  HIGH_WAITING_TIME: 'HIGH_WAITING_TIME',
  HIGH_UNCERTAINTY: 'HIGH_UNCERTAINTY',
  HIGH_COST: 'HIGH_COST'
});

const reliabilityLevelEnum = z.enum(['LOW', 'MODERATE', 'HIGH', 'SEVERE']);

const routeEvaluationSchema = z.object({
  journeyId: z.string().min(1, 'Journey ID is required'),
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  departureTime: z.string().regex(timeRegex, 'Departure time must be HH:MM'),
  estimatedArrivalTime: z.string().regex(timeRegex, 'Estimated arrival time must be HH:MM'),
  updatedArrivalTime: z.string().regex(timeRegex, 'Updated arrival time must be HH:MM'),
  totalTravelTime: z.coerce.number().min(0, 'Total travel time must be non-negative'),
  baselineTravelTime: z.coerce.number().min(0, 'Baseline travel time must be non-negative'),
  additionalDisruptionDelay: z.coerce.number().min(0).default(0),
  totalAdditionalDelay: z.coerce.number().min(0).default(0),
  waitingTime: z.coerce.number().min(0).default(0),
  walkingTime: z.coerce.number().min(0).default(0),
  transitTime: z.coerce.number().min(0).default(0),
  numberOfTransfers: z.coerce.number().int().min(0).default(0),
  estimatedCost: z.coerce.number().min(0).default(0),
  totalDistanceKm: z.coerce.number().min(0).default(0),
  primaryMode: transportModeEnum.default('transit'),
  modesIncluded: z.array(z.string()).default([]),
  isFeasible: z.boolean().default(true),
  feasibilityReason: z.string().default(UNIFIED_FEASIBILITY_STATUSES.OPERATIONAL),
  affectedSegments: z.array(z.any()).default([]),
  unavailableSegments: z.array(z.any()).default([]),
  reliability: reliabilityLevelEnum.default('LOW'),
  uncertainty: reliabilityLevelEnum.default('LOW'),
  trafficImpact: z.object({
    level: z.string().default('normal'),
    addedTravelTimeMinutes: z.coerce.number().default(0)
  }).default({}),
  weatherImpact: z.object({
    condition: z.string().default('clear'),
    totalAddedTravelTimeMinutes: z.coerce.number().default(0),
    walkingInconvenienceLevel: z.string().default('NONE'),
    travelUncertaintyLevel: z.string().default('LOW')
  }).default({}),
  transportStatus: z.object({
    dominantStatus: z.string().default('AVAILABLE'),
    isUsable: z.boolean().default(true)
  }).default({}),
  reasonCodes: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  advisories: z.array(z.string()).default([]),
  dataTiers: z.array(z.string()).default([]),
  provenance: provenanceSchema,
  evaluatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class RouteEvaluation {
  /**
   * @param {object} data
   */
  constructor(data) {
    try {
      const validated = routeEvaluationSchema.parse(data);
      Object.assign(this, validated);

      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid route evaluation: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Evaluates and constructs a RouteEvaluation from a candidate journey and unified impact.
   *
   * @param {object} journey - CommuteJourney instance or candidate object
   * @param {object} unifiedImpact - UnifiedJourneyImpact instance or context impact object
   * @param {object} [options={}] - Optional overrides and threshold customizations
   * @returns {RouteEvaluation}
   */
  static fromJourneyAndImpact(journey, unifiedImpact, options = {}) {
    if (!journey) {
      throw new ValidationError('Candidate journey is required to construct RouteEvaluation');
    }
    if (!unifiedImpact) {
      throw new ValidationError('UnifiedJourneyImpact is required to construct RouteEvaluation');
    }

    const baselineDuration = Number(
      journey.baselineTravel?.durationMinutes ??
      journey.totalDurationMinutes ??
      journey.durationMinutes ??
      0
    );

    const disruptionDelay = Number(
      unifiedImpact.disruptionImpact?.totalDelayMinutes ??
      unifiedImpact.disruptionDelayMinutes ??
      0
    );

    const totalAdditionalDelay = Number(
      unifiedImpact.totalAdditionalDelayMinutes ??
      unifiedImpact.totalEstimatedAdditionalDelayMinutes ??
      0
    );

    const totalTravelTime = Number(
      unifiedImpact.updatedDurationMinutes ??
      (baselineDuration + totalAdditionalDelay)
    );

    const departureTime = journey.departureTime || '08:00';
    const baselineArrivalTime = journey.baselineTravel?.estimatedArrivalTime ||
      journey.estimatedArrivalTime ||
      RouteEvaluation._addMinutesToHHMM(departureTime, baselineDuration);

    const updatedArrivalTime = unifiedImpact.updatedArrivalTime ||
      RouteEvaluation._addMinutesToHHMM(departureTime, totalTravelTime);

    const waitingTime = Number(
      journey.baselineTravel?.waitingTimeMinutes ??
      journey.totalWaitingTimeMinutes ??
      0
    );

    const walkingTime = Number(
      journey.baselineTravel?.walkingTimeMinutes ??
      journey.walkingTimeMinutes ??
      0
    );

    const transitTime = Number(
      journey.baselineTravel?.transitTimeMinutes ??
      journey.transitTimeMinutes ??
      0
    );

    const numberOfTransfers = Number(
      journey.transferCount ??
      journey.baselineTravel?.transferCount ??
      (journey.segments ? Math.max(0, journey.segments.filter(s => s.type === 'TRANSIT').length - 1) : 0)
    );

    const estimatedCost = Number(
      journey.baselineTravel?.estimatedCostRupees ??
      journey.estimatedCostRupees ??
      0
    );

    const totalDistanceKm = Number(
      journey.baselineTravel?.totalDistanceKm ??
      journey.totalDistanceKm ??
      0
    );

    const primaryMode = journey.primaryMode || 'transit';
    const modesIncluded = Array.isArray(journey.modesIncluded) ? [...journey.modesIncluded] : [primaryMode];

    const isFeasible = Boolean(
      unifiedImpact.isFeasible !== false &&
      journey.isViable !== false
    );

    const feasibilityReason = !isFeasible
      ? (unifiedImpact.feasibilityReason || UNIFIED_FEASIBILITY_STATUSES.JOURNEY_INFEASIBLE)
      : UNIFIED_FEASIBILITY_STATUSES.OPERATIONAL;

    const affectedSegments = Array.isArray(unifiedImpact.affectedSegments)
      ? unifiedImpact.affectedSegments
      : [];

    const unavailableSegments = Array.isArray(unifiedImpact.unavailableSegments)
      ? unifiedImpact.unavailableSegments
      : [];

    const reliability = unifiedImpact.reliabilityIndicator || 'LOW';
    const uncertainty = unifiedImpact.uncertaintyLevel || reliability;

    // Traffic impact extraction
    const trafficImpact = {
      level: unifiedImpact.trafficImpact?.level || 'normal',
      addedTravelTimeMinutes: Number(unifiedImpact.trafficImpact?.addedTravelTimeMinutes || 0)
    };

    // Weather impact extraction
    const weatherImpact = {
      condition: unifiedImpact.weatherImpact?.condition || 'clear',
      totalAddedTravelTimeMinutes: Number(unifiedImpact.weatherImpact?.totalAddedTravelTimeMinutes || 0),
      walkingInconvenienceLevel: unifiedImpact.weatherImpact?.walkingInconvenience?.level || 'NONE',
      travelUncertaintyLevel: unifiedImpact.weatherImpact?.travelUncertainty?.level || 'LOW'
    };

    // Transport availability status extraction
    const transportStatus = {
      dominantStatus: unifiedImpact.dominantTransportStatus || unifiedImpact.transportStatus?.dominantStatus || 'AVAILABLE',
      isUsable: unifiedImpact.transportStatus?.isUsable !== false
    };

    // Detect Explainable Route Weaknesses
    const weaknesses = [];
    const reasonCodes = Array.isArray(unifiedImpact.reasonCodes) ? [...unifiedImpact.reasonCodes] : [];

    if (!isFeasible) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.JOURNEY_INFEASIBLE);
      if (feasibilityReason === UNIFIED_FEASIBILITY_STATUSES.SERVICE_UNAVAILABLE) {
        weaknesses.push(ROUTE_WEAKNESS_CODES.SERVICE_UNAVAILABLE);
      } else if (feasibilityReason === UNIFIED_FEASIBILITY_STATUSES.SERVICE_SUSPENDED) {
        weaknesses.push(ROUTE_WEAKNESS_CODES.SERVICE_SUSPENDED);
      }
    }

    if (disruptionDelay > 0) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.DISRUPTION_DELAY);
    }

    if (trafficImpact.addedTravelTimeMinutes > 0) {
      if (trafficImpact.level === 'severe') {
        weaknesses.push(ROUTE_WEAKNESS_CODES.SEVERE_TRAFFIC);
      } else {
        weaknesses.push(ROUTE_WEAKNESS_CODES.ROAD_TRAFFIC_CONGESTION);
      }
    }

    if (weatherImpact.condition !== 'clear' && (weatherImpact.totalAddedTravelTimeMinutes > 0 || weatherImpact.walkingInconvenienceLevel !== 'NONE')) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.WEATHER_IMPACT);
    }

    // Walking burden threshold (default: 15 minutes)
    const maxWalkingThreshold = options.maxWalkingThresholdMinutes || 15;
    if (walkingTime > maxWalkingThreshold) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.HIGH_WALKING_BURDEN);
      if (!reasonCodes.includes(ROUTE_WEAKNESS_CODES.HIGH_WALKING_BURDEN)) {
        reasonCodes.push(ROUTE_WEAKNESS_CODES.HIGH_WALKING_BURDEN);
      }
    }

    // Modal transfer threshold (default: >= 2 transfers)
    const maxTransferThreshold = options.maxTransferThreshold !== undefined ? options.maxTransferThreshold : 2;
    if (numberOfTransfers >= maxTransferThreshold) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.EXCESSIVE_TRANSFERS);
      if (!reasonCodes.includes(ROUTE_WEAKNESS_CODES.EXCESSIVE_TRANSFERS)) {
        reasonCodes.push(ROUTE_WEAKNESS_CODES.EXCESSIVE_TRANSFERS);
      }
    }

    // Waiting time threshold (default: > 10 minutes)
    const maxWaitingThreshold = options.maxWaitingThresholdMinutes || 10;
    if (waitingTime > maxWaitingThreshold) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.HIGH_WAITING_TIME);
      if (!reasonCodes.includes(ROUTE_WEAKNESS_CODES.HIGH_WAITING_TIME)) {
        reasonCodes.push(ROUTE_WEAKNESS_CODES.HIGH_WAITING_TIME);
      }
    }

    // Reliability/uncertainty threshold
    if (reliability === 'HIGH' || reliability === 'SEVERE') {
      weaknesses.push(ROUTE_WEAKNESS_CODES.HIGH_UNCERTAINTY);
      if (!reasonCodes.includes(ROUTE_WEAKNESS_CODES.HIGH_UNCERTAINTY)) {
        reasonCodes.push(ROUTE_WEAKNESS_CODES.HIGH_UNCERTAINTY);
      }
    }

    // Monetary cost threshold (default: > 60 rupees for student budget)
    const maxCostThreshold = options.maxCostThresholdRupees || 60;
    if (estimatedCost > maxCostThreshold) {
      weaknesses.push(ROUTE_WEAKNESS_CODES.HIGH_COST);
      if (!reasonCodes.includes(ROUTE_WEAKNESS_CODES.HIGH_COST)) {
        reasonCodes.push(ROUTE_WEAKNESS_CODES.HIGH_COST);
      }
    }

    const uniqueWeaknesses = Array.from(new Set(weaknesses));
    const uniqueReasonCodes = Array.from(new Set(reasonCodes));

    // Data tiers & Provenance
    const dataTiers = Array.from(new Set([
      ...(journey.provenance?.sourceTier ? [journey.provenance.sourceTier] : (journey.provenance?.tier ? [journey.provenance.tier] : [])),
      ...(unifiedImpact.dataTiers || []),
      ...(unifiedImpact.provenance?.sourceTier ? [unifiedImpact.provenance.sourceTier] : (unifiedImpact.provenance?.tier ? [unifiedImpact.provenance.tier] : []))
    ])).filter(Boolean);

    if (dataTiers.length === 0) {
      dataTiers.push(PROVENANCE_TIERS.ESTIMATED);
    }

    const provenance = unifiedImpact.provenance instanceof DataProvenance
      ? unifiedImpact.provenance
      : (unifiedImpact.provenance
        ? new DataProvenance(unifiedImpact.provenance)
        : (journey.provenance instanceof DataProvenance
          ? journey.provenance
          : new DataProvenance(journey.provenance || DataProvenance.estimated('Route Evaluation Engine'))));

    const advisories = Array.from(new Set([
      ...(journey.advisories || []),
      ...(unifiedImpact.advisories || [])
    ])).filter(Boolean);

    return new RouteEvaluation({
      journeyId: journey.id || 'journey-candidate',
      origin: journey.origin || '',
      destination: journey.destination || '',
      departureTime,
      estimatedArrivalTime: baselineArrivalTime,
      updatedArrivalTime,
      totalTravelTime,
      baselineTravelTime: baselineDuration,
      additionalDisruptionDelay: disruptionDelay,
      totalAdditionalDelay,
      waitingTime,
      walkingTime,
      transitTime,
      numberOfTransfers,
      estimatedCost,
      totalDistanceKm,
      primaryMode,
      modesIncluded,
      isFeasible,
      feasibilityReason,
      affectedSegments,
      unavailableSegments,
      reliability,
      uncertainty,
      trafficImpact,
      weatherImpact,
      transportStatus,
      reasonCodes: uniqueReasonCodes,
      weaknesses: uniqueWeaknesses,
      advisories,
      dataTiers,
      provenance,
      evaluatedAt: Date.now()
    });
  }

  /**
   * Adds minutes to an HH:MM 24-hour time string with proper wrapping.
   * @private
   */
  static _addMinutesToHHMM(timeStr, minutesToAdd) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
      return '08:00';
    }
    const [h, m] = timeStr.split(':').map(Number);
    const totalMinutes = ((h * 60 + m + Math.round(minutesToAdd)) % 1440 + 1440) % 1440;
    const newH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const newM = String(totalMinutes % 60).padStart(2, '0');
    return `${newH}:${newM}`;
  }

  isRouteFeasible() {
    return this.isFeasible;
  }

  hasWeaknesses() {
    return this.weaknesses.length > 0;
  }

  hasDisruptions() {
    return this.additionalDisruptionDelay > 0 || this.affectedSegments.length > 0;
  }

  hasUnavailableSegments() {
    return this.unavailableSegments.length > 0;
  }

  toJSON() {
    return {
      journeyId: this.journeyId,
      origin: this.origin,
      destination: this.destination,
      departureTime: this.departureTime,
      estimatedArrivalTime: this.estimatedArrivalTime,
      updatedArrivalTime: this.updatedArrivalTime,
      totalTravelTime: this.totalTravelTime,
      baselineTravelTime: this.baselineTravelTime,
      additionalDisruptionDelay: this.additionalDisruptionDelay,
      totalAdditionalDelay: this.totalAdditionalDelay,
      waitingTime: this.waitingTime,
      walkingTime: this.walkingTime,
      transitTime: this.transitTime,
      numberOfTransfers: this.numberOfTransfers,
      estimatedCost: this.estimatedCost,
      totalDistanceKm: this.totalDistanceKm,
      primaryMode: this.primaryMode,
      modesIncluded: [...this.modesIncluded],
      isFeasible: this.isFeasible,
      feasibilityReason: this.feasibilityReason,
      affectedSegments: [...this.affectedSegments],
      unavailableSegments: [...this.unavailableSegments],
      reliability: this.reliability,
      uncertainty: this.uncertainty,
      trafficImpact: { ...this.trafficImpact },
      weatherImpact: { ...this.weatherImpact },
      transportStatus: { ...this.transportStatus },
      reasonCodes: [...this.reasonCodes],
      weaknesses: [...this.weaknesses],
      advisories: [...this.advisories],
      dataTiers: [...this.dataTiers],
      provenance: typeof this.provenance?.toJSON === 'function' ? this.provenance.toJSON() : this.provenance,
      evaluatedAt: this.evaluatedAt
    };
  }
}

module.exports = {
  RouteEvaluation,
  routeEvaluationSchema,
  ROUTE_WEAKNESS_CODES
};
