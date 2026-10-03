/**
 * Calendar Routes
 *
 * Exposes endpoints for managing student calendar events, range queries, and planning workflows.
 */

const express = require('express');
const calendarEventController = require('../controllers/calendarEventController');
const studySessionController = require('../controllers/studySessionController');
const calendarRangeController = require('../controllers/calendarRangeController');
const workloadAnalysisController = require('../controllers/workloadAnalysisController');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { idParamSchema } = require('../validators/commonValidators');
const {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventFilterSchema,
  calendarRangeQuerySchema,
  calendarUpcomingQuerySchema,
  calendarWorkloadQuerySchema,
  calendarConflictQuerySchema
} = require('../validators/calendarValidators');
const {
  createStudySessionSchema,
  updateStudySessionSchema,
  updateStudySessionStatusSchema,
  studySessionFilterSchema
} = require('../validators/studySessionValidators');
const {
  linkResourcesSchema,
  entityAndResourceParamSchema
} = require('../validators/studyResourceValidators');

function createCalendarRoutes() {
  const router = express.Router();

  // All calendar endpoints require authenticated student
  router.use(authenticate);

  // -------------------------------------------------------------
  // Calendar Range, Workload & Conflict Endpoints
  // -------------------------------------------------------------
  router.get(
    '/calendar/range',
    validate(calendarRangeQuerySchema, 'query'),
    calendarRangeController.getScheduleInRange
  );

  router.get(
    '/calendar/today',
    calendarRangeController.getTodaySchedule
  );

  router.get(
    '/calendar/upcoming',
    validate(calendarUpcomingQuerySchema, 'query'),
    calendarRangeController.getUpcomingSchedule
  );

  router.get(
    '/calendar/conflicts',
    validate(calendarConflictQuerySchema, 'query'),
    workloadAnalysisController.getConflicts
  );

  router.get(
    '/calendar/workload',
    validate(calendarWorkloadQuerySchema, 'query'),
    workloadAnalysisController.getWorkload
  );

  // -------------------------------------------------------------
  // Calendar Event Endpoints
  // -------------------------------------------------------------
  router.get(
    '/calendar/events',
    validate(calendarEventFilterSchema, 'query'),
    calendarEventController.listEvents
  );

  router.post(
    '/calendar/events',
    validate(createCalendarEventSchema, 'body'),
    calendarEventController.createEvent
  );

  router.get(
    '/calendar/events/:id',
    validate(idParamSchema, 'params'),
    calendarEventController.getEvent
  );

  router.patch(
    '/calendar/events/:id',
    validate(idParamSchema, 'params'),
    validate(updateCalendarEventSchema, 'body'),
    calendarEventController.updateEvent
  );

  router.put(
    '/calendar/events/:id',
    validate(idParamSchema, 'params'),
    validate(updateCalendarEventSchema, 'body'),
    calendarEventController.updateEvent
  );

  router.delete(
    '/calendar/events/:id',
    validate(idParamSchema, 'params'),
    calendarEventController.deleteEvent
  );

  // -------------------------------------------------------------
  // Study Session Endpoints
  // -------------------------------------------------------------
  router.get(
    '/calendar/study-sessions',
    validate(studySessionFilterSchema, 'query'),
    studySessionController.listSessions
  );

  router.post(
    '/calendar/study-sessions',
    validate(createStudySessionSchema, 'body'),
    studySessionController.createSession
  );

  router.get(
    '/calendar/study-sessions/:id',
    validate(idParamSchema, 'params'),
    studySessionController.getSession
  );

  router.patch(
    '/calendar/study-sessions/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudySessionSchema, 'body'),
    studySessionController.updateSession
  );

  router.put(
    '/calendar/study-sessions/:id',
    validate(idParamSchema, 'params'),
    validate(updateStudySessionSchema, 'body'),
    studySessionController.updateSession
  );

  router.patch(
    '/calendar/study-sessions/:id/status',
    validate(idParamSchema, 'params'),
    validate(updateStudySessionStatusSchema, 'body'),
    studySessionController.updateStatus
  );

  router.delete(
    '/calendar/study-sessions/:id',
    validate(idParamSchema, 'params'),
    studySessionController.deleteSession
  );

  router.get(
    '/calendar/study-sessions/:id/resources',
    validate(idParamSchema, 'params'),
    studySessionController.getSessionResources
  );

  router.post(
    '/calendar/study-sessions/:id/resources',
    validate(idParamSchema, 'params'),
    validate(linkResourcesSchema, 'body'),
    studySessionController.linkResources
  );

  router.delete(
    '/calendar/study-sessions/:id/resources/:resourceId',
    validate(entityAndResourceParamSchema, 'params'),
    studySessionController.unlinkResource
  );

  return router;
}

module.exports = {
  createCalendarRoutes
};
