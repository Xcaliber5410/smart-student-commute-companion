# Current State — Smart Student Companion

> Verified against the repository working tree and Git history at frontend Day 12
> (HEAD `96e8288`, 2026-10-04, `frontfeat`; end-of-day merge to `main` follows this
> docs commit). Anything unverifiable is marked
> "Not verified from repository history."

---

## Current Branches

| Branch | State |
|---|---|
| `main` | At `9e3a5ed` (Day-11 docs on top of backend study-resources suite `df275de`) before Day 12's end-of-day merge; receives completed frontend days. |
| `frontfeat` | At Day-12 HEAD (`96e8288` + docs). Xcaliber's working branch — Day-12 work merged to `main` at day end. |
| `origin/day-01-foundation` | Historical Day-1 branch (tip `e8facbb`), unused now. |
| `fix/budget-and-mode-filtering` | Local stale branch from the hackathon era; outside the daily workflow. |

---

## Current Frontend

- **Framework**: React 18.3 + Vite 6 + Tailwind CSS 3.4 (`frontend/`), JSX only.
- **Application shell**: `src/layouts/AppShell.jsx` → `MainLayout.jsx` (sticky
  `Navbar` header + content + optional sidebar `MapView`) with `PwaStatusBanner` and the
  Day-9  `InstallPromoBanner` above page content; fixed 10-item mobile bottom nav.
- **Routing**: none (no react-router). `App.jsx` renders a page by switching on
  `activeTab` (default `'planner'`). `?tab=<id>` deep links initialize the tab on load
  (validated against `NAV_ITEMS`; invalid → planner). Unknown tab → `NotFound`.
- **Pages (10)** — `src/pages/index.js`: `PlannerPage`, `MyCommutesPage`,
  `TravelTogetherPage`, `LiveAlertsPage`, `TransitSearchPage`, `NotificationsPage`,
  `DeviceAlertsPage`, `InstallShareHubPage`, `AnalyticsPage` (Day 10),
  `OfflineQueuePage` (Day 11).
- **Components**: feature components in `src/components/` (Navbar, PlannerForm,
  RouteResults, MapView, CreateReportModal, CreateGroupModal, FeedbackModal,
  PreferencesDialog, DashboardOverview, SavedCommutes, TransitSearchForm,
  TransitResults, LiveStudentFeed, NotificationItem, DeviceAlertPermissionCard,
  PwaStatusBanner, InstallPromoBanner, Toast, ConfirmDialog usage…); reusable kit in
  `src/components/ui/` (~30 components incl. Day-10 `EventLogList`, barrel `index.js`,
  conventions in its README).
- **State management**: local component state + App-level `useState` prop drilling;
  `useAsyncResource` hook for loading/error/retry; no global store library. Day 11
  added App-level offline-queue state (`queue`, `isSyncingQueue`) for the offline
  report queue; Day 12 added App-level `notificationReadIds` +
  `unreadNotificationsCount` (drives the Notifications screen and nav badges).
- **Persistence**: `src/utils/uiPreferences.js` localStorage helpers — app preferences,
  transit sort, recent searches, saved commutes, device-alert pref, install-promo
  snooze (via `services/installPromotion.js`); Day-10 analytics snapshot in
  `smart_commute_pwa_analytics` (via `services/pwaAnalytics.js`, merged with the SW's
  own metrics store); Day-11 offline report queue in `smart_commute_offline_queue`
  (via `services/offlineQueue.js`, bounded at 50 items, failure-safe envelope); Day-12
  notification read state in `smart_commute_notification_read_state` (via
  `utils/uiPreferences.js` helpers, bounded at 300 ids, failure-safe).
- **Notifications (UI)**: `Toast` queue (polite `role=status`; errors `role=alert`) +
  `NotificationsPage` (client-side view over loaded live reports with search, all/unread
  view, per-item read state **persisted on device since Day 12**, mark-all-as-read,
  live read counts, "all caught up" state) + unread `UnreadCountBadge` in all three
  nav surfaces + Day-7 device alerts.
- **Forms**: controlled components built on `ui/FormField` + `utils/validation.js`
  (client-side validation only; submissions go through `api.js` services).
- **Responsive behavior**: Tailwind breakpoints; icon/short/full-label scaling in
  `Navbar` (ten tabs since Day 11: icon-only <1536px, short from 2xl → 2199px, full
  labels ≥2200px — re-measured because ten full labels no longer fit at 1920px), mobile
  drawer + fixed bottom nav (tightened to `text-[10px]`/`px-0.5` for ten items), grids
  collapse `sm:`/`md:`. Verified by local audits at 360–1920 px (tooling was
  session-local, not committed — see "Testing" below).

---

## Current Features (verified in source)

