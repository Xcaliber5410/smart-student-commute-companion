/**
 * StudyPlanningService
 *
 * Deterministic study planning engine for students.
 * Generates practical, conflict-free planned study work based on actual student data:
 * - Upcoming assignment deadlines & priorities
 * - Student goals & progress
 * - Existing calendar commitments (CalendarEvents) & study sessions (StudySessions)
 * - Sensible daily study limits and fatigue-conscious session chunking
 * - Non-AI, 100% deterministic rules with clear explainability
 */

const { studyPlanRepository } = require('../repositories/StudyPlanRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { workloadAnalysisService } = require('./workloadAnalysisService');
const { resourceContextService } = require('./resourceContextService');
const { StudyPlan } = require('../models/StudyPlan');
const { StudyPlanItem } = require('../models/StudyPlanItem');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError } = require('../errors');
const { getDateKeyIST, IST_OFFSET_MS, formatInMumbaiTime } = require('../utils/timezone');

const { notificationService } = require('./notificationService');
const { getConnection } = require('../db/connection');

// Priority weight multipliers for deterministic ranking
const PRIORITY_WEIGHTS = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

class StudyPlanningService {
  constructor(options = {}) {
    this.studyPlanRepo = options.studyPlanRepo || studyPlanRepository;
    this.assignmentRepo = options.assignmentRepo || assignmentRepository;
    this.goalRepo = options.goalRepo || goalRepository;
    this.calendarEventRepo = options.calendarEventRepo || calendarEventRepository;
    this.studySessionRepo = options.studySessionRepo || studySessionRepository;
    this.courseRepo = options.courseRepo || courseRepository;
    this.workloadService = options.workloadService || workloadAnalysisService;
    this.resourceService = options.resourceService || resourceContextService;
    this.notificationService = options.notificationService || notificationService;
    this.db = options.db || null;
  }

  get database() {
    return this.db || getConnection();
  }


  /**
   * Evaluates pending academic work, active goals, and existing calendar commitments
   * to determine upcoming study needs over a planning window.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - { startDate, endDate, days = 7, courseId, now }
   * @returns {object} Workload and study needs assessment
   */
  async assessWorkloadAndNeeds(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Student user ID is required');
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const days = Math.min(30, Math.max(1, Number(options.days) || 7));
    const startDate = options.startDate ? Math.max(Number(options.startDate), now) : now;
    const endDate = options.endDate ? Number(options.endDate) : startDate + (days * 86400000);

    if (endDate <= startDate) {
      throw new ValidationError('End date must be strictly after start date');
    }

    // 1. Fetch uncompleted assignments
    const asgnOptions = { status: null };
    if (options.courseId) asgnOptions.course_id = options.courseId;
    const allAssignments = this.assignmentRepo.findByUserId(userId, asgnOptions);

    // Rule: Exclude completed, submitted, and cancelled assignments
    const upcomingAssignments = allAssignments.filter(a => {
      if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'submitted') return false;
      return a.due_date >= startDate;
    });

    const overdueAssignments = allAssignments.filter(a => {
      return (a.status === 'pending' || a.status === 'in_progress') && a.due_date < startDate;
    });

    // 2. Fetch active goals
    const allGoals = this.goalRepo.findByUserId(userId, options.courseId ? { course_id: options.courseId } : {});
    // Rule: Exclude completed, cancelled, on_hold, or 100% progress goals
    const activeGoals = allGoals.filter(g => {
      if (g.status === 'completed' || g.status === 'cancelled' || g.status === 'on_hold') return false;
      if (g.progress >= 100) return false;
      if (g.target_date && g.target_date < startDate) return false;
      return true;
    });

    // 3. Fetch existing commitments in range
    const calendarEvents = this.calendarEventRepo.findInRange(userId, startDate, endDate, { status: 'scheduled' });
    const studySessions = this.studySessionRepo.findInRange(userId, startDate, endDate, { status: 'planned' });
    const existingPlanItems = this.studyPlanRepo.findUpcomingItems(userId, { now: startDate, days, limit: 100 });

    // 4. Calculate required study minutes
    let totalEstimatedStudyMinutes = 0;
    const assignmentEstimates = upcomingAssignments.map(a => {
      const minutes = this._estimateAssignmentStudyMinutes(a);
      totalEstimatedStudyMinutes += minutes;
      return {
        id: a.id,
        title: a.title,
        priority: a.priority,
        status: a.status,
        dueDate: a.due_date,
        dueDateFormatted: formatInMumbaiTime(a.due_date),
        estimatedMinutes: minutes,
        recommendedSessions: Math.ceil(minutes / 60)
      };
    });

    const goalEstimates = activeGoals.map(g => {
      const minutes = 60; // 1 milestone block per planning window
      totalEstimatedStudyMinutes += minutes;
      return {
        id: g.id,
        title: g.title,
        progress: g.progress,
        targetDate: g.target_date,
        targetDateFormatted: g.target_date ? formatInMumbaiTime(g.target_date) : null,
        estimatedMinutes: minutes
      };
    });

    const commitments = this._gatherAllCommitments(userId, startDate, endDate);
    let existingCommittedMinutes = 0;
    commitments.forEach(c => { existingCommittedMinutes += Math.round((c.end - c.start) / 60000); });

    // Conflict analysis & workload assessment across student calendar commitments
    let conflictReport = { hasConflicts: false, totalConflicts: 0, conflicts: [] };
    let workloadReport = null;
    try {
      conflictReport = await this.workloadService.analyzeConflicts(userId, { start: startDate, end: endDate });
    } catch {
      // non-fatal conflict detection fallback
    }

    try {
      workloadReport = await this.workloadService.getWorkloadSummary(userId, { start: startDate, end: endDate });
    } catch {
      // non-fatal workload summary fallback
    }

    // Discover free time windows across the planning window
    const freeWindows = this.findAvailableTimeWindows(userId, startDate, endDate, {
      now,
      dailyLimitMinutes: options.dailyLimitMinutes || 240,
      existingCommitments: commitments
    });
    const totalAvailableFreeMinutes = freeWindows.reduce((acc, w) => acc + (w.availableStudyMinutes || w.durationMinutes), 0);
    const hasInsufficientAvailability = totalEstimatedStudyMinutes > totalAvailableFreeMinutes;
    const freeTimeDeficitMinutes = Math.max(0, totalEstimatedStudyMinutes - totalAvailableFreeMinutes);

    // Detect per-deliverable deadline pressure
    const deadlinePressureDeliverables = [];
    for (const asgn of upcomingAssignments) {
      const freeBeforeDeadline = freeWindows
        .filter(w => w.end <= asgn.due_date)
        .reduce((acc, w) => acc + (w.availableStudyMinutes || w.durationMinutes), 0);
      const needed = this._estimateAssignmentStudyMinutes(asgn);
      if (needed > freeBeforeDeadline) {
        deadlinePressureDeliverables.push({
          id: asgn.id,
          title: asgn.title,
          dueDate: asgn.due_date,
          dueDateFormatted: formatInMumbaiTime(asgn.due_date),
          neededMinutes: needed,
          availableFreeMinutesBeforeDeadline: freeBeforeDeadline,
          deficitMinutes: needed - freeBeforeDeadline,
          urgency: asgn.priority === 'urgent' ? 'critical' : (asgn.priority === 'high' ? 'high' : 'moderate')
        });
      }
    }

    const heavyDates = workloadReport && Array.isArray(workloadReport.dailyBreakdown)
      ? workloadReport.dailyBreakdown.filter(d => d.isHeavyDay).map(d => d.date)
      : [];

