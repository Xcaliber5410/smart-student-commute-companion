/**
 * RouteConstraintFilteringService
 *
 * Dedicated, deterministic constraint-filtering stage for commute candidates (P9).
 *
 * Responsibilities:
 * - Strictly separates HARD feasibility constraints (which make a route invalid/rejected)
 *   from SOFT student preferences (which guide downstream ranking).
 * - Never silently discards invalid routes: returns both accepted and rejected sets
 *   with itemized violations, threshold limits, actual values, and deterministic reason codes.
 *
 * Supported Constraints:
 * - Arrival deadline (targetArrivalTime / desiredArrivalTime)
 * - Maximum transfers (maxTransfers)
 * - Maximum walking distance/time (maxWalkingMinutes / walkingToleranceMinutes)
 * - Budget / fare cost limit (maxBudgetRupees)
 * - Transport availability (ServiceStatusRecord / segment inactive / suspended)
 * - Service operating windows (timetable schedule hours)
 * - Disruption feasibility (severe disruptions / impassable corridor)
 * - Excluded transport modes (avoidModes / excludedModes)
 * - Allowed transport modes whitelist (allowedModes)
 * - Preferred transport modes (soft preference)
 * - Routing preference affinity ('fastest', 'cheapest', 'least_walking', 'fewest_transfers', 'balanced')
 */

const { transportScheduleService } = require('./transportScheduleService');

/**
 * Constraint category classification enum.
 */
const CONSTRAINT_TYPES = Object.freeze({
  HARD: 'HARD',
  SOFT: 'SOFT'
});

/**
 * Deterministic reason codes for hard constraint rejections.
 */
const HARD_CONSTRAINT_REASON_CODES = Object.freeze({
  ARRIVAL_TOO_LATE: 'ARRIVAL_TOO_LATE',
  TOO_MANY_TRANSFERS: 'TOO_MANY_TRANSFERS',
  WALKING_LIMIT_EXCEEDED: 'WALKING_LIMIT_EXCEEDED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  OPERATING_HOURS_VIOLATED: 'OPERATING_HOURS_VIOLATED',
  ROUTE_DISRUPTED: 'ROUTE_DISRUPTED',
  EXCLUDED_MODE: 'EXCLUDED_MODE',
  DISALLOWED_MODE: 'DISALLOWED_MODE'
});

/**
 * Deterministic reason codes for soft preference matches and evaluations.
 */
const SOFT_PREFERENCE_CODES = Object.freeze({
  PREFERRED_MODE_MATCH: 'PREFERRED_MODE_MATCH',
  PREFERRED_MODE_MISS: 'PREFERRED_MODE_MISS',
  PREFERENCE_ALIGNED: 'PREFERENCE_ALIGNED',
  PREFERENCE_MISALIGNED: 'PREFERENCE_MISALIGNED'
});

class RouteConstraintFilteringService {
  constructor(scheduleService = transportScheduleService) {
    this.scheduleService = scheduleService;
  }

