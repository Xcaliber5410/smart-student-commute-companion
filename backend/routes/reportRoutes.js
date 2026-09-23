const express = require('express');
const {
  getLiveReports,
  getReport,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport
} = require('../controllers/reportController');
const { validate, createReportSchema, idParamSchema } = require('../validators');

function createReportRoutes(io) {
  const router = express.Router();

  router.get('/live-reports', getLiveReports);
  router.get('/live-reports/:id', validate({ params: idParamSchema }), getReport);
  router.get('/alerts', getAlerts);
  router.post('/live-reports', validate({ body: createReportSchema }), createReport(io));
  router.post('/reports', validate({ body: createReportSchema }), createReport(io));
  router.post('/live-reports/:id/confirm', validate({ params: idParamSchema }), confirmReport(io));
  router.post('/live-reports/:id/contradict', validate({ params: idParamSchema }), contradictReport(io));

  return router;
}

module.exports = createReportRoutes;
