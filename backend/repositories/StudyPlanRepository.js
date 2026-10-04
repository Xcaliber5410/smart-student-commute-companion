/**
 * StudyPlanRepository
 *
 * Data-access layer for student study plans and planned study work items.
 * Enforces student data isolation, efficient indexed queries, and relational consistency.
 */

const { getConnection } = require('../db/connection');
const { StudyPlan } = require('../models/StudyPlan');
const { StudyPlanItem } = require('../models/StudyPlanItem');

class StudyPlanRepository {
  constructor(db = null) {
    this._db = db;
  }

  get database() {
    return this._db || getConnection();
  }

  // =========================================================================
  // STUDY PLANS
  // =========================================================================

  /**
   * Creates a new study plan.
   *
   * @param {StudyPlan|object} plan
   * @returns {StudyPlan}
   */
  createPlan(plan) {
    const entity = plan instanceof StudyPlan ? plan : StudyPlan.create(plan);
    const row = entity.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO study_plans (
        id, user_id, title, description, start_date, end_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.user_id,
      row.title,
      row.description,
      row.start_date,
      row.end_date,
      row.status,
      row.created_at,
      row.updated_at
    );

    return entity;
  }

  /**
   * Finds a study plan by ID, optionally scoped to a user.
   *
   * @param {string} id
   * @param {string} [userId=null]
   * @returns {StudyPlan|null}
   */
  findPlanById(id, userId = null) {
    if (!id) return null;
    let query = 'SELECT * FROM study_plans WHERE id = ?';
    const params = [id];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const row = this.database.prepare(query).get(...params);
    return StudyPlan.fromRow(row);
  }

  /**
   * Retrieves paginated study plans for a student with optional status and date filters.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {{ data: StudyPlan[], total: number, page: number, limit: number, totalPages: number }}
   */
  findPlansByUserId(userId, options = {}) {
    if (!userId) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.startDate || options.start_date) {
      const sDate = options.startDate || options.start_date;
      conditions.push('end_date >= ?');
      params.push(Number(sDate));
    }

    if (options.endDate || options.end_date) {
      const eDate = options.endDate || options.end_date;
      conditions.push('start_date <= ?');
      params.push(Number(eDate));
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = this.database.prepare(`SELECT COUNT(*) AS total FROM study_plans WHERE ${whereClause}`);
    const countResult = countStmt.get(...params);
    const total = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);

    const sortOrder = options.order && options.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const dataStmt = this.database.prepare(`
      SELECT * FROM study_plans
      WHERE ${whereClause}
      ORDER BY start_date ${sortOrder}, created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const data = rows.map(r => StudyPlan.fromRow(r));

    return {
      data,
      total,
      page,
      limit,
      totalPages
    };
  }

  /**
   * Updates an existing study plan.
   *
   * @param {string} id
   * @param {string} userId
   * @param {object} updates
   * @returns {StudyPlan|null}
   */
  updatePlan(id, userId, updates = {}) {
    const existing = this.findPlanById(id, userId);
    if (!existing) return null;

    const allowedFields = ['title', 'description', 'start_date', 'end_date', 'status'];
    const sets = [];
    const params = [];

    const fieldMap = {
      startDate: 'start_date',
      endDate: 'end_date'
    };

    for (const [key, rawValue] of Object.entries(updates)) {
      const dbKey = fieldMap[key] || key;
      if (allowedFields.includes(dbKey) && rawValue !== undefined) {
        sets.push(`${dbKey} = ?`);
        params.push(rawValue);
      }
    }

    if (sets.length === 0) return existing;

    const now = Date.now();
    sets.push('updated_at = ?');
    params.push(now);

    params.push(id, userId);

    const stmt = this.database.prepare(`
      UPDATE study_plans
      SET ${sets.join(', ')}
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(...params);

    return this.findPlanById(id, userId);
  }

