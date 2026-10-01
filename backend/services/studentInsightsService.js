/**
 * StudentInsightsService
 *
 * Unified student overview and academic insights aggregator.
 * Combines active goals, goal progress, upcoming and overdue assignments,
 * today's calendar schedule, upcoming study sessions, unread notifications count,
 * workload summaries, and productivity statistics into a single cohesive payload.
 *
 * Adheres strictly to:
 * - Single-pass course pre-fetching (zero N+1 queries).
 * - Timezone-aware date boundaries (Asia/Kolkata IST UTC+05:30).
 * - Full cross-user authorization and data isolation.
 * - Clean delegation to existing domain services.
 */

const { userRepository } = require('../repositories/UserRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { notificationRepository } = require('../repositories/NotificationRepository');
const { notificationService } = require('./notificationService');
const { calendarRangeService } = require('./calendarRangeService');
const { workloadAnalysisService } = require('./workloadAnalysisService');
const { productivityAnalyticsService } = require('./productivityAnalyticsService');
const { Assignment } = require('../models/Assignment');
const { StudySession } = require('../models/StudySession');
const { getConnection } = require('../db/connection');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../errors');

class StudentInsightsService {
  constructor(
    userRepo = userRepository,
    courseRepo = courseRepository,
    goalRepo = goalRepository,
    asgnRepo = assignmentRepository,
    studyRepo = studySessionRepository,
    notifRepo = notificationRepository,
    notifSvc = notificationService,
    calendarRangeSvc = calendarRangeService,
    workloadSvc = workloadAnalysisService,
    productivitySvc = productivityAnalyticsService,
    dbInstance = null
  ) {
    this.userRepo = userRepo;
    this.courseRepo = courseRepo;
    this.goalRepo = goalRepo;
    this.asgnRepo = asgnRepo;
    this.studyRepo = studyRepo;
    this.notifRepo = notifRepo;
    this.notifSvc = notifSvc;
    this.calendarRangeSvc = calendarRangeSvc;
    this.workloadSvc = workloadSvc;
    this.productivitySvc = productivitySvc;
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Asserts requesting user owns the student insights data or is an admin.
   */
  assertOwnership(studentUserId, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student overview/insights');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === studentUserId) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to view overview/insights for another student');
  }

  /**
   * Generates a comprehensive insights and overview payload for the authenticated student.
   *
   * @param {string} studentUserId - Target student user ID
   * @param {object} requestingUser - Authenticated user initiating request
   * @param {object} [options={}] - Query options { range, from, to, days }
   * @returns {Promise<object>} Combined student insights payload
   */
  async getStudentInsights(studentUserId, requestingUser, options = {}) {
    this.assertOwnership(studentUserId, requestingUser);

    const user = this.userRepo.findById(studentUserId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${studentUserId}' not found`);
    }

    const now = Date.now();
    const upcomingDays = Math.min(30, Math.max(1, Number(options.days) || 7));
    const upcomingWindowEnd = now + (upcomingDays * 86400000);

    // 1. Single-pass pre-fetch of student courses to prevent N+1 query patterns
    const courses = this.courseRepo.findByUserId(studentUserId);
    const coursesMap = new Map();
    for (const c of courses) {
      coursesMap.set(c.id, {
        id: c.id,
        name: c.name,
        code: c.code,
        color: c.color,
        credits: c.credits
      });
    }

    const enrichWithCourse = (item) => {
      if (!item) return null;
      const raw = typeof item.toJSON === 'function' ? item.toJSON() : { ...item };
      const courseId = raw.course_id || raw.courseId;
      if (courseId && coursesMap.has(courseId)) {
        raw.course = coursesMap.get(courseId);
      } else {
        raw.course = null;
      }
      return raw;
    };

    // 2. Unread notification count
    const { unreadCount: unreadNotificationsCount } = this.notifSvc.getUnreadCount(studentUserId, requestingUser);

    // 3. Active goals and overall goal progress summary
    const activeGoalsRaw = this.goalRepo.findByUserId(studentUserId, { status: 'in_progress' });
    const notStartedGoals = this.goalRepo.findByUserId(studentUserId, { status: 'not_started' });
    const combinedActiveGoals = [...activeGoalsRaw, ...notStartedGoals]
      .sort((a, b) => {
        const dateA = a.target_date || Infinity;
        const dateB = b.target_date || Infinity;
        return dateA - dateB;
      })
      .slice(0, 10);
    const activeGoals = combinedActiveGoals.map(enrichWithCourse);

    const goalAggStmt = this.database.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('in_progress', 'not_started') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        AVG(CASE WHEN status IN ('in_progress', 'not_started') THEN progress ELSE NULL END) as avg_progress
      FROM goals
      WHERE user_id = ?
    `);
    const goalAggRow = goalAggStmt.get(studentUserId) || {};
    const goalProgress = {
      total: goalAggRow.total || 0,
      active: goalAggRow.active || 0,
      completed: goalAggRow.completed || 0,
      averageActiveProgress: Math.round(goalAggRow.avg_progress || 0)
    };

    // 4. Upcoming assignments (due within upcomingDays, not completed/cancelled)
    const upcomingAsgnStmt = this.database.prepare(`
      SELECT * FROM assignments
      WHERE user_id = ?
        AND due_date >= ?
        AND due_date <= ?
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY due_date ASC
      LIMIT 20
    `);
    const upcomingAssignments = upcomingAsgnStmt
      .all(studentUserId, now, upcomingWindowEnd)
      .map(r => enrichWithCourse(Assignment.fromRow(r)));

    // 5. Overdue assignments (due before now, not completed/cancelled)
    const overdueAsgnStmt = this.database.prepare(`
      SELECT * FROM assignments
      WHERE user_id = ?
        AND due_date < ?
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY due_date ASC
      LIMIT 20
    `);
    const overdueAssignments = overdueAsgnStmt
      .all(studentUserId, now)
      .map(r => enrichWithCourse(Assignment.fromRow(r)));

    // 6. Today's calendar schedule & agenda (Timezone-aware Asia/Kolkata)
    const todayCalendar = await this.calendarRangeSvc.getTodaySchedule(studentUserId);
    if (todayCalendar && Array.isArray(todayCalendar.timeline)) {
      todayCalendar.timeline = todayCalendar.timeline.map(item => {
        if (item.courseId && coursesMap.has(item.courseId)) {
          return { ...item, course: coursesMap.get(item.courseId) };
        }
        return { ...item, course: null };
      });
    }

    // 7. Upcoming study sessions
    const studyStmt = this.database.prepare(`
      SELECT * FROM study_sessions
      WHERE user_id = ?
        AND planned_start_time >= ?
        AND planned_start_time <= ?
        AND status != 'cancelled'
      ORDER BY planned_start_time ASC
      LIMIT 20
    `);
    const upcomingStudySessions = studyStmt
      .all(studentUserId, now, upcomingWindowEnd)
      .map(r => enrichWithCourse(StudySession.fromRow(r)));

    // 8. Workload summary for next N days
    const workloadSummary = await this.workloadSvc.getWorkloadSummary(studentUserId, {
      start: now,
      days: upcomingDays
    });

    // 9. Deterministic productivity metrics
    const productivityMetrics = this.productivitySvc.getProductivityMetrics(studentUserId, requestingUser, {
      range: options.range || 'week',
      from: options.from,
      to: options.to
    });

    return {
      student: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        college_name: user.college_name
      },
      summary: {
        unreadNotificationsCount,
        activeGoalsCount: goalProgress.active,
        upcomingAssignmentsCount: upcomingAssignments.length,
        overdueAssignmentsCount: overdueAssignments.length,
        todayEventsCount: (todayCalendar.events || []).length,
        upcomingStudySessionsCount: upcomingStudySessions.length
      },
      activeGoals,
      goalProgress,
      upcomingAssignments,
      overdueAssignments,
      todayCalendar,
      upcomingStudySessions,
      unreadNotificationsCount,
      workloadSummary,
      productivityMetrics
    };
  }
}

const studentInsightsService = new StudentInsightsService();

module.exports = {
  StudentInsightsService,
  studentInsightsService
};
