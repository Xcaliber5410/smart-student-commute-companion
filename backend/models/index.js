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
const { Course, courseSchema } = require('./Course');
const {
  Assignment,
  assignmentSchema,
  assignmentStatusEnum,
  assignmentPriorityEnum
} = require('./Assignment');
const { CalendarEvent, calendarEventSchema, eventTypeEnum, eventStatusEnum } = require('./CalendarEvent');
const { StudySession, studySessionSchema, studySessionStatusEnum } = require('./StudySession');
const { Goal, goalSchema, goalStatusEnum } = require('./Goal');
const {
  StudentSearchResult,
  studentSearchResultSchema,
  searchResultTypeEnum,
  searchDomainEnum,
  studentRelationshipEnum
} = require('./StudentSearchResult');
const { StudyResource, studyResourceSchema, resourceTypeEnum } = require('./StudyResource');
const { StudyPlan, studyPlanSchema, studyPlanStatusEnum } = require('./StudyPlan');
const {
  StudyPlanItem,
  studyPlanItemSchema,
  studyPlanItemStatusEnum,
  studyPlanItemPriorityEnum
} = require('./StudyPlanItem');

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
  reminderSchema,
  Course,
  courseSchema,
  Assignment,
  assignmentSchema,
  assignmentStatusEnum,
  assignmentPriorityEnum,
  CalendarEvent,
  calendarEventSchema,
  eventTypeEnum,
  eventStatusEnum,
  StudySession,
  studySessionSchema,
  studySessionStatusEnum,
  Goal,
  goalSchema,
  goalStatusEnum,
  StudentSearchResult,
  studentSearchResultSchema,
  searchResultTypeEnum,
  searchDomainEnum,
  studentRelationshipEnum,
  StudyResource,
  studyResourceSchema,
  resourceTypeEnum,
  StudyPlan,
  studyPlanSchema,
  studyPlanStatusEnum,
  StudyPlanItem,
  studyPlanItemSchema,
  studyPlanItemStatusEnum,
  studyPlanItemPriorityEnum,

  // Commute Domain Contracts & Safe Input (P9)
  ...require('./CommuteContracts'),
  ...require('./CommuteArea'),
  ...require('./CommutePlanInputDTO'),
  ...require('./StudentCommutePreference'),
  ...require('./TransportService'),
  ...require('./TransportStop'),
  ...require('./TransportSchedule'),
  ...require('./TransportSegment'),
  ...require('./TransportConnection'),
  ...require('./TransportNetwork'),
  ...require('./CommuteDisruption'),
  ...require('./TransportTimetableOption'),
  ...require('./SegmentTravelEstimate'),
  ...require('./JourneySegment'),
  ...require('./CommuteJourney'),
  ...require('./JourneyDisruptionImpact'),
  ...require('./TrafficCondition'),
  ...require('./WeatherCondition'),
  ...require('./TransportAvailability'),
  ...require('./UnifiedJourneyImpact')
};




