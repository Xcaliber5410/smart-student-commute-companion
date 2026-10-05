/**
 * Commute Domain Request & Response Validators
 *
 * Provides strongly-typed Zod schemas for the Smart Commute domain (P9).
 * Enforces area-level landmark validation, privacy-by-design safeguards,
 * constraint boundaries, and data provenance requirements.
 */

const { z } = require('zod');
const {
  transportModeEnum,
  routePreferenceEnum,
  disruptionTypeEnum,
  disruptionSeverityEnum,
  recommendationStatusEnum,
  provenanceTierEnum,
  TRANSPORT_MODES,
  ROUTE_PREFERENCES
} = require('../models/CommuteContracts');

const {
  CommuteArea,
  commuteAreaSchema,
  checkAreaGranularity,
  classifyAreaType,
  sanitizeAreaName,
  GRANULAR_ADDRESS_PATTERNS
} = require('../models/CommuteArea');

const {
  CommutePlanInputDTO,
  privacySafeCommuteInputSchema,
  FORBIDDEN_PRIVACY_FIELDS,
  findForbiddenPrivacyFields,
  strict24hTimeRegex
} = require('../models/CommutePlanInputDTO');

// Regex detecting granular street address patterns (backward compatible export)
const preciseAddressPattern = /\b(flat|room|apt|apartment|house|bldg|building|floor|block|plot|door)\s*#?\s*\d+/i;

/**
 * Validates multimodal commute plan requests.
 * Uses CommuteArea coarse validation and enforces absence of forbidden privacy-sensitive fields.
 */
const commutePlanRequestSchema = z.object({
  origin: commuteAreaSchema.optional(),
  startingArea: commuteAreaSchema.optional(),
  destination: commuteAreaSchema.optional(),
  collegeDestination: commuteAreaSchema.optional(),
  desiredArrivalTime: z.string().trim()
    .regex(strict24hTimeRegex, 'Desired arrival time must be in 24-hour HH:MM format (e.g. "09:00", "14:30")')
    .optional()
    .default('09:00'),
  desiredDepartureTime: z.string().trim()
    .regex(strict24hTimeRegex, 'Desired departure time must be in 24-hour HH:MM format')
    .optional(),
  preferredModes: z.array(transportModeEnum)
    .min(1, 'At least one transport mode must be selected')
    .optional()
    .default([
      TRANSPORT_MODES.TRAIN,
      TRANSPORT_MODES.METRO,
      TRANSPORT_MODES.BUS,
      TRANSPORT_MODES.AUTO,
      TRANSPORT_MODES.WALK
    ])
    .transform(modes => Array.from(new Set(modes))),
  preference: routePreferenceEnum.optional().default(ROUTE_PREFERENCES.BALANCED),
  walkingToleranceMinutes: z.coerce.number().int()
    .min(5, 'Walking tolerance must be at least 5 minutes')
    .max(60, 'Walking tolerance cannot exceed 60 minutes')
    .optional()
    .default(20),
  maxBudgetRupees: z.coerce.number()
    .min(0, 'Budget cannot be negative')
    .max(2000, 'Budget cannot exceed ₹2000')
    .optional()
    .default(100),
  maxTransfers: z.coerce.number().int()
    .min(0, 'Transfers cannot be negative')
    .max(5, 'Transfers cannot exceed 5')
    .optional()
    .default(3),
  allowSharedRides: z.boolean().optional().default(true),
  requireWheelchairAccess: z.boolean().optional().default(false),
  useSchedule: z.boolean().optional().default(false)
}).superRefine((data, ctx) => {
  const originVal = data.origin || data.startingArea;
  if (!originVal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['origin'],
      message: 'Origin area or landmark is required (e.g. "Borivali West", "Andheri Station")'
    });
  }

  const destVal = data.destination || data.collegeDestination;
  if (!destVal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destination'],
      message: 'Destination college or landmark is required (e.g. "D.J. Sanghvi College", "VJTI College")'
    });
  }

  if (originVal && destVal && originVal.toLowerCase() === destVal.toLowerCase()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destination'],
      message: 'Destination cannot be identical to origin'
    });
  }
});

/**
 * Filter query schema for searching active disruptions across corridors.
 */
const commuteDisruptionQuerySchema = z.object({
  mode: transportModeEnum.optional(),
  area: z.string().trim().max(100).optional(),
  type: disruptionTypeEnum.optional(),
  severity: disruptionSeverityEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

/**
 * Schema for submitting crowdsourced commute feedback.
 */
const commuteFeedbackInputSchema = z.object({
  routeId: z.string().trim().min(1, 'Route ID is required'),
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  punctualityScore: z.coerce.number().int().min(1).max(5).optional(),
  crowdLevel: z.enum(['low', 'moderate', 'packed', 'crush_load']).optional().default('moderate'),
  actualDurationMinutes: z.coerce.number().int().min(1).max(360).optional(),
  comment: z.string().trim().max(300).optional().default('')
});

/**
 * Schema for querying shared travel (Travel Together) ride matches.
 */
const sharedTravelQuerySchema = z.object({
  corridor: z.string().trim().max(100).optional(),
  meetingPoint: z.string().trim().max(100).optional(),
  mode: z.enum([TRANSPORT_MODES.AUTO, TRANSPORT_MODES.SHARED_AUTO, TRANSPORT_MODES.TRAIN]).optional(),
  departureWindow: z.string().trim().regex(strict24hTimeRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

module.exports = {
  // Input schemas & DTO
  commutePlanRequestSchema,
  privacySafeCommuteInputSchema,
  CommutePlanInputDTO,

  // Area & Privacy abstractions
  CommuteArea,
  commuteAreaSchema,
  checkAreaGranularity,
  classifyAreaType,
  sanitizeAreaName,
  GRANULAR_ADDRESS_PATTERNS,
  FORBIDDEN_PRIVACY_FIELDS,
  findForbiddenPrivacyFields,
  preciseAddressPattern,
  strict24hTimeRegex,

  // Query & Feedback schemas
  commuteDisruptionQuerySchema,
  commuteFeedbackInputSchema,
  sharedTravelQuerySchema
};
