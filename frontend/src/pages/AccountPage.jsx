import React from 'react';
import { UserRound } from 'lucide-react';
import { ErrorState, LoadingState } from '../components/ui';
import AuthForm from '../components/AuthForm';
import AccountProfileCard from '../components/AccountProfileCard';

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
 * Presentation-only: validation, submission and session persistence arrive
 * via props from the App layer. The credential form lives in `AuthForm`, the
 * signed-in view in `AccountProfileCard`.
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
  const user = session?.user || null;

  const statusLine = isHydrating
    ? 'Checking your saved session…'
    : user
      ? `Signed in as ${user.full_name || user.email}.`
      : 'Signed out — browsing as a guest.';

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
        <AccountProfileCard
          user={user}
          isRefreshingSession={isRefreshingSession}
          lastVerifiedAt={lastVerifiedAt}
          refreshError={hydrateError}
          onRequestSignOut={onSignOut}
        />
      )}

      {/* Signed out — the auth forms */}
      {!isHydrating && !user && !hydrateError && (
        <section
          aria-labelledby="account-auth-heading"
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6"
        >
          <AuthForm
            onSubmitSignIn={onSubmitSignIn}
            onSubmitRegister={onSubmitRegister}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onDismissSubmitError={onDismissSubmitError}
          />
        </section>
      )}
    </div>
  );
}
