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
  updateReportSchema,
  reportFilterQuerySchema
} = require('./reportValidators');
const {
  submitFeedbackSchema,
  updateFeedbackSchema,
  feedbackFilterQuerySchema
} = require('./feedbackValidators');
const { planCommuteSchema } = require('./planValidators');
const { transitSearchQuerySchema } = require('./transitValidators');
const { registerSchema, loginSchema } = require('./authValidators');

module.exports = {
  validate,
  // Common
  idParamSchema,
  paginationQuerySchema,
  // Auth
  registerSchema,
  loginSchema,
  // Ride Groups
  createRideGroupSchema,
  updateRideGroupSchema,
  rideGroupFilterQuerySchema,
  // Disruption Reports
  createReportSchema,
  updateReportSchema,
  reportFilterQuerySchema,
  // Feedback
  submitFeedbackSchema,
  updateFeedbackSchema,
  feedbackFilterQuerySchema,
  // Commute Plan
  planCommuteSchema,
  // Transit
  transitSearchQuerySchema
};
