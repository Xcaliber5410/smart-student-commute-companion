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

module.exports = {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  archiveCourse,
  deleteCourse
};
