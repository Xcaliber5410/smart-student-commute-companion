/**
 * Student Controller
 *
 * Exposes endpoints for student context, recurring commute routines,
 * saved routes, ride group memberships, and unified dashboard aggregation.
 */

const {
  studentContextService,
  studentScheduleService,
  savedRouteService,
  rideGroupService,
  studentDashboardService,
  studentInsightsService,
  studentSearchService
} = require('../services');
const { success, created } = require('../utils/apiResponse');

// 1. Student Context & Profile
function getStudentContext(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const context = studentContextService.getStudentContext(studentId, req.user);
    return success(res, context);
  } catch (err) {
    next(err);
  }
}

function updateStudentProfile(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const updated = studentContextService.updateStudentProfile(studentId, req.body, req.user);
    return success(res, {
      message: 'Student profile updated successfully',
      ...updated
    });
  } catch (err) {
    next(err);
  }
}

// 2. Student Schedules
function listSchedules(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const result = studentScheduleService.listStudentSchedules(studentId, req.user, req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

function createSchedule(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const schedule = studentScheduleService.createSchedule(studentId, req.body, req.user);
    return created(res, {
      message: 'Commute schedule created successfully',
      schedule
    });
  } catch (err) {
    next(err);
  }
}

function getSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const schedule = studentScheduleService.getScheduleById(id, req.user);
    return success(res, { schedule });
  } catch (err) {
    next(err);
  }
}

function updateSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const schedule = studentScheduleService.updateSchedule(id, req.body, req.user);
    return success(res, {
      message: 'Commute schedule updated successfully',
      schedule
    });
  } catch (err) {
    next(err);
  }
}

function deleteSchedule(req, res, next) {
  try {
    const { id } = req.params;
    studentScheduleService.deleteSchedule(id, req.user);
    return success(res, {
      message: 'Commute schedule deleted successfully',
      id
    });
  } catch (err) {
    next(err);
  }
}

// 3. Saved Routes
function listSavedRoutes(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const result = savedRouteService.listStudentSavedRoutes(studentId, req.user, req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

function createSavedRoute(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const route = savedRouteService.createSavedRoute(studentId, req.body, req.user);
    return created(res, {
      message: 'Route saved successfully',
      route
    });
  } catch (err) {
    next(err);
  }
}

function getSavedRoute(req, res, next) {
  try {
    const { id } = req.params;
    const route = savedRouteService.getSavedRouteById(id, req.user);
    return success(res, { route });
  } catch (err) {
    next(err);
  }
}

function updateSavedRoute(req, res, next) {
  try {
    const { id } = req.params;
    const route = savedRouteService.updateSavedRoute(id, req.body, req.user);
    return success(res, {
      message: 'Saved route updated successfully',
      route
    });
  } catch (err) {
    next(err);
  }
}

function deleteSavedRoute(req, res, next) {
  try {
    const { id } = req.params;
    savedRouteService.deleteSavedRoute(id, req.user);
    return success(res, {
      message: 'Saved route deleted successfully',
      id
    });
  } catch (err) {
    next(err);
  }
}

// 4. Student Ride Groups
function listStudentRideGroups(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const result = rideGroupService.listStudentGroups(studentId, req.user, req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

// 5. Dashboard Aggregation
function getDashboard(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const dashboard = studentDashboardService.getDashboardData(studentId, req.user, req.query);
    return success(res, { dashboard });
  } catch (err) {
    next(err);
  }
}

// 6. Unified Student Insights & Overview
async function getStudentInsights(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const insights = await studentInsightsService.getStudentInsights(studentId, req.user, req.query);
    return success(res, { insights });
  } catch (err) {
    next(err);
  }
}

// 7. Unified Cross-Domain Student Search
function searchStudent(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const results = studentSearchService.search(studentId, req.user, req.query);
    return success(res, results);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStudentContext,
  updateStudentProfile,
  listSchedules,
  createSchedule,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  listSavedRoutes,
  createSavedRoute,
  getSavedRoute,
  updateSavedRoute,
  deleteSavedRoute,
  listStudentRideGroups,
  getDashboard,
  getStudentInsights,
  searchStudent
};