  /**
   * Deletes a study plan (cascades to delete plan items).
   *
   * @param {string} id
   * @param {string} userId
   * @returns {boolean}
   */
  deletePlan(id, userId) {
    const stmt = this.database.prepare('DELETE FROM study_plans WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  // =========================================================================
  // STUDY PLAN ITEMS (Planned Study Work)
  // =========================================================================

  /**
   * Creates a single planned study work item.
   *
   * @param {StudyPlanItem|object} item
   * @returns {StudyPlanItem}
   */
  createItem(item) {
    const entity = item instanceof StudyPlanItem ? item : StudyPlanItem.create(item);
    const row = entity.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO study_plan_items (
        id, user_id, plan_id, course_id, assignment_id, goal_id, study_session_id, resource_id,
        title, description, planned_date, duration_minutes, priority, status, order_index,
        completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.user_id,
      row.plan_id,
      row.course_id,
      row.assignment_id,
      row.goal_id,
      row.study_session_id,
      row.resource_id,
      row.title,
      row.description,
      row.planned_date,
      row.duration_minutes,
      row.priority,
      row.status,
      row.order_index,
      row.completed_at,
      row.created_at,
      row.updated_at
    );

    return entity;
  }

  /**
   * Atomically inserts a batch of study plan items in a single transaction.
   *
   * @param {Array<StudyPlanItem|object>} items
   * @param {string} userId
   * @returns {StudyPlanItem[]}
   */
  createItemsBatch(items, userId) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const entities = items.map(item => {
      const entity = item instanceof StudyPlanItem ? item : StudyPlanItem.create({ ...item, user_id: userId });
      return entity;
    });

    const stmt = this.database.prepare(`
      INSERT INTO study_plan_items (
        id, user_id, plan_id, course_id, assignment_id, goal_id, study_session_id, resource_id,
        title, description, planned_date, duration_minutes, priority, status, order_index,
        completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.database.transaction(rows => {
      for (const row of rows) {
        stmt.run(
          row.id,
          row.user_id,
          row.plan_id,
          row.course_id,
          row.assignment_id,
          row.goal_id,
          row.study_session_id,
          row.resource_id,
          row.title,
          row.description,
          row.planned_date,
          row.duration_minutes,
          row.priority,
          row.status,
          row.order_index,
          row.completed_at,
          row.created_at,
          row.updated_at
        );
      }
    });

    insertMany(entities.map(e => e.toRow()));
    return entities;
  }

  /**
   * Finds a study plan item by ID, optionally scoped to a user.
   *
   * @param {string} id
   * @param {string} [userId=null]
   * @returns {StudyPlanItem|null}
   */
  findItemById(id, userId = null) {
    if (!id) return null;
    let query = 'SELECT * FROM study_plan_items WHERE id = ?';
    const params = [id];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const row = this.database.prepare(query).get(...params);
    return StudyPlanItem.fromRow(row);
  }

  /**
   * Retrieves all items belonging to a study plan.
   *
   * @param {string} planId
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {StudyPlanItem[]}
   */
  findItemsByPlanId(planId, userId, options = {}) {
    if (!planId || !userId) return [];

    let query = `
      SELECT * FROM study_plan_items
      WHERE plan_id = ? AND user_id = ?
    `;
    const params = [planId, userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY planned_date ASC, order_index ASC, created_at ASC';
    const rows = this.database.prepare(query).all(...params);
    return rows.map(r => StudyPlanItem.fromRow(r));
  }

  /**
   * Retrieves paginated study plan items for a user with rich relational filtering.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {{ data: StudyPlanItem[], total: number, page: number, limit: number, totalPages: number }}
   */
  findItemsByUserId(userId, options = {}) {
    if (!userId) return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.planId || options.plan_id) {
      conditions.push('plan_id = ?');
      params.push(options.planId || options.plan_id);
    }

    if (options.courseId || options.course_id) {
      conditions.push('course_id = ?');
      params.push(options.courseId || options.course_id);
    }

    if (options.assignmentId || options.assignment_id) {
      conditions.push('assignment_id = ?');
      params.push(options.assignmentId || options.assignment_id);
    }

    if (options.goalId || options.goal_id) {
      conditions.push('goal_id = ?');
      params.push(options.goalId || options.goal_id);
    }

    if (options.studySessionId || options.study_session_id) {
      conditions.push('study_session_id = ?');
      params.push(options.studySessionId || options.study_session_id);
    }

    if (options.resourceId || options.resource_id) {
      conditions.push('resource_id = ?');
      params.push(options.resourceId || options.resource_id);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    if (options.startDate || options.start_date) {
      conditions.push('planned_date >= ?');
      params.push(Number(options.startDate || options.start_date));
    }

    if (options.endDate || options.end_date) {
      conditions.push('planned_date <= ?');
      params.push(Number(options.endDate || options.end_date));
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = this.database.prepare(`SELECT COUNT(*) AS total FROM study_plan_items WHERE ${whereClause}`);
    const countResult = countStmt.get(...params);
    const total = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);

    const sortOrder = options.order && options.order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const dataStmt = this.database.prepare(`
      SELECT * FROM study_plan_items
      WHERE ${whereClause}
      ORDER BY planned_date ${sortOrder}, order_index ASC, created_at ASC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const data = rows.map(r => StudyPlanItem.fromRow(r));

    return {
      data,
      total,
      page,
      limit,
      totalPages
    };
  }

  /**
   * Retrieves upcoming planned study items within a time window.
   *
   * @param {string} userId
   * @param {object} [options={}]
   * @returns {StudyPlanItem[]}
   */
  findUpcomingItems(userId, options = {}) {
    if (!userId) return [];
    const now = options.now || Date.now();
    const days = Math.min(30, Math.max(1, Number(options.days) || 7));
    const windowEnd = now + (days * 86400000);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));

    const stmt = this.database.prepare(`
      SELECT * FROM study_plan_items
      WHERE user_id = ?
        AND planned_date >= ?
        AND planned_date <= ?
        AND status IN ('planned', 'in_progress')
      ORDER BY planned_date ASC, order_index ASC
      LIMIT ?
    `);

    const rows = stmt.all(userId, now, windowEnd, limit);
    return rows.map(r => StudyPlanItem.fromRow(r));
  }

