/**
 * Study Plan Controller
 *
 * Exposes authenticated endpoints for student study planning:
 * - Generating and recalculating deterministic study plans
 * - Retrieving current/upcoming plans and planned work
 * - Filtering planned items by date or date range
 * - Updating status (planned -> in_progress -> completed -> skipped)
 * - Removing / cancelling planned items and whole plans
 * - Enforcing strict student data isolation and standardized response envelopes
 */

const { studyPlanningService } = require('../services');
const { success, created } = require('../utils/apiResponse');

/**
 * Generates a practical, conflict-free study plan with planned work items
 * based on current assignments, goals, and calendar commitments.
 */
async function generatePlan(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = await studyPlanningService.generateStudyPlan(studentId, req.body);

    return created(res, {
      message: 'Study plan generated successfully',
      plan: result.plan.toJSON ? result.plan.toJSON() : result.plan,
      items: result.items.map(i => (i.toJSON ? i.toJSON() : i)),
      summary: result.summary,
      warnings: result.warnings
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Recalculates an existing study plan (or active plan) to adapt to updated
 * deadlines or progress, avoiding duplicate planned items.
 */
async function recalculatePlan(req, res, next) {
  try {
    const studentId = req.user.id;
    const planId = req.params.id || (req.body && req.body.planId);
    const result = await studyPlanningService.recalculateStudyPlan(studentId, {
      ...req.body,
      planId
    });

    return success(res, {
      message: 'Study plan recalculated successfully',
      plan: result.plan.toJSON ? result.plan.toJSON() : result.plan,
      items: result.items.map(i => (i.toJSON ? i.toJSON() : i)),
      summary: result.summary,
      warnings: result.warnings
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves the student's current active upcoming study plan with progress summary and items.
 */
async function getCurrentPlan(req, res, next) {
  try {
    const studentId = req.user.id;
    const current = await studyPlanningService.getCurrentPlan(studentId);

    if (!current) {
      return success(res, {
        plan: null,
        items: [],
        summary: null,
        message: 'No active study plan found'
      });
    }

    return success(res, current);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists all study plans for the student with pagination and filtering.
 */
async function listPlans(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = await studyPlanningService.getPlans(studentId, req.query);

    return success(res, {
      plans: result.data.map(p => (p.toJSON ? p.toJSON() : p)),
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

/**
 * Retrieves a single study plan by ID with child items and progress metrics.
 */
async function getPlan(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const result = await studyPlanningService.getPlanById(id, studentId);

    return success(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing study plan title, description, or status.
 */
async function updatePlan(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const updated = await studyPlanningService.updatePlan(id, studentId, req.body);

    return success(res, {
      message: 'Study plan updated successfully',
      plan: updated.toJSON ? updated.toJSON() : updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a study plan and all associated planned study items.
 */
async function deletePlan(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    await studyPlanningService.deletePlan(id, studentId);

    return success(res, {
      message: 'Study plan deleted successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves planned study work items with date, date-range, and relational filters.
 */
async function listPlanItems(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = await studyPlanningService.getPlanItems(studentId, req.query);

    return success(res, {
      items: result.data.map(i => (i.toJSON ? i.toJSON() : i)),
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

/**
 * Retrieves a single planned study work item by ID.
 */
async function getPlanItem(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const item = await studyPlanningService.getPlanItemById(id, studentId);

    return success(res, {
      item: item.toJSON ? item.toJSON() : item
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates a planned study work item (e.g. details, rescheduling planned date).
 */
async function updatePlanItem(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const updated = await studyPlanningService.updatePlanItem(id, studentId, req.body);

    return success(res, {
      message: 'Study plan item updated successfully',
      item: updated.toJSON ? updated.toJSON() : updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates only the status of a planned study work item (planned -> in_progress -> completed -> skipped).
 */
async function updatePlanItemStatus(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    const { status } = req.body;
    const updated = await studyPlanningService.updatePlanItemStatus(id, studentId, status);

    return success(res, {
      message: 'Study plan item status updated successfully',
      item: updated.toJSON ? updated.toJSON() : updated
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Removes / cancels a planned study work item.
 */
async function deletePlanItem(req, res, next) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    await studyPlanningService.deletePlanItem(id, studentId);

    return success(res, {
      message: 'Study plan item removed successfully'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves actionable planning insights (planned vs completed, overdue items,
 * missed sessions, upcoming overloaded periods, unplanned urgent assignments, prep warnings).
 */
async function getPlanningInsights(req, res, next) {
  try {
    const studentId = req.user.id;
    const insights = await studyPlanningService.getPlanningInsights(studentId, req.query);

    return success(res, {
      insights
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Dispatches notifications/reminders for upcoming planned study sessions,
 * overdue items, and deadline preparation warnings with duplicate suppression.
 */
async function processReminders(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = await studyPlanningService.processPlanningReminders(studentId, req.body);

    return success(res, {
      message: 'Planning reminders processed successfully',
      result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generatePlan,
  recalculatePlan,
  getCurrentPlan,
  listPlans,
  getPlan,
  updatePlan,
  deletePlan,
  listPlanItems,
  getPlanItem,
  updatePlanItem,
  updatePlanItemStatus,
  deletePlanItem,
  getPlanningInsights,
  processReminders
};

