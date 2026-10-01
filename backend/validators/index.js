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
const {
  studentProfileUpdateSchema,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleFilterSchema,
  createSavedRouteSchema,
  updateSavedRouteSchema,
  savedRouteFilterSchema,
  studentGroupFilterSchema
} = require('./studentValidators');
const {
  notificationFilterSchema,
  bulkReadNotificationSchema,
  createReminderSchema,
  updateReminderSchema,
  reminderFilterSchema
} = require('./notificationValidators');
const {
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
  assignmentFilterSchema
} = require('./academicValidators');
const {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventFilterSchema
} = require('./calendarValidators');
const {
  createStudySessionSchema,
  updateStudySessionSchema,
  updateStudySessionStatusSchema,
  studySessionFilterSchema
} = require('./studySessionValidators');
const {
  createGoalSchema,
  updateGoalSchema,
  updateGoalProgressSchema,
  goalFilterSchema,
  goalStatusEnum
} = require('./goalValidators');

module.exports = {
  validate,
  // Study Sessions
  createStudySessionSchema,
  updateStudySessionSchema,
  updateStudySessionStatusSchema,
  studySessionFilterSchema,
  // Calendar Events
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventFilterSchema,
  // Academic Courses & Assignments
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
  assignmentFilterSchema,
  // Common
  idParamSchema,
  paginationQuerySchema,
  // Auth
  registerSchema,
  loginSchema,
  // Student Context & Workflows
  studentProfileUpdateSchema,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleFilterSchema,
  createSavedRouteSchema,
  updateSavedRouteSchema,
  savedRouteFilterSchema,
  studentGroupFilterSchema,
  // Notifications & Reminders
  notificationFilterSchema,
  bulkReadNotificationSchema,
  createReminderSchema,
  updateReminderSchema,
  reminderFilterSchema,
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
  transitSearchQuerySchema,
  // Goals
  createGoalSchema,
  updateGoalSchema,
  updateGoalProgressSchema,
  goalFilterSchema,
  goalStatusEnum
};

