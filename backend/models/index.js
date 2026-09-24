/**
 * Centralized Domain Models Index
 *
 * Exports all foundational domain data models for the Smart Student Commute Companion.
 */

const { LiveReport, liveReportSchema } = require('./LiveReport');
const { ReportConfirmation, reportConfirmationSchema } = require('./ReportConfirmation');
const { RideGroup, rideGroupSchema } = require('./RideGroup');
const { Feedback, feedbackSchema } = require('./Feedback');
const { GeocodingCache, geocodingCacheSchema } = require('./GeocodingCache');
const { User, userSchema } = require('./User');

module.exports = {
  LiveReport,
  liveReportSchema,
  ReportConfirmation,
  reportConfirmationSchema,
  RideGroup,
  rideGroupSchema,
  Feedback,
  feedbackSchema,
  GeocodingCache,
  geocodingCacheSchema,
  User,
  userSchema
};

