/**
 * StudyResourceService
 *
 * Business logic for student study resources (notes, references, links, documents).
 * Enforces strict student ownership, relational integrity, and safe updates/deletions.
 */

const { StudyResource } = require('../models/StudyResource');
const { studyResourceRepository } = require('../repositories/StudyResourceRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

class StudyResourceService {
  constructor(
    resourceRepo = studyResourceRepository,
    courseRepo = courseRepository,
    asgnRepo = assignmentRepository,
    goalRepo = goalRepository,
    studyRepo = studySessionRepository
  ) {
    this.resourceRepo = resourceRepo;
    this.courseRepo = courseRepo;
    this.asgnRepo = asgnRepo;
    this.goalRepo = goalRepo;
    this.studyRepo = studyRepo;
  }

  /**
   * Validates that any associated course, assignment, goal, or study session
   * exists and strictly belongs to the requesting student.
   *
   * @param {string} userId - Requesting student user ID
   * @param {object} associations - Candidate foreign associations
   */
  validateAssociationOwnership(userId, associations = {}) {
    const { course_id, assignment_id, goal_id, study_session_id } = associations;

    if (course_id) {
      const course = this.courseRepo.findById(course_id);
      if (!course) {
        throw new NotFoundError(`Course '${course_id}' not found`);
      }
      if (course.user_id !== userId) {
        throw new ForbiddenError('Cannot link study resource to a course belonging to another student');
      }
    }

    if (assignment_id) {
      const assignment = this.asgnRepo.findById(assignment_id);
      if (!assignment) {
        throw new NotFoundError(`Assignment '${assignment_id}' not found`);
      }
      if (assignment.user_id !== userId) {
        throw new ForbiddenError('Cannot link study resource to an assignment belonging to another student');
      }
    }

    if (goal_id) {
      const goal = this.goalRepo.findById(goal_id);
      if (!goal) {
        throw new NotFoundError(`Goal '${goal_id}' not found`);
      }
      if (goal.user_id !== userId) {
        throw new ForbiddenError('Cannot link study resource to a goal belonging to another student');
      }
    }

    if (study_session_id) {
      const session = this.studyRepo.findById(study_session_id);
      if (!session) {
        throw new NotFoundError(`Study session '${study_session_id}' not found`);
      }
      if (session.user_id !== userId) {
        throw new ForbiddenError('Cannot link study resource to a study session belonging to another student');
      }
    }
  }

  /**
   * Creates a new study resource for the authenticated student.
   *
   * @param {string} userId - Owning student user ID
   * @param {object} data - Validated resource creation payload
   * @returns {StudyResource} Created study resource
   */
  createResource(userId, data) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Valid student user_id is required');
    }

    this.validateAssociationOwnership(userId, data);

    const resource = this.resourceRepo.create({
      ...data,
      user_id: userId
    });

    return resource;
  }

  /**
   * Retrieves a single study resource by ID with student ownership verification.
   *
   * @param {string} id - Resource ID
   * @param {string} userId - Requesting student user ID
   * @returns {StudyResource}
   */
  getResourceById(id, userId) {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Valid resource ID is required');
    }

    const resource = this.resourceRepo.findById(id);
    if (!resource) {
      throw new NotFoundError(`Study resource '${id}' not found`);
    }

    if (resource.user_id !== userId) {
      throw new ForbiddenError('Access forbidden: you do not have permission to access this study resource');
    }

    return resource;
  }

  /**
   * Retrieves paginated and filtered study resources for the student.
   *
   * @param {string} userId - Requesting student user ID
   * @param {object} [options={}] - Pagination and filter parameters
   * @returns {{ data: StudyResource[], total: number, page: number, limit: number, totalPages: number }}
   */
  getResources(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('Valid student user_id is required');
    }

    return this.resourceRepo.findWithPaginationAndFilters(userId, options);
  }

  /**
   * Updates an existing study resource with ownership and association checks.
   *
   * @param {string} id - Resource ID
   * @param {string} userId - Requesting student user ID
   * @param {object} updates - Fields to update
   * @returns {StudyResource} Updated resource
   */
  updateResource(id, userId, updates = {}) {
    const existing = this.getResourceById(id, userId);

    // If updating associations, ensure the targets exist and belong to the student
    const associationsToCheck = {
      course_id: updates.course_id !== undefined ? updates.course_id : existing.course_id,
      assignment_id: updates.assignment_id !== undefined ? updates.assignment_id : existing.assignment_id,
      goal_id: updates.goal_id !== undefined ? updates.goal_id : existing.goal_id,
      study_session_id: updates.study_session_id !== undefined ? updates.study_session_id : existing.study_session_id
    };
    this.validateAssociationOwnership(userId, associationsToCheck);

    const updated = this.resourceRepo.update(id, userId, updates);
    return updated;
  }

  /**
   * Deletes a study resource with ownership protection.
   *
   * @param {string} id - Resource ID
   * @param {string} userId - Requesting student user ID
   * @returns {boolean} True if deleted
   */
  deleteResource(id, userId) {
    this.getResourceById(id, userId); // Throws 404 or 403 if invalid
    return this.resourceRepo.delete(id, userId);
  }

  /**
   * Toggles the favorite status of a study resource.
   *
   * @param {string} id - Resource ID
   * @param {string} userId - Requesting student user ID
   * @returns {StudyResource} Updated resource
   */
  toggleFavorite(id, userId) {
    this.getResourceById(id, userId);
    return this.resourceRepo.toggleFavorite(id, userId);
  }

  /**
   * Archives a study resource.
   *
   * @param {string} id - Resource ID
   * @param {string} userId - Requesting student user ID
   * @returns {StudyResource}
   */
  archiveResource(id, userId) {
    this.getResourceById(id, userId);
    return this.resourceRepo.archive(id, userId);
  }

  /**
   * Unarchives a study resource.
   *
   * @param {string} id - Resource ID
   * @param {string} userId - Requesting student user ID
   * @returns {StudyResource}
   */
  unarchiveResource(id, userId) {
    this.getResourceById(id, userId);
    return this.resourceRepo.unarchive(id, userId);
  }

  /**
   * Retrieves all study resources linked to a specific course.
   *
   * @param {string} userId - Requesting student user ID
   * @param {string} courseId - Course ID
   * @returns {StudyResource[]}
   */
  getResourcesByCourse(userId, courseId) {
    const course = this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundError(`Course '${courseId}' not found`);
    }
    if (course.user_id !== userId) {
      throw new ForbiddenError('Cannot access resources for a course belonging to another student');
    }
    return this.resourceRepo.findByCourse(courseId, userId);
  }

  /**
   * Retrieves all study resources linked to a specific assignment.
   *
   * @param {string} userId - Requesting student user ID
   * @param {string} assignmentId - Assignment ID
   * @returns {StudyResource[]}
   */
  getResourcesByAssignment(userId, assignmentId) {
    const assignment = this.asgnRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment '${assignmentId}' not found`);
    }
    if (assignment.user_id !== userId) {
      throw new ForbiddenError('Cannot access resources for an assignment belonging to another student');
    }
    return this.resourceRepo.findByAssignment(assignmentId, userId);
  }

  /**
   * Retrieves all study resources linked to a specific goal.
   *
   * @param {string} userId - Requesting student user ID
   * @param {string} goalId - Goal ID
   * @returns {StudyResource[]}
   */
  getResourcesByGoal(userId, goalId) {
    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal '${goalId}' not found`);
    }
    if (goal.user_id !== userId) {
      throw new ForbiddenError('Cannot access resources for a goal belonging to another student');
    }
    return this.resourceRepo.findByGoal(goalId, userId);
  }

  /**
   * Retrieves all study resources linked to a specific study session.
   *
   * @param {string} userId - Requesting student user ID
   * @param {string} studySessionId - Study Session ID
   * @returns {StudyResource[]}
   */
  getResourcesByStudySession(userId, studySessionId) {
    const session = this.studyRepo.findById(studySessionId);
    if (!session) {
      throw new NotFoundError(`Study session '${studySessionId}' not found`);
    }
    if (session.user_id !== userId) {
      throw new ForbiddenError('Cannot access resources for a study session belonging to another student');
    }
    return this.resourceRepo.findByStudySession(studySessionId, userId);
  }
}

const studyResourceService = new StudyResourceService();

module.exports = {
  StudyResourceService,
  studyResourceService
};
