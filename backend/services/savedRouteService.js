/**
 * SavedRouteService
 *
 * Core student workflow service for bookmarked and favorite commute route shortcuts.
 */

const { savedRouteRepository } = require('../repositories/SavedRouteRepository');
const { userRepository } = require('../repositories/UserRepository');
const {
  NotFoundError,
  ForbiddenError,
  BadRequestError
} = require('../errors');

class SavedRouteService {
  constructor(routeRepo = savedRouteRepository, userRepo = userRepository) {
    this.routeRepo = routeRepo;
    this.userRepo = userRepo;
  }

  assertOwnership(route, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access saved route');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === route.user_id) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to manage another student saved route');
  }

  createSavedRoute(userId, input, requestingUser) {
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('You can only save routes for your own account');
    }

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    const created = this.routeRepo.create({
      ...input,
      user_id: userId
    });

    return created.toJSON();
  }

  getStudentSavedRoutes(userId, requestingUser, options = {}) {
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('You can only view your own saved routes');
    }

    const routes = this.routeRepo.findByUserId(userId, options);
    return routes.map(r => r.toJSON());
  }

  listStudentSavedRoutes(userId, requestingUser, options = {}) {
    if (requestingUser.role !== 'admin' && requestingUser.id !== userId) {
      throw new ForbiddenError('You can only view your own saved routes');
    }

    const result = this.routeRepo.findWithPaginationAndFilters(userId, options);
    return {
      routes: result.data.map(r => r.toJSON()),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrev: result.page > 1
      }
    };
  }

  getSavedRouteById(routeId, requestingUser) {
    const route = this.routeRepo.findById(routeId);
    if (!route) {
      throw new NotFoundError(`Saved route with id '${routeId}' not found`);
    }

    this.assertOwnership(route, requestingUser);
    return route.toJSON();
  }

  updateSavedRoute(routeId, updates, requestingUser) {
    const existing = this.routeRepo.findById(routeId);
    if (!existing) {
      throw new NotFoundError(`Saved route with id '${routeId}' not found`);
    }

    this.assertOwnership(existing, requestingUser);
    const updated = this.routeRepo.update(routeId, updates);
    return updated.toJSON();
  }

  deleteSavedRoute(routeId, requestingUser) {
    const existing = this.routeRepo.findById(routeId);
    if (!existing) {
      throw new NotFoundError(`Saved route with id '${routeId}' not found`);
    }

    this.assertOwnership(existing, requestingUser);
    return this.routeRepo.delete(routeId);
  }
}

const savedRouteService = new SavedRouteService();

module.exports = {
  SavedRouteService,
  savedRouteService
};
