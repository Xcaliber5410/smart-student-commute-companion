/**
 * Centralized Services Export Registry
 *
 * Provides a single point of access to all business logic services across the backend.
 */

const { rideGroupService, RideGroupService } = require('./rideGroupService');
const { reportService, ReportService } = require('./reportService');
const { feedbackService, FeedbackService } = require('./feedbackService');
const { getActiveReports, calculateFreshnessWeight, evaluateRouteDisruptions } = require('./disruptionService');
const { geocodeArea, MUMBAI_KNOWN_LOCATIONS } = require('./geocodingService');
const { findTransitCandidates, getStopById } = require('./gtfsService');
const { calculateRoadRoute, calculateWalkingRoute } = require('./routingService');
const { scoreRouteCandidates, calculateCrowdPenalty } = require('./scoringService');
const { fetchMumbaiWeather } = require('./weatherService');
const { explainRoutePlan } = require('./aiPlannerService');

module.exports = {
  // Day 3 Reusable Entity Services
  rideGroupService,
  RideGroupService,
  reportService,
  ReportService,
  feedbackService,
  FeedbackService,

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
  explainRoutePlan
};
