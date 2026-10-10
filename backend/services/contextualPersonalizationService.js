/**
 * ContextualPersonalizationService
 *
 * Context-collection layer that enriches commute recommendations with relevant
 * student context (academic schedule, class start times, calendar entries, saved preferences,
 * workload constraints) when available.
 *
 * Design Guarantees:
 * 1. Reuses existing calendar, schedule, preference, and workload repositories/services.
 * 2. Does not recreate or duplicate the academic domain.
 * 3. Every context source is optional and gracefully handles missing/null data.
 * 4. Commute requests remain 100% functional when academic context is absent or anonymous.
 * 5. Strictly distinguishes explicit user input from saved preferences and derived context.
 * 6. Never assumes or fabricates an academic event unless explicitly supported by data.
 * 7. Enforces strict authorization to prevent cross-student private data exposure.
 * 8. Never collects or stores continuous GPS telemetry or precise residential addresses.
 */

const {
  ContextualCommutePersonalization,
  CONTEXT_SOURCES
} = require('../models/ContextualCommutePersonalization');
const { userRepository } = require('../repositories/UserRepository');
const { studentProfileRepository } = require('../repositories/StudentProfileRepository');
const { studentCommutePreferenceRepository } = require('../repositories/StudentCommutePreferenceRepository');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { workloadAnalysisService } = require('./workloadAnalysisService');
const { courseRepository } = require('../repositories/CourseRepository');
const { findForbiddenPrivacyFields } = require('../models/CommutePlanInputDTO');
const {
  getMumbaiNow,
  getMumbaiDayOfWeek,
  getMumbaiTimeHHMM,
  getDateKeyIST,
  IST_OFFSET_MS
} = require('../utils/timezone');
const {
  ForbiddenError,
  ValidationError
} = require('../errors');

class ContextualPersonalizationService {
  /**
   * @param {object} [options={}]
   * @param {object} [options.userRepo]
   * @param {object} [options.profileRepo]
   * @param {object} [options.preferenceRepo]
   * @param {object} [options.calendarEventRepo]
   * @param {object} [options.scheduleRepo]
   * @param {object} [options.workloadService]
   * @param {object} [options.courseRepo]
   */
  constructor(options = {}) {
    this.userRepo = options.userRepo || userRepository;
    this.profileRepo = options.profileRepo || studentProfileRepository;
    this.preferenceRepo = options.preferenceRepo || studentCommutePreferenceRepository;
    this.calendarEventRepo = options.calendarEventRepo || calendarEventRepository;
    this.scheduleRepo = options.scheduleRepo || studentScheduleRepository;
    this.workloadService = options.workloadService || workloadAnalysisService;
    this.courseRepo = options.courseRepo || courseRepository;
  }

  /**
   * Asserts whether the requesting user has permission to access the target student's private context.
   *
   * @param {string} targetUserId
   * @param {object|null} requestingUser
   */
  assertStudentAccess(targetUserId, requestingUser) {
    if (!targetUserId) return true;
    if (!requestingUser) return true; // Internal service invocation without auth envelope

    if (requestingUser.role === 'admin' || requestingUser.id === targetUserId) {
      return true;
    }

    throw new ForbiddenError(
      "Access forbidden: you do not have permission to access another student's private academic or commute context"
    );
  }

