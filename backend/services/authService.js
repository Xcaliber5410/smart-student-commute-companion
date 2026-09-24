/**
 * AuthService
 *
 * Encapsulates authentication and registration business logic,
 * uniqueness constraints, credential hashing, and security flows.
 */

const { userRepository } = require('../repositories/UserRepository');
const { ConflictError } = require('../errors');

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
}

const authService = new AuthService();

module.exports = {
  AuthService,
  authService
};
