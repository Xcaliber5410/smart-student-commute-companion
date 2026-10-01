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

module.exports = {
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  updateProgress,
  completeGoal,
  cancelGoal,
  deleteGoal
};
