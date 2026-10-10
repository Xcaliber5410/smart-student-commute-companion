/**
 * ContextualCommutePersonalization Domain Model
 *
 * Represents the normalized contextual personalization state for an authenticated
 * student's commute planning request.
 *
 * Responsibilities:
 * 1. Encapsulates explicit user input, saved preferences, and derived academic context.
 * 2. Distinguishes data origins via transparent source attribution (EXPLICIT_INPUT vs.
 *    ACADEMIC_EVENT vs. RECURRING_SCHEDULE vs. SAVED_PREFERENCE vs. DEFAULT).
 * 3. Never invents or assumes an academic event when unsupported by data.
 * 4. Upholds privacy boundaries: operates strictly over coarse area names with zero GPS tracking.
 */

const { z } = require('zod');
const { ValidationError } = require('../errors');

const CONTEXT_SOURCES = Object.freeze({
  EXPLICIT_INPUT: 'EXPLICIT_INPUT',
  ACADEMIC_EVENT: 'ACADEMIC_EVENT',
  RECURRING_SCHEDULE: 'RECURRING_SCHEDULE',
  SAVED_PREFERENCE: 'SAVED_PREFERENCE',
  DERIVED_CONTEXT: 'DERIVED_CONTEXT',
  DEFAULT: 'DEFAULT',
  NONE: 'NONE'
});

const contextSourceEnum = z.enum([
  'EXPLICIT_INPUT',
  'ACADEMIC_EVENT',
  'RECURRING_SCHEDULE',
  'SAVED_PREFERENCE',
  'DERIVED_CONTEXT',
  'DEFAULT',
  'NONE'
]);

const explicitInputSchema = z.object({
  origin: z.string().nullable().default(null),
  destination: z.string().nullable().default(null),
  desiredDepartureTime: z.string().nullable().default(null),
  desiredArrivalTime: z.string().nullable().default(null),
  preferredModes: z.array(z.string()).nullable().default(null),
  avoidModes: z.array(z.string()).nullable().default(null),
  routePreference: z.string().nullable().default(null),
  constraints: z.record(z.any()).nullable().default(null)
});

const savedPreferencesSchema = z.object({
  hasSavedPreferences: z.boolean().default(false),
  preference: z.string().nullable().default(null),
  preferredModes: z.array(z.string()).default(['train', 'metro', 'bus', 'auto', 'walk']),
  avoidModes: z.array(z.string()).default([]),
  walkingToleranceMinutes: z.coerce.number().min(0).nullable().default(null),
  maxBudgetRupees: z.coerce.number().min(0).nullable().default(null),
  maxTransfers: z.coerce.number().int().min(0).nullable().default(null),
  defaultOriginArea: z.string().nullable().default(null),
  defaultDestinationCollege: z.string().nullable().default(null),
  defaultArrivalTime: z.string().nullable().default(null)
});

const academicEventSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  eventType: z.string(),
  courseId: z.string().nullable().default(null),
  courseName: z.string().nullable().default(null),
  startTime: z.number().int().positive(),
  startTimeHHMM: z.string(),
  endTime: z.number().int().positive(),
  endTimeHHMM: z.string(),
  location: z.string().nullable().default(null),
  durationMinutes: z.coerce.number().min(0)
});

const recurringScheduleSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  origin: z.string(),
  destination: z.string(),
  targetArrivalTime: z.string(),
  daysOfWeek: z.array(z.string()).default([])
});

const scheduleConflictSchema = z.object({
  type: z.string(),
  title: z.string(),
  eventTime: z.string(),
  requestedTime: z.string().nullable().default(null),
  detail: z.string()
});

const academicContextSchema = z.object({
  hasAcademicContext: z.boolean().default(false),
  scheduledEventsCount: z.coerce.number().int().min(0).default(0),
  hasScheduledClass: z.boolean().default(false),
  isDestinationMatched: z.boolean().default(false),
  isExamDay: z.boolean().default(false),
  recommendedBufferMinutes: z.coerce.number().min(0).default(10),
  nextClass: academicEventSummarySchema.nullable().default(null),
  todayEvents: z.array(academicEventSummarySchema).default([]),
  recurringSchedule: recurringScheduleSummarySchema.nullable().default(null),
  scheduleConflicts: z.array(scheduleConflictSchema).default([]),
  influencingFactors: z.array(z.string()).default([])
});

