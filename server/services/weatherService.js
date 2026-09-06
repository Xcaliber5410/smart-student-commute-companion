const axios = require('axios');

// Cache weather for 15 minutes to reduce external calls
let cachedWeather = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Maps WMO weather interpretation code to readable status and icon
 */
function getWeatherDescription(code) {
  if (code === 0) return { condition: 'Clear Sky', icon: 'Sun', rainRisk: 'none' };
  if (code === 1 || code === 2) return { condition: 'Mainly Clear / Partly Cloudy', icon: 'CloudSun', rainRisk: 'low' };
  if (code === 3) return { condition: 'Overcast', icon: 'Cloud', rainRisk: 'low' };
  if ([51, 53, 55, 61].includes(code)) return { condition: 'Light Rain / Drizzle', icon: 'CloudDrizzle', rainRisk: 'medium' };
  if ([63, 65, 80, 81].includes(code)) return { condition: 'Moderate to Heavy Rain', icon: 'CloudRain', rainRisk: 'high' };
  if ([82, 95, 96, 99].includes(code)) return { condition: 'Heavy Thunderstorm & Downpour', icon: 'CloudLightning', rainRisk: 'severe' };
  return { condition: 'Humid / Hazy', icon: 'Cloud', rainRisk: 'low' };
}

/**
 * Fetches current and short-term Mumbai weather from Open-Meteo
 */
async function getMumbaiWeather(lat = 19.0760, lon = 72.8777) {
  const now = Date.now();
  if (cachedWeather && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedWeather;
  }

  try {
    const url = 'https://api.open-meteo.com/v1/forecast';
    const response = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code',
        hourly: 'precipitation_probability,rain,weather_code',
        timezone: 'Asia/Kolkata',
        forecast_days: 1
      },
      timeout: 3500
    });

    const current = response.data.current || {};
    const weatherInfo = getWeatherDescription(current.weather_code || 0);

    // Get max rain probability over next 3 hours
    let maxPrecipProb = 0;
    if (response.data.hourly && response.data.hourly.precipitation_probability) {
      const currentHour = new Date().getHours();
      const nextFewHours = response.data.hourly.precipitation_probability.slice(currentHour, currentHour + 4);
      if (nextFewHours.length > 0) {
        maxPrecipProb = Math.max(...nextFewHours);
      }
    }

    const weatherData = {
      source: 'Open-Meteo Weather API',
      temperatureC: Math.round(current.temperature_2m || 30),
      feelsLikeC: Math.round(current.apparent_temperature || 33),
      humidity: current.relative_humidity_2m || 75,
      precipitationMm: current.precipitation || 0,
      rainProbability: maxPrecipProb || (current.rain > 0 ? 80 : 15),
      condition: weatherInfo.condition,
      icon: weatherInfo.icon,
      rainRisk: maxPrecipProb > 60 || current.precipitation > 1 ? 'high' : (maxPrecipProb > 30 ? 'medium' : 'low'),
      updatedAt: new Date().toISOString()
    };

    cachedWeather = weatherData;
    lastFetchTime = now;
    return weatherData;
  } catch (err) {
    console.warn('Open-Meteo weather fetch failed, using realistic Mumbai monsoon/seasonal fallback:', err.message);
  }

  // Realistic Mumbai fallback
  return {
    source: 'Estimated Seasonal Climate (Fallback)',
    temperatureC: 30,
    feelsLikeC: 34,
    humidity: 78,
    precipitationMm: 0,
    rainProbability: 25,
    condition: 'Humid & Partly Cloudy',
    icon: 'CloudSun',
    rainRisk: 'low',
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  getMumbaiWeather,
  getWeatherDescription
};
