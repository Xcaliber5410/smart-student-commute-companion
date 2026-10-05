# Feature Inventory — Smart Student Companion

> Replacement for the missing `completed_features.md`. Statuses verified against source
> code and Git history at frontend Day 14 + the Day 1–13 full audit
> (`days/DAY-01-13-AUDIT.md`). Statuses: **IMPLEMENTED**,
> **PARTIAL**, **BLOCKED**, **PLANNED**. "Not verified from repository history" marks
> anything unconfirmable.

---

## IMPLEMENTED

### 1. Application shell & navigation — Day 1–2
- **Status**: IMPLEMENTED
- **Route**: all tabs (shell)
- **Files**: `layouts/AppShell.jsx`, `layouts/MainLayout.jsx`, `components/Navbar.jsx`
- **API**: none (socket status indicator only)
- **Notes**: sticky header with privacy banner, desktop nav, mobile drawer, fixed
  11-item bottom nav (Day 14 added the Account tab); responsive label scaling
  (icon-only <1840px, short 1840–2599px, full ≥2600px — re-measured Day 14 for
  eleven tabs; the brand keeps `min-w-10` so its logo cannot overlap the nav).

### 2. Route planner — screen structure Day 3 (planner itself dates to the hackathon MVP)
- **Status**: IMPLEMENTED
- **Route**: `?tab=planner` (default)
- **Files**: `pages/PlannerPage.jsx`, `components/PlannerForm.jsx`,
  `components/RouteResults.jsx`, `components/MapView.jsx`, `services/planner.js`
- **API**: `POST /api/plan` (AVAILABLE, unauthenticated)
- **Notes**: deterministic plan results rendered with mode comparison; Leaflet map.

### 3. Live alerts feed (crowdsourced disruptions) — Day 3
- **Status**: IMPLEMENTED
- **Route**: `?tab=feed`
- **Files**: `pages/LiveAlertsPage.jsx`, `components/LiveStudentFeed.jsx`,
  `components/CreateReportModal.jsx`, `services/liveReports.js`
- **API**: `GET/POST /api/live-reports`, `POST …/confirm`, `POST …/contradict`;
  Socket.IO `live_report_created/updated/expired`
- **Notes**: create/confirm/contradict; anonymous `x-user-token` for vote dedupe.

### 4. Travel Together (ride pools) — Day 3
- **Status**: IMPLEMENTED
- **Route**: `?tab=together`
- **Files**: `pages/TravelTogetherPage.jsx`, `components/TravelTogether.jsx`,
  `components/CreateGroupModal.jsx`, `services/rideGroups.js`
- **API**: `GET/POST /api/ride-groups`, `POST /api/ride-groups/:id/join`
- **Audit note (Day 1–13)**: join now sends the anonymous `x-user-token` header
  the backend reads for its creator/already-member guards (previously omitted,
  so those guards were silently skipped) — see `days/DAY-01-13-AUDIT.md` §4B.

### 5. Transit search (Mumbai GTFS) — Day 4
- **Status**: IMPLEMENTED
- **Route**: `?tab=transit`
- **Files**: `pages/TransitSearchPage.jsx`, `components/TransitSearchForm.jsx`,
  `components/TransitResults.jsx`, `services/transit.js`
- **API**: `GET /api/transit/search`

### 6. Dashboard overview — Day 5
- **Status**: IMPLEMENTED (client-side aggregation of already-loaded app state)
- **Route**: top of `?tab=planner`
- **Files**: `components/DashboardOverview.jsx`
- **API**: none directly (uses reports/commute state in App)

### 7. Saved commutes ("My Commutes") — Day 5
- **Status**: IMPLEMENTED
- **Route**: `?tab=mycommutes`
- **Files**: `pages/MyCommutesPage.jsx`, `components/SavedCommutes.jsx`,
  `utils/uiPreferences.js` (saved-commute helpers)
- **API**: none (localStorage, max 8, dedup by signature)

### 8. Personalization preferences — Day 5
- **Status**: IMPLEMENTED
- **Route**: Preferences dialog (header button, all tabs)
- **Files**: `components/PreferencesDialog.jsx`, `utils/uiPreferences.js`
  (`showDashboardOverview`, `liveReportToasts`, `deviceAlerts`)
- **API**: none (localStorage only — explicitly documented as device-local)

### 9. Feedback & toast system — Day 3/5
- **Status**: IMPLEMENTED
- **Route**: Route results → feedback modal; toasts everywhere
- **Files**: `components/FeedbackModal.jsx`, `components/Toast.jsx`
- **API**: `GET/POST /api/feedback`

