/**
 * Study Resource Controller
 *
 * Exposes authenticated endpoints for student study resources (notes, references,
 * links, documents, and lightweight study materials).
 * Guarantees strict student scoping, unified response formatting, and error handling.
 */

const { studyResourceService } = require('../services');
const { success, created } = require('../utils/apiResponse');

/**
 * Creates a new study resource for the authenticated student.
 */
function createResource(req, res, next) {
  try {
    const studentId = req.user.id;
    const resource = studyResourceService.createResource(studentId, req.body, req.user);
    return created(res, {
      message: 'Study resource created successfully',
      resource: resource.toJSON ? resource.toJSON() : resource
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Lists study resources for the authenticated student with filtering, searching, and pagination.
 */
function listResources(req, res, next) {
  try {
    const result = studyResourceService.getResources(req.user, req.query);
    return success(res, {
      resources: result.data.map(r => (r.toJSON ? r.toJSON() : r)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves a single study resource by ID with student ownership verification.
 */
function getResource(req, res, next) {
  try {
    const { id } = req.params;
    const resource = studyResourceService.getResourceById(id, req.user);
    return success(res, {
      resource: resource.toJSON ? resource.toJSON() : resource
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates an existing study resource (partial or full).
 */
function updateResource(req, res, next) {
  try {
    const { id } = req.params;
    const resource = studyResourceService.updateResource(id, req.user, req.body);
    return success(res, {
      message: 'Study resource updated successfully',
      resource: resource.toJSON ? resource.toJSON() : resource
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a study resource with ownership protection.
 */
function deleteResource(req, res, next) {
  try {
    const { id } = req.params;
    studyResourceService.deleteResource(id, req.user);
    return success(res, {
      message: 'Study resource deleted successfully',
      id
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Archives or unarchives a study resource.
 */
function archiveResource(req, res, next) {
  try {
    const { id } = req.params;
    const shouldArchive = req.body && req.body.archived !== undefined ? Boolean(req.body.archived) : true;
    const resource = shouldArchive
      ? studyResourceService.archiveResource(id, req.user)
      : studyResourceService.unarchiveResource(id, req.user);

    return success(res, {
      message: shouldArchive ? 'Study resource archived successfully' : 'Study resource unarchived successfully',
      resource: resource.toJSON ? resource.toJSON() : resource
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggles the favorite status of a study resource.
 */
function toggleFavorite(req, res, next) {
  try {
    const { id } = req.params;
    const resource = studyResourceService.toggleFavorite(id, req.user);
    return success(res, {
      message: resource.is_favorite ? 'Study resource marked as favorite' : 'Study resource removed from favorites',
      resource: resource.toJSON ? resource.toJSON() : resource
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createResource,
  listResources,
  getResource,
  updateResource,
  deleteResource,
  archiveResource,
  toggleFavorite
};
