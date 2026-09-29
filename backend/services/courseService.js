/**
 * CourseService
 *
 * Business logic and authorization guards for student academic courses and subjects.
 */

const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { Course } = require('../models/Course');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} = require('../errors');

class CourseService {
  constructor(courseRepo = courseRepository, userRepo = userRepository) {
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
  }

  assertOwnership(course, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access academic course');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === course.user_id) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to manage another student course');
  }

  createCourse(userId, input, requestingUser) {
    if (!requestingUser || (requestingUser.role !== 'admin' && requestingUser.id !== userId)) {
      throw new ForbiddenError('You can only create courses for your own account');
    }

    const user = this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`Student user with id '${userId}' not found`);
    }

    if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 2) {
      throw new BadRequestError('Course name must have at least 2 characters');
    }

    // Duplicate detection: prevent duplicate course name for the same student
    const existingName = this.courseRepo.findByNameAndUser(input.name, userId);
    if (existingName) {
      throw new ConflictError(`A course with the name '${input.name.trim()}' already exists for this student`);
    }

    // If course code is provided, check code uniqueness for same student
    if (input.code && typeof input.code === 'string' && input.code.trim().length > 0) {
      const existingCode = this.courseRepo.findByCodeAndUser(input.code, userId);
      if (existingCode) {
        throw new ConflictError(`A course with the code '${input.code.trim()}' already exists for this student`);
      }
    }

    const courseInstance = Course.create({
      ...input,
      name: input.name.trim(),
      code: input.code ? input.code.trim() : null,
      instructor: input.instructor ? input.instructor.trim() : null,
      user_id: userId
    });

    const created = this.courseRepo.create(courseInstance);
    return created.toJSON();
  }

  listCourses(userId, requestingUser, options = {}) {
    if (!requestingUser || (requestingUser.role !== 'admin' && requestingUser.id !== userId)) {
      throw new ForbiddenError('You can only view your own academic courses');
    }

    const result = this.courseRepo.findWithPaginationAndFilters(userId, options);
    return {
      courses: result.data.map(c => c.toJSON()),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    };
  }

  getCourseById(id, requestingUser) {
    const course = this.courseRepo.findById(id);
    if (!course) {
      throw new NotFoundError(`Course with id '${id}' not found`);
    }

    this.assertOwnership(course, requestingUser);
    return course.toJSON();
  }

  updateCourse(id, updates, requestingUser) {
    const course = this.courseRepo.findById(id);
    if (!course) {
      throw new NotFoundError(`Course with id '${id}' not found`);
    }

    this.assertOwnership(course, requestingUser);

    // Duplicate check on rename
    if (updates.name && updates.name.trim().toLowerCase() !== course.name.toLowerCase()) {
      const existingName = this.courseRepo.findByNameAndUser(updates.name, course.user_id);
      if (existingName && existingName.id !== id) {
        throw new ConflictError(`A course with the name '${updates.name.trim()}' already exists`);
      }
    }

    // Duplicate check on code update
    if (updates.code && updates.code.trim().toLowerCase() !== (course.code || '').toLowerCase()) {
      const existingCode = this.courseRepo.findByCodeAndUser(updates.code, course.user_id);
      if (existingCode && existingCode.id !== id) {
        throw new ConflictError(`A course with the code '${updates.code.trim()}' already exists`);
      }
    }

    const updated = this.courseRepo.update(id, {
      ...updates,
      name: updates.name ? updates.name.trim() : undefined,
      code: updates.code !== undefined ? (updates.code ? updates.code.trim() : null) : undefined,
      instructor: updates.instructor !== undefined ? (updates.instructor ? updates.instructor.trim() : null) : undefined
    });

    return updated.toJSON();
  }

  archiveCourse(id, requestingUser, archived = true) {
    const course = this.courseRepo.findById(id);
    if (!course) {
      throw new NotFoundError(`Course with id '${id}' not found`);
    }

    this.assertOwnership(course, requestingUser);
    const updated = this.courseRepo.archive(id, archived);
    return updated.toJSON();
  }

  deleteCourse(id, requestingUser) {
    const course = this.courseRepo.findById(id);
    if (!course) {
      throw new NotFoundError(`Course with id '${id}' not found`);
    }

    this.assertOwnership(course, requestingUser);
    this.courseRepo.delete(id);
    return { success: true, id };
  }
}

module.exports = {
  CourseService,
  courseService: new CourseService()
};
