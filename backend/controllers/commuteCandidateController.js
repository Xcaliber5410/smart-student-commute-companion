/**
 * Commute Candidate Controller
 *
 * Exposes authenticated REST endpoints for generating candidate commute journeys.
 * Does NOT pretend to rank or pick the "best route" — returns transparent,
 * diverse, feasible candidate trips with full segment breakdowns and data provenance.
 */

const {
  candidateRouteEngine,
  studentCommutePreferenceService
} = require('../services');
const { success } = require('../utils/apiResponse');
const { ValidationError } = require('../errors');
const { findForbiddenPrivacyFields } = require('../models/CommutePlanInputDTO');

/**
 * Generates feasible candidate journeys connecting starting area to college destination.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function generateCandidateJourneys(req, res, next) {
  try {
    // 1. Strict privacy-by-design check
    const forbidden = findForbiddenPrivacyFields(req.body);
    if (forbidden.length > 0) {
      throw new ValidationError(`Privacy violation: Forbidden field(s) detected: ${forbidden.join(', ')}. Precise coordinates and residential addresses are prohibited.`);
    }

    // 2. Student scope & default preferences
    const studentId = req.user.id;
    let studentPrefs = null;
    try {
      studentPrefs = studentCommutePreferenceService.getPreferences(studentId, req.user);
    } catch (err) {
      // If student has not initialized preferences yet, proceed with defaults
      studentPrefs = null;
    }

    // 3. Resolve starting area (request body overrides stored default)
    const rawOrigin = req.body.startingArea || req.body.origin || studentPrefs?.default_origin_area || studentPrefs?.defaultOriginArea;
    if (!rawOrigin || typeof rawOrigin !== 'string' || rawOrigin.trim().length === 0) {
      throw new ValidationError('Starting area is required. Please provide startingArea or configure your default origin area in profile preferences.');
    }
    const startingArea = rawOrigin.trim();

    // 4. Resolve destination
    const rawDest = req.body.collegeDestination || req.body.destination || studentPrefs?.default_destination_college || studentPrefs?.defaultDestinationCollege || 'D.J. Sanghvi College of Engineering';
    const destination = rawDest.trim();

    // 5. Resolve timing
    const departureTime = req.body.desiredDepartureTime || req.body.departureTime || null;
    const targetArrivalTime = req.body.desiredArrivalTime || req.body.targetArrivalTime || null;

    // 6. Merge constraints (request overrides stored student preferences)
    const constraints = {
      maxTransfers: req.body.maxTransfers !== undefined
        ? Number(req.body.maxTransfers)
        : (studentPrefs?.max_transfers !== undefined
          ? studentPrefs.max_transfers
          : (studentPrefs?.maxTransfers !== undefined ? studentPrefs.maxTransfers : null)),
      maxWalkingMinutes: req.body.maxWalkingMinutes !== undefined
        ? Number(req.body.maxWalkingMinutes)
        : (req.body.walkingToleranceMinutes !== undefined
          ? Number(req.body.walkingToleranceMinutes)
          : (studentPrefs?.walking_tolerance_minutes !== undefined
            ? studentPrefs.walking_tolerance_minutes
            : (studentPrefs?.walkingToleranceMinutes !== undefined ? studentPrefs.walkingToleranceMinutes : null))),
      maxBudgetRupees: req.body.maxBudgetRupees !== undefined
        ? Number(req.body.maxBudgetRupees)
        : (studentPrefs?.max_budget_rupees !== undefined
          ? studentPrefs.max_budget_rupees
          : (studentPrefs?.maxBudgetRupees !== undefined ? studentPrefs.maxBudgetRupees : null))
    };

    // 7. Merge mode preferences
    const preferences = {
      allowedModes: req.body.allowedModes || null,
      avoidModes: req.body.avoidModes || (studentPrefs?.avoid_modes || studentPrefs?.avoidModes || []),
      preferredModes: req.body.preferredModes || (studentPrefs?.preferred_modes || studentPrefs?.preferredModes || ['train', 'metro', 'bus', 'auto', 'walk'])
    };

    const limit = req.body.limit !== undefined ? Number(req.body.limit) : 5;
    const date = req.body.date || 'Mon';
    const dayOfWeek = req.body.dayOfWeek || 'Mon';

    // 8. Generate candidates via CandidateRouteEngine
    const rawCandidates = await candidateRouteEngine.generateCandidates({
      origin: startingArea,
      destination,
      departureTime: departureTime || (targetArrivalTime ? undefined : '08:00'),
      targetArrivalTime,
      preferences,
      constraints,
      date,
      dayOfWeek,
      options: { limit }
    });

    // 9. Format candidate response payload
    const candidates = (rawCandidates || []).map(cand => ({
      id: cand.id,
      origin: cand.origin,
      destination: cand.destination,
      departureTime: cand.departureTime,
      estimatedArrivalTime: cand.estimatedArrivalTime,
      totalDurationMinutes: cand.totalDurationMinutes,
      totalWaitingTimeMinutes: cand.totalWaitingTimeMinutes,
      walkingTimeMinutes: cand.walkingTimeMinutes,
      transitTimeMinutes: cand.transitTimeMinutes,
      transferCount: cand.transferCount,
      estimatedCostRupees: cand.estimatedCostRupees,
      totalDistanceKm: cand.totalDistanceKm,
      primaryMode: cand.primaryMode,
      modesIncluded: cand.modesIncluded,
      isViable: cand.isViable,
      advisories: cand.advisories || [],
      provenance: cand.provenance ? cand.provenance.toJSON() : {
        tier: 'ESTIMATED',
        source: 'Candidate Route Generation Engine',
        description: 'Deterministic timetable propagation over prototype transit network'
      },
      limitations: 'Timetable and headway estimates; actual real-time conditions may vary with crowds, traffic, or transit disruptions.',
      segments: (cand.segments || []).map(seg => ({
        segmentIndex: seg.segmentIndex,
        type: seg.type,
        mode: seg.mode,
        from: seg.from,
        to: seg.to,
        departureTime: seg.departureTime,
        arrivalTime: seg.arrivalTime,
        durationMinutes: seg.durationMinutes,
        waitingTimeMinutes: seg.waitingTimeMinutes,
        distanceKm: seg.distanceKm,
        fareRupees: seg.fareRupees,
        serviceId: seg.serviceId,
        lineIdentifier: seg.lineIdentifier,
        lineInfo: seg.lineInfo,
        status: seg.status,
        provenance: seg.provenance ? seg.provenance.toJSON() : undefined
      }))
    }));

    return success(res, {
      candidateCount: candidates.length,
      candidates,
      queryContext: {
        studentId,
        startingArea,
        collegeDestination: destination,
        departureTime: departureTime || '08:00',
        targetArrivalTime: targetArrivalTime || null,
        appliedConstraints: constraints,
        appliedPreferences: preferences
      },
      provenanceMetadata: {
        dataTiers: ['VERIFIED', 'ESTIMATED'],
        hasEstimatedData: true,
        limitations: 'Prototype timetable and network model; candidate journeys represent feasible trip options prior to recommendation scoring.'
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generateCandidateJourneys
};
