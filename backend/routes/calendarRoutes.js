/**
 * Calendar Routes
 *
 * Exposes endpoints for managing student calendar events, range queries, and planning workflows.
 */

const express = require('express');
const calendarEventController = require('../controllers/calendarEventController');
const { authenticate } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { idParamSchema } = require('../validators/commonValidators');
const {
  createCalendarEventSchema,
  updateCalendarEventSchema,
  calendarEventFilterSchema
} = require('../validators/calendarValidators');

function createCalendarRoutes() {
  const router = express.Router();

  // All calendar endpoints require authenticated student
  router.use(authenticate);

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

  return router;
}

module.exports = {
  createCalendarRoutes
};