  /**
   * Finds overdue planned study items that have passed their target date.
   *
   * @param {string} userId
   * @param {number} [now=Date.now()]
   * @returns {StudyPlanItem[]}
   */
  findOverdueItems(userId, now = Date.now()) {
    if (!userId) return [];
    const stmt = this.database.prepare(`
      SELECT * FROM study_plan_items
      WHERE user_id = ?
        AND planned_date < ?
        AND status IN ('planned', 'in_progress')
      ORDER BY planned_date ASC
      LIMIT 50
    `);
    const rows = stmt.all(userId, now);
    return rows.map(r => StudyPlanItem.fromRow(r));
  }

  /**
   * Finds all study plan items for a student that overlap with or fall inside the given time window.
   * A study plan item interval [planned_date, planned_date + duration * 60000] overlaps with [rangeStart, rangeEnd] if:
   * planned_date < rangeEnd AND (planned_date + (duration_minutes * 60000)) > rangeStart
   *
   * @param {string} userId - Student user ID
   * @param {number} rangeStart - Start epoch ms
   * @param {number} rangeEnd - End epoch ms
   * @param {object} [options={}] - { status, plan_id, excludeItemId }
   * @returns {StudyPlanItem[]}
   */
  findInRange(userId, rangeStart, rangeEnd, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = `
      SELECT * FROM study_plan_items
      WHERE user_id = ?
        AND planned_date < ?
        AND (planned_date + (duration_minutes * 60000)) > ?
    `;
    const params = [userId, rangeEnd, rangeStart];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    } else {
      query += " AND status != 'cancelled'";
    }

    if (options.plan_id) {
      query += ' AND plan_id = ?';
      params.push(options.plan_id);
    }

    if (options.excludeItemId) {
      query += ' AND id != ?';
      params.push(options.excludeItemId);
    }

