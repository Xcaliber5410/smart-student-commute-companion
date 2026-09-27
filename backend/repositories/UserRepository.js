/**
 * UserRepository
 *
 * Data-access operations for authenticated student and administrator accounts.
 */

const { getConnection } = require('../db/connection');
const { User } = require('../models/User');

class UserRepository {
  constructor(dbInstance) {
    this.db = dbInstance;
  }

  get database() {
    return this.db || getConnection();
  }

  /**
   * Finds a user by email address (case-insensitive).
   *
   * @param {string} email
   * @returns {User|null}
   */
  findByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const stmt = this.database.prepare(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)'
    );
    const row = stmt.get(email.trim());
    return row ? User.fromRow(row) : null;
  }

  /**
   * Finds a user by unique identifier.
   *
   * @param {string} id
   * @returns {User|null}
   */
  findById(id) {
    if (!id || typeof id !== 'string') return null;
    const stmt = this.database.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id);
    return row ? User.fromRow(row) : null;
  }

  /**
   * Persists a new user record.
   *
   * @param {object|User} data
   * @returns {User}
   */
  create(data) {
    const user = data instanceof User ? data : User.create(data);
    const row = user.toRow();

    const stmt = this.database.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, college_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      row.id,
      row.email,
      row.password_hash,
      row.full_name,
      row.college_name,
      row.role,
      row.created_at,
      row.updated_at
    );

    return user;
  }

  /**
   * Updates user fields.
   *
   * @param {string} id
   * @param {object} updates
   * @returns {User|null}
   */
  update(id, updates = {}) {
    const existing = this.findById(id);
    if (!existing) return null;

    const allowed = ['full_name', 'college_name', 'password_hash', 'role'];
    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(updates[key]);
      }
    }

    if (setClauses.length === 0) return existing;

    const now = Date.now();
    setClauses.push('updated_at = ?');
    params.push(now);
    params.push(id);

    const stmt = this.database.prepare(`
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);
    return this.findById(id);
  }

  /**
   * Deletes a user by identifier.
   *
   * @param {string} id
   * @returns {boolean} True if deleted, false otherwise
   */
  delete(id) {
    const stmt = this.database.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Retrieves all users ordered by creation date descending.
   *
   * @returns {User[]}
   */
  findAll() {
    const stmt = this.database.prepare('SELECT * FROM users ORDER BY created_at DESC');
    const rows = stmt.all();
    return rows.map(r => User.fromRow(r));
  }

  /**
   * Total count of registered users.
   *
   * @returns {number}
   */
  count() {
    const stmt = this.database.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get();
    return result ? result.count : 0;
  }
}

const userRepository = new UserRepository();

module.exports = {
  UserRepository,
  userRepository
};
