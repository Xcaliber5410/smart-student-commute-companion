import React from 'react';
import { GraduationCap, KeyRound, Mail, UserRound } from 'lucide-react';
import { Alert, Button } from './ui';

/**
 * AccountProfileCard - Signed-in session view for the Student Account screen
 *
 * Renders the profile verified through `GET /api/auth/me` (arrives via props
 * from the App layer). Shows honest session metadata only: refresh state,
 * last verification time, and whether the profile could not be refreshed —
 * it never invents details that were not returned by the server or stored on
 * this device.
 *
 * @param {Object} props
 * @param {Object} props.user - `{ id, email, full_name, college_name, role }`
 * @param {boolean} [props.isRefreshingSession] - Background profile refresh running
 * @param {string|null} [props.lastVerifiedAt] - ISO time of last successful verification
 * @param {string|null} [props.refreshError] - Friendly refresh failure message
 * @param {Function} [props.onSignOut] - Sign out of the stored session
 * @param {Function} [props.onRequestSignOut] - Ask for sign-out confirmation (wired with ConfirmDialog by the screen)
 */
export default function AccountProfileCard({
  user,
  isRefreshingSession = false,
  lastVerifiedAt = null,
  refreshError = null,
  onRequestSignOut,
}) {
  const displayName = user?.full_name || user?.email || '';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
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
          <dt className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            College
          </dt>
          <dd className="text-slate-200 truncate flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            {user.college_name || 'Not provided'}
          </dd>
        </div>
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl px-3.5 py-2.5 min-w-0">
          <dt className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Role
          </dt>
          <dd className="text-slate-200 capitalize truncate">{user.role || 'student'}</dd>
        </div>
      </dl>

      {refreshError && (
        <Alert variant="warning" title="Could not refresh your profile">
          {refreshError} Showing the account details saved on this device.
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400 flex items-center gap-1.5 min-w-0">
          <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {isRefreshingSession
              ? 'Refreshing your profile…'
              : lastVerifiedAt
                ? `Session verified ${new Date(lastVerifiedAt).toLocaleString()}.`
                : 'Session stored on this device only.'}
          </span>
        </p>
        {onRequestSignOut && (
          <Button
            type="button"
            variant="secondary"
            onClick={onRequestSignOut}
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 shrink-0"
          >
            Sign out
          </Button>
        )}
      </div>
    </section>
  );
}
