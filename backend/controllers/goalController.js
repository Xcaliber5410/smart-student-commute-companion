/**
 * Goal Controller
 *
 * Exposes authenticated endpoints for managing student academic, personal, and skill goals.
 */

const { goalService } = require('../services');
const { success, created } = require('../utils/apiResponse');

function createGoal(req, res, next) {
  try {
    const studentId = req.user.id;
    const goal = goalService.createGoal(studentId, req.body, req.user);
    return created(res, {
      message: 'Goal created successfully',
      goal: goal.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

function listGoals(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = goalService.listGoals(studentId, req.query, req.user);
    const goalsJson = result.data.map(g => g.toJSON());
    return success(res, {
      goals: goalsJson,
      data: goalsJson,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (err) {
    next(err);
  }
}

function getGoal(req, res, next) {
  try {
    const { id } = req.params;
    const goal = goalService.getGoal(req.user.id, id, req.user);
    return success(res, { goal: goal.toJSON() });
  } catch (err) {
    next(err);
  }
}

function updateGoal(req, res, next) {
  try {
    const { id } = req.params;
    const goal = goalService.updateGoal(id, req.body, req.user);
    return success(res, {
      message: 'Goal updated successfully',
      goal: goal.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

function updateProgress(req, res, next) {
  try {
    const { id } = req.params;
    const goal = goalService.updateProgress(id, req.body, req.user);
    return success(res, {
      message: 'Goal progress updated successfully',
      goal: goal.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

function completeGoal(req, res, next) {
  try {
    const { id } = req.params;
    const goal = goalService.completeGoal(id, req.user);
    return success(res, {
      message: 'Goal completed successfully',
      goal: goal.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

function cancelGoal(req, res, next) {
  try {
    const { id } = req.params;
    const goal = goalService.cancelGoal(id, req.user);
    return success(res, {
      message: 'Goal cancelled successfully',
      goal: goal.toJSON()
    });
  } catch (err) {
    next(err);
  }
}

function deleteGoal(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = goalService.deleteGoal(id, req.user);
    return success(res, {
      id,
      deleted
    });
  } catch (err) {
    next(err);
  }
}

function getGoalWork(req, res, next) {
  try {
    const { id } = req.params;
    const summary = goalService.getGoalWorkSummary(id, req.user);
    return success(res, summary);
  } catch (err) {
    next(err);
  }
}

function syncGoalProgress(req, res, next) {
  try {
    const { id } = req.params;
    const goal = goalService.syncGoalProgressFromWork(id, req.user);
    return success(res, {
      message: 'Goal progress synchronized successfully',
      goal: goal ? goal.toJSON() : null
    });
  } catch (err) {
    next(err);
  }
}

function linkAssignments(req, res, next) {
  try {
    const { id } = req.params;
    const assignmentIds = req.body.assignment_ids || req.body.assignmentIds;
    const result = goalService.linkAssignments(id, assignmentIds, req.user);
    return success(res, {
      message: 'Assignments linked to goal successfully',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

function unlinkAssignment(req, res, next) {
  try {
    const { id, assignmentId } = req.params;
    const result = goalService.unlinkAssignment(id, assignmentId, req.user);
    return success(res, {
      message: 'Assignment unlinked from goal successfully',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

function linkStudySessions(req, res, next) {
  try {
    const { id } = req.params;
    const sessionIds = req.body.session_ids || req.body.sessionIds;
    const result = goalService.linkStudySessions(id, sessionIds, req.user);
    return success(res, {
      message: 'Study sessions linked to goal successfully',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

function unlinkStudySession(req, res, next) {
  try {
    const { id, sessionId } = req.params;
    const result = goalService.unlinkStudySession(id, sessionId, req.user);
    return success(res, {
      message: 'Study session unlinked from goal successfully',
      ...result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  updateProgress,
  completeGoal,
  cancelGoal,
  deleteGoal,
  getGoalWork,
  syncGoalProgress,
  linkAssignments,
  unlinkAssignment,
  linkStudySessions,
  unlinkStudySession
};
