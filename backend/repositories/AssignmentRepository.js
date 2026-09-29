/**
 * AssignmentRepository
 *
 * Data-access operations for student academic tasks, deliverables, and assignments.
 */

const { getConnection } = require('../db/connection');
const { Assignment } = require('../models/Assignment');

class AssignmentRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM assignments WHERE id = ?');
    const row = stmt.get(id);
    return row ? Assignment.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM assignments WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.course_id) {
      query += ' AND course_id = ?';
      params.push(options.course_id);
    }

    query += ' ORDER BY due_date ASC';
    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => Assignment.fromRow(r));
  }

  findByCourseId(courseId) {
    if (!courseId) return [];
    const stmt = this.database.prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC');
    const rows = stmt.all(courseId);
    return rows.map(r => Assignment.fromRow(r));
  }

  findWithPaginationAndFilters(userId, options = {}) {
    if (!userId || typeof userId !== 'string') {
      return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = ['user_id = ?'];
    const params = [userId];

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.course_id) {
      conditions.push('course_id = ?');
      params.push(options.course_id);
    }

    if (options.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    if (options.due_date_from !== undefined) {
      conditions.push('due_date >= ?');
      params.push(Number(options.due_date_from));
    }

    if (options.due_date_to !== undefined) {
      conditions.push('due_date <= ?');
      params.push(Number(options.due_date_to));
    }

    if (options.overdue === true) {
      const now = Date.now();
      conditions.push("status NOT IN ('completed', 'cancelled') AND due_date < ?");
      params.push(now);
    }

    if (options.upcoming === true) {
      const now = Date.now();
      const sevenDaysLater = now + (7 * 24 * 60 * 60 * 1000);
      conditions.push("status NOT IN ('completed', 'cancelled') AND due_date >= ? AND due_date <= ?");
      params.push(now, sevenDaysLater);
    }

    if (options.search && typeof options.search === 'string') {
      conditions.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      const searchParam = `%${options.search.trim()}%`;
      params.push(searchParam, searchParam);
    }

    const whereClause = conditions.join(' AND ');

    // Order By resolution
    let orderBy = 'due_date ASC';
    if (options.sort_by === 'due_date_desc') {
      orderBy = 'due_date DESC';
    } else if (options.sort_by === 'created_at') {
      orderBy = 'created_at DESC';
    } else if (options.sort_by === 'priority') {
      orderBy = `
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END ASC, due_date ASC
      `;
    }

    const countStmt = this.database.prepare(`SELECT COUNT(*) as count FROM assignments WHERE ${whereClause}`);
    const total = countStmt.get(...params).count;

    const dataStmt = this.database.prepare(`
      SELECT * FROM assignments
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: rows.map(r => Assignment.fromRow(r)),
      total,
      page,
      limit,
      totalPages
    };
  }

  create(assignmentInstance) {
    const row = assignmentInstance.toRow();
    const stmt = this.database.prepare(`
      INSERT INTO assignments (
        id, user_id, course_id, title, description, due_date, priority, status,
        reminder_enabled, reminder_lead_time_minutes, completed_at, created_at, updated_at
      ) VALUES (
        @id, @user_id, @course_id, @title, @description, @due_date, @priority, @status,
        @reminder_enabled, @reminder_lead_time_minutes, @completed_at, @created_at, @updated_at
      )
    `);
    stmt.run(row);
    return this.findById(row.id);
  }

  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const allowed = [
      'course_id',
      'title',
      'description',
      'due_date',
      'priority',
      'status',
      'reminder_enabled',
      'reminder_lead_time_minutes',
      'completed_at'
    ];
    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(updates[key]);
      }
    }

    if (setClauses.length === 0) return existing;

    setClauses.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    const stmt = this.database.prepare(`
      UPDATE assignments
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...params);

    return this.findById(id);
  }

  updateStatus(id, newStatus, completedAt = null) {
    const now = Date.now();
    const stmt = this.database.prepare(`
      UPDATE assignments
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(newStatus, completedAt, now, id);
    return this.findById(id);
  }

  delete(id) {
    const stmt = this.database.prepare('DELETE FROM assignments WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  countByUserId(userId, options = {}) {
    if (!userId) return 0;
    let query = 'SELECT COUNT(*) as cnt FROM assignments WHERE user_id = ?';
    const params = [userId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    const stmt = this.database.prepare(query);
    return stmt.get(...params).cnt;
  }

  getAcademicSummary(userId, now = Date.now()) {
    if (!userId) return null;

    const statsStmt = this.database.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status NOT IN ('completed', 'cancelled') AND due_date < ? THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN priority = 'urgent' AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN priority = 'high' AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN priority = 'medium' AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN priority = 'low' AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as low
      FROM assignments
      WHERE user_id = ?
    `);
    const stats = statsStmt.get(now, userId);

    const total = stats ? Number(stats.total || 0) : 0;
    const completed = stats ? Number(stats.completed || 0) : 0;
    const inProgress = stats ? Number(stats.in_progress || 0) : 0;
    const pending = stats ? Number(stats.pending || 0) : 0;
    const overdue = stats ? Number(stats.overdue || 0) : 0;
    const completionPercentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    const sevenDaysLater = now + (7 * 24 * 60 * 60 * 1000);
    const upcomingStmt = this.database.prepare(`
      SELECT 
        a.id, a.user_id, a.course_id, a.title, a.description, a.due_date,
        a.priority, a.status, a.reminder_enabled, a.reminder_lead_time_minutes,
        a.completed_at, a.created_at, a.updated_at,
        c.name as course_name, c.color as course_color, c.code as course_code
      FROM assignments a
      LEFT JOIN courses c ON a.course_id = c.id
      WHERE a.user_id = ?
        AND a.status NOT IN ('completed', 'cancelled')
        AND a.due_date >= ?
        AND a.due_date <= ?
      ORDER BY a.due_date ASC
      LIMIT 10
    `);
    const upcomingRows = upcomingStmt.all(userId, now, sevenDaysLater);

    const courseStmt = this.database.prepare(`
      SELECT
        c.id as course_id,
        c.name as course_name,
        c.code as course_code,
        c.color as course_color,
        COUNT(a.id) as total_assignments,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed_assignments,
        SUM(CASE WHEN a.status NOT IN ('completed', 'cancelled') AND a.due_date < ? THEN 1 ELSE 0 END) as overdue_assignments
      FROM courses c
      LEFT JOIN assignments a ON c.id = a.course_id AND a.user_id = ?
      WHERE c.user_id = ? AND c.archived = 0
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    const courseRows = courseStmt.all(now, userId, userId);

    const courseProgress = courseRows.map(row => {
      const cTotal = Number(row.total_assignments || 0);
      const cCompleted = Number(row.completed_assignments || 0);
      const cOverdue = Number(row.overdue_assignments || 0);
      const cRate = cTotal === 0 ? 0 : Math.round((cCompleted / cTotal) * 100);
      return {
        courseId: row.course_id,
        courseName: row.course_name,
        courseCode: row.course_code,
        courseColor: row.course_color,
        totalAssignments: cTotal,
        completedAssignments: cCompleted,
        pendingAssignments: cTotal - cCompleted,
        overdueAssignments: cOverdue,
        completionPercentage: cRate
      };
    });

    return {
      totalAssignments: total,
      completedAssignments: completed,
      inProgressAssignments: inProgress,
      pendingAssignments: pending,
      overdueAssignments: overdue,
      completionPercentage,
      priorityBreakdown: {
        urgent: stats ? Number(stats.urgent || 0) : 0,
        high: stats ? Number(stats.high || 0) : 0,
        medium: stats ? Number(stats.medium || 0) : 0,
        low: stats ? Number(stats.low || 0) : 0
      },
      upcomingDeadlines: upcomingRows.map(r => ({
        id: r.id,
        title: r.title,
        dueDate: Number(r.due_date),
        priority: r.priority,
        status: r.status,
        courseId: r.course_id,
        courseName: r.course_name,
        courseCode: r.course_code,
        courseColor: r.course_color
      })),
      courseProgress
    };
  }
}

module.exports = {
  AssignmentRepository,
  assignmentRepository: new AssignmentRepository()
};
