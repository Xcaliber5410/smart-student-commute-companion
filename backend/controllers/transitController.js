const { transitService } = require('../services');

/**
 * Transit stop and route search controller
 * Thin HTTP adapter delegating GTFS search logic to transitService.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function searchTransit(req, res, next) {
  try {
    const { q, lat, lon, radius } = req.query;
    const result = transitService.search({ q, lat, lon, radius });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchTransit
};
