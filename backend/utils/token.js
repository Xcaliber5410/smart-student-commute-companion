/**
 * Cryptographic Token Handling Utilities
 *
 * Implements standard RFC 7519 JWT-compliant token generation and verification
 * using Node.js native crypto with HMAC-SHA256 (HS256) and timing-safe equality.
 */

const crypto = require('crypto');
const config = require('../config');
const { UnauthorizedError } = require('../errors');

const DEFAULT_SECRET = 'smart-commute-companion-dev-jwt-secret-key-32bytes-secure!';
const DEFAULT_EXPIRES_IN_SECONDS = 86400; // 24 hours

/**
 * Signs a payload and produces a standard HS256 JWT string.
 *
 * @param {object} payload - Identity claims to encode
 * @param {object} [options={}]
 * @param {number} [options.expiresIn=86400] - Token TTL in seconds
 * @param {string} [options.secret] - Signing secret key
 * @returns {string} Signed JWT string
 */
function signToken(payload = {}, options = {}) {
  const secret = options.secret || config.jwtSecret || process.env.JWT_SECRET || DEFAULT_SECRET;
  const expiresIn = typeof options.expiresIn === 'number' ? options.expiresIn : DEFAULT_EXPIRES_IN_SECONDS;

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + expiresIn
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');

  return `${unsignedToken}.${signature}`;
}

/**
 * Verifies a JWT token signature, structure, and expiration.
 *
 * @param {string} token - Raw JWT string
 * @param {object} [options={}]
 * @param {string} [options.secret] - Signing secret key
 * @returns {object} Decoded payload claims
 * @throws {UnauthorizedError} If token is missing, malformed, forged, or expired
 */
function verifyToken(token, options = {}) {
  if (!token || typeof token !== 'string') {
    throw new UnauthorizedError('Authentication token is missing');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed authentication token');
  }

  const [headerB64, payloadB64, signature] = parts;
  const secret = options.secret || config.jwtSecret || process.env.JWT_SECRET || DEFAULT_SECRET;

  // Recompute expected HMAC-SHA256 signature
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(unsignedToken)
    .digest('base64url');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new UnauthorizedError('Invalid authentication token signature');
  }

  // Parse header and payload
  let payload;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    throw new UnauthorizedError('Malformed token payload');
  }

  // Verify expiration
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && typeof payload.exp === 'number' && nowSeconds > payload.exp) {
    throw new UnauthorizedError('Authentication token has expired');
  }

  return payload;
}

/**
 * Decodes a token's payload without verifying its cryptographic signature.
 *
 * @param {string} token
 * @returns {object|null}
 */
function decodeToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken,
  decodeToken,
  DEFAULT_EXPIRES_IN_SECONDS
};