  /**
   * Collects, normalizes, and resolves student-specific context (preferences, calendar events,
   * schedules, workload) alongside explicit input for the commute recommendation engine.
   *
   * @param {object} [params={}] - Incoming request payload / parameters
   * @param {object|null} [requestingUser=null] - Authenticated user session
   * @param {object} [options={}] - Execution options
   * @returns {Promise<ContextualCommutePersonalization>}
   */
  async collectStudentContext(params = {}, requestingUser = null, options = {}) {
    // 1. Strict Privacy Audit: assert absence of forbidden precise location/tracking fields
    const forbidden = findForbiddenPrivacyFields(params);
    if (forbidden.length > 0) {
      throw new ValidationError(
        `Privacy violation: Forbidden field(s) detected: ${forbidden.join(', ')}. Precise coordinates and residential tracking are prohibited.`
      );
    }

    // 2. Resolve Student ID and assert access controls
    const studentId = params.studentId || requestingUser?.id || options.studentId || null;
    this.assertStudentAccess(studentId, requestingUser);

    // 3. Resolve Timing Context in Mumbai IST
    const requestTimestamp = typeof options.currentTime === 'number'
      ? options.currentTime
      : (typeof params.currentTime === 'number' ? params.currentTime : Date.now());

    const { targetDate, dayOfWeek, rangeStart, rangeEnd } = this._resolveDateRange(
      params.date || options.date || params.dayOfWeek || options.dayOfWeek,
      requestTimestamp
    );

    // 4. Capture Explicit Input
    const explicitInput = {
      origin: (typeof params.origin === 'string' && params.origin.trim())
        ? params.origin.trim()
        : ((typeof params.startingArea === 'string' && params.startingArea.trim()) ? params.startingArea.trim() : null),
      destination: (typeof params.destination === 'string' && params.destination.trim())
        ? params.destination.trim()
        : ((typeof params.collegeDestination === 'string' && params.collegeDestination.trim()) ? params.collegeDestination.trim() : null),
      desiredDepartureTime: params.desiredDepartureTime || params.departureTime || null,
      desiredArrivalTime: params.desiredArrivalTime || params.targetArrivalTime || params.arrivalDeadline || null,
      preferredModes: Array.isArray(params.preferredModes) ? params.preferredModes : null,
      avoidModes: Array.isArray(params.avoidModes) ? params.avoidModes : null,
      routePreference: params.routePreference || params.preference || null,
      constraints: params.constraints || null
    };

    // 5. If no studentId is available, return default personalization immediately
    if (!studentId) {
      return ContextualCommutePersonalization.createDefault({
        ...explicitInput,
        studentId: null,
        date: targetDate,
        dayOfWeek,
        currentTime: requestTimestamp
      });
    }

    // 6. Safe Collection: Saved Preferences & Commute Profile
    const savedPrefs = await this._loadSavedPreferences(studentId);

    // 7. Safe Collection: Calendar Events & Today's Academic Schedule
    const academicContext = await this._loadAcademicContext(studentId, rangeStart, rangeEnd, dayOfWeek, explicitInput.desiredDepartureTime);

    // 8. Safe Collection: Workload Metrics & Overload Warnings
    const workloadContext = await this._loadWorkloadContext(studentId, rangeStart, rangeEnd);

    // 9. Synthesize Deterministic Resolved Personalization (distinguishing data origins)
    const resolvedPersonalization = this._resolvePersonalizationParameters({
      explicitInput,
      savedPrefs,
      academicContext,
      workloadContext
    });

    return new ContextualCommutePersonalization({
      studentId,
      requestTimestamp,
      targetDate,
      dayOfWeek,
      explicitInput,
      savedPreferences: savedPrefs,
      academicContext,
      workloadContext,
      resolvedPersonalization,
      privacyGuarantees: {
        coarseLocationOnly: true,
        noContinuousTracking: true,
        studentScoped: true
      }
    });
  }

  /**
   * Helper to resolve the temporal date window in Mumbai IST.
   * @private
   */
  _resolveDateRange(requestedDate, requestTimestamp) {
    const baseDate = new Date(requestTimestamp);
    let targetDateKey = getDateKeyIST(requestTimestamp);
    let dayOfWeek = getMumbaiDayOfWeek(baseDate);

    if (typeof requestedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate.trim())) {
      targetDateKey = requestedDate.trim();
      const [y, m, d] = targetDateKey.split('-').map(Number);
      const parsedUtcMillis = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS;
      dayOfWeek = getMumbaiDayOfWeek(new Date(parsedUtcMillis));
    } else if (typeof requestedDate === 'string' && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(requestedDate.trim())) {
      dayOfWeek = requestedDate.trim();
    }