const workloadContextSchema = z.object({
  hasWorkloadContext: z.boolean().default(false),
  isHeavyDay: z.boolean().default(false),
  loadLevel: z.enum(['light', 'moderate', 'heavy']).default('light'),
  totalCommitmentMinutes: z.coerce.number().min(0).default(0),
  assignmentsDueCount: z.coerce.number().int().min(0).default(0),
  hasConflicts: z.boolean().default(false),
  conflictsCount: z.coerce.number().int().min(0).default(0)
});

const scheduleConstraintsSchema = z.object({
  mustArriveBefore: z.string().nullable().default(null),
  recommendedBufferMinutes: z.coerce.number().min(0).default(10),
  isExamDay: z.boolean().default(false),
  heavyWorkloadCaution: z.boolean().default(false),
  scheduleConflicts: z.array(z.any()).default([]),
  influencingFactors: z.array(z.string()).default([])
});

const resolvedPersonalizationSchema = z.object({
  effectiveOrigin: z.string().default(''),
  originSource: contextSourceEnum.default('DEFAULT'),
  effectiveDestination: z.string().default('D.J. Sanghvi College of Engineering'),
  destinationSource: contextSourceEnum.default('DEFAULT'),
  effectiveArrivalDeadline: z.string().nullable().default(null),
  arrivalDeadlineSource: contextSourceEnum.default('NONE'),
  effectiveDepartureTime: z.string().default('08:00'),
  departureTimeSource: contextSourceEnum.default('DEFAULT'),
  effectiveRoutePreference: z.string().default('balanced'),
  routePreferenceSource: contextSourceEnum.default('DEFAULT'),
  effectivePreferredModes: z.array(z.string()).default(['train', 'metro', 'bus', 'auto', 'walk']),
  effectiveAvoidModes: z.array(z.string()).default([]),
  effectiveConstraints: z.object({
    maxTransfers: z.coerce.number().int().min(0).nullable().default(null),
    maxWalkingMinutes: z.coerce.number().min(0).nullable().default(null),
    maxBudgetRupees: z.coerce.number().min(0).nullable().default(null)
  }).default({}),
  scheduleConstraints: scheduleConstraintsSchema.default({})
});

const privacyGuaranteesSchema = z.object({
  coarseLocationOnly: z.boolean().default(true),
  noContinuousTracking: z.boolean().default(true),
  studentScoped: z.boolean().default(true)
});

const contextualCommutePersonalizationSchema = z.object({
  studentId: z.string().nullable().default(null),
  requestTimestamp: z.number().int().positive().default(() => Date.now()),
  targetDate: z.string().default('today'),
  dayOfWeek: z.string().default('Mon'),
  explicitInput: explicitInputSchema.default({}),
  savedPreferences: savedPreferencesSchema.default({}),
  academicContext: academicContextSchema.default({}),
  workloadContext: workloadContextSchema.default({}),
  resolvedPersonalization: resolvedPersonalizationSchema.default({}),
  privacyGuarantees: privacyGuaranteesSchema.default({})
});

class ContextualCommutePersonalization {
  constructor(data = {}) {
    try {
      const validated = contextualCommutePersonalizationSchema.parse(data);
      Object.assign(this, validated);
    } catch (err) {
      if (err.name === 'ZodError') {
        throw new ValidationError(`Invalid contextual commute personalization: ${err.errors?.[0]?.message || err.message}`, err.errors || err);
      }
      throw err;
    }
  }

