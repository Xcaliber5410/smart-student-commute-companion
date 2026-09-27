/**
 * Authentication Validators
 *
 * Zod validation schemas for registration, login, and identity verification.
 */

const { z } = require('zod');
const { validatePasswordStrength } = require('../utils/password');

const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .transform(val => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .superRefine((val, ctx) => {
      const result = validatePasswordStrength(val);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.message
        });
      }
    }),
  full_name: z
    .string({ required_error: 'Full name is required' })
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name cannot exceed 100 characters')
    .transform(val => val.trim()),
  college_name: z
    .string({ required_error: 'College name is required' })
    .min(2, 'College name must be at least 2 characters')
    .max(150, 'College name cannot exceed 150 characters')
    .transform(val => val.trim()),
  role: z
    .enum(['student', 'admin'])
    .optional()
    .default('student')
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .max(255)
    .transform(val => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
});

module.exports = {
  registerSchema,
  loginSchema
};
