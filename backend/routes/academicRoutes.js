/**
 * Academic Routes
 *
 * Exposes authenticated endpoints for student courses, subjects, assignments, and tasks.
 */

const express = require('express');
const courseController = require('../controllers/courseController');
const assignmentController = require('../controllers/assignmentController');
const goalController = require('../controllers/goalController');
const { authenticate } = require('../middleware/authMiddleware');
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
  goalFilterSchema
} = require('../validators');

function createAcademicRoutes() {
  const router = express.Router();

  // All academic routes require student authentication
  router.use(authenticate);

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
  // Academic Progress & Dashboard Summary Endpoints
  // -------------------------------------------------------------
  router.get('/academic/progress', assignmentController.getAcademicSummary);
  router.get('/academic/summary', assignmentController.getAcademicSummary);

  return router;
}

module.exports = { createAcademicRoutes };
