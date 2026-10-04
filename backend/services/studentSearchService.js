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
const { StudentSearchResult } = require('../models/StudentSearchResult');
const { ForbiddenError, UnauthorizedError, BadRequestError } = require('../errors');
const { searchAnalyticsService } = require('./searchAnalyticsService');

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
  reminders: 'reminder',

  study_resource: 'study_resource',
  study_resources: 'study_resource',
  resource: 'study_resource',
  resources: 'study_resource',
  material: 'study_resource',
  materials: 'study_resource',
  note: 'study_resource',
  notes: 'study_resource'
};

const ALL_SEARCHABLE_TYPES = [
  'course',
  'assignment',
  'calendar_event',
  'study_session',
  'goal',
  'study_resource',
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
    userRepo = userRepository,
    analyticsSvc = null
  ) {
    this.searchRepo = searchRepo;
    this.courseRepo = courseRepo;
    this.userRepo = userRepo;
    this._analyticsSvc = analyticsSvc;
  }

  get analyticsSvc() {
    if (!this._analyticsSvc) {
      const { searchAnalyticsService } = require('./searchAnalyticsService');
      this._analyticsSvc = searchAnalyticsService;
    }
    return this._analyticsSvc;
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
    const startTime = performance.now();
    let resolvedTypesForTelemetry = [];

    try {
      this.assertOwnership(studentUserId, requestingUser);

      const rawQuery = options.query !== undefined ? options.query : options.q;
      const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
      const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
      const offset = Math.max(0, Number(options.offset) || 0);
      const resolvedTypes = this.resolveTypes(options.types || options.type);
      resolvedTypesForTelemetry = resolvedTypes;
      const courseId = options.courseId || options.course_id || null;
      const status = options.status || null;

      // Build zero-state counts map
      const countsByType = {};
      for (const t of ALL_SEARCHABLE_TYPES) {
        countsByType[t] = 0;
      }

      // 1. Empty or whitespace query: Return clean empty search payload with zero database calls
      if (!query) {
        const durationMs = performance.now() - startTime;
        this.analyticsSvc.recordSearchExecution({
          studentUserId,
          types: resolvedTypes,
          durationMs,
          resultCount: 0,
          options,
          success: true
        });

        return {
          query: '',
          total: 0,
          limit,
          offset,
          types: resolvedTypes,
          results: [],
          countsByType,
          executionDurationMs: Math.round(durationMs * 100) / 100,
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
        allCandidates.push(StudentSearchResult.fromCourse(row, courseMap));
      }
    }

    if (resolvedTypes.includes('assignment')) {
      const asgnRows = this.searchRepo.searchAssignments(studentUserId, query, queryOptions);
      for (const row of asgnRows) {
        allCandidates.push(StudentSearchResult.fromAssignment(row, courseMap));
      }
    }

    if (resolvedTypes.includes('calendar_event')) {
      const eventRows = this.searchRepo.searchCalendarEvents(studentUserId, query, queryOptions);
      for (const row of eventRows) {
        allCandidates.push(StudentSearchResult.fromCalendarEvent(row, courseMap));
      }
    }

    if (resolvedTypes.includes('study_session')) {
      const studyRows = this.searchRepo.searchStudySessions(studentUserId, query, queryOptions);
      for (const row of studyRows) {
        allCandidates.push(StudentSearchResult.fromStudySession(row, courseMap));
      }
    }

    if (resolvedTypes.includes('goal')) {
      const goalRows = this.searchRepo.searchGoals(studentUserId, query, queryOptions);
      for (const row of goalRows) {
        allCandidates.push(StudentSearchResult.fromGoal(row, courseMap));
      }
    }

    if (resolvedTypes.includes('saved_route')) {
      const routeRows = this.searchRepo.searchSavedRoutes(studentUserId, query, queryOptions);
      for (const row of routeRows) {
        allCandidates.push(StudentSearchResult.fromSavedRoute(row));
      }
    }

    if (resolvedTypes.includes('schedule')) {
      const schedRows = this.searchRepo.searchSchedules(studentUserId, query, queryOptions);
      for (const row of schedRows) {
        allCandidates.push(StudentSearchResult.fromSchedule(row));
      }
    }

    if (resolvedTypes.includes('notification')) {
      const notifRows = this.searchRepo.searchNotifications(studentUserId, query, queryOptions);
      for (const row of notifRows) {
        allCandidates.push(StudentSearchResult.fromNotification(row));
      }
    }

    if (resolvedTypes.includes('reminder')) {
      const reminderRows = this.searchRepo.searchReminders(studentUserId, query, queryOptions);
      for (const row of reminderRows) {
        allCandidates.push(StudentSearchResult.fromReminder(row));
      }
    }

    if (resolvedTypes.includes('study_resource')) {
      const resourceRows = this.searchRepo.searchStudyResources(studentUserId, query, queryOptions);
      for (const row of resourceRows) {
        allCandidates.push(StudentSearchResult.fromStudyResource(row, courseMap));
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

    const durationMs = performance.now() - startTime;
    this.analyticsSvc.recordSearchExecution({
      studentUserId,
      types: resolvedTypes,
      durationMs,
      resultCount: total,
      options,
      success: true
    });

    return {
      query,
      total,
      limit,
      offset,
      types: resolvedTypes,
      results: paginatedResults,
      countsByType,
      executionDurationMs: Math.round(durationMs * 100) / 100,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + paginatedResults.length < total
      }
    };
  } catch (err) {
    const durationMs = performance.now() - startTime;
    if (err instanceof BadRequestError) {
      this.analyticsSvc.recordValidationFailure({
        studentUserId,
        endpoint: '/api/student/search',
        reason: err.message,
        details: err.details
      });
    }
    this.analyticsSvc.recordSearchExecution({
      studentUserId,
      types: resolvedTypesForTelemetry,
      durationMs,
      resultCount: 0,
      options,
      success: false,
      errorCode: err.code || err.name || 'SEARCH_ERROR'
    });
    throw err;
  }
}

  /**
   * Retrieves aggregated operational search telemetry and usage statistics.
   *
   * @returns {object}
   */
  getAnalyticsSummary() {
    return this.analyticsSvc.getAnalyticsSummary();
  }

  /**
   * Search student entities returning rich StudentSearchResult instances.
   * Useful helper for backend service integration (Context, Insights, Planner).
   *
   * @param {string} studentUserId
   * @param {object} requestingUser
   * @param {object} [options={}]
   * @returns {Array<StudentSearchResult>}
   */
  searchEntities(studentUserId, requestingUser, options = {}) {
    const response = this.search(studentUserId, requestingUser, options);
    return response.results;
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
  searchAnalyticsService,
  StudentSearchResult,
  ALL_SEARCHABLE_TYPES,
  CANONICAL_ENTITY_TYPES,
  calculateRelevance,
  calculateRelevanceScore,
  compareRankedItems,
  rankSearchResults,
  RANKING_WEIGHTS
};
