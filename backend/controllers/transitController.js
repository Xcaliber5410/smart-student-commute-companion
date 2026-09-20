const { db } = require('../db/database');
const { findNearbyStops } = require('../services/gtfsService');

/**
 * Transit stop and route search controller
 */
function searchTransit(req, res) {
  try {
    const { q, lat, lon } = req.query;
    if (lat && lon) {
      const stops = findNearbyStops(parseFloat(lat), parseFloat(lon), 4000);
      return res.json({ success: true, stops });
    }
    const query = (q || '').trim();
    const stops = db.prepare('SELECT * FROM gtfs_stops WHERE stop_name LIKE ? LIMIT 15').all(`%${query}%`);
    const routes = db.prepare('SELECT * FROM gtfs_routes WHERE route_short_name LIKE ? OR route_long_name LIKE ? LIMIT 15').all(`%${query}%`, `%${query}%`);
    res.json({ success: true, stops, routes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  searchTransit
};
