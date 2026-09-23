/**
 * Standardized API Response Utilities
 *
 * Provides uniform conventions for success, pagination, and mutation responses
 * across all backend endpoints while preserving existing payload contracts.
 */

/**
 * Sends a standardized successful JSON response.
 *
 * @param {import('express').Response} res
 * @param {object} [payload={}]
 * @param {number} [statusCode=200]
 */
function success(res, payload = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    timestamp: new Date().toISOString(),
    ...payload
  });
}

/**
 * Sends a standardized 201 Created response.
 *
 * @param {import('express').Response} res
 * @param {object} [payload={}]
 */
function created(res, payload = {}) {
  return success(res, payload, 201);
}

/**
 * Sends a standardized collection response with pagination metadata.
 *
 * @param {import('express').Response} res
 * @param {object} options
 * @param {string} options.dataKey - Key name for the items collection (e.g. 'groups', 'reports')
 * @param {Array} options.data - Collection array
 * @param {object} options.pagination - Pagination details (page, limit, total, totalPages, etc.)
 * @param {number} [statusCode=200]
 */
function paginated(res, { dataKey, data, pagination, ...extra }, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    timestamp: new Date().toISOString(),
    [dataKey]: data,
    pagination,
    ...extra
  });
}

module.exports = {
  success,
  created,
  paginated
};