See `FEATURES.md` for the full inventory with statuses. Present and working: route
planning, live alerts feed (+ create/confirm/contradict reports), travel-together ride
groups (create/join), GTFS transit search, My Commutes (saved plans), dashboard
overview, preferences dialog, feedback modal, notifications view, device alerts,
install & share hub (share target, deep links, shortcuts),install promotion banner with 7-day snooze, PWA analytics & monitoring dashboard (Day 10 — install tracking,
offline usage, cache hit/miss rates, SW error monitoring; device-local only), offline
report queue (Day 11 — reports filed while offline persist locally and auto-deliver on
reconnect), demo reset, offline shell + update banner, socket live sync.

---

## Current API Dependencies

Base URL: `API_BASE_URL` = `VITE_API_BASE_URL` (default **`/api`**) from
`frontend/src/config/index.js`.

### AVAILABLE (verified: called by `frontend/src/services/api.js`, and the backend
route files for these paths do **not** require authentication)

| Endpoint (under `/api`) | Used by |
|---|---|
| `GET /health` | connectivity check |
| `POST /plan` | route planner |
| `GET /live-reports` | live alerts feed |
| `POST /live-reports` | create report |
| `POST /live-reports/:id/confirm`, `POST /live-reports/:id/contradict` | crowd voting (x-user-token pseudonym) |
| `GET /ride-groups` | travel together |
| `POST /ride-groups`, `POST /ride-groups/:id/join` | create/join group |
| `GET /transit/search` | transit search |
| `POST /feedback` | route feedback submission |
| `POST /demo/reset` | demo reset |

Plus **Socket.IO** events (client listens): `live_report_created`,
`live_report_updated`, `live_report_expired`, `demo_reset`,
`connect`/`disconnect`/`connect_error`; client emits `join_commute_channel`.

(The backend also exposes unauthenticated by-id reads such as
`GET /live-reports/:id`, `GET /ride-groups/:id`, and `GET /feedback` — **not called**
by the current frontend, verified against `api.js`.)

### EXPECTED BUT NOT CURRENTLY AVAILABLE TO THE FRONTEND (backend exists but requires
`Authorization: Bearer <JWT>` — the frontend has no auth, so these are unreachable)

- `/api/auth/*` (`POST /auth/register`, `POST /auth/login`, `GET /auth/me`, user CRUD)
- `/api/student/*` (`GET /student/context`, `GET /student/dashboard` …)
- `/api/notifications/*` (incl. `GET /alerts`) — while `NotificationsPage` currently
  renders client-side from loaded reports
- `/api/academic/*` (courses, subjects, assignments, goals, productivity summaries)
- `/api/calendar/*` (calendar events, study sessions, upcoming work, workload analytics)

Exact endpoint lists for the authenticated groups are in the route files
(`backend/routes/{auth,student,notification,academic,calendar}Routes.js`); the
frontend does not call any of them (verified: no such paths in `frontend/src`).

---

## Authentication

- Backend: JWT Bearer auth implemented (`backend/middleware/authMiddleware.js`),
  applied via `router.use(authenticate)` in the auth/student/notification/academic/
  calendar route files (verified by grep).
- Frontend: **no authentication implementation whatsoever** — no login UI, no token
  storage, no auth headers. The only token present is `smart_commute_user_token`, a
  random client-generated pseudonym used **only** for crowd-vote de-duplication
  (`x-user-token`), explicitly documented in `api.js` as "UX, not security".
- Consequence / **documented blocker**: any feature requiring authenticated endpoints
  is BLOCKED. Authentication must not be faked. (Not verified from repository history:
  whether/when an auth story is planned for the frontend.)

---

## Current PWA

- **Manifest** (`frontend/public/manifest.json`): name "Smart Student Commute
  Companion", short `SSCC`, `start_url "/"`, `display standalone`, theme `#10b981`,
  background `#020617`, SVG icon set (72–512 + maskable) in `public/icons/`,
  categories education/travel/navigation, **shortcuts**: "Plan Route" → `/?tab=planner`,
  "Live Feed" → `/?tab=feed`; **share_target**: POST `/share-target`,
  `enctype multipart/form-data`.
- **Service worker** (`frontend/public/sw.js`): pre-caches `STATIC_ASSETS` into
  `sscc-static-v1`; network-only for API/WebSocket; `message` → `skipWaiting`;
  activation cleans old `sscc-*` caches; fetch handler processes the share-target POST
  (payload cache `share-target-payload-v1`, message to window client, redirect `/`).
  Day 10 added a **separate metrics store** — cache `pwa-analytics-v1` (URL
  `/__pwa-analytics-store__`, intentionally not `sscc-`-prefixed so activation cleanup
  skips it) holding cache hit/miss counters and worker error counts,
  `recordAnalytics()` on fetch (same-origin only) + `error`/`unhandledrejection`
  listeners, and `pwa-analytics-sync`/`pwa-analytics-reset` message branches with
  `pwa-analytics-updated` broadcasts. Verified absent: `push` event handler,
  Background Sync.
