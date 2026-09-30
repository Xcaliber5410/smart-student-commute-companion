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
    return created(res, {
      message: 'Study session created successfully',
      studySession: session.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const result = await studySessionService.listSessions(req.user.id, req.query);
    return paginated(res, {
      dataKey: 'studySessions',
      data: result.data.map(s => s.toJSON()),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (err) {
    next(err);
  }
}

async function getSession(req, res, next) {
  try {
    const session = await studySessionService.getSessionById(req.user.id, req.params.id);
    return success(res, { studySession: session.toJSON() });
  } catch (err) {
    next(err);
  }
}

async function updateSession(req, res, next) {
  try {
    const updated = await studySessionService.updateSession(req.user.id, req.params.id, req.body);
    return success(res, {
      message: 'Study session updated successfully',
      studySession: updated.toJSON()
    });
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
    return success(res, {
      message: 'Study session status updated successfully',
      studySession: updated.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  try {
    await studySessionService.deleteSession(req.user.id, req.params.id);
    return success(res, { id: req.params.id, deleted: true });
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
