/**
 * Centralized Frontend Configuration
 * 
 * This module provides a single source of truth for all frontend configuration.
 * It reads from Vite environment variables (import.meta.env) and provides defaults.
 * 
 * SECURITY: All values here are PUBLIC and exposed in the client bundle.
 * Never put secrets, API keys, database credentials, or private keys here.
 */

/**
 * Get environment variable with fallback to default value
 * @param {string} key - Environment variable key (e.g., 'VITE_API_BASE_URL')
 * @param {string} defaultValue - Default value if env var is not set
 * @returns {string} The environment variable value or default
 */
function getEnv(key, defaultValue) {
  const value = import.meta.env[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Get boolean environment variable
 * @param {string} key - Environment variable key
 * @param {boolean} defaultValue - Default boolean value
 * @returns {boolean} The boolean value
 */
function getBoolEnv(key, defaultValue) {
  const value = import.meta.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

// API Configuration
export const API_BASE_URL = getEnv('VITE_API_BASE_URL', '/api');

// WebSocket Configuration
export const SOCKET_URL = getEnv('VITE_SOCKET_URL', '/');

// App Metadata
export const APP_TITLE = getEnv('VITE_APP_TITLE', 'Smart Student Commute Companion');
export const APP_DESCRIPTION = getEnv(
  'VITE_APP_DESCRIPTION',
  'AI-powered student mobility assistant for Mumbai college commutes'
);

// Feature Flags
export const ENABLE_DEMO_RESET = getBoolEnv('VITE_ENABLE_DEMO_RESET', true);

// Development Configuration
export const LOG_LEVEL = getEnv('VITE_LOG_LEVEL', 'info');
export const IS_DEVELOPMENT = import.meta.env.DEV;
export const IS_PRODUCTION = import.meta.env.PROD;

// External CDN URLs (non-configurable, documented for reference)
export const EXTERNAL_CDN = {
  GOOGLE_FONTS: 'https://fonts.googleapis.com',
  LEAFLET_CSS: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  OSM_TILES: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

/**
 * Logger utility based on LOG_LEVEL configuration
 */
export const logger = {
  error: (...args) => console.error(...args),
  warn: (...args) => {
    if (['warn', 'info', 'debug'].includes(LOG_LEVEL)) {
      console.warn(...args);
    }
  },
  info: (...args) => {
    if (['info', 'debug'].includes(LOG_LEVEL)) {
      console.info(...args);
    }
  },
  debug: (...args) => {
    if (LOG_LEVEL === 'debug') {
      console.debug(...args);
    }
  },
};

/**
 * Validate required configuration on app startup
 * Throws error if critical configuration is missing
 */
export function validateConfig() {
  const errors = [];

  // API_BASE_URL is required
  if (!API_BASE_URL) {
    errors.push('VITE_API_BASE_URL is required but not set');
  }

  // SOCKET_URL is required
  if (!SOCKET_URL) {
    errors.push('VITE_SOCKET_URL is required but not set');
  }

  if (errors.length > 0) {
    const errorMessage = `Configuration validation failed:\n${errors.join('\n')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Log configuration in development
  if (IS_DEVELOPMENT) {
    logger.info('Frontend configuration loaded:', {
      API_BASE_URL,
      SOCKET_URL,
      APP_TITLE,
      ENABLE_DEMO_RESET,
      LOG_LEVEL,
      IS_DEVELOPMENT,
      IS_PRODUCTION,
    });
  }
}

// Default export for convenience
export default {
  API_BASE_URL,
  SOCKET_URL,
  APP_TITLE,
  APP_DESCRIPTION,
  ENABLE_DEMO_RESET,
  LOG_LEVEL,
  IS_DEVELOPMENT,
  IS_PRODUCTION,
  EXTERNAL_CDN,
  logger,
  validateConfig,
};
