# Feature Inventory — Smart Student Companion

> Replacement for the missing `completed_features.md`. Statuses verified against source
> code and Git history at frontend Day 10 (`0f5f756`). Statuses: **IMPLEMENTED**,
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
  9-item bottom nav; responsive label scaling (icon-only <1536px, short 2xl→1919px,
  full ≥1920px — re-tiered Day 10).

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
- **Files**: `frontend/verify-frontend.js` (231 checks, 19 sections)
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

---

## PARTIALLY IMPLEMENTED

### P1. Notifications center
- **Status**: PARTIAL
- **Route**: `?tab=notifications`
- **Files**: `pages/NotificationsPage.jsx`, `components/NotificationItem.jsx`
- **What exists**: full UI — search, all/unread filter, per-item read state
  (in-memory, resets on reload), feed/announcement styling, empty/loading/error states.
  Data = live **reports** already loaded in App (`reports` prop).
- **What's missing**: backend notification feed (`GET /api/alerts` exists but requires
  JWT — see `backend/routes/notificationRoutes.js`); persistent read state.
- **API dependency**: BLOCKED on auth (see Backend Dependent #B4).

### P2. Offline support
- **Status**: PARTIAL (by design so far)
- **What exists**: cached static shell + offline banner + retry states.
- **What's missing**: offline request queueing / Background Sync / data caching —
  listed as "not implemented (intentionally)" in `frontend/PWA_SUMMARY.md` and absent
  from `sw.js` (verified).
- **Notes**: upgrading this is a product decision, not implied here.

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
- **Status**: BLOCKED
- **Backend**: `/api/auth/*` implemented (`backend/routes/authRoutes.js`,
  `backend/middleware/authMiddleware.js`)
- **Frontend files**: none exist (no login page/component — verified)
- **Notes**: implementing this requires a real auth decision; fake auth is forbidden.

### B2. Academic domain (courses, subjects, assignments, tasks, goals, productivity)
- **Status**: BLOCKED
- **Backend**: `/api/academic/*` (+ goals/productivity endpoints,
  `backend/routes/academicRoutes.js`) implemented through backend Day 10
- **Frontend files**: none — no academic page exists

### B3. Calendar / planning screens (calendar events, study sessions, upcoming work,
workload analytics)
- **Status**: BLOCKED
- **Backend**: `/api/calendar/*` implemented (`backend/routes/calendarRoutes.js`,
  planning docs `backend/docs/planning_workflows.md`)
- **Frontend files**: none — no calendar page exists

### B4. Server-backed notification feed
- **Status**: BLOCKED (frontend view exists — see P1)
- **Backend**: `GET /api/alerts` etc. in `backend/routes/notificationRoutes.js`

### B5. Student dashboard/context API
- **Status**: BLOCKED
- **Backend**: `GET /student/context`, `GET /student/dashboard`
  (`backend/routes/studentRoutes.js`)
- **Notes**: current `DashboardOverview` works around this with client-side state.

---

## PLANNED / NOT YET IMPLEMENTED

Only items verifiable from project documentation/roadmap files:

### R1. Advanced offline features
- **Status**: PLANNED
- **Source**: `frontend/PWA_SUMMARY.md` "Medium Term (Days 4-7)": background sync, push
  notification support, offline request queueing, enhanced offline UX.

### R2. Real-device / Lighthouse PWA testing
- **Status**: PLANNED
- **Source**: `frontend/PWA_SUMMARY.md` "⏳ Requires Browser Testing" checklist
  (install prompt, real devices, Lighthouse audit — unticked).

### R3. Frontend work beyond Day 10
- **Status**: Not verified from repository history.

(Former planned item "PWA Analytics & Monitoring (Day 10)" is now **IMPLEMENTED** as
#17.)
