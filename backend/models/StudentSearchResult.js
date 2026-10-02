/**
 * StudentSearchResult Domain Model / Value Object
 *
 * Provides a clean, normalized internal representation of cross-domain search results.
 * Decouples backend consumers (Context, Insights, Dashboard, AI Planner) from underlying
 * database tables while maintaining rich metadata, student relationship attribution,
 * actionable status indicators, and deadlines.
 */

const { z } = require('zod');

const searchResultTypeEnum = z.enum([
  'course',
  'assignment',
  'calendar_event',
  'study_session',
  'goal',
  'saved_route',
  'schedule',
  'notification',
  'reminder'
]);

const searchDomainEnum = z.enum(['academic', 'planning', 'commute', 'alerts']);
const studentRelationshipEnum = z.enum([
  'owner',
  'enrolled',
  'assignee',
  'attendee',
  'participant',
  'commuter',
  'recipient'
]);

const studentSearchResultSchema = z.object({
  id: z.string().min(1, 'Entity ID is required'),
  type: searchResultTypeEnum,
  title: z.string().min(1, 'Title is required'),
  name: z.string().optional(),
  subtitle: z.string().nullable().optional().default(''),
  snippet: z.string().nullable().optional().default(''),
  description: z.string().nullable().optional().default(''),
  status: z.string().default('active'),
  url: z.string().nullable().optional().default(null),
  course: z.any().nullable().optional().default(null),
  date: z.number().nullable().optional().default(null),
  deadline: z.number().nullable().optional().default(null),
  relationship: studentRelationshipEnum.default('owner'),
  domain: searchDomainEnum.default('academic'),
  relevanceScore: z.number().default(0),
  metadata: z.record(z.any()).default({}),
  createdAt: z.number().nullable().optional().default(null),
  updatedAt: z.number().nullable().optional().default(null)
});

class StudentSearchResult {
  constructor(data) {
    const validated = studentSearchResultSchema.parse({
      ...data,
      name: data.name || data.title
    });
    Object.assign(this, validated);
  }

  /**
   * Indicates whether the item represents an actionable / active student deliverable.
   *
   * @returns {boolean}
   */
  isActionable() {
    return ['pending', 'planned', 'in_progress', 'scheduled', 'unread', 'active', 'saved'].includes(this.status);
  }

  /**
   * Indicates whether the item has an overdue deadline relative to a timestamp.
   *
   * @param {number} [asOf=Date.now()]
   * @returns {boolean}
   */
  isOverdue(asOf = Date.now()) {
    if (!this.deadline) return false;
    if (['completed', 'cancelled', 'archived', 'graded'].includes(this.status)) return false;
    return this.deadline < asOf;
  }

  /**
   * Indicates whether the item belongs to the student academic domain.
   *
   * @returns {boolean}
   */
  isAcademic() {
    return this.domain === 'academic' || ['course', 'assignment', 'goal', 'study_session'].includes(this.type);
  }

