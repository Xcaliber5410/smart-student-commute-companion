/**
 * User Domain Model
 *
 * Represents an authenticated student or administrator account.
 * Enforces schema validation, secure credential hashing, and sensitive data redaction.
 */

const { z } = require('zod');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('../utils/password');

const userSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
  email: z.string().email('Invalid email address').transform(val => val.trim().toLowerCase()),
  password_hash: z.string().min(1, 'Password hash is required'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  college_name: z.string().min(2, 'College name must be at least 2 characters').max(150),
  role: z.enum(['student', 'admin']).default('student'),
  created_at: z.number().int().positive().default(() => Date.now()),
  updated_at: z.number().int().positive().default(() => Date.now())
});

class User {
  constructor(data) {
    const validated = userSchema.parse(data);
    Object.assign(this, validated);
  }

  /**
   * Factory method to create a new User instance from registration input.
   * Hashes the plaintext password before instantiation.
   *
   * @param {object} input
   * @param {string} input.email
   * @param {string} input.password
   * @param {string} input.full_name
   * @param {string} input.college_name
   * @param {string} [input.role='student']
   * @returns {User}
   */
  static create(input) {
    if (!input.password) {
      throw new Error('Password is required to create a user');
    }

    const now = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const id = `usr-${now}-${randomSuffix}`;
    const password_hash = hashPassword(input.password);

    return new User({
      id,
      email: input.email,
      password_hash,
      full_name: input.full_name,
      college_name: input.college_name,
      role: input.role || 'student',
      created_at: now,
      updated_at: now
    });
  }

  /**
   * Rehydrates a User domain model from a database row.
   *
   * @param {object} row
   * @returns {User|null}
   */
  static fromRow(row) {
    if (!row) return null;
    return new User({
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      full_name: row.full_name,
      college_name: row.college_name,
      role: row.role || 'student',
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at)
    });
  }

  /**
   * Converts the user instance to a database row format.
   *
   * @returns {object}
   */
  toRow() {
    return {
      id: this.id,
      email: this.email,
      password_hash: this.password_hash,
      full_name: this.full_name,
      college_name: this.college_name,
      role: this.role,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Verifies a candidate plaintext password against this user's hash.
   *
   * @param {string} candidatePassword
   * @returns {boolean}
   */
  verifyPassword(candidatePassword) {
    return verifyPassword(candidatePassword, this.password_hash);
  }

  /**
   * Serializes the user for API responses, strictly redacting password_hash.
   *
   * @returns {object}
   */
  toSafeObject() {
    return {
      id: this.id,
      email: this.email,
      full_name: this.full_name,
      college_name: this.college_name,
      role: this.role,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * JSON serialization override to ensure password_hash is never leaked.
   *
   * @returns {object}
   */
  toJSON() {
    return this.toSafeObject();
  }
}

module.exports = {
  User,
  userSchema
};
