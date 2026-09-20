# Frontend Configuration

This directory contains the centralized configuration system for the frontend application.

## Overview

All frontend environment variables and configuration settings are managed through the `config/index.js` module. This provides a single source of truth for configuration across the application.

## Usage

Import configuration values from the config module:

```javascript
import { API_BASE_URL, SOCKET_URL, ENABLE_DEMO_RESET } from '../config/index.js';
// or
import config from '../config/index.js';

// Use the configuration
fetch(`${API_BASE_URL}/endpoint`);
```

## Environment Variables

All environment variables must be prefixed with `VITE_` to be exposed to the client bundle.

See `frontend/.env.example` for all available configuration options.

### Required Variables

- `VITE_API_BASE_URL` - Base URL for backend API endpoints
- `VITE_SOCKET_URL` - Socket.IO connection URL

### Optional Variables

- `VITE_APP_TITLE` - Application title (default: "Smart Student Commute Companion")
- `VITE_APP_DESCRIPTION` - Application description
- `VITE_ENABLE_DEMO_RESET` - Enable/disable demo reset button (default: true)
- `VITE_LOG_LEVEL` - Console log level (error, warn, info, debug)

## Configuration Files

- `.env.example` - Template with all available variables and descriptions
- `.env.local` - Local development configuration (git-ignored)
- `.env.production` - Production configuration (git-ignored)

## Security

⚠️ **IMPORTANT**: All `VITE_` environment variables are **publicly exposed** in the client bundle.

**NEVER** put sensitive information in frontend environment variables:
- ❌ Backend API keys
- ❌ Database credentials
- ❌ Private keys or secrets
- ❌ Authentication tokens

✅ Only put public configuration that is safe to expose to users.

## Validation

Configuration is validated on application startup via `validateConfig()` in `main.jsx`.

If required configuration is missing, the application will:
1. Log an error to the console
2. Show a helpful error message in development mode
3. Prevent the app from rendering

## Logger Utility

The config module exports a logger that respects the `VITE_LOG_LEVEL` setting:

```javascript
import { logger } from '../config/index.js';

logger.error('Critical error');  // Always logged
logger.warn('Warning message');   // Logged if level >= warn
logger.info('Info message');      // Logged if level >= info
logger.debug('Debug details');    // Logged if level === debug
```

## External CDN URLs

External CDN URLs (Google Fonts, Leaflet, OSM tiles) are documented in `EXTERNAL_CDN` for reference but are not configurable. These are loaded directly from `index.html` and component code.

## Adding New Configuration

1. Add the environment variable to `.env.example` with documentation
2. Add the environment variable to `.env.local` with your value
3. Add the configuration constant to `config/index.js` using `getEnv()` or `getBoolEnv()`
4. Export the constant
5. Update validation in `validateConfig()` if the variable is required
6. Import and use the constant in your components/services

## Best Practices

1. **Centralize**: Always import from `config/index.js`, never use `import.meta.env` directly in components
2. **Validate**: Add validation for required configuration in `validateConfig()`
3. **Document**: Update `.env.example` when adding new variables
4. **Type Safety**: Use helper functions (`getEnv`, `getBoolEnv`) for consistent behavior
5. **Default Values**: Provide sensible defaults for optional configuration

## Development vs Production

- **Development**: Uses `.env.local` with Vite proxy to `http://localhost:5000`
- **Production**: Uses `.env.production` with full backend URLs

The `IS_DEVELOPMENT` and `IS_PRODUCTION` flags are available for environment-specific logic.
