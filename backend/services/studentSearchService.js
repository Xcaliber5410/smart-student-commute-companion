/**
 * StudentSearchService
 *
 * Provides a unified, deterministic search foundation across student academic,
 * planning, goal, transit, and notification entities.
 *
 * Design Pillars:
 * 1. Strict Authenticated Student Scoping: All database queries enforce user_id isolation.
 * 2. Normalized Request & Response Contract: Uniform output across disparate domain entities.
 * 3. Zero N+1 Queries: Pre-fetches student courses in a single pass for O(1) enrichment.
 * 4. Deterministic Relevance Scoring: Rule-based ranking without AI hallucination or latency.
 * 5. Safe & Validated Queries: Parameterized SQLite queries with boundary protection.
 */

const { studentSearchRepository } = require('../repositories/StudentSearchRepository');
const { courseRepository } = require('../repositories/CourseRepository');
const { userRepository } = require('../repositories/UserRepository');
const { ForbiddenError, UnauthorizedError, BadRequestError } = require('../errors');

const CANONICAL_ENTITY_TYPES = {
  course: 'course',
  courses: 'course',
  subject: 'course',
  subjects: 'course',

  assignment: 'assignment',
  assignments: 'assignment',
  task: 'assignment',
  tasks: 'assignment',

  calendar_event: 'calendar_event',
  calendar_events: 'calendar_event',
  calendar: 'calendar_event',
  event: 'calendar_event',
  events: 'calendar_event',

  study_session: 'study_session',
  study_sessions: 'study_session',
  session: 'study_session',
  sessions: 'study_session',
  study: 'study_session',

  goal: 'goal',
  goals: 'goal',

  saved_route: 'saved_route',
  saved_routes: 'saved_route',
  route: 'saved_route',
  routes: 'saved_route',

  schedule: 'schedule',
  schedules: 'schedule',
  commute_schedule: 'schedule',
  commute_schedules: 'schedule',

  notification: 'notification',
  notifications: 'notification',

  reminder: 'reminder',
  reminders: 'reminder'
};

const ALL_SEARCHABLE_TYPES = [
  'course',
  'assignment',
  'calendar_event',
  'study_session',
  'goal',
  'saved_route',
  'schedule',
  'notification',
  'reminder'
];

const {
  RANKING_WEIGHTS,
  calculateRelevanceScore,
  compareRankedItems,
  compileQueryPatterns,
  rankSearchResults
} = require('./searchRanker');

const calculateRelevance = calculateRelevanceScore;

class StudentSearchService {
  constructor(
    searchRepo = studentSearchRepository,
    courseRepo = courseRepository,
    userRepo = userRepository
  ) {
    this.searchRepo = searchRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
  }

  /**
   * Asserts that the requesting user owns the student resource or is an administrator.
   *
   * @param {string} studentUserId - Target student user ID
   * @param {object} requestingUser - Authenticated user JWT payload
   * @returns {boolean}
   */
  assertOwnership(studentUserId, requestingUser) {
    if (!requestingUser) {
      throw new UnauthorizedError('Authentication required to perform student search');
    }
    if (requestingUser.role === 'admin' || requestingUser.id === studentUserId) {
      return true;
    }
    throw new ForbiddenError('Access forbidden: you do not have permission to access this student search');
  }

  /**
   * Resolves and validates requested entity types.
   *
   * @param {string|string[]} [types] - Raw requested types
   * @returns {string[]} Canonical entity types to search
   */
  resolveTypes(types) {
    if (!types) {
      return [...ALL_SEARCHABLE_TYPES];
    }

    let typeArray = [];
    if (typeof types === 'string') {
      typeArray = types.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    } else if (Array.isArray(types)) {
      typeArray = types.map(t => String(t).trim().toLowerCase()).filter(Boolean);
    }

    if (typeArray.length === 0) {
      return [...ALL_SEARCHABLE_TYPES];
    }

    const resolved = new Set();
    for (const rawType of typeArray) {
      const canonical = CANONICAL_ENTITY_TYPES[rawType];
      if (!canonical) {
        throw new BadRequestError(`Invalid search entity type '${rawType}'. Supported types: ${ALL_SEARCHABLE_TYPES.join(', ')}`);
      }
      resolved.add(canonical);
    }

    return Array.from(resolved);
  }

