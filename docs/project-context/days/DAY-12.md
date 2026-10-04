# Day 12 — Notification Read State & Unread Badges (Xcaliber)

> Verified from the Day-12 diffs, `verify-frontend.js` section 21, and the checks run
> at day end. Date: 2026-10-04 (all 7 commits).

## Objective

Complete the client-side slice of the **Notifications center** (documented as PARTIAL in
`FEATURES.md` §P1). Until Day 12, per-item read state lived only in component memory and
vanished on every reload or tab switch, and nothing in the app surfaced unread counts.
Day 12 makes read state persistent (device-local), adds unread badges to navigation,
adds a "Mark all as read" action, and generally finishes the screen as a real
notification center — while leaving the auth-blocked server feed (`GET /api/alerts`,
JWT) explicitly untouched and unfaked.

## Why this feature was selected

- **Documented as unfinished**: `FEATURES.md` P1 lists "persistent read state" as a
  concrete missing piece; the other missing piece (server feed) is BLOCKED on auth and
  must not be faked.
- **Strongest existing foundation**: `pages/NotificationsPage.jsx` and
  `components/NotificationItem.jsx` already existed — the work completes them instead of
  building a parallel surface.
- **Genuinely user-facing**: read state survives reloads; nav badges show what needs
  attention. Preferred over the remaining roadmap items, which are infrastructure
  (Background Sync — would require re-architecting the Day-11 queue because service
  workers cannot read localStorage — and push, which needs a server) or testing-only
  (Lighthouse/real-device checklist).
- **No new endpoints**: data still comes from the already-loaded live reports
  (`GET /api/live-reports` via `services/api.js`); persistence is localStorage through
  the existing `utils/uiPreferences.js` helpers.

## Implemented (verified from diffs)

- **Screen** `src/pages/NotificationsPage.jsx` — header now carries a read/unread
  summary (`{readTotal} of {reports.length} read` with the `UnreadCountBadge`), a
  **Mark all as read** button (disabled when nothing is unread), and the existing
  Refresh control. Read state moved from local component state to App-owned props
  (`readIds`, `onToggleRead`, `onMarkAllRead`, `unreadCount`). Filter options show live
  counts (`Unread only (5)` etc.). All previous states (loading, empty, error + retry,
  connection-lost alert, search/filter-empty) preserved.
- **Component** `src/components/ui/UnreadCountBadge.jsx` (new, Day 12) — reusable count
  pill: clamps at `9+` (`max` prop), renders nothing at zero, exposes an optional
  `srLabel` for a visually hidden description; variants `emerald` / `amber` / `dark`
  (active tab), sizes `sm` / `md`. Exported from the ui barrel and documented in
  `ui/README.md`.
- **Component** `components/NotificationItem.jsx` — now shows a visible **"Unread"**
  text `Badge` (read/unread is no longer conveyed by tint/opacity alone).
- **Interactions** — mark-all-as-read with optimistic update + confirmation toast
  ("Marked N notifications as read."); unread badge rendered in **all three**
  navigation surfaces (desktop top nav, mobile drawer, fixed bottom nav) via a new
  `unreadNotificationsCount` prop on `Navbar`; filter/view changes and per-item
  toggles keep counts live everywhere.
- **Persistence** `src/utils/uiPreferences.js` — new helpers
  `readNotificationReadIds()` / `writeNotificationReadIds()` under
  `smart_commute_notification_read_state`, using the file's existing failure-safe
  `safeRead`/`safeWrite` envelope (missing/corrupt storage → everything simply looks
  unread again) and bounded at `MAX_READ_NOTIFICATION_IDS = 300` with a stable
  newest-last policy (oldest read-marks expire first; survives load/save cycles).
  `App.jsx` hydrates state at mount and persists on every change via `useEffect`.
- **Responsiveness (C5)** — header split into `min-w-0 flex-1` copy block (description
  capped `max-w-2xl`) and a `shrink-0` button group that wraps (`sm:justify-end`);
  action buttons `whitespace-nowrap`; filter `Select` capped `max-w-full`; unread badge
  in the ten-item bottom nav positioned exactly like the existing feed badge
  (`-top-1 -right-2`, `shrink-0`, clamped) so labels stay unclipped at 360px. Desktop
  label tiers (icon-only <2xl, short 2xl–2199px, full ≥2200px) unchanged; the new badge
  adds ≤ ~20px worst case against the ~90px headroom the Day-11 measurement left at the
  2200px tier.
