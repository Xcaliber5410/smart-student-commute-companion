/**
 * Commute Recommendation Controller
 *
 * Exposes authenticated endpoints for personalized student commute recommendations (P9).
 * Consumes the PersonalizedRouteRecommendationService, integrating:
 * - Candidate journey generation & constraint filtering
 * - Environmental context & active corridor disruptions
 * - Student commute preferences and hard schedule deadlines
 * - Disruption-aware departure advice & multi-dimensional explanations
 * - Provenance tracking with synthetic tier preservation
 * - Transparent fallback when no feasible route exists
 */

const {
  personalizedRouteRecommendationService,
  studentCommutePreferenceService,
  commuteContextService,
  contextualPersonalizationService
} = require('../services');
const { success } = require('../utils/apiResponse');
const { ValidationError } = require('../errors');
const { findForbiddenPrivacyFields } = require('../models/CommutePlanInputDTO');

/**
 * Generates personalized commute recommendations for an authenticated student.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getPersonalizedRecommendation(req, res, next) {
  try {
    // 1. Strict privacy-by-design check
    const forbidden = findForbiddenPrivacyFields(req.body);
    if (forbidden.length > 0) {
      throw new ValidationError(
        `Privacy violation: Forbidden field(s) detected: ${forbidden.join(', ')}. Precise coordinates and residential addresses are prohibited.`
      );
    }

    // 2. Student scope - strictly authenticated student's identity (no cross-student data leakage)
    const studentId = req.user.id;

    // 3. Collect comprehensive student context (preferences, academic schedule, calendar events, workload)
    const studentContext = await contextualPersonalizationService.collectStudentContext(
      req.body,
      req.user,
      { currentTime: req.body.currentTime }
    );

    const resolved = studentContext.resolvedPersonalization;

    // 4. Resolve starting area (request body overrides profile defaults)
    const rawOrigin = resolved.effectiveOrigin;
    if (!rawOrigin || typeof rawOrigin !== 'string' || rawOrigin.trim().length === 0) {
      throw new ValidationError(
        'Origin area or landmark is required (e.g. "Borivali West", "Andheri Station"). Please specify in request or configure profile default.'
      );
    }
    const origin = rawOrigin.trim();

    // 5. Resolve destination
    const destination = resolved.effectiveDestination || 'D.J. Sanghvi College of Engineering';

    // 6. Resolve timing
    const departureTime = resolved.effectiveDepartureTime || '08:00';
    const targetArrivalTime = resolved.effectiveArrivalDeadline || null;

    // 7. Merge constraints & preferences
    const constraints = { ...resolved.effectiveConstraints };
    const preferences = {
      allowedModes: req.body.allowedModes || null,
      avoidModes: resolved.effectiveAvoidModes,
      preferredModes: resolved.effectivePreferredModes,
      routePreference: resolved.effectiveRoutePreference
    };

    const date = req.body.date || 'Mon';
    const dayOfWeek = req.body.dayOfWeek || 'Mon';

    // 8. Collect Unified Commute Context (environmental & disruption data)
    let context = req.body.context || null;
    if (!context) {
      try {
        context = await commuteContextService.collectContext({
          currentTime: req.body.currentTime || Date.now(),
          date,
          dayOfWeek,
          departureTime,
          disruptions: req.body.disruptions,
          trafficConditions: req.body.trafficConditions,
          weatherContext: req.body.weatherContext,
          availabilityContext: req.body.availabilityContext
        });
      } catch (ctxErr) {
        context = {
          currentTime: Date.now(),
          disruptions: req.body.disruptions || [],
          trafficConditions: req.body.trafficConditions || [],
          weatherContext: req.body.weatherContext || { condition: 'clear', totalAddedTravelTimeMinutes: 0 },
          availability: req.body.availabilityContext ? { dominantStatus: req.body.availabilityContext } : { dominantStatus: 'AVAILABLE', isUsable: true }
        };
      }
    }

    // 8. Attach studentContext to Unified Commute Context
    context.studentContext = studentContext ? studentContext.toJSON() : null;
    context.academicContext = studentContext?.academicContext || null;
    context.workloadContext = studentContext?.workloadContext || null;

    // 9. Execute recommendation engine pipeline
    const recommendation = await personalizedRouteRecommendationService.getRecommendation({
      studentId,
      origin,
      destination,
      departureTime,
      desiredDepartureTime: departureTime,
      targetArrivalTime,
      desiredArrivalTime: targetArrivalTime,
      constraints,
      preferences,
      context,
      candidates: req.body.candidates || req.body.candidateRoutes || null,
      evaluations: req.body.evaluations || null
    }, {
      studentId,
      origin,
      destination,
      departureTime,
      targetArrivalTime,
      date,
      dayOfWeek,
      currentTime: req.body.currentTime || context?.currentTime
    });

    const recJson = typeof recommendation.toJSON === 'function'
      ? recommendation.toJSON()
      : recommendation;

    const hasFeasibleRoute = !recommendation.isFallback && Boolean(recommendation.selectedRoute);

    // Invariant: Do not return a successful recommendation if no feasible route exists
    if (!hasFeasibleRoute) {
      return success(res, {
        hasFeasibleRoute: false,
        hasSuccessfulRecommendation: false,
        isFallback: true,
        status: recommendation.status || 'FALLBACK',
        fallbackReason: recommendation.fallbackReason || 'No feasible route exists meeting your specified schedule and constraints.',
        fallbackGuidance: recommendation.fallbackGuidance || [],
        primaryRecommendedRoute: null,
        selectedRoute: null,
        primaryRoute: null,
        meaningfulAlternatives: [],
        alternativeRoutes: [],
        alternatives: [],
        estimatedJourneyMinutes: null,
        estimatedTravelTimeMinutes: null,
        estimatedArrivalTime: null,
        departureTime: recommendation.departureTime || departureTime,
        disruptionSummary: {
          delayMinutes: 0,
          warnings: recommendation.warnings || []
        },
        warnings: recommendation.warnings || [],
        contextSummary: recommendation.contextSummary || context || {},
        studentContext: studentContext ? studentContext.toJSON() : null,
        preferenceAlignment: recJson.preferenceAlignment || null,
        recommendationReasons: recJson.recommendationReasons || [],
        reasons: recJson.recommendationReasons || [],
        routeTradeOffs: recJson.tradeOffs || [],
        tradeOffs: recJson.tradeOffs || [],
        departureAdvice: null,
        uncertainty: recommendation.uncertainty || 'UNKNOWN',
        reliability: recommendation.reliability || 'LOW',
        provenance: recJson.provenance || null,
        provenanceSummary: recJson.provenanceSummary || null,
        explanation: recJson.explanation || null,
        recommendation: null,
        queryContext: {
          studentId,
          origin,
          destination,
          departureTime,
          targetArrivalTime,
          appliedConstraints: constraints,
          appliedPreferences: preferences,
          studentContext: studentContext ? studentContext.toJSON() : null
        }
      });
    }

    // Successful recommendation with feasible primary route and alternatives
    const primaryRecommendedRoute = recJson.selectedRoute;
    const meaningfulAlternatives = recJson.alternativeRoutes || [];

    return success(res, {
      hasFeasibleRoute: true,
      hasSuccessfulRecommendation: true,
      isFallback: false,
      status: recommendation.status || 'RECOMMENDED',
      fallbackReason: null,
      fallbackGuidance: [],
      primaryRecommendedRoute,
      selectedRoute: primaryRecommendedRoute,
      primaryRoute: primaryRecommendedRoute,
      meaningfulAlternatives,
      alternativeRoutes: meaningfulAlternatives,
      alternatives: meaningfulAlternatives,
      estimatedJourneyMinutes: recJson.estimatedTravelTimeMinutes,
      estimatedTravelTimeMinutes: recJson.estimatedTravelTimeMinutes,
      estimatedArrivalTime: recJson.estimatedArrivalTime,
      departureTime: recJson.departureTime || departureTime,
      disruptionSummary: {
        delayMinutes: recJson.expectedDisruptionDelayMinutes || 0,
        warnings: recJson.warnings || []
      },
      warnings: recJson.warnings || [],
      contextSummary: recJson.contextSummary || context || {},
      studentContext: studentContext ? studentContext.toJSON() : null,
      preferenceAlignment: recJson.preferenceAlignment,
      recommendationReasons: recJson.recommendationReasons || [],
      reasons: recJson.recommendationReasons || [],
      routeTradeOffs: recJson.tradeOffs || [],
      tradeOffs: recJson.tradeOffs || [],
      departureAdvice: recJson.departureAdvice || null,
      uncertainty: recJson.uncertainty,
      reliability: recJson.reliability,
      provenance: recJson.provenance,
      provenanceSummary: recJson.provenanceSummary,
      explanation: recJson.explanation || null,
      recommendation: recJson,
      queryContext: {
        studentId,
        origin,
        destination,
        departureTime,
        targetArrivalTime,
        appliedConstraints: constraints,
        appliedPreferences: preferences,
        studentContext: studentContext ? studentContext.toJSON() : null
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPersonalizedRecommendation
};
