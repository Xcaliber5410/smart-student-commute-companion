/**
 * CommuteJourney Domain Model
 *
 * Represents an actual candidate trip connecting a student's starting area
 * to their college destination.
 *
 * Structure:
 * Journey
 *  ├── origin
 *  ├── destination
 *  ├── departure
 *  ├── estimated arrival
 *  ├── total duration
 *  ├── total waiting time
 *  ├── walking time
 *  ├── number of transfers
 *  ├── estimated cost if supported
 *  └── ordered segments
 *        ├── walk
 *        ├── metro
 *        ├── bus
 *        ├── train
 *        └── etc.
 *
 * Key Capabilities:
 * - Direct conversion to CommuteRoute for recommendation pipeline scoring
 * - Comprehensive metrics calculation (waiting, walking, transit, fares, transfers)
 * - 4-tier provenance preservation
 */

const { z } = require('zod');
const {
  transportModeEnum,
  CommuteRoute,
  RouteLeg,
  TravelEstimate,
  DataProvenance,
  provenanceSchema
} = require('./CommuteContracts');
const { JourneySegment } = require('./JourneySegment');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const commuteJourneySchema = z.object({
  id: z.string().min(1, 'Journey ID is required'),
  origin: z.string().min(2, 'Origin area is required').max(100),
  destination: z.string().min(2, 'Destination area is required').max(100),
  departureTime: z.string().regex(timeRegex, 'Departure time must be in HH:MM format'),
  estimatedArrivalTime: z.string().regex(timeRegex, 'Estimated arrival time must be in HH:MM format'),
  totalDurationMinutes: z.coerce.number().min(0, 'Total duration must be non-negative'),
  totalWaitingTimeMinutes: z.coerce.number().min(0, 'Total waiting time must be non-negative').default(0),
  walkingTimeMinutes: z.coerce.number().min(0, 'Walking time must be non-negative').default(0),
  transitTimeMinutes: z.coerce.number().min(0, 'Transit time must be non-negative').default(0),
  transferCount: z.coerce.number().int().min(0, 'Transfer count must be non-negative').default(0),
  estimatedCostRupees: z.coerce.number().min(0, 'Estimated cost must be non-negative').default(0),
  totalDistanceKm: z.coerce.number().min(0, 'Total distance must be non-negative').default(0),
  primaryMode: transportModeEnum,
  modesIncluded: z.array(transportModeEnum).min(1, 'At least one transport mode required'),
  segments: z.array(z.any()).min(1, 'Journey must have at least one segment'),
  advisories: z.array(z.string()).default([]),
  isViable: z.boolean().default(true),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Journey Builder Engine').toJSON()),
  createdAt: z.number().int().positive().default(() => Date.now())
});

class CommuteJourney {
  constructor(data) {
    try {
      const validated = commuteJourneySchema.parse(data);
      Object.assign(this, validated);

      // Instantiate JourneySegment domain instances
      this.segments = validated.segments.map((seg, idx) => {
        if (seg instanceof JourneySegment) return seg;
        const segData = { ...seg };
        if (segData.segmentIndex === undefined) segData.segmentIndex = idx;
        return new JourneySegment(segData);
      });

      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid commute journey: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Returns the count of modal transfers / interchanges.
   * @returns {number}
   */
  getTransferCount() {
    return this.transferCount;
  }

  /**
   * Checks if the journey is a direct single-segment or non-interchange commute.
   * @returns {boolean}
   */
  isDirect() {
    return this.transferCount === 0;
  }

  /**
   * Checks whether the journey includes a specific transport mode.
   * @param {string} mode
   * @returns {boolean}
   */
  hasMode(mode) {
    return this.modesIncluded.includes(mode);
  }

  /**
   * Returns a segment by index.
   * @param {number} index
   * @returns {JourneySegment|undefined}
   */
  getSegment(index) {
    return this.segments[index];
  }

  /**
   * Converts this candidate journey into a canonical CommuteRoute instance
   * suitable for the recommendation pipeline's filtering and scoring stages.
   *
   * @param {object} [options={}]
   * @returns {CommuteRoute}
   */
  toCommuteRoute(options = {}) {
    const minMinutes = Math.max(1, Math.round(this.totalDurationMinutes * 0.9));
    const maxMinutes = Math.max(minMinutes, Math.round(this.totalDurationMinutes * 1.25) + 2);

    const travelEstimate = new TravelEstimate({
      totalDurationMinutes: this.totalDurationMinutes,
      walkingDurationMinutes: this.walkingTimeMinutes,
      transitDurationMinutes: this.transitTimeMinutes,
      totalDistanceKm: this.totalDistanceKm,
      walkingDistanceKm: this.segments.filter(s => s.isWalking()).reduce((acc, s) => acc + s.distanceKm, 0),
      totalFareRupees: this.estimatedCostRupees,
      transferCount: this.transferCount,
      confidenceInterval: {
        minMinutes,
        maxMinutes
      },
      provenance: this.provenance.toJSON()
    });

    const legs = this.segments.map((s, idx) => s.toRouteLeg({ legIndex: idx }));

    return new CommuteRoute({
      id: options.id || `route-${this.id}`,
      title: options.title || `Via ${this.primaryMode.toUpperCase()} (${this.origin} to ${this.destination})`,
      summary: options.summary || `${this.modesIncluded.join(' → ')} • ${this.totalDurationMinutes} mins • ₹${this.estimatedCostRupees}`,
      primaryMode: this.primaryMode,
      modesIncluded: [...this.modesIncluded],
      estimate: travelEstimate.toJSON(),
      legs: legs.map(l => l.toJSON()),
      scores: options.scores || {
        compositeScore: 80,
        timeScore: 80,
        costScore: 80,
        walkingScore: 80,
        reliabilityScore: 80,
        disruptionPenalty: 0,
        weatherPenalty: 0
      },
      tags: options.tags || (this.transferCount === 0 ? ['direct'] : ['multimodal']),
      isViable: this.isViable,
      provenance: this.provenance.toJSON()
    });
  }

  toJSON() {
    return {
      id: this.id,
      origin: this.origin,
      destination: this.destination,
      departureTime: this.departureTime,
      estimatedArrivalTime: this.estimatedArrivalTime,
      totalDurationMinutes: this.totalDurationMinutes,
      totalWaitingTimeMinutes: this.totalWaitingTimeMinutes,
      walkingTimeMinutes: this.walkingTimeMinutes,
      transitTimeMinutes: this.transitTimeMinutes,
      transferCount: this.transferCount,
      estimatedCostRupees: this.estimatedCostRupees,
      totalDistanceKm: this.totalDistanceKm,
      primaryMode: this.primaryMode,
      modesIncluded: [...this.modesIncluded],
      segments: this.segments.map(s => s.toJSON()),
      advisories: [...this.advisories],
      isViable: this.isViable,
      provenance: this.provenance.toJSON(),
      createdAt: this.createdAt
    };
  }
}

module.exports = {
  CommuteJourney,
  commuteJourneySchema
};
