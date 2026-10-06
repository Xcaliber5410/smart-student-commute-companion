/**
 * Student Domain Routes
 *
 * Exposes authenticated endpoints for student profile context, recurring schedules,
 * saved routes, ride group memberships, and unified dashboard aggregation.
 */

const express = require('express');
const studentController = require('../controllers/studentController');
const { authenticate } = require('../middleware/authMiddleware');
const { searchAbuseSafeguard } = require('../middleware/searchSafeguard');
const {
  validate,
  idParamSchema,
  studentProfileUpdateSchema,
  createScheduleSchema,
  updateScheduleSchema,
  scheduleFilterSchema,
  createSavedRouteSchema,
  updateSavedRouteSchema,
  savedRouteFilterSchema,
  studentGroupFilterSchema,
  studentInsightsFilterSchema,
  studentSearchQuerySchema,
  updateCommutePreferencesSchema
} = require('../validators');

function createStudentRoutes() {
  const router = express.Router();

  // All student routes require valid student authentication
  router.use('/student', authenticate);

  // 1. Context & Profile
  router.get('/student/context', studentController.getStudentContext);
  router.put(
    '/student/profile',
    validate(studentProfileUpdateSchema, 'body'),
    studentController.updateStudentProfile
  );

  // 1b. Commute Preferences (P9)
  router.get('/student/commute-preferences', studentController.getCommutePreferences);
  router.put(
    '/student/commute-preferences',
    validate(updateCommutePreferencesSchema, 'body'),
    studentController.updateCommutePreferences
  );
  router.post(
    '/student/commute-preferences/reset',
    studentController.resetCommutePreferences
  );

  // 2. Commute Schedules
  router.get(
    '/student/schedules',
    validate(scheduleFilterSchema, 'query'),
    studentController.listSchedules
  );
  router.post(
    '/student/schedules',
    validate(createScheduleSchema, 'body'),
    studentController.createSchedule
  );
  router.get(
    '/student/schedules/:id',
    validate(idParamSchema, 'params'),
    studentController.getSchedule
  );
  router.put(
    '/student/schedules/:id',
    validate(idParamSchema, 'params'),
    validate(updateScheduleSchema, 'body'),
    studentController.updateSchedule
  );
  router.delete(
    '/student/schedules/:id',
    validate(idParamSchema, 'params'),
    studentController.deleteSchedule
  );

  // 3. Saved Routes
  router.get(
    '/student/saved-routes',
    validate(savedRouteFilterSchema, 'query'),
    studentController.listSavedRoutes
  );
  router.post(
    '/student/saved-routes',
    validate(createSavedRouteSchema, 'body'),
    studentController.createSavedRoute
  );
  router.get(
    '/student/saved-routes/:id',
    validate(idParamSchema, 'params'),
    studentController.getSavedRoute
  );
  router.put(
    '/student/saved-routes/:id',
    validate(idParamSchema, 'params'),
    validate(updateSavedRouteSchema, 'body'),
    studentController.updateSavedRoute
  );
  router.delete(
    '/student/saved-routes/:id',
    validate(idParamSchema, 'params'),
    studentController.deleteSavedRoute
  );

  // 4. Student Ride Groups
  router.get(
    '/student/ride-groups',
    validate(studentGroupFilterSchema, 'query'),
    studentController.listStudentRideGroups
  );

  // 5. Dashboard Aggregation
  router.get('/student/dashboard', studentController.getDashboard);

  // 6. Student Overview & Academic Insights
  router.get(
    '/student/insights',
    validate(studentInsightsFilterSchema, 'query'),
    studentController.getStudentInsights
  );
  router.get(
    '/student/overview',
    validate(studentInsightsFilterSchema, 'query'),
    studentController.getStudentInsights
  );

  // 7. Unified Cross-Domain Student Search
  router.get(
    '/student/search',
    searchAbuseSafeguard,
    validate(studentSearchQuerySchema, 'query'),
    studentController.searchStudent
  );

  return router;
}

module.exports = createStudentRoutes;