- **Caching**: static shell only; no API/data caching (privacy stance documented in
  `frontend/PWA_SUMMARY.md`). The Day-10 analytics cache stores numeric counters only,
  not response content.
- **Notifications**: `Notification` API through `services/deviceAlerts.js`
  (with `registration.showNotification` fallback for Android Chrome); raises alerts for
  `live_report_created` when the tab is unfocused, pref enabled, permission granted.
  This is **not** Web Push (no server push subscription exists).
- **Offline behavior**: cached app shell keeps UI browsable; `PwaStatusBanner` shows an
  offline notice; data actions fail with retry states; since Day 11, report submissions
  that fail with a network error are saved to the device-local offline queue
  (`?tab=offlinequeue`) and delivered automatically on the `online` event / next
  launch. No Background Sync (verified absent).
- **Installability**: `usePwaInstall` captures `beforeinstallprompt`; install entry
  points = Navbar install button, Day-8 hub (manual steps incl. iOS), Day-9 promo
  banner (engagement-timed, 7-day snooze on dismiss). Day 10 records install outcomes
  (accepted/dismissed/unavailable, `appinstalled` timestamp) on-device.
- **SW registration**: `utils/registerSW.js`, production-only by default
  (`VITE_SW_DEV=true` to enable in dev).

---

## Current Testing

- **Framework**: none (no Jest/Vitest/Playwright — verified no such deps).
- **Test command**: `cd frontend && npm run verify` (= `npm test`) →
  `frontend/verify-frontend.js`, Node script, currently **285 checks / 21 sections**,
  all passing; exit code gates CI-less workflow. Static source assertions (files exist,
  patterns present), not runtime tests.
- **Lint**: not configured (no eslint config/script — verified). Report as N/A.
- **Type-check**: not configured (no TypeScript — verified). Report as N/A.
- **Build**: `npm run build` (Vite) — passes; known warning: chunk > 500 kB.
- **PWA checks**: section 6 of `verify-frontend.js` (manifest/SW/meta), section 19
  (Day-10 analytics), section 20 (Day-11 offline queue), section 21 (Day-12
  notification read state), + manual browser testing
  documented in `frontend/PWA_TESTING.md`.
  Browser-based responsive/a11y audits used during Days 7–10 were **session-local
  tools, not committed** — "Not verified from repository history" as reusable repo
  assets.

---

## Known Issues / Blockers (verified only)

1. **JWT gap** (Authentication section) — authenticated backend domains unreachable.
2. No lint/type-check gates — style/typo regressions rely on code review + verify.
3. Vite build warning: bundle chunk > 500 kB (pre-existing, flagged every build).
4. `frontend/PWA_SETUP.md` roadmap checkboxes are stale (Day 8–11 items implemented in
   code but unchecked in the file).
5. Day-6 empty commits anomaly (`9a43783…957a74d`) pollute history with 7 no-op commits
   carrying Day-6 messages; real Day 6 = `a1e3d78…8a3f441` (see `days/DAY-06.md`).
6. **Pre-existing share-target messaging bug** (documented Day 10, NOT fixed):
   `services/shareTarget.js` listens on `window` for SW messages, but SW
   `client.postMessage()` arrives on the `navigator.serviceWorker` container — so
   Day-8's SW→page share-target messages never reach that handler (the sessionStorage
   fallback covers the real flow). See `days/DAY-10.md`.

---

## Next Logical Work (from repository/roadmap evidence only — no product decisions)

- **Frontend Day 12 is complete** (Notification Read State & Unread Badges —
  `days/DAY-12.md`); the same 7-commit cycle would continue for any Day 13+ on
  `frontfeat`. Next roadmap items still open: Background Sync / push support
  (push needs a server; Background Sync would require re-architecting the Day-11 queue
  because service workers cannot read localStorage) and real-device Lighthouse PWA
  testing (`frontend/PWA_SUMMARY.md` medium-term + browser-testing checklists).
- `frontend/PWA_SETUP.md` "Future PWA Roadmap" still lists **Day 10: Analytics &
  Monitoring** as unchecked (doc drift — implemented in code in Day 10); the file's
  Day 8–9 boxes are likewise stale.
- `frontend/PWA_SUMMARY.md` "Medium Term (Days 4-7)" still lists background sync, push
  notification support and enhanced offline UX as planned (offline request queueing is
  now implemented in code as of Day 11, but the file itself was not edited); its
  "Requires Browser Testing" checklist (Lighthouse, real devices) is unticked.
- Backend-dependent feature areas (auth-gated) remain unusable from the frontend until
  an auth decision is made — see Authentication.
- Whether the 21-day roadmap has further frontend days beyond Day 10:
  "Not verified from repository history."
