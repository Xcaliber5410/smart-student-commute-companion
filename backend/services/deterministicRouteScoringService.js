/**
 * DeterministicRouteScoringService
 *
 * Provides a deterministic, explainable, and transparent scoring service
 * for candidate commute routes using route evaluations and commute context.
 *
 * Features:
 * - Deterministic composite scoring (0 to 100 scale)
 * - Strict feasibility tiering: Infeasible routes NEVER outrank feasible routes
 * - Personalized student commute preferences:
 *   - faster journey preference ('fastest')
 *   - lower-cost preference ('cheapest')
 *   - fewer transfers ('fewest_transfers' / preferFewerTransfers)
 *   - reduced walking ('least_walking' / 'rain-safe' / preferReducedWalking)
 *   - preferred transport modes (affinity bonuses)
 *   - maximum acceptable walking (soft tolerance penalty & hard constraint)
 *   - maximum transfers (soft tolerance penalty & hard constraint)
 *   - budget limit (soft tolerance penalty & hard constraint)
 *   - arrival deadline (punctual buffer bonus & hard constraint)
 *   - reliability preference ('reliable' / preferReliable)
 *   - transport availability and disruption impact
 * - Explainable itemized breakdown and rationale
 * - Preserves data provenance and uncertainty without loss
 * - Safe handling of unavailable or estimated transit costs
 * - Documented, sensible defaults when preferences are missing
 */

const { RouteEvaluation } = require('../models/RouteEvaluation');
const { routeEvaluationService } = require('./routeEvaluationService');
const { ValidationError } = require('../errors');

// Standard explainable baseline penalty rates (calibrated for Mumbai student transit)
const SCORING_RATES = Object.freeze({
  BASE_SCORE: 100.0,
  TRAVEL_TIME_PER_MINUTE: 0.5,      // 0.5 pts / min scheduled travel time
  DISRUPTION_PER_MINUTE: 1.2,       // 1.2 pts / min unexpected delay (high friction)
  TRAFFIC_PER_MINUTE: 0.8,          // 0.8 pts / min road congestion delay
  WAITING_PER_MINUTE: 0.8,          // 0.8 pts / min station/stop waiting time
  WALKING_PER_MINUTE: 0.7,          // 0.7 pts / min pedestrian walking exertion
  EXCESS_WALK_PER_MINUTE: 0.5,      // Additional 0.5 pts / min for walking beyond tolerance
  PER_TRANSFER: 5.0,                // 5.0 pts per modal transfer
  PER_RUPEE_COST: 0.15,             // 0.15 pts per Rupee (economic student friction)
  PER_AFFECTED_SEGMENT: 3.0,        // 3.0 pts per affected segment risk
  UNCERTAINTY_PENALTIES: Object.freeze({
    LOW: 0.0,
    MODERATE: 4.0,
    HIGH: 10.0,
    SEVERE: 20.0
  }),
  INFEASIBLE_PENALTY: 1000.0        // Heavy penalty ensuring infeasible routes score 0
});

/**
 * Deterministic preference profile weighting multipliers.
 * Modulates baseline penalty rates according to student priorities.
 */
const PREFERENCE_PROFILES = Object.freeze({
  balanced: Object.freeze({
    travelTimeMultiplier: 1.0,
    disruptionMultiplier: 1.0,
    trafficMultiplier: 1.0,
    waitingMultiplier: 1.0,
    walkingMultiplier: 1.0,
    transferMultiplier: 1.0,
    costMultiplier: 1.0,
    uncertaintyMultiplier: 1.0,
    description: 'Balanced profile evaluating all journey factors equally'
  }),
  fastest: Object.freeze({
    travelTimeMultiplier: 1.6,
    disruptionMultiplier: 1.4,
    trafficMultiplier: 1.3,
    waitingMultiplier: 1.2,
    walkingMultiplier: 0.9,
    transferMultiplier: 0.9,
    costMultiplier: 0.5,
    uncertaintyMultiplier: 1.1,
    description: 'Faster journey preference prioritizing minimal travel time over fare cost'
  }),
  cheapest: Object.freeze({
    travelTimeMultiplier: 0.7,
    disruptionMultiplier: 1.0,
    trafficMultiplier: 0.8,
    waitingMultiplier: 0.9,
    walkingMultiplier: 0.9,
    transferMultiplier: 0.8,
    costMultiplier: 2.5,
    uncertaintyMultiplier: 0.9,
    description: 'Lower-cost preference prioritizing economical transit fares over travel duration'
  }),
  reliable: Object.freeze({
    travelTimeMultiplier: 1.0,
    disruptionMultiplier: 1.7,
    trafficMultiplier: 1.5,
    waitingMultiplier: 1.2,
    walkingMultiplier: 1.0,
    transferMultiplier: 1.2,
    costMultiplier: 0.8,
    uncertaintyMultiplier: 2.0,
    description: 'Reliability preference prioritizing high predictability and minimal disruption risk'
  }),
  'rain-safe': Object.freeze({
    travelTimeMultiplier: 0.9,
    disruptionMultiplier: 1.3,
    trafficMultiplier: 1.1,
    waitingMultiplier: 1.3,
    walkingMultiplier: 1.8,
    transferMultiplier: 1.4,
    costMultiplier: 0.8,
    uncertaintyMultiplier: 1.4,
    description: 'Monsoon-safe preference prioritizing sheltered transit and minimal pedestrian exertion'
  }),
  least_walking: Object.freeze({
    travelTimeMultiplier: 0.9,
    disruptionMultiplier: 1.0,
    trafficMultiplier: 1.0,
    waitingMultiplier: 1.0,
    walkingMultiplier: 2.0,
    transferMultiplier: 1.2,
    costMultiplier: 1.0,
    uncertaintyMultiplier: 1.0,
    description: 'Reduced walking preference prioritizing minimal pedestrian exposure'
  }),
  fewest_transfers: Object.freeze({
    travelTimeMultiplier: 0.9,
    disruptionMultiplier: 1.1,
    trafficMultiplier: 1.0,
    waitingMultiplier: 1.4,
    walkingMultiplier: 1.0,
    transferMultiplier: 2.2,
    costMultiplier: 1.0,
    uncertaintyMultiplier: 1.1,
    description: 'Fewer transfers preference prioritizing direct, uninterrupted journeys'
  })
});