  /**
   * Unified search across all relevant student domain entities.
   *
   * @param {string} studentUserId - Target student user ID
   * @param {object} requestingUser - Authenticated user object
   * @param {object} [options={}] - Search parameters
   * @param {string} [options.query] - Search query text
   * @param {string} [options.q] - Alias for query
   * @param {string|string[]} [options.types] - Specific entity types to search
   * @param {string} [options.type] - Single entity type alias
   * @param {number} [options.limit=20] - Maximum total results to return
   * @param {number} [options.offset=0] - Result offset
   * @param {string} [options.courseId] - Course scope filter
   * @param {string} [options.status] - Common status filter
   * @returns {object} Normalized search response payload
   */
  search(studentUserId, requestingUser, options = {}) {
    this.assertOwnership(studentUserId, requestingUser);

    const rawQuery = options.query !== undefined ? options.query : options.q;
    const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = Math.max(0, Number(options.offset) || 0);
    const resolvedTypes = this.resolveTypes(options.types || options.type);
    const courseId = options.courseId || options.course_id || null;
    const status = options.status || null;

    // Build zero-state counts map
    const countsByType = {};
    for (const t of ALL_SEARCHABLE_TYPES) {
      countsByType[t] = 0;
    }

    // 1. Empty or whitespace query: Return clean empty search payload with zero database calls
    if (!query) {
      return {
        query: '',
        total: 0,
        limit,
        offset,
        types: resolvedTypes,
        results: [],
        countsByType,
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false
        }
      };
    }

    if (query.length > 200) {
      throw new BadRequestError('Search query cannot exceed 200 characters');
    }

    const queryLower = query.toLowerCase();

    // 2. Pre-fetch student courses in a single pass for O(1) enrichment (Zero N+1 queries)
    const rawCourses = this.courseRepo.findByUserId(studentUserId);
    const courseMap = new Map(
      rawCourses.map(c => [
        c.id,
        {
          id: c.id,
          name: c.name,
          code: c.code || null,
          color: c.color || '#4F46E5'
        }
      ])
    );

    const allCandidates = [];
    const queryOptions = {
      limit: Math.min(50, limit * 2), // fetch sufficient candidate pool
      courseId,
      status
    };

