/**
 * Geocoding Repository
 *
 * Data-access operations for Cached Geocoding lookups.
 */

const { getConnection } = require('../db/connection');
const { GeocodingCache } = require('../models/GeocodingCache');

class GeocodingRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Finds cached coordinates for a search query.
   *
   * @param {string} query
   * @returns {GeocodingCache|null}
   */
  findByQuery(query) {
    const normalized = (query || '').trim().toLowerCase();
    const stmt = this.database.prepare('SELECT * FROM geocoding_cache WHERE query = ?');
    const row = stmt.get(normalized);
    return row ? GeocodingCache.fromRow(row) : null;
  }

  /**
   * Upserts cached geocoding result.
   *
   * @param {object|GeocodingCache} data
   * @returns {GeocodingCache}
   */
  upsert(data) {
    const geo = data instanceof GeocodingCache ? data : GeocodingCache.create(data);
    const row = geo.toRow();

    const stmt = this.database.prepare(`
      INSERT OR REPLACE INTO geocoding_cache (query, lat, lon, display_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(row.query, row.lat, row.lon, row.display_name, row.created_at);
    return this.findByQuery(row.query);
  }
}

module.exports = {
  GeocodingRepository,
  geocodingRepository: new GeocodingRepository()
};
