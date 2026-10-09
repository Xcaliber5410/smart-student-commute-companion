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
const { resourceContextService, ResourceContextService } = require('./resourceContextService');
const { studyPlanningService, StudyPlanningService } = require('./studyPlanningService');
const { transportDataService, TransportDataService } = require('./transportDataService');
const { disruptionDataService, DisruptionDataService } = require('./disruptionDataService');
const { commuteContextService, CommuteContextService } = require('./commuteContextService');
const {
  disruptionImpactService,
  DisruptionImpactService,
  DISRUPTION_CATEGORIES,
  IMPACT_SCOPES,
  FEASIBILITY_REASONS
} = require('./disruptionImpactService');
const { candidateRouteService, CandidateRouteService } = require('./candidateRouteService');
const { constraintFilterService, ConstraintFilterService } = require('./constraintFilterService');
const { routeScoringService, RouteScoringService } = require('./routeScoringService');
const { commutePersonalizationService, CommutePersonalizationService } = require('./commutePersonalizationService');
const { commuteExplanationService, CommuteExplanationService } = require('./commuteExplanationService');
const { commuteRecommendationPipeline, CommuteRecommendationPipeline } = require('./commuteRecommendationPipeline');
const { getActiveReports, calculateFreshnessWeight, evaluateRouteDisruptions } = require('./disruptionService');
const { geocodeArea, MUMBAI_KNOWN_LOCATIONS } = require('./geocodingService');
const { findTransitCandidates, getStopById } = require('./gtfsService');
const { calculateRoadRoute, calculateWalkingRoute } = require('./routingService');
const { scoreRouteCandidates, calculateCrowdPenalty } = require('./scoringService');
const { fetchMumbaiWeather } = require('./weatherService');
const { explainRoutePlan } = require('./aiPlannerService');
const searchRanker = require('./searchRanker');
const { studentCommutePreferenceService, StudentCommutePreferenceService } = require('./studentCommutePreferenceService');
const { trafficService, TrafficService } = require('./trafficService');
const { weatherContextService, WeatherContextService } = require('./weatherContextService');
const { transportAvailabilityService, TransportAvailabilityService } = require('./transportAvailabilityService');
const { transportNetworkService, TransportNetworkService } = require('./transportNetworkService');
const {
  transportScheduleService,
  TransportScheduleService,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_HEADWAYS
} = require('./transportScheduleService');
const { journeyBuilderService, JourneyBuilderService } = require('./journeyBuilderService');
const {
  candidateRouteEngine,
  CandidateRouteEngine,
  KNOWN_CAMPUS_DISTANCES
} = require('./candidateRouteEngine');
const { commuteContextEngine, CommuteContextEngine } = require('./commuteContextEngine');
const { routeEvaluationService, RouteEvaluationService } = require('./routeEvaluationService');
const {
  deterministicRouteScoringService,
  DeterministicRouteScoringService,
  SCORING_RATES,
  PREFERENCE_PROFILES,
  DEFAULT_PREFERENCES,
  HARD_CONSTRAINT_REASONS
} = require('./deterministicRouteScoringService');
const {
  alternateRouteService,
  AlternateRouteService,
  ALTERNATE_STRATEGY_TYPES
} = require('./alternateRouteService');
const {
  routeComparisonService,
  RouteComparisonService,
  DEFAULT_THRESHOLDS
} = require('./routeComparisonService');
const {
  routeConstraintFilteringService,
  RouteConstraintFilteringService,
  CONSTRAINT_TYPES,
  HARD_CONSTRAINT_REASON_CODES,
  SOFT_PREFERENCE_CODES
} = require('./routeConstraintFilteringService');
const {
  personalizedRouteRecommendationService,
  PersonalizedRouteRecommendationService
} = require('./personalizedRouteRecommendationService');
const {
  recommendationExplanationService,
  RecommendationExplanationService
} = require('./recommendationExplanationService');
const {
  departureAdviceService,
  DepartureAdviceService
} = require('./departureAdviceService');

module.exports = {
  // Disruption-Aware Departure Advice Engine (P9)
  departureAdviceService,
  DepartureAdviceService,
  // Recommendation Explanation Layer (P9)
  recommendationExplanationService,
  RecommendationExplanationService,
  // Personalized Route Recommendation Engine (P9)
  personalizedRouteRecommendationService,
  PersonalizedRouteRecommendationService,
  // Route Comparison Service (P9)
  routeComparisonService,
  RouteComparisonService,
  DEFAULT_THRESHOLDS,
  // Route Constraint Filtering Stage (P9)
  routeConstraintFilteringService,
  RouteConstraintFilteringService,
  CONSTRAINT_TYPES,
  HARD_CONSTRAINT_REASON_CODES,
  SOFT_PREFERENCE_CODES,
  // Alternate Route Generation Engine (P9)
  alternateRouteService,
  AlternateRouteService,
  ALTERNATE_STRATEGY_TYPES,
  // Deterministic Route Scoring Engine (P9)
  deterministicRouteScoringService,
  DeterministicRouteScoringService,
  SCORING_RATES,
  PREFERENCE_PROFILES,
  DEFAULT_PREFERENCES,
  HARD_CONSTRAINT_REASONS,
  // Route Evaluation Model & Service (P9)
  routeEvaluationService,
  RouteEvaluationService,
  // Unified Commute Context Engine (P9)
  commuteContextEngine,
  CommuteContextEngine,
  // Candidate Route Generation Engine (P9)
  candidateRouteEngine,
  CandidateRouteEngine,
  KNOWN_CAMPUS_DISTANCES,
  // Candidate Journey Representation & Builder (P9)
  journeyBuilderService,
  JourneyBuilderService,
  // Transport Schedules & Travel-Time Estimates (P9)
  transportScheduleService,
  TransportScheduleService,
  DEFAULT_OPERATING_HOURS,
  DEFAULT_HEADWAYS,
  // Transport Network Representation (P9)
  transportNetworkService,
  TransportNetworkService,
  // Student Commute Preferences (P9)
  studentCommutePreferenceService,
  StudentCommutePreferenceService,
  // Traffic Condition Intelligence (P9)
  trafficService,
  TrafficService,
  // Weather Context Intelligence (P9)
  weatherContextService,
  WeatherContextService,
  // Transport Availability Intelligence (P9)
  transportAvailabilityService,
  TransportAvailabilityService,
  // Commute Recommendation Pipeline Services (P9)
  commuteRecommendationPipeline,
  CommuteRecommendationPipeline,
  commuteContextService,
  CommuteContextService,
  disruptionImpactService,
  DisruptionImpactService,
  DISRUPTION_CATEGORIES,
  IMPACT_SCOPES,
  FEASIBILITY_REASONS,
  candidateRouteService,
  CandidateRouteService,
  constraintFilterService,
  ConstraintFilterService,
  routeScoringService,
  RouteScoringService,
  commutePersonalizationService,
  CommutePersonalizationService,
  commuteExplanationService,
  CommuteExplanationService,

  // Domain Services
  transportDataService,
  TransportDataService,
  disruptionDataService,
  DisruptionDataService,
  studyPlanningService,
  StudyPlanningService,
  studyResourceService,
  StudyResourceService,
  resourceContextService,
  ResourceContextService,
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
