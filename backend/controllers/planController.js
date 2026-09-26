const { z } = require('zod');
const { ValidationError } = require('../errors');
const { commutePlanService } = require('../services');

const planSchema = z.object({
  origin: z.string().min(2, 'Origin area is required'),
  destination: z.string().min(2, 'Destination college is required'),
  desiredArrivalTime: z.string().optional().default('09:00'),
  preferredModes: z.array(z.string()).optional().default(['train', 'metro', 'bus', 'auto', 'walk']),
  preference: z.enum(['balanced', 'fastest', 'cheapest', 'rain-safe']).optional().default('balanced'),
  walkingToleranceMinutes: z.number().min(5).max(60).optional().default(20),
  maxBudgetRupees: z.number().min(0).max(2000).optional().default(100)
});

/**
 * Commute planner controller
 * Thin HTTP adapter delegating business logic to commutePlanService.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function planCommute(req, res, next) {
  try {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Validation failed', parsed.error.format()));
    }

    const planResult = await commutePlanService.planCommute(parsed.data);
    return res.json(planResult);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  planCommute,
  planSchema
};
