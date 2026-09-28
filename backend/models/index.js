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
const { StudentProfile, studentProfileSchema } = require('./StudentProfile');
const { StudentSchedule, studentScheduleSchema } = require('./StudentSchedule');
const { SavedRoute, savedRouteSchema } = require('./SavedRoute');
const { RideGroupMember, rideGroupMemberSchema } = require('./RideGroupMember');
const { Notification, notificationSchema } = require('./Notification');
const { Reminder, reminderSchema } = require('./Reminder');

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
  userSchema,
  StudentProfile,
  studentProfileSchema,
  StudentSchedule,
  studentScheduleSchema,
  SavedRoute,
  savedRouteSchema,
  RideGroupMember,
  rideGroupMemberSchema,
  Notification,
  notificationSchema,
  Reminder,
  reminderSchema
};

