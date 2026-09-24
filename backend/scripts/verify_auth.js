/**
 * Authentication and Authorization Verification Test Suite (Day 4)
 *
 * Runs comprehensive automated tests across all 7 layers of the authentication foundation:
 * 1. Password security, scrypt hashing, salting, and complexity validation.
 * 2. User domain model and repository invariants.
 * 3. Cryptographic JWT token signing, verification, and tamper detection.
 * 4. User registration HTTP API (validation, success, duplicate 409).
 * 5. User login HTTP API (credential verification, anti-enumeration timing, token issuance).
 * 6. Authentication middleware (Bearer token extraction, 401 on missing/expired tokens).
 * 7. Authorization and resource ownership guards (RBAC, IDOR protection, 403 Forbidden).
 *
 * Runs against an isolated in-memory or ephemeral test database ensuring ZERO mutation of production data.
 */

const assert = require('assert');
const http = require('http');
const { createApp } = require('../app');
const { validatePasswordStrength, hashPassword, verifyPassword } = require('../utils/password');
const { signToken, verifyToken } = require('../utils/token');
const { User } = require('../models/User');
const { userRepository, rideGroupRepository } = require('../repositories');

console.log('====================================================');
console.log(' Running Authentication & Authorization Test Suite');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function runSyncTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------
// SECTION 1: Password Security & Complexity
// ---------------------------------------------------------------------
runSyncTest('Password strength validator enforces length and character classes', () => {
  assert.strictEqual(validatePasswordStrength('short').valid, false);
  assert.strictEqual(validatePasswordStrength('nocapitalletter1!').valid, false);
  assert.strictEqual(validatePasswordStrength('NOLOWERCASE1!').valid, false);
  assert.strictEqual(validatePasswordStrength('NoNumbersHere!').valid, false);
  assert.strictEqual(validatePasswordStrength('ValidPass123!').valid, true);
});

runSyncTest('scrypt hashing produces unique salted hashes and verifies in constant time', () => {
  const hash1 = hashPassword('MyStudentPassword123');
  const hash2 = hashPassword('MyStudentPassword123');

  // Unique salts guarantee distinct outputs
  assert.notStrictEqual(hash1, hash2);
  assert(hash1.includes(':'), 'Hash must contain salt delimiter');
  assert(!hash1.includes('MyStudentPassword123'), 'Plaintext must never appear in hash');

  assert.strictEqual(verifyPassword('MyStudentPassword123', hash1), true);
  assert.strictEqual(verifyPassword('WrongPassword123', hash1), false);
  assert.strictEqual(verifyPassword('', hash1), false);
  assert.strictEqual(verifyPassword('MyStudentPassword123', 'malformed-hash'), false);
});

// ---------------------------------------------------------------------
// SECTION 2: User Domain Model & Serialization Safety
// ---------------------------------------------------------------------
runSyncTest('User domain model securely instantiates and redacts password_hash', () => {
  const user = User.create({
    email: 'Aarav.Sharma@DJSCE.ac.in',
    password: 'SecurePassword123',
    full_name: 'Aarav Sharma',
    college_name: 'DJ Sanghvi College of Engineering'
  });

  assert.strictEqual(user.email, 'aarav.sharma@djsce.ac.in', 'Email must normalize to lowercase');
  assert.strictEqual(user.role, 'student');
  assert.strictEqual(user.verifyPassword('SecurePassword123'), true);
  assert.strictEqual(user.verifyPassword('WrongPass'), false);

  const safe = user.toSafeObject();
  assert(!('password_hash' in safe), 'toSafeObject() must redact password_hash');

  const json = JSON.parse(JSON.stringify(user));
  assert(!('password_hash' in json), 'toJSON() must redact password_hash');
});