    query += ' ORDER BY planned_date ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => StudyPlanItem.fromRow(r));
  }

  /**
   * Updates an existing study plan item.
   *
   * @param {string} id
   * @param {string} userId
   * @param {object} updates
   * @returns {StudyPlanItem|null}
   */
  updateItem(id, userId, updates = {}) {
    const existing = this.findItemById(id, userId);
    if (!existing) return null;

    const allowedFields = [
      'plan_id', 'course_id', 'assignment_id', 'goal_id', 'study_session_id', 'resource_id',
      'title', 'description', 'planned_date', 'duration_minutes', 'priority', 'status',
      'order_index', 'completed_at'
    ];
    const fieldMap = {
      planId: 'plan_id',
      courseId: 'course_id',
      assignmentId: 'assignment_id',
      goalId: 'goal_id',
      studySessionId: 'study_session_id',
      resourceId: 'resource_id',
      plannedDate: 'planned_date',
      durationMinutes: 'duration_minutes',
      orderIndex: 'order_index',
      completedAt: 'completed_at'
    };

    const sets = [];
    const params = [];

    for (const [key, rawValue] of Object.entries(updates)) {
      const dbKey = fieldMap[key] || key;
      if (allowedFields.includes(dbKey) && rawValue !== undefined) {
        sets.push(`${dbKey} = ?`);
        params.push(rawValue);
      }
    }

    // Auto-update completed_at if status changed to completed and not explicitly provided
    if (updates.status === 'completed' && updates.completed_at === undefined && updates.completedAt === undefined) {
      sets.push('completed_at = ?');
      params.push(Date.now());
    } else if (updates.status && updates.status !== 'completed' && updates.completed_at === undefined && updates.completedAt === undefined) {
      sets.push('completed_at = ?');
      params.push(null);
    }

    if (sets.length === 0) return existing;

    const now = Date.now();
    sets.push('updated_at = ?');
    params.push(now);

    params.push(id, userId);

    const stmt = this.database.prepare(`
      UPDATE study_plan_items
      SET ${sets.join(', ')}
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(...params);

    return this.findItemById(id, userId);
  }

  /**
   * Deletes a study plan item.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {boolean}
   */
  deleteItem(id, userId) {
    const stmt = this.database.prepare('DELETE FROM study_plan_items WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Connects a planned study item to an actual calendar study session.
   *
   * @param {string} itemId
   * @param {string} studySessionId
   * @param {string} userId
   * @returns {StudyPlanItem|null}
   */
  linkItemToStudySession(itemId, studySessionId, userId) {
    return this.updateItem(itemId, userId, {
      study_session_id: studySessionId
    });
  }

  /**
   * Calculates plan progress and status distribution.
   *
   * @param {string} planId
   * @param {string} userId
   * @returns {object}
   */
  getPlanSummary(planId, userId) {
    const plan = this.findPlanById(planId, userId);
    if (!plan) return null;

    const stmt = this.database.prepare(`
      SELECT
        COUNT(*) AS total_items,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_items,
        SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) AS planned_items,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_items,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_items,
        COALESCE(SUM(duration_minutes), 0) AS total_planned_minutes,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN duration_minutes ELSE 0 END), 0) AS completed_minutes
      FROM study_plan_items
      WHERE plan_id = ? AND user_id = ?
    `);

    const row = stmt.get(planId, userId);
    const totalItems = row ? Number(row.total_items || 0) : 0;
    const completedItems = row ? Number(row.completed_items || 0) : 0;
    const progressPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      plan,
      metrics: {
        totalItems,
        completedItems,
        plannedItems: row ? Number(row.planned_items || 0) : 0,
        inProgressItems: row ? Number(row.in_progress_items || 0) : 0,
        skippedItems: row ? Number(row.skipped_items || 0) : 0,
        totalPlannedMinutes: row ? Number(row.total_planned_minutes || 0) : 0,
        completedMinutes: row ? Number(row.completed_minutes || 0) : 0,
        progressPercentage
      }
    };
  }
}

const studyPlanRepository = new StudyPlanRepository();

module.exports = {
  StudyPlanRepository,
  studyPlanRepository
};
