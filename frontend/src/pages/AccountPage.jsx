import React, { useState } from 'react';
import {
  UserRound,
  LogIn,
  UserPlus,
  GraduationCap,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Alert,
  Button,
  ErrorState,
  Input,
  LoadingState,
  Tabs,
  TabPanel,
} from '../components/ui';

/**
 * Student Account (Day 14 feature screen)
 *
 * The frontend's authentication surface. The app stays anonymous-first: every
 * commute feature works without an account, and signing in is a voluntary,
 * device-local session that verifies the student against the real backend
 * auth contract (`POST /api/auth/login`, `POST /api/auth/register`,
 * `GET /api/auth/me`).
 *
 * Nothing here fabricates data:
 *  - The signed-in profile renders only from a session the App layer verified.
 *  - The session check renders an explicit loading state while it runs and an
 *    error state with retry when it fails (e.g. offline).
 *  - Signed out (the default) the page shows the auth forms plus an honest
 *    note that an account is optional.
 *
 * Business logic (validation, submit handling, session persistence) arrives
 * via props from the App layer; this component owns only form drafts and the
 * sign-in / create-account mode switch.
 *
 * @param {Object} props
 * @param {Object|null} [props.session] - Verified session `{ user }` or null
 * @param {boolean} [props.isHydrating] - Initial session verification in progress
 * @param {string|null} [props.hydrateError] - Friendly session-check error message
 * @param {Function} [props.onRetryHydrate] - Retry the failed session check
 * @param {boolean} [props.isRefreshingSession] - Background profile refresh running
 * @param {string|null} [props.lastVerifiedAt] - ISO time of last successful verification
 * @param {Function} [props.onSubmitSignIn] - ({ email, password }) sign-in attempt
 * @param {Function} [props.onSubmitRegister] - ({ email, password, full_name, college_name })
 * @param {boolean} [props.isSubmitting] - A sign-in/register request is in flight
 * @param {string|null} [props.submitError] - Server-side error for the current attempt
 * @param {Function} [props.onDismissSubmitError] - Clear the visible submit error
 * @param {Function} [props.onSignOut] - Sign out of the stored session
 */
export default function AccountPage({
  session = null,
  isHydrating = false,
  hydrateError = null,
  onRetryHydrate,
  isRefreshingSession = false,
  lastVerifiedAt = null,
  onSubmitSignIn,
  onSubmitRegister,
  isSubmitting = false,
  submitError = null,
  onDismissSubmitError,
  onSignOut,
}) {
  // Local auth-form state: which form is shown and the in-progress drafts.
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const user = session?.user || null;
  const isRegisterMode = mode === 'register';

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (isRegisterMode) {
      onSubmitRegister?.({
        email,
        password,
        full_name: fullName,
        college_name: collegeName,
      });
    } else {
      onSubmitSignIn?.({ email, password });
    }
  };

  const statusLine = isHydrating
    ? 'Checking your saved session…'
    : user
      ? `Signed in as ${user.full_name || user.email}.`
      : 'Signed out — browsing as a guest.';

  // Initials avatar for the profile card (falls back to the email prefix)
  const displayName = user?.full_name || user?.email || '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1
            id="account-title"
            className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2"
          >
            <UserRound className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
            Student Account
          </h1>
          <p className="text-sm text-slate-400">
            Optional sign-in for your student profile. Every commute feature — planning,
            live alerts, transit search — works without an account.
          </p>
          {/* Session state, announced politely so screen-reader users hear
              sign-in / sign-out / verification changes without watching. */}
          <p
            id="account-status"
            role="status"
            aria-live="polite"
            className="min-h-[1rem] text-xs text-slate-500"
          >
            {statusLine}
          </p>
        </div>
      </header>

      {/* Session verification in progress */}
      {isHydrating && (
        <LoadingState
          title="Checking your session…"
          description="Verifying the account saved on this device with the server."
          headingLevel={2}
        />
      )}

      {/* Session check failed and nothing is stored — honest error + retry */}
      {!isHydrating && hydrateError && !user && (
        <ErrorState
          title="Unable to verify your session"
          message={hydrateError}
          onRetry={onRetryHydrate}
          isRetrying={isHydrating}
          suggestions={[
            'Check your connection, then try again.',
            'You can still use every commute feature while signed out.',
          ]}
          headingLevel={2}
        />
      )}

      {/* Signed in — verified profile from GET /api/auth/me */}
      {!isHydrating && user && (
        <section
          aria-labelledby="account-profile-heading"
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center text-slate-950 font-extrabold text-sm shrink-0"
              aria-hidden="true"
            >
              {initials || <UserRound className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <h2 id="account-profile-heading" className="text-base font-bold text-slate-100 truncate">
                {user.full_name || 'Student account'}
              </h2>
              <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {user.email}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl px-3.5 py-2.5 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                College
              </dt>
              <dd className="text-slate-200 truncate flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                {user.college_name || 'Not provided'}
              </dd>
            </div>
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl px-3.5 py-2.5 min-w-0">
              <dt className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                Role
              </dt>
              <dd className="text-slate-200 capitalize truncate">
                {user.role || 'student'}
              </dd>
            </div>
          </dl>

          {hydrateError && (
            <Alert variant="warning" title="Could not refresh your profile">
              {hydrateError} Showing the account details saved on this device.
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
              <KeyRound className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                {isRefreshingSession
                  ? 'Refreshing your profile…'
                  : lastVerifiedAt
                    ? `Session verified ${new Date(lastVerifiedAt).toLocaleString()}.`
                    : 'Session stored on this device only.'}
              </span>
            </p>
            {onSignOut && (
              <Button
                type="button"
                variant="secondary"
                onClick={onSignOut}
                className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 shrink-0"
              >
                Sign out
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Signed out — the auth forms */}
      {!isHydrating && !user && !hydrateError && (
        <section
          aria-labelledby="account-auth-heading"
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4"
        >
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
            onChange={setMode}
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

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Input
                id="account-email"
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                icon={<Mail className="w-4 h-4" aria-hidden="true" />}
                required
                disabled={isSubmitting}
              />

              <div>
                <Input
                  id="account-password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  placeholder={isRegisterMode ? 'Choose a password' : 'Your password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded px-1"
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>

              {isRegisterMode && (
                <>
                  <Input
                    id="account-full-name"
                    label="Full name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
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
                    onChange={(event) => setCollegeName(event.target.value)}
                    hint="At least 2 characters — shown on your student profile."
                    required
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-slate-500">
                    Password must be at least 8 characters and include an uppercase letter,
                    a lowercase letter, and a number.
                  </p>
                </>
              )}

              {/* The action appears once the App layer wires the real service
                  handlers — this screen never submits to a fake backend. */}
              {(isRegisterMode ? onSubmitRegister : onSubmitSignIn) && (
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={isSubmitting}
                  icon={isRegisterMode ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
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
        </section>
      )}
    </div>
  );
}
