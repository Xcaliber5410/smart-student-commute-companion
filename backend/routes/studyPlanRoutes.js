/**
 * Student Study Plan Routes
 *
 * Exposes authenticated endpoints for student study planning:
 * - Generating and recalculating deterministic study plans
 * - Retrieving current/upcoming plans and progress
 * - Querying planned items by date or date range
 * - Updating status (planned -> in_progress -> completed -> skipped)
 * - Removing / cancelling planned items and whole plans
 */

const express = require('express');
const studyPlanController = require('../controllers/studyPlanController');
const { authenticate } = require('../middleware/authMiddleware');
const {
  validate,
  idParamSchema,
  studyPlanFilterSchema,
  updateStudyPlanSchema,
  updateStudyPlanItemSchema,
  generateStudyPlanSchema,
  recalculateStudyPlanSchema,
  updateStudyPlanItemStatusSchema,
  planItemsDateQuerySchema,
  planningInsightsQuerySchema,
  processPlanningRemindersSchema
} = require('../validators');

function createStudyPlanRoutes() {
  const router = express.Router();

  // All study planning routes require student authentication
  router.use('/student/study-plans', authenticate);

  // -----------------------------------------------------------------
  // 1. Generation, Recalculation, Insights & Reminders (Specific paths before :id)
  // -----------------------------------------------------------------
  router.post(
    '/student/study-plans/generate',
    validate(generateStudyPlanSchema, 'body'),
    studyPlanController.generatePlan
  );

  router.post(
    '/student/study-plans/recalculate',
    validate(recalculateStudyPlanSchema, 'body'),
    studyPlanController.recalculatePlan
  );

  router.get(
    '/student/study-plans/current',
    studyPlanController.getCurrentPlan
  );

  router.get(
    '/student/study-plans/insights',
    validate(planningInsightsQuerySchema, 'query'),
    studyPlanController.getPlanningInsights
  );

  router.post(
    '/student/study-plans/reminders/process',
    validate(processPlanningRemindersSchema, 'body'),
    studyPlanController.processReminders
  );

  // -----------------------------------------------------------------
  // 2. Planned Study Work Items (/student/study-plans/items)
  // -----------------------------------------------------------------
  router.get(
    '/student/study-plans/items',
    validate(planItemsDateQuerySchema, 'query'),
    studyPlanController.listPlanItems
  );

  router.get(
    '/student/study-plans/items/:id',
    validate(idParamSchema, 'params'),
    studyPlanController.getPlanItem
  );

  router.patch(
    '/student/study-plans/items/:id/status',
    validate(idParamSchema, 'params'),
    validate(updateStudyPlanItemStatusSchema, 'body'),
    studyPlanController.updatePlanItemStatus
  );

  router.patch(
    '/student/study-plans/items/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudyPlanItemSchema, 'body'),
    studyPlanController.updatePlanItem
  );

  router.delete(
    '/student/study-plans/items/:id',
    validate(idParamSchema, 'params'),
    studyPlanController.deletePlanItem
  );

  // -----------------------------------------------------------------
  // 3. Collection & Parameterized Plan Routes
  // -----------------------------------------------------------------
  router.get(
    '/student/study-plans',
    validate(studyPlanFilterSchema, 'query'),
    studyPlanController.listPlans
  );

  router.post(
    '/student/study-plans',
    validate(generateStudyPlanSchema, 'body'),
    studyPlanController.generatePlan
  );

  router.get(
    '/student/study-plans/:id',
    validate(idParamSchema, 'params'),
    studyPlanController.getPlan
  );

  router.patch(
    '/student/study-plans/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudyPlanSchema, 'body'),
    studyPlanController.updatePlan
  );

  router.delete(
    '/student/study-plans/:id',
    validate(idParamSchema, 'params'),
    studyPlanController.deletePlan
  );

  router.post(
    '/student/study-plans/:id/recalculate',
    validate(idParamSchema, 'params'),
    validate(recalculateStudyPlanSchema, 'body'),
    studyPlanController.recalculatePlan
  );

  return router;
}

module.exports = createStudyPlanRoutes;
