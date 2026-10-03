/**
 * StudyResourceService
 *
 * Business logic and authorization guards for student study resources
 * (notes, references, links, documents, and lightweight study materials).
 *
 * Enforces:
 * - Resources belong to authenticated students
 * - Students cannot access, modify, or delete another student's resources
 * - Referenced entities (course, assignment, goal, study session) must exist and belong to the same student
 * - Invalid relationships and malformed payloads are strictly rejected
 * - Safe updates and deletions that do not silently corrupt related domain data
 * - Linking and unlinking operations across supported academic entities
 * - Multi-attribute metadata search and filtering
 */

const { StudyResource } = require('../models/StudyResource');
const { studyResourceRepository } = require('../repositories/StudyResourceRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const {
  createStudyResourceSchema,
  updateStudyResourceSchema,
  studyResourceFilterSchema,
  resourceTypeEnum
} = require('../validators/studyResourceValidators');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError
} = require('../errors');

/**
 * Extracts a normalized user ID string from a user object or string ID.
 *
 * @param {string|object} userOrId
 * @returns {string|null}
 */
function extractUserId(userOrId) {
  if (!userOrId) return null;
  if (typeof userOrId === 'string') return userOrId.trim();
  if (typeof userOrId === 'object' && userOrId.id) return String(userOrId.id).trim();
  return null;
}

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
   * Asserts that the requesting user owns the resource or is an administrator.
   *
   * @param {StudyResource} resource - Resource entity to check
   * @param {string|object} requestingUser - User ID string or user object
   * @returns {boolean} True if authorized
   * @throws {ForbiddenError} If access is denied
   */
  assertOwnership(resource, requestingUser) {
    if (!requestingUser) {
      throw new ForbiddenError('Authentication required to access student study resource');
    }
    const requestingId = extractUserId(requestingUser);
    const role = typeof requestingUser === 'object' ? requestingUser.role : null;

    if (role === 'admin' || (requestingId && requestingId === resource.user_id)) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to access or manage this study resource');
  }

  /**
   * Validates that any associated course, assignment, goal, or study session
   * exists and strictly belongs to the requesting student.
   *
   * @param {string} userId - Requesting student user ID
   * @param {object} associations - Candidate foreign associations
   * @throws {NotFoundError} If associated entity does not exist
   * @throws {ForbiddenError} If associated entity belongs to another student
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
   * @param {string} userId - Target student user ID
   * @param {object} data - Resource creation payload
   * @param {string|object} [requestingUser=null] - Optional requesting user context for authorization
   * @returns {StudyResource} Created study resource
   */
  createResource(userId, data, requestingUser = null) {
    const studentId = extractUserId(userId);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    if (requestingUser) {
      const reqId = extractUserId(requestingUser);
      const role = typeof requestingUser === 'object' ? requestingUser.role : null;
      if (role !== 'admin' && reqId !== studentId) {
        throw new ForbiddenError('You can only create study resources for your own account');
      }
    }

    if (!data || typeof data !== 'object') {
      throw new ValidationError('Resource payload must be a valid object');
    }

    // Validate and normalize input schema
    const parseResult = createStudyResourceSchema.safeParse(data);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new ValidationError(`Validation failed: ${details}`);
    }
    const validated = parseResult.data;

    // Validate relationships ownership
    this.validateAssociationOwnership(studentId, validated);

    const resource = this.resourceRepo.create({
      ...validated,
      user_id: studentId
    });

    return resource;
  }

  /**
   * Retrieves a single study resource by ID with student ownership verification.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student user ID or user object
   * @returns {StudyResource}
   */
  getResourceById(id, requestingUser) {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Valid resource ID is required');
    }

    const resource = this.resourceRepo.findById(id);
    if (!resource) {
      throw new NotFoundError(`Study resource '${id}' not found`);
    }

    this.assertOwnership(resource, requestingUser);

    return resource;
  }

  /**
   * Retrieves paginated and filtered study resources for the authenticated student.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {object} [options={}] - Pagination and filter parameters
   * @returns {{ data: StudyResource[], total: number, page: number, limit: number, totalPages: number }}
   */
  getResources(requestingUser, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const parseResult = studyResourceFilterSchema.safeParse(options);
    const filterOptions = parseResult.success ? parseResult.data : options;

    return this.resourceRepo.findWithPaginationAndFilters(studentId, filterOptions);
  }

  /**
   * Updates an existing study resource with ownership and association checks.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @param {object} updates - Fields to update
   * @returns {StudyResource} Updated resource
   */
  updateResource(id, requestingUser, updates = {}) {
    const studentId = extractUserId(requestingUser);
    const existing = this.getResourceById(id, requestingUser);

    if (!updates || typeof updates !== 'object') {
      throw new ValidationError('Update payload must be a valid object');
    }

    // Validate and normalize update schema
    const parseResult = updateStudyResourceSchema.safeParse(updates);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new ValidationError(`Validation failed: ${details}`);
    }
    const validated = parseResult.data;

    // If updating associations, ensure the targets exist and belong to the student
    const associationsToCheck = {
      course_id: validated.course_id !== undefined ? validated.course_id : existing.course_id,
      assignment_id: validated.assignment_id !== undefined ? validated.assignment_id : existing.assignment_id,
      goal_id: validated.goal_id !== undefined ? validated.goal_id : existing.goal_id,
      study_session_id: validated.study_session_id !== undefined ? validated.study_session_id : existing.study_session_id
    };
    this.validateAssociationOwnership(studentId, associationsToCheck);

    const updated = this.resourceRepo.update(id, studentId, validated);
    return updated;
  }

  /**
   * Deletes a study resource with ownership protection.
   * Does not corrupt or delete any related courses, assignments, goals, or sessions.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @returns {boolean} True if deleted
   */
  deleteResource(id, requestingUser) {
    const studentId = extractUserId(requestingUser);
    this.getResourceById(id, requestingUser); // Throws 404 or 403 if invalid
    return this.resourceRepo.delete(id, studentId);
  }

  /**
   * Toggles the favorite status of a study resource.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @returns {StudyResource} Updated resource
   */
  toggleFavorite(id, requestingUser) {
    const studentId = extractUserId(requestingUser);
    this.getResourceById(id, requestingUser);
    return this.resourceRepo.toggleFavorite(id, studentId);
  }

  /**
   * Archives a study resource.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @returns {StudyResource}
   */
  archiveResource(id, requestingUser) {
    const studentId = extractUserId(requestingUser);
    this.getResourceById(id, requestingUser);
    return this.resourceRepo.archive(id, studentId);
  }

  /**
   * Unarchives a study resource.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @returns {StudyResource}
   */
  unarchiveResource(id, requestingUser) {
    const studentId = extractUserId(requestingUser);
    this.getResourceById(id, requestingUser);
    return this.resourceRepo.unarchive(id, studentId);
  }

  /**
   * Searches study resource metadata (title, description, content, tags, url, file_name)
   * for the authenticated student.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {string} query - Search term
   * @param {object} [options={}] - Additional filters or pagination
   * @returns {{ data: StudyResource[], total: number, page: number, limit: number, totalPages: number }}
   */
  searchResources(requestingUser, query, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const searchTerm = typeof query === 'string' ? query.trim() : '';
    return this.getResources(requestingUser, {
      ...options,
      searchTerm
    });
  }

  /**
   * Retrieves all study resources filtered by resource type.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {string} resourceType - Resource type ('note', 'link', 'reference', 'document', 'other')
   * @param {object} [options={}] - Additional pagination/sorting
   * @returns {{ data: StudyResource[], total: number, page: number, limit: number, totalPages: number }}
   */
  getResourcesByType(requestingUser, resourceType, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const typeParse = resourceTypeEnum.safeParse(resourceType);
    if (!typeParse.success) {
      throw new ValidationError(`Invalid resource type '${resourceType}'. Valid types: ${resourceTypeEnum.options.join(', ')}`);
    }

    return this.getResources(requestingUser, {
      ...options,
      resource_type: typeParse.data
    });
  }

  /**
   * Retrieves all study resources linked to a specific course.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {string} courseId - Course ID
   * @returns {StudyResource[]}
   */
  getResourcesByCourse(requestingUser, courseId) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const course = this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundError(`Course '${courseId}' not found`);
    }
    if (course.user_id !== studentId) {
      throw new ForbiddenError('Cannot access resources for a course belonging to another student');
    }
    return this.resourceRepo.findByCourse(courseId, studentId);
  }

  /**
   * Retrieves all study resources linked to a specific assignment.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {string} assignmentId - Assignment ID
   * @returns {StudyResource[]}
   */
  getResourcesByAssignment(requestingUser, assignmentId) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const assignment = this.asgnRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment '${assignmentId}' not found`);
    }
    if (assignment.user_id !== studentId) {
      throw new ForbiddenError('Cannot access resources for an assignment belonging to another student');
    }
    return this.resourceRepo.findByAssignment(assignmentId, studentId);
  }

  /**
   * Retrieves all study resources linked to a specific goal.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {string} goalId - Goal ID
   * @returns {StudyResource[]}
   */
  getResourcesByGoal(requestingUser, goalId) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal '${goalId}' not found`);
    }
    if (goal.user_id !== studentId) {
      throw new ForbiddenError('Cannot access resources for a goal belonging to another student');
    }
    return this.resourceRepo.findByGoal(goalId, studentId);
  }

  /**
   * Retrieves all study resources linked to a specific study session.
   *
   * @param {string|object} requestingUser - Requesting student
   * @param {string} studySessionId - Study Session ID
   * @returns {StudyResource[]}
   */
  getResourcesByStudySession(requestingUser, studySessionId) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) {
      throw new ValidationError('Valid student user_id is required');
    }

    const session = this.studyRepo.findById(studySessionId);
    if (!session) {
      throw new NotFoundError(`Study session '${studySessionId}' not found`);
    }
    if (session.user_id !== studentId) {
      throw new ForbiddenError('Cannot access resources for a study session belonging to another student');
    }
    return this.resourceRepo.findByStudySession(studySessionId, studentId);
  }

  /**
   * Links a study resource to one or more supported student entities.
   * Rejects invalid or foreign entity relationships.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @param {object} associations - Foreign entity links ({ course_id, assignment_id, goal_id, study_session_id })
   * @returns {StudyResource} Updated study resource
   */
  linkResource(id, requestingUser, associations = {}) {
    const studentId = extractUserId(requestingUser);
    const existing = this.getResourceById(id, requestingUser);

    if (!associations || typeof associations !== 'object' || Object.keys(associations).length === 0) {
      throw new BadRequestError('At least one entity association must be specified to link');
    }

    const normalizedLinks = {
      course_id: associations.course_id !== undefined ? associations.course_id : (associations.courseId !== undefined ? associations.courseId : existing.course_id),
      assignment_id: associations.assignment_id !== undefined ? associations.assignment_id : (associations.assignmentId !== undefined ? associations.assignmentId : existing.assignment_id),
      goal_id: associations.goal_id !== undefined ? associations.goal_id : (associations.goalId !== undefined ? associations.goalId : existing.goal_id),
      study_session_id: associations.study_session_id !== undefined ? associations.study_session_id : (associations.studySessionId !== undefined ? associations.studySessionId : existing.study_session_id)
    };

    this.validateAssociationOwnership(studentId, normalizedLinks);

    return this.resourceRepo.update(id, studentId, normalizedLinks);
  }

  /**
   * Unlinks a study resource from specified student entities by setting foreign keys to NULL.
   * Does not delete or mutate the related entity.
   *
   * @param {string} id - Resource ID
   * @param {string|object} requestingUser - Requesting student
   * @param {string|string[]|object} entityTypes - Entity types to unlink ('course', 'assignment', 'goal', 'study_session', or 'all')
   * @returns {StudyResource} Updated study resource
   */
  unlinkResource(id, requestingUser, entityTypes) {
    const studentId = extractUserId(requestingUser);
    this.getResourceById(id, requestingUser);

    const unlinks = {};

    if (entityTypes === 'all') {
      unlinks.course_id = null;
      unlinks.assignment_id = null;
      unlinks.goal_id = null;
      unlinks.study_session_id = null;
    } else if (Array.isArray(entityTypes)) {
      for (const t of entityTypes) {
        const normalized = String(t).toLowerCase().trim();
        if (normalized === 'course' || normalized === 'course_id') unlinks.course_id = null;
        else if (normalized === 'assignment' || normalized === 'assignment_id') unlinks.assignment_id = null;
        else if (normalized === 'goal' || normalized === 'goal_id') unlinks.goal_id = null;
        else if (normalized === 'study_session' || normalized === 'study_session_id' || normalized === 'session') unlinks.study_session_id = null;
        else throw new BadRequestError(`Unknown entity type to unlink: '${t}'. Supported: course, assignment, goal, study_session, all`);
      }
    } else if (typeof entityTypes === 'string') {
      const normalized = entityTypes.toLowerCase().trim();
      if (normalized === 'course' || normalized === 'course_id') unlinks.course_id = null;
      else if (normalized === 'assignment' || normalized === 'assignment_id') unlinks.assignment_id = null;
      else if (normalized === 'goal' || normalized === 'goal_id') unlinks.goal_id = null;
      else if (normalized === 'study_session' || normalized === 'study_session_id' || normalized === 'session') unlinks.study_session_id = null;
      else throw new BadRequestError(`Unknown entity type to unlink: '${entityTypes}'. Supported: course, assignment, goal, study_session, all`);
    } else if (typeof entityTypes === 'object' && entityTypes !== null) {
      if (entityTypes.course || entityTypes.course_id) unlinks.course_id = null;
      if (entityTypes.assignment || entityTypes.assignment_id) unlinks.assignment_id = null;
      if (entityTypes.goal || entityTypes.goal_id) unlinks.goal_id = null;
      if (entityTypes.study_session || entityTypes.study_session_id || entityTypes.session) unlinks.study_session_id = null;
    } else {
      throw new BadRequestError('Invalid unlink specification: must be entity type string, array, or object');
    }

    if (Object.keys(unlinks).length === 0) {
      throw new BadRequestError('No valid entity types specified to unlink');
    }

    return this.resourceRepo.update(id, studentId, unlinks);
  }

  // --- Dedicated Entity Link / Unlink Helpers ---

  linkToCourse(id, requestingUser, courseId) {
    return this.linkResource(id, requestingUser, { course_id: courseId });
  }

  unlinkFromCourse(id, requestingUser) {
    return this.unlinkResource(id, requestingUser, 'course');
  }

  linkToAssignment(id, requestingUser, assignmentId) {
    return this.linkResource(id, requestingUser, { assignment_id: assignmentId });
  }

  unlinkFromAssignment(id, requestingUser) {
    return this.unlinkResource(id, requestingUser, 'assignment');
  }

  linkToGoal(id, requestingUser, goalId) {
    return this.linkResource(id, requestingUser, { goal_id: goalId });
  }

  unlinkFromGoal(id, requestingUser) {
    return this.unlinkResource(id, requestingUser, 'goal');
  }

  linkToStudySession(id, requestingUser, studySessionId) {
    return this.linkResource(id, requestingUser, { study_session_id: studySessionId });
  }

  unlinkFromStudySession(id, requestingUser) {
    return this.unlinkResource(id, requestingUser, 'study_session');
  }
}

const studyResourceService = new StudyResourceService();

module.exports = {
  StudyResourceService,
  studyResourceService
};
