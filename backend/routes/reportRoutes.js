const express = require('express');
const {
  getLiveReports,
  getReport,
  getAlerts,
  createReport,
  confirmReport,
  contradictReport,
  updateReport,
  deleteReport
} = require('../controllers/reportController');
const {
  validate,
  createReportSchema,
  updateReportSchema,
  reportFilterQuerySchema,
  idParamSchema
} = require('../validators');

function createReportRoutes(io) {
  const router = express.Router();

  router.get('/live-reports', validate({ query: reportFilterQuerySchema }), getLiveReports);
  router.get('/live-reports/:id', validate({ params: idParamSchema }), getReport);
  router.get('/alerts', getAlerts);
  router.post('/live-reports', validate({ body: createReportSchema }), createReport(io));
  router.post('/reports', validate({ body: createReportSchema }), createReport(io));
  router.patch(
    '/live-reports/:id',
    validate({ params: idParamSchema, body: updateReportSchema }),
    updateReport(io)
  );
  router.delete(
    '/live-reports/:id',
    validate({ params: idParamSchema }),
    deleteReport(io)
  );
  router.post('/live-reports/:id/confirm', validate({ params: idParamSchema }), confirmReport(io));
  router.post('/live-reports/:id/contradict', validate({ params: idParamSchema }), contradictReport(io));

  return router;
}

module.exports = createReportRoutes;
