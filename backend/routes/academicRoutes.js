/**
 * Academic Routes
 *
 * Exposes authenticated endpoints for student courses, subjects, assignments, and tasks.
 */

const express = require('express');
const courseController = require('../controllers/courseController');
const { authenticate } = require('../middleware/authMiddleware');
const {
  validate,
  idParamSchema,
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema
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

  return router;
}

module.exports = { createAcademicRoutes };