    const [yyyy, mm, dd] = targetDateKey.split('-').map(Number);
    const rangeStart = Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0) - IST_OFFSET_MS;
    const rangeEnd = rangeStart + (24 * 3600 * 1000) - 1;

    return {
      targetDate: targetDateKey,
      dayOfWeek,
      rangeStart,
      rangeEnd
    };
  }

  /**
   * Safely loads saved student preferences.
   * @private
   */
  async _loadSavedPreferences(studentId) {
    let prefEntity = null;
    let profileEntity = null;

    try {
      if (this.preferenceRepo && typeof this.preferenceRepo.findByUserId === 'function') {
        prefEntity = this.preferenceRepo.findByUserId(studentId);
      }
    } catch (err) {
      prefEntity = null;
    }

    try {
      if (this.profileRepo && typeof this.profileRepo.findByUserId === 'function') {
        profileEntity = this.profileRepo.findByUserId(studentId);
      }
    } catch (err) {
      profileEntity = null;
    }

    if (!prefEntity && !profileEntity) {
      return {
        hasSavedPreferences: false,
        preference: null,
        preferredModes: ['train', 'metro', 'bus', 'auto', 'walk'],
        avoidModes: [],
        walkingToleranceMinutes: null,
        maxBudgetRupees: null,
        maxTransfers: null,
        defaultOriginArea: null,
        defaultDestinationCollege: null,
        defaultArrivalTime: null
      };
    }

    const preferredModes = Array.isArray(prefEntity?.preferred_modes)
      ? prefEntity.preferred_modes
      : (Array.isArray(profileEntity?.preferred_modes) ? profileEntity.preferred_modes : ['train', 'metro', 'bus', 'auto', 'walk']);

    const avoidModes = Array.isArray(prefEntity?.avoid_modes)
      ? prefEntity.avoid_modes
      : (Array.isArray(prefEntity?.avoidModes) ? prefEntity.avoidModes : []);

    const walkingTolerance = prefEntity?.walking_tolerance_minutes !== undefined && prefEntity?.walking_tolerance_minutes !== null
      ? Number(prefEntity.walking_tolerance_minutes)
      : (profileEntity?.walking_tolerance_minutes !== undefined ? Number(profileEntity.walking_tolerance_minutes) : null);

    const maxBudget = prefEntity?.max_budget_rupees !== undefined && prefEntity?.max_budget_rupees !== null
      ? Number(prefEntity.max_budget_rupees)
      : (profileEntity?.max_budget_rupees !== undefined ? Number(profileEntity.max_budget_rupees) : null);

    const maxTransfers = prefEntity?.max_transfers !== undefined && prefEntity?.max_transfers !== null
      ? Number(prefEntity.max_transfers)
      : null;

    const defaultOriginArea = prefEntity?.default_origin_area || profileEntity?.home_area || null;
    const defaultDestinationCollege = prefEntity?.default_destination_college || profileEntity?.default_college || 'D.J. Sanghvi College of Engineering';
    const defaultArrivalTime = profileEntity?.default_arrival_time || null;

    return {
      hasSavedPreferences: true,
      preference: prefEntity?.preference || 'balanced',
      preferredModes,
      avoidModes,
      walkingToleranceMinutes: walkingTolerance,
      maxBudgetRupees: maxBudget,
      maxTransfers,
      defaultOriginArea,
      defaultDestinationCollege,
      defaultArrivalTime
    };
  }

  /**
   * Safely loads scheduled calendar events and recurring commute schedule.
   * @private
   */
  async _loadAcademicContext(studentId, rangeStart, rangeEnd, dayOfWeek, desiredDepartureTime) {
    let rawEvents = [];
    try {
      if (this.calendarEventRepo && typeof this.calendarEventRepo.findInRange === 'function') {
        rawEvents = this.calendarEventRepo.findInRange(studentId, rangeStart, rangeEnd, { status: 'scheduled' });
      }
    } catch (err) {
      rawEvents = [];
    }

    // Format events into normalized summary objects
    const todayEvents = rawEvents.map(e => {
      const startIst = new Date(e.start_time + IST_OFFSET_MS);
      const endIst = new Date(e.end_time + IST_OFFSET_MS);

      const startH = String(startIst.getUTCHours()).padStart(2, '0');
      const startM = String(startIst.getUTCMinutes()).padStart(2, '0');
      const endH = String(endIst.getUTCHours()).padStart(2, '0');
      const endM = String(endIst.getUTCMinutes()).padStart(2, '0');

      let courseName = null;
      if (e.course_id && this.courseRepo && typeof this.courseRepo.findById === 'function') {
        try {
          const c = this.courseRepo.findById(e.course_id);
          courseName = c ? c.name : null;
        } catch (_) {}
      }

      return {
        id: e.id,
        title: e.title,
        eventType: e.event_type || 'lecture',
        courseId: e.course_id || null,
        courseName,
        startTime: e.start_time,
        startTimeHHMM: `${startH}:${startM}`,
        endTime: e.end_time,
        endTimeHHMM: `${endH}:${endM}`,
        location: e.location || null,
        durationMinutes: e.durationMinutes || Math.round((e.end_time - e.start_time) / 60000)
      };
    });

    // Determine upcoming class/lecture/event
    // Filter for events starting after or around desired departure time
    let nextClass = null;
    if (todayEvents.length > 0) {
      if (desiredDepartureTime && /^\d{2}:\d{2}$/.test(desiredDepartureTime)) {
        // Find earliest event starting at or after departure time
        const futureEvents = todayEvents.filter(e => e.startTimeHHMM >= desiredDepartureTime);
        nextClass = futureEvents.length > 0 ? futureEvents[0] : todayEvents[0];
      } else {
        // Default to the first event of the day
        nextClass = todayEvents[0];
      }
    }

    // Check recurring schedule for matching day of week
    let recurringSchedule = null;
    try {
      if (this.scheduleRepo && typeof this.scheduleRepo.findByUserId === 'function') {
        const schedules = this.scheduleRepo.findByUserId(studentId, { active: true });
        const matching = schedules.find(s => {
          const days = Array.isArray(s.days_of_week) ? s.days_of_week : [];
          return days.some(d => String(d).toLowerCase() === String(dayOfWeek).toLowerCase());
        });
        if (matching) {
          recurringSchedule = {
            id: matching.id,
            title: matching.title,
            origin: matching.origin,
            destination: matching.destination,
            targetArrivalTime: matching.target_arrival_time,
            daysOfWeek: Array.isArray(matching.days_of_week) ? [...matching.days_of_week] : []
          };
        }
      }
    } catch (err) {
      recurringSchedule = null;
    }

    return {
      hasAcademicContext: todayEvents.length > 0 || recurringSchedule !== null,
      scheduledEventsCount: todayEvents.length,
      hasScheduledClass: nextClass !== null,
      nextClass,
      todayEvents,
      recurringSchedule
    };
  }

  /**
   * Safely loads workload metrics for the target date.
   * @private
   */
  async _loadWorkloadContext(studentId, rangeStart, rangeEnd) {
    if (!this.workloadService || typeof this.workloadService.getWorkloadSummary !== 'function') {
      return {
        hasWorkloadContext: false,
        isHeavyDay: false,
        loadLevel: 'light',
        totalCommitmentMinutes: 0,
        assignmentsDueCount: 0,
        hasConflicts: false,
        conflictsCount: 0
      };
    }

    try {
      const summary = await this.workloadService.getWorkloadSummary(studentId, {
        start: rangeStart,
        end: rangeEnd
      });

      const daySummary = summary.dailyBreakdown?.[0] || {};
      const isHeavyDay = Boolean(daySummary.isHeavyDay || summary.summary?.heavyDaysCount > 0);
      const loadLevel = daySummary.loadLevel || (isHeavyDay ? 'heavy' : 'light');

      return {
        hasWorkloadContext: true,
        isHeavyDay,
        loadLevel,
        totalCommitmentMinutes: Number(daySummary.totalCommitmentMinutes || 0),
        assignmentsDueCount: Number(daySummary.assignmentsDueCount || 0),
        hasConflicts: Boolean(summary.hasConflicts),
        conflictsCount: Number(summary.conflicts?.length || 0)
      };
    } catch (err) {
      return {
        hasWorkloadContext: false,
        isHeavyDay: false,
        loadLevel: 'light',
        totalCommitmentMinutes: 0,
        assignmentsDueCount: 0,
        hasConflicts: false,
        conflictsCount: 0
      };
    }
  }

  /**
   * Resolves effective parameters with transparent source attribution.
   * Distinguishes EXPLICIT_INPUT from ACADEMIC_EVENT, RECURRING_SCHEDULE, SAVED_PREFERENCE, and DEFAULT.
   * @private
   */
  _resolvePersonalizationParameters({ explicitInput, savedPrefs, academicContext, workloadContext }) {
    academicContext.scheduleConflicts = academicContext.scheduleConflicts || [];
    academicContext.influencingFactors = academicContext.influencingFactors || [];

    // 1. Origin Resolution
    let effectiveOrigin = '';
    let originSource = CONTEXT_SOURCES.DEFAULT;

    if (explicitInput.origin) {
      effectiveOrigin = explicitInput.origin;
      originSource = CONTEXT_SOURCES.EXPLICIT_INPUT;
    } else if (academicContext.recurringSchedule?.origin) {
      effectiveOrigin = academicContext.recurringSchedule.origin;
      originSource = CONTEXT_SOURCES.RECURRING_SCHEDULE;
    } else if (savedPrefs.defaultOriginArea) {
      effectiveOrigin = savedPrefs.defaultOriginArea;
      originSource = CONTEXT_SOURCES.SAVED_PREFERENCE;
    } else {
      effectiveOrigin = '';
      originSource = CONTEXT_SOURCES.DEFAULT;
    }

    // 2. Destination Resolution
    let effectiveDestination = 'D.J. Sanghvi College of Engineering';
    let destinationSource = CONTEXT_SOURCES.DEFAULT;

    if (explicitInput.destination) {
      effectiveDestination = explicitInput.destination;
      destinationSource = CONTEXT_SOURCES.EXPLICIT_INPUT;
    } else if (academicContext.nextClass?.location && this._isRecognizedDestination(academicContext.nextClass.location)) {
      effectiveDestination = academicContext.nextClass.location;
      destinationSource = CONTEXT_SOURCES.ACADEMIC_EVENT;
    } else if (academicContext.recurringSchedule?.destination) {
      effectiveDestination = academicContext.recurringSchedule.destination;
      destinationSource = CONTEXT_SOURCES.RECURRING_SCHEDULE;
    } else if (savedPrefs.defaultDestinationCollege) {
      effectiveDestination = savedPrefs.defaultDestinationCollege;
      destinationSource = CONTEXT_SOURCES.SAVED_PREFERENCE;
    }

    // 3. Check Academic Destination Connection
    // Invariant: If class location is missing or does not match commute destination, do not invent a connection!
    const hasClass = Boolean(academicContext.nextClass);
    const classLoc = academicContext.nextClass?.location;
    const isDestinationMatched = hasClass && Boolean(classLoc) && this.isLocationMatchingDestination(classLoc, effectiveDestination);
    academicContext.isDestinationMatched = isDestinationMatched;

    if (hasClass) {
      if (!classLoc) {
        academicContext.influencingFactors.push(
          `Class '${academicContext.nextClass.title}' location is missing; no commute destination connection inferred.`
        );
      } else if (!isDestinationMatched) {
        academicContext.influencingFactors.push(
          `Class '${academicContext.nextClass.title}' location ('${classLoc}') does not match commute destination ('${effectiveDestination}'); no connection inferred.`
        );
        academicContext.scheduleConflicts.push({
          type: 'COMMUTE_DESTINATION_MISMATCH',
          title: academicContext.nextClass.title,
          eventTime: academicContext.nextClass.startTimeHHMM,
          requestedTime: explicitInput.desiredDepartureTime || null,
          detail: `Commute destination '${effectiveDestination}' differs from '${academicContext.nextClass.title}' location '${classLoc}'.`
        });
      }
    }

    // 4. Arrival Deadline Resolution
    let effectiveArrivalDeadline = null;
    let arrivalDeadlineSource = CONTEXT_SOURCES.NONE;

    if (explicitInput.desiredArrivalTime) {
      // Preserve explicit arrival deadline strictly
      effectiveArrivalDeadline = explicitInput.desiredArrivalTime;
      arrivalDeadlineSource = CONTEXT_SOURCES.EXPLICIT_INPUT;

      if (isDestinationMatched && academicContext.nextClass?.startTimeHHMM) {
        if (this._isTimeAfter(explicitInput.desiredArrivalTime, academicContext.nextClass.startTimeHHMM)) {
          academicContext.scheduleConflicts.push({
            type: 'ARRIVAL_AFTER_CLASS_START',
            title: academicContext.nextClass.title,
            eventTime: academicContext.nextClass.startTimeHHMM,
            requestedTime: explicitInput.desiredArrivalTime,
            detail: `Requested arrival at ${explicitInput.desiredArrivalTime} is after '${academicContext.nextClass.title}' starts at ${academicContext.nextClass.startTimeHHMM}.`
          });
          academicContext.influencingFactors.push(
            `Schedule conflict: requested arrival deadline (${explicitInput.desiredArrivalTime}) is after '${academicContext.nextClass.title}' starts at ${academicContext.nextClass.startTimeHHMM}.`
          );
        } else {
          academicContext.influencingFactors.push(
            `Preserved explicit arrival deadline of ${explicitInput.desiredArrivalTime} ahead of '${academicContext.nextClass.title}' at ${academicContext.nextClass.startTimeHHMM}.`
          );
        }
      } else {
        academicContext.influencingFactors.push(
          `Preserved explicit arrival deadline of ${explicitInput.desiredArrivalTime}.`
        );
      }
    } else if (isDestinationMatched && academicContext.nextClass?.startTimeHHMM) {
      // Arrival deadline derived from class start time because destination matches
      effectiveArrivalDeadline = academicContext.nextClass.startTimeHHMM;
      arrivalDeadlineSource = CONTEXT_SOURCES.ACADEMIC_EVENT;
      academicContext.influencingFactors.push(
        `Upcoming class '${academicContext.nextClass.title}' at ${academicContext.nextClass.startTimeHHMM} established arrival deadline of ${academicContext.nextClass.startTimeHHMM}.`
      );
    } else if (academicContext.recurringSchedule?.targetArrivalTime) {
      effectiveArrivalDeadline = academicContext.recurringSchedule.targetArrivalTime;
      arrivalDeadlineSource = CONTEXT_SOURCES.RECURRING_SCHEDULE;
      academicContext.influencingFactors.push(
        `Recurring weekly schedule established arrival deadline of ${effectiveArrivalDeadline}.`
      );
    } else if (savedPrefs.defaultArrivalTime) {
      effectiveArrivalDeadline = savedPrefs.defaultArrivalTime;
      arrivalDeadlineSource = CONTEXT_SOURCES.SAVED_PREFERENCE;
      academicContext.influencingFactors.push(
        `Saved student preference established arrival deadline of ${effectiveArrivalDeadline}.`
      );
    }

    // 5. Departure Time Resolution
    let effectiveDepartureTime = '08:00';
    let departureTimeSource = CONTEXT_SOURCES.DEFAULT;

    if (explicitInput.desiredDepartureTime) {
      effectiveDepartureTime = explicitInput.desiredDepartureTime;
      departureTimeSource = CONTEXT_SOURCES.EXPLICIT_INPUT;
    } else if (effectiveArrivalDeadline) {
      effectiveDepartureTime = this._subtractMinutes(effectiveArrivalDeadline, 45);
      departureTimeSource = CONTEXT_SOURCES.DERIVED_CONTEXT;
    }

    // 6. Route Preference Profile Resolution
    let effectiveRoutePreference = 'balanced';
    let routePreferenceSource = CONTEXT_SOURCES.DEFAULT;

    if (explicitInput.routePreference) {
      effectiveRoutePreference = explicitInput.routePreference;
      routePreferenceSource = CONTEXT_SOURCES.EXPLICIT_INPUT;
    } else if (savedPrefs.preference) {
      effectiveRoutePreference = savedPrefs.preference;
      routePreferenceSource = CONTEXT_SOURCES.SAVED_PREFERENCE;
    }

    // 7. Mode Preferences Resolution
    const effectivePreferredModes = Array.isArray(explicitInput.preferredModes)
      ? explicitInput.preferredModes
      : savedPrefs.preferredModes;

    const effectiveAvoidModes = Array.isArray(explicitInput.avoidModes)
      ? explicitInput.avoidModes
      : savedPrefs.avoidModes;

    // 8. Constraints Resolution
    const effectiveConstraints = {
      maxTransfers: explicitInput.constraints?.maxTransfers !== undefined && explicitInput.constraints?.maxTransfers !== null
        ? Number(explicitInput.constraints.maxTransfers)
        : savedPrefs.maxTransfers,
      maxWalkingMinutes: explicitInput.constraints?.maxWalkingMinutes !== undefined && explicitInput.constraints?.maxWalkingMinutes !== null
        ? Number(explicitInput.constraints.maxWalkingMinutes)
        : savedPrefs.walkingToleranceMinutes,
      maxBudgetRupees: explicitInput.constraints?.maxBudgetRupees !== undefined && explicitInput.constraints?.maxBudgetRupees !== null
        ? Number(explicitInput.constraints.maxBudgetRupees)
        : savedPrefs.maxBudgetRupees
    };

    // 9. Schedule & Workload Constraints
    const isExamDay = academicContext.todayEvents.some(e => e.eventType === 'exam');
    const recommendedBufferMinutes = isExamDay ? 20 : (isDestinationMatched ? 10 : 5);
    const heavyWorkloadCaution = Boolean(workloadContext.isHeavyDay);

    academicContext.isExamDay = isExamDay;
    academicContext.recommendedBufferMinutes = recommendedBufferMinutes;

    if (isExamDay) {
      academicContext.influencingFactors.push('Exam day detected: elevated 20-minute punctuality buffer recommended.');
    }
    if (heavyWorkloadCaution) {
      academicContext.influencingFactors.push('Heavy academic workload detected: reliable low-risk transit recommended.');
    }
    if (workloadContext.hasConflicts) {
      academicContext.scheduleConflicts.push({
        type: 'WORKLOAD_CONFLICTS',
        title: 'Workload Conflicts',
        eventTime: 'today',
        requestedTime: null,
        detail: `${workloadContext.conflictsCount} academic schedule conflict(s) detected in student calendar.`
      });
    }

    return {
      effectiveOrigin,
      originSource,
      effectiveDestination,
      destinationSource,
      effectiveArrivalDeadline,
      arrivalDeadlineSource,
      effectiveDepartureTime,
      departureTimeSource,
      effectiveRoutePreference,
      routePreferenceSource,
      effectivePreferredModes,
      effectiveAvoidModes,
      effectiveConstraints,
      scheduleConstraints: {
        mustArriveBefore: effectiveArrivalDeadline,
        recommendedBufferMinutes,
        isExamDay,
        heavyWorkloadCaution,
        scheduleConflicts: academicContext.scheduleConflicts,
        influencingFactors: academicContext.influencingFactors
      }
    };
  }

  /**
   * Helper: checks if an academic event's location matches the commute destination.
   * Prevents inventing connections between missing or mismatched locations and destinations.
   *
   * @param {string|null} eventLocation
   * @param {string|null} commuteDestination
   * @returns {boolean}
   */
  isLocationMatchingDestination(eventLocation, commuteDestination) {
    if (!eventLocation || typeof eventLocation !== 'string') return false;
    if (!commuteDestination || typeof commuteDestination !== 'string') return false;

    const loc = eventLocation.trim().toLowerCase();
    const dest = commuteDestination.trim().toLowerCase();

    if (!loc || !dest) return false;

    // Internal room/hall check: if eventLocation is ONLY a room/lab/floor without campus,
    // its campus destination is missing
    const internalOnlyRegex = /^(room|lab|hall|floor|class|classroom|cabin|cr|lh)\s*[-#]?\s*\d+[a-z]?$/i;
    if (internalOnlyRegex.test(loc)) {
      return false;
    }

    const cleanLoc = loc.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanDest = dest.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    if (cleanLoc === cleanDest) return true;
    if (cleanLoc.includes(cleanDest) || cleanDest.includes(cleanLoc)) return true;

    // Campus alias tokens
    const campusAliases = [
      { key: 'djsanghvi', tokens: ['dj sanghvi', 'd j sanghvi', 'djsanghvi', 'djsce', 'sanghvi'] },
      { key: 'vjti', tokens: ['vjti', 'veermata jijabai'] },
      { key: 'spit', tokens: ['spit', 'sardar patel'] },
      { key: 'iitb', tokens: ['iit bombay', 'iit powai', 'iitb'] },
      { key: 'nmims', tokens: ['nmims', 'narsee monjee'] },
      { key: 'mithibai', tokens: ['mithibai'] }
    ];

    for (const campus of campusAliases) {
      const locMatches = campus.tokens.some(t => cleanLoc.includes(t));
      const destMatches = campus.tokens.some(t => cleanDest.includes(t));
      if (locMatches && destMatches) {
        return true;
      }
    }

    return false;
  }

  /**
   * Helper: returns true if timeA is strictly after timeB (HH:MM format).
   * @private
   */
  _isTimeAfter(timeA, timeB) {
    if (!timeA || !timeB) return false;
    const [hA, mA] = timeA.split(':').map(Number);
    const [hB, mB] = timeB.split(':').map(Number);
    return (hA * 60 + mA) > (hB * 60 + mB);
  }

  /**
   * Helper: checks if location string resembles a recognized campus or campus landmark
   * rather than an internal classroom number (e.g. "Room 302").
   * @private
   */
  _isRecognizedDestination(loc) {
    if (!loc || typeof loc !== 'string') return false;
    const clean = loc.toLowerCase().trim();
    if (clean.includes('room') || clean.includes('lab') || clean.includes('floor') || clean.includes('hall')) {
      return false;
    }
    return clean.length >= 3;
  }

  /**
   * Helper: subtracts minutes from HH:MM string.
   * @private
   */
  _subtractMinutes(hhmm, mins) {
    const [h, m] = (hhmm || '09:00').split(':').map(Number);
    let total = (h * 60 + m) - mins;
    if (total < 0) total = (total % 1440 + 1440) % 1440;
    const newH = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const newM = String(total % 60).padStart(2, '0');
    return `${newH}:${newM}`;
  }
}

const contextualPersonalizationService = new ContextualPersonalizationService();

module.exports = {
  ContextualPersonalizationService,
  contextualPersonalizationService
};
