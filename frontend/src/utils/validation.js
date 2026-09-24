/**
 * Client-Side Validation Utility
 * 
 * Provides reusable validation rules, error messaging, and form helpers
 * to enhance user experience before network dispatch.
 * 
 * NOTE: Client-side validation is strictly for UX/ergonomics and does NOT
 * replace server-side security boundaries.
 */

// Regular expressions for client-side format checks
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TIME_24H_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Validate that a field has non-empty input
 * 
 * @param {any} value - Value to check
 * @param {string} [label='This field'] - Human-readable label for error message
 * @returns {string|null} Error message or null if valid
 */
export function validateRequired(value, label = 'This field') {
  if (value === undefined || value === null) {
    return `${label} is required.`;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return `${label} is required.`;
  }
  if (Array.isArray(value) && value.length === 0) {
    return `Please select at least one ${label.toLowerCase()}.`;
  }
  return null;
}

/**
 * Validate text length constraints
 * 
 * @param {string} value - Text value
 * @param {Object} options
 * @param {number} [options.minLength] - Minimum character length
 * @param {number} [options.maxLength] - Maximum character length
 * @param {string} [options.label='Text'] - Human-readable field label
 * @returns {string|null} Error message or null if valid
 */
export function validateText(value, { minLength, maxLength, label = 'This field' } = {}) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  if (minLength !== undefined && trimmed.length < minLength) {
    return `${label} must be at least ${minLength} characters (currently ${trimmed.length}).`;
  }
  if (maxLength !== undefined && trimmed.length > maxLength) {
    return `${label} cannot exceed ${maxLength} characters.`;
  }
  return null;
}

/**
 * Validate numeric constraints
 * 
 * @param {any} value - Value to check
 * @param {Object} options
 * @param {number} [options.min] - Minimum permitted value
 * @param {number} [options.max] - Maximum permitted value
 * @param {boolean} [options.integer=false] - Whether value must be an integer
 * @param {string} [options.label='Value'] - Human-readable field label
 * @returns {string|null} Error message or null if valid
 */
export function validateNumber(value, { min, max, integer = false, label = 'Value' } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);

  if (Number.isNaN(num)) {
    return `${label} must be a valid number.`;
  }
  if (integer && !Number.isInteger(num)) {
    return `${label} must be a whole number.`;
  }
  if (min !== undefined && num < min) {
    return `${label} cannot be less than ${min}.`;
  }
  if (max !== undefined && num > max) {
    return `${label} cannot be more than ${max}.`;
  }
  return null;
}

/**
 * Validate email address format
 * 
 * @param {string} value - Email address string
 * @param {string} [label='Email address'] - Human-readable label
 * @returns {string|null} Error message or null if valid
 */
export function validateEmail(value, label = 'Email address') {
  if (!value || typeof value !== 'string' || value.trim().length === 0) return null;
  if (!EMAIL_REGEX.test(value.trim())) {
    return `Please enter a valid ${label.toLowerCase()} (e.g., student@college.edu).`;
  }
  return null;
}

/**
 * Validate 24-hour time format (HH:MM)
 * 
 * @param {string} value - Time string
 * @param {string} [label='Time'] - Human-readable label
 * @returns {string|null} Error message or null if valid
 */
export function validateTime(value, label = 'Time') {
  if (!value || typeof value !== 'string') return null;
  if (!TIME_24H_REGEX.test(value.trim())) {
    return `Please specify ${label.toLowerCase()} in HH:MM format (24-hour).`;
  }
  return null;
}

/**
 * Validate an entire form data object against a declarative rules schema
 * 
 * @param {Object} data - Form data key-value pairs
 * @param {Object} schema - Validation schema mapping field names to validator rule arrays
 * @returns {{ isValid: boolean, errors: Record<string, string> }} Validation result
 * 
 * @example
 * const { isValid, errors } = validateForm(formData, {
 *   area: [(v) => validateRequired(v, 'Area'), (v) => validateText(v, { minLength: 3, label: 'Area' })],
 *   max_members: [(v) => validateNumber(v, { min: 2, max: 10, integer: true, label: 'Max members' })]
 * });
 */
export function validateForm(data, schema) {
  const errors = {};

  for (const [field, validators] of Object.entries(schema)) {
    const value = data[field];
    for (const validator of validators) {
      const error = validator(value, data);
      if (error) {
        errors[field] = error;
        break; // Stop at first error for this field
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Duplicate-submission prevention helper
 * Wraps an async submit handler to guard against rapid duplicate clicks.
 * 
 * @param {Function} asyncFn - Async submission function
 * @param {Object} options
 * @param {number} [options.debounceMs=500] - Window in ms to prevent duplicate invocation
 * @returns {Function} Guarded submit function
 */
export function createSubmitGuard(asyncFn, { debounceMs = 500 } = {}) {
  let isSubmitting = false;
  let lastSubmitTime = 0;

  return async (...args) => {
    const now = Date.now();
    if (isSubmitting || now - lastSubmitTime < debounceMs) {
      return;
    }

    try {
      isSubmitting = true;
      lastSubmitTime = now;
      return await asyncFn(...args);
    } finally {
      isSubmitting = false;
    }
  };
}
