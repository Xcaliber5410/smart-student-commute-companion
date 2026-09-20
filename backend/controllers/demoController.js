const { resetDemo } = require('../db/database');
const { getActiveReports } = require('../services/disruptionService');

function resetDemoData(io) {
  return (req, res) => {
    try {
      const result = resetDemo();
      const freshReports = getActiveReports();
      if (io) {
        io.emit('demo_reset', { freshReports });
      }
      res.json({ success: true, ...result, reportsCount: freshReports.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

module.exports = {
  resetDemoData
};
