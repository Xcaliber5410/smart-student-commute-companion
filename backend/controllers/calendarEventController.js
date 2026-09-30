/**
 * Calendar Event Controller
 *
 * Exposes endpoints for managing student calendar events.
 */

const { calendarEventService } = require('../services/calendarEventService');
const { success, created, paginated } = require('../utils/apiResponse');

async function createEvent(req, res, next) {
  try {
    const event = await calendarEventService.createEvent(req.user.id, req.body);
    return created(res, event.toJSON(), 'Calendar event created successfully');
  } catch (err) {
    next(err);
  }
}

async function listEvents(req, res, next) {
  try {
    const result = await calendarEventService.listEvents(req.user.id, req.query);
    return paginated(
      res,
      result.data.map(e => e.toJSON()),
      {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      },
      'Calendar events retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

async function getEvent(req, res, next) {
  try {
    const event = await calendarEventService.getEventById(req.user.id, req.params.id);
    return success(res, event.toJSON(), 'Calendar event retrieved successfully');
  } catch (err) {
    next(err);
  }
}

async function updateEvent(req, res, next) {
  try {
    const updated = await calendarEventService.updateEvent(req.user.id, req.params.id, req.body);
    return success(res, updated.toJSON(), 'Calendar event updated successfully');
  } catch (err) {
    next(err);
  }
}

async function deleteEvent(req, res, next) {
  try {
    await calendarEventService.deleteEvent(req.user.id, req.params.id);
    return success(res, { id: req.params.id, deleted: true }, 'Calendar event deleted successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent
};