    return {
      window: {
        startDate,
        endDate,
        days: Math.round((endDate - startDate) / 86400000),
        startDateFormatted: formatInMumbaiTime(startDate),
        endDateFormatted: formatInMumbaiTime(endDate)
      },
      needs: {
        upcomingAssignmentsCount: upcomingAssignments.length,
        overdueAssignmentsCount: overdueAssignments.length,
        activeGoalsCount: activeGoals.length,
        totalEstimatedStudyMinutes,
        totalEstimatedStudyHours: Number((totalEstimatedStudyMinutes / 60).toFixed(1)),
        assignments: assignmentEstimates,
        goals: goalEstimates
      },
      freeTimeAnalysis: {
        totalAvailableFreeMinutes,
        totalEstimatedStudyMinutes,
        hasInsufficientAvailability,
        freeTimeDeficitMinutes,
        freeWindowsCount: freeWindows.length,
        deadlinePressureCount: deadlinePressureDeliverables.length,
        deadlinePressureDeliverables
      },
      existingCommitments: {
        calendarEventsCount: calendarEvents.length,
        studySessionsCount: studySessions.length,
        existingPlanItemsCount: existingPlanItems.length,
        totalCommittedMinutes: existingCommittedMinutes,
        totalCommittedHours: Number((existingCommittedMinutes / 60).toFixed(1)),
        preExistingConflictsCount: conflictReport.totalConflicts,
        hasPreExistingConflicts: conflictReport.hasConflicts
      },
      workloadAnalysis: {
        heavyDaysCount: heavyDates.length,
        heavyDates,
        busiestDay: workloadReport ? workloadReport.summary.busiestDay : null,
        totalCommitmentMinutes: workloadReport ? workloadReport.summary.totalCommitmentMinutes : 0,
        dailyBreakdown: workloadReport ? workloadReport.dailyBreakdown : []
      }
    };
  }

  /**
   * Deterministically merges overlapping or adjacent busy intervals into consolidated non-overlapping blocks.
   *
   * @param {Array<{ start: number, end: number, source?: any }>} intervals
   * @returns {Array<{ start: number, end: number, sources: any[] }>}
   */
  _mergeBusyIntervals(intervals) {
    if (!intervals || intervals.length === 0) return [];

    // Sort strictly ascending by start time, then end time
    const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];

    let current = {
      start: sorted[0].start,
      end: sorted[0].end,
      sources: sorted[0].source ? [sorted[0].source] : []
    };

    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      // If next interval overlaps or is contiguous with current
      if (item.start <= current.end) {
        current.end = Math.max(current.end, item.end);
        if (item.source) current.sources.push(item.source);
      } else {
        merged.push(current);
        current = {
          start: item.start,
          end: item.end,
          sources: item.source ? [item.source] : []
        };
      }
    }
    merged.push(current);

    return merged;
  }

  /**
   * Discovers available continuous free time windows between existing calendar events,
   * study sessions, and previously committed study plan items.
   *
   * Merges overlapping and back-to-back busy commitments (with transition buffers)
   * to determine genuine, continuous free intervals during allowed study hours.
   *
   * @param {string} userId - Student user ID
   * @param {number} startDate - Search window start epoch ms
   * @param {number} endDate - Search window end epoch ms
   * @param {object} [options={}] - Options (startHour, endHour, bufferMinutes, minWindowMinutes, dailyLimitMinutes)
   * @returns {Array<{ start: number, end: number, durationMinutes: number, dateKey: string, availableStudyMinutes: number, startFormatted: string, endFormatted: string }>}
   */
  findAvailableTimeWindows(userId, startDate, endDate, options = {}) {
    if (!userId) throw new ValidationError('Student user ID is required');

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const effectiveStart = Math.max(Number(startDate), now);
    const effectiveEnd = Number(endDate);

    if (effectiveEnd <= effectiveStart) return [];

    const bufferMinutes = Math.max(0, Number(options.bufferMinutes !== undefined ? options.bufferMinutes : 15));
    const bufferMs = bufferMinutes * 60000;
    const minWindowMinutes = Math.max(15, Number(options.minWindowMinutes || 30));
    const dailyLimitMinutes = Math.min(600, Math.max(60, Number(options.dailyLimitMinutes) || 240));

    // Daily study hours: default 09:00 to 21:00 IST
    const startHour = options.startHour !== undefined ? Number(options.startHour) : 9;
    const endHour = options.endHour !== undefined ? Number(options.endHour) : 21;

    // Daily allocations tracker
    const dailyAllocations = options.dailyAllocations || new Map();

    // 1. Gather all existing commitments
    let commitments = options.existingCommitments;
    if (!commitments) {
      commitments = this._gatherAllCommitments(userId, effectiveStart, effectiveEnd, options);
    }

    const freeWindows = [];

    // 2. Iterate each calendar day in IST
    const cursor = new Date(effectiveStart + IST_OFFSET_MS);
    const endCursor = new Date(effectiveEnd + IST_OFFSET_MS);
    cursor.setUTCHours(0, 0, 0, 0);

    while (cursor.getTime() <= endCursor.getTime() + 86400000) {
      const dayStartUTC = cursor.getTime() - IST_OFFSET_MS;
      const dateKey = getDateKeyIST(dayStartUTC);

      const dayStudyWindowStart = dayStartUTC + (startHour * 3600000);
      const dayStudyWindowEnd = dayStartUTC + (endHour * 3600000);

      const effectiveDayStart = Math.max(dayStudyWindowStart, effectiveStart);
      const effectiveDayEnd = Math.min(dayStudyWindowEnd, effectiveEnd);

      if (effectiveDayStart >= effectiveDayEnd) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const currentDailyAllocated = dailyAllocations.get(dateKey) || 0;
      const remainingDailyMinutes = Math.max(0, dailyLimitMinutes - currentDailyAllocated);

      if (remainingDailyMinutes < minWindowMinutes) {
        // Daily limit already exhausted on this date
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      // Filter commitments on this day that overlap [effectiveDayStart, effectiveDayEnd]
      const dayCommitments = commitments.filter(c => {
        return c.start < effectiveDayEnd && c.end > effectiveDayStart;
      });

      // Construct buffered busy blocks
      const rawBusyBlocks = dayCommitments.map(c => ({
        start: Math.max(effectiveDayStart, c.start - bufferMs),
        end: Math.min(effectiveDayEnd, c.end + bufferMs),
        source: c
      }));

      // Merge overlapping & back-to-back busy blocks
      const mergedBusy = this._mergeBusyIntervals(rawBusyBlocks);

      // Compute free time windows as the complement of mergedBusy within [effectiveDayStart, effectiveDayEnd]
      let timePointer = effectiveDayStart;
      timePointer = Math.ceil(timePointer / 900000) * 900000; // Align to 15m

      for (const busy of mergedBusy) {
        if (busy.start > timePointer) {
          const windowEnd = Math.floor(busy.start / 900000) * 900000;
          const windowDurationMs = windowEnd - timePointer;
          const windowDurationMinutes = Math.round(windowDurationMs / 60000);

          if (windowDurationMinutes >= minWindowMinutes) {
            freeWindows.push({
              start: timePointer,
              end: windowEnd,
              durationMinutes: windowDurationMinutes,
              availableStudyMinutes: Math.min(windowDurationMinutes, remainingDailyMinutes),
              dateKey,
              startFormatted: formatInMumbaiTime(timePointer),
              endFormatted: formatInMumbaiTime(windowEnd)
            });
          }
        }
        timePointer = Math.max(timePointer, Math.ceil(busy.end / 900000) * 900000);
      }

      if (timePointer < effectiveDayEnd) {
        const windowEnd = Math.floor(effectiveDayEnd / 900000) * 900000;
        const windowDurationMs = windowEnd - timePointer;
        const windowDurationMinutes = Math.round(windowDurationMs / 60000);

        if (windowDurationMinutes >= minWindowMinutes) {
          freeWindows.push({
            start: timePointer,
            end: windowEnd,
            durationMinutes: windowDurationMinutes,
            availableStudyMinutes: Math.min(windowDurationMinutes, remainingDailyMinutes),
            dateKey,
            startFormatted: formatInMumbaiTime(timePointer),
            endFormatted: formatInMumbaiTime(windowEnd)
          });
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return freeWindows;
  }

  /**
   * Alias for findAvailableTimeWindows
   */
  getAvailableTimeWindows(userId, startDate, endDate, options = {}) {
    return this.findAvailableTimeWindows(userId, startDate, endDate, options);
  }

  /**
   * Discovers available non-conflicting study time slots for a student
   * by carving concrete session blocks out of consolidated free time windows,
   * respecting study windows, existing commitments, buffer transitions, and daily limits.
   *
   * @param {string} userId - Student user ID
   * @param {number} startDate - Search start epoch ms
   * @param {number} endDate - Search end epoch ms
   * @param {object} [options={}] - Sizing, limits, and commitment overrides
   * @returns {Array<{ start: number, end: number, durationMinutes: number, dateKey: string }>}
   */
  findAvailableStudySlots(userId, startDate, endDate, options = {}) {
    if (!userId) throw new ValidationError('Student user ID is required');

    const slotDurationMinutes = Math.min(120, Math.max(30, Number(options.slotDurationMinutes) || 60));
    const slotDurationMs = slotDurationMinutes * 60000;
    const bufferMinutes = Math.max(0, Number(options.bufferMinutes !== undefined ? options.bufferMinutes : 15));
    const bufferMs = bufferMinutes * 60000;
    const dailyLimitMinutes = Math.min(600, Math.max(60, Number(options.dailyLimitMinutes) || 240));
    const dailyAllocations = options.dailyAllocations || new Map();

    // 1. Get continuous free time windows
    const windows = this.findAvailableTimeWindows(userId, startDate, endDate, {
      ...options,
      minWindowMinutes: slotDurationMinutes
    });

    const availableSlots = [];

    // 2. Carve concrete slots out of available windows
    for (const win of windows) {
      let candidateTime = win.start;
      const currentDailyAllocated = dailyAllocations.get(win.dateKey) || 0;
      let dailyUsed = currentDailyAllocated;

      while (candidateTime + slotDurationMs <= win.end) {
        if (dailyUsed + slotDurationMinutes > dailyLimitMinutes) {
          break; // Daily limit reached on this dateKey
        }

        const slotEnd = candidateTime + slotDurationMs;
        availableSlots.push({
          start: candidateTime,
          end: slotEnd,
          durationMinutes: slotDurationMinutes,
          dateKey: win.dateKey
        });

        dailyUsed += slotDurationMinutes;
        candidateTime = Math.ceil((slotEnd + bufferMs) / 900000) * 900000;
      }
    }

    return availableSlots;
  }

  /**
   * Deterministic Study Planning Engine.
   *
   * Formulates a structured study plan and individual study work items (`StudyPlanItem`)
   * by scheduling upcoming uncompleted deliverables and active goals before deadlines.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - Planning options
   * @returns {Promise<{ plan: StudyPlan, items: StudyPlanItem[], summary: object, warnings: string[] }>}
   */
  async generateStudyPlan(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Student user ID is required');
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const days = Math.min(30, Math.max(1, Number(options.days) || 7));
    const startDate = options.startDate ? Math.max(Number(options.startDate), now) : now;
    const endDate = options.endDate ? Number(options.endDate) : startDate + (days * 86400000);

    if (endDate <= startDate) {
      throw new ValidationError('End date must be strictly after start date');
    }

    const dailyLimitMinutes = Math.min(600, Math.max(60, Number(options.dailyLimitMinutes) || 240));
    const defaultSessionDuration = Math.min(120, Math.max(30, Number(options.defaultSessionDuration) || 60));
    const autoPersist = options.autoPersist !== false;
    const includeAssignments = options.includeAssignments !== false;
    const includeGoals = options.includeGoals !== false;

    // 1. Gather all existing commitments
    const existingCommitments = this._gatherAllCommitments(userId, startDate, endDate, {
      includePlanItems: options.replaceExisting === false,
      excludePlanId: options.planId || null
    });
    const allocatedCommitments = [...existingCommitments];

    // Compute continuous free time windows available at the outset
    const initialFreeWindows = this.findAvailableTimeWindows(userId, startDate, endDate, {
      now,
      dailyLimitMinutes,
      existingCommitments
    });
    const totalAvailableFreeMinutes = initialFreeWindows.reduce((acc, w) => acc + (w.availableStudyMinutes || w.durationMinutes), 0);
    const insufficientAvailabilityItems = [];

    // Workload summary & heavy-day detection
    const heavyDates = new Set();
    const warnings = [];
    let workloadSummaryReport = null;
    try {
      workloadSummaryReport = await this.workloadService.getWorkloadSummary(userId, { start: startDate, end: endDate });
      if (workloadSummaryReport && Array.isArray(workloadSummaryReport.dailyBreakdown)) {
        workloadSummaryReport.dailyBreakdown.forEach(day => {
          if (day.isHeavyDay) {
            heavyDates.add(day.date);
          }
        });
      }
    } catch {
      // non-fatal workload summary fallback
    }

    if (heavyDates.size > 0) {
      warnings.push(
        `Detected ${heavyDates.size} high workload day(s) (${Array.from(heavyDates).join(', ')}). The planner will avoid scheduling non-urgent study work during heavy periods where possible.`
      );
    }

    // Tracking structures
    const dailyAllocations = new Map();
    const dailyAssignmentSessions = new Map(); // key: `${dateKey}:${assignmentId}`
    const plannedItemsData = [];
    const warningsCollector = warnings;
    let orderIndex = 0;

    // 2. Query and sort candidate assignments
    let candidateAssignments = [];
    if (includeAssignments) {
      const asgnFilter = { status: null };
      if (options.courseId) asgnFilter.course_id = options.courseId;
      const allAsgns = this.assignmentRepo.findByUserId(userId, asgnFilter);

      // Rule: Identify upcoming work needing attention, avoid already completed/submitted/cancelled work
      candidateAssignments = allAsgns.filter(a => {
        if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'submitted') return false;
        // Skip deliverables already past deadline if strictly before startDate
        if (a.due_date < startDate) {
          warningsCollector.push(`Assignment '${a.title}' is overdue (due: ${formatInMumbaiTime(a.due_date)}) and was excluded from forward planning.`);
          return false;
        }
        return true;
      });

      // Deterministic prioritization:
      // 1. Proximity to deadline (due_date ASC)
      // 2. Effective priority weight (elevated for approaching deadlines) + goal-link bonus (+0.5)
      // 3. Deterministic tie-breaker (created_at ASC, id ASC)
      candidateAssignments.sort((a, b) => {
        if (a.due_date !== b.due_date) return a.due_date - b.due_date;
        const effA = this._resolveEffectiveAssignmentPriority(a, startDate);
        const effB = this._resolveEffectiveAssignmentPriority(b, startDate);
        const weightA = (PRIORITY_WEIGHTS[effA] || 1) + (a.goal_id ? 0.5 : 0);
        const weightB = (PRIORITY_WEIGHTS[effB] || 1) + (b.goal_id ? 0.5 : 0);
        if (weightB !== weightA) return weightB - weightA;
        if (a.created_at !== b.created_at) return a.created_at - b.created_at;
        return a.id.localeCompare(b.id);
      });
    }

    // 3. Query and sort candidate goals
    let candidateGoals = [];
    if (includeGoals) {
      const allGoals = this.goalRepo.findByUserId(userId, options.courseId ? { course_id: options.courseId } : {});
      candidateGoals = allGoals.filter(g => {
        if (g.status === 'completed' || g.status === 'cancelled' || g.status === 'on_hold') return false;
        if (g.progress >= 100) return false;
        if (g.target_date && g.target_date < startDate) {
          warningsCollector.push(`Goal '${g.title}' target date (${formatInMumbaiTime(g.target_date)}) has passed.`);
          return false;
        }
        return true;
      });

      // Deterministic sort: target_date ASC (nulls last), effective goal priority DESC, progress ASC, id ASC
      candidateGoals.sort((a, b) => {
        if (a.target_date && b.target_date && a.target_date !== b.target_date) {
          return a.target_date - b.target_date;
        }
        if (a.target_date && !b.target_date) return -1;
        if (!a.target_date && b.target_date) return 1;
        const effPriorityA = this._resolveEffectiveGoalPriority(a, startDate);
        const effPriorityB = this._resolveEffectiveGoalPriority(b, startDate);
        const weightA = PRIORITY_WEIGHTS[effPriorityA] || 1;
        const weightB = PRIORITY_WEIGHTS[effPriorityB] || 1;
        if (weightB !== weightA) return weightB - weightA;
        if (a.progress !== b.progress) return a.progress - b.progress;
        return a.id.localeCompare(b.id);
      });
    }

    // 4. Plan Assignment Sessions
    for (const assignment of candidateAssignments) {
      let sessionsNeeded = this._calculateSessionsNeeded(assignment);
      if (options.completedSessionsByAssignment && options.completedSessionsByAssignment.has(assignment.id)) {
        const completedCount = options.completedSessionsByAssignment.get(assignment.id);
        sessionsNeeded = Math.max(0, sessionsNeeded - completedCount);
      }
      if (sessionsNeeded === 0) continue;

      const sessionDuration = this._calculateSessionDuration(assignment, defaultSessionDuration);
      let sessionsScheduled = 0;

      for (let sIdx = 0; sIdx < sessionsNeeded; sIdx++) {
        // Find candidate slots before assignment due date
        const slots = this.findAvailableStudySlots(userId, startDate, Math.min(endDate, assignment.due_date), {
          now,
          slotDurationMinutes: sessionDuration,
          dailyLimitMinutes,
          existingCommitments: allocatedCommitments,
          dailyAllocations
        });

        // Preferred slot selection:
        // Pass 1: Ideal slot -> avoid cramming today (countOnDate === 0 || isUrgentDue) AND avoid heavy days (unless urgent)
        let chosenSlot = null;
        const isUrgentDue = assignment.due_date - startDate < 86400000;

        for (const slot of slots) {
          // Rule: slot must finish strictly on or before assignment due date
          if (slot.end > assignment.due_date) continue;

          const assignKey = `${slot.dateKey}:${assignment.id}`;
          const countOnDate = dailyAssignmentSessions.get(assignKey) || 0;
          const isHeavy = heavyDates.has(slot.dateKey);

          if ((countOnDate === 0 || isUrgentDue) && (!isHeavy || isUrgentDue)) {
            chosenSlot = slot;
            break;
          }
        }

        // Pass 2: If no slot avoiding heavy days, allow scheduling on heavy day (as long as no cramming today unless urgent)
        if (!chosenSlot) {
          for (const slot of slots) {
            if (slot.end > assignment.due_date) continue;
            const assignKey = `${slot.dateKey}:${assignment.id}`;
            const countOnDate = dailyAssignmentSessions.get(assignKey) || 0;
            if (countOnDate === 0 || isUrgentDue) {
              chosenSlot = slot;
              break;
            }
          }
        }

        // Pass 3: Fallback to any available slot before deadline
        if (!chosenSlot && slots.length > 0) {
          chosenSlot = slots.find(slot => slot.end <= assignment.due_date);
        }

        if (chosenSlot) {
          // Formulate descriptive, actionable title
          const title = this._formatAssignmentSessionTitle(assignment, sIdx, sessionsNeeded);

          // Resolve effective priority based on deadline proximity
          const effectivePriority = this._resolveEffectiveAssignmentPriority(assignment, chosenSlot.start);

          // Contextual study resource lookup
          let associatedResourceId = null;
          let associatedResourceTitle = null;
          try {
            if (this.resourceService && typeof this.resourceService.getContextForAssignment === 'function') {
              const resCtx = this.resourceService.getContextForAssignment(userId, assignment.id, { limit: 1 });
              if (resCtx && Array.isArray(resCtx.resources) && resCtx.resources.length > 0) {
                associatedResourceId = resCtx.resources[0].id;
                associatedResourceTitle = resCtx.resources[0].title;
              }
            }
          } catch {
            // non-fatal resource lookup fallback
          }

          let description = `Planned study work for '${assignment.title}' (Due: ${formatInMumbaiTime(assignment.due_date)})`;
          if (associatedResourceTitle) {
            description += ` • Attached Study Resource: ${associatedResourceTitle}`;
          }

          const itemData = {
            id: `plan-item-${now}-${Math.random().toString(36).substring(2, 7)}`,
            user_id: userId,
            plan_id: null, // set during persistence
            course_id: assignment.course_id || null,
            assignment_id: assignment.id,
            goal_id: assignment.goal_id || null,
            study_session_id: null,
            resource_id: associatedResourceId,
            title,
            description,
            planned_date: chosenSlot.start,
            duration_minutes: sessionDuration,
            priority: effectivePriority,
            status: 'planned',
            order_index: orderIndex++,
            completed_at: null,
            created_at: now,
            updated_at: now
          };

          plannedItemsData.push(itemData);

          // Update allocation commitments
          allocatedCommitments.push({
            start: chosenSlot.start,
            end: chosenSlot.end,
            type: 'planned_study_item',
            title
          });

          // Update daily tracking
          const prevDaily = dailyAllocations.get(chosenSlot.dateKey) || 0;
          dailyAllocations.set(chosenSlot.dateKey, prevDaily + sessionDuration);

          const assignKey = `${chosenSlot.dateKey}:${assignment.id}`;
          dailyAssignmentSessions.set(assignKey, (dailyAssignmentSessions.get(assignKey) || 0) + 1);

          sessionsScheduled++;
        }
      }

      if (sessionsScheduled < sessionsNeeded) {
        const freeBeforeDeadline = this.findAvailableTimeWindows(userId, startDate, Math.min(endDate, assignment.due_date), {
          now,
          dailyLimitMinutes,
          existingCommitments: allocatedCommitments,
          dailyAllocations
        });
        const freeMinutes = freeBeforeDeadline.reduce((acc, w) => acc + (w.availableStudyMinutes || w.durationMinutes), 0);
        const neededMinutes = sessionsNeeded * sessionDuration;

        if (freeMinutes < neededMinutes) {
          warningsCollector.push(
            `Insufficient availability: Assignment '${assignment.title}' requires ${neededMinutes} mins before deadline ${formatInMumbaiTime(assignment.due_date)}, but only ${freeMinutes} mins of free study time are available in your schedule. Scheduled ${sessionsScheduled} of ${sessionsNeeded} session(s).`
          );
          insufficientAvailabilityItems.push({
            assignmentId: assignment.id,
            title: assignment.title,
            dueDate: assignment.due_date,
            neededMinutes,
            availableFreeMinutes: freeMinutes,
            deficitMinutes: Math.max(0, neededMinutes - freeMinutes),
            sessionsNeeded,
            sessionsScheduled,
            reason: 'insufficient_free_time'
          });
        } else {
          warningsCollector.push(
            `Could only schedule ${sessionsScheduled} of ${sessionsNeeded} planned session(s) for '${assignment.title}' before deadline ${formatInMumbaiTime(assignment.due_date)} due to schedule constraints.`
          );
          insufficientAvailabilityItems.push({
            assignmentId: assignment.id,
            title: assignment.title,
            dueDate: assignment.due_date,
            neededMinutes,
            availableFreeMinutes: freeMinutes,
            deficitMinutes: Math.max(0, neededMinutes - (sessionsScheduled * sessionDuration)),
            sessionsNeeded,
            sessionsScheduled,
            reason: 'daily_limit_or_spacing'
          });
        }
      }
    }

    // 5. Plan Goal Milestone Sessions
    for (const goal of candidateGoals) {
      if (options.completedSessionsByGoal && options.completedSessionsByGoal.has(goal.id)) {
        const completedGoalCount = options.completedSessionsByGoal.get(goal.id);
        if (completedGoalCount > 0) continue;
      }

      const goalDuration = Math.min(60, defaultSessionDuration);
      const maxGoalEnd = goal.target_date ? Math.min(endDate, goal.target_date) : endDate;

      const slots = this.findAvailableStudySlots(userId, startDate, maxGoalEnd, {
        now,
        slotDurationMinutes: goalDuration,
        dailyLimitMinutes,
        existingCommitments: allocatedCommitments,
        dailyAllocations
      });

      if (slots.length > 0) {
        // Preferred slot for goal: try avoiding heavy day if possible
        let chosenSlot = slots.find(s => !heavyDates.has(s.dateKey));
        if (!chosenSlot) chosenSlot = slots[0];

        const title = `Milestone Study: ${goal.title}`;
        const effectiveGoalPriority = this._resolveEffectiveGoalPriority(goal, chosenSlot.start);

        // Contextual study resource lookup for goal
        let associatedResourceId = null;
        let associatedResourceTitle = null;
        try {
          if (this.resourceService && typeof this.resourceService.getContextForGoal === 'function') {
            const resCtx = this.resourceService.getContextForGoal(userId, goal.id, { limit: 1 });
            if (resCtx && Array.isArray(resCtx.resources) && resCtx.resources.length > 0) {
              associatedResourceId = resCtx.resources[0].id;
              associatedResourceTitle = resCtx.resources[0].title;
            }
          }
        } catch {
          // non-fatal resource lookup fallback
        }

        let description = `Goal study block towards '${goal.title}' (Progress: ${goal.progress}%)`;
        if (associatedResourceTitle) {
          description += ` • Supporting Study Resource: ${associatedResourceTitle}`;
        }

        const itemData = {
          id: `plan-item-${now}-${Math.random().toString(36).substring(2, 7)}`,
          user_id: userId,
          plan_id: null,
          course_id: goal.course_id || null,
          assignment_id: null,
          goal_id: goal.id,
          study_session_id: null,
          resource_id: associatedResourceId,
          title,
          description,
          planned_date: chosenSlot.start,
          duration_minutes: goalDuration,
          priority: effectiveGoalPriority,
          status: 'planned',
          order_index: orderIndex++,
          completed_at: null,
          created_at: now,
          updated_at: now
        };

        plannedItemsData.push(itemData);

        allocatedCommitments.push({
          start: chosenSlot.start,
          end: chosenSlot.end,
          type: 'planned_study_item',
          title
        });

        const prevDaily = dailyAllocations.get(chosenSlot.dateKey) || 0;
        dailyAllocations.set(chosenSlot.dateKey, prevDaily + goalDuration);
      } else {
        warningsCollector.push(`Could not find an available study slot for goal '${goal.title}' within planning limits.`);
      }
    }

    // 6. Sort all planned items deterministically by planned_date ASC, order_index ASC
    plannedItemsData.sort((a, b) => {
      if (a.planned_date !== b.planned_date) return a.planned_date - b.planned_date;
      return a.order_index - b.order_index;
    });

    // Re-index order_index cleanly
    plannedItemsData.forEach((item, idx) => { item.order_index = idx; });

    // 7. Formulate StudyPlan entity
    const planTitle = options.title || `Study Sprint: ${formatInMumbaiTime(startDate).split(',')[0]} - ${formatInMumbaiTime(endDate).split(',')[0]}`;
    const planDescription = options.description || `Deterministic study plan with ${plannedItemsData.length} scheduled work items across assignments and goals.`;

    const planEntity = StudyPlan.create({
      id: `plan-${now}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      title: planTitle,
      description: planDescription,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      created_at: now,
      updated_at: now
    });

    // 8. Handle persistence if autoPersist is true
    let persistedPlan = planEntity;
    let finalItems = plannedItemsData.map(d => StudyPlanItem.create(d));

    if (autoPersist) {
      const runPersistTx = this.database.transaction(() => {
        // Prevent duplicate planned items: find existing active plans in this window
        if (options.replaceExisting !== false) {
          const activePlans = this.studyPlanRepo.findPlansByUserId(userId, {
            status: 'active',
            startDate,
            endDate,
            limit: 50
          });

          for (const oldPlan of activePlans.data) {
            // Cleanly delete uncompleted planned items from previous plan in this window
            this.studyPlanRepo.database.prepare(`
              DELETE FROM study_plan_items
              WHERE plan_id = ? AND user_id = ? AND status = 'planned'
            `).run(oldPlan.id, userId);

            // Archive the old plan
            this.studyPlanRepo.updatePlan(oldPlan.id, userId, { status: 'archived' });
          }
        }

        persistedPlan = this.studyPlanRepo.createPlan(planEntity);
        plannedItemsData.forEach(item => { item.plan_id = persistedPlan.id; });
        finalItems = this.studyPlanRepo.createItemsBatch(plannedItemsData, userId);
      });
      runPersistTx();
    } else {
      // In-memory preview: set plan_id
      plannedItemsData.forEach(item => { item.plan_id = planEntity.id; });
      finalItems = plannedItemsData.map(d => StudyPlanItem.create(d));
    }

    // 9. Compute summary metrics
    const totalDurationMinutes = finalItems.reduce((acc, it) => acc + it.duration_minutes, 0);
    const coveredAssignmentIds = Array.from(new Set(finalItems.map(it => it.assignment_id).filter(Boolean)));
    const coveredGoalIds = Array.from(new Set(finalItems.map(it => it.goal_id).filter(Boolean)));
    const associatedResourceIds = Array.from(new Set(finalItems.map(it => it.resource_id).filter(Boolean)));
    const goalLinkedItemsCount = finalItems.filter(it => it.goal_id !== null).length;

    const dailyBreakdown = {};
    for (const [dKey, mins] of dailyAllocations.entries()) {
      dailyBreakdown[dKey] = mins;
    }

    const summary = {
      totalItemsPlanned: finalItems.length,
      totalStudyMinutes: totalDurationMinutes,
      totalStudyHours: Number((totalDurationMinutes / 60).toFixed(1)),
      assignmentsCoveredCount: coveredAssignmentIds.length,
      goalsCoveredCount: coveredGoalIds.length,
      goalLinkedItemsCount,
      resourcesAssociatedCount: associatedResourceIds.length,
      associatedResourceIds,
      conflictsAvoidedCount: existingCommitments.length,
      workloadAnalysis: {
        heavyDaysCount: heavyDates.size,
        heavyDates: Array.from(heavyDates),
        totalCommitmentMinutes: workloadSummaryReport ? workloadSummaryReport.summary.totalCommitmentMinutes : 0,
        busiestDay: workloadSummaryReport ? workloadSummaryReport.summary.busiestDay : null
      },
      freeTimeAnalysis: {
        totalAvailableFreeMinutes,
        totalStudyMinutesPlanned: totalDurationMinutes,
        hasInsufficientAvailability: insufficientAvailabilityItems.length > 0,
        insufficientAvailabilityCount: insufficientAvailabilityItems.length,
        insufficientAvailabilityItems
      },
      dailyBreakdown,
      isDryRun: !autoPersist
    };

    return {
      plan: persistedPlan,
      items: finalItems,
      summary,
      warnings: warningsCollector
    };
  }

  /**
   * Preview a generated study plan without persisting records in SQLite.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {Promise<{ plan: StudyPlan, items: StudyPlanItem[], summary: object, warnings: string[] }>}
   */
  async previewStudyPlan(userId, options = {}) {
    return this.generateStudyPlan(userId, { ...options, autoPersist: false });
  }

  /**
   * Reschedules an individual planned study work item with deterministic validation
   * ensuring new time is in the future, respects assignment/goal deadlines, and checks for conflicts.
   *
   * @param {string} userId - Student user ID
   * @param {string} itemId - Study plan item ID
   * @param {number} newPlannedDate - New epoch timestamp in ms
   * @param {object} [options={}] - { allowConflict = false, now }
   * @returns {StudyPlanItem}
   */
  async reschedulePlanItem(userId, itemId, newPlannedDate, options = {}) {
    if (!userId) throw new ValidationError('Student user ID is required');
    if (!itemId) throw new ValidationError('Study plan item ID is required');

    const item = this.studyPlanRepo.findItemById(itemId, userId);
    if (!item) {
      throw new NotFoundError('Study plan item not found or does not belong to you');
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const plannedEpoch = Number(newPlannedDate);

    // Rule: Avoid scheduling in the past
    if (plannedEpoch < now) {
      throw new ValidationError('Cannot reschedule a study work item to a time in the past');
    }

    const newEndEpoch = plannedEpoch + (item.duration_minutes * 60000);

    // Rule: Respect assignment deadline
    if (item.assignment_id) {
      const assignment = this.assignmentRepo.findById(item.assignment_id);
      if (assignment && assignment.user_id === userId) {
        if (newEndEpoch > assignment.due_date) {
          throw new ValidationError(
            `Cannot reschedule study item after assignment deadline (${formatInMumbaiTime(assignment.due_date)})`
          );
        }
      }
    }

    // Rule: Respect goal target date
    if (item.goal_id) {
      const goal = this.goalRepo.findById(item.goal_id);
      if (goal && goal.user_id === userId && goal.target_date) {
        if (newEndEpoch > goal.target_date) {
          throw new ValidationError(
            `Cannot reschedule study item after goal target date (${formatInMumbaiTime(goal.target_date)})`
          );
        }
      }
    }

    // Rule: Avoid obvious schedule conflicts
    const events = this.calendarEventRepo.findInRange(userId, plannedEpoch - 1, newEndEpoch + 1, { status: 'scheduled' });
    const studySessions = this.studySessionRepo.findInRange(userId, plannedEpoch - 1, newEndEpoch + 1, { status: 'planned' });
    const planItems = this.studyPlanRepo.findInRange(userId, plannedEpoch - 1, newEndEpoch + 1, { status: 'planned', excludeItemId: itemId });

    const eventConflict = events.find(e => plannedEpoch < e.end_time && newEndEpoch > e.start_time);
    const sessionConflict = studySessions.find(s => plannedEpoch < s.plannedEndTime && newEndEpoch > s.planned_start_time);
    const planItemConflict = planItems.find(p => plannedEpoch < (p.planned_date + (p.duration_minutes * 60000)) && newEndEpoch > p.planned_date);

    if ((eventConflict || sessionConflict || planItemConflict) && options.allowConflict !== true) {
      const conflictName = eventConflict ? eventConflict.title : (sessionConflict ? sessionConflict.title : planItemConflict.title);
      throw new ConflictError(
        `Rescheduled time conflicts with existing commitment '${conflictName}'.`
      );
    }

    // Update item
    const updated = this.studyPlanRepo.updateItem(itemId, userId, {
      planned_date: plannedEpoch
    });

    return updated;
  }

  /**
   * Recalculates an existing study plan (or the student's current active plan)
   * by removing obsolete uncompleted items and generating fresh study work
   * from current assignments and goals, strictly avoiding duplicate items.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - { planId, days, dailyLimitMinutes, defaultSessionDuration }
   * @returns {Promise<{ plan: StudyPlan, items: StudyPlanItem[], summary: object, warnings: string[] }>}
   */
  async recalculateStudyPlan(userId, options = {}) {
    if (!userId) throw new ValidationError('Student user ID is required');

    let targetPlan = null;
    if (options.planId) {
      targetPlan = this.studyPlanRepo.findPlanById(options.planId, userId);
      if (!targetPlan) {
        throw new NotFoundError('Study plan not found or does not belong to you');
      }
    } else {
      const activePlans = this.studyPlanRepo.findPlansByUserId(userId, { status: 'active', limit: 1 });
      if (activePlans.data.length === 0) {
        throw new NotFoundError('No active study plan found to recalculate');
      }
      targetPlan = activePlans.data[0];
    }

    // 2. Determine forward planning window
    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const effectiveStart = Math.max(now, targetPlan.start_date);
    const effectiveEnd = targetPlan.end_date;

    if (effectiveEnd <= effectiveStart) {
      // Plan period has already passed
      const remainingItems = this.studyPlanRepo.findItemsByPlanId(targetPlan.id, userId);
      return {
        plan: targetPlan,
        items: remainingItems,
        summary: {
          totalItemsPlanned: remainingItems.length,
          recalculated: true,
          message: 'Plan end date has already passed. Existing completed items preserved.'
        },
        warnings: ['Plan end date has already passed; no forward study work generated.']
      };
    }

    // 3. Gather existing completed/in_progress items for this plan to prevent duplicate work or overlapping slots
    const existingItems = this.studyPlanRepo.findItemsByPlanId(targetPlan.id, userId);
    const completedItems = existingItems.filter(i => i.status === 'completed' || i.status === 'in_progress');

    const completedSessionsByAssignment = new Map();
    const completedSessionsByGoal = new Map();
    for (const it of completedItems) {
      if (it.assignment_id) {
        completedSessionsByAssignment.set(
          it.assignment_id,
          (completedSessionsByAssignment.get(it.assignment_id) || 0) + 1
        );
      }
      if (it.goal_id) {
        completedSessionsByGoal.set(
          it.goal_id,
          (completedSessionsByGoal.get(it.goal_id) || 0) + 1
        );
      }
    }

    // 4. Generate fresh schedule for the remaining window without auto-persisting
    const planGenResult = await this.generateStudyPlan(userId, {
      ...options,
      now,
      startDate: effectiveStart,
      endDate: effectiveEnd,
      replaceExisting: false,
      autoPersist: false,
      excludePlanId: targetPlan.id,
      completedSessionsByAssignment,
      completedSessionsByGoal
    });

    // 4. Attach generated items to targetPlan and batch insert atomically
    const newItemsData = planGenResult.items.map(item => ({
      ...item.toRow(),
      plan_id: targetPlan.id,
      user_id: userId
    }));

    let updatedPlan = targetPlan;
    let savedNewItems = [];
    const runRecalcTx = this.database.transaction(() => {
      // Cleanly delete existing uncompleted planned items for this plan to avoid duplicates
      this.studyPlanRepo.database.prepare(`
        DELETE FROM study_plan_items
        WHERE plan_id = ? AND user_id = ? AND status = 'planned'
      `).run(targetPlan.id, userId);

      savedNewItems = this.studyPlanRepo.createItemsBatch(newItemsData, userId);

      // Update plan timestamp
      updatedPlan = this.studyPlanRepo.updatePlan(targetPlan.id, userId, {
        updated_at: now
      });
    });
    runRecalcTx();

    // 5. Fetch complete items (including any previously completed ones)
    const allPlanItems = this.studyPlanRepo.findItemsByPlanId(targetPlan.id, userId);
    const progressSummary = this._computePlanProgressSummary(updatedPlan, allPlanItems);

    return {
      plan: updatedPlan,
      items: allPlanItems,
      summary: {
        ...planGenResult.summary,
        ...progressSummary,
        recalculated: true,
        newItemsScheduledCount: savedNewItems.length
      },
      warnings: planGenResult.warnings
    };
  }

  /**
   * Retrieves the current / active upcoming study plan for a student,
   * including its planned items and progress statistics.
   *
   * @param {string} userId - Student user ID
   * @returns {object|null} Current plan object or null if none active
   */
  async getCurrentPlan(userId) {
    if (!userId) throw new ValidationError('Student user ID is required');

    const activePlans = this.studyPlanRepo.findPlansByUserId(userId, {
      status: 'active',
      limit: 10
    });

    if (activePlans.data.length === 0) return null;

    const now = Date.now();
    // Prioritize active plan whose end_date is in the future
    const current = activePlans.data.find(p => p.end_date >= now) || activePlans.data[0];
    const items = this.studyPlanRepo.findItemsByPlanId(current.id, userId);
    const summary = this._computePlanProgressSummary(current, items);

    return {
      plan: current.toJSON ? current.toJSON() : current,
      items: items.map(i => (i.toJSON ? i.toJSON() : i)),
      summary
    };
  }

  /**
   * Retrieves a study plan by ID with student ownership verification.
   *
   * @param {string} id - Plan ID
   * @param {string} userId - Student user ID
   * @returns {object} Plan, items, and progress summary
   */
  async getPlanById(id, userId) {
    if (!id) throw new ValidationError('Study plan ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const plan = this.studyPlanRepo.findPlanById(id, userId);
    if (!plan) {
      throw new NotFoundError('Study plan not found or does not belong to you');
    }

    const items = this.studyPlanRepo.findItemsByPlanId(id, userId);
    const summary = this._computePlanProgressSummary(plan, items);

    return {
      plan: plan.toJSON ? plan.toJSON() : plan,
      items: items.map(i => (i.toJSON ? i.toJSON() : i)),
      summary
    };
  }

  /**
   * Lists study plans for the student with pagination and filtering.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {object} Paginated list of plans
   */
  async getPlans(userId, options = {}) {
    if (!userId) throw new ValidationError('Student user ID is required');
    return this.studyPlanRepo.findPlansByUserId(userId, options);
  }

  /**
   * Updates an existing study plan with ownership verification.
   *
   * @param {string} id
   * @param {string} userId
   * @param {object} updates
   * @returns {StudyPlan}
   */
  async updatePlan(id, userId, updates = {}) {
    if (!id) throw new ValidationError('Study plan ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const existing = this.studyPlanRepo.findPlanById(id, userId);
    if (!existing) {
      throw new NotFoundError('Study plan not found or does not belong to you');
    }

    return this.studyPlanRepo.updatePlan(id, userId, updates);
  }

  /**
   * Deletes a study plan and cascades child items.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {boolean}
   */
  async deletePlan(id, userId) {
    if (!id) throw new ValidationError('Study plan ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const existing = this.studyPlanRepo.findPlanById(id, userId);
    if (!existing) {
      throw new NotFoundError('Study plan not found or does not belong to you');
    }

    return this.studyPlanRepo.deletePlan(id, userId);
  }

  /**
   * Retrieves planned study work items with rich date, date-range, and relational filtering.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - Filter options (date, startDate, endDate, status, priority, etc.)
   * @returns {object} Paginated study plan items
   */
  async getPlanItems(userId, options = {}) {
    if (!userId) throw new ValidationError('Student user ID is required');

    const filterOptions = { ...options };

    // Support single date lookup ('YYYY-MM-DD' in Asia/Kolkata timezone)
    if (filterOptions.date && typeof filterOptions.date === 'string') {
      const parts = filterOptions.date.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        const [yyyy, mm, dd] = parts;
        const startOfDay = Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0) - IST_OFFSET_MS;
        const endOfDay = startOfDay + 86400000 - 1;
        filterOptions.startDate = startOfDay;
        filterOptions.endDate = endOfDay;
      }
    }

    return this.studyPlanRepo.findItemsByUserId(userId, filterOptions);
  }

  /**
   * Retrieves a single study plan item by ID with ownership verification.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {StudyPlanItem}
   */
  async getPlanItemById(id, userId) {
    if (!id) throw new ValidationError('Study plan item ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const item = this.studyPlanRepo.findItemById(id, userId);
    if (!item) {
      throw new NotFoundError('Study plan item not found or does not belong to you');
    }

    return item;
  }

  /**
   * Updates an existing planned study work item.
   *
   * @param {string} id
   * @param {string} userId
   * @param {object} updates
   * @returns {StudyPlanItem}
   */
  async updatePlanItem(id, userId, updates = {}) {
    if (!id) throw new ValidationError('Study plan item ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const existing = this.studyPlanRepo.findItemById(id, userId);
    if (!existing) {
      throw new NotFoundError('Study plan item not found or does not belong to you');
    }

    // If rescheduling planned_date, run through rescheduling safety
    if (updates.planned_date || updates.plannedDate) {
      const newDate = updates.planned_date || updates.plannedDate;
      return this.reschedulePlanItem(userId, id, newDate, {
        allowConflict: updates.allowConflict === true
      });
    }

    return this.studyPlanRepo.updateItem(id, userId, updates);
  }

  /**
   * Updates the status of a planned study work item (e.g. planned -> completed | skipped).
   *
   * @param {string} id
   * @param {string} userId
   * @param {string} status - 'planned' | 'in_progress' | 'completed' | 'skipped'
   * @returns {StudyPlanItem}
   */
  async updatePlanItemStatus(id, userId, status) {
    if (!id) throw new ValidationError('Study plan item ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const existing = this.studyPlanRepo.findItemById(id, userId);
    if (!existing) {
      throw new NotFoundError('Study plan item not found or does not belong to you');
    }

    const validStatuses = ['planned', 'in_progress', 'completed', 'skipped'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid item status '${status}'. Expected one of: ${validStatuses.join(', ')}`);
    }

    const updates = { status };
    if (status === 'completed') {
      updates.completed_at = Date.now();
    } else {
      updates.completed_at = null;
    }

    return this.studyPlanRepo.updateItem(id, userId, updates);
  }

  /**
   * Deletes / removes a planned study work item.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {boolean}
   */
  async deletePlanItem(id, userId) {
    if (!id) throw new ValidationError('Study plan item ID is required');
    if (!userId) throw new ValidationError('Student user ID is required');

    const existing = this.studyPlanRepo.findItemById(id, userId);
    if (!existing) {
      throw new NotFoundError('Study plan item not found or does not belong to you');
    }

    return this.studyPlanRepo.deleteItem(id, userId);
  }

  /**
   * Calculates progress and duration metrics for a study plan.
   */
  _computePlanProgressSummary(plan, items) {
    const totalItems = items.length;
    let completedItems = 0;
    let inProgressItems = 0;
    let skippedItems = 0;
    let plannedItems = 0;
    let totalMinutes = 0;
    let completedMinutes = 0;

    for (const item of items) {
      totalMinutes += item.duration_minutes;
      if (item.status === 'completed') {
        completedItems++;
        completedMinutes += item.duration_minutes;
      } else if (item.status === 'in_progress') {
        inProgressItems++;
      } else if (item.status === 'skipped') {
        skippedItems++;
      } else {
        plannedItems++;
      }
    }

    const progressPercentage = totalItems > 0
      ? Math.min(100, Math.round((completedItems / totalItems) * 100))
      : 0;

    return {
      totalItems,
      completedItems,
      inProgressItems,
      skippedItems,
      plannedItems,
      totalMinutes,
      completedMinutes,
      remainingMinutes: Math.max(0, totalMinutes - completedMinutes),
      progressPercentage
    };
  }

  // =========================================================================
  // INTERNAL HELPER METHODS (DETERMINISTIC RULES)
  // =========================================================================

  /**
   * Gathers all existing student commitments (CalendarEvents, StudySessions, StudyPlanItems)
   * in the specified time window.
   */
  _gatherAllCommitments(userId, start, end, options = {}) {
    const commitments = [];

    // 1. Calendar Events (scheduled)
    const events = this.calendarEventRepo.findInRange(userId, start, end, { status: 'scheduled' });
    for (const e of events) {
      commitments.push({
        id: e.id,
        start: e.start_time,
        end: e.end_time,
        type: 'calendar_event',
        title: e.title
      });
    }

    // 2. Study Sessions (planned)
    const sessions = this.studySessionRepo.findInRange(userId, start, end, { status: 'planned' });
    for (const s of sessions) {
      commitments.push({
        id: s.id,
        start: s.planned_start_time,
        end: s.plannedEndTime,
        type: 'study_session',
        title: s.title
      });
    }

    // 3. Existing Study Plan Items (active/planned and completed)
    if (options.includePlanItems !== false) {
      const planItems = this.studyPlanRepo.findInRange(userId, start, end, {
        status: options.planItemStatus || null,
        excludeItemId: options.excludeItemId || null
      });
      for (const p of planItems) {
        if (options.excludePlanId && p.plan_id === options.excludePlanId) {
          if (p.status !== 'completed' && p.status !== 'in_progress') {
            continue;
          }
        }
        if (p.status === 'skipped') continue;
        commitments.push({
          id: p.id,
          start: p.planned_date,
          end: p.planned_date + (p.duration_minutes * 60000),
          type: 'study_plan_item',
          title: p.title
        });
      }
    }

    return commitments;
  }

  /**
   * Estimates total study minutes for an assignment based on priority and status.
   */
  _estimateAssignmentStudyMinutes(assignment) {
    let minutes = 60;
    switch (assignment.priority) {
      case 'urgent':
        minutes = 120;
        break;
      case 'high':
        minutes = 90;
        break;
      case 'medium':
        minutes = 60;
        break;
      case 'low':
        minutes = 45;
        break;
      default:
        minutes = 60;
    }

    // In-progress items discount (already partially done)
    if (assignment.status === 'in_progress') {
      minutes = Math.max(30, minutes - 30);
    }

    return minutes;
  }

  /**
   * Calculates the number of separate study sessions for an assignment.
   * Multi-session work is spread out to prevent student fatigue.
   */
  _calculateSessionsNeeded(assignment) {
    if (assignment.priority === 'urgent') {
      return assignment.status === 'in_progress' ? 2 : 2;
    }
    if (assignment.priority === 'high') {
      return assignment.status === 'in_progress' ? 1 : 2;
    }
    return 1;
  }

  /**
   * Calculates the session duration in minutes for an individual study block.
   */
  _calculateSessionDuration(assignment, defaultDuration) {
    if (assignment.priority === 'low') {
      return Math.min(45, defaultDuration);
    }
    return Math.min(90, Math.max(30, defaultDuration));
  }

  /**
   * Generates clear, actionable session titles for multi-session assignment work.
   */
  _formatAssignmentSessionTitle(assignment, sessionIndex, totalSessions) {
    if (totalSessions <= 1) {
      return `Study & Prepare: ${assignment.title}`;
    }
    if (totalSessions === 2) {
      return sessionIndex === 0
        ? `Research & Draft: ${assignment.title}`
        : `Review & Finalize: ${assignment.title}`;
    }
    if (sessionIndex === 0) return `Initial Research: ${assignment.title}`;
    if (sessionIndex === totalSessions - 1) return `Final Polish: ${assignment.title}`;
    return `Deep Work & Problem Solving: ${assignment.title}`;
  }

  /**
   * Resolves effective priority for an assignment based on its base priority and deadline proximity.
   * Approaching deadlines elevate priority deterministically.
   *
   * @param {Assignment|object} assignment
   * @param {number} referenceTime - Epoch ms (e.g. startDate or now)
   * @returns {string} 'low' | 'medium' | 'high' | 'urgent'
   */
  _resolveEffectiveAssignmentPriority(assignment, referenceTime) {
    const basePriority = assignment.priority || 'medium';
    if (basePriority === 'urgent') return 'urgent';

    const hoursUntilDue = (assignment.due_date - referenceTime) / 3600000;
    // Approaching within 24 hours -> urgent
    if (hoursUntilDue <= 24) {
      return 'urgent';
    }
    // Approaching within 48 hours -> at least high
    if (hoursUntilDue <= 48) {
      return 'high';
    }
    // Approaching within 72 hours -> at least medium
    if (hoursUntilDue <= 72 && basePriority === 'low') {
      return 'medium';
    }

    return basePriority;
  }

  /**
   * Resolves effective priority for a goal milestone based on target date proximity and progress.
   *
   * @param {Goal|object} goal
   * @param {number} referenceTime - Epoch ms (e.g. startDate or now)
   * @returns {string} 'low' | 'medium' | 'high' | 'urgent'
   */
  _resolveEffectiveGoalPriority(goal, referenceTime) {
    if (!goal.target_date) return 'medium';

    const daysUntilTarget = (goal.target_date - referenceTime) / 86400000;
    // Target date within 2 days -> urgent
    if (daysUntilTarget <= 2) {
      return 'urgent';
    }
    // Target date within 7 days -> high
    if (daysUntilTarget <= 7) {
      return 'high';
    }
    // Low progress (< 25%) with target date within 14 days -> high
    if (daysUntilTarget <= 14 && (goal.progress || 0) < 25) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Generates actionable planning insights connecting study plans with analytics:
   * - Planned vs completed study work (counts and minutes)
   * - Plan completion rate
   * - Overdue planned work
   * - Missed planned sessions
   * - Upcoming overloaded periods
   * - Unplanned urgent assignments
   * - Insufficient preparation warnings
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - { now, days = 7, startDate, endDate, planId }
   * @returns {Promise<object>} Comprehensive planning insights
   */
  async getPlanningInsights(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Student user ID is required');
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const windowDays = Math.min(60, Math.max(1, Number(options.days) || 7));
    const windowEnd = now + (windowDays * 86400000);

    // 1. Fetch relevant study plan items
    let allItems = [];
    if (options.planId) {
      allItems = this.studyPlanRepo.findItemsByPlanId(options.planId, userId);
    } else if (options.startDate && options.endDate) {
      allItems = this.studyPlanRepo.findInRange(userId, Number(options.startDate), Number(options.endDate));
    } else {
      const stmt = this.database.prepare(`
        SELECT * FROM study_plan_items
        WHERE user_id = ?
        ORDER BY planned_date ASC, order_index ASC
      `);
      const rows = stmt.all(userId);
      allItems = rows.map(r => StudyPlanItem.fromRow(r));
    }

    // 2. Planned vs completed work calculation
    const totalPlannedItems = allItems.length;
    let completedItemsCount = 0;
    let pendingItemsCount = 0;
    let inProgressItemsCount = 0;
    let skippedItemsCount = 0;

    let totalPlannedMinutes = 0;
    let completedMinutes = 0;
    let pendingMinutes = 0;

    for (const item of allItems) {
      const duration = Number(item.duration_minutes) || 0;
      totalPlannedMinutes += duration;

      if (item.status === 'completed') {
        completedItemsCount++;
        completedMinutes += duration;
      } else if (item.status === 'planned') {
        pendingItemsCount++;
        pendingMinutes += duration;
      } else if (item.status === 'in_progress') {
        inProgressItemsCount++;
        pendingMinutes += duration;
      } else if (item.status === 'skipped') {
        skippedItemsCount++;
      }
    }

    const completionRate = totalPlannedItems > 0
      ? Math.round((completedItemsCount / totalPlannedItems) * 100)
      : 0;
    const completionRateMinutes = totalPlannedMinutes > 0
      ? Math.round((completedMinutes / totalPlannedMinutes) * 100)
      : 0;

    // 3. Overdue planned work: status in ('planned', 'in_progress') and planned_date < now
    const overdueList = allItems.filter(item => 
      (item.status === 'planned' || item.status === 'in_progress') &&
      item.planned_date < now
    );
    const overdueTotalMinutes = overdueList.reduce((sum, item) => sum + (Number(item.duration_minutes) || 0), 0);

    // 4. Missed planned sessions: status in ('planned', 'in_progress') and (planned_date + duration) < now
    const missedList = allItems.filter(item => {
      if (item.status !== 'planned' && item.status !== 'in_progress') return false;
      const sessionEnd = item.planned_date + ((Number(item.duration_minutes) || 0) * 60000);
      return sessionEnd < now;
    });
    const missedTotalMinutes = missedList.reduce((sum, item) => sum + (Number(item.duration_minutes) || 0), 0);

    // 5. Upcoming overloaded periods
    let overloadedPeriods = {
      status: 'manageable',
      heavyDaysCount: 0,
      busiestDay: null,
      overloadedDates: [],
      windowDays
    };

    try {
      const workloadSummary = await this.workloadService.getWorkloadSummary(userId, {
        start: now,
        days: windowDays,
        now
      });

      const heavyDays = (workloadSummary.distribution || []).filter(d => d.level === 'heavy' || d.level === 'high' || (d.totalHours || 0) >= 6);
      const heavyDates = heavyDays.map(d => d.date);

      overloadedPeriods = {
        status: heavyDays.length > 0 ? 'overloaded' : ((workloadSummary.averageDailyHours || 0) >= 4 ? 'high_load' : 'manageable'),
        heavyDaysCount: heavyDays.length,
        busiestDay: workloadSummary.busiestDay || null,
        overloadedDates: heavyDates,
        averageDailyHours: workloadSummary.averageDailyHours || 0,
        windowDays
      };
    } catch (e) {
      // Graceful fallback if workload service encounters an issue
    }

    // 6. Unplanned urgent assignments & insufficient preparation warnings
    const activeAsgnStmt = this.database.prepare(`
      SELECT * FROM assignments
      WHERE user_id = ?
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY due_date ASC
    `);
    const activeAssignments = activeAsgnStmt.all(userId);

    const unplannedUrgent = [];
    const prepWarnings = [];

    for (const asgn of activeAssignments) {
      const isDueSoon = asgn.due_date && asgn.due_date <= (now + (48 * 3600000));
      const isHighPriority = asgn.priority === 'urgent' || asgn.priority === 'high';

      // Check planned items for this assignment
      const linkedItems = allItems.filter(item => 
        (item.assignment_id === asgn.id || (item.payload && item.payload.assignmentId === asgn.id)) &&
        item.status !== 'skipped'
      );

      // Total planned minutes before deadline
      const plannedMinutesForAsgn = linkedItems
        .filter(item => asgn.due_date ? item.planned_date <= asgn.due_date : true)
        .reduce((sum, item) => sum + (Number(item.duration_minutes) || 0), 0);

      const hoursUntilDue = asgn.due_date ? Math.round(((asgn.due_date - now) / 3600000) * 10) / 10 : null;

      // If urgent or due within 48h and has zero planned items
      if ((isDueSoon || isHighPriority) && linkedItems.length === 0) {
        unplannedUrgent.push({
          assignmentId: asgn.id,
          title: asgn.title,
          dueDate: asgn.due_date,
          priority: asgn.priority,
          courseId: asgn.course_id,
          hoursUntilDue
        });
      }

      // Check insufficient preparation warnings for assignments due within next 7 days
      if (asgn.due_date && asgn.due_date > now && asgn.due_date <= windowEnd) {
        const recommendedMinutes = asgn.estimated_hours
          ? Number(asgn.estimated_hours) * 60
          : (asgn.priority === 'urgent' ? 180 : (asgn.priority === 'high' ? 120 : 60));

        if (plannedMinutesForAsgn < recommendedMinutes) {
          prepWarnings.push({
            assignmentId: asgn.id,
            title: asgn.title,
            dueDate: asgn.due_date,
            priority: asgn.priority,
            plannedMinutes: plannedMinutesForAsgn,
            recommendedMinutes,
            deficitMinutes: recommendedMinutes - plannedMinutesForAsgn,
            hoursUntilDue
          });
        }
      }
    }

    return {
      studentId: userId,
      asOfTimestamp: now,
      plannedVsCompleted: {
        totalPlannedItems,
        completedItemsCount,
        pendingItemsCount,
        inProgressItemsCount,
        skippedItemsCount,
        totalPlannedMinutes,
        completedMinutes,
        pendingMinutes,
        completionRate,
        completionRateMinutes
      },
      overduePlannedWork: {
        count: overdueList.length,
        totalMinutes: overdueTotalMinutes,
        items: overdueList.map(item => ({
          id: item.id,
          planId: item.plan_id,
          title: item.title,
          plannedDate: item.planned_date,
          durationMinutes: item.duration_minutes,
          priority: item.priority,
          assignmentId: item.assignment_id,
          goalId: item.goal_id
        }))
      },
      missedPlannedSessions: {
        count: missedList.length,
        totalMinutes: missedTotalMinutes,
        items: missedList.map(item => ({
          id: item.id,
          planId: item.plan_id,
          title: item.title,
          plannedDate: item.planned_date,
          durationMinutes: item.duration_minutes,
          priority: item.priority,
          assignmentId: item.assignment_id,
          goalId: item.goal_id
        }))
      },
      upcomingOverloadedPeriods: overloadedPeriods,
      unplannedUrgentAssignments: {
        count: unplannedUrgent.length,
        assignments: unplannedUrgent
      },
      insufficientPreparationWarnings: {
        count: prepWarnings.length,
        warnings: prepWarnings
      }
    };
  }

  /**
   * Processes reminders for planned study work, overdue sessions, and prep warnings:
   * - Upcoming planned study work (with configurable lead time, default 60 mins)
   * - Overdue planned items (scheduled start elapsed)
   * - Deadline preparation warnings (deficit prep time on impending deadlines)
   *
   * Enforces strict duplicate prevention and spam suppression via NotificationRepository.
   *
   * @param {string} userId - Student user ID
   * @param {object} [options={}] - { now, leadTimeMinutes = 60 }
   * @returns {Promise<object>} Processing report with dispatched notifications
   */
  async processPlanningReminders(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Student user ID is required');
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const leadTimeMinutes = Math.min(1440, Math.max(5, Number(options.leadTimeMinutes) || 60));
    const leadTimeMs = leadTimeMinutes * 60000;

    const sentUpcoming = [];
    const sentOverdue = [];
    const sentPrepWarnings = [];

    // 1. Upcoming planned study work
    const upcomingStmt = this.database.prepare(`
      SELECT * FROM study_plan_items
      WHERE user_id = ?
        AND status = 'planned'
        AND planned_date > ?
        AND planned_date <= ?
      ORDER BY planned_date ASC
    `);
    const upcomingRows = upcomingStmt.all(userId, now, now + leadTimeMs);

    for (const row of upcomingRows) {
      const item = StudyPlanItem.fromRow(row);
      // Duplicate prevention: already notified for this upcoming item?
      const existing = this.notificationService.findByResource(
        userId,
        'study_plan_item_upcoming',
        item.id
      );

      if (existing && existing.length > 0) {
        continue;
      }

      const minutesUntil = Math.max(1, Math.round((item.planned_date - now) / 60000));
      const notifPriority = item.priority === 'urgent' || item.priority === 'high' ? 'high' : 'medium';

      const notif = this.notificationService.createNotification(userId, {
        type: 'reminder',
        title: `Upcoming Study: ${item.title}`,
        message: `Your planned study session "${item.title}" starts in ${minutesUntil} minute${minutesUntil === 1 ? '' : 's'}.`,
        priority: notifPriority,
        related_resource_type: 'study_plan_item_upcoming',
        related_resource_id: item.id,
        payload: {
          planId: item.plan_id,
          itemId: item.id,
          plannedDate: item.planned_date,
          durationMinutes: item.duration_minutes
        }
      });

      sentUpcoming.push(notif);
    }

    // 2. Overdue planned items: scheduled start in past (within past 48 hours), still planned
    const overdueCutoff = now - (48 * 3600000);
    const overdueStmt = this.database.prepare(`
      SELECT * FROM study_plan_items
      WHERE user_id = ?
        AND status = 'planned'
        AND planned_date < ?
        AND planned_date >= ?
      ORDER BY planned_date ASC
    `);
    const overdueRows = overdueStmt.all(userId, now, overdueCutoff);

    for (const row of overdueRows) {
      const item = StudyPlanItem.fromRow(row);
      // Duplicate prevention: already sent overdue notification for this item?
      const existing = this.notificationService.findByResource(
        userId,
        'study_plan_item_overdue',
        item.id
      );

      if (existing && existing.length > 0) {
        continue;
      }

      const notif = this.notificationService.createNotification(userId, {
        type: 'reminder',
        title: `Overdue Study Session: ${item.title}`,
        message: `Your planned study session "${item.title}" scheduled for ${new Date(item.planned_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} is currently overdue.`,
        priority: 'high',
        related_resource_type: 'study_plan_item_overdue',
        related_resource_id: item.id,
        payload: {
          planId: item.plan_id,
          itemId: item.id,
          plannedDate: item.planned_date,
          durationMinutes: item.duration_minutes
        }
      });

      sentOverdue.push(notif);
    }

    // 3. Deadline preparation warnings:
    // Important deadlines (due <= 48h) with insufficient planned preparation
    const insights = await this.getPlanningInsights(userId, { now, days: 7 });
    const warnings = (insights.insufficientPreparationWarnings?.warnings || []).filter(w => 
      w.hoursUntilDue !== null && w.hoursUntilDue <= 48
    );

    for (const warning of warnings) {
      const existing = this.notificationService.findByResource(
        userId,
        'assignment_prep_warning',
        warning.assignmentId
      );

      // Throttling / spam prevention: do not send if sent within the last 24 hours
      if (existing && existing.length > 0) {
        const mostRecentTime = Math.max(...existing.map(n => n.created_at || 0));
        if (now - mostRecentTime < (24 * 3600000)) {
          continue;
        }
      }

      const notif = this.notificationService.createNotification(userId, {
        type: 'reminder',
        title: `Preparation Warning: ${warning.title}`,
        message: `Assignment "${warning.title}" is due in ${warning.hoursUntilDue}h with only ${warning.plannedMinutes}m of planned study (${warning.deficitMinutes}m deficit).`,
        priority: 'high',
        related_resource_type: 'assignment_prep_warning',
        related_resource_id: warning.assignmentId,
        payload: {
          assignmentId: warning.assignmentId,
          dueDate: warning.dueDate,
          plannedMinutes: warning.plannedMinutes,
          recommendedMinutes: warning.recommendedMinutes,
          deficitMinutes: warning.deficitMinutes,
          hoursUntilDue: warning.hoursUntilDue
        }
      });

      sentPrepWarnings.push(notif);
    }

    return {
      processedAt: now,
      studentId: userId,
      remindersSent: {
        upcomingCount: sentUpcoming.length,
        overdueCount: sentOverdue.length,
        prepWarningCount: sentPrepWarnings.length,
        totalCount: sentUpcoming.length + sentOverdue.length + sentPrepWarnings.length
      },
      notifications: [
        ...sentUpcoming,
        ...sentOverdue,
        ...sentPrepWarnings
      ]
    };
  }
}


const studyPlanningService = new StudyPlanningService();

module.exports = {
  StudyPlanningService,
  studyPlanningService
};
