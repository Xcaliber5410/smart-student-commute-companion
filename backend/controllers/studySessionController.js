/**
 * Study Session Controller
 *
 * Exposes endpoints for managing student study sessions.
 */

const { studySessionService } = require('../services/studySessionService');
const { success, created, paginated } = require('../utils/apiResponse');

async function createSession(req, res, next) {
  try {
    const session = await studySessionService.createSession(req.user.id, req.body);
    return created(res, session.toJSON(), 'Study session created successfully');
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const result = await studySessionService.listSessions(req.user.id, req.query);
    return paginated(
      res,
      result.data.map(s => s.toJSON()),
      {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      },
      'Study sessions retrieved successfully'
    );
  } catch (err) {
    next(err);
  }
}

async function getSession(req, res, next) {
  try {
    const session = await studySessionService.getSessionById(req.user.id, req.params.id);
    return success(res, session.toJSON(), 'Study session retrieved successfully');
  } catch (err) {
    next(err);
  }
}

async function updateSession(req, res, next) {
  try {
    const updated = await studySessionService.updateSession(req.user.id, req.params.id, req.body);
    return success(res, updated.toJSON(), 'Study session updated successfully');
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { status, actual_duration_minutes } = req.body;
    const updated = await studySessionService.updateStatus(
      req.user.id,
      req.params.id,
      status,
      actual_duration_minutes
    );
    return success(res, updated.toJSON(), 'Study session status updated successfully');
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  try {
    await studySessionService.deleteSession(req.user.id, req.params.id);
    return success(res, { id: req.params.id, deleted: true }, 'Study session deleted successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSession,
  listSessions,
  getSession,
  updateSession,
  updateStatus,
  deleteSession
};
