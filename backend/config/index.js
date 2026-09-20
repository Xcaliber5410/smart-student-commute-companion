const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { z } = require('zod');

// 1. Locate and load environment files safely
// Checks backend/.env first, then root .env
const backendEnvPath = path.resolve(__dirname, '../.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  // Fall back to default dotenv behavior if neither specific path exists
  dotenv.config();
}

// 2. Define strict Zod schema for environment configuration
const envSchema = z.object({
  PORT: z.coerce
    .number({
      invalid_type_error: 'PORT must be a valid number'
    })
    .int('PORT must be an integer')
    .min(1, 'PORT must be between 1 and 65535')
    .max(65535, 'PORT must be between 1 and 65535')
    .default(5000),

  NODE_ENV: z
    .enum(['development', 'production', 'test'], {
      errorMap: () => ({ message: "NODE_ENV must be one of: 'development', 'production', 'test'" })
    })
    .default('development'),

  CLIENT_URL: z
    .string({
      required_error: 'CLIENT_URL is required'
    })
    .url('CLIENT_URL must be a valid URL (e.g., http://localhost:5173 or https://myapp.com)')
    .default('http://localhost:5173'),

  GEMINI_API_KEY: z
    .string()
    .optional()
    .default(''),

  REQUIRE_GEMINI_KEY: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.trim().toLowerCase() === 'true';
      return false;
    })
    .default(false),

  DATABASE_PATH: z
    .string()
    .optional()
});

/**
 * Validates raw environment configuration with strict sanitization.
 * Secrets are NEVER included in error messages or logs.
 *
 * @param {Record<string, any>} rawEnv - Environment key-value pairs (defaults to process.env)
 * @returns {Record<string, any>} Validated and normalized configuration
 */
function validateEnv(rawEnv = process.env) {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.errors.map(err => {
      const field = err.path.join('.');
      return `[${field}] ${err.message}`;
    });

    const sanitizedMessage = `[Backend Configuration Error] Missing or invalid environment configuration:\n  - ${errorDetails.join('\n  - ')}`;
    const error = new Error(sanitizedMessage);
    error.name = 'ConfigValidationError';
    error.details = errorDetails;
    throw error;
  }

  const data = result.data;

  // Rule: In production, CLIENT_URL must not be a localhost loopback
  if (data.NODE_ENV === 'production') {
    const isLocalhost = data.CLIENT_URL.includes('localhost') || data.CLIENT_URL.includes('127.0.0.1');
    if (isLocalhost) {
      throw new Error('[Backend Configuration Error] In production, CLIENT_URL must not point to localhost.');
    }
  }

  // Rule: If REQUIRE_GEMINI_KEY is explicitly enabled, GEMINI_API_KEY must not be empty
  if (data.REQUIRE_GEMINI_KEY && (!data.GEMINI_API_KEY || data.GEMINI_API_KEY.trim() === '')) {
    throw new Error('[Backend Configuration Error] GEMINI_API_KEY is required because REQUIRE_GEMINI_KEY is enabled.');
  }

  return data;
}

// 3. Initialize and validate the current process environment
let validatedConfig;
try {
  validatedConfig = validateEnv(process.env);
} catch (err) {
  console.error('\n' + '='.repeat(60));
  console.error(' FATAL CONFIGURATION ERROR');
  console.error('='.repeat(60));
  console.error(err.message);
  console.error('='.repeat(60) + '\n');
  throw err;
}

// Default database path preservation (backend/db/commute.db)
const defaultDbPath = path.resolve(__dirname, '../db/commute.db');
const resolvedDbPath = validatedConfig.DATABASE_PATH
  ? path.resolve(process.cwd(), validatedConfig.DATABASE_PATH)
  : defaultDbPath;

// Build allowed CORS origins array from CLIENT_URL
const allowedOrigins = [
  validatedConfig.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];
// Deduplicate origins
const uniqueAllowedOrigins = Array.from(new Set(allowedOrigins));

/**
 * Centralized, validated backend configuration object
 */
const config = {
  port: validatedConfig.PORT,
  nodeEnv: validatedConfig.NODE_ENV,
  isProduction: validatedConfig.NODE_ENV === 'production',
  isDevelopment: validatedConfig.NODE_ENV === 'development',
  isTest: validatedConfig.NODE_ENV === 'test',
  clientUrl: validatedConfig.CLIENT_URL,
  allowedOrigins: uniqueAllowedOrigins,
  geminiApiKey: validatedConfig.GEMINI_API_KEY,
  requireGeminiKey: validatedConfig.REQUIRE_GEMINI_KEY,
  database: {
    path: resolvedDbPath
  },

  /**
   * Returns a sanitized copy of the configuration safe for logging and diagnostics.
   * Redacts sensitive secrets such as API keys.
   */
  toSanitizedObject() {
    return {
      port: this.port,
      nodeEnv: this.nodeEnv,
      clientUrl: this.clientUrl,
      allowedOrigins: this.allowedOrigins,
      databasePath: this.database.path,
      geminiApiKey: this.geminiApiKey
        ? `***${this.geminiApiKey.slice(-4)}`
        : '(not configured - deterministic fallback active)',
      requireGeminiKey: this.requireGeminiKey
    };
  }
};

module.exports = config;
module.exports.validateEnv = validateEnv;
module.exports.envSchema = envSchema;