### 10. Notifications view — Day 6
- **Status**: PARTIAL (see Partially Implemented)
- **Route**: `?tab=notifications`
- **Files**: `pages/NotificationsPage.jsx`, `components/NotificationItem.jsx`

### 11. Device alerts (OS-level) — Day 7
- **Status**: IMPLEMENTED
- **Route**: `?tab=devicealerts`
- **Files**: `pages/DeviceAlertsPage.jsx`,
  `components/DeviceAlertPermissionCard.jsx`, `services/deviceAlerts.js`,
  `ui/Toggle.jsx`, pref `deviceAlerts` in `uiPreferences`
- **API**: none (browser Notification API + `registration.showNotification` fallback);
  triggered by socket `live_report_created` when backgrounded
- **Notes**: NOT Web Push — no server push subscription.

### 12. Install & Share hub — Day 8
- **Status**: IMPLEMENTED
- **Route**: `?tab=installshare`
- **Files**: `pages/InstallShareHubPage.jsx`, `ui/ShareableCard.jsx`,
  `ui/InstallStatusCard.jsx`, `services/shareTarget.js`, `public/sw.js`
  (share-target POST), `public/manifest.json` (`share_target`)
- **API**: none (browser Web Share, clipboard, Share Target). Shared content prefills
  `CreateReportModal`, which submits via the existing `POST /api/live-reports`.
- **Notes**: includes `?tab=` deep-link initialization (makes manifest shortcuts work)
  and manual-install guidance (incl. iOS).
- **Audit note (Day 1–13)**: the SW→page payload delivery was found broken at
  runtime (wrong message channel + wrong request type) and **fixed**; the full
  share → SW → page flow was then reproduced and verified working in the
  production build (see `days/DAY-01-13-AUDIT.md` §4A).

### 13. Smart install promotion — Day 9
- **Status**: IMPLEMENTED
- **Route**: global banner above page content (+ "Why install?" dialog)
- **Files**: `components/InstallPromoBanner.jsx`, `ui/InstallPromoDialog.jsx`,
  `ui/FeatureHighlight.jsx`, `services/installPromotion.js`
- **API**: none (beforeinstallprompt + localStorage snooze, 7-day cooldown)

### 14. PWA foundation — Day 1, extended Day 5/8
- **Status**: IMPLEMENTED
- **Files**: `public/manifest.json`, `public/sw.js`, `utils/registerSW.js`,
  `scripts/generate-icons.js`, `components/PwaStatusBanner.jsx`,
  `hooks/usePwaInstall.js`
- **Notes**: static-shell offline caching, update-ready banner, install prompt hook,
  shortcuts, share target; SW production-only by default.

### 15. Demo reset — pre-history, wired in shell
- **Status**: IMPLEMENTED
- **Route**: header/drawer "Reset Demo" (ConfirmDialog)
- **Files**: `Navbar.jsx` (+ `ENABLE_DEMO_RESET` config), `services/api.js`
- **API**: `POST /api/demo/reset`; socket `demo_reset` refresh

### 16. Verification suite — Day 1, extended daily
- **Status**: IMPLEMENTED
- **Files**: `frontend/verify-frontend.js` (351 checks, 25 sections)
- **API**: none

