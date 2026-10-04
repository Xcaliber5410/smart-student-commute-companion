/**
 * Assignment Controller
 *
 * Exposes authenticated endpoints for managing student assignments, deliverables, and tasks.
 */

const { assignmentService, academicProgressService } = require('../services');
const { success, created } = require('../utils/apiResponse');

function createAssignment(req, res, next) {
  try {
    const studentId = req.user.id;
    const assignment = assignmentService.createAssignment(studentId, req.body, req.user);
    return created(res, {
      message: 'Assignment created successfully',
      assignment
    });
  } catch (err) {
    next(err);
  }
}

function listAssignments(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = assignmentService.listAssignments(studentId, req.user, req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

function getAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const assignment = assignmentService.getAssignmentById(id, req.user);
    return success(res, { assignment });
  } catch (err) {
    next(err);
  }
}

function updateAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const assignment = assignmentService.updateAssignment(id, req.body, req.user);
    return success(res, {
      message: 'Assignment updated successfully',
      assignment
    });
  } catch (err) {
    next(err);
  }
}

function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const assignment = assignmentService.updateStatus(id, status, req.user);
    return success(res, {
      message: 'Assignment status updated successfully',
      assignment
    });
  } catch (err) {
    next(err);
  }
}

function deleteAssignment(req, res, next) {
  try {
    const { id } = req.params;
    assignmentService.deleteAssignment(id, req.user);
    return success(res, {
      message: 'Assignment deleted successfully',
      id
    });
  } catch (err) {
    next(err);
  }
}

function getAcademicSummary(req, res, next) {
  try {
    const studentId = req.user.id;
    const summary = academicProgressService.getStudentAcademicSummary(studentId, req.user, req.query);
    return success(res, summary);
  } catch (err) {
    next(err);
  }
}

function getAssignmentResources(req, res, next) {
  try {
    const { id } = req.params;
    const result = assignmentService.getAssignmentResources(id, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

function linkResources(req, res, next) {
  try {
    const { id } = req.params;
    const resourceIds = req.body.resource_ids || req.body.resourceIds;
    const result = assignmentService.linkResources(id, resourceIds, req.user);
    return success(res, {
      message: 'Resources linked to assignment successfully',
      linkedCount: result.resources ? result.resources.length : (resourceIds ? resourceIds.length : 0),
      ...result
    });
  } catch (err) {
    next(err);
  }
}

function unlinkResource(req, res, next) {
  try {
    const { id, resourceId } = req.params;
    const result = assignmentService.unlinkResource(id, resourceId, req.user);
    return success(res, {
      message: 'Resource unlinked from assignment successfully',
      unlinked: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAssignment,
  listAssignments,
  getAssignment,
  updateAssignment,
  updateStatus,
  deleteAssignment,
  getAcademicSummary,
  getAssignmentResources,
  linkResources,
  unlinkResource
};
