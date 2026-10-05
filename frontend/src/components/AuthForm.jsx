import React, { useState } from 'react';
import { LogIn, UserPlus, Mail } from 'lucide-react';
import { Alert, Button, Input, Tabs, TabPanel } from './ui';
import PasswordField from './ui/PasswordField';
import {
  focusFirstInvalid,
  validateEmail,
  validateForm,
  validatePassword,
  validateRequired,
  validateText,
} from '../utils/validation';

// Field → DOM id map so failed submits hand focus to the first invalid field
const AUTH_FIELD_IDS = {
  email: 'account-email',
  password: 'account-password',
  full_name: 'account-full-name',
  college_name: 'account-college',
};

/**
 * Build the client-side rules for the active mode. The rules mirror the
 * backend's `registerSchema` / `loginSchema` (same limits, same messages) so
 * the form rejects exactly what the server would reject — never more.
 *
 * @param {boolean} isRegisterMode - Register rules vs sign-in rules
 * @returns {Object} validateForm() schema
 */
function buildAuthSchema(isRegisterMode) {
  const schema = {
    email: [
      (value) => validateRequired(value, 'Email address'),
      (value) => (value && value.length > 255 ? 'Email cannot exceed 255 characters' : null),
      (value) => validateEmail(value),
    ],
    password: [
      (value) => validateRequired(value, 'Password'),
      (value) => validatePassword(value, { registration: isRegisterMode }),
    ],
  };

  if (isRegisterMode) {
    schema.full_name = [
      (value) => validateRequired(value, 'Full name'),
      (value) => validateText(value, { minLength: 2, maxLength: 100, label: 'Full name' }),
    ];
    schema.college_name = [
      (value) => validateRequired(value, 'College name'),
      (value) => validateText(value, { minLength: 2, maxLength: 150, label: 'College name' }),
    ];
  }

  return schema;
}

/**
 * AuthForm - Sign-in / create-account form for the Student Account screen
 *
 * Owns everything about the credential form: the Sign in ↔ Create account
 * mode switch, the in-progress field drafts, and the password reveal (via
 * `ui/PasswordField`). Submission reuses the real backend auth contract and
 * arrives through props — this component never fabricates a response.
 *
 * The surrounding screen (session states, profile card) lives in
 * `pages/AccountPage.jsx`; validation rules and submit guards are layered on
 * in the interaction pass.
 *
 * @param {Object} props
 * @param {Function} props.onSubmitSignIn - ({ email, password }) => Promise|void
 * @param {Function} props.onSubmitRegister - ({ email, password, full_name, college_name }) => Promise|void
 * @param {boolean} [props.isSubmitting] - A request is in flight (disables the form)
 * @param {string|null} [props.submitError] - Server-side error for the current attempt
 * @param {Function} [props.onDismissSubmitError] - Clear the visible submit error
 */
