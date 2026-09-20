const express = require('express');
const {
  getLiveReports,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport
} = require('../controllers/reportController');

function createReportRoutes(io) {
  const router = express.Router();

  router.get('/live-reports', getLiveReports);
  router.get('/alerts', getAlerts);
  router.post('/live-reports', createReport(io));
  router.post('/reports', createReport(io));
  router.post('/live-reports/:id/confirm', confirmReport(io));
  router.post('/live-reports/:id/contradict', contradictReport(io));

  return router;
}

module.exports = createReportRoutes;