  /**
   * Evaluates a single candidate journey against hard constraints and soft preferences.
   *
   * @param {object} journey - Candidate journey or evaluated candidate object
   * @param {object} [options={}]
   * @param {object} [options.constraints={}] - Hard constraints dictionary
   * @param {object} [options.preferences={}] - Soft preferences dictionary
   * @param {string} [options.targetArrivalTime] - Arrival deadline (HH:MM)
   * @param {string} [options.desiredArrivalTime] - Alias for arrival deadline
   * @param {object} [options.context] - Unified commute context
   * @returns {object} Detailed route evaluation result with acceptance status and violations
   */
  evaluateRoute(journey, options = {}) {
    if (!journey) {
      throw new Error('A journey candidate is required for constraint evaluation');
    }

    const constraints = options.constraints || {};
    const preferences = options.preferences || {};
    const deadline = options.targetArrivalTime ||
      options.desiredArrivalTime ||
      constraints.targetArrivalTime ||
      constraints.desiredArrivalTime ||
      constraints.arrivalDeadline ||
      null;

    const hardViolations = [];
    const softNotes = [];

    // -------------------------------------------------------------------------
    // 1. EXTRACT RESOLVED METRICS (handles raw CommuteJourney & context-evaluated candidates)
    // -------------------------------------------------------------------------
    const candidateId = journey.id || journey.candidateId || 'unknown-candidate';
    const primaryMode = journey.primaryMode || (journey.segments?.[0]?.mode) || 'walk';
    const modesIncluded = Array.isArray(journey.modesIncluded) && journey.modesIncluded.length > 0
      ? journey.modesIncluded
      : (Array.isArray(journey.segments) ? Array.from(new Set(journey.segments.map(s => s.mode))) : [primaryMode]);

    const departureTime = journey.departureTime || journey.baselineTravel?.departureTime || '08:00';
    
    // Arrival time: prioritize context-updated arrival time if available, otherwise baseline arrival time
    const effectiveArrivalTime = journey.contextualImpact?.updatedArrivalTime ||
      journey.estimatedArrivalTime ||
      journey.baselineTravel?.estimatedArrivalTime ||
      null;

    const effectiveDuration = journey.contextualImpact?.updatedDurationMinutes !== undefined
      ? Number(journey.contextualImpact.updatedDurationMinutes)
      : (journey.totalDurationMinutes !== undefined ? Number(journey.totalDurationMinutes) : (journey.baselineTravel?.durationMinutes || 0));

    const actualTransfers = journey.transferCount !== undefined
      ? Number(journey.transferCount)
      : (journey.baselineTravel?.transferCount !== undefined ? Number(journey.baselineTravel.transferCount) : 0);

    const actualWalkingMinutes = journey.walkingTimeMinutes !== undefined
      ? Number(journey.walkingTimeMinutes)
      : (journey.baselineTravel?.walkingTimeMinutes !== undefined ? Number(journey.baselineTravel.walkingTimeMinutes) : 0);

    const actualWalkingKm = journey.walkingDistanceKm !== undefined
      ? Number(journey.walkingDistanceKm)
      : 0;

    const actualCost = journey.estimatedCostRupees !== undefined
      ? Number(journey.estimatedCostRupees)
      : (journey.baselineTravel?.estimatedCostRupees !== undefined ? Number(journey.baselineTravel.estimatedCostRupees) : 0);

    const isFeasible = journey.isFeasible !== undefined
      ? Boolean(journey.isFeasible)
      : (journey.contextualImpact?.isFeasible !== undefined ? Boolean(journey.contextualImpact.isFeasible) : true);

    const isViable = journey.isViable !== undefined
      ? Boolean(journey.isViable)
      : (journey.contextualImpact?.isViable !== undefined ? Boolean(journey.contextualImpact.isViable) : true);

    // -------------------------------------------------------------------------
    // 2. HARD CONSTRAINT: ARRIVAL DEADLINE (ARRIVAL_TOO_LATE)
    // -------------------------------------------------------------------------
    if (deadline && effectiveArrivalTime) {
      if (this._isLaterTime(effectiveArrivalTime, deadline)) {
        hardViolations.push({
          constraintType: CONSTRAINT_TYPES.HARD,
          reasonCode: HARD_CONSTRAINT_REASON_CODES.ARRIVAL_TOO_LATE,
          message: `Arrival deadline exceeded: journey arrives at ${effectiveArrivalTime}, but target arrival deadline is ${deadline}`,
          field: 'targetArrivalTime',
          threshold: deadline,
          actualValue: effectiveArrivalTime
        });
      }
    }

    // -------------------------------------------------------------------------
    // 3. HARD CONSTRAINT: MAXIMUM TRANSFERS (TOO_MANY_TRANSFERS)
    // -------------------------------------------------------------------------
    if (constraints.maxTransfers !== undefined && constraints.maxTransfers !== null) {
      const maxTransfers = Number(constraints.maxTransfers);
      if (actualTransfers > maxTransfers) {
        hardViolations.push({
          constraintType: CONSTRAINT_TYPES.HARD,
          reasonCode: HARD_CONSTRAINT_REASON_CODES.TOO_MANY_TRANSFERS,
          message: `Transfer limit exceeded: journey requires ${actualTransfers} transfers, exceeding maximum allowed of ${maxTransfers}`,
          field: 'maxTransfers',
          threshold: maxTransfers,
          actualValue: actualTransfers
        });
      }
    }

    // -------------------------------------------------------------------------
    // 4. HARD CONSTRAINT: MAXIMUM WALKING MINUTES / DISTANCE (WALKING_LIMIT_EXCEEDED)
    // -------------------------------------------------------------------------
    const maxWalkingMin = constraints.maxWalkingMinutes !== undefined && constraints.maxWalkingMinutes !== null
      ? Number(constraints.maxWalkingMinutes)
      : (constraints.walkingToleranceMinutes !== undefined && constraints.walkingToleranceMinutes !== null
        ? Number(constraints.walkingToleranceMinutes)
        : null);

    if (maxWalkingMin !== null && actualWalkingMinutes > maxWalkingMin) {
      hardViolations.push({
        constraintType: CONSTRAINT_TYPES.HARD,
        reasonCode: HARD_CONSTRAINT_REASON_CODES.WALKING_LIMIT_EXCEEDED,
        message: `Walking limit exceeded: journey requires ${actualWalkingMinutes} min walking, exceeding maximum allowed of ${maxWalkingMin} min`,
        field: 'maxWalkingMinutes',
        threshold: maxWalkingMin,
        actualValue: actualWalkingMinutes
      });
    }

    if (constraints.maxWalkingDistanceKm !== undefined && constraints.maxWalkingDistanceKm !== null) {
      const maxWalkKm = Number(constraints.maxWalkingDistanceKm);
      if (actualWalkingKm > maxWalkKm) {
        hardViolations.push({
          constraintType: CONSTRAINT_TYPES.HARD,
          reasonCode: HARD_CONSTRAINT_REASON_CODES.WALKING_LIMIT_EXCEEDED,
          message: `Walking distance limit exceeded: journey requires ${actualWalkingKm} km walking, exceeding limit of ${maxWalkKm} km`,
          field: 'maxWalkingDistanceKm',
          threshold: maxWalkKm,
          actualValue: actualWalkingKm
        });
      }
    }

    // -------------------------------------------------------------------------
    // 5. HARD CONSTRAINT: BUDGET / COST LIMIT (BUDGET_EXCEEDED)
    // -------------------------------------------------------------------------
    if (constraints.maxBudgetRupees !== undefined && constraints.maxBudgetRupees !== null) {
      const maxBudget = Number(constraints.maxBudgetRupees);
      if (actualCost > maxBudget) {
        hardViolations.push({
          constraintType: CONSTRAINT_TYPES.HARD,
          reasonCode: HARD_CONSTRAINT_REASON_CODES.BUDGET_EXCEEDED,
          message: `Budget limit exceeded: estimated journey cost of ₹${actualCost} exceeds maximum allowed budget of ₹${maxBudget}`,
          field: 'maxBudgetRupees',
          threshold: maxBudget,
          actualValue: actualCost
        });
      }
    }

    // -------------------------------------------------------------------------
    // 6. HARD CONSTRAINT: EXCLUDED TRANSPORT MODES (EXCLUDED_MODE)
    // -------------------------------------------------------------------------
    const avoidModes = Array.isArray(preferences.avoidModes)
      ? preferences.avoidModes
      : (Array.isArray(constraints.excludedModes)
        ? constraints.excludedModes
        : (Array.isArray(constraints.avoidModes) ? constraints.avoidModes : []));

    if (avoidModes.length > 0) {
      const avoidSet = new Set(avoidModes.map(m => String(m).toLowerCase()));
      for (const m of modesIncluded) {
        if (avoidSet.has(String(m).toLowerCase())) {
          hardViolations.push({
            constraintType: CONSTRAINT_TYPES.HARD,
            reasonCode: HARD_CONSTRAINT_REASON_CODES.EXCLUDED_MODE,
            message: `Excluded mode '${m}' present in journey`,
            field: 'avoidModes',
            threshold: avoidModes,
            actualValue: m
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // 7. HARD CONSTRAINT: ALLOWED TRANSPORT MODES WHITELIST (DISALLOWED_MODE)
    // -------------------------------------------------------------------------
    const allowedModes = Array.isArray(preferences.allowedModes) && preferences.allowedModes.length > 0
      ? preferences.allowedModes
      : (Array.isArray(constraints.allowedModes) && constraints.allowedModes.length > 0 ? constraints.allowedModes : null);

    if (allowedModes) {
      const allowedSet = new Set(allowedModes.map(m => String(m).toLowerCase()));
      for (const m of modesIncluded) {
        const modeLower = String(m).toLowerCase();
        // Walking is always allowed for first/last-mile access unless explicitly excluded in avoidModes
        if (modeLower !== 'walk' && !allowedSet.has(modeLower)) {
          hardViolations.push({
            constraintType: CONSTRAINT_TYPES.HARD,
            reasonCode: HARD_CONSTRAINT_REASON_CODES.DISALLOWED_MODE,
            message: `Mode '${m}' is not permitted by allowed modes whitelist [${allowedModes.join(', ')}]`,
            field: 'allowedModes',
            threshold: allowedModes,
            actualValue: m
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. HARD CONSTRAINT: TRANSPORT SERVICE AVAILABILITY (SERVICE_UNAVAILABLE)
    // -------------------------------------------------------------------------
    let hasServiceUnavailable = false;
    const segments = Array.isArray(journey.segments) ? journey.segments : [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const statusUpper = seg.status ? String(seg.status).toUpperCase() : 'OPERATIONAL';
      if (statusUpper === 'INACTIVE' || statusUpper === 'SUSPENDED' || statusUpper === 'CANCELLED' || statusUpper === 'UNAVAILABLE' || seg.isUsable === false) {
        hasServiceUnavailable = true;
        hardViolations.push({
          constraintType: CONSTRAINT_TYPES.HARD,
          reasonCode: HARD_CONSTRAINT_REASON_CODES.SERVICE_UNAVAILABLE,
          message: `Transport service unavailable: ${seg.lineIdentifier || seg.mode || `segment ${i}`} status is ${statusUpper}`,
          field: 'transportAvailability',
          threshold: 'OPERATIONAL',
          actualValue: statusUpper,
          segmentIndex: i
        });
      }
    }

    const unavailSegments = journey.unavailableSegments || journey.contextualImpact?.unavailableSegments || [];
    if (!hasServiceUnavailable && unavailSegments.length > 0) {
      hasServiceUnavailable = true;
      const firstUnavail = unavailSegments[0];
      hardViolations.push({
        constraintType: CONSTRAINT_TYPES.HARD,
        reasonCode: HARD_CONSTRAINT_REASON_CODES.SERVICE_UNAVAILABLE,
        message: `Transport service unavailable: ${firstUnavail.lineIdentifier || firstUnavail.mode || 'corridor'} is currently unavailable (${firstUnavail.reason || 'UNAVAILABLE'})`,
        field: 'transportAvailability',
        threshold: 'AVAILABLE',
        actualValue: firstUnavail.status || 'UNAVAILABLE'
      });
    }

    // -------------------------------------------------------------------------
    // 9. HARD CONSTRAINT: SERVICE OPERATING WINDOWS (OPERATING_HOURS_VIOLATED)
    // -------------------------------------------------------------------------
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isTransit = typeof seg.isTransit === 'function'
        ? seg.isTransit()
        : (seg.type === 'TRANSIT' || (seg.mode && seg.mode !== 'walk'));

      if (isTransit && seg.departureTime) {
        const operatingHours = this.scheduleService.getOperatingHours(seg.mode, seg);
        if (operatingHours) {
          const isWithin = this.scheduleService.isWithinOperatingHours(seg.departureTime, operatingHours);
          if (!isWithin) {
            hardViolations.push({
              constraintType: CONSTRAINT_TYPES.HARD,
              reasonCode: HARD_CONSTRAINT_REASON_CODES.OPERATING_HOURS_VIOLATED,
              message: `Operating hours violation: ${seg.lineIdentifier || seg.mode} departing at ${seg.departureTime} operates only between ${operatingHours.start} and ${operatingHours.end}`,
              field: 'serviceOperatingWindows',
              threshold: `${operatingHours.start}-${operatingHours.end}`,
              actualValue: seg.departureTime,
              segmentIndex: i
            });
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 10. HARD CONSTRAINT: DISRUPTION FEASIBILITY (ROUTE_DISRUPTED)
    // -------------------------------------------------------------------------
    if (!isFeasible || !isViable) {
      const reasonStr = journey.feasibilityReason ||
        journey.contextualImpact?.feasibilityReason ||
        'Route is impassable due to active transit disruption or critical service suspension';

      // Avoid redundant ROUTE_DISRUPTED if already flagged as SERVICE_UNAVAILABLE from identical root cause
      if (!hasServiceUnavailable || !reasonStr.includes('UNAVAILABLE')) {
        hardViolations.push({
          constraintType: CONSTRAINT_TYPES.HARD,
          reasonCode: HARD_CONSTRAINT_REASON_CODES.ROUTE_DISRUPTED,
          message: `Route disrupted: ${reasonStr}`,
          field: 'disruptionFeasibility',
          threshold: 'FEASIBLE',
          actualValue: reasonStr
        });
      }
    }

    // -------------------------------------------------------------------------
    // 11. SOFT PREFERENCES EVALUATION (Does NOT reject route)
    // -------------------------------------------------------------------------
    const preferredModes = Array.isArray(preferences.preferredModes) ? preferences.preferredModes : [];
    let preferredMatched = [];
    let preferredMissed = [];
    let preferenceAffinity = 1.0;

    if (preferredModes.length > 0) {
      const prefSet = new Set(preferredModes.map(m => String(m).toLowerCase()));
      preferredMatched = modesIncluded.filter(m => prefSet.has(String(m).toLowerCase()));
      preferredMissed = preferredModes.filter(p => !modesIncluded.some(m => String(m).toLowerCase() === String(p).toLowerCase()));

      if (preferredMatched.length > 0) {
        softNotes.push(`Matches student preferred mode(s): ${preferredMatched.join(', ')}`);
      } else {
        softNotes.push(`Does not utilize requested preferred modes [${preferredModes.join(', ')}]`);
        preferenceAffinity -= 0.15;
      }
    }

    const prefType = preferences.preference || 'balanced';
    if (prefType === 'cheapest') {
      preferenceAffinity += actualCost === 0 ? 0.2 : (actualCost <= 25 ? 0.1 : -0.1);
      softNotes.push(`Cost ₹${actualCost} evaluated for cheapest routing`);
    } else if (prefType === 'fastest') {
      preferenceAffinity += effectiveDuration <= 35 ? 0.15 : -0.1;
      softNotes.push(`Duration ${effectiveDuration}m evaluated for fastest routing`);
    } else if (prefType === 'least_walking') {
      preferenceAffinity += actualWalkingMinutes <= 10 ? 0.15 : (actualWalkingMinutes > 20 ? -0.2 : 0);
      softNotes.push(`Walking ${actualWalkingMinutes}m evaluated for least-walking routing`);
    } else if (prefType === 'fewest_transfers') {
      preferenceAffinity += actualTransfers === 0 ? 0.2 : (actualTransfers > 1 ? -0.2 : 0);
      softNotes.push(`Transfers ${actualTransfers} evaluated for fewest-transfers routing`);
    }

    preferenceAffinity = Math.max(0.1, Math.min(1.0, Number(preferenceAffinity.toFixed(2))));

    // -------------------------------------------------------------------------
    // 12. ASSEMBLE DETERMINISTIC RESULT
    // -------------------------------------------------------------------------
    const isAccepted = (hardViolations.length === 0);
    const status = isAccepted ? 'ACCEPTED' : 'REJECTED';
    const primaryReasonCode = hardViolations.length > 0 ? hardViolations[0].reasonCode : null;
    const reasonCodes = Array.from(new Set(hardViolations.map(v => v.reasonCode)));

    return {
      candidateId,
      isAccepted,
      status,
      primaryReasonCode,
      reasonCodes,
      violations: hardViolations,
      softPreferences: {
        preferredModesMatched: preferredMatched,
        preferredModesMissed: preferredMissed,
        isPreferredModeUsed: preferredMatched.length > 0,
        preferenceType: prefType,
        affinityScore: preferenceAffinity,
        notes: softNotes
      },
      evaluatedMetrics: {
        departureTime,
        effectiveArrivalTime,
        durationMinutes: effectiveDuration,
        transferCount: actualTransfers,
        walkingMinutes: actualWalkingMinutes,
        walkingDistanceKm: actualWalkingKm,
        costRupees: actualCost,
        isFeasible,
        primaryMode,
        modesIncluded
      },
      journey
    };
  }

  /**
   * Filters an array of candidates into accepted and rejected sets with a summary report.
   *
   * @param {Array<object>} candidates - Array of candidates (raw or evaluated)
   * @param {object} [options={}] - Filter criteria (constraints, preferences, targetArrivalTime, context)
   * @returns {object} Filter result containing accepted, rejected, allEvaluations, and summary
   */
  filterCandidates(candidates = [], options = {}) {
    if (!Array.isArray(candidates)) {
      throw new Error('Candidates must be an array');
    }

    const accepted = [];
    const rejected = [];
    const allEvaluations = [];
    const rejectionBreakdown = {};

    // Initialize counts for all known hard reason codes
    Object.values(HARD_CONSTRAINT_REASON_CODES).forEach(code => {
      rejectionBreakdown[code] = 0;
    });

    for (const cand of candidates) {
      const evaluation = this.evaluateRoute(cand, options);
      allEvaluations.push(evaluation);

      if (evaluation.isAccepted) {
        accepted.push(evaluation);
      } else {
        rejected.push(evaluation);
        for (const code of evaluation.reasonCodes) {
          rejectionBreakdown[code] = (rejectionBreakdown[code] || 0) + 1;
        }
      }
    }

    // Identify active hard constraints and soft preferences
    const hardConstraintsApplied = [];
    const constraints = options.constraints || {};
    const preferences = options.preferences || {};

    if (options.targetArrivalTime || options.desiredArrivalTime || constraints.targetArrivalTime || constraints.arrivalDeadline) {
      hardConstraintsApplied.push('arrivalDeadline');
    }
    if (constraints.maxTransfers !== undefined && constraints.maxTransfers !== null) {
      hardConstraintsApplied.push('maxTransfers');
    }
    if (constraints.maxWalkingMinutes !== undefined || constraints.walkingToleranceMinutes !== undefined) {
      hardConstraintsApplied.push('maxWalkingMinutes');
    }
    if (constraints.maxBudgetRupees !== undefined && constraints.maxBudgetRupees !== null) {
      hardConstraintsApplied.push('maxBudgetRupees');
    }
    if (preferences.avoidModes?.length > 0 || constraints.excludedModes?.length > 0) {
      hardConstraintsApplied.push('excludedModes');
    }
    if (preferences.allowedModes?.length > 0 || constraints.allowedModes?.length > 0) {
      hardConstraintsApplied.push('allowedModes');
    }
    hardConstraintsApplied.push('transportAvailability', 'serviceOperatingWindows', 'disruptionFeasibility');

    const softPreferencesApplied = [];
    if (preferences.preferredModes?.length > 0) {
      softPreferencesApplied.push('preferredModes');
    }
    if (preferences.preference) {
      softPreferencesApplied.push(`preference:${preferences.preference}`);
    }

    return {
      accepted,
      rejected,
      allEvaluations,
      summary: {
        totalEvaluated: candidates.length,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        rejectionBreakdown,
        hardConstraintsApplied,
        softPreferencesApplied
      }
    };
  }

  /**
   * Checks if time1 is strictly later than time2 on a standard 24-hour clock.
   *
   * @private
   * @param {string} time1 - "HH:MM"
   * @param {string} time2 - "HH:MM"
   * @returns {boolean}
   */
  _isLaterTime(time1, time2) {
    if (!time1 || !time2) return false;
    const clean1 = time1.substring(0, 5);
    const clean2 = time2.substring(0, 5);
    const [h1, m1] = clean1.split(':').map(Number);
    const [h2, m2] = clean2.split(':').map(Number);
    return (h1 * 60 + m1) > (h2 * 60 + m2);
  }
}

const routeConstraintFilteringService = new RouteConstraintFilteringService();

module.exports = {
  RouteConstraintFilteringService,
  routeConstraintFilteringService,
  CONSTRAINT_TYPES,
  HARD_CONSTRAINT_REASON_CODES,
  SOFT_PREFERENCE_CODES
};
