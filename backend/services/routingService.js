const axios = require('axios');

/**
 * Calculates straight line distance in km between two GPS points (Haversine formula)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generates intermediate coordinates between start and end for smooth fallback geometry
 */
function generateFallbackGeometry(lat1, lon1, lat2, lon2, steps = 10) {
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const lat = lat1 + (lat2 - lat1) * ratio;
    const lon = lon1 + (lon2 - lon1) * ratio;
    // coordinates in GeoJSON format are [longitude, latitude]
    coordinates.push([lon, lat]);
  }
  return {
    type: 'LineString',
    coordinates
  };
}

/**
 * Fetches routing geometry and estimated travel duration using OSRM.
 * mode: 'driving' or 'walking'
 */
async function getOsrmRoute(origin, destination, mode = 'driving') {
  const profile = mode === 'walking' ? 'walking' : 'driving';
  const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=true`;

  try {
    const response = await axios.get(url, { timeout: 4500 });
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const distanceKm = +(route.distance / 1000).toFixed(2);
      // In Mumbai, driving speed during peak hours is slower (~22 km/h city average)
      // OSRM returns ideal free-flow duration; adjust driving duration for Mumbai typical city traffic
      let durationMinutes = Math.round(route.duration / 60);
      if (mode === 'driving') {
        // Apply Mumbai road density calibration factor
        durationMinutes = Math.max(10, Math.round(distanceKm * 2.8 + 8));
      } else {
        // Walking: standard ~4.5 km/h
        durationMinutes = Math.max(3, Math.round(distanceKm * 13.3));
      }

      return {
        success: true,
        source: 'OSRM Estimated Route',
        distanceKm,
        durationMinutes,
        geometry: route.geometry,
        legs: route.legs
      };
    }
  } catch (err) {
    console.warn(`OSRM ${mode} route calculation failed: ${err.message}. Using fallback geometry.`);
  }

  // Fallback calculation using Haversine
  const distanceKm = +(haversineDistance(origin.lat, origin.lon, destination.lat, destination.lon) * 1.3).toFixed(2);
  let durationMinutes = 0;
  if (mode === 'walking') {
    durationMinutes = Math.max(5, Math.round(distanceKm * 13.5));
  } else {
    durationMinutes = Math.max(12, Math.round(distanceKm * 2.9 + 10));
  }

  return {
    success: false,
    source: 'Estimated Route (Haversine Grid)',
    distanceKm,
    durationMinutes,
    geometry: generateFallbackGeometry(origin.lat, origin.lon, destination.lat, destination.lon),
    legs: []
  };
}

module.exports = {
  getOsrmRoute,
  haversineDistance,
  generateFallbackGeometry
};
