/**
 * Legacy API router entry point.
 * Delegates to the centralized routes aggregator in ./index.js.
 * Preserves 100% backward compatibility for existing imports.
 */
const createApiRouter = require('./index');

module.exports = createApiRouter;
