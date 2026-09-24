/**
 * Password Security & Hashing Utilities
 *
 * Implements OWASP-recommended password hashing using Node.js native crypto.scrypt
 * with cryptographically secure random salts and constant-time equality verification.
 */

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = {
  N: 16384, // CPU/memory cost
  r: 8,     // Block size
  p: 1      // Parallelization
};
const SALT_BYTES = 16;

/**
 * Validates password complexity:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { valid: false, message: 'Password must be a string' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Hashes a plaintext password using crypto.scryptSync with a 16-byte random salt.
 *
 * @param {string} password - Plaintext password
 * @returns {string} Formatted string "saltHex:hashHex"
 */
function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext candidate password against a stored "saltHex:hashHex" string
 * using constant-time comparison to prevent timing attacks.
 *
 * @param {string} password - Plaintext candidate password
 * @param {string} storedHash - Stored "saltHex:hashHex"
 * @returns {boolean} True if password matches, false otherwise
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [salt, expectedHashHex] = parts;
  if (!salt || !expectedHashHex) {
    return false;
  }

  try {
    const candidateKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const candidateHashHex = candidateKey.toString('hex');

    const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
    const candidateBuffer = Buffer.from(candidateHashHex, 'hex');

    if (expectedBuffer.length !== candidateBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  SCRYPT_KEYLEN,
  SALT_BYTES
};
