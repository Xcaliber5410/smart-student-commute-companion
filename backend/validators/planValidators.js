/**
 * Commute Plan Request Validation Schemas
 */

const { z } = require('zod');

const planCommuteSchema = z.object({
  origin: z.string().trim().min(2, 'Origin area is required').max(100),
  destination: z.string().trim().min(2, 'Destination college is required').max(100),
  desiredArrivalTime: z.string().trim().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Desired arrival time must be in HH:MM format').optional().default('09:00'),
  preferredModes: z.array(z.string().trim()).optional().default(['train', 'metro', 'bus', 'auto', 'walk']),
  preference: z.enum(['balanced', 'fastest', 'cheapest', 'rain-safe']).optional().default('balanced'),
  walkingToleranceMinutes: z.coerce.number().int().min(5, 'Walking tolerance must be at least 5 minutes').max(60, 'Walking tolerance cannot exceed 60 minutes').optional().default(20),
  maxBudgetRupees: z.coerce.number().min(0, 'Budget cannot be negative').max(2000, 'Budget cannot exceed ₹2000').optional().default(100)
});

module.exports = {
  planCommuteSchema
};
