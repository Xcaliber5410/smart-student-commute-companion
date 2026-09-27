/**
 * StudentDashboardService
 *
 * Aggregation service delivering unified, student-tailored commute data
 * for the home/dashboard view. Enforces student data isolation and optimal querying.
 */

const { userRepository } = require('../repositories/UserRepository');
const { studentProfileRepository } = require('../repositories/StudentProfileRepository');
const { studentScheduleRepository } = require('../repositories/StudentScheduleRepository');
const { savedRouteRepository } = require('../repositories/SavedRouteRepository');
const { rideGroupMemberRepository } = require('../repositories/RideGroupMemberRepository');
const { reportRepository } = require('../repositories/ReportRepository');
const { studentContextService } = require('./studentContextService');
const { NotFoundError, ForbiddenError } = require('../errors');

class StudentDashboardService {
  constructor(
    userRepo = userRepository,
    profileRepo = studentProfileRepository,
    scheduleRepo = studentScheduleRepository,
    savedRouteRepo = savedRouteRepository,
    memberRepo = rideGroupMemberRepository,
    repRepo = reportRepository,
    contextSvc = studentContextService
  ) {
    this.userRepo = userRepo;
    this.profileRepo = profileRepo;
    this.scheduleRepo = scheduleRepo;
    this.savedRouteRepo = savedRouteRepo;
    this.memberRepo = memberRepo;
    this.repRepo = repRepo;
    this.contextSvc = contextSvc;
  }

  /**
   * Asserts that the requesting user owns the student dashboard data or is an admin.
   */
  assertOwnership(studentUserId, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student dashboard');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === studentUserId) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to view another student dashboard');
  }

  /**
   * Aggregates dashboard data for the authenticated student.
   *
   * @param {string} studentUserId
   * @param {object} requestingUser
   * @param {object} [options={}]
   * @param {string} [options.day] Override current day for testing (e.g. 'Mon', 'Tue')
   * @param {string} [options.currentTime] Override current HH:MM time for testing (e.g. '08:00')
   * @returns {object} Aggregated student dashboard summary
   */
  getDashboardData(studentUserId, requestingUser, options = {}) {
    this.assertOwnership(studentUserId, requestingUser);

    // 1. Fetch student context (profile + user details)
    const context = this.contextSvc.getStudentContext(studentUserId, requestingUser);

    // 2. Fetch all student schedules
    const allSchedules = this.scheduleRepo.findByUserId(studentUserId, { active: 1 });

    // Determine current day of week (e.g., 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
    const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = options.day || daysMap[new Date().getDay()];

    // Current time in HH:MM format
    const now = new Date();
    const currentHHMM = options.currentTime || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Filter schedules active for today
    const todaySchedules = allSchedules
      .filter(s => Array.isArray(s.days_of_week) && s.days_of_week.includes(currentDay))
      .sort((a, b) => a.target_arrival_time.localeCompare(b.target_arrival_time));

    // Next scheduled commute: earliest schedule today whose arrival time is upcoming,
    // or the next upcoming schedule today, or null if none
    let nextCommute = todaySchedules.find(s => s.target_arrival_time >= currentHHMM) || todaySchedules[0] || null;

    // 3. Fetch student saved routes
    const allSavedRoutes = this.savedRouteRepo.findByUserId(studentUserId);
    const recentSavedRoutes = allSavedRoutes.slice(0, 3).map(r => r.toJSON());

    // 4. Fetch student ride group memberships
    const studentGroups = this.memberRepo.findGroupsByUserId(studentUserId);

    // 5. Gather relevant live disruption alerts
    // Search active reports matching student's home area or destination college
    const activeReports = this.repRepo.findActive();
    const studentHome = (context.profile.home_area || '').toLowerCase();
    const studentCollege = (context.profile.default_college || context.user.college_name || '').toLowerCase();

    const relevantAlerts = activeReports.filter(report => {
      const area = (report.area || '').toLowerCase();
      const message = (report.message || '').toLowerCase();
      const route = (report.route_name || '').toLowerCase();

      const matchesHome = studentHome && (area.includes(studentHome) || message.includes(studentHome));
      const matchesCollege = studentCollege && (area.includes(studentCollege) || route.includes(studentCollege) || message.includes(studentCollege));

      return matchesHome || matchesCollege;
    });

    // 6. Assemble standardized aggregation payload
    return {
      student: {
        id: context.user.id,
        full_name: context.user.full_name,
        college_name: context.profile.default_college || context.user.college_name,
        home_area: context.profile.home_area || null,
        preferred_modes: context.profile.preferred_modes,
        walking_tolerance_minutes: context.profile.walking_tolerance_minutes,
        max_budget_rupees: context.profile.max_budget_rupees
      },
      schedule_summary: {
        total_active_schedules: allSchedules.length,
        today_schedules_count: todaySchedules.length,
        current_day: currentDay,
        next_commute: nextCommute ? nextCommute.toJSON() : null,
        today_schedules: todaySchedules.map(s => s.toJSON())
      },
      saved_routes: {
        total_count: allSavedRoutes.length,
        recent: recentSavedRoutes
      },
      ride_groups: {
        total_count: studentGroups.length,
        created_count: studentGroups.filter(g => g.membership.role === 'creator').length,
        joined_count: studentGroups.filter(g => g.membership.role === 'member').length,
        groups: studentGroups.map(g => ({
          id: g.group.id,
          name: g.group.name,
          origin_area: g.group.origin_area,
          destination_college: g.group.destination_college,
          departure_time: g.group.departure_time,
          mode: g.group.mode,
          role: g.membership.role,
          member_count: g.group.member_count,
          max_members: g.group.max_members,
          status: g.group.status
        }))
      },
      alerts: {
        relevant_count: relevantAlerts.length,
        total_active_citywide: activeReports.length,
        alerts: relevantAlerts.slice(0, 5).map(a => a.toJSON())
      },
      quick_stats: {
        active_schedules: allSchedules.length,
        saved_routes: allSavedRoutes.length,
        ride_groups: studentGroups.length,
        active_alerts: relevantAlerts.length
      }
    };
  }
}

const studentDashboardService = new StudentDashboardService();

module.exports = {
  StudentDashboardService,
  studentDashboardService
};
