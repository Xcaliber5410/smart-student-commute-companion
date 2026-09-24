/**
 * AuthService
 *
 * Encapsulates authentication and registration business logic,
 * uniqueness constraints, credential hashing, and security flows.
 */

const { userRepository } = require('../repositories/UserRepository');
const { ConflictError, UnauthorizedError } = require('../errors');
const { signToken } = require('../utils/token');
const { verifyPassword } = require('../utils/password');

const DUMMY_SALT_HASH = '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

class AuthService {
  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  /**
   * Registers a new student account.
   *
   * @param {object} registrationData
   * @param {string} registrationData.email
   * @param {string} registrationData.password
   * @param {string} registrationData.full_name
   * @param {string} registrationData.college_name
   * @param {string} [registrationData.role='student']
   * @returns {object} Safe user representation without password hash
   */
  register(registrationData) {
    const existing = this.userRepo.findByEmail(registrationData.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    const user = this.userRepo.create(registrationData);
    return user.toSafeObject();
  }

  /**
   * Authenticates user credentials and generates a secure signed token.
   * Employs constant-time fake hashing to prevent timing-based user enumeration.
   *
   * @param {object} credentials
   * @param {string} credentials.email
   * @param {string} credentials.password
   * @returns {{ user: object, token: string }}
   * @throws {UnauthorizedError}
   */
  login(credentials) {
    const user = this.userRepo.findByEmail(credentials.email);

    if (!user) {
      // Execute dummy password verification to maintain uniform timing
      verifyPassword(credentials.password, DUMMY_SALT_HASH);
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = user.verifyPassword(credentials.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      college_name: user.college_name
    });

    return {
      user: user.toSafeObject(),
      token
    };
  }
}

const authService = new AuthService();

module.exports = {
  AuthService,
  authService
};
