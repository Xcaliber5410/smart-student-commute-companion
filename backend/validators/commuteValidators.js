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

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Regex detecting granular street address patterns (Flat/House/Apartment numbers)
// Enforces area-level landmark privacy requirement.
const preciseAddressPattern = /\b(flat|room|apt|apartment|house|bldg|building|floor|block|plot|door)\s*#?\s*\d+/i;

/**
 * Validates multimodal commute plan requests.
 * Accepts area/landmark origins and destinations, user preferences, and constraints.
 */
const commutePlanRequestSchema = z.object({
  origin: z.string().trim().min(2, 'Origin area/landmark is required').max(100)
    .refine(val => !preciseAddressPattern.test(val), {
      message: 'Origin must be a coarse area or landmark (e.g. "Borivali West", "Andheri Station"). Exact flat/house numbers are not permitted.'
    }),
  destination: z.string().trim().min(2, 'Destination college/landmark is required').max(100)
    .refine(val => !preciseAddressPattern.test(val), {
      message: 'Destination must be a college or landmark (e.g. "DJ Sanghvi College", "Vile Parle East"). Exact flat/house numbers are not permitted.'
    }),
  desiredArrivalTime: z.string().trim().regex(timeRegex, 'Desired arrival time must be in HH:MM format').optional().default('09:00'),
  desiredDepartureTime: z.string().trim().regex(timeRegex, 'Desired departure time must be in HH:MM format').optional(),
  preferredModes: z.array(transportModeEnum).min(1, 'At least one transport mode must be selected').optional().default([
    TRANSPORT_MODES.TRAIN,
    TRANSPORT_MODES.METRO,
    TRANSPORT_MODES.BUS,
    TRANSPORT_MODES.AUTO,
    TRANSPORT_MODES.WALK
  ]),
  preference: routePreferenceEnum.optional().default(ROUTE_PREFERENCES.BALANCED),
  walkingToleranceMinutes: z.coerce.number().int().min(5, 'Walking tolerance must be at least 5 minutes').max(60, 'Walking tolerance cannot exceed 60 minutes').optional().default(20),
  maxBudgetRupees: z.coerce.number().min(0, 'Budget cannot be negative').max(2000, 'Budget cannot exceed ₹2000').optional().default(100),
  maxTransfers: z.coerce.number().int().min(0, 'Transfers cannot be negative').max(5, 'Transfers cannot exceed 5').optional().default(3),
  allowSharedRides: z.boolean().optional().default(true),
  useSchedule: z.boolean().optional().default(false)
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
  departureWindow: z.string().trim().regex(timeRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

module.exports = {
  commutePlanRequestSchema,
  commuteDisruptionQuerySchema,
  commuteFeedbackInputSchema,
  sharedTravelQuerySchema,
  preciseAddressPattern
};