  /**
   * Factory method to create a clean fallback / default personalization envelope
   * when no student ID is provided (anonymous guest) or when data is missing.
   *
   * @param {object} [options={}]
   * @returns {ContextualCommutePersonalization}
   */
  static createDefault(options = {}) {
    const origin = options.origin || '';
    const destination = options.destination || 'D.J. Sanghvi College of Engineering';
    const departureTime = options.desiredDepartureTime || options.departureTime || '08:00';
    const arrivalDeadline = options.desiredArrivalTime || options.targetArrivalTime || null;
    const routePreference = options.routePreference || 'balanced';

    return new ContextualCommutePersonalization({
      studentId: options.studentId || null,
      requestTimestamp: options.currentTime || Date.now(),
      targetDate: options.date || 'today',
      dayOfWeek: options.dayOfWeek || 'Mon',
      explicitInput: {
        origin,
        destination,
        desiredDepartureTime: departureTime,
        desiredArrivalTime: arrivalDeadline,
        preferredModes: options.preferredModes || null,
        avoidModes: options.avoidModes || null,
        routePreference,
        constraints: options.constraints || null
      },
      savedPreferences: {
        hasSavedPreferences: false,
        preference: null,
        preferredModes: ['train', 'metro', 'bus', 'auto', 'walk'],
        avoidModes: [],
        walkingToleranceMinutes: null,
        maxBudgetRupees: null,
        maxTransfers: null,
        defaultOriginArea: null,
        defaultDestinationCollege: null,
        defaultArrivalTime: null
      },
      academicContext: {
        hasAcademicContext: false,
        scheduledEventsCount: 0,
        hasScheduledClass: false,
        isDestinationMatched: false,
        nextClass: null,
        todayEvents: [],
        recurringSchedule: null,
        scheduleConflicts: [],
        influencingFactors: []
      },
      workloadContext: {
        hasWorkloadContext: false,
        isHeavyDay: false,
        loadLevel: 'light',
        totalCommitmentMinutes: 0,
        assignmentsDueCount: 0,
        hasConflicts: false,
        conflictsCount: 0
      },
      resolvedPersonalization: {
        effectiveOrigin: origin,
        originSource: origin ? CONTEXT_SOURCES.EXPLICIT_INPUT : CONTEXT_SOURCES.DEFAULT,
        effectiveDestination: destination,
        destinationSource: options.destination ? CONTEXT_SOURCES.EXPLICIT_INPUT : CONTEXT_SOURCES.DEFAULT,
        effectiveArrivalDeadline: arrivalDeadline,
        arrivalDeadlineSource: arrivalDeadline ? CONTEXT_SOURCES.EXPLICIT_INPUT : CONTEXT_SOURCES.NONE,
        effectiveDepartureTime: departureTime,
        departureTimeSource: options.desiredDepartureTime || options.departureTime ? CONTEXT_SOURCES.EXPLICIT_INPUT : CONTEXT_SOURCES.DEFAULT,
        effectiveRoutePreference: routePreference,
        routePreferenceSource: options.routePreference ? CONTEXT_SOURCES.EXPLICIT_INPUT : CONTEXT_SOURCES.DEFAULT,
        effectivePreferredModes: options.preferredModes || ['train', 'metro', 'bus', 'auto', 'walk'],
        effectiveAvoidModes: options.avoidModes || [],
        effectiveConstraints: {
          maxTransfers: options.constraints?.maxTransfers !== undefined ? options.constraints.maxTransfers : null,
          maxWalkingMinutes: options.constraints?.maxWalkingMinutes !== undefined ? options.constraints.maxWalkingMinutes : null,
          maxBudgetRupees: options.constraints?.maxBudgetRupees !== undefined ? options.constraints.maxBudgetRupees : null
        },
        scheduleConstraints: {
          mustArriveBefore: arrivalDeadline,
          recommendedBufferMinutes: 10,
          isExamDay: false,
          heavyWorkloadCaution: false,
          scheduleConflicts: [],
          influencingFactors: []
        }
      },
      privacyGuarantees: {
        coarseLocationOnly: true,
        noContinuousTracking: true,
        studentScoped: true
      }
    });
  }

