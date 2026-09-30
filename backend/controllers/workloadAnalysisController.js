/**
 * Workload Analysis Controller
 */

const { workloadAnalysisService } = require('../services/workloadAnalysisService');
const { success } = require('../utils/apiResponse');

async function getConflicts(req, res, next) {
  try {
    const conflicts = await workloadAnalysisService.analyzeConflicts(req.user.id, req.query);
    return success(res, conflicts, 'Schedule conflicts analyzed successfully');
  } catch (err) {
    next(err);
  }
}

async function getWorkload(req, res, next) {
  try {
    const summary = await workloadAnalysisService.getWorkloadSummary(req.user.id, req.query);
    return success(res, summary, 'Student workload summary retrieved successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConflicts,
  getWorkload
};
