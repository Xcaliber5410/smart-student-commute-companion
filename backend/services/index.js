/**
 * Centralized Services Export Registry
 *
 * Provides a single point of access to all business logic services across the backend.
 */

const { rideGroupService, RideGroupService } = require('./rideGroupService');
const { reportService, ReportService } = require('./reportService');
const { feedbackService, FeedbackService } = require('./feedbackService');
const { authService, AuthService } = require('./authService');
const { commutePlanService, CommutePlanService } = require('./commutePlanService');
const { transitService, TransitService } = require('./transitService');
const { studentContextService, StudentContextService } = require('./studentContextService');
const { studentScheduleService, StudentScheduleService } = require('./studentScheduleService');
const { savedRouteService, SavedRouteService } = require('./savedRouteService');
const { studentDashboardService, StudentDashboardService } = require('./studentDashboardService');
const { notificationService, NotificationService } = require('./notificationService');
const { reminderService, ReminderService } = require('./reminderService');
const { reminderScheduler, ReminderScheduler } = require('./reminderScheduler');
const { courseService, CourseService } = require('./courseService');
const { assignmentService, AssignmentService } = require('./assignmentService');
const { academicProgressService, AcademicProgressService } = require('./academicProgressService');
const { goalService, GoalService } = require('./goalService');
const { calendarEventService, CalendarEventService } = require('./calendarEventService');
const { studySessionService, StudySessionService } = require('./studySessionService');
const { calendarRangeService, CalendarRangeService } = require('./calendarRangeService');
const { workloadAnalysisService, WorkloadAnalysisService } = require('./workloadAnalysisService');
const { productivityAnalyticsService, ProductivityAnalyticsService } = require('./productivityAnalyticsService');
const { studentInsightsService, StudentInsightsService } = require('./studentInsightsService');
const { studentSearchService, StudentSearchService } = require('./studentSearchService');
const { searchAnalyticsService, SearchAnalyticsService } = require('./searchAnalyticsService');
const { studyResourceService, StudyResourceService } = require('./studyResourceService');
const { getActiveReports, calculateFreshnessWeight, evaluateRouteDisruptions } = require('./disruptionService');
const { geocodeArea, MUMBAI_KNOWN_LOCATIONS } = require('./geocodingService');
const { findTransitCandidates, getStopById } = require('./gtfsService');
const { calculateRoadRoute, calculateWalkingRoute } = require('./routingService');
const { scoreRouteCandidates, calculateCrowdPenalty } = require('./scoringService');
const { fetchMumbaiWeather } = require('./weatherService');
const { explainRoutePlan } = require('./aiPlannerService');
const searchRanker = require('./searchRanker');

module.exports = {
  // Domain Services
  studyResourceService,
  StudyResourceService,
  courseService,
  CourseService,
  assignmentService,
  AssignmentService,
  academicProgressService,
  AcademicProgressService,
  goalService,
  GoalService,
  calendarEventService,
  CalendarEventService,
  studySessionService,
  StudySessionService,
  calendarRangeService,
  CalendarRangeService,
  workloadAnalysisService,
  WorkloadAnalysisService,
  productivityAnalyticsService,
  ProductivityAnalyticsService,
  studentInsightsService,
  StudentInsightsService,
  studentSearchService,
  StudentSearchService,
  searchAnalyticsService,
  SearchAnalyticsService,
  rideGroupService,
  RideGroupService,
  reportService,
  ReportService,
  feedbackService,
  FeedbackService,
  authService,
  AuthService,
  commutePlanService,
  CommutePlanService,
  transitService,
  TransitService,
  studentContextService,
  StudentContextService,
  studentScheduleService,
  StudentScheduleService,
  savedRouteService,
  SavedRouteService,
  studentDashboardService,
  StudentDashboardService,
  notificationService,
  NotificationService,
  reminderService,
  ReminderService,
  reminderScheduler,
  ReminderScheduler,

  // Commute Planning & Spatial Services
  getActiveReports,
  calculateFreshnessWeight,
  evaluateRouteDisruptions,
  geocodeArea,
  MUMBAI_KNOWN_LOCATIONS,
  findTransitCandidates,
  getStopById,
  calculateRoadRoute,
  calculateWalkingRoute,
  scoreRouteCandidates,
  calculateCrowdPenalty,
  fetchMumbaiWeather,
  explainRoutePlan,
  searchRanker
};
