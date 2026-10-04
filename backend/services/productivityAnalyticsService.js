/**
 * ProductivityAnalyticsService
 *
 * Deterministic calculation service for student productivity, completion metrics,
 * study hours, deliverable tracking, and goal progress.
 *
 * All metrics are derived from actual database records (no AI-generated or arbitrary scores).
 * Timezone-aware for Asia/Kolkata (IST UTC+05:30).
 */

const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { calendarEventRepository } = require('../repositories/CalendarEventRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { getConnection } = require('../db/connection');
const {
  getMumbaiNow,
  getMumbaiTodayRange,
  getMumbaiWeekRange,
  getMumbaiMonthRange,
  getDateKeyIST,
  DAYS_OF_WEEK
} = require('../utils/timezone');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

class ProductivityAnalyticsService {
  constructor(
    asgnRepo = assignmentRepository,
    goalRepo = goalRepository,
    studyRepo = studySessionRepository,
    eventRepo = calendarEventRepository,
    courseRepo = courseRepository,
    userRepo = userRepository,
    dbInstance = null
  ) {
    this.asgnRepo = asgnRepo;
    this.goalRepo = goalRepo;
    this.studyRepo = studyRepo;
    this.eventRepo = eventRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  assertOwnership(studentUserId, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student productivity metrics');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === studentUserId) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to view another student productivity statistics');
  }

  /**
   * Resolves the start and end epoch millisecond boundaries for the requested period.
   * Supports 'today', 'week', 'month', 'custom', or explicit from/to timestamps.
   *
   * @param {object} options
   * @param {Date} [baseDate=new Date()]
   * @returns {object} { rangeType, start, end, label, daysCount }
   */
  resolveTimeRange(options = {}, baseDate = new Date()) {
    const rangeParam = (options.range || '').toLowerCase().trim();

    // 1. Explicit Custom Range
    if (options.from !== undefined || options.to !== undefined || rangeParam === 'custom') {
      const fromVal = Number(options.from !== undefined ? options.from : options.start);
      const toVal = Number(options.to !== undefined ? options.to : options.end);

      if (isNaN(fromVal) || isNaN(toVal) || fromVal <= 0 || toVal <= 0) {
        throw new ValidationError("Custom range requires valid positive timestamps for 'from' and 'to'");
      }
      if (fromVal > toVal) {
        throw new ValidationError("'from' timestamp must be less than or equal to 'to' timestamp");
      }

      const daysCount = Math.max(1, Math.ceil((toVal - fromVal) / 86400000));
      return {
        rangeType: 'custom',
        start: fromVal,
        end: toVal,
        label: `${getDateKeyIST(fromVal)} to ${getDateKeyIST(toVal)}`,
        daysCount
      };
    }

    // 2. Today (00:00:00 - 23:59:59.999 IST)
    if (rangeParam === 'today') {
      const { startOfDay, endOfDay } = getMumbaiTodayRange(baseDate);
      return {
        rangeType: 'today',
        start: startOfDay,
        end: endOfDay,
        label: 'Today',
        daysCount: 1
      };
    }

    // 3. Current Month (1st 00:00:00 - Last 23:59:59.999 IST)
    if (rangeParam === 'month' || rangeParam === 'current_month' || rangeParam === 'this_month') {
      const { startOfMonth, endOfMonth } = getMumbaiMonthRange(baseDate);
      const daysCount = Math.round((endOfMonth - startOfMonth + 1) / 86400000);
      return {
        rangeType: 'month',
        start: startOfMonth,
        end: endOfMonth,
        label: 'Current Month',
        daysCount
      };
    }

    // 4. Default: Current Week (Monday 00:00:00 - Sunday 23:59:59.999 IST)
    const { startOfWeek, endOfWeek } = getMumbaiWeekRange(baseDate);
    return {
      rangeType: 'week',
      start: startOfWeek,
      end: endOfWeek,
      label: 'Current Week',
      daysCount: 7
    };
  }

  /**
   * Generates comprehensive, fact-based productivity metrics for a student.
   *
   * @param {string} studentUserId
   * @param {object} requestingUser
   * @param {object} [options={}]
   * @returns {object} Productivity statistics
   */
  getProductivityMetrics(studentUserId, requestingUser, options = {}) {
    this.assertOwnership(studentUserId, requestingUser);

    const user = this.userRepo.findById(studentUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${studentUserId}' not found`);
    }

    const now = options.now !== undefined ? Number(options.now) : Date.now();
    const baseDate = options.now !== undefined ? new Date(options.now) : new Date();
    const period = this.resolveTimeRange(options, baseDate);
    const { start, end } = period;

    const db = this.database;

    // -------------------------------------------------------------
    // 1. Assignments / Tasks Aggregation (Single SQL Queries)
    // -------------------------------------------------------------
    // A. Tasks completed in period (by completed_at timestamp)
    const completedInPeriodStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM assignments
      WHERE user_id = ? 
        AND status = 'completed'
        AND completed_at >= ?
        AND completed_at <= ?
    `);
    const completedInPeriod = Number(completedInPeriodStmt.get(studentUserId, start, end)?.count || 0);

    // B. Tasks with due dates falling in the period
    const dueInPeriodStmt = db.prepare(`
      SELECT
        COUNT(*) as total_due,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_due,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_due,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_due,
        SUM(CASE WHEN status NOT IN ('completed', 'cancelled') AND due_date < ? THEN 1 ELSE 0 END) as overdue_in_range
      FROM assignments
      WHERE user_id = ? 
        AND status != 'cancelled'
        AND due_date >= ?
        AND due_date <= ?
    `);
    const dueStats = dueInPeriodStmt.get(now, studentUserId, start, end);
    const totalDue = Number(dueStats?.total_due || 0);
    const completedDue = Number(dueStats?.completed_due || 0);
    const inProgressDue = Number(dueStats?.in_progress_due || 0);
    const pendingDue = Number(dueStats?.pending_due || 0);
    const overdueInRange = Number(dueStats?.overdue_in_range || 0);

    // C. All-time overdue deliverables as of now
    const allOverdueStmt = db.prepare(`
      SELECT COUNT(*) as overdue_count
      FROM assignments
      WHERE user_id = ?
        AND status NOT IN ('completed', 'cancelled')
        AND due_date < ?
    `);
    const allOverdueCount = Number(allOverdueStmt.get(studentUserId, now)?.overdue_count || 0);

    // D. All-time completed & total assignments
    const allTimeAsgnStmt = db.prepare(`
      SELECT
        COUNT(*) as total_all_time,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_all_time,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_all_time,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_all_time
      FROM assignments
      WHERE user_id = ? AND status != 'cancelled'
    `);
    const allTimeStats = allTimeAsgnStmt.get(studentUserId);
    const allTimeTotal = Number(allTimeStats?.total_all_time || 0);
    const allTimeCompleted = Number(allTimeStats?.completed_all_time || 0);
    const allTimePending = Number(allTimeStats?.pending_all_time || 0);
    const allTimeInProgress = Number(allTimeStats?.in_progress_all_time || 0);

    // -------------------------------------------------------------
    // 2. Study Sessions Aggregation (Single SQL Queries)
    // -------------------------------------------------------------
    // Filter sessions belonging to period by planned_start_time
    const studyStmt = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as planned_sessions,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_sessions,
        SUM(COALESCE(planned_duration_minutes, 0)) as total_planned_minutes,
        SUM(CASE WHEN status = 'completed' THEN COALESCE(actual_duration_minutes, planned_duration_minutes, 0) ELSE 0 END) as completed_minutes
      FROM study_sessions
      WHERE user_id = ? 
        AND status != 'cancelled'
        AND planned_start_time >= ?
        AND planned_start_time <= ?
    `);
    const studyStats = studyStmt.get(studentUserId, start, end);
    const studyTotal = Number(studyStats?.total_sessions || 0);
    const studyCompleted = Number(studyStats?.completed_sessions || 0);
    const studyPlannedSessions = Number(studyStats?.planned_sessions || 0);
    const studyInProgress = Number(studyStats?.in_progress_sessions || 0);
    const studyPlannedMinutes = Number(studyStats?.total_planned_minutes || 0);
    const studyCompletedMinutes = Number(studyStats?.completed_minutes || 0);
    const studyAdherenceRate = studyPlannedMinutes > 0
      ? Math.round((studyCompletedMinutes / studyPlannedMinutes) * 100)
      : (studyCompleted > 0 ? 100 : 0);

    // Study time broken down by course
    const studyByCourseStmt = db.prepare(`
      SELECT
        c.id as course_id,
        c.name as course_name,
        c.code as course_code,
        c.color as course_color,
        COUNT(s.id) as total_sessions,
        SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(COALESCE(s.planned_duration_minutes, 0)) as planned_minutes,
        SUM(CASE WHEN s.status = 'completed' THEN COALESCE(s.actual_duration_minutes, s.planned_duration_minutes, 0) ELSE 0 END) as completed_minutes
      FROM courses c
      LEFT JOIN study_sessions s ON c.id = s.course_id 
        AND s.user_id = ? 
        AND s.status != 'cancelled'
        AND s.planned_start_time >= ? 
        AND s.planned_start_time <= ?
      WHERE c.user_id = ? AND c.archived = 0
      GROUP BY c.id
      ORDER BY completed_minutes DESC, c.name ASC
    `);
    const courseRows = studyByCourseStmt.all(studentUserId, start, end, studentUserId);

    const studyByCourse = courseRows.map(r => {
      const cMinutes = Number(r.completed_minutes || 0);
      const pMinutes = Number(r.planned_minutes || 0);
      return {
        courseId: r.course_id,
        courseName: r.course_name,
        courseCode: r.course_code,
        courseColor: r.course_color,
        totalSessions: Number(r.total_sessions || 0),
        completedSessions: Number(r.completed_sessions || 0),
        plannedMinutes: pMinutes,
        completedMinutes: cMinutes,
        completedHours: Math.round((cMinutes / 60) * 10) / 10
      };
    });

    // Check for study sessions without an associated course (general study)
    const unassignedStudyStmt = db.prepare(`
      SELECT
        COUNT(id) as total_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(COALESCE(planned_duration_minutes, 0)) as planned_minutes,
        SUM(CASE WHEN status = 'completed' THEN COALESCE(actual_duration_minutes, planned_duration_minutes, 0) ELSE 0 END) as completed_minutes
      FROM study_sessions
      WHERE user_id = ? 
        AND course_id IS NULL 
        AND status != 'cancelled'
        AND planned_start_time >= ? 
        AND planned_start_time <= ?
    `);
    const unassignedRow = unassignedStudyStmt.get(studentUserId, start, end);
    if (unassignedRow && Number(unassignedRow.total_sessions || 0) > 0) {
      const uMinutes = Number(unassignedRow.completed_minutes || 0);
      studyByCourse.push({
        courseId: null,
        courseName: 'General / Unassigned',
        courseCode: null,
        courseColor: '#6B7280',
        totalSessions: Number(unassignedRow.total_sessions || 0),
        completedSessions: Number(unassignedRow.completed_sessions || 0),
        plannedMinutes: Number(unassignedRow.planned_minutes || 0),
        completedMinutes: uMinutes,
        completedHours: Math.round((uMinutes / 60) * 10) / 10
      });
    }

    // -------------------------------------------------------------
    // 3. Student Goals Aggregation (Single SQL Query)
    // -------------------------------------------------------------
    const goalsStmt = db.prepare(`
      SELECT
        COUNT(*) as total_goals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_goals,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active_goals,
        SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold_goals,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_goals,
        AVG(CASE WHEN status = 'in_progress' THEN progress ELSE NULL END) as avg_active_progress,
        SUM(CASE WHEN status = 'completed' AND completed_at >= ? AND completed_at <= ? THEN 1 ELSE 0 END) as completed_in_period,
        SUM(CASE WHEN target_date IS NOT NULL AND target_date < ? AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as overdue_goals
      FROM goals
      WHERE user_id = ?
    `);
    const goalStats = goalsStmt.get(start, end, now, studentUserId);
    const goalsTotal = Number(goalStats?.total_goals || 0);
    const goalsCompleted = Number(goalStats?.completed_goals || 0);
    const goalsActive = Number(goalStats?.active_goals || 0);
    const goalsOnHold = Number(goalStats?.on_hold_goals || 0);
    const goalsCancelled = Number(goalStats?.cancelled_goals || 0);
    const goalsCompletedInPeriod = Number(goalStats?.completed_in_period || 0);
    const goalsOverdue = Number(goalStats?.overdue_goals || 0);
    const goalsAvgActiveProgress = goalStats?.avg_active_progress !== null && goalStats?.avg_active_progress !== undefined
      ? Math.round(Number(goalStats.avg_active_progress))
      : 0;

    // -------------------------------------------------------------
    // 4. Calendar Events in Period
    // -------------------------------------------------------------
    const eventsStmt = db.prepare(`
      SELECT
        event_type,
        COUNT(*) as count,
        SUM(MAX(0, (end_time - start_time) / 60000)) as duration_minutes
      FROM calendar_events
      WHERE user_id = ?
        AND status != 'cancelled'
        AND start_time >= ?
        AND start_time <= ?
      GROUP BY event_type
    `);
    const eventRows = eventsStmt.all(studentUserId, start, end);
    let totalCalendarEvents = 0;
    let totalCalendarMinutes = 0;
    const eventsByType = {};

    for (const er of eventRows) {
      const eCount = Number(er.count || 0);
      const eMins = Number(er.duration_minutes || 0);
      totalCalendarEvents += eCount;
      totalCalendarMinutes += eMins;
      eventsByType[er.event_type] = {
        count: eCount,
        minutes: eMins,
        hours: Math.round((eMins / 60) * 10) / 10
      };
    }

    // -------------------------------------------------------------
    // 5. Daily Productivity Breakdown (for periods up to 31 days)
    // -------------------------------------------------------------
    const dailyBreakdown = [];
    if (period.daysCount <= 31) {
      // Fetch completed tasks in range with exact date key
      const asgnDayStmt = db.prepare(`
        SELECT completed_at
        FROM assignments
        WHERE user_id = ?
          AND status = 'completed'
          AND completed_at >= ?
          AND completed_at <= ?
      `);
      const asgnDayRows = asgnDayStmt.all(studentUserId, start, end);
      const taskCountByDay = {};
      for (const row of asgnDayRows) {
        if (row.completed_at) {
          const key = getDateKeyIST(row.completed_at);
          taskCountByDay[key] = (taskCountByDay[key] || 0) + 1;
        }
      }

      // Fetch study sessions completed in range by day
      const studyDayStmt = db.prepare(`
        SELECT planned_start_time, actual_duration_minutes, planned_duration_minutes
        FROM study_sessions
        WHERE user_id = ?
          AND status = 'completed'
          AND planned_start_time >= ?
          AND planned_start_time <= ?
      `);
      const studyDayRows = studyDayStmt.all(studentUserId, start, end);
      const studyMinutesByDay = {};
      for (const row of studyDayRows) {
        const key = getDateKeyIST(row.planned_start_time);
        const mins = Number(row.actual_duration_minutes || row.planned_duration_minutes || 0);
        studyMinutesByDay[key] = (studyMinutesByDay[key] || 0) + mins;
      }

      // Fetch calendar events in range by day
      const eventDayStmt = db.prepare(`
        SELECT start_time
        FROM calendar_events
        WHERE user_id = ?
          AND status != 'cancelled'
          AND start_time >= ?
          AND start_time <= ?
      `);
      const eventDayRows = eventDayStmt.all(studentUserId, start, end);
      const eventsCountByDay = {};
      for (const row of eventDayRows) {
        const key = getDateKeyIST(row.start_time);
        eventsCountByDay[key] = (eventsCountByDay[key] || 0) + 1;
      }

      // Iterate day-by-day in IST
      let currentDayEpoch = start;
      const dayStep = 24 * 3600 * 1000;
      while (currentDayEpoch <= end) {
        const dateKey = getDateKeyIST(currentDayEpoch);
        const istDate = new Date(currentDayEpoch + (5 * 60 + 30) * 60 * 1000);
        const dayOfWeek = DAYS_OF_WEEK[istDate.getUTCDay()];
        const sMins = studyMinutesByDay[dateKey] || 0;

        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          tasksCompleted: taskCountByDay[dateKey] || 0,
          studyMinutes: sMins,
          studyHours: Math.round((sMins / 60) * 10) / 10,
          eventsScheduled: eventsCountByDay[dateKey] || 0
        });

        currentDayEpoch += dayStep;
      }
    }

    // -------------------------------------------------------------
    // 6. Study Planning Aggregation (Single SQL Query)
    // -------------------------------------------------------------
    const planStmt = db.prepare(`
      SELECT
        COUNT(*) as total_planned_items,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_items,
        SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as pending_items,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_items,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_items,
        SUM(COALESCE(duration_minutes, 0)) as total_planned_minutes,
        SUM(CASE WHEN status = 'completed' THEN COALESCE(duration_minutes, 0) ELSE 0 END) as completed_minutes,
        SUM(CASE WHEN status = 'planned' AND planned_date < ? THEN 1 ELSE 0 END) as overdue_items,
        SUM(CASE WHEN status = 'planned' AND (planned_date + (duration_minutes * 60000)) < ? THEN 1 ELSE 0 END) as missed_sessions
      FROM study_plan_items
      WHERE user_id = ?
        AND status != 'cancelled'
        AND planned_date >= ?
        AND planned_date <= ?
    `);
    const planStats = planStmt.get(now, now, studentUserId, start, end);
    const totalPlannedItems = Number(planStats?.total_planned_items || 0);
    const completedPlannedItems = Number(planStats?.completed_items || 0);
    const pendingPlannedItems = Number(planStats?.pending_items || 0);
    const inProgressPlannedItems = Number(planStats?.in_progress_items || 0);
    const skippedPlannedItems = Number(planStats?.skipped_items || 0);
    const totalPlannedMinutes = Number(planStats?.total_planned_minutes || 0);
    const completedPlannedMinutes = Number(planStats?.completed_minutes || 0);
    const overduePlannedItems = Number(planStats?.overdue_items || 0);
    const missedPlannedSessions = Number(planStats?.missed_sessions || 0);
    const planCompletionRate = totalPlannedItems > 0
      ? Math.round((completedPlannedItems / totalPlannedItems) * 100)
      : 0;
    const planCompletionRateMinutes = totalPlannedMinutes > 0
      ? Math.round((completedPlannedMinutes / totalPlannedMinutes) * 100)
      : 0;

    return {
      studentId: studentUserId,
      asOfTimestamp: now,
      period: {
        type: period.rangeType,
        label: period.label,
        start,
        end,
        daysCount: period.daysCount
      },
      assignments: {
        completedInPeriod,
        dueInPeriod: totalDue,
        completedDueInPeriod: completedDue,
        pendingDueInPeriod: pendingDue,
        inProgressDueInPeriod: inProgressDue,
        overdueInRange,
        overdueAsOfNow: allOverdueCount,
        completionRate: totalDue > 0 ? Math.round((completedDue / totalDue) * 100) : 0,
        allTime: {
          total: allTimeTotal,
          completed: allTimeCompleted,
          pending: allTimePending,
          inProgress: allTimeInProgress
        }
      },
      studySessions: {
        totalSessions: studyTotal,
        completedSessions: studyCompleted,
        plannedSessions: studyPlannedSessions,
        inProgressSessions: studyInProgress,
        plannedMinutes: studyPlannedMinutes,
        plannedHours: Math.round((studyPlannedMinutes / 60) * 10) / 10,
        completedMinutes: studyCompletedMinutes,
        completedHours: Math.round((studyCompletedMinutes / 60) * 10) / 10,
        adherencePercentage: studyAdherenceRate,
        byCourse: studyByCourse
      },
      goals: {
        total: goalsTotal,
        active: goalsActive,
        completed: goalsCompleted,
        onHold: goalsOnHold,
        cancelled: goalsCancelled,
        completedInPeriod: goalsCompletedInPeriod,
        overdue: goalsOverdue,
        averageActiveProgress: goalsAvgActiveProgress
      },
      calendar: {
        totalEvents: totalCalendarEvents,
        totalMinutes: totalCalendarMinutes,
        totalHours: Math.round((totalCalendarMinutes / 60) * 10) / 10,
        byType: eventsByType
      },
      studyPlanning: {
        totalPlannedItems,
        completedItems: completedPlannedItems,
        pendingItems: pendingPlannedItems,
        inProgressItems: inProgressPlannedItems,
        skippedItems: skippedPlannedItems,
        totalPlannedMinutes,
        completedMinutes: completedPlannedMinutes,
        overdueItems: overduePlannedItems,
        missedSessions: missedPlannedSessions,
        completionRate: planCompletionRate,
        completionRateMinutes: planCompletionRateMinutes
      },
      dailyBreakdown
    };

  }
}

const productivityAnalyticsService = new ProductivityAnalyticsService();

module.exports = {
  ProductivityAnalyticsService,
  productivityAnalyticsService
};
