/**
 * Productivity Controller
 *
 * Exposes authenticated endpoints for student productivity statistics and metrics.
 */

const { productivityAnalyticsService } = require('../services');
const { success } = require('../utils/apiResponse');

function getProductivityMetrics(req, res, next) {
  try {
    const studentId = req.user.id;
    const metrics = productivityAnalyticsService.getProductivityMetrics(studentId, req.user, req.query);
    return success(res, metrics);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProductivityMetrics
};
