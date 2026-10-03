/**
 * StudyResourceRepository
 *
 * Data-access operations for student study resources (notes, references, links, documents).
 * Enforces parameterization, index usage, and strict student ownership.
 */

const { getConnection } = require('../db/connection');
const { StudyResource } = require('../models/StudyResource');

class StudyResourceRepository {
  constructor(dbInstance = null) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM study_resources WHERE id = ?');
    const row = stmt.get(id);
    return row ? StudyResource.fromRow(row) : null;
  }

  findByIdAndUserId(id, userId) {
    if (!id || !userId || typeof id !== 'string' || typeof userId !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM study_resources WHERE id = ? AND user_id = ?');
    const row = stmt.get(id, userId);
    return row ? StudyResource.fromRow(row) : null;
  }

  findByUserId(userId, options = {}) {
    if (!userId || typeof userId !== 'string') return [];
    let query = 'SELECT * FROM study_resources WHERE user_id = ?';
    const params = [userId];

    if (options.course_id !== undefined || options.courseId !== undefined) {
      const cId = options.course_id !== undefined ? options.course_id : options.courseId;
      if (cId === null) {
        query += ' AND course_id IS NULL';
      } else {
        query += ' AND course_id = ?';
        params.push(cId);
      }
    }

    if (options.assignment_id !== undefined || options.assignmentId !== undefined) {
      const aId = options.assignment_id !== undefined ? options.assignment_id : options.assignmentId;
      if (aId === null) {
        query += ' AND assignment_id IS NULL';
      } else {
        query += ' AND assignment_id = ?';
        params.push(aId);
      }
    }

    if (options.goal_id !== undefined || options.goalId !== undefined) {
      const gId = options.goal_id !== undefined ? options.goal_id : options.goalId;
      if (gId === null) {
        query += ' AND goal_id IS NULL';
      } else {
        query += ' AND goal_id = ?';
        params.push(gId);
      }
    }

    if (options.study_session_id !== undefined || options.studySessionId !== undefined) {
      const sId = options.study_session_id !== undefined ? options.study_session_id : options.studySessionId;
      if (sId === null) {
        query += ' AND study_session_id IS NULL';
      } else {
        query += ' AND study_session_id = ?';
        params.push(sId);
      }
    }

    if (options.resource_type || options.type) {
      query += ' AND resource_type = ?';
      params.push(options.resource_type || options.type);
    }

    if (options.is_favorite !== undefined || options.favorite !== undefined) {
      const favVal = options.is_favorite !== undefined ? options.is_favorite : options.favorite;
      query += ' AND is_favorite = ?';
      params.push(favVal ? 1 : 0);
    }

    if (options.archived !== undefined) {
      query += ' AND archived = ?';
      params.push(options.archived ? 1 : 0);
    }

    if (options.searchTerm || options.query) {
      const term = `%${String(options.searchTerm || options.query).trim().toLowerCase()}%`;
      query += ' AND (LOWER(title) LIKE ? OR LOWER(COALESCE(description, \'\')) LIKE ? OR LOWER(COALESCE(content, \'\')) LIKE ?)';
      params.push(term, term, term);
    }

    if (options.tag) {
      const tagTerm = `%"${String(options.tag).trim().toLowerCase()}"%`;
      query += ' AND LOWER(COALESCE(tags, \'\')) LIKE ?';
      params.push(tagTerm);
    }

    const sortField = options.sort === 'title' ? 'title' : (options.sort === 'updated_at' ? 'updated_at' : 'created_at');
    const sortOrder = options.order && options.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(Number(options.limit));
      if (options.offset) {
        query += ' OFFSET ?';
        params.push(Number(options.offset));
      }
    }

    const stmt = this.database.prepare(query);
    const rows = stmt.all(...params);
    return rows.map(r => StudyResource.fromRow(r));
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

    if (options.course_id !== undefined || options.courseId !== undefined) {
      const cId = options.course_id !== undefined ? options.course_id : options.courseId;
      if (cId === null) {
        conditions.push('course_id IS NULL');
      } else {
        conditions.push('course_id = ?');
        params.push(cId);
      }
    }

    if (options.assignment_id !== undefined || options.assignmentId !== undefined) {
      const aId = options.assignment_id !== undefined ? options.assignment_id : options.assignmentId;
      if (aId === null) {
        conditions.push('assignment_id IS NULL');
      } else {
        conditions.push('assignment_id = ?');
        params.push(aId);
      }
    }

    if (options.goal_id !== undefined || options.goalId !== undefined) {
      const gId = options.goal_id !== undefined ? options.goal_id : options.goalId;
      if (gId === null) {
        conditions.push('goal_id IS NULL');
      } else {
        conditions.push('goal_id = ?');
        params.push(gId);
      }
    }

    if (options.study_session_id !== undefined || options.studySessionId !== undefined) {
      const sId = options.study_session_id !== undefined ? options.study_session_id : options.studySessionId;
      if (sId === null) {
        conditions.push('study_session_id IS NULL');
      } else {
        conditions.push('study_session_id = ?');
        params.push(sId);
      }
    }

    if (options.resource_type || options.type) {
      conditions.push('resource_type = ?');
      params.push(options.resource_type || options.type);
    }

    if (options.is_favorite !== undefined || options.favorite !== undefined) {
      const favVal = options.is_favorite !== undefined ? options.is_favorite : options.favorite;
      conditions.push('is_favorite = ?');
      params.push(favVal ? 1 : 0);
    }

    if (options.archived !== undefined) {
      conditions.push('archived = ?');
      params.push(options.archived ? 1 : 0);
    }

    if (options.searchTerm || options.query || options.q) {
      const term = `%${String(options.searchTerm || options.query || options.q).trim().toLowerCase()}%`;
      conditions.push('(LOWER(title) LIKE ? OR LOWER(COALESCE(description, \'\')) LIKE ? OR LOWER(COALESCE(content, \'\')) LIKE ?)');
      params.push(term, term, term);
    }

    if (options.tag) {
      const tagTerm = `%"${String(options.tag).trim().toLowerCase()}"%`;
      conditions.push('LOWER(COALESCE(tags, \'\')) LIKE ?');
      params.push(tagTerm);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count query
    const countStmt = this.database.prepare(`SELECT COUNT(*) AS total FROM study_resources WHERE ${whereClause}`);
    const countResult = countStmt.get(...params);
    const total = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(total / limit) || (total === 0 ? 0 : 1);

    // 2. Data rows query
    const sortField = options.sort === 'title' ? 'title' : (options.sort === 'updated_at' ? 'updated_at' : 'created_at');
    const sortOrder = options.order && options.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const dataStmt = this.database.prepare(`
      SELECT * FROM study_resources
      WHERE ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...params, limit, offset);
    const data = rows.map(r => StudyResource.fromRow(r));

    return {
      data,
      total,
      page,
      limit,
      totalPages
    };
  }

  findByCourse(courseId, userId) {
    if (!courseId || !userId) return [];
    const stmt = this.database.prepare(`
      SELECT * FROM study_resources
      WHERE course_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(courseId, userId);
    return rows.map(r => StudyResource.fromRow(r));
  }

  findByAssignment(assignmentId, userId) {
    if (!assignmentId || !userId) return [];
    const stmt = this.database.prepare(`
      SELECT * FROM study_resources
      WHERE assignment_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(assignmentId, userId);
    return rows.map(r => StudyResource.fromRow(r));
  }

  findByGoal(goalId, userId) {
    if (!goalId || !userId) return [];
    const stmt = this.database.prepare(`
      SELECT * FROM study_resources
      WHERE goal_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(goalId, userId);
    return rows.map(r => StudyResource.fromRow(r));
  }

  findByStudySession(studySessionId, userId) {
    if (!studySessionId || !userId) return [];
    const stmt = this.database.prepare(`
      SELECT * FROM study_resources
      WHERE study_session_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(studySessionId, userId);
    return rows.map(r => StudyResource.fromRow(r));
  }

  create(resourceData) {
    const resource = resourceData instanceof StudyResource ? resourceData : StudyResource.create(resourceData);
    const row = resource.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO study_resources (
        id, user_id, course_id, assignment_id, goal_id, study_session_id,
        title, description, resource_type, url, content, file_name, file_size,
        mime_type, tags, is_favorite, archived, created_at, updated_at
      ) VALUES (
        @id, @user_id, @course_id, @assignment_id, @goal_id, @study_session_id,
        @title, @description, @resource_type, @url, @content, @file_name, @file_size,
        @mime_type, @tags, @is_favorite, @archived, @created_at, @updated_at
      )
    `);

    stmt.run(row);
    return this.findById(resource.id);
  }

  update(id, userId, updates = {}) {
    if (!id || !userId) return null;
    const existing = this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    const allowedFields = [
      'course_id', 'assignment_id', 'goal_id', 'study_session_id',
      'title', 'description', 'resource_type', 'url', 'content',
      'file_name', 'file_size', 'mime_type', 'tags', 'is_favorite', 'archived'
    ];

    const assignments = [];
    const params = [];
    const now = Date.now();

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        assignments.push(`${field} = ?`);
        if (field === 'tags') {
          params.push(JSON.stringify(Array.isArray(updates.tags) ? updates.tags : []));
        } else if (field === 'is_favorite' || field === 'archived') {
          params.push(updates[field] ? 1 : 0);
        } else {
          params.push(updates[field]);
        }
      }
    }

    if (assignments.length === 0) {
      return existing;
    }

    assignments.push('updated_at = ?');
    params.push(now);

    params.push(id, userId);

    const query = `
      UPDATE study_resources
      SET ${assignments.join(', ')}
      WHERE id = ? AND user_id = ?
    `;

    const stmt = this.database.prepare(query);
    stmt.run(...params);

    return this.findById(id);
  }

  delete(id, userId) {
    if (!id || !userId) return false;
    const stmt = this.database.prepare('DELETE FROM study_resources WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  toggleFavorite(id, userId) {
    if (!id || !userId) return null;
    const existing = this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    const newFav = existing.is_favorite ? 0 : 1;
    const stmt = this.database.prepare(`
      UPDATE study_resources
      SET is_favorite = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    stmt.run(newFav, Date.now(), id, userId);
    return this.findById(id);
  }

  archive(id, userId) {
    if (!id || !userId) return null;
    const stmt = this.database.prepare(`
      UPDATE study_resources
      SET archived = 1, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    const res = stmt.run(Date.now(), id, userId);
    return res.changes > 0 ? this.findById(id) : null;
  }

  unarchive(id, userId) {
    if (!id || !userId) return null;
    const stmt = this.database.prepare(`
      UPDATE study_resources
      SET archived = 0, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    const res = stmt.run(Date.now(), id, userId);
    return res.changes > 0 ? this.findById(id) : null;
  }

  countByUserId(userId, options = {}) {
    if (!userId) return 0;
    let query = 'SELECT COUNT(*) AS total FROM study_resources WHERE user_id = ?';
    const params = [userId];

    if (options.archived !== undefined) {
      query += ' AND archived = ?';
      params.push(options.archived ? 1 : 0);
    }
    if (options.resource_type || options.type) {
      query += ' AND resource_type = ?';
      params.push(options.resource_type || options.type);
    }
    if (options.is_favorite !== undefined || options.favorite !== undefined) {
      const fav = options.is_favorite !== undefined ? options.is_favorite : options.favorite;
      query += ' AND is_favorite = ?';
      params.push(fav ? 1 : 0);
    }

    const row = this.database.prepare(query).get(...params);
    return row ? row.total : 0;
  }
}

const studyResourceRepository = new StudyResourceRepository();

module.exports = {
  StudyResourceRepository,
  studyResourceRepository
};
