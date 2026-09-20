const { resetDemo } = require('../db/database');
const { getActiveReports } = require('../services/disruptionService');

function resetDemoData(io) {
  return (req, res, next) => {
    try {
      const result = resetDemo();
      const freshReports = getActiveReports();
      if (io) {
        io.emit('demo_reset', { freshReports });
      }
      res.json({ success: true, ...result, reportsCount: freshReports.length });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  resetDemoData
};