  /**
   * Serializes the search result to a safe, standardized JSON representation.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      name: this.name || this.title,
      subtitle: this.subtitle || '',
      snippet: this.snippet || '',
      description: this.description || null,
      status: this.status,
      url: this.url || null,
      course: this.course || null,
      date: this.date,
      deadline: this.deadline,
      relationship: this.relationship,
      domain: this.domain,
      relevanceScore: this.relevanceScore,
      metadata: this.metadata || {},
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSafeObject() {
    return this.toJSON();
  }

  // -----------------------------------------------------------------
  // Entity-Specific Domain Factories
  // -----------------------------------------------------------------

  static fromCourse(row, courseMap = null) {
    if (!row) return null;
    const sub = [row.code, row.instructor].filter(Boolean).join(' • ') || 'Academic Course';
    return new StudentSearchResult({
      id: row.id,
      type: 'course',
      title: row.name,
      name: row.name,
      subtitle: sub,
      snippet: row.instructor ? `Instructor: ${row.instructor}` : (row.code || 'Academic Course'),
      description: row.instructor ? `Instructor: ${row.instructor}` : null,
      status: row.archived ? 'archived' : 'active',
      url: `/academic/courses/${row.id}`,
      course: null,
      date: null,
      deadline: null,
      relationship: 'enrolled',
      domain: 'academic',
      relevanceScore: 0,
      metadata: {
        code: row.code || null,
        instructor: row.instructor || null,
        color: row.color,
        credits: row.credits,
        archived: Boolean(row.archived)
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  static fromAssignment(row, courseMap = null) {
    if (!row) return null;
    const course = courseMap && row.course_id ? courseMap.get(row.course_id) : null;
    const dueDate = typeof row.due_date === 'number' ? row.due_date : null;
    const sub = [course?.name, row.priority ? `Priority: ${row.priority}` : null, row.status].filter(Boolean).join(' • ');
    return new StudentSearchResult({
      id: row.id,
      type: 'assignment',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: row.description || '',
      description: row.description || null,
      status: row.status || 'pending',
      url: `/academic/assignments/${row.id}`,
      course,
      date: dueDate,
      deadline: dueDate,
      relationship: 'assignee',
      domain: 'academic',
      relevanceScore: 0,
      metadata: {
        dueDate,
        priority: row.priority || 'medium',
        courseId: row.course_id || null,
        goalId: row.goal_id || null,
        courseCode: course ? course.code : null,
        course: course || null,
        completedAt: row.completed_at || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  static fromCalendarEvent(row, courseMap = null) {
    if (!row) return null;
    const course = courseMap && row.course_id ? courseMap.get(row.course_id) : null;
    const startTime = typeof row.start_time === 'number' ? row.start_time : null;
    const sub = [row.event_type, row.location, course?.name].filter(Boolean).join(' • ');
    return new StudentSearchResult({
      id: row.id,
      type: 'calendar_event',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: row.description || '',
      description: row.description || null,
      status: row.status || 'scheduled',
      url: `/calendar/events/${row.id}`,
      course,
      date: startTime,
      deadline: null,
      relationship: 'attendee',
      domain: 'planning',
      relevanceScore: 0,
      metadata: {
        startTime,
        endTime: row.end_time || null,
        location: row.location || null,
        eventType: row.event_type || 'custom',
        isAcademic: Boolean(row.is_academic),
        courseId: row.course_id || null,
        course: course || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  static fromStudySession(row, courseMap = null) {
    if (!row) return null;
    const course = courseMap && row.course_id ? courseMap.get(row.course_id) : null;
    const startTime = typeof row.planned_start_time === 'number' ? row.planned_start_time : null;
    const sub = [course?.name, `${row.planned_duration_minutes} min`, row.status].filter(Boolean).join(' • ');
    return new StudentSearchResult({
      id: row.id,
      type: 'study_session',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: row.notes || '',
      description: row.notes || null,
      status: row.status || 'planned',
      url: `/calendar/study-sessions/${row.id}`,
      course,
      date: startTime,
      deadline: null,
      relationship: 'participant',
      domain: 'planning',
      relevanceScore: 0,
      metadata: {
        plannedStartTime: startTime,
        plannedDurationMinutes: row.planned_duration_minutes,
        actualDurationMinutes: row.actual_duration_minutes || null,
        goalId: row.goal_id || null,
        courseId: row.course_id || null,
        course: course || null,
        completedAt: row.completed_at || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  static fromGoal(row, courseMap = null) {
    if (!row) return null;
    const course = courseMap && row.course_id ? courseMap.get(row.course_id) : null;
    let targetTimestamp = null;
    if (typeof row.target_date === 'number') {
      targetTimestamp = row.target_date;
    } else if (typeof row.target_date === 'string') {
      const parsed = Date.parse(row.target_date);
      if (!Number.isNaN(parsed)) targetTimestamp = parsed;
    }
    const sub = [`${row.progress || 0}% complete`, row.status, course?.name].filter(Boolean).join(' • ');
    return new StudentSearchResult({
      id: row.id,
      type: 'goal',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: row.description || '',
      description: row.description || null,
      status: row.status || 'in_progress',
      url: `/academic/goals/${row.id}`,
      course,
      date: targetTimestamp,
      deadline: targetTimestamp,
      relationship: 'owner',
      domain: 'academic',
      relevanceScore: 0,
      metadata: {
        progress: row.progress || 0,
        targetDate: row.target_date || null,
        targetValue: row.target_value || null,
        currentValue: row.current_value || 0,
        unit: row.unit || null,
        courseId: row.course_id || null,
        course: course || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  static fromSavedRoute(row) {
    if (!row) return null;
    let tagsList = [];
    if (typeof row.tags === 'string' && row.tags.trim()) {
      tagsList = row.tags.split(',').map(t => t.trim()).filter(Boolean);
    } else if (Array.isArray(row.tags)) {
      tagsList = row.tags;
    }
    const sub = `${row.origin} → ${row.destination} • ${row.preferred_mode || 'balanced'}`;
    return new StudentSearchResult({
      id: row.id,
      type: 'saved_route',
      title: row.name,
      name: row.name,
      subtitle: sub,
      snippet: row.summary || (tagsList.length > 0 ? `Tags: ${tagsList.join(', ')}` : ''),
      description: row.summary || (row.tags ? `Tags: ${row.tags}` : null),
      status: 'saved',
      url: `/student/saved-routes/${row.id}`,
      course: null,
      date: row.created_at || null,
      deadline: null,
      relationship: 'owner',
      domain: 'commute',
      relevanceScore: 0,
      metadata: {
        origin: row.origin,
        destination: row.destination,
        preferredMode: row.preferred_mode,
        maxBudget: row.max_budget,
        tags: tagsList
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    });
  }

  static fromSchedule(row) {
    if (!row) return null;
    let daysList = [];
    if (typeof row.days_of_week === 'string' && row.days_of_week.trim()) {
      try {
        const parsed = JSON.parse(row.days_of_week);
        daysList = Array.isArray(parsed) ? parsed : [row.days_of_week];
      } catch {
        daysList = row.days_of_week.split(',').map(d => d.trim()).filter(Boolean);
      }
    } else if (Array.isArray(row.days_of_week)) {
      daysList = row.days_of_week;
    }
    const sub = `${row.origin} → ${row.destination} • Arrival: ${row.target_arrival_time}`;
    return new StudentSearchResult({
      id: row.id,
      type: 'schedule',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: `Arrival: ${row.target_arrival_time || 'N/A'} • Days: ${daysList.join(', ')}`,
      description: row.days_of_week ? `Days: ${row.days_of_week}` : null,
      status: row.active === 0 ? 'inactive' : 'active',
      url: `/student/schedules/${row.id}`,
      course: null,
      date: row.created_at || null,
      deadline: null,
      relationship: 'commuter',
      domain: 'commute',
      relevanceScore: 0,
      metadata: {
        origin: row.origin,
        destination: row.destination,
        targetArrivalTime: row.target_arrival_time,
        daysOfWeek: daysList,
        reminderEnabled: Boolean(row.reminder_enabled),
        active: row.active !== 0
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    });
  }

  static fromNotification(row) {
    if (!row) return null;
    const isRead = Boolean(row.read || row.is_read);
    const sub = [row.type, isRead ? 'Read' : 'Unread'].join(' • ');
    return new StudentSearchResult({
      id: row.id,
      type: 'notification',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: row.message || '',
      description: row.message || null,
      status: isRead ? 'read' : 'unread',
      url: `/notifications/${row.id}`,
      course: null,
      date: row.created_at || null,
      deadline: null,
      relationship: 'recipient',
      domain: 'alerts',
      relevanceScore: 0,
      metadata: {
        type: row.type || 'system',
        priority: row.priority || 'medium',
        read: isRead,
        relatedResourceType: row.related_resource_type || null,
        relatedResourceId: row.related_resource_id || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    });
  }

  static fromReminder(row) {
    if (!row) return null;
    const scheduledTime = typeof row.scheduled_time === 'number' ? row.scheduled_time : null;
    const sub = [row.reminder_type, row.status].join(' • ');
    return new StudentSearchResult({
      id: row.id,
      type: 'reminder',
      title: row.title,
      name: row.title,
      subtitle: sub,
      snippet: row.message || '',
      description: row.message || null,
      status: row.status || 'pending',
      url: `/reminders/${row.id}`,
      course: null,
      date: scheduledTime,
      deadline: scheduledTime,
      relationship: 'recipient',
      domain: 'alerts',
      relevanceScore: 0,
      metadata: {
        scheduledTime,
        reminderType: row.reminder_type,
        status: row.status,
        relatedResourceType: row.related_resource_type || null,
        relatedResourceId: row.related_resource_id || null
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    });
  }
}

module.exports = {
  StudentSearchResult,
  studentSearchResultSchema,
  searchResultTypeEnum,
  searchDomainEnum,
  studentRelationshipEnum
};