export default function AuthForm({
  onSubmitSignIn,
  onSubmitRegister,
  isSubmitting = false,
  submitError = null,
  onDismissSubmitError,
}) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  // A field validates on blur once the student has engaged with it, or after
  // the first submit attempt — tabbing past an untouched empty field never
  // shouts "required" at them.
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const isRegisterMode = mode === 'register';

  const currentValues = () =>
    isRegisterMode
      ? { email, password, full_name: fullName, college_name: collegeName }
      : { email, password };

  const validateSingle = (name, value) => {
    const schema = buildAuthSchema(isRegisterMode);
    if (!schema[name]) return null;
    const { errors } = validateForm({ [name]: value }, { [name]: schema[name] });
    return errors[name] || null;
  };

  const clearFieldError = (name) => {
    setFieldErrors((current) =>
      current[name] ? { ...current, [name]: undefined } : current
    );
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    // Errors belong to the mode that produced them (sign-in rules differ from
    // registration rules) — drop both field errors and the server message.
    setFieldErrors({});
    setTouched({});
    setSubmitAttempted(false);
    onDismissSubmitError?.();
  };

  const handleBlur = (name, value) => {
    setTouched((current) => ({ ...current, [name]: true }));
    const shouldValidate = submitAttempted || touched[name] ||
      (typeof value === 'string' && value.trim().length > 0);
    if (!shouldValidate) return;
    const error = validateSingle(name, value);
    setFieldErrors((current) => ({ ...current, [name]: error || undefined }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting) return; // ignore Enter/double-click while a request runs

    const values = currentValues();
    const { isValid, errors } = validateForm(values, buildAuthSchema(isRegisterMode));
    setSubmitAttempted(true);

    if (!isValid) {
      setFieldErrors(errors);
      focusFirstInvalid(errors, AUTH_FIELD_IDS);
      return;
    }

    setFieldErrors({});
    if (isRegisterMode) {
      onSubmitRegister?.(values);
    } else {
      onSubmitSignIn?.(values);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 id="account-auth-heading" className="text-base font-bold text-slate-100">
          {isRegisterMode ? 'Create your student account' : 'Sign in to your account'}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Your session stays on this device. No account is needed for route planning,
          live alerts, or transit search.
        </p>
      </div>

      <Tabs
        idPrefix="account-auth"
        ariaLabel="Account access mode"
        tabs={[
          { id: 'signin', label: 'Sign in', icon: LogIn },
          { id: 'register', label: 'Create account', icon: UserPlus },
        ]}
        activeTab={mode}
        onChange={handleModeChange}
      />

      <TabPanel idPrefix="account-auth" tabId={mode}>
        {submitError && (
          <div className="mb-4">
            <Alert
              variant="error"
              title={isRegisterMode ? 'Could not create the account' : 'Could not sign in'}
              dismissible
              onDismiss={onDismissSubmitError}
            >
              {submitError}
            </Alert>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
          className="space-y-4"
        >
          <Input
            id="account-email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@college.edu"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError('email');
            }}
            onBlur={(event) => handleBlur('email', event.target.value)}
            error={fieldErrors.email}
            icon={<Mail className="w-4 h-4" aria-hidden="true" />}
            required
            disabled={isSubmitting}
          />

          <PasswordField
            id="account-password"
            label="Password"
            autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
            placeholder={isRegisterMode ? 'Choose a password' : 'Your password'}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError('password');
            }}
            onBlur={(event) => handleBlur('password', event.target.value)}
            error={fieldErrors.password}
            required
            disabled={isSubmitting}
          />

          {isRegisterMode && (
            <>
              <Input
                id="account-full-name"
                label="Full name"
                type="text"
                autoComplete="name"
                placeholder="Your full name"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  clearFieldError('full_name');
                }}
                onBlur={(event) => handleBlur('full_name', event.target.value)}
                error={fieldErrors.full_name}
                required
                disabled={isSubmitting}
              />
              <Input
                id="account-college"
                label="College name"
                type="text"
                autoComplete="organization"
                placeholder="Your college"
                value={collegeName}
                onChange={(event) => {
                  setCollegeName(event.target.value);
                  clearFieldError('college_name');
                }}
                onBlur={(event) => handleBlur('college_name', event.target.value)}
                error={fieldErrors.college_name}
                hint="At least 2 characters — shown on your student profile."
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-slate-400">
                Password must be at least 8 characters and include an uppercase letter,
                a lowercase letter, and a number.
              </p>
            </>
          )}

          {/* The action appears once the App layer wires the real service
              handlers — this form never submits to a fake backend. */}
          {(isRegisterMode ? onSubmitRegister : onSubmitSignIn) && (
            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              icon={
                isRegisterMode ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )
              }
            >
              {isRegisterMode
                ? isSubmitting
                  ? 'Creating account…'
                  : 'Create account'
                : isSubmitting
                  ? 'Signing in…'
                  : 'Sign in'}
            </Button>
          )}
        </form>
      </TabPanel>
    </div>
  );
}
