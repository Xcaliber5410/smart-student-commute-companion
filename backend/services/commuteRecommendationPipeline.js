/**
 * CommuteRecommendationPipeline
 *
 * Core Orchestrator for the Smart Student Commute Recommendation Flow:
 *
 *   Commute Request
 *         ↓
 *   Context Collection (commuteContextService)
 *         ↓
 *   Transport Data (transportDataService)
 *         ↓
 *   Disruption Data (disruptionDataService & disruptionImpactService)
 *         ↓
 *   Candidate Routes (candidateRouteService)
 *         ↓
 *   Constraint Filtering (constraintFilterService)
 *         ↓
 *   Route Scoring (routeScoringService)
 *         ↓
 *   Personalized Recommendation (commutePersonalizationService)
 *         ↓
 *   Explanation (commuteExplanationService)
 *         ↓
 *   CommuteRecommendation Domain Entity
 *
 * Architecture Principles:
 * - 100% dependency-injected services: zero direct database or raw SQL in the orchestrator
 * - No circular dependencies: services have unilateral relationships
 * - Independently testable stages with mock/controlled fixtures
 * - Zero speculative AI: strictly grounded deterministic rules and contracts
 * - 4-tier provenance tracking (VERIFIED, USER_REPORTED, ESTIMATED, SYNTHETIC)
 */

const {
  CommutePlanInputDTO,
  CommuteRecommendation,
  DataProvenance
} = require('../models');

const { commuteContextService } = require('./commuteContextService');
const { transportDataService } = require('./transportDataService');
const { disruptionDataService } = require('./disruptionDataService');
const { disruptionImpactService } = require('./disruptionImpactService');
const { candidateRouteService } = require('./candidateRouteService');
const { constraintFilterService } = require('./constraintFilterService');
const { routeScoringService } = require('./routeScoringService');
const { commutePersonalizationService } = require('./commutePersonalizationService');
const { commuteExplanationService } = require('./commuteExplanationService');

class CommuteRecommendationPipeline {
  /**
   * @param {object} [options={}]
   * @param {object} [options.contextService]
   * @param {object} [options.transportDataService]
   * @param {object} [options.disruptionDataService]
   * @param {object} [options.disruptionImpactService]
   * @param {object} [options.candidateRouteService]
   * @param {object} [options.constraintFilterService]
   * @param {object} [options.routeScoringService]
   * @param {object} [options.personalizationService]
   * @param {object} [options.explanationService]
   */
  constructor(options = {}) {
    this.contextService = options.contextService || commuteContextService;
    this.transportDataService = options.transportDataService || transportDataService;
    this.disruptionDataService = options.disruptionDataService || disruptionDataService;
    this.disruptionImpactService = options.disruptionImpactService || disruptionImpactService;
    this.candidateRouteService = options.candidateRouteService || candidateRouteService;
    this.constraintFilterService = options.constraintFilterService || constraintFilterService;
    this.routeScoringService = options.routeScoringService || routeScoringService;
    this.personalizationService = options.personalizationService || commutePersonalizationService;
    this.explanationService = options.explanationService || commuteExplanationService;
  }

  /**
   * Executes the full commute recommendation pipeline.
   *
   * @param {CommutePlanInputDTO|object} commuteRequest - Validated DTO or raw request payload
   * @param {object} [options={}] - Execution options, test overrides, or custom routes
   * @returns {Promise<CommuteRecommendation>} Fully populated and validated recommendation entity
   */
  async execute(commuteRequest, options = {}) {
    // Stage 0: Request Validation & DTO Normalization
    const planInput = commuteRequest instanceof CommutePlanInputDTO
      ? commuteRequest
      : CommutePlanInputDTO.fromRequest(commuteRequest);

    // Stage 1: Context Collection (Time, Student Profile hints, Weather)
    const context = await this.contextService.collectContext(planInput, options);

    const originName = (planInput.originArea && planInput.originArea.name) ||
      (planInput.startingArea && planInput.startingArea.name) ||
      String(planInput.startingArea || '');
    const destinationName = (planInput.destinationArea && planInput.destinationArea.name) ||
      (planInput.collegeDestination && planInput.collegeDestination.name) ||
      String(planInput.collegeDestination || '');
    let transportData = null;

    if (this.transportDataService && typeof this.transportDataService.findCorridorServices === 'function') {
      try {
        transportData = await this.transportDataService.findCorridorServices(originName, destinationName);
      } catch (err) {
        transportData = { services: [], stops: [], schedules: [] };
      }
    }

    // Stage 3: Disruption Data & Impact Assessment
    let corridorDisruptions = [];
    if (this.disruptionDataService && typeof this.disruptionDataService.findActiveCorridorDisruptions === 'function') {
      try {
        corridorDisruptions = await this.disruptionDataService.findActiveCorridorDisruptions(originName, destinationName);
      } catch (err) {
        corridorDisruptions = [];
      }
    }

    const disruptionsConsidered = this.disruptionImpactService.assessDisruptions({
      corridorDisruptions
    });

    // Stage 4: Candidate Routes Generation
    const candidateRoutes = await this.candidateRouteService.generateCandidates({
      context,
      transportData,
      options
    });

    // Stage 5: Constraint Filtering (Budget, Walking limit, Modes, Transfers)
    const filterResult = this.constraintFilterService.filterRoutes(
      candidateRoutes,
      planInput.constraints
    );

    // Stage 6: Route Scoring (Multi-criteria evaluation & disruption/weather penalties)
    const scoredRoutes = this.routeScoringService.scoreRoutes({
      routes: filterResult.viableRoutes,
      constraints: planInput.constraints,
      disruptions: disruptionsConsidered,
      weatherContext: context.weatherContext
    });

    // Stage 7: Personalized Recommendation & Departure Window Calculation
    const personalization = this.personalizationService.personalize({
      scoredRoutes,
      desiredArrivalTime: planInput.desiredArrivalTime,
      preference: planInput.constraints.preference,
      context
    });

    // Stage 8: Explanation Generation (Deterministic zero-hallucination explanation)
    const explanation = this.explanationService.generateExplanation({
      recommendedRoute: personalization.recommendedRoute,
      alternatives: personalization.alternatives,
      constraints: planInput.constraints,
      disruptions: disruptionsConsidered,
      weatherContext: context.weatherContext,
      status: personalization.status,
      filterSummary: filterResult.summary
    });

    // Stage 9: Assembly of Domain Recommendation Entity
    const recommendationId = options.recommendationId || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    return new CommuteRecommendation({
      id: recommendationId,
      requestId: context.requestId,
      status: personalization.status,
      recommendedRoute: personalization.recommendedRoute ? personalization.recommendedRoute.toJSON() : null,
      alternatives: personalization.alternatives.map(alt => alt.toJSON()),
      departureWindows: personalization.departureWindows.toJSON(),
      explanation: explanation.toJSON(),
      disruptionsConsidered,
      weatherContext: context.weatherContext,
      generatedAt: Date.now(),
      provenance: DataProvenance.synthetic('CommuteRecommendationPipeline').toJSON()
    });
  }
}

const commuteRecommendationPipeline = new CommuteRecommendationPipeline();

module.exports = {
  CommuteRecommendationPipeline,
  commuteRecommendationPipeline
};