/**
 * Documented, sensible defaults when preferences are missing or partially specified.
 */
const DEFAULT_PREFERENCES = Object.freeze({
  route_preference: 'balanced',
  preferred_modes: Object.freeze([]),
  avoid_modes: Object.freeze([]),
  walking_tolerance_minutes: 15,
  max_transfers: null,
  max_budget_rupees: null,
  prefer_fewer_transfers: false,
  prefer_reduced_walking: false,
  prefer_reliable: false
});

/**
 * Deterministic reason codes for hard constraint rejections.
 */
const HARD_CONSTRAINT_REASONS = Object.freeze({
  ARRIVAL_TOO_LATE: 'ARRIVAL_TOO_LATE',
  TOO_MANY_TRANSFERS: 'TOO_MANY_TRANSFERS',
  WALKING_LIMIT_EXCEEDED: 'WALKING_LIMIT_EXCEEDED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  ROUTE_DISRUPTED: 'ROUTE_DISRUPTED',
  EXCLUDED_MODE: 'EXCLUDED_MODE',
  DISALLOWED_MODE: 'DISALLOWED_MODE'
});

/**
 * Normalizes user-specified preference profiles to recognized canonical profile keys.
 * @param {string} [pref]
 * @returns {string}
 */
function normalizePreferenceProfile(pref) {
  if (!pref || typeof pref !== 'string') return 'balanced';
  const clean = pref.trim().toLowerCase();
  if (clean === 'fast' || clean === 'fastest' || clean === 'speed') return 'fastest';
  if (clean === 'cheap' || clean === 'cheapest' || clean === 'budget' || clean === 'low_cost') return 'cheapest';
  if (clean === 'reliable' || clean === 'punctual' || clean === 'consistent') return 'reliable';
  if (clean === 'rain-safe' || clean === 'rain_safe' || clean === 'weather' || clean === 'monsoon') return 'rain-safe';
  if (clean === 'least_walking' || clean === 'least-walking' || clean === 'low_walking' || clean === 'reduced_walking') return 'least_walking';
  if (clean === 'fewest_transfers' || clean === 'fewest-transfers' || clean === 'min_transfers' || clean === 'direct') return 'fewest_transfers';
  if (PREFERENCE_PROFILES[clean]) return clean;
  return 'balanced';
}

/**
 * Parses time strings ("HH:MM", "HH:MM:SS" or ISO) to minutes from midnight.
 * @param {string|number} val
 * @returns {number|null}
 */
function parseTimeToMinutes(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (!isNaN(hours) && !isNaN(minutes)) {
      return hours * 60 + minutes;
    }
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}

/**
 * Returns true if time1 is strictly later than time2.
 * @param {string} time1
 * @param {string} time2
 * @returns {boolean}
 */
function isTimeLater(time1, time2) {
  const m1 = parseTimeToMinutes(time1);
  const m2 = parseTimeToMinutes(time2);
  if (m1 === null || m2 === null) return false;
  return m1 > m2;
}