  toJSON() {
    return {
      studentId: this.studentId,
      requestTimestamp: this.requestTimestamp,
      targetDate: this.targetDate,
      dayOfWeek: this.dayOfWeek,
      explicitInput: {
        origin: this.explicitInput.origin,
        destination: this.explicitInput.destination,
        desiredDepartureTime: this.explicitInput.desiredDepartureTime,
        desiredArrivalTime: this.explicitInput.desiredArrivalTime,
        preferredModes: this.explicitInput.preferredModes ? [...this.explicitInput.preferredModes] : null,
        avoidModes: this.explicitInput.avoidModes ? [...this.explicitInput.avoidModes] : null,
        routePreference: this.explicitInput.routePreference,
        constraints: this.explicitInput.constraints ? { ...this.explicitInput.constraints } : null
      },
      savedPreferences: {
        hasSavedPreferences: this.savedPreferences.hasSavedPreferences,
        preference: this.savedPreferences.preference,
        preferredModes: [...this.savedPreferences.preferredModes],
        avoidModes: [...this.savedPreferences.avoidModes],
        walkingToleranceMinutes: this.savedPreferences.walkingToleranceMinutes,
        maxBudgetRupees: this.savedPreferences.maxBudgetRupees,
        maxTransfers: this.savedPreferences.maxTransfers,
        defaultOriginArea: this.savedPreferences.defaultOriginArea,
        defaultDestinationCollege: this.savedPreferences.defaultDestinationCollege,
        defaultArrivalTime: this.savedPreferences.defaultArrivalTime
      },
      academicContext: {
        hasAcademicContext: this.academicContext.hasAcademicContext,
        scheduledEventsCount: this.academicContext.scheduledEventsCount,
        hasScheduledClass: this.academicContext.hasScheduledClass,
        isDestinationMatched: this.academicContext.isDestinationMatched,
        isExamDay: this.academicContext.isExamDay,
        recommendedBufferMinutes: this.academicContext.recommendedBufferMinutes,
        nextClass: this.academicContext.nextClass ? { ...this.academicContext.nextClass } : null,
        todayEvents: this.academicContext.todayEvents.map(e => ({ ...e })),
        recurringSchedule: this.academicContext.recurringSchedule ? { ...this.academicContext.recurringSchedule } : null,
        scheduleConflicts: this.academicContext.scheduleConflicts ? [...this.academicContext.scheduleConflicts] : [],
        influencingFactors: this.academicContext.influencingFactors ? [...this.academicContext.influencingFactors] : []
      },
      workloadContext: {
        hasWorkloadContext: this.workloadContext.hasWorkloadContext,
        isHeavyDay: this.workloadContext.isHeavyDay,
        loadLevel: this.workloadContext.loadLevel,
        totalCommitmentMinutes: this.workloadContext.totalCommitmentMinutes,
        assignmentsDueCount: this.workloadContext.assignmentsDueCount,
        hasConflicts: this.workloadContext.hasConflicts,
        conflictsCount: this.workloadContext.conflictsCount
      },
      resolvedPersonalization: {
        effectiveOrigin: this.resolvedPersonalization.effectiveOrigin,
        originSource: this.resolvedPersonalization.originSource,
        effectiveDestination: this.resolvedPersonalization.effectiveDestination,
        destinationSource: this.resolvedPersonalization.destinationSource,
        effectiveArrivalDeadline: this.resolvedPersonalization.effectiveArrivalDeadline,
        arrivalDeadlineSource: this.resolvedPersonalization.arrivalDeadlineSource,
        effectiveDepartureTime: this.resolvedPersonalization.effectiveDepartureTime,
        departureTimeSource: this.resolvedPersonalization.departureTimeSource,
        effectiveRoutePreference: this.resolvedPersonalization.effectiveRoutePreference,
        routePreferenceSource: this.resolvedPersonalization.routePreferenceSource,
        effectivePreferredModes: [...this.resolvedPersonalization.effectivePreferredModes],
        effectiveAvoidModes: [...this.resolvedPersonalization.effectiveAvoidModes],
        effectiveConstraints: { ...this.resolvedPersonalization.effectiveConstraints },
        scheduleConstraints: {
          ...this.resolvedPersonalization.scheduleConstraints,
          scheduleConflicts: this.resolvedPersonalization.scheduleConstraints?.scheduleConflicts ? [...this.resolvedPersonalization.scheduleConstraints.scheduleConflicts] : [],
          influencingFactors: this.resolvedPersonalization.scheduleConstraints?.influencingFactors ? [...this.resolvedPersonalization.scheduleConstraints.influencingFactors] : []
        }
      },
      privacyGuarantees: { ...this.privacyGuarantees }
    };
  }
}

module.exports = {
  ContextualCommutePersonalization,
  contextualCommutePersonalizationSchema,
  CONTEXT_SOURCES,
  contextSourceEnum,
  explicitInputSchema,
  savedPreferencesSchema,
  academicContextSchema,
  academicEventSummarySchema,
  recurringScheduleSummarySchema,
  scheduleConflictSchema,
  workloadContextSchema,
  scheduleConstraintsSchema,
  resolvedPersonalizationSchema,
  privacyGuaranteesSchema
};