### 17. PWA analytics & monitoring dashboard — Day 10
- **Status**: IMPLEMENTED (device-local; completes the `PWA_SETUP.md` "Day 10:
  Analytics & Monitoring" roadmap)
- **Route**: `?tab=analytics`
- **Files**: `pages/AnalyticsPage.jsx`, `ui/EventLogList.jsx`,
  `services/pwaAnalytics.js`, `public/sw.js` (metrics store
  `pwa-analytics-v1` + sync/reset/updated messages + error listeners), App wiring
  (`analyticsResource`, install/offline recording)
- **API**: none — browser APIs + localStorage/SW-cache counters only; no data leaves
  the device (privacy stance)
- **Notes**: install outcomes, offline periods, cache hit/miss rates, SW error
  monitoring; refresh/reset with toasts; loading/empty/error/retry states.

### 18. Offline report queue — Day 11
- **Status**: IMPLEMENTED (device-local; delivers through the existing report contract)
- **Route**: `?tab=offlinequeue`
- **Files**: `pages/OfflineQueuePage.jsx`, `ui/QueueReportItem.jsx`,
  `services/offlineQueue.js`, App wiring (`queue` state, enqueue on network failure,
  `online` auto-flush), `components/Navbar.jsx` (tenth nav item)
- **API**: `POST /api/live-reports` via the existing `services/liveReports.js →
  createReport()` — no new endpoint; delivery only runs in the page (online event /
  manual Sync now / next launch), no Background Sync
- **Notes**: reports whose submission fails with `err.isNetwork` are saved to
  `smart_commute_offline_queue` (bounded 50, failure-safe storage) instead of being
  lost; HTTP rejections become visible `failed` items with Try again / Discard actions
  (discard gated by ConfirmDialog); filter chips, polite live status, focus handoff,
  loading/empty/error/retry states.

### 19. Notification read state & unread badges — Day 12
- **Status**: IMPLEMENTED (device-local; completes the client-side slice of the
  Notifications center — see P1 for the still-blocked server feed)
- **Route**: existing `?tab=notifications` (no new tab)
- **Files**: `pages/NotificationsPage.jsx`, `components/NotificationItem.jsx`,
  `ui/UnreadCountBadge.jsx` (new), `utils/uiPreferences.js` (read-state helpers),
  App wiring (`notificationReadIds`, `unreadNotificationsCount`, mark-all),
  `components/Navbar.jsx` (unread badge in desktop nav, drawer and bottom nav)
- **API**: none new — reads the already-loaded live reports (`GET /api/live-reports`);
  persistence is localStorage (`smart_commute_notification_read_state`, bounded 300,
  failure-safe)
- **Notes**: read state survives reloads; mark-all-as-read with toast + focus handoff;
  visible "Unread" text badge (never color alone); filter options show live counts;
  "You're all caught up" empty state;  polite live announcements of read progress.

### 20. Notification preferences with quiet hours — Day 13
- **Status**: IMPLEMENTED (device-local; implements the documented client-side slice of
  the "User notification preferences" roadmap item)
- **Route**: existing preferences dialog (`?tab=notifications` home screen is the
  Notifications page; preferences are dialog-based, Day 9 precedent)
- **Files**: `pages/PreferencesDialog.jsx`, `ui/TimeRangeInput.jsx` (new),
  `ui/Toggle` reuse, `utils/uiPreferences.js` (`quietHoursEnabled/Start/End`+helpers),
  App wiring (`isQuietHoursActive` gating of both pop-up paths), `pages/DeviceAlertsPage.jsx`
- **API**: none new — the two pop-up paths (live-report toasts, OS device alerts)
  read the preference store and `isQuietHoursActive()` per event; reports still
  reach the feed so nothing is hidden, only interrupted while the window is active
- **Notes**: quiet window defaults 22:00–07:00 (overnight wrap handled; empty window
  guarded); currently suppressed: live-report toasts + OS device alerts; per-field
  `HH:MM` validation with forgiving blur revert; live "active now" status
  (60s recompute); honest `role="alert"` pause explanation on the Device alerts
  screen; dialog sections are real headings with polite live status; 310-check verify
  suite passes (section 22).

### 21. Student Account — sign-in, registration & session — Day 14
- **Status**: IMPLEMENTED (optional, device-local session; frontend slice of the
  previously BLOCKED B1 below — anonymous-first app, no login wall)
- **Route**: `?tab=account` (11th tab)
- **Files**: `pages/AccountPage.jsx`, `components/AuthForm.jsx`,
  `components/AccountProfileCard.jsx`, `ui/PasswordField.jsx` (new kit, barrel +
  README), `utils/authSession.js` (new store), `services/auth.js` (new),
  `services/api.js` (exported `request`, Bearer attach + 401 expiry),
  `utils/validation.js` (`validatePassword` mirroring the backend rules), App wiring
  (`sessionResource`, handlers, `auth-session-expired` listener), `Navbar.jsx`
- **API**: `POST /api/auth/register` (public), `POST /api/auth/login` (public),
  `GET /api/auth/me` (Bearer) — all exercised for real against a running backend
- **Notes**: register → **real** auto-login (register returns no token); session
  persisted in `smart_commute_auth_session` (token + profile, never a password,
  failure-safe); Bearer attached only while signed out never on credential endpoints;
  401/404 clears the session and returns the UI to guest with a notice; sign-out is
  confirmed via `ConfirmDialog` and is device-local (no backend revocation endpoint);
  client validation mirrors `registerSchema`/`loginSchema` exactly (same messages);
  loading/error(+retry)/empty states, focus handoff between states, arrow-key tabs,
  reveal toggle semantics; nav re-tiered for 11 tabs (measured 360–3000px, no
  overflow); 351-check verify suite (section 25).

---

## PARTIALLY IMPLEMENTED

### P1. Notifications center
- **Status**: PARTIAL (client-side complete as of Day 13 — see #19 and #20; the
  server feed itself remains blocked)
- **Route**: `?tab=notifications`
- **Files**: `pages/NotificationsPage.jsx`, `components/NotificationItem.jsx`
- **What exists**: full UI — search, all/unread filter with live counts, per-item read
  state **persisted on device** (Day 12), mark-all-as-read, unread badges in
  navigation, feed/announcement styling, empty/loading/error states.
  Data = live **reports** already loaded in App (`reports` prop).
- **What's missing**: backend notification feed (`GET /api/alerts` exists but requires
  JWT — see `backend/routes/notificationRoutes.js`) and persistent server-side read
  state across devices.
