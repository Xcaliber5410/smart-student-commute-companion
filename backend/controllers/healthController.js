/**
 * Health check controller
 *
 * Provides a lightweight, unauthenticated health status endpoint
 * suitable for uptime monitoring, load balancers, and readiness probes.
 * Avoids database-dependent checks or exposing sensitive runtime details.
 */
function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'Smart Student Commute Companion API',
    city: 'Mumbai',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  getHealth
};
