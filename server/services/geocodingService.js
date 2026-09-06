const axios = require('axios');
const { db } = require('../db/database');

// Mumbai Landmark / College / Hub instant lookup table
const MUMBAI_KNOWN_LOCATIONS = {
  'iit bombay': { lat: 19.1334, lon: 72.9133, display_name: 'IIT Bombay, Powai, Mumbai' },
  'iit bombay powai': { lat: 19.1334, lon: 72.9133, display_name: 'IIT Bombay, Powai, Mumbai' },
  'powai': { lat: 19.1197, lon: 72.9051, display_name: 'Powai, Mumbai' },
  'vjti': { lat: 19.0223, lon: 72.8561, display_name: 'VJTI College, Matunga, Mumbai' },
  'vjti matunga': { lat: 19.0223, lon: 72.8561, display_name: 'VJTI College, Matunga, Mumbai' },
  'matunga': { lat: 19.0270, lon: 72.8540, display_name: 'Matunga, Mumbai' },
  'ruia': { lat: 19.0238, lon: 72.8524, display_name: 'Ramnarain Ruia College, Matunga, Mumbai' },
  'ruia college': { lat: 19.0238, lon: 72.8524, display_name: 'Ramnarain Ruia College, Matunga, Mumbai' },
  'nmims': { lat: 19.1025, lon: 72.8375, display_name: 'NMIMS / Mithibai, Vile Parle West, Mumbai' },
  'mithibai': { lat: 19.1025, lon: 72.8375, display_name: 'Mithibai College, Vile Parle West, Mumbai' },
  'vile parle': { lat: 19.0999, lon: 72.8439, display_name: 'Vile Parle, Mumbai' },
  'spit': { lat: 19.1232, lon: 72.8361, display_name: 'SPIT / Bhavans Campus, Andheri West, Mumbai' },
  'bhavans andheri': { lat: 19.1232, lon: 72.8361, display_name: 'Bhavans Campus, Andheri West, Mumbai' },
  'hr college': { lat: 18.9310, lon: 72.8275, display_name: 'HR College of Commerce, Churchgate, Mumbai' },
  'kc college': { lat: 18.9310, lon: 72.8275, display_name: 'KC College, Churchgate, Mumbai' },
  'churchgate': { lat: 18.9322, lon: 72.8264, display_name: 'Churchgate, Mumbai' },
  'st xaviers': { lat: 18.9430, lon: 72.8315, display_name: "St. Xavier's College, Fort, Mumbai" },
  'st xaviers college': { lat: 18.9430, lon: 72.8315, display_name: "St. Xavier's College, Fort, Mumbai" },
  'csmt': { lat: 18.9400, lon: 72.8354, display_name: 'Chhatrapati Shivaji Maharaj Terminus (CSMT), Mumbai' },
  'andheri': { lat: 19.1197, lon: 72.8464, display_name: 'Andheri, Mumbai' },
  'andheri east': { lat: 19.1165, lon: 72.8575, display_name: 'Andheri East, Mumbai' },
  'andheri west': { lat: 19.1306, lon: 72.8344, display_name: 'Andheri West, Mumbai' },
  'borivali': { lat: 19.2294, lon: 72.8567, display_name: 'Borivali, Mumbai' },
  'borivali west': { lat: 19.2294, lon: 72.8467, display_name: 'Borivali West, Mumbai' },
  'dadar': { lat: 19.0178, lon: 72.8432, display_name: 'Dadar, Mumbai' },
  'bandra': { lat: 19.0544, lon: 72.8406, display_name: 'Bandra, Mumbai' },
  'ghatkopar': { lat: 19.0864, lon: 72.9081, display_name: 'Ghatkopar, Mumbai' },
  'kurla': { lat: 19.0657, lon: 72.8794, display_name: 'Kurla, Mumbai' },
  'thane': { lat: 19.1860, lon: 72.9757, display_name: 'Thane, Mumbai' },
  'goregaon': { lat: 19.1646, lon: 72.8494, display_name: 'Goregaon, Mumbai' },
  'malad': { lat: 19.1866, lon: 72.8486, display_name: 'Malad, Mumbai' },
  'kandivali': { lat: 19.2045, lon: 72.8522, display_name: 'Kandivali, Mumbai' }
};

/**
 * Geocodes an area query to { lat, lon, display_name }
 * 1. Checks local Mumbai lookup
 * 2. Checks SQLite cache
 * 3. Queries OpenStreetMap Nominatim with custom User-Agent
 */
async function geocodeArea(query) {
  if (!query || typeof query !== 'string') {
    throw new Error('Valid query string is required for geocoding');
  }

  const normalized = query.trim().toLowerCase();

  // 1. Direct match in local dictionary
  if (MUMBAI_KNOWN_LOCATIONS[normalized]) {
    return MUMBAI_KNOWN_LOCATIONS[normalized];
  }

  // Check substring match in local dictionary
  for (const [key, val] of Object.entries(MUMBAI_KNOWN_LOCATIONS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return val;
    }
  }

  // 2. Check SQLite Cache
  try {
    const cached = db.prepare('SELECT lat, lon, display_name FROM geocoding_cache WHERE query = ?').get(normalized);
    if (cached) {
      return cached;
    }
  } catch (err) {
    console.error('Geocoding cache read error:', err.message);
  }

  // 3. Query Nominatim
  try {
    const url = 'https://nominatim.openstreetmap.org/search';
    const searchQuery = normalized.includes('mumbai') ? normalized : `${normalized}, Mumbai, India`;
    const response = await axios.get(url, {
      params: {
        q: searchQuery,
        format: 'json',
        limit: 1,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'SmartStudentCommute/1.0 (contact@smartstudentcommute.local)'
      },
      timeout: 4000
    });

    if (response.data && response.data.length > 0) {
      const item = response.data[0];
      const result = {
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        display_name: item.display_name
      };

      // Save to SQLite Cache
      try {
        db.prepare('INSERT OR REPLACE INTO geocoding_cache (query, lat, lon, display_name, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(normalized, result.lat, result.lon, result.display_name, Date.now());
      } catch (cacheErr) {
        console.error('Failed to save to geocoding cache:', cacheErr.message);
      }

      return result;
    }
  } catch (apiErr) {
    console.warn(`Nominatim geocoding failed for "${query}": ${apiErr.message}. Using Mumbai center fallback.`);
  }

  // Fallback if not found: Default to central Mumbai
  return {
    lat: 19.0760,
    lon: 72.8777,
    display_name: `${query} (Estimated Mumbai Area)`
  };
}

module.exports = {
  geocodeArea,
  MUMBAI_KNOWN_LOCATIONS
};