- **API dependency**: was BLOCKED on auth (see Backend Dependent #B4); the server
  feed is reachable since Day 14 (a session exists) but is not wired yet.

### P2. Offline support
- **Status**: PARTIAL (offline queueing done in Day 11; the rest intentionally open)
- **What exists**: cached static shell + offline banner + retry states; since Day 11,
  failed report submissions queue locally and auto-deliver on reconnect (see #18).
- **What's missing**: Background Sync / data caching — still absent from `sw.js`
  (verified).
- **Notes**: upgrading further is a product decision, not implied here.

### P3. Roadmap checkboxes in `frontend/PWA_SETUP.md`
- **Status**: PARTIAL (doc drift)
- The "Day 8-9: Advanced Features" items (Share Target, install promotion banner,
  update notification UI, shortcuts) **and** the "Day 10: Analytics & Monitoring"
  items are implemented in code but the file still shows `- [ ]`. The file was not
  modified by this documentation task.

---

## BACKEND DEPENDENT (blocked — do not fake)

All blocked by the same verified root cause: these backend groups require
`Authorization: Bearer <JWT>` (`router.use(authenticate)`), and the frontend has **no
auth implementation**.

### B1. Student authentication (register/login/session UI)
- **Status**: IMPLEMENTED at the frontend (Day 14, feature #21 above) — a real
  register/login/session-verification UI against the existing backend contract.
  Deliberately not built (not blocked): profile editing, password change,
  cross-device sync, server-side token revocation.
- **Backend**: `/api/auth/*` implemented (`backend/routes/authRoutes.js`,
  `backend/middleware/authMiddleware.js`)
- **Frontend files**: `pages/AccountPage.jsx`, `components/AuthForm.jsx`,
  `components/AccountProfileCard.jsx`, `services/auth.js`, `utils/authSession.js`

### B2. Academic domain (courses, subjects, assignments, tasks, goals, productivity)
- **Status**: READY (reachable with a Day-14 session) — no screen exists yet
- **Backend**: `/api/academic/*` (+ goals/productivity endpoints,
  `backend/routes/academicRoutes.js`) implemented through backend Day 10
- **Frontend files**: none — no academic page exists

### B3. Calendar / planning screens (calendar events, study sessions, upcoming work,
workload analytics)
- **Status**: READY (reachable with a Day-14 session) — no screen exists yet. The
  Day-13 backend study-planning suite (`/api/student/study-plans/*`, merged into
  `main` before Day 14 — `days/DAY-13-BACKEND.md`) is the largest unused contract.
- **Backend**: `/api/calendar/*` implemented (`backend/routes/calendarRoutes.js`),
  planning docs `backend/docs/planning_workflows.md`
- **Frontend files**: none — no calendar page exists

### B4. Server-backed notification feed
- **Status**: PARTIAL (frontend view exists — see P1; the server feed is now
  reachable with a Day-14 session but not wired)
- **Backend**: `GET /api/alerts` etc. in `backend/routes/notificationRoutes.js`

### B5. Student dashboard/context API
- **Status**: READY (reachable with a Day-14 session) — `DashboardOverview` still uses
  its client-side workaround
- **Backend**: `GET /student/context`, `GET /student/dashboard`
  (`backend/routes/studentRoutes.js`)
- **Notes**: current `DashboardOverview` works around this with client-side state.

---

## PLANNED / NOT YET IMPLEMENTED

Only items verifiable from project documentation/roadmap files:

### R1. Advanced offline features
- **Status**: PLANNED
- **Source**: `frontend/PWA_SUMMARY.md` "Medium Term (Days 4-7)": background sync, push
  notification support, enhanced offline UX. (Offline request queueing from that list
  is now implemented in code — Day 11 #18 — but the file itself was not edited.)

### R2. Real-device / Lighthouse PWA testing
- **Status**: PLANNED
- **Source**: `frontend/PWA_SUMMARY.md` "⏳ Requires Browser Testing" checklist
  (install prompt, real devices, Lighthouse audit — unticked).

### R3. Frontend work beyond Day 14
- **Status**: Not verified from repository history.

(Former planned items "PWA Analytics & Monitoring (Day 10)", "offline request
queueing (Day 11)", "persistent notification read state (Day 12)" and
"notification preferences with quiet hours (Day 13)" are now **IMPLEMENTED** as
#17, #18, #19 and #20.)
