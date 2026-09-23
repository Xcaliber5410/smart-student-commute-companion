/**
 * Centralized Validators & Validation Middleware Registry
 */

const { validate } = require('../middleware/validate');
const { idParamSchema, paginationQuerySchema } = require('./commonValidators');
const {
  createRideGroupSchema,
  updateRideGroupSchema,
  rideGroupFilterQuerySchema
} = require('./rideGroupValidators');
const {
  createReportSchema,
  reportFilterQuerySchema
} = require('./reportValidators');
const { submitFeedbackSchema } = require('./feedbackValidators');
const { planCommuteSchema } = require('./planValidators');
const { transitSearchQuerySchema } = require('./transitValidators');

module.exports = {
  validate,
  // Common
  idParamSchema,
  paginationQuerySchema,
  // Ride Groups
  createRideGroupSchema,
  updateRideGroupSchema,
  rideGroupFilterQuerySchema,
  // Disruption Reports
  createReportSchema,
  reportFilterQuerySchema,
  // Feedback
  submitFeedbackSchema,
  // Commute Plan
  planCommuteSchema,
  // Transit
  transitSearchQuerySchema
};
