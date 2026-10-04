/**
 * Student Study Resource Routes
 *
 * Exposes authenticated endpoints for student study resources (notes, references,
 * links, documents, and lightweight study materials).
 * Mounts canonical endpoints under `/student/resources` and parity aliases under `/academic/resources`.
 */

const express = require('express');
const studyResourceController = require('../controllers/studyResourceController');
const { authenticate } = require('../middleware/authMiddleware');
const {
  validate,
  idParamSchema,
  createStudyResourceSchema,
  updateStudyResourceSchema,
  studyResourceFilterSchema,
  resourceContextQuerySchema
} = require('../validators');

function createStudyResourceRoutes() {
  const router = express.Router();

  // All study resource routes require student authentication
  router.use('/student/resources', authenticate);
  router.use('/academic/resources', authenticate);

  // -----------------------------------------------------------------
  // 1. Canonical Student Study Resource Endpoints (/student/resources)
  // -----------------------------------------------------------------
  router.get(
    '/student/resources',
    validate(studyResourceFilterSchema, 'query'),
    studyResourceController.listResources
  );

  router.post(
    '/student/resources',
    validate(createStudyResourceSchema, 'body'),
    studyResourceController.createResource
  );

  router.get(
    '/student/resources/context',
    validate(resourceContextQuerySchema, 'query'),
    studyResourceController.getContextualResources
  );

  router.get(
    '/student/resources/:id',
    validate(idParamSchema, 'params'),
    studyResourceController.getResource
  );

  router.patch(
    '/student/resources/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudyResourceSchema, 'body'),
    studyResourceController.updateResource
  );

  router.put(
    '/student/resources/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudyResourceSchema, 'body'),
    studyResourceController.updateResource
  );

  router.delete(
    '/student/resources/:id',
    validate(idParamSchema, 'params'),
    studyResourceController.deleteResource
  );

  router.post(
    '/student/resources/:id/archive',
    validate(idParamSchema, 'params'),
    studyResourceController.archiveResource
  );

  router.post(
    '/student/resources/:id/favorite',
    validate(idParamSchema, 'params'),
    studyResourceController.toggleFavorite
  );

  // -----------------------------------------------------------------
  // 2. Academic Alias Parity Endpoints (/academic/resources)
  // -----------------------------------------------------------------
  router.get(
    '/academic/resources',
    validate(studyResourceFilterSchema, 'query'),
    studyResourceController.listResources
  );

  router.post(
    '/academic/resources',
    validate(createStudyResourceSchema, 'body'),
    studyResourceController.createResource
  );

  router.get(
    '/academic/resources/context',
    validate(resourceContextQuerySchema, 'query'),
    studyResourceController.getContextualResources
  );

  router.get(
    '/academic/resources/:id',
    validate(idParamSchema, 'params'),
    studyResourceController.getResource
  );

  router.patch(
    '/academic/resources/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudyResourceSchema, 'body'),
    studyResourceController.updateResource
  );

  router.put(
    '/academic/resources/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudyResourceSchema, 'body'),
    studyResourceController.updateResource
  );

  router.delete(
    '/academic/resources/:id',
    validate(idParamSchema, 'params'),
    studyResourceController.deleteResource
  );

  router.post(
    '/academic/resources/:id/archive',
    validate(idParamSchema, 'params'),
    studyResourceController.archiveResource
  );

  router.post(
    '/academic/resources/:id/favorite',
    validate(idParamSchema, 'params'),
    studyResourceController.toggleFavorite
  );

  return router;
}

module.exports = createStudyResourceRoutes;
module.exports.createStudyResourceRoutes = createStudyResourceRoutes;
