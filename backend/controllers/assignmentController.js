/**
 * Assignment Controller
 *
 * Exposes authenticated endpoints for managing student assignments, deliverables, and tasks.
 */

const { assignmentService } = require('../services');
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

module.exports = {
  createAssignment,
  listAssignments,
  getAssignment,
  updateAssignment,
  updateStatus,
  deleteAssignment
};
