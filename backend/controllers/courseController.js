/**
 * Course Controller
 *
 * Exposes authenticated endpoints for managing student courses and subjects.
 */

const { courseService } = require('../services');
const { success, created } = require('../utils/apiResponse');

function createCourse(req, res, next) {
  try {
    const studentId = req.user.id;
    const course = courseService.createCourse(studentId, req.body, req.user);
    return created(res, {
      message: 'Course created successfully',
      course
    });
  } catch (err) {
    next(err);
  }
}

function listCourses(req, res, next) {
  try {
    const studentId = req.user.id;
    const result = courseService.listCourses(studentId, req.user, req.query);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

function getCourse(req, res, next) {
  try {
    const { id } = req.params;
    const course = courseService.getCourseById(id, req.user);
    return success(res, { course });
  } catch (err) {
    next(err);
  }
}

function updateCourse(req, res, next) {
  try {
    const { id } = req.params;
    const course = courseService.updateCourse(id, req.body, req.user);
    return success(res, {
      message: 'Course updated successfully',
      course
    });
  } catch (err) {
    next(err);
  }
}

function archiveCourse(req, res, next) {
  try {
    const { id } = req.params;
    const archived = req.body && req.body.archived !== undefined ? req.body.archived : true;
    const course = courseService.archiveCourse(id, req.user, archived);
    return success(res, {
      message: `Course ${course.archived ? 'archived' : 'unarchived'} successfully`,
      course
    });
  } catch (err) {
    next(err);
  }
}

function deleteCourse(req, res, next) {
  try {
    const { id } = req.params;
    courseService.deleteCourse(id, req.user);
    return success(res, {
      message: 'Course deleted successfully',
      id
    });
  } catch (err) {
    next(err);
  }
}

function getCourseResources(req, res, next) {
  try {
    const { id } = req.params;
    const result = courseService.getCourseResources(id, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

function linkResources(req, res, next) {
  try {
    const { id } = req.params;
    const resourceIds = req.body.resource_ids || req.body.resourceIds;
    const result = courseService.linkResources(id, resourceIds, req.user);
    return success(res, {
      message: 'Resources linked to course successfully',
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
    const result = courseService.unlinkResource(id, resourceId, req.user);
    return success(res, {
      message: 'Resource unlinked from course successfully',
      unlinked: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  archiveCourse,
  deleteCourse,
  getCourseResources,
  linkResources,
  unlinkResource
};
