/**
 * DepartureAdvice Domain Model
 *
 * Establishes formal domain contracts for disruption-aware departure timing advice.
 *
 * Capabilities:
 * - Evaluates whether current departure plan can achieve target arrival deadline
 * - Calculates disruption delay impacts on departure schedules
 * - Suggests feasible earlier departures within operating hours
 * - Compares feasible timetable departure windows
 * - Flags when departure adjustment is insufficient and route changes are needed
 * - Reports when deadlines cannot be met by any supported departure option
 * - Preserves 4-tier provenance without fabricating timetable data
 */

const { z } = require('zod');
const {
  DataProvenance,
  provenanceSchema,
  PROVENANCE_TIERS,
  provenanceTierEnum
} = require('./CommuteContracts');
const { ValidationError } = require('../errors');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Standard Departure Advice Types
 */
const DEPARTURE_ADVICE_TYPES = Object.freeze({
  ON_TIME: 'ON_TIME',
  EARLIER_DEPARTURE_RECOMMENDED: 'EARLIER_DEPARTURE_RECOMMENDED',
  ROUTE_CHANGE_NEEDED: 'ROUTE_CHANGE_NEEDED',
  DEADLINE_UNACHIEVABLE: 'DEADLINE_UNACHIEVABLE',
  MISSING_DATA_CAUTION: 'MISSING_DATA_CAUTION'
});

const departureAdviceTypeEnum = z.enum([
  'ON_TIME',
  'EARLIER_DEPARTURE_RECOMMENDED',
  'ROUTE_CHANGE_NEEDED',
  'DEADLINE_UNACHIEVABLE',
  'MISSING_DATA_CAUTION'
]);

const departureWindowOptionSchema = z.object({
  departureTime: z.string().regex(timeRegex),
  arrivalTime: z.string().regex(timeRegex),
  marginMinutes: z.coerce.number().int().default(0),
  bufferMinutes: z.coerce.number().int().default(0),
  tripIdentifier: z.string().nullable().optional().default(null),
  isFeasible: z.boolean().default(true),
  provenanceTier: provenanceTierEnum.default(PROVENANCE_TIERS.ESTIMATED)
});

const departureAdviceSchema = z.object({
  id: z.string().min(1, 'Departure advice ID is required'),
  adviceType: departureAdviceTypeEnum.default(DEPARTURE_ADVICE_TYPES.ON_TIME),
  canMeetDeadline: z.boolean().default(true),
  currentPlan: z.object({
    departureTime: z.string().regex(timeRegex),
    baselineArrivalTime: z.string().regex(timeRegex).nullable().default(null),
    contextualArrivalTime: z.string().regex(timeRegex).nullable().default(null),
    targetArrivalTime: z.string().regex(timeRegex).nullable().default(null),
    totalTravelMinutes: z.coerce.number().min(0).default(0),
    disruptionDelayMinutes: z.coerce.number().min(0).default(0),
    marginMinutes: z.coerce.number().nullable().default(null),
    isDelayed: z.boolean().default(false)
  }),
  suggestedDeparture: z.object({
    recommendedDepartureTime: z.string().regex(timeRegex).nullable().default(null),
    recommendedArrivalTime: z.string().regex(timeRegex).nullable().default(null),
    earlierByMinutes: z.coerce.number().min(0).default(0),
    safetyBufferMinutes: z.coerce.number().min(0).default(0),
    departureWindow: z.object({
      start: z.string().regex(timeRegex),
      end: z.string().regex(timeRegex)
    }).nullable().default(null),
    feasibleDepartureWindows: z.array(departureWindowOptionSchema).default([])
  }).default(() => ({
    recommendedDepartureTime: null,
    recommendedArrivalTime: null,
    earlierByMinutes: 0,
    safetyBufferMinutes: 0,
    departureWindow: null,
    feasibleDepartureWindows: []
  })),
  operatingHours: z.object({
    start: z.string().regex(timeRegex),
    end: z.string().regex(timeRegex),
    mode: z.string().default('transit'),
    isWithinOperatingHours: z.boolean().default(true)
  }).nullable().default(null),
  adjustmentFeasible: z.boolean().default(true),
  routeChangeRecommended: z.boolean().default(false),
  headline: z.string().min(1, 'Headline is required'),
  explanation: z.string().min(1, 'Explanation is required'),
  actionableGuidance: z.array(z.string()).default([]),
  academicScheduleInfluence: z.object({
    hasAcademicContext: z.boolean().default(false),
    eventTitle: z.string().nullable().optional().default(null),
    eventStartTime: z.string().nullable().optional().default(null),
    eventType: z.string().nullable().optional().default(null),
    isExamDay: z.boolean().default(false),
    scheduleConflicts: z.array(z.any()).default([])
  }).nullable().optional().default(null),
  provenance: provenanceSchema.default(() => DataProvenance.estimated('Departure Advice Engine').toJSON()),
  generatedAt: z.coerce.number().int().positive().default(() => Date.now())
});

class DepartureAdvice {
  constructor(data) {
    try {
      const validated = departureAdviceSchema.parse(data);
      Object.assign(this, validated);
      this.provenance = validated.provenance instanceof DataProvenance
        ? validated.provenance
        : new DataProvenance(validated.provenance);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid departure advice: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  toJSON() {
    return {
      id: this.id,
      adviceType: this.adviceType,
      canMeetDeadline: this.canMeetDeadline,
      currentPlan: { ...this.currentPlan },
      suggestedDeparture: {
        ...this.suggestedDeparture,
        departureWindow: this.suggestedDeparture.departureWindow ? { ...this.suggestedDeparture.departureWindow } : null,
        feasibleDepartureWindows: this.suggestedDeparture.feasibleDepartureWindows.map(w => ({ ...w }))
      },
      operatingHours: this.operatingHours ? { ...this.operatingHours } : null,
      adjustmentFeasible: this.adjustmentFeasible,
      routeChangeRecommended: this.routeChangeRecommended,
      headline: this.headline,
      explanation: this.explanation,
      actionableGuidance: [...this.actionableGuidance],
      academicScheduleInfluence: this.academicScheduleInfluence ? { ...this.academicScheduleInfluence } : null,
      provenance: this.provenance.toJSON(),
      generatedAt: this.generatedAt
    };
  }
}

module.exports = {
  DepartureAdvice,
  departureAdviceSchema,
  DEPARTURE_ADVICE_TYPES,
  departureAdviceTypeEnum,
  departureWindowOptionSchema
};