    // 3. Search selected entity repositories
    if (resolvedTypes.includes('course')) {
      const courseRows = this.searchRepo.searchCourses(studentUserId, query, queryOptions);
      for (const row of courseRows) {
        allCandidates.push({
          id: row.id,
          type: 'course',
          title: row.name,
          subtitle: [row.code, row.instructor].filter(Boolean).join(' • ') || 'Academic Course',
          description: row.instructor ? `Instructor: ${row.instructor}` : null,
          status: row.archived ? 'archived' : 'active',
          url: `/academic/courses/${row.id}`,
          course: null,
          metadata: {
            code: row.code || null,
            instructor: row.instructor || null,
            credits: row.credits,
            color: row.color,
            archived: !!row.archived
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (resolvedTypes.includes('assignment')) {
      const asgnRows = this.searchRepo.searchAssignments(studentUserId, query, queryOptions);
      for (const row of asgnRows) {
        const enrichedCourse = courseMap.get(row.course_id) || null;
        allCandidates.push({
          id: row.id,
          type: 'assignment',
          title: row.title,
          subtitle: [enrichedCourse?.name, row.priority ? `Priority: ${row.priority}` : null, row.status].filter(Boolean).join(' • '),
          description: row.description || null,
          status: row.status,
          url: `/academic/assignments/${row.id}`,
          course: enrichedCourse,
          metadata: {
            dueDate: row.due_date,
            priority: row.priority,
            status: row.status,
            courseId: row.course_id || null,
            goalId: row.goal_id || null,
            completedAt: row.completed_at || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (resolvedTypes.includes('calendar_event')) {
      const eventRows = this.searchRepo.searchCalendarEvents(studentUserId, query, queryOptions);
      for (const row of eventRows) {
        const enrichedCourse = courseMap.get(row.course_id) || null;
        allCandidates.push({
          id: row.id,
          type: 'calendar_event',
          title: row.title,
          subtitle: [row.event_type, row.location, enrichedCourse?.name].filter(Boolean).join(' • '),
          description: row.description || null,
          status: row.status,
          url: `/calendar/events/${row.id}`,
          course: enrichedCourse,
          metadata: {
            startTime: row.start_time,
            endTime: row.end_time,
            location: row.location || null,
            eventType: row.event_type,
            status: row.status,
            courseId: row.course_id || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (resolvedTypes.includes('study_session')) {
      const studyRows = this.searchRepo.searchStudySessions(studentUserId, query, queryOptions);
      for (const row of studyRows) {
        const enrichedCourse = courseMap.get(row.course_id) || null;
        allCandidates.push({
          id: row.id,
          type: 'study_session',
          title: row.title,
          subtitle: [enrichedCourse?.name, `${row.planned_duration_minutes} min`, row.status].filter(Boolean).join(' • '),
          description: row.notes || null,
          status: row.status,
          url: `/calendar/study-sessions/${row.id}`,
          course: enrichedCourse,
          metadata: {
            plannedStartTime: row.planned_start_time,
            plannedDurationMinutes: row.planned_duration_minutes,
            actualDurationMinutes: row.actual_duration_minutes || null,
            status: row.status,
            courseId: row.course_id || null,
            goalId: row.goal_id || null,
            completedAt: row.completed_at || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (resolvedTypes.includes('goal')) {
      const goalRows = this.searchRepo.searchGoals(studentUserId, query, queryOptions);
      for (const row of goalRows) {
        const enrichedCourse = courseMap.get(row.course_id) || null;
        allCandidates.push({
          id: row.id,
          type: 'goal',
          title: row.title,
          subtitle: [`${row.progress}% complete`, row.status, enrichedCourse?.name].filter(Boolean).join(' • '),
          description: row.description || null,
          status: row.status,
          url: `/academic/goals/${row.id}`,
          course: enrichedCourse,
          metadata: {
            progress: row.progress,
            targetDate: row.target_date || null,
            status: row.status,
            targetValue: row.target_value || null,
            currentValue: row.current_value || 0,
            unit: row.unit || null,
            courseId: row.course_id || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (resolvedTypes.includes('saved_route')) {
      const routeRows = this.searchRepo.searchSavedRoutes(studentUserId, query, queryOptions);
      for (const row of routeRows) {
        allCandidates.push({
          id: row.id,
          type: 'saved_route',
          title: row.name,
          subtitle: `${row.origin} → ${row.destination}`,
          description: row.tags ? `Tags: ${row.tags}` : null,
          status: 'saved',
          url: `/student/saved-routes/${row.id}`,
          course: null,
          metadata: {
            origin: row.origin,
            destination: row.destination,
            preferredMode: row.preferred_mode || null,
            maxBudget: row.max_budget || null,
            tags: row.tags || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: null
        });
      }
    }

    if (resolvedTypes.includes('schedule')) {
      const schedRows = this.searchRepo.searchSchedules(studentUserId, query, queryOptions);
      for (const row of schedRows) {
        allCandidates.push({
          id: row.id,
          type: 'schedule',
          title: row.title,
          subtitle: `${row.origin} → ${row.destination} • Arrival: ${row.target_arrival_time}`,
          description: row.days_of_week ? `Days: ${row.days_of_week}` : null,
          status: row.active ? 'active' : 'inactive',
          url: `/student/schedules/${row.id}`,
          course: null,
          metadata: {
            origin: row.origin,
            destination: row.destination,
            targetArrivalTime: row.target_arrival_time,
            daysOfWeek: row.days_of_week,
            reminderEnabled: !!row.reminder_enabled,
            active: !!row.active
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    if (resolvedTypes.includes('notification')) {
      const notifRows = this.searchRepo.searchNotifications(studentUserId, query, queryOptions);
      for (const row of notifRows) {
        allCandidates.push({
          id: row.id,
          type: 'notification',
          title: row.title,
          subtitle: [row.type, row.read ? 'Read' : 'Unread'].join(' • '),
          description: row.message || null,
          status: row.read ? 'read' : 'unread',
          url: `/notifications/${row.id}`,
          course: null,
          metadata: {
            type: row.type,
            priority: row.priority,
            read: !!row.read,
            relatedResourceType: row.related_resource_type || null,
            relatedResourceId: row.related_resource_id || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: null
        });
      }
    }

    if (resolvedTypes.includes('reminder')) {
      const reminderRows = this.searchRepo.searchReminders(studentUserId, query, queryOptions);
      for (const row of reminderRows) {
        allCandidates.push({
          id: row.id,
          type: 'reminder',
          title: row.title,
          subtitle: [row.reminder_type, row.status].join(' • '),
          description: row.message || null,
          status: row.status,
          url: `/reminders/${row.id}`,
          course: null,
          metadata: {
            scheduledTime: row.scheduled_time,
            reminderType: row.reminder_type,
            status: row.status,
            relatedResourceType: row.related_resource_type || null,
            relatedResourceId: row.related_resource_id || null
          },
          relevanceScore: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    }

    // 4. Compute deterministic relevance scores and count by type
    const queryPatterns = compileQueryPatterns(query);
    for (const item of allCandidates) {
      item.relevanceScore = calculateRelevanceScore(item, query, queryPatterns);
      if (countsByType[item.type] !== undefined) {
        countsByType[item.type] += 1;
      }
    }

    // 5. Deterministic sorting: 5-tier comparator (score -> recency -> title -> type -> id)
    allCandidates.sort(compareRankedItems);

    const total = allCandidates.length;
    const paginatedResults = allCandidates.slice(offset, offset + limit);

    return {
      query,
      total,
      limit,
      offset,
      types: resolvedTypes,
      results: paginatedResults,
      countsByType,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + paginatedResults.length < total
      }
    };
  }

  /**
   * Returns list of all searchable entity types and supported aliases.
   */
  getSupportedTypes() {
    return {
      types: [...ALL_SEARCHABLE_TYPES],
      aliases: { ...CANONICAL_ENTITY_TYPES }
    };
  }
}

const studentSearchService = new StudentSearchService();

module.exports = {
  StudentSearchService,
  studentSearchService,
  ALL_SEARCHABLE_TYPES,
  CANONICAL_ENTITY_TYPES,
  calculateRelevance,
  calculateRelevanceScore,
  compareRankedItems,
  rankSearchResults,
  RANKING_WEIGHTS
};
