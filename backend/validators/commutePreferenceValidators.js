/**
 * Student Commute Preference Validators
 *
 * Enforces schema constraints and privacy boundaries for student commute preferences (P9).
 * Guarantees that:
 * 1. Only supported transit modes are accepted
 * 2. Numeric constraints (budget, walking tolerance, transfers) are strictly bounded
 * 3. Default origin and college areas adhere to coarse-level abstractions
 * 4. Granular residential addresses and GPS telemetry are rejected immediately
 */

const { z } = require('zod');
const { transportModeEnum } = require('../models/CommuteContracts');
const { checkAreaGranularity, sanitizeAreaName } = require('../models/CommuteArea');
const { studentRoutePreferenceEnum } = require('../models/StudentCommutePreference');

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Forbidden tracking and address keys
const FORBIDDEN_PRIVACY_KEYS = [
  'home_address',
  'residential_address',
  'flat_no',
  'room_no',
  'house_no',
  'building_name',
  'society_name',
  'gps_coordinates',
  'coordinates',
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
  'live_location',
  'continuous_tracking',
  'location_history',
  'device_id',
  'imei'
];

/**
 * Validates coarse area without residential precision.
 */
const privacyCoarseAreaValidator = z.string().trim().max(150)
  .superRefine((val, ctx) => {
    if (!val) return;
    const check = checkAreaGranularity(val);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.reason
      });
    }
  })
  .transform(val => (val ? sanitizeAreaName(val) : ''));

/**
 * Zod schema for updating student commute preferences.
 */
const updateCommutePreferencesSchema = z.object({
  preferred_modes: z.array(transportModeEnum)
    .min(1, 'At least one preferred transport mode must be selected')
    .optional(),
  walking_tolerance_minutes: z.coerce.number().int()
    .min(5, 'Walking tolerance must be between 5 and 60 minutes')
    .max(60, 'Walking tolerance must be between 5 and 60 minutes')
    .optional(),
  max_transfers: z.coerce.number().int()
    .min(0, 'Maximum transfers must be between 0 and 5')
    .max(5, 'Maximum transfers must be between 0 and 5')
    .optional(),
  max_budget_rupees: z.coerce.number()
    .min(0, 'Budget cannot be negative')
    .max(2000, 'Budget cannot exceed ₹2000')
    .optional(),
  route_preference: studentRoutePreferenceEnum.optional(),
  default_arrival_time: z.string().trim().regex(timeRegex, 'Default arrival time must be in HH:MM format (24-hour)').optional(),
  allow_shared_rides: z.boolean().optional(),
  require_wheelchair_access: z.boolean().optional(),
  default_origin_area: privacyCoarseAreaValidator.optional(),
  default_destination_college: privacyCoarseAreaValidator.optional()
}).superRefine((data, ctx) => {
  // Reject forbidden tracking / address keys passed in body
  for (const forbidden of FORBIDDEN_PRIVACY_KEYS) {
    if (data && data[forbidden] !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [forbidden],
        message: `Privacy Boundary Violation: Submitting '${forbidden}' is forbidden. Commute preferences only accept coarse area landmarks.`
      });
    }
  }
});

/**
 * Validates preference update data, asserting both schema rules and privacy boundaries.
 * @param {object} input
 * @returns {object} Validated data
 */
function validateCommutePreferences(input) {
  // Check for forbidden keys before parsing
  if (input && typeof input === 'object') {
    for (const forbidden of FORBIDDEN_PRIVACY_KEYS) {
      if (input[forbidden] !== undefined && input[forbidden] !== null && input[forbidden] !== '') {
        const error = new Error(`Privacy Boundary Violation: Field '${forbidden}' is forbidden to protect student privacy.`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  return updateCommutePreferencesSchema.parse(input);
}

module.exports = {
  updateCommutePreferencesSchema,
  validateCommutePreferences,
  FORBIDDEN_PRIVACY_KEYS
};
