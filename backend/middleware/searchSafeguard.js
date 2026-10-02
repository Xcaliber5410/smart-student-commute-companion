/**
 * Search Abuse Safeguard Middleware
 *
 * Lightweight request throttling and abuse protection for student search endpoints.
 * Integrates directly with SearchAnalyticsService to track search volume and prevent
 * automated scraping, rapid runaway loops, and algorithmic denial-of-service.
 */

const { searchAnalyticsService } = require('../services/searchAnalyticsService');

/**
 * Express middleware that checks client request velocity against configured safeguards.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function searchAbuseSafeguard(req, res, next) {
  try {
    const identifier = req.user?.id || req.ip || 'anonymous';
    
    // Check and enforce rate limit
    searchAnalyticsService.enforceRateLimit(identifier);

    // Attach diagnostic rate-limit headers
    const status = searchAnalyticsService.checkRateLimit(identifier);
    res.setHeader('X-SearchRateLimit-Limit', status.limit);
    res.setHeader('X-SearchRateLimit-Remaining', status.remaining);
    res.setHeader('X-SearchRateLimit-Reset', Math.ceil(status.resetInMs / 1000));

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchAbuseSafeguard
};
