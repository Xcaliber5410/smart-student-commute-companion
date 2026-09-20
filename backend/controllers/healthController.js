/**
 * Health check controller
 */
function getHealth(req, res) {
  res.json({
    status: 'ok',
    service: 'Smart Student Commute Companion API',
    city: 'Mumbai',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  getHealth
};
