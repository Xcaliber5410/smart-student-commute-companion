# Authentication & Authorization Technical Specification

**Author:** Skan (Backend Developer)  
**Date:** Day 4 of 21-Day Roadmap  
**Scope:** Authentication, Authorization, Credential Security, Session Tokens, and Access Control (`/backend`)

---

## 1. Overview & Architecture

The **Smart Student Commute Companion** backend implements an enterprise-grade, secure, and maintainable authentication and authorization architecture designed specifically for college student mobility services:

- **Stateless Bearer Tokens (RFC 7519 compliant JWT)** using Node.js built-in `crypto` HMAC-SHA256 (`HS256`).
- **OWASP-Compliant Password Security** via Node.js native `crypto.scrypt` with 16-byte random salts and constant-time comparison to prevent side-channel timing attacks.
- **Uniform Anti-Enumeration Login**: Returns identical `401 Unauthorized` responses and timing profiles regardless of whether an email exists or a password was incorrect.
- **Strict Data Sanitization**: `password_hash` is completely redacted from all API serialization boundaries (`User.toSafeObject()`, `User.toJSON()`).
- **Resource Ownership & Role-Based Access Control (RBAC)**: Protects user accounts and student commute groups against Insecure Direct Object References (IDOR).

---

## 2. Credential Security & Password Policy

### 2.1 Password Complexity Requirements
- Minimum length: **8 characters**
- Maximum length: **128 characters**
- At least one **uppercase letter** (`[A-Z]`)
- At least one **lowercase letter** (`[a-z]`)
- At least one **numerical digit** (`[0-9]`)

### 2.2 Password Storage Format
Passwords are never persisted in plaintext. Each candidate password is processed using:
```javascript
const salt = crypto.randomBytes(16).toString('hex');
const derivedKey = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
return `${salt}:${derivedKey.toString('hex')}`;
```
Stored format: `<32-char-salt-hex>:<128-char-hash-hex>`

### 2.3 Verification & Anti-Timing Defense
Verification uses `crypto.timingSafeEqual` between candidate and stored buffers. When a non-existent email is targeted, a dummy password hash is calculated to ensure uniform response timing, mitigating account enumeration.

---

## 3. Token Lifecycle & Claims Specification

- **Algorithm**: `HS256` (HMAC-SHA256)
- **TTL**: 24 hours (`86400` seconds) by default
- **Header**: `{"alg":"HS256","typ":"JWT"}`
- **Claims Payload**:
  - `sub`: User unique identifier (`usr-...`)
  - `email`: Normalized lowercase email address
  - `role`: Account role (`student` | `admin`)
  - `full_name`: Student full name
  - `college_name`: Educational institution
  - `iat`: Epoch issuance timestamp in seconds
  - `exp`: Epoch expiration timestamp in seconds
- **Header Transport**: `Authorization: Bearer <token>`

---

## 4. API Reference

### 4.1 `POST /api/auth/register`
Creates a new verified student account.

- **Access**: Public
- **Request Body**:
```json
{
  "email": "aarav.sharma@djsce.ac.in",
  "password": "SecurePassword123!",
  "full_name": "Aarav Sharma",
  "college_name": "DJ Sanghvi College of Engineering"
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "timestamp": "2026-09-24T18:00:00.000Z",
  "message": "Account registered successfully",
  "user": {
    "id": "usr-1790267123456-a1b2c3d4",
    "email": "aarav.sharma@djsce.ac.in",
    "full_name": "Aarav Sharma",
    "college_name": "DJ Sanghvi College of Engineering",
    "role": "student",
    "created_at": 1790267123456,
    "updated_at": 1790267123456
  }
}
```

---

### 4.2 `POST /api/auth/login`
Authenticates credentials and issues a signed Bearer JWT token.

- **Access**: Public
- **Request Body**:
```json
{
  "email": "aarav.sharma@djsce.ac.in",
  "password": "SecurePassword123!"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-09-24T18:00:00.000Z",
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "usr-1790267123456-a1b2c3d4",
    "email": "aarav.sharma@djsce.ac.in",
    "full_name": "Aarav Sharma",
    "college_name": "DJ Sanghvi College of Engineering",
    "role": "student"
  }
}
```
- **Error Response (401 Unauthorized)**:
```json
{
  "success": false,
  "code": "UNAUTHORIZED",
  "message": "Invalid email or password"
}
```

---

### 4.3 `GET /api/auth/me`
Retrieves current authenticated profile from request token context.

- **Access**: Authenticated (`Authorization: Bearer <token>`)
- **Response (200 OK)**:
```json
{
  "success": true,
  "timestamp": "2026-09-24T18:00:00.000Z",
  "user": {
    "id": "usr-1790267123456-a1b2c3d4",
    "email": "aarav.sharma@djsce.ac.in",
    "full_name": "Aarav Sharma",
    "college_name": "DJ Sanghvi College of Engineering",
    "role": "student"
  }
}
```

---

### 4.4 `GET /api/auth/users/:id`
Retrieves a specific student account. Enforces resource ownership.

- **Access**: Owner or Admin
- **Behavior**: Returns `403 Forbidden` if student attempts to inspect another student's account.

---

### 4.5 `PATCH /api/auth/users/:id`
Updates profile information (`full_name`, `college_name`). Enforces resource ownership.

- **Access**: Owner or Admin
- **Behavior**: Returns `403 Forbidden` if student attempts to update another student's account.

---

### 4.6 `GET /api/auth/users`
Lists all registered users.

- **Access**: Admin only (`role: 'admin'`)
- **Behavior**: Returns `403 Forbidden` if invoked by standard `student` accounts.

---

## 5. Resource Ownership Matrix

| Resource | Operation | Allowed Actor | Guard Middleware |
| :--- | :---: | :--- | :--- |
| `RideGroup` | Read (`GET`) | Anyone (Public) | None |
| `RideGroup` | Create (`POST`) | Anyone / Authenticated | `optionalAuthenticate` |
| `RideGroup` | Update (`PATCH`) | Group Creator or Admin | `enforceRideGroupOwnership` |
| `RideGroup` | Delete (`DELETE`)| Group Creator or Admin | `enforceRideGroupOwnership` |
| `User` | Read Own (`GET`) | Account Owner or Admin | `requireUserOwnership` |
| `User` | Update Own (`PATCH`)| Account Owner or Admin | `requireUserOwnership` |
| `User` | Read All (`GET`) | Admin only | `requireRole(['admin'])` |

---

## 6. Verification and Testing

### 6.1 Running Authentication Tests
Execute the standalone Day 4 verification suite:
```bash
npm --prefix backend run verify:auth
```

### 6.2 Running All Backend Test Suites
Execute the entire test battery (route verification, error handling, validation, database integration, API integration, and auth):
```bash
npm --prefix backend run test:all
```