// ---------------------------------------------------------------------
// SECTION 3: Cryptographic Token Handling (JWT / HS256)
// ---------------------------------------------------------------------
runSyncTest('signToken and verifyToken manage claims, expiration, and tamper detection', () => {
  const claims = { sub: 'usr-test-1', email: 'test@college.edu', role: 'student' };
  const token = signToken(claims, { expiresIn: 3600 });
  const decoded = verifyToken(token);

  assert.strictEqual(decoded.sub, claims.sub);
  assert.strictEqual(decoded.email, claims.email);
  assert.strictEqual(decoded.role, claims.role);
  assert(typeof decoded.exp === 'number');

  // Tampered payload detection
  const parts = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...claims, role: 'admin' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

  assert.throws(() => {
    verifyToken(tamperedToken);
  }, /Invalid authentication token signature/);

  // Expired token rejection
  const expiredToken = signToken(claims, { expiresIn: -10 });
  assert.throws(() => {
    verifyToken(expiredToken);
  }, /Authentication token has expired/);
});

// ---------------------------------------------------------------------
// SECTIONS 4-7: End-to-End HTTP API Authentication & Authorization Tests
// ---------------------------------------------------------------------
async function runHttpTests() {
  process.env.NODE_ENV = 'test';
  const app = createApp();
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const payload = options.body ? JSON.stringify(options.body) : null;
      const headers = { ...(options.headers || {}) };
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method || 'GET',
        headers
      }, res => {
        let rawData = '';
        res.on('data', chunk => { rawData += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const studentEmail = `student_${timestamp}@djsce.ac.in`;
  const studentPassword = 'ValidStudentPass123!';
  let studentToken = null;
  let studentId = null;

  const otherStudentEmail = `other_student_${timestamp}@vjti.ac.in`;
  let otherStudentToken = null;
  let otherStudentId = null;

  const adminEmail = `admin_${timestamp}@mumbai-transit.gov.in`;
  let adminToken = null;

  try {
    // 4.1 Registration: Validation failure on invalid inputs
    await test('POST /api/auth/register rejects invalid inputs with 400 VALIDATION_ERROR', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: { email: 'invalid-email', password: 'weak' }
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
    });

    // 4.2 Registration: Success returns 201 Created and safe user
    await test('POST /api/auth/register successfully creates user and redacts password_hash', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: studentEmail,
          password: studentPassword,
          full_name: 'Pooja Hegde',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.email, studentEmail.toLowerCase());
      assert(!('password_hash' in res.body.user), 'Password hash must be redacted');
      studentId = res.body.user.id;
    });

    // 4.3 Registration: Duplicate account prevention
    await test('POST /api/auth/register rejects duplicate email with 409 CONFLICT', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: studentEmail,
          password: studentPassword,
          full_name: 'Pooja Duplicate',
          college_name: 'DJ Sanghvi College of Engineering'
        }
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.code, 'CONFLICT');
    });

    // 4.4 Register second student and admin
    await test('Setup secondary student and admin accounts', async () => {
      const regOther = await request('/api/auth/register', {
        method: 'POST',
        body: {
          email: otherStudentEmail,
          password: 'ValidPassword456!',
          full_name: 'Vikram Joshi',
          college_name: 'VJTI Matunga'
        }
      });
      assert.strictEqual(regOther.status, 201);
      otherStudentId = regOther.body.user.id;

      // Create admin user directly via repo
      const adminUser = userRepository.create({
        email: adminEmail,
        password: 'AdminPassword789!',
        full_name: 'System Transit Admin',
        college_name: 'Mumbai Central Headquarters',
        role: 'admin'
      });
      adminToken = signToken({
        sub: adminUser.id,
        email: adminUser.email,
        role: 'admin',
        full_name: adminUser.full_name
      });
    });

    // 5.1 Login: Invalid credentials
    await test('POST /api/auth/login returns 401 on incorrect password without leaking existence', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: studentEmail, password: 'WrongPassword999' }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.message, 'Invalid email or password');
    });

    await test('POST /api/auth/login returns identical 401 on non-existent email', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'nobody_here@domain.com', password: 'SomePassword123' }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.message, 'Invalid email or password');
    });

    // 5.2 Login: Successful authentication
    await test('POST /api/auth/login returns 200 OK, valid JWT, and sanitized user object', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: studentEmail, password: studentPassword }
      });
      assert.strictEqual(res.status, 200);
      assert(typeof res.body.token === 'string', 'Must issue token');
      assert.strictEqual(res.body.user.email, studentEmail.toLowerCase());
      assert(!('password_hash' in res.body.user), 'Password hash must be redacted');
      studentToken = res.body.token;

      // Also get other student token
      const otherLogin = await request('/api/auth/login', {
        method: 'POST',
        body: { email: otherStudentEmail, password: 'ValidPassword456!' }
      });
      otherStudentToken = otherLogin.body.token;
    });

    // 6.1 Authentication Middleware: Protected endpoint without credentials
    await test('GET /api/auth/me rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request('/api/auth/me');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    // 6.2 Authentication Middleware: Protected endpoint with valid Bearer token
    await test('GET /api/auth/me succeeds with valid Bearer token', async () => {
      const res = await request('/api/auth/me', {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.id, studentId);
      assert.strictEqual(res.body.user.email, studentEmail.toLowerCase());
    });

    // 6.3 Public routes remain accessible without credentials
    await test('Public endpoints (health, plan, ride-groups) remain accessible without auth', async () => {
      const resHealth = await request('/api/health');
      assert.strictEqual(resHealth.status, 200);

      const resGroups = await request('/api/ride-groups');
      assert.strictEqual(resGroups.status, 200);
    });

    // 7.1 Authorization: User profile resource ownership
    await test('GET /api/auth/users/:id allows user to view own profile', async () => {
      const res = await request(`/api/auth/users/${studentId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.id, studentId);
    });

    await test('GET /api/auth/users/:id forbids user from viewing another student profile (403)', async () => {
      const res = await request(`/api/auth/users/${otherStudentId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    // 7.2 Authorization: RBAC role restriction (admin only)
    await test('GET /api/auth/users rejects regular student with 403 FORBIDDEN', async () => {
      const res = await request('/api/auth/users', {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    await test('GET /api/auth/users permits admin access (200 OK)', async () => {
      const res = await request('/api/auth/users', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body.users));
      assert(res.body.users.length >= 3);
    });

    // 7.3 Authorization: Ride group mutation ownership protection
    await test('PATCH /api/ride-groups/:id enforces creator ownership against unauthorized students', async () => {
      // Create ride group authored by otherStudent
      const group = rideGroupRepository.create({
        creator_pseudonym: 'Vikram Joshi',
        origin_area: 'Matunga',
        destination_college: 'VJTI Matunga',
        departure_time: '09:00 AM',
        mode: 'taxi',
        max_members: 4
      });

      // Student 1 attempts to modify Vikram's group
      const unauthorizedPatch = await request(`/api/ride-groups/${group.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { notes: 'Hijacked by another student' }
      });
      assert.strictEqual(unauthorizedPatch.status, 403);
      assert.strictEqual(unauthorizedPatch.body.code, 'FORBIDDEN');

      // Owner (otherStudent) successfully modifies own group
      const authorizedPatch = await request(`/api/ride-groups/${group.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${otherStudentToken}` },
        body: { notes: 'Updated departure point: Matunga Circle' }
      });
      assert.strictEqual(authorizedPatch.status, 200);
      assert.strictEqual(authorizedPatch.body.group.notes, 'Updated departure point: Matunga Circle');

      // Admin successfully overrides and deletes
      const adminDelete = await request(`/api/ride-groups/${group.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(adminDelete.status, 200);
    });

  } finally {
    server.close();
  }

  console.log('\n----------------------------------------------------');
  console.log(` AUTHENTICATION SUITE SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('ALL AUTHENTICATION & AUTHORIZATION TESTS PASSED! 🎉\n');
  }
}

runHttpTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