- **Accessibility (C6)** — rows now render as a semantic `<ul>`/`<li>` list; the
  header summary is a polite `role="status" aria-live="polite"` region announcing read
  progress; mark-all uses the project's focus-handoff pattern
  (`notifications-summary` → `tabindex="-1"` + `.focus()`) because the pressed button
  becomes disabled; desktop nav `aria-label` appends ", N unread notifications" (its
  `aria-label` would otherwise mask the badge's sr-only text); drawer/bottom badges
  announce via the component's `sr-only` label; new honest "You're all caught up" empty
  state when the Unread filter empties after mark-all (instead of a misleading "no
  match"); all focus rings, disabled states and the existing retry states retained.
- **Verify (C7)** — section "21. DAY 12 NOTIFICATION READ STATE" (23 checks) — suite
  reached **285 checks / 21 sections**.

## Important Files

`frontend/src/pages/NotificationsPage.jsx`, `frontend/src/components/NotificationItem.jsx`,
`frontend/src/components/ui/UnreadCountBadge.jsx`, `frontend/src/utils/uiPreferences.js`,
`frontend/src/App.jsx`, `frontend/src/components/Navbar.jsx`,
`frontend/verify-frontend.js`

## Routes Added/Changed

- **None.** The feature lives on the existing `?tab=notifications` tab (10-tab
  navigation unchanged); all other routes preserved. No `backend/` files touched
  (verified: Day-12 commits contain only `frontend/` and docs).

## Services / API Integrations

- Data: unchanged — live reports via the existing `services/api.js` contract
  (`GET /api/live-reports`) already loaded in App.
- Persistence: existing `utils/uiPreferences.js` conventions (localStorage,
  `smart_commute_*` key, failure-safe). No endpoint invented; no response fabricated.

## Client-Side State

App-level `notificationReadIds` (a `Set` hydrated from localStorage, persisted on every
change), derived `unreadNotificationsCount`, handlers `handleToggleNotificationRead` /
`handleMarkAllNotificationsRead` — prop-drilled to the screen and the Navbar. Page keeps
only view state (`query`, `view`). No global store introduced.

## PWA Behavior

No manifest/service-worker changes. Because read state is device-local storage, the
feature works fully offline with the cached shell — no new network dependency.

## Testing / Checks Performed

- `cd frontend && npm run verify` → **285/285** (baseline 262 + 23 Day-12 checks).
- `cd frontend && npm run build` → green (pre-existing >500 kB chunk warning only).
- Lint / type-check: N/A (not configured in this repo).
- Browser/CDP runtime checks: not run this session — "Not verified from repository
  implementation" for live responsive/AT verification; static analysis and the verify
  suite cover the committed source.

## Known Limitations

- Read state is device-local and id-based: reports that expire (or a demo reset with
  new ids) leave harmless orphan ids until they age past the 300-id cap.
- The notifications feed itself still renders only the already-loaded live reports —
  the server notification feed remains BLOCKED on auth (unchanged, not faked).
- Desktop header overflow with an unread badge present was reasoned statically from the
  Day-11 tier measurements, not re-measured in a browser this session (see Testing).
- Lint/type-check gates still absent (pre-existing).

## Backend Dependencies / Blockers

- None added. `GET /api/alerts` and the rest of `/api/notifications/*` still require
  JWT — unchanged blocker (FEATURES.md §B4).

## Git

- Start-of-day sync: `main` and `frontfeat` already aligned at `9e3a5ed`; merge of
  `main` into `frontfeat` reported "Already up to date" (no conflicts, nothing to push
  before work).
- Seven implementation commits (each pushed immediately, exact messages, no
  attribution):
  - `b0e0b75` feat(frontend): implement Day 12 feature screen
  - `8ddc897` feat(ui): add Day 12 feature components
  - `0e0351a` feat(frontend): add Day 12 feature interactions
  - `ea3acea` feat(frontend): integrate Day 12 feature with existing services
  - `2567def` fix(frontend): polish Day 12 feature responsiveness
  - `f3698e1` fix(frontend): improve Day 12 feature accessibility and states
  - `96e8288` test(frontend): verify Day 12 frontend implementation
- One docs commit (`docs: update project context for Day 12`), then end-of-day sync
  `main → frontfeat` and merge `frontfeat → main`, both pushed.

## Next Logical Frontend Work

- Still open from `frontend/PWA_SUMMARY.md` / `PWA_SETUP.md`: Background Sync and push
  notification support (both need real design decisions; push needs a server), the
  real-device/Lighthouse browser-testing checklist, and the stale roadmap checkboxes.
- Auth-gated domains (FEATURES.md §B1–B5) remain BLOCKED until a real auth story exists.
- Whether the 21-day roadmap has further frontend days beyond Day 12:
  "Not verified from repository implementation."
