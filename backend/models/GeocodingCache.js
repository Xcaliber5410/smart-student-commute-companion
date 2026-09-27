/**
 * GeocodingCache Model
 *
 * Represents cached spatial coordinates for student location and college lookups.
 */

const { z } = require('zod');

const geocodingCacheSchema = z.object({
  query: z.string().min(1).transform(q => q.trim().toLowerCase()),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  display_name: z.string().default(''),
  created_at: z.number().int().positive().default(() => Date.now())
});

class GeocodingCache {
  constructor(data) {
    const validated = geocodingCacheSchema.parse(data);
    Object.assign(this, validated);
  }

  static create(input) {
    return new GeocodingCache({
      ...input,
      created_at: input.created_at || Date.now()
    });
  }

  static fromRow(row) {
    if (!row) return null;
    return new GeocodingCache({
      query: row.query,
      lat: Number(row.lat),
      lon: Number(row.lon),
      display_name: row.display_name || '',
      created_at: Number(row.created_at)
    });
  }

  toRow() {
    return {
      query: this.query,
      lat: this.lat,
      lon: this.lon,
      display_name: this.display_name,
      created_at: this.created_at
    };
  }

  isFresh(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
    return (Date.now() - this.created_at) < maxAgeMs;
  }
}

module.exports = {
  GeocodingCache,
  geocodingCacheSchema
};
