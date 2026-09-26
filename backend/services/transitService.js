/**
 * TransitService
 *
 * Encapsulates transit station, stop, and route search operations across GTFS data.
 */

const { db } = require('../db/database');
const { findNearbyStops } = require('./gtfsService');

class TransitService {
  constructor(database = db) {
    this.db = database;
  }

  /**
   * Searches transit stops and routes or finds nearby stops by coordinates.
   *
   * @param {object} [params={}]
   * @param {string} [params.q]
   * @param {number|string} [params.lat]
   * @param {number|string} [params.lon]
   * @param {number} [params.radius=4000]
   * @returns {{ stops: object[], routes?: object[] }}
   */
  search({ q, lat, lon, radius = 4000 } = {}) {
    if (lat !== undefined && lon !== undefined && lat !== null && lon !== null && lat !== '' && lon !== '') {
      const stops = findNearbyStops(parseFloat(lat), parseFloat(lon), Number(radius) || 4000);
      return { stops };
    }

    const query = (q || '').trim();
    const stopsStmt = this.db.prepare('SELECT * FROM gtfs_stops WHERE stop_name LIKE ? LIMIT 15');
    const routesStmt = this.db.prepare('SELECT * FROM gtfs_routes WHERE route_short_name LIKE ? OR route_long_name LIKE ? LIMIT 15');

    const stops = stopsStmt.all(`%${query}%`);
    const routes = routesStmt.all(`%${query}%`, `%${query}%`);

    return { stops, routes };
  }
}

const transitService = new TransitService();

module.exports = {
  TransitService,
  transitService
};
