/**
 * Commute Plan Request Validation Schemas
 *
 * Enforces privacy-safe area-level landmarks, strict transport modes,
 * 24-hour arrival times, and boundary constraints.
 */

const { z } = require('zod');
const { commuteAreaSchema } = require('../models/CommuteArea');
const { findForbiddenPrivacyFields } = require('../models/CommutePlanInputDTO');
const { transportModeEnum, routePreferenceEnum } = require('../models/CommuteContracts');

const planCommuteSchema = z.object({
  origin: commuteAreaSchema,
  destination: commuteAreaSchema,
  desiredArrivalTime: z.string().trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Desired arrival time must be in 24-hour HH:MM format')
    .optional()
    .default('09:00'),
  desiredDepartureTime: z.string().trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Desired departure time must be in 24-hour HH:MM format')
    .optional(),
  preferredModes: z.array(transportModeEnum)
    .min(1, 'At least one transport mode must be selected')
    .optional()
    .default(['train', 'metro', 'bus', 'auto', 'walk'])
    .transform(modes => Array.from(new Set(modes))),
  preference: routePreferenceEnum.optional().default('balanced'),
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
  useSchedule: z.boolean().optional().default(false)
}).superRefine((data, ctx) => {
  const forbidden = findForbiddenPrivacyFields(data);
  if (forbidden.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Privacy violation: Prohibited field(s) detected: ${forbidden.join(', ')}. Commute planning does not store or process precise location history, GPS tracking, or home addresses.`
    });
  }

  if (data.origin && data.destination && data.origin.toLowerCase() === data.destination.toLowerCase()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destination'],
      message: 'Destination cannot be identical to origin'
    });
  }
});

module.exports = {
  planCommuteSchema
};
