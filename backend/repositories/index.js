/**
 * Centralized Repositories Index
 *
 * Exports repository instances and classes for the Smart Student Commute Companion.
 */

const { RideGroupRepository, rideGroupRepository } = require('./RideGroupRepository');
const { ReportRepository, reportRepository } = require('./ReportRepository');
const { FeedbackRepository, feedbackRepository } = require('./FeedbackRepository');
const { GeocodingRepository, geocodingRepository } = require('./GeocodingRepository');
const { UserRepository, userRepository } = require('./UserRepository');

module.exports = {
  RideGroupRepository,
  rideGroupRepository,
  ReportRepository,
  reportRepository,
  FeedbackRepository,
  feedbackRepository,
  GeocodingRepository,
  geocodingRepository,
  UserRepository,
  userRepository
};

