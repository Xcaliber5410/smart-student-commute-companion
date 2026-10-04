/**
 * Academic Routes
 *
 * Exposes authenticated endpoints for student courses, subjects, assignments, and tasks.
 */

const express = require('express');
const courseController = require('../controllers/courseController');
const assignmentController = require('../controllers/assignmentController');
const goalController = require('../controllers/goalController');
const productivityController = require('../controllers/productivityController');
const studentController = require('../controllers/studentController');
const { authenticate } = require('../middleware/authMiddleware');
const { searchAbuseSafeguard } = require('../middleware/searchSafeguard');
const {
  validate,
  idParamSchema,
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  updateAssignmentStatusSchema,
  assignmentFilterSchema,
  createGoalSchema,
  updateGoalSchema,
  updateGoalProgressSchema,
  goalFilterSchema,
  linkGoalAssignmentsSchema,
  linkGoalStudySessionsSchema,
  productivityFilterSchema,
  studentInsightsFilterSchema,
  studentSearchQuerySchema,
  linkResourcesSchema,
  entityAndResourceParamSchema
} = require('../validators');

function createAcademicRoutes() {
  const router = express.Router();

  // All academic routes require student authentication
  router.use('/academic', authenticate);

  // -------------------------------------------------------------
  // Course & Subject Endpoints
  // -------------------------------------------------------------
  router.get(
    '/academic/courses',
    validate(courseFilterSchema, 'query'),
    courseController.listCourses
  );

  router.post(
    '/academic/courses',
    validate(createCourseSchema, 'body'),
    courseController.createCourse
  );

  router.get(
    '/academic/courses/:id',
    validate(idParamSchema, 'params'),
    courseController.getCourse
  );

  router.patch(
    '/academic/courses/:id',
    validate(idParamSchema, 'params'),
    validate(updateCourseSchema, 'body'),
    courseController.updateCourse
  );

  router.put(
    '/academic/courses/:id',
    validate(idParamSchema, 'params'),
    validate(updateCourseSchema, 'body'),
    courseController.updateCourse
  );

  router.post(
    '/academic/courses/:id/archive',
    validate(idParamSchema, 'params'),
    courseController.archiveCourse
  );

  router.delete(
    '/academic/courses/:id',
    validate(idParamSchema, 'params'),
    courseController.deleteCourse
  );

  router.get(
    '/academic/courses/:id/resources',
    validate(idParamSchema, 'params'),
    courseController.getCourseResources
  );

  router.post(
    '/academic/courses/:id/resources',
    validate(idParamSchema, 'params'),
    validate(linkResourcesSchema, 'body'),
    courseController.linkResources
  );

  router.delete(
    '/academic/courses/:id/resources/:resourceId',
    validate(entityAndResourceParamSchema, 'params'),
    courseController.unlinkResource
  );

  // -------------------------------------------------------------
  // Assignment & Task Endpoints
  // -------------------------------------------------------------
  router.get(
    '/academic/assignments',
    validate(assignmentFilterSchema, 'query'),
    assignmentController.listAssignments
  );

  router.post(
    '/academic/assignments',
    validate(createAssignmentSchema, 'body'),
    assignmentController.createAssignment
  );

  router.get(
    '/academic/assignments/:id',
    validate(idParamSchema, 'params'),
    assignmentController.getAssignment
  );

  router.patch(
    '/academic/assignments/:id',
    validate(idParamSchema, 'params'),
    validate(updateAssignmentSchema, 'body'),
    assignmentController.updateAssignment
  );

  router.put(
    '/academic/assignments/:id',
    validate(idParamSchema, 'params'),
    validate(updateAssignmentSchema, 'body'),
    assignmentController.updateAssignment
  );

  router.patch(
    '/academic/assignments/:id/status',
    validate(idParamSchema, 'params'),
    validate(updateAssignmentStatusSchema, 'body'),
    assignmentController.updateStatus
  );

  router.delete(
    '/academic/assignments/:id',
    validate(idParamSchema, 'params'),
    assignmentController.deleteAssignment
  );

  router.get(
    '/academic/assignments/:id/resources',
    validate(idParamSchema, 'params'),
    assignmentController.getAssignmentResources
  );

  router.post(
    '/academic/assignments/:id/resources',
    validate(idParamSchema, 'params'),
    validate(linkResourcesSchema, 'body'),
    assignmentController.linkResources
  );

  router.delete(
    '/academic/assignments/:id/resources/:resourceId',
    validate(entityAndResourceParamSchema, 'params'),
    assignmentController.unlinkResource
  );

  // -------------------------------------------------------------
  // Student Goal Endpoints
  // -------------------------------------------------------------
  router.get(
    '/academic/goals',
    validate(goalFilterSchema, 'query'),
    goalController.listGoals
  );

  router.post(
    '/academic/goals',
    validate(createGoalSchema, 'body'),
    goalController.createGoal
  );

  router.get(
    '/academic/goals/:id',
    validate(idParamSchema, 'params'),
    goalController.getGoal
  );

  router.patch(
    '/academic/goals/:id',
    validate(idParamSchema, 'params'),
    validate(updateGoalSchema, 'body'),
    goalController.updateGoal
  );

  router.put(
    '/academic/goals/:id',
    validate(idParamSchema, 'params'),
    validate(updateGoalSchema, 'body'),
    goalController.updateGoal
  );

  router.patch(
    '/academic/goals/:id/progress',
    validate(idParamSchema, 'params'),
    validate(updateGoalProgressSchema, 'body'),
    goalController.updateProgress
  );

  router.post(
    '/academic/goals/:id/complete',
    validate(idParamSchema, 'params'),
    goalController.completeGoal
  );

  router.post(
    '/academic/goals/:id/cancel',
    validate(idParamSchema, 'params'),
    goalController.cancelGoal
  );

  router.delete(
    '/academic/goals/:id',
    validate(idParamSchema, 'params'),
    goalController.deleteGoal
  );

  // -------------------------------------------------------------
  // Goal Workflow & Work Integration Endpoints
  // -------------------------------------------------------------
  router.get(
    '/academic/goals/:id/work',
    validate(idParamSchema, 'params'),
    goalController.getGoalWork
  );

  router.post(
    '/academic/goals/:id/sync-progress',
    validate(idParamSchema, 'params'),
    goalController.syncGoalProgress
  );

  router.post(
    '/academic/goals/:id/assignments',
    validate(idParamSchema, 'params'),
    validate(linkGoalAssignmentsSchema, 'body'),
    goalController.linkAssignments
  );

  router.delete(
    '/academic/goals/:id/assignments/:assignmentId',
    goalController.unlinkAssignment
  );

  router.post(
    '/academic/goals/:id/study-sessions',
    validate(idParamSchema, 'params'),
    validate(linkGoalStudySessionsSchema, 'body'),
    goalController.linkStudySessions
  );

  router.delete(
    '/academic/goals/:id/study-sessions/:sessionId',
    goalController.unlinkStudySession
  );

  router.get(
    '/academic/goals/:id/resources',
    validate(idParamSchema, 'params'),
    goalController.getGoalResources
  );

  router.post(
    '/academic/goals/:id/resources',
    validate(idParamSchema, 'params'),
    validate(linkResourcesSchema, 'body'),
    goalController.linkResources
  );

  router.delete(
    '/academic/goals/:id/resources/:resourceId',
    validate(entityAndResourceParamSchema, 'params'),
    goalController.unlinkResource
  );

  // -------------------------------------------------------------
  // Academic Progress, Dashboard Summary & Productivity Endpoints
  // -------------------------------------------------------------
  router.get('/academic/progress', assignmentController.getAcademicSummary);
  router.get('/academic/summary', assignmentController.getAcademicSummary);
  router.get(
    '/academic/productivity',
    validate(productivityFilterSchema, 'query'),
    productivityController.getProductivityMetrics
  );
  router.get(
    '/academic/statistics',
    validate(productivityFilterSchema, 'query'),
    productivityController.getProductivityMetrics
  );
  router.get(
    '/academic/insights',
    validate(studentInsightsFilterSchema, 'query'),
    studentController.getStudentInsights
  );
  router.get(
    '/academic/overview',
    validate(studentInsightsFilterSchema, 'query'),
    studentController.getStudentInsights
  );
  router.get(
    '/academic/search',
    searchAbuseSafeguard,
    validate(studentSearchQuerySchema, 'query'),
    studentController.searchStudent
  );

  return router;
}

module.exports = { createAcademicRoutes };

