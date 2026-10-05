# Day 14 — Student Account: Sign-In, Registration & Session (Xcaliber)

> Verified from the Day-14 diffs, `verify-frontend.js` section 25, and the browser
> checks run at day end. Date: 2026-10-05 (all 7 commits).

## Objective

Implement the frontend's authentication slice — the root blocker documented in
`FEATURES.md` §Backend Dependent **B1** ("Student authentication … requires a real
auth decision; fake auth is forbidden"). Day 14 makes that decision: an **optional,
device-local Student Account** wired to the real, publicly reachable backend auth
contract, with zero backend changes.

## Selected feature and why

**Student Account** — a new `?tab=account` screen where a student can create an
account, sign in, see their server-verified profile, and sign out.

Rationale (from the actual repository state, not the docs alone):

- Day 13's frontend (quiet hours) was complete; the remaining documented roadmap
  items were background sync (declined twice — duplicate-report risk) and doc drift.
- The start-of-day `main` merge brought the backend **study-planning suite**
  (Day-13 backend, `docs/project-context/days/DAY-13-BACKEND.md`) plus the earlier
  academic/calendar/notification/study-resource domains — **all JWT-gated**. The
  documented root cause was always the missing frontend auth decision.
- `POST /api/auth/register` and `POST /api/auth/login` are **unauthenticated**, so
  the integration was genuinely unblocked (priority: "frontend integration ready
  because its required backend/API contract already exists"). `GET /api/auth/me`
  (Bearer) verifies sessions.
- Nothing was duplicated: the frontend had zero auth code (verified by grep before
  Day 14).

The app stays **anonymous-first**: every existing feature works signed out, and
sign-in is voluntary. No forced login wall (product decision not implied by the
roadmap), no faked responses, no backend edits.

## Implemented (verified from diffs + runtime)

- **Nav/routing**: 11th `NAV_ITEMS` entry (`account`, `UserRound`, label
  "Account"), `pages/AccountPage.jsx` exported from `pages/index.js`, and an
  `App.jsx` `case 'account'` wired to the session resource (deep link
  `?tab=account` validated by the same `NAV_ITEMS` table).
- **Screen** `src/pages/AccountPage.jsx` — presentation-only shell with four
  states: session check in progress (`LoadingState`), unverifiable session
  (`ErrorState` + retry + honest suggestions), signed in
  (`AccountProfileCard`), signed out (`AuthForm`), plus a polite
  `role="status"` session line and a destructive `ConfirmDialog` before
  sign-out.
- **Components**:
  - `src/components/AuthForm.jsx` — owns the Sign in ↔ Create account `Tabs`
    mode switch, field drafts, and submit dispatch; the submit button renders
    only when the App layer supplies a real handler (it never posts to a fake
    backend).
  - `src/components/AccountProfileCard.jsx` — initials avatar, `dl` profile
    (name/email/college/role), refresh status, refresh-failure warning, sign-out.
  - `src/components/ui/PasswordField.jsx` (new kit component, barrel +
    `ui/README.md`) — labelled password input with an accessible reveal toggle
    (`aria-pressed`, `aria-controls`) sharing `Input`'s error/hint contract.
- **Interactions** `src/components/AuthForm.jsx` + `src/utils/validation.js` —
  new `validatePassword()` mirroring `backend/utils/password.js` byte-for-byte
  messages (8–128 chars, one upper, one lower, one digit — registration only);
  `validateForm` schemas mirror `registerSchema`/`loginSchema` (email ≤255,
  name 2–100, college 2–150); blur validation after engagement, clear-on-change,
  `focusFirstInvalid` on failed submit, mode switches reset mode-specific field
  and server errors, `isSubmitting` guards double-submit, `aria-busy` on the
  form.
- **Services**:
  - `src/utils/authSession.js` — failure-safe localStorage envelope
    (`smart_commute_auth_session`, `{token, user, savedAt}`; never a password),
    `readAuthToken()`, `clearAuthSession()`, and the
    `auth-session-expired` window event constant. Dependency-free so `api.js`
    and `auth.js` can both import it without a cycle.
  - `src/services/auth.js` — `signIn()` (POST `/auth/login`), `registerAccount()`
    (POST `/auth/register` **then a real `signIn()`** — the backend register
    response carries no token, verified against `authController.js`; a failed
    auto-login is reported honestly, never faked), `fetchCurrentUser()`
    (GET `/auth/me`, refreshes the cached profile; 401/404 → clear + guest,
    network → throw so the UI can retry), `signOut()`.
  - `src/services/api.js` — `request()` is now exported (one request path for
    all services); it attaches `Authorization: Bearer <token>` **only while a
    session exists**, never on `/auth/login`/`/auth/register`, and on any 401
    to an authenticated request clears the stored session and dispatches
    `auth-session-expired`. Signed-out requests are byte-for-byte unchanged
    from Day 13.
- **App wiring** `src/App.jsx` — `sessionResource` (`useAsyncResource`) verifies
  any stored session once on launch (`sessionResource.load()` in the existing
  mount effect); `handleSignIn` / `handleRegisterAccount` / `handleSignOut` /
  `handleRetrySessionCheck`; a listener on `auth-session-expired` drops state to
  guest and toasts "Your session expired — please sign in again."; toasts for
  sign-in/register/sign-out.

## Important Files

`frontend/src/pages/AccountPage.jsx`, `frontend/src/components/AuthForm.jsx`,
`frontend/src/components/AccountProfileCard.jsx`,
`frontend/src/components/ui/PasswordField.jsx`,
`frontend/src/utils/authSession.js`, `frontend/src/services/auth.js`,
`frontend/src/services/api.js`, `frontend/src/App.jsx`,
`frontend/src/components/Navbar.jsx`, `frontend/src/utils/validation.js`,
`frontend/verify-frontend.js`

## Routes Added/Changed

- **Frontend**: one new tab (`account`, 11th) — `NAV_ITEMS`, `App.jsx` switch
  case, `pages/index.js`. No backend files.
- **Backend endpoints consumed (read-only integration, nothing modified)**:
  `POST /api/auth/register` (public), `POST /api/auth/login` (public),
  `GET /api/auth/me` (Bearer).

## Services / API Integrations

Verified against a **running local backend** before Commit 4 (real HTTP, not
assumed): register → 201 `{message, user}`; duplicate email → 409; login →
`{token, user}`; `/auth/me` valid → `{user}`, bad token → 401; wrong password →
401; weak password → 400 with the message the client mirrors. JWT TTL is 24 h
(`backend/utils/token.js`); the frontend re-verifies the session on every launch,
so expiry surfaces as the same handled 401 path.

## Client-Side State

App-level `sessionResource` (data = verified `{token, user, savedAt}` or null),
`isSubmittingAuth`, `authSubmitError`, `lastVerifiedAt`; AuthForm-local mode/
drafts/touched/field errors; AccountPage-local sign-out confirmation. Persistence
= `smart_commute_auth_session` (failure-safe; corrupt payloads behave as signed
out). No global store introduced.

## PWA Behavior

None added to `sw.js`/manifest — API requests stay network-only, and the session
is plain localStorage like every other `smart_commute_*` store. The tab is
reachable via `?tab=account` deep links like the other tabs.

## Responsive pass (Commit 5, measured — not eyeballed)

Headless-Chrome measurements (session-local scripts, not committed) across 12
viewports 360→3000 px, before/after:

- **Bug found & fixed**: the 11th nav item made short labels (≥1536px) overflow
  the viewport by up to **89 px** and full labels (≥2200px) by up to **113 px**
  (the 10-item baseline was already 20 px over at exactly 2200). Label tiers
  re-measured and moved: icon-only <1840px, short 1840–2599px, full ≥2600px.
- **Bug found & fixed**: at ≥1536px the brand collapsed to ~0 px and its logo
  **overlapped the first nav button** (pre-existing at 10 items too). The brand
  now keeps `min-w-10` so the logo can never collide with the nav.
- Final audit: 12/12 viewports `overflowX = 0`, no logo/nav overlap, 11-item
  bottom nav fits 360 px with ≥47 px touch targets, form always in viewport.

## Accessibility pass (Commit 6, measured)

Headless-Chrome a11y audit, 10/10 after fixes: exactly one `h1`, no skipped
heading levels, every control labelled, every button named, no positive
`tabindex`, `aria-invalid` fields wired to `role=alert` text, focus indicator on
focused fields, arrow-key tab switching, reveal toggle semantics, labelled modal
dialog with focus trap + Escape + focus restore. **Bug found & fixed**: focus
fell to `<body>` when state branches swapped (after sign-in/sign-out) — added a
branch-transition focus handoff (profile heading ← form, first field ←
profile/error) using the Day-12 `tabindex="-1"` pattern. Small-text contrast
bumped `slate-500 → slate-400` on the Day-14 surfaces.

## Testing / Checks Performed

- `cd frontend && npm run verify` → **351/351** (baseline 319 + 32 Day-14
  checks in new section 25; one Day-10 label-tier lock updated to the new
  measured thresholds — intent preserved, not weakened).
- `cd frontend && npm run build` → green (pre-existing >500 kB chunk warning).
- Lint / type-check: N/A (not configured in this repo).
- **Runtime flow test** (headless Chrome + running backend): 18/18 — empty-submit
  validation + focus handoff, register → auto sign-in, session persisted,
  sign-out dialog fits 360 px, cancel keeps session, reload rehydrates via
  `/auth/me`, confirm signs out + clears storage, wrong password → visible
  error alert + no session stored, correct sign-in, invalid stored token →
  guest + cleared storage + expiry notice, failed session check → retryable
  `ErrorState` → retry recovers, signed-in desktop no-overflow.
- **Responsive audit**: 12/12 viewports PASS (see above).
- **a11y audit**: 10/10 PASS (see above).
- Browser/session tooling (puppeteer-core installed with `--no-save`, scripts
  in the OS temp dir) was **session-local and not committed** — same stance as
  Days 7–11.

## Known Limitations

- Sign-in is **optional and device-local**: no login wall, no cross-device sync,
  no profile-editing UI (the backend has `PATCH /auth/users/:id`, not consumed —
  deliberately left for a future day rather than half-built).
- `signOut()` clears the device session only — the backend contract has no
  token-revocation endpoint, so a copied token stays valid until its 24 h expiry
  (server-side limitation; documented, not faked).
- A register that succeeds but whose automatic sign-in fails leaves the student
  in register mode with an honest message to sign in (edge case; no auto-switch
  of form mode).
- Authenticated domains B2–B5 (academic, calendar, notification feed, study
  plans) are now **reachable** (a session exists) but still have **no screens** —
  future days can consume them; none were faked today.
- `frontend/PWA_SETUP.md` doc drift and background sync remain open (unchanged
  from Day 13).

## Backend Dependencies / Blockers

- None added. All three endpoints exist and were exercised for real against the
  running server. No backend file was modified.
- The JWT-gated *data* domains remain unused by the UI (see above) — a
  deliberate scope boundary, not a blocker.

## Next Logical Frontend Work

- Consume one authenticated domain now that sessions exist — the **study-plan
  screens** against `/api/student/study-plans` (backend contract landed in the
  Day-14 start-of-day merge) or academic/calendar — each would repeat the
  7-commit cycle.
- Optional profile management / password change (backend endpoints exist).
- Background sync for the Day-11 queue remains the top open correctness question
  (same duplicate-report risk as documented on Days 11/13).

## Git

- Start-of-day sync: `frontfeat` merged latest `main` (7 new backend commits:
  `920d2da…f36a12b`, study-planning suite); clean working tree; no conflicts.
- Seven implementation commits (each pushed immediately, exact messages, no
  attribution):
  - `c75302a` feat(frontend): implement Day 14 feature screen
  - `74bc4dd` feat(ui): add Day 14 feature components
  - `646546c` feat(frontend): add Day 14 feature interactions
  - `6bea7f0` feat(frontend): integrate Day 14 feature with existing services
  - `95d41b5` fix(frontend): polish Day 14 feature responsiveness
  - `026f001` fix(frontend): improve Day 14 feature accessibility and states
  - `1a7dcec` test(frontend): verify Day 14 frontend implementation
- One docs commit (this file + context updates), pushed; end-of-day sync
  `main → frontfeat` and merge `frontfeat → main`, both pushed.