class DeterministicRouteScoringService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.routeEvaluationService]
   * @param {object} [options.rates] - Optional customized penalty rates
   */
  constructor(options = {}) {
    this.routeEvaluationService = options.routeEvaluationService || routeEvaluationService;
    this.rates = options.rates || SCORING_RATES;
  }

  /**
   * Scores a single candidate route evaluation, accounting for student preferences
   * and request-specific constraints.
   *
   * @param {RouteEvaluation|object} evaluation - RouteEvaluation instance or candidate journey
   * @param {object} [contextOrImpact={}] - Context or UnifiedJourneyImpact if evaluation not yet computed
   * @param {object} [options={}] - Options (preferences, hardConstraints, constraints, targetArrivalTime)
   * @returns {object} Scored route result with score, breakdown, explanation, and rank placeholder
   */
  scoreRoute(evaluation, contextOrImpact = {}, options = {}) {
    if (!evaluation) {
      throw new ValidationError('Route evaluation or candidate journey is required for scoring');
    }

    let routeEval = evaluation;
    if (!(evaluation instanceof RouteEvaluation)) {
      routeEval = this.routeEvaluationService.evaluateRoute(evaluation, contextOrImpact, options);
    }

    const rates = this.rates;

    // -------------------------------------------------------------------------
    // 1. EXTRACT PREFERENCES & CONSTRAINTS (Sensible Defaults & Decoupling)
    // -------------------------------------------------------------------------
    const preferences = options.preferences || contextOrImpact?.preferences || options.studentPreferences || {};
    const hardConstraints = options.hardConstraints || options.constraints || contextOrImpact?.constraints || {};

    const rawRoutePreference = preferences.route_preference || preferences.routePreference || options.routePreference || DEFAULT_PREFERENCES.route_preference;
    const routePreference = normalizePreferenceProfile(rawRoutePreference);
    const profile = PREFERENCE_PROFILES[routePreference] || PREFERENCE_PROFILES.balanced;

    const preferredModes = (
      Array.isArray(preferences.preferred_modes) ? preferences.preferred_modes :
      (Array.isArray(preferences.preferredModes) ? preferences.preferredModes : (options.preferredModes || []))
    ).map(m => String(m).toLowerCase());

    const softAvoidModes = (
      Array.isArray(preferences.avoid_modes) ? preferences.avoid_modes :
      (Array.isArray(preferences.avoidModes) ? preferences.avoidModes : (options.avoidModes || []))
    ).map(m => String(m).toLowerCase());

    const walkingToleranceMinutes = preferences.walking_tolerance_minutes !== undefined && preferences.walking_tolerance_minutes !== null
      ? Number(preferences.walking_tolerance_minutes)
      : (preferences.walkingToleranceMinutes !== undefined && preferences.walkingToleranceMinutes !== null
        ? Number(preferences.walkingToleranceMinutes)
        : (options.walkingToleranceMinutes !== undefined ? Number(options.walkingToleranceMinutes) : DEFAULT_PREFERENCES.walking_tolerance_minutes));

    const softMaxTransfers = preferences.max_transfers !== undefined && preferences.max_transfers !== null
      ? Number(preferences.max_transfers)
      : (preferences.maxTransfers !== undefined && preferences.maxTransfers !== null
        ? Number(preferences.maxTransfers)
        : (options.softMaxTransfers !== undefined ? Number(options.softMaxTransfers) : null));

    const softMaxBudgetRupees = preferences.max_budget_rupees !== undefined && preferences.max_budget_rupees !== null
      ? Number(preferences.max_budget_rupees)
      : (preferences.maxBudgetRupees !== undefined && preferences.maxBudgetRupees !== null
        ? Number(preferences.maxBudgetRupees)
        : (preferences.budgetLimit !== undefined ? Number(preferences.budgetLimit) : (options.softMaxBudgetRupees !== undefined ? Number(options.softMaxBudgetRupees) : null)));

    const preferFewerTransfers = Boolean(
      preferences.prefer_fewer_transfers ||
      preferences.preferFewerTransfers ||
      options.preferFewerTransfers ||
      routePreference === 'fewest_transfers'
    );

    const preferReducedWalking = Boolean(
      preferences.prefer_reduced_walking ||
      preferences.preferReducedWalking ||
      options.preferReducedWalking ||
      routePreference === 'least_walking' ||
      routePreference === 'rain-safe'
    );

    const preferReliable = Boolean(
      preferences.prefer_reliable ||
      preferences.preferReliable ||
      options.preferReliable ||
      routePreference === 'reliable'
    );

    // Hard Constraints
    const targetArrivalTime = options.targetArrivalTime ||
      options.arrivalDeadline ||
      options.desiredArrivalTime ||
      hardConstraints.targetArrivalTime ||
      hardConstraints.arrivalDeadline ||
      hardConstraints.desiredArrivalTime ||
      null;

    const hardMaxTransfers = hardConstraints.maxTransfers !== undefined && hardConstraints.maxTransfers !== null
      ? Number(hardConstraints.maxTransfers)
      : (options.hardMaxTransfers !== undefined ? Number(options.hardMaxTransfers) : null);

    const hardMaxWalkingMinutes = hardConstraints.maxWalkingMinutes !== undefined && hardConstraints.maxWalkingMinutes !== null
      ? Number(hardConstraints.maxWalkingMinutes)
      : (hardConstraints.maxWalking !== undefined ? Number(hardConstraints.maxWalking) : (options.hardMaxWalkingMinutes !== undefined ? Number(options.hardMaxWalkingMinutes) : null));

    const hardMaxBudgetRupees = hardConstraints.maxBudgetRupees !== undefined && hardConstraints.maxBudgetRupees !== null
      ? Number(hardConstraints.maxBudgetRupees)
      : (hardConstraints.budgetLimit !== undefined ? Number(hardConstraints.budgetLimit) : (options.hardMaxBudgetRupees !== undefined ? Number(options.hardMaxBudgetRupees) : null));

    const hardAvoidModes = (
      Array.isArray(hardConstraints.avoidModes) ? hardConstraints.avoidModes :
      (Array.isArray(hardConstraints.excludedModes) ? hardConstraints.excludedModes : (options.hardAvoidModes || []))
    ).map(m => String(m).toLowerCase());

    const hardAllowedModes = Array.isArray(hardConstraints.allowedModes)
      ? hardConstraints.allowedModes.map(m => String(m).toLowerCase())
      : (options.hardAllowedModes || null);

    // -------------------------------------------------------------------------
    // 2. ROUTE METRICS & BASELINE CHARACTERISTICS
    // -------------------------------------------------------------------------
    const baselineMinutes = Number(routeEval.baselineTravelTime || 0);
    const disruptionMinutes = Number(routeEval.additionalDisruptionDelay || 0);
    const trafficMinutes = Number(routeEval.trafficImpact?.addedTravelTimeMinutes || 0);
    const waitingMinutes = Number(routeEval.waitingTime || 0);
    const walkingMinutes = Number(routeEval.walkingTime || 0);
    const transferCount = Number(routeEval.numberOfTransfers || 0);

    const isCostAvailable = routeEval.isCostAvailable !== false &&
      routeEval.estimatedCost !== undefined &&
      routeEval.estimatedCost !== null &&
      !isNaN(Number(routeEval.estimatedCost));
    const costRupees = isCostAvailable ? Number(routeEval.estimatedCost) : null;
    const isCostExact = isCostAvailable && routeEval.isCostExact === true;

    const reliabilityLevel = routeEval.reliability || routeEval.uncertainty || 'LOW';
    const affectedCount = Array.isArray(routeEval.affectedSegments) ? routeEval.affectedSegments.length : 0;

    const effectiveArrivalTime = routeEval.updatedArrivalTime || routeEval.estimatedArrivalTime || null;
    const routeModes = Array.isArray(routeEval.modesIncluded) && routeEval.modesIncluded.length > 0
      ? routeEval.modesIncluded.map(m => String(m).toLowerCase())
      : (routeEval.primaryMode ? [String(routeEval.primaryMode).toLowerCase()] : []);

    // -------------------------------------------------------------------------
    // 3. HARD CONSTRAINTS ENFORCEMENT (Infeasible Routes NEVER Outrank Feasible)
    // -------------------------------------------------------------------------
    let isFeasible = Boolean(routeEval.isFeasible);
    let feasibilityReason = routeEval.feasibilityReason || 'OPERATIONAL';
    const reasonCodes = Array.isArray(routeEval.reasonCodes) ? [...routeEval.reasonCodes] : [];

    if (isFeasible) {
      // 3A. Hard Arrival Deadline Check
      if (targetArrivalTime && effectiveArrivalTime && isTimeLater(effectiveArrivalTime, targetArrivalTime)) {
        isFeasible = false;
        feasibilityReason = `Arrival deadline exceeded: arrives at ${effectiveArrivalTime}, deadline is ${targetArrivalTime}`;
        if (!reasonCodes.includes(HARD_CONSTRAINT_REASONS.ARRIVAL_TOO_LATE)) {
          reasonCodes.push(HARD_CONSTRAINT_REASONS.ARRIVAL_TOO_LATE);
        }
      }

      // 3B. Hard Maximum Transfers Check
      if (isFeasible && hardMaxTransfers !== null && transferCount > hardMaxTransfers) {
        isFeasible = false;
        feasibilityReason = `Exceeds maximum allowable transfers: ${transferCount} transfers (limit ${hardMaxTransfers})`;
        if (!reasonCodes.includes(HARD_CONSTRAINT_REASONS.TOO_MANY_TRANSFERS)) {
          reasonCodes.push(HARD_CONSTRAINT_REASONS.TOO_MANY_TRANSFERS);
        }
      }

      // 3C. Hard Maximum Walking Check
      if (isFeasible && hardMaxWalkingMinutes !== null && walkingMinutes > hardMaxWalkingMinutes) {
        isFeasible = false;
        feasibilityReason = `Exceeds maximum walking limit: ${walkingMinutes} min (limit ${hardMaxWalkingMinutes} min)`;
        if (!reasonCodes.includes(HARD_CONSTRAINT_REASONS.WALKING_LIMIT_EXCEEDED)) {
          reasonCodes.push(HARD_CONSTRAINT_REASONS.WALKING_LIMIT_EXCEEDED);
        }
      }

      // 3D. Hard Budget Limit Check (only when cost is known)
      if (isFeasible && hardMaxBudgetRupees !== null && costRupees !== null && costRupees > hardMaxBudgetRupees) {
        isFeasible = false;
        feasibilityReason = `Exceeds budget limit: Rs ${costRupees} (limit Rs ${hardMaxBudgetRupees})`;
        if (!reasonCodes.includes(HARD_CONSTRAINT_REASONS.BUDGET_EXCEEDED)) {
          reasonCodes.push(HARD_CONSTRAINT_REASONS.BUDGET_EXCEEDED);
        }
      }

      // 3E. Hard Excluded Modes Check
      if (isFeasible && hardAvoidModes.length > 0) {
        const excludedFound = routeModes.filter(m => hardAvoidModes.includes(m));
        if (excludedFound.length > 0) {
          isFeasible = false;
          feasibilityReason = `Contains excluded transport mode: ${excludedFound.join(', ')}`;
          if (!reasonCodes.includes(HARD_CONSTRAINT_REASONS.EXCLUDED_MODE)) {
            reasonCodes.push(HARD_CONSTRAINT_REASONS.EXCLUDED_MODE);
          }
        }
      }

      // 3F. Hard Allowed Modes Whitelist Check
      if (isFeasible && hardAllowedModes && hardAllowedModes.length > 0) {
        const disallowedFound = routeModes.filter(m => m !== 'walk' && !hardAllowedModes.includes(m));
        if (disallowedFound.length > 0) {
          isFeasible = false;
          feasibilityReason = `Contains mode not in allowed whitelist: ${disallowedFound.join(', ')}`;
          if (!reasonCodes.includes(HARD_CONSTRAINT_REASONS.DISALLOWED_MODE)) {
            reasonCodes.push(HARD_CONSTRAINT_REASONS.DISALLOWED_MODE);
          }
        }
      }
    }

    const feasibilityTier = isFeasible ? 1 : 0;
    const infeasiblePenalty = isFeasible ? 0.0 : rates.INFEASIBLE_PENALTY;

    // -------------------------------------------------------------------------
    // 4. PERSONALIZED PENALTIES (Modulated by Profile Multipliers)
    // -------------------------------------------------------------------------
    // 4A. Baseline Travel Time Penalty
    const effectiveTravelRate = rates.TRAVEL_TIME_PER_MINUTE * profile.travelTimeMultiplier;
    const travelTimePenalty = Math.round(baselineMinutes * effectiveTravelRate * 100) / 100;

    // 4B. Disruption Delay Penalty
    const effectiveDisruptionRate = rates.DISRUPTION_PER_MINUTE * profile.disruptionMultiplier;
    const disruptionPenalty = Math.round(disruptionMinutes * effectiveDisruptionRate * 100) / 100;

    // 4C. Road Traffic Delay Penalty
    const effectiveTrafficRate = rates.TRAFFIC_PER_MINUTE * profile.trafficMultiplier;
    const trafficPenalty = Math.round(trafficMinutes * effectiveTrafficRate * 100) / 100;

    // 4D. Station / Stop Waiting Penalty
    const effectiveWaitingRate = rates.WAITING_PER_MINUTE * profile.waitingMultiplier;
    const waitingPenalty = Math.round(waitingMinutes * effectiveWaitingRate * 100) / 100;

    // 4E. Walking Exertion & Excess Walking Penalty
    const effectiveWalkRate = rates.WALKING_PER_MINUTE * profile.walkingMultiplier * (preferReducedWalking ? 1.3 : 1.0);
    let walkingPenalty = walkingMinutes * effectiveWalkRate;
    let excessWalkPenalty = 0.0;
    if (walkingMinutes > walkingToleranceMinutes) {
      const excessRate = rates.EXCESS_WALK_PER_MINUTE * (preferReducedWalking ? 1.5 : 1.0);
      excessWalkPenalty = (walkingMinutes - walkingToleranceMinutes) * excessRate;
      walkingPenalty += excessWalkPenalty;
    }
    walkingPenalty = Math.round(walkingPenalty * 100) / 100;

    // 4F. Modal Transfer Friction Penalty
    const effectiveTransferRate = rates.PER_TRANSFER * profile.transferMultiplier * (preferFewerTransfers ? 1.4 : 1.0);
    let transferPenalty = transferCount * effectiveTransferRate;
    let excessTransferPenalty = 0.0;
    if (softMaxTransfers !== null && transferCount > softMaxTransfers) {
      excessTransferPenalty = (transferCount - softMaxTransfers) * 4.0;
      transferPenalty += excessTransferPenalty;
    }
    transferPenalty = Math.round(transferPenalty * 100) / 100;

    // 4G. Monetary Fare Penalty (Safe Handling for Unavailable / Estimated Costs)
    let costPenalty = 0.0;
    let excessCostPenalty = 0.0;
    if (isCostAvailable && costRupees > 0) {
      const effectiveCostRate = rates.PER_RUPEE_COST * profile.costMultiplier;
      costPenalty = costRupees * effectiveCostRate;
      if (softMaxBudgetRupees !== null && costRupees > softMaxBudgetRupees) {
        excessCostPenalty = (costRupees - softMaxBudgetRupees) * 0.3;
        costPenalty += excessCostPenalty;
      }
      costPenalty = Math.round(costPenalty * 100) / 100;
    }

    // 4H. Uncertainty / Reliability Risk Penalty
    const baseUncertainty = rates.UNCERTAINTY_PENALTIES[reliabilityLevel] !== undefined
      ? rates.UNCERTAINTY_PENALTIES[reliabilityLevel]
      : rates.UNCERTAINTY_PENALTIES.LOW;
    const effectiveUncertaintyMultiplier = profile.uncertaintyMultiplier * (preferReliable ? 1.3 : 1.0);
    const uncertaintyPenalty = Math.round(baseUncertainty * effectiveUncertaintyMultiplier * 100) / 100;

    // 4I. Affected Segments Penalty
    const effectiveAffectedRate = rates.PER_AFFECTED_SEGMENT * (preferReliable ? 1.3 : 1.0);
    const affectedPenalty = Math.round(affectedCount * effectiveAffectedRate * 100) / 100;

    // -------------------------------------------------------------------------
    // 5. SOFT PREFERENCE AFFINITY BONUSES & ADJUSTMENTS (Feasible Routes Only)
    // -------------------------------------------------------------------------
    const personalizationBonuses = [];
    let totalBonus = 0.0;

    if (isFeasible) {
      // 5A. Preferred Modes Affinity Bonus
      if (preferredModes.length > 0) {
        const matchedTransitModes = routeModes.filter(m => m !== 'walk' && preferredModes.includes(m));
        if (matchedTransitModes.length > 0) {
          const bonusPts = Math.min(5.0, matchedTransitModes.length * 2.5);
          personalizationBonuses.push({
            type: 'PREFERRED_MODE_MATCH',
            points: bonusPts,
            description: `Matched preferred transport mode(s): ${matchedTransitModes.join(', ')} (+${bonusPts} pts)`
          });
          totalBonus += bonusPts;
        }
      }

      // 5B. Soft Avoided Modes Penalty
      if (softAvoidModes.length > 0) {
        const avoidedFound = routeModes.filter(m => softAvoidModes.includes(m));
        if (avoidedFound.length > 0) {
          const penaltyPts = Math.min(8.0, avoidedFound.length * 4.0);
          personalizationBonuses.push({
            type: 'AVOIDED_MODE_PENALTY',
            points: -penaltyPts,
            description: `Includes soft-avoided transport mode(s): ${avoidedFound.join(', ')} (-${penaltyPts} pts)`
          });
          totalBonus -= penaltyPts;
        }
      }

      // 5C. Direct Route Bonus (0 transfers when student prioritizes fewer transfers)
      if ((preferFewerTransfers || routePreference === 'fewest_transfers') && transferCount === 0) {
        const bonusPts = 2.5;
        personalizationBonuses.push({
          type: 'DIRECT_ROUTE_BONUS',
          points: bonusPts,
          description: `Direct non-stop transit journey with 0 transfers (+${bonusPts} pts)`
        });
        totalBonus += bonusPts;
      }

      // 5D. Low Walking Exertion Bonus (<= 5 min walking when reduced walking preferred)
      if (preferReducedWalking && walkingMinutes <= 5) {
        const bonusPts = 2.0;
        personalizationBonuses.push({
          type: 'LOW_WALKING_BONUS',
          points: bonusPts,
          description: `Minimal pedestrian burden of ${walkingMinutes} min (+${bonusPts} pts)`
        });
        totalBonus += bonusPts;
      }

      // 5E. Reliability / Consistency Bonus (LOW uncertainty & 0 delays when reliable preferred)
      if (preferReliable && reliabilityLevel === 'LOW' && disruptionMinutes === 0 && trafficMinutes === 0) {
        const bonusPts = 3.0;
        personalizationBonuses.push({
          type: 'HIGH_RELIABILITY_BONUS',
          points: bonusPts,
          description: `Zero unexpected delays with high schedule consistency (+${bonusPts} pts)`
        });
        totalBonus += bonusPts;
      }

      // 5F. Punctual Arrival Buffer Bonus (arriving safely before target arrival deadline)
      if (targetArrivalTime && effectiveArrivalTime) {
        const arrMin = parseTimeToMinutes(effectiveArrivalTime);
        const tgtMin = parseTimeToMinutes(targetArrivalTime);
        if (arrMin !== null && tgtMin !== null && (tgtMin - arrMin) >= 5) {
          const buffer = tgtMin - arrMin;
          const bonusPts = 2.0;
          personalizationBonuses.push({
            type: 'PUNCTUALITY_BUFFER_BONUS',
            points: bonusPts,
            description: `Arrives ${buffer} min ahead of target arrival deadline ${targetArrivalTime} (+${bonusPts} pts)`
          });
          totalBonus += bonusPts;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 6. TOTAL PENALTIES & FINAL COMPOSITE SCORE (0 to 100 Scale)
    // -------------------------------------------------------------------------
    const totalPenalties = Math.round((
      travelTimePenalty +
      disruptionPenalty +
      trafficPenalty +
      waitingPenalty +
      walkingPenalty +
      transferPenalty +
      costPenalty +
      uncertaintyPenalty +
      affectedPenalty +
      infeasiblePenalty
    ) * 100) / 100;

    let compositeScore = 0.0;
    if (isFeasible) {
      const rawScore = rates.BASE_SCORE - (totalPenalties - infeasiblePenalty) + totalBonus;
      compositeScore = Math.max(1.0, Math.min(100.0, Math.round(rawScore * 10) / 10));
    }

    // -------------------------------------------------------------------------
    // 7. EXPLAINABLE BREAKDOWN & HUMAN-READABLE RATIONALE
    // -------------------------------------------------------------------------
    const breakdown = {
      baseScore: rates.BASE_SCORE,
      travelTime: {
        minutes: baselineMinutes,
        ratePerMinute: Math.round(effectiveTravelRate * 1000) / 1000,
        pointsDeducted: travelTimePenalty,
        description: `${baselineMinutes} min baseline travel time (-${travelTimePenalty} pts)`
      },
      disruption: {
        delayMinutes: disruptionMinutes,
        ratePerMinute: Math.round(effectiveDisruptionRate * 1000) / 1000,
        pointsDeducted: disruptionPenalty,
        description: disruptionMinutes > 0
          ? `${disruptionMinutes} min unexpected disruption delay (-${disruptionPenalty} pts)`
          : '0 min disruption delay (0 pts)'
      },
      traffic: {
        delayMinutes: trafficMinutes,
        ratePerMinute: Math.round(effectiveTrafficRate * 1000) / 1000,
        pointsDeducted: trafficPenalty,
        description: trafficMinutes > 0
          ? `${trafficMinutes} min road traffic delay (-${trafficPenalty} pts)`
          : '0 min road traffic delay (0 pts)'
      },
      waiting: {
        minutes: waitingMinutes,
        ratePerMinute: Math.round(effectiveWaitingRate * 1000) / 1000,
        pointsDeducted: waitingPenalty,
        description: waitingMinutes > 0
          ? `${waitingMinutes} min station waiting time (-${waitingPenalty} pts)`
          : '0 min waiting time (0 pts)'
      },
      walking: {
        minutes: walkingMinutes,
        toleranceMinutes: walkingToleranceMinutes,
        ratePerMinute: Math.round(effectiveWalkRate * 1000) / 1000,
        excessPointsDeducted: Math.round(excessWalkPenalty * 100) / 100,
        pointsDeducted: walkingPenalty,
        description: walkingMinutes > walkingToleranceMinutes
          ? `${walkingMinutes} min walking burden (exceeds ${walkingToleranceMinutes} min tolerance, -${walkingPenalty} pts)`
          : `${walkingMinutes} min walking burden (-${walkingPenalty} pts)`
      },
      transfers: {
        count: transferCount,
        softLimit: softMaxTransfers,
        ratePerTransfer: Math.round(effectiveTransferRate * 1000) / 1000,
        excessPointsDeducted: Math.round(excessTransferPenalty * 100) / 100,
        pointsDeducted: transferPenalty,
        description: transferCount > 0
          ? `${transferCount} modal transfer(s) (-${transferPenalty} pts)`
          : 'Direct route with 0 transfers (0 pts)'
      },
      cost: {
        fareRupees: isCostAvailable ? costRupees : null,
        ratePerRupee: Math.round((rates.PER_RUPEE_COST * profile.costMultiplier) * 1000) / 1000,
        pointsDeducted: costPenalty,
        isAvailable: isCostAvailable,
        isExact: isCostExact,
        isEstimated: isCostAvailable ? !isCostExact : false,
        description: isCostAvailable
          ? (costRupees > 0
            ? `Rs ${costRupees} transit fare (-${costPenalty} pts)${!isCostExact ? ' [estimated fare]' : ''}`
            : 'Free student walk / zero fare (0 pts)')
          : 'Fare cost unavailable / uncalculated (0 pts deducted, estimate not exact)'
      },
      uncertainty: {
        level: reliabilityLevel,
        pointsDeducted: uncertaintyPenalty,
        description: uncertaintyPenalty > 0
          ? `${reliabilityLevel} reliability risk (-${uncertaintyPenalty} pts)`
          : 'LOW uncertainty / high reliability (0 pts)'
      },
      affectedSegments: {
        count: affectedCount,
        pointsDeducted: affectedPenalty,
        description: affectedCount > 0
          ? `${affectedCount} affected segment(s) (-${affectedPenalty} pts)`
          : '0 affected segments (0 pts)'
      },
      feasibility: {
        isFeasible,
        feasibilityReason,
        pointsDeducted: infeasiblePenalty,
        description: isFeasible
          ? 'Route is operational and viable'
          : `Route is infeasible (${feasibilityReason}) — excluded from operational ranking`
      },
      personalization: {
        profile: routePreference,
        profileDescription: profile.description,
        appliedMultipliers: {
          travelTime: profile.travelTimeMultiplier,
          disruption: profile.disruptionMultiplier,
          traffic: profile.trafficMultiplier,
          waiting: profile.waitingMultiplier,
          walking: profile.walkingMultiplier,
          transfer: profile.transferMultiplier,
          cost: profile.costMultiplier,
          uncertainty: profile.uncertaintyMultiplier
        },
        bonuses: personalizationBonuses,
        netAdjustmentPoints: Math.round(totalBonus * 100) / 100
      },
      totalPenalties
    };

    // Itemized Human-Readable Explanations
    const explanations = [];
    if (!isFeasible) {
      explanations.push(`Route infeasible: ${feasibilityReason}`);
    }
    if (routePreference !== 'balanced') {
      explanations.push(`Personalized profile: '${routePreference}' — ${profile.description}`);
    }
    if (travelTimePenalty > 0) {
      explanations.push(`Travel time: ${baselineMinutes} min (-${travelTimePenalty} pts)`);
    }
    if (disruptionPenalty > 0) {
      explanations.push(`Disruption delay: +${disruptionMinutes} min (-${disruptionPenalty} pts)`);
    }
    if (trafficPenalty > 0) {
      explanations.push(`Road congestion: +${trafficMinutes} min (-${trafficPenalty} pts)`);
    }
    if (walkingPenalty > 0) {
      explanations.push(`Walking exertion: ${walkingMinutes} min (-${walkingPenalty} pts)`);
    }
    if (transferPenalty > 0) {
      explanations.push(`Transfers: ${transferCount} interchange(s) (-${transferPenalty} pts)`);
    }
    if (waitingPenalty > 0) {
      explanations.push(`Waiting time: ${waitingMinutes} min (-${waitingPenalty} pts)`);
    }
    if (costPenalty > 0) {
      explanations.push(`Fare cost: Rs ${costRupees} (-${costPenalty} pts)${!isCostExact ? ' (estimated)' : ''}`);
    }
    if (uncertaintyPenalty > 0) {
      explanations.push(`Reliability: ${reliabilityLevel} uncertainty (-${uncertaintyPenalty} pts)`);
    }
    if (affectedPenalty > 0) {
      explanations.push(`Risk: ${affectedCount} affected segment(s) (-${affectedPenalty} pts)`);
    }
    personalizationBonuses.forEach(b => {
      explanations.push(b.description);
    });

    return {
      journeyId: routeEval.journeyId,
      origin: routeEval.origin,
      destination: routeEval.destination,
      departureTime: routeEval.departureTime,
      estimatedArrivalTime: routeEval.estimatedArrivalTime,
      updatedArrivalTime: routeEval.updatedArrivalTime,
      totalTravelTime: routeEval.totalTravelTime,
      baselineTravelTime: routeEval.baselineTravelTime,
      isFeasible,
      feasibilityTier,
      feasibilityReason,
      compositeScore,
      totalPenalties,
      breakdown,
      explanations,
      weaknesses: routeEval.weaknesses || [],
      reasonCodes,
      primaryMode: routeEval.primaryMode,
      modesIncluded: routeEval.modesIncluded || [],
      evaluation: routeEval,
      dataTiers: routeEval.dataTiers || [],
      provenance: routeEval.provenance,
      evaluatedAt: routeEval.evaluatedAt,
      rank: 0 // assigned in scoreAndRankRoutes
    };
  }

  /**
   * Scores and deterministically ranks an array of candidate routes.
   *
   * Invariants:
   * 1. Infeasible routes (feasibilityTier = 0) NEVER outrank feasible routes (feasibilityTier = 1).
   * 2. Feasible routes are ordered by compositeScore descending (higher score is better).
   * 3. Deterministic tie-breaking on tied/near-tied routes accounts for personalized priorities:
   *    - For 'cheapest': lower cost -> lower duration -> fewer transfers -> alphabetical journeyId
   *    - For 'fewest_transfers': fewer transfers -> lower duration -> lower cost -> alphabetical journeyId
   *    - Default / others: lower duration -> fewer transfers -> lower cost -> alphabetical journeyId
   *
   * @param {Array<RouteEvaluation|object>} evaluations - Route evaluations or candidate journeys
   * @param {object|Array<object>} [contextOrImpacts={}] - Context or unified impacts
   * @param {object} [options={}] - Options (preferences, constraints)
   * @returns {Array<object>} Deterministically scored and ranked routes
   */
  scoreAndRankRoutes(evaluations = [], contextOrImpacts = {}, options = {}) {
    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      return [];
    }

    // 1. Score each route independently with personalization options
    const scoredRoutes = evaluations.map((item, idx) => {
      const matchingContext = Array.isArray(contextOrImpacts)
        ? contextOrImpacts[idx] || {}
        : contextOrImpacts;
      return this.scoreRoute(item, matchingContext, options);
    });

    const routePreference = normalizePreferenceProfile(
      options.preferences?.route_preference ||
      options.preferences?.routePreference ||
      options.routePreference
    );

    // 2. Deterministic sort comparator
    scoredRoutes.sort((a, b) => {
      // Rule 1: Feasible routes ALWAYS outrank infeasible routes
      if (a.feasibilityTier !== b.feasibilityTier) {
        return b.feasibilityTier - a.feasibilityTier; // 1 before 0
      }

      // Rule 2: Higher composite score first
      if (Math.abs(b.compositeScore - a.compositeScore) > 0.001) {
        return b.compositeScore - a.compositeScore;
      }

      // Rule 3: Deterministic tie-breaking conditioned on preference profile
      if (routePreference === 'cheapest') {
        const aCost = a.breakdown.cost.fareRupees ?? 0;
        const bCost = b.breakdown.cost.fareRupees ?? 0;
        if (aCost !== bCost) return aCost - bCost;
        if (a.totalTravelTime !== b.totalTravelTime) return a.totalTravelTime - b.totalTravelTime;
        const aTransfers = a.breakdown.transfers.count;
        const bTransfers = b.breakdown.transfers.count;
        if (aTransfers !== bTransfers) return aTransfers - bTransfers;
      } else if (routePreference === 'fewest_transfers') {
        const aTransfers = a.breakdown.transfers.count;
        const bTransfers = b.breakdown.transfers.count;
        if (aTransfers !== bTransfers) return aTransfers - bTransfers;
        if (a.totalTravelTime !== b.totalTravelTime) return a.totalTravelTime - b.totalTravelTime;
        const aCost = a.breakdown.cost.fareRupees ?? 0;
        const bCost = b.breakdown.cost.fareRupees ?? 0;
        if (aCost !== bCost) return aCost - bCost;
      } else {
        if (a.totalTravelTime !== b.totalTravelTime) return a.totalTravelTime - b.totalTravelTime;
        const aTransfers = a.breakdown.transfers.count;
        const bTransfers = b.breakdown.transfers.count;
        if (aTransfers !== bTransfers) return aTransfers - bTransfers;
        const aCost = a.breakdown.cost.fareRupees ?? 0;
        const bCost = b.breakdown.cost.fareRupees ?? 0;
        if (aCost !== bCost) return aCost - bCost;
      }

      // Fallback deterministic tie-breaker: Alphabetical journey ID
      return String(a.journeyId).localeCompare(String(b.journeyId));
    });

    // 3. Assign 1-indexed ranks
    scoredRoutes.forEach((route, index) => {
      route.rank = index + 1;
    });

    return scoredRoutes;
  }
}

const deterministicRouteScoringService = new DeterministicRouteScoringService();

module.exports = {
  DeterministicRouteScoringService,
  deterministicRouteScoringService,
  SCORING_RATES,
  PREFERENCE_PROFILES,
  DEFAULT_PREFERENCES,
  HARD_CONSTRAINT_REASONS
};
