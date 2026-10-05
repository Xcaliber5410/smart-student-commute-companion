const { ValidationError } = require('../errors');
const { commutePlanService } = require('../services');
const {
  CommutePlanInputDTO,
  findForbiddenPrivacyFields
} = require('../models');
const { commutePlanRequestSchema } = require('../validators');

const planSchema = commutePlanRequestSchema;

/**
 * Commute planner controller
 * Validates privacy-safe commute inputs, converts to CommutePlanInputDTO,
 * and delegates ephemeral calculation to commutePlanService.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function planCommute(req, res, next) {
  try {
    // 1. Strict check for forbidden privacy/tracking fields
    const forbidden = findForbiddenPrivacyFields(req.body);
    if (forbidden.length > 0) {
      return next(new ValidationError('Validation failed', {
        privacy: {
          _errors: [`Privacy violation: Prohibited field(s) detected: ${forbidden.join(', ')}. Commute Companion does not accept precise location history, GPS tracking, or home addresses.`]
        }
      }));
    }

    // 2. Validate input and construct DTO
    let dto;
    try {
      dto = CommutePlanInputDTO.fromRequest(req.body);
    } catch (err) {
      if (err.name === 'ZodError') {
        return next(new ValidationError('Validation failed', err.format()));
      }
      if (err.code === 'PRIVACY_VIOLATION') {
        return next(new ValidationError('Validation failed', {
          privacy: { _errors: [err.message] }
        }));
      }
      throw err;
    }

    // 3. Delegate ephemeral routing parameters (no coordinates or history persisted)
    const planResult = await commutePlanService.planCommute(dto.toEphemeralRoutingParams());
    return res.json(planResult);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  planCommute,
  planSchema
};
