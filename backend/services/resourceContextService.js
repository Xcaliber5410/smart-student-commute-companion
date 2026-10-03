/**
 * ResourceContextService
 *
 * Provides contextual retrieval of study resources tailored to a student's
 * active academic work (course, assignment, goal, study session, or recent activity).
 *
 * Operates purely on deterministic relational querying based on verified existing database associations.
 * No AI/LLM/vector dependencies.
 *
 * Guarantees:
 * - Strict authenticated student ownership & authorization (401/403/404)
 * - Deterministic relevance sorting & deduplication
 * - Sensible bounds and limits
 * - Zero N+1 / efficient indexed queries
 * - Clean domain decoupling
 */

const { studyResourceRepository } = require('../repositories/StudyResourceRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { assignmentRepository } = require('../repositories/AssignmentRepository');
const { goalRepository } = require('../repositories/GoalRepository');
const { studySessionRepository } = require('../repositories/StudySessionRepository');
const { NotFoundError, ForbiddenError, ValidationError } = require('../errors');

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

class ResourceContextService {
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
   * Helper to deduplicate a list of items and assign contextual relation metadata.
   *
   * @param {Array<{ item: object, relation: string, reason: string }>} taggedCandidates
   * @param {number} [limit=20]
   * @param {string} [resourceTypeFilter]
   * @returns {Array<object>}
   */
  _deduplicateAndFormat(taggedCandidates, limit = 20, resourceTypeFilter = null) {
    const seen = new Map();

    for (const { item, relation, reason } of taggedCandidates) {
      if (!item || !item.id) continue;
      if (item.archived) continue;
      if (resourceTypeFilter && item.resource_type !== resourceTypeFilter) continue;

      if (!seen.has(item.id)) {
        const plain = item.toJSON ? item.toJSON() : { ...item };
        plain.contextRelation = {
          relation,
          reason,
          isDirect: relation === 'direct'
        };
        seen.set(item.id, plain);
      } else {
        // If already seen from secondary association, upgrade to 'direct' if current is direct
        const existing = seen.get(item.id);
        if (relation === 'direct' && existing.contextRelation?.relation !== 'direct') {
          existing.contextRelation = {
            relation: 'direct',
            reason,
            isDirect: true
          };
        }
      }
    }

    const uniqueList = Array.from(seen.values());

    // Deterministic ranking:
    // 1. Direct relations first
    // 2. Favorites next
    // 3. Most recently updated / created
    uniqueList.sort((a, b) => {
      const aDirect = a.contextRelation?.isDirect ? 1 : 0;
      const bDirect = b.contextRelation?.isDirect ? 1 : 0;
      if (aDirect !== bDirect) return bDirect - aDirect;

      const aFav = a.is_favorite ? 1 : 0;
      const bFav = b.is_favorite ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;

      const aTime = a.updated_at || a.created_at || 0;
      const bTime = b.updated_at || b.created_at || 0;
      return bTime - aTime;
    });

    const cappedLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    return uniqueList.slice(0, cappedLimit);
  }

  /**
   * Retrieves contextual study resources for a specific Course.
   *
   * Relationships:
   * - Direct course study resources (`course_id = courseId`)
   * - Associated resources attached to assignments, goals, or study sessions in this course
   *
   * @param {string|object} requestingUser
   * @param {string} courseId
   * @param {object} [options={}]
   * @returns {object}
   */
  getContextForCourse(requestingUser, courseId, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) throw new ValidationError('Valid student user_id is required');
    if (!courseId) throw new ValidationError('courseId is required');

    const course = this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundError(`Course '${courseId}' not found`);
    }
    if (course.user_id !== studentId) {
      throw new ForbiddenError('Cannot retrieve resources for a course belonging to another student');
    }

    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const resourceTypeFilter = options.resourceType || options.resource_type || null;

    // 1. Direct course resources
    const directResources = this.resourceRepo.findByCourse(courseId, studentId)
      .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));

    // 2. Child deliverable associations (assignments, goals, study sessions)
    const associations = this.resourceRepo.findResourcesByCourseAssociations(courseId, studentId, { limit });

    // 3. Tag candidates for deterministic aggregation
    const candidates = [];
    for (const r of directResources) {
      candidates.push({
        item: r,
        relation: 'direct',
        reason: `Direct study material for course ${course.code || course.name}`
      });
    }
    for (const r of associations.assignmentResources) {
      candidates.push({
        item: r,
        relation: 'assignment',
        reason: `Attached to an assignment in course ${course.code || course.name}`
      });
    }
    for (const r of associations.goalResources) {
      candidates.push({
        item: r,
        relation: 'goal',
        reason: `Supporting a goal in course ${course.code || course.name}`
      });
    }
    for (const r of associations.sessionResources) {
      candidates.push({
        item: r,
        relation: 'study_session',
        reason: `Attached to a study session in course ${course.code || course.name}`
      });
    }

    const unifiedResources = this._deduplicateAndFormat(candidates, limit, resourceTypeFilter);

    return {
      contextType: 'course',
      entity: {
        id: course.id,
        name: course.name,
        code: course.code,
        instructor: course.instructor,
        color: course.color
      },
      summary: {
        total: unifiedResources.length,
        directCount: directResources.length,
        assignmentCount: associations.assignmentResources.length,
        goalCount: associations.goalResources.length,
        sessionCount: associations.sessionResources.length
      },
      directResources: directResources.map(r => (r.toJSON ? r.toJSON() : r)),
      relatedResources: {
        assignmentResources: associations.assignmentResources.map(r => (r.toJSON ? r.toJSON() : r)),
        goalResources: associations.goalResources.map(r => (r.toJSON ? r.toJSON() : r)),
        sessionResources: associations.sessionResources.map(r => (r.toJSON ? r.toJSON() : r))
      },
      resources: unifiedResources
    };
  }

  /**
   * Retrieves contextual study resources for an Assignment.
   *
   * Relationships:
   * - Direct assignment study resources (`assignment_id = assignmentId`)
   * - Parent course study resources (`course_id = assignment.course_id`)
   * - Parent goal study resources (`goal_id = assignment.goal_id`)
   *
   * @param {string|object} requestingUser
   * @param {string} assignmentId
   * @param {object} [options={}]
   * @returns {object}
   */
  getContextForAssignment(requestingUser, assignmentId, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) throw new ValidationError('Valid student user_id is required');
    if (!assignmentId) throw new ValidationError('assignmentId is required');

    const assignment = this.asgnRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Assignment '${assignmentId}' not found`);
    }
    if (assignment.user_id !== studentId) {
      throw new ForbiddenError('Cannot retrieve resources for an assignment belonging to another student');
    }

    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const resourceTypeFilter = options.resourceType || options.resource_type || null;

    // 1. Direct assignment resources
    const directResources = this.resourceRepo.findByAssignment(assignmentId, studentId)
      .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));

    // 2. Parent course resources (if linked to a course)
    let courseResources = [];
    let parentCourse = null;
    if (assignment.course_id) {
      parentCourse = this.courseRepo.findById(assignment.course_id);
      courseResources = this.resourceRepo.findByCourse(assignment.course_id, studentId)
        .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));
    }

    // 3. Parent goal resources (if linked to a goal)
    let goalResources = [];
    let parentGoal = null;
    if (assignment.goal_id) {
      parentGoal = this.goalRepo.findById(assignment.goal_id);
      goalResources = this.resourceRepo.findByGoal(assignment.goal_id, studentId)
        .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));
    }

    // Tag and format candidates
    const candidates = [];
    for (const r of directResources) {
      candidates.push({
        item: r,
        relation: 'direct',
        reason: `Linked directly to assignment: ${assignment.title}`
      });
    }
    for (const r of courseResources) {
      candidates.push({
        item: r,
        relation: 'course',
        reason: `Course reference material for ${parentCourse?.name || 'course'}`
      });
    }
    for (const r of goalResources) {
      candidates.push({
        item: r,
        relation: 'goal',
        reason: `Supporting goal: ${parentGoal?.title || 'goal'}`
      });
    }

    const unifiedResources = this._deduplicateAndFormat(candidates, limit, resourceTypeFilter);

    return {
      contextType: 'assignment',
      entity: {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.due_date,
        priority: assignment.priority,
        status: assignment.status,
        courseId: assignment.course_id,
        goalId: assignment.goal_id
      },
      summary: {
        total: unifiedResources.length,
        directCount: directResources.length,
        courseCount: courseResources.length,
        goalCount: goalResources.length
      },
      directResources: directResources.map(r => (r.toJSON ? r.toJSON() : r)),
      courseResources: courseResources.map(r => (r.toJSON ? r.toJSON() : r)),
      goalResources: goalResources.map(r => (r.toJSON ? r.toJSON() : r)),
      resources: unifiedResources
    };
  }

  /**
   * Retrieves contextual study resources for a Goal.
   *
   * Relationships:
   * - Direct goal study resources (`goal_id = goalId`)
   * - Parent course study resources (`course_id = goal.course_id`)
   * - Resources attached to assignments under this goal
   * - Resources attached to study sessions under this goal
   *
   * @param {string|object} requestingUser
   * @param {string} goalId
   * @param {object} [options={}]
   * @returns {object}
   */
  getContextForGoal(requestingUser, goalId, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) throw new ValidationError('Valid student user_id is required');
    if (!goalId) throw new ValidationError('goalId is required');

    const goal = this.goalRepo.findById(goalId);
    if (!goal) {
      throw new NotFoundError(`Goal '${goalId}' not found`);
    }
    if (goal.user_id !== studentId) {
      throw new ForbiddenError('Cannot retrieve resources for a goal belonging to another student');
    }

    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const resourceTypeFilter = options.resourceType || options.resource_type || null;

    // 1. Direct goal resources
    const directResources = this.resourceRepo.findByGoal(goalId, studentId)
      .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));

    // 2. Parent course resources (if linked to a course)
    let courseResources = [];
    let parentCourse = null;
    if (goal.course_id) {
      parentCourse = this.courseRepo.findById(goal.course_id);
      courseResources = this.resourceRepo.findByCourse(goal.course_id, studentId)
        .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));
    }

    // 3. Associated deliverables under this goal
    const associations = this.resourceRepo.findResourcesByGoalAssociations(goalId, studentId, { limit });

    // Tag and format candidates
    const candidates = [];
    for (const r of directResources) {
      candidates.push({
        item: r,
        relation: 'direct',
        reason: `Direct supporting resource for goal: ${goal.title}`
      });
    }
    for (const r of courseResources) {
      candidates.push({
        item: r,
        relation: 'course',
        reason: `Course material for ${parentCourse?.name || 'course'}`
      });
    }
    for (const r of associations.assignmentResources) {
      candidates.push({
        item: r,
        relation: 'assignment',
        reason: `Attached to a deliverable under this goal`
      });
    }
    for (const r of associations.sessionResources) {
      candidates.push({
        item: r,
        relation: 'study_session',
        reason: `Attached to a study session under this goal`
      });
    }

    const unifiedResources = this._deduplicateAndFormat(candidates, limit, resourceTypeFilter);

    return {
      contextType: 'goal',
      entity: {
        id: goal.id,
        title: goal.title,
        targetDate: goal.target_date,
        status: goal.status,
        progress: goal.progress,
        courseId: goal.course_id
      },
      summary: {
        total: unifiedResources.length,
        directCount: directResources.length,
        courseCount: courseResources.length,
        assignmentCount: associations.assignmentResources.length,
        sessionCount: associations.sessionResources.length
      },
      directResources: directResources.map(r => (r.toJSON ? r.toJSON() : r)),
      courseResources: courseResources.map(r => (r.toJSON ? r.toJSON() : r)),
      assignmentResources: associations.assignmentResources.map(r => (r.toJSON ? r.toJSON() : r)),
      sessionResources: associations.sessionResources.map(r => (r.toJSON ? r.toJSON() : r)),
      resources: unifiedResources
    };
  }

  /**
   * Retrieves contextual study resources for a Study Session.
   *
   * Relationships:
   * - Direct study session study resources (`study_session_id = studySessionId`)
   * - Parent course study resources (`course_id = session.course_id`)
   * - Parent goal study resources (`goal_id = session.goal_id`)
   * - Associated assignment study resources (`assignment_id = session.assignment_id`)
   *
   * @param {string|object} requestingUser
   * @param {string} studySessionId
   * @param {object} [options={}]
   * @returns {object}
   */
  getContextForStudySession(requestingUser, studySessionId, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) throw new ValidationError('Valid student user_id is required');
    if (!studySessionId) throw new ValidationError('studySessionId is required');

    const session = this.studyRepo.findById(studySessionId);
    if (!session) {
      throw new NotFoundError(`Study session '${studySessionId}' not found`);
    }
    if (session.user_id !== studentId) {
      throw new ForbiddenError('Cannot retrieve resources for a study session belonging to another student');
    }

    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const resourceTypeFilter = options.resourceType || options.resource_type || null;

    // 1. Direct session resources
    const directResources = this.resourceRepo.findByStudySession(studySessionId, studentId)
      .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));

    // 2. Parent course resources
    let courseResources = [];
    let parentCourse = null;
    if (session.course_id) {
      parentCourse = this.courseRepo.findById(session.course_id);
      courseResources = this.resourceRepo.findByCourse(session.course_id, studentId)
        .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));
    }

    // 3. Parent goal resources
    let goalResources = [];
    let parentGoal = null;
    if (session.goal_id) {
      parentGoal = this.goalRepo.findById(session.goal_id);
      goalResources = this.resourceRepo.findByGoal(session.goal_id, studentId)
        .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));
    }

    // 4. Linked assignment resources
    let assignmentResources = [];
    if (session.assignment_id) {
      assignmentResources = this.resourceRepo.findByAssignment(session.assignment_id, studentId)
        .filter(r => !r.archived && (!resourceTypeFilter || r.resource_type === resourceTypeFilter));
    }

    // Tag and format candidates
    const candidates = [];
    for (const r of directResources) {
      candidates.push({
        item: r,
        relation: 'direct',
        reason: `Linked directly to study session: ${session.title}`
      });
    }
    for (const r of courseResources) {
      candidates.push({
        item: r,
        relation: 'course',
        reason: `Course material for ${parentCourse?.name || 'course'}`
      });
    }
    for (const r of goalResources) {
      candidates.push({
        item: r,
        relation: 'goal',
        reason: `Goal reference material for ${parentGoal?.title || 'goal'}`
      });
    }
    for (const r of assignmentResources) {
      candidates.push({
        item: r,
        relation: 'assignment',
        reason: `Attached to task associated with this study session`
      });
    }

    const unifiedResources = this._deduplicateAndFormat(candidates, limit, resourceTypeFilter);

    return {
      contextType: 'study_session',
      entity: {
        id: session.id,
        title: session.title,
        plannedStartTime: session.planned_start_time,
        plannedDurationMinutes: session.planned_duration_minutes,
        status: session.status,
        courseId: session.course_id,
        goalId: session.goal_id
      },
      summary: {
        total: unifiedResources.length,
        directCount: directResources.length,
        courseCount: courseResources.length,
        goalCount: goalResources.length,
        assignmentCount: assignmentResources.length
      },
      directResources: directResources.map(r => (r.toJSON ? r.toJSON() : r)),
      courseResources: courseResources.map(r => (r.toJSON ? r.toJSON() : r)),
      goalResources: goalResources.map(r => (r.toJSON ? r.toJSON() : r)),
      assignmentResources: assignmentResources.map(r => (r.toJSON ? r.toJSON() : r)),
      resources: unifiedResources
    };
  }

  /**
   * Retrieves active, favorite, and recently modified study resources for a student's current workload.
   *
   * @param {string|object} requestingUser
   * @param {object} [options={}]
   * @returns {object}
   */
  getRecentAndActiveContext(requestingUser, options = {}) {
    const studentId = extractUserId(requestingUser);
    if (!studentId) throw new ValidationError('Valid student user_id is required');

    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const resourceTypeFilter = options.resourceType || options.resource_type || null;

    // 1. Favorite resources
    const favorites = this.resourceRepo.findByUserId(studentId, {
      is_favorite: 1,
      archived: 0,
      resourceType: resourceTypeFilter,
      limit
    });

    // 2. Recently updated resources
    const recentlyUpdated = this.resourceRepo.findByUserId(studentId, {
      archived: 0,
      resourceType: resourceTypeFilter,
      sort: 'updated_at',
      order: 'desc',
      limit
    });

    // 3. Resources tied to active academic work (pending/urgent tasks, active goals)
    const activeWorkResources = this.resourceRepo.findActiveWorkResources(studentId, { limit })
      .filter(r => !resourceTypeFilter || r.resource_type === resourceTypeFilter);

    // Tag and format candidates
    const candidates = [];
    for (const r of favorites) {
      candidates.push({
        item: r,
        relation: 'favorite',
        reason: 'Starred by student as favorite'
      });
    }
    for (const r of activeWorkResources) {
      candidates.push({
        item: r,
        relation: 'active_work',
        reason: 'Linked to active/pending deliverable or goal'
      });
    }
    for (const r of recentlyUpdated) {
      candidates.push({
        item: r,
        relation: 'recent',
        reason: 'Recently updated or created'
      });
    }

    const unifiedResources = this._deduplicateAndFormat(candidates, limit, resourceTypeFilter);

    return {
      contextType: 'recent_and_active',
      summary: {
        total: unifiedResources.length,
        favoritesCount: favorites.length,
        recentCount: recentlyUpdated.length,
        activeWorkCount: activeWorkResources.length
      },
      favorites: favorites.map(r => (r.toJSON ? r.toJSON() : r)),
      recentlyUpdated: recentlyUpdated.map(r => (r.toJSON ? r.toJSON() : r)),
      activeWorkResources: activeWorkResources.map(r => (r.toJSON ? r.toJSON() : r)),
      resources: unifiedResources
    };
  }

  /**
   * Central entry point to retrieve contextual study resources based on query parameters.
   *
   * Dispatches to:
   * - `getContextForAssignment` if `assignmentId` is provided
   * - `getContextForStudySession` if `studySessionId` is provided
   * - `getContextForGoal` if `goalId` is provided
   * - `getContextForCourse` if `courseId` is provided
   * - `getRecentAndActiveContext` if `recent=true` or no entity ID is specified
   *
   * @param {string|object} requestingUser
   * @param {object} [query={}]
   * @returns {object}
   */
  getContextualResources(requestingUser, query = {}) {
    const courseId = query.courseId || query.course_id;
    const assignmentId = query.assignmentId || query.assignment_id;
    const goalId = query.goalId || query.goal_id;
    const studySessionId = query.studySessionId || query.study_session_id;

    if (assignmentId) {
      return this.getContextForAssignment(requestingUser, assignmentId, query);
    }
    if (studySessionId) {
      return this.getContextForStudySession(requestingUser, studySessionId, query);
    }
    if (goalId) {
      return this.getContextForGoal(requestingUser, goalId, query);
    }
    if (courseId) {
      return this.getContextForCourse(requestingUser, courseId, query);
    }

    // Default to active and recent workload context
    return this.getRecentAndActiveContext(requestingUser, query);
  }
}

const resourceContextService = new ResourceContextService();

module.exports = {
  ResourceContextService,
  resourceContextService
};
