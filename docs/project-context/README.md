# Project Context — Smart Student Companion

> **Read this first.** This folder (`docs/project-context/`) is the durable development
> context for the Smart Student Companion project, reconstructed from actual repository
> state and Git history (documentation task, Day ~9 of the project). Everything here is
> evidence-based; anything not confirmable from the repo is explicitly marked
> "Not verified from repository history."

---

## 1. What the project is

**Smart Student Commute Companion (SSCC)** — an AI-powered student mobility assistant for
Mumbai college commutes (see root `README.md`). It plans multimodal routes using official
Mumbai GTFS schedules, OSRM/OpenStreetMap routing, Open-Meteo weather, and a crowdsourced
student disruption feed, with a deterministic scoring engine plus Gemini as explainer
(ranking over verified candidates). It started as a hackathon MVP (commit `28723c8`,
2026-09-06) and is now executing a 21-day roadmap with a backend side and a frontend/PWA
side working in parallel.

- **Backend**: `backend/` — Express + SQLite, layered (routes → controllers/services →
  repositories → models), Socket.IO for live events. Author/owner: **Skan** (see §5).
- **Frontend**: `frontend/` — React 18 + Vite + Tailwind CSS **PWA** (no TypeScript, no
  router library). Author/owner: **Xcaliber** (see §4).

## 2. Current development state (as of this documentation)

- Frontend daily cycle has reached **Day 11** (last frontend commit `fbdb302`,
  2026-10-03: `test(frontend): verify Day 11 frontend implementation`; docs commit
  follows).
- `main` was at `df275de` (backend study-resources suite) when Day 11 started; Day-11
  work was merged `frontfeat` → `main` at day end per `GIT_WORKFLOW.md`.
- Backend has progressed at least through its own "Day 10" goals/productivity suite
  (per `backend/docs/goal_and_productivity_workflows.md`, commits through `a8f8d80`,
  2026-10-01), plus the Day-11 start-of-day merge brought the study-resources suite
  (`df275de`, 2026-10-03).
- Frontend verification: `npm run verify` = **262/262 checks passing** (20 named
  sections), `npm run build` succeeds.

## 3. Purpose of the frontend/PWA

The frontend is the entire student-facing product: route planning, live disruption feed,
ride pools, transit search, notifications view, device alerts, PWA installation/
sharing, and an offline queue that keeps reports filed without connectivity until they
can be delivered. It is designed as an installable PWA (home-screen launch, offline app
shell, share target, shortcuts) so students can use it cheaply on mobile. It talks to
the backend over a small set of JSON endpoints and a Socket.IO channel; it holds **no
user accounts** client-side.

## 4. Role of Xcaliber

**Xcaliber = the frontend/PWA ("client-side only") development role.** Repository evidence:

- GitHub org/user `Xcaliber5410` owns the repository; the Day-1 branch was
  `day-01-foundationXcaliber` (merged via PR #1, `2f7a969`).
- Backend docs reference the consumer of backend APIs as the frontend, e.g.
  `backend/docs/notifications_and_scheduling.md` line 63: *"…so frontend (Xcaliber) can
  render them in student-local time"* and `backend/docs/student_workflows.md` line 93:
  *"…payload for Xcaliber's frontend"*.
- All frontend commits (Days 1–9) are authored by Agneesh (`mondalagneesh@gmail.com`).

In practice Xcaliber's work follows a strict daily cycle: 7 commits per "Day" with fixed
commit messages, frontend/PWA only, `frontfeat` branch, merged into `main` at day end.
See `GIT_WORKFLOW.md` and `days/`.

## 5. Role of Skan

**Skan = the backend developer.** Repository evidence:

- Every file in `backend/docs/*.md` is stamped `**Author:** Skan (Backend Developer)`
  (15+ documents: architecture, authentication, database, service layer, notifications,
  planning, academic, goals…).
- All backend commits are authored by `SkanxGladiatorr07` / `Skan0710`
  (`anirudhvshenoy07@gmail.com`).

Skan owns `backend/` (server, database, API, Socket.IO). Xcaliber must not modify it.

## 6. Branch structure

| Branch | Purpose |
|---|---|
| `main` | Integration branch; receives completed daily frontend work after each day; also holds backend work. `origin/HEAD` → `origin/main`. |
| `frontfeat` | Xcaliber's active frontend branch. Daily sync target: `main` is merged INTO it before work; it is merged into `main` after work. |
| `origin/day-01-foundation` | Legacy Day-1 branch (tip `e8facbb`); historical only. |
| `fix/budget-and-mode-filtering` | Local stale branch from pre-roadmap hackathon fixes; not part of the daily workflow. |

## 7. Normal development workflow

Documented in full in `GIT_WORKFLOW.md`. Short version:

1. **Before daily work**: fetch → switch `main` → pull → switch `frontfeat` → pull →
   **merge `main` into `frontfeat`** → resolve conflicts → push `frontfeat`.
2. **During the day**: implement exactly 7 scoped commits with the day's fixed messages;
   push each commit to `origin/frontfeat` immediately.
3. **After the day**: sync again (`main` → `frontfeat`), then **merge `frontfeat` into
   `main`** → run checks → push `main`.

## 8. High-level architecture

```
Browser (PWA)                                  Express backend (backend/)
┌──────────────────────────────┐              ┌─────────────────────────────┐
│ React 18 + Vite + Tailwind   │  fetch JSON  │ app.js → /api router        │
│ App.jsx (tab state, no       │ ───────────► │  health, plan, live-reports,│
│   router library; ?tab=      │              │  ride-groups, transit,      │
│   deep links)                │              │  feedback, demo,            │
│ Pages (8) ← props            │  Socket.IO   │  auth*, student*,           │
│ components/ + ui/ kit         │ ◄──────────► │  notifications*, academic*, │
│ services/ (fetch wrappers)   │  live events │  calendar*  (* = JWT auth)  │
│ localStorage (preferences)   │              │ SQLite via repositories     │
│ Service worker (static cache,│              └─────────────────────────────┘
│  share target, update flow)  │
└──────────────────────────────┘
```

- **No frontend router**: `App.jsx` switches on an `activeTab` string; the 8 tabs are the
  "routes". `?tab=<id>` deep links (Day 8) initialize the tab on load.
- **No global state library**: App-level `useState` + prop drilling; localStorage helpers
  for persistence; Socket.IO pushes live data in.
- **One API module** (`frontend/src/services/api.js`) wraps `fetch` with timeout, error
  normalization, and friendly messages. Domain services call it.

## 9. Important directories

| Path | Contents |
|---|---|
| `frontend/src/` | All frontend source |
| `frontend/src/pages/` | 10 feature pages (presentation, props-driven) |
| `frontend/src/components/` | Feature components (Navbar, modals, PlannerForm…) |
| `frontend/src/components/ui/` | Reusable UI kit (~30 files) + barrel `index.js` + `README.md` |
| `frontend/src/layouts/` | `AppShell`, `MainLayout`, `PageContainer`, `NotFound` |
| `frontend/src/services/` | `api.js`, `planner`, `liveReports`, `rideGroups`, `transit`, `deviceAlerts`, `shareTarget`, `installPromotion`, `pwaAnalytics`, `offlineQueue`, `socket` |
| `frontend/src/hooks/` | `useAsyncResource`, `usePwaInstall` |
| `frontend/src/utils/` | `uiPreferences` (localStorage), `listControls`, `validation`, `registerSW` |
| `frontend/src/config/index.js` | Env config (`VITE_API_BASE_URL` default `/api`), logger |
| `frontend/public/` | `manifest.json`, `sw.js`, `icons/` (SVG) |
| `frontend/verify-frontend.js` | The verification suite (`npm run verify`) |
| `backend/routes|controllers|services|repositories|models/` | Backend layers (Skan's domain — do not edit) |
| `backend/docs/` | Backend architecture docs authored by Skan |
| `frontend/*.md` | Day-level summaries, PWA guides, design system docs |

## 10. Important routes (frontend "tabs")

`NAV_ITEMS` in `frontend/src/components/Navbar.jsx` is the single source of truth —
10 tabs: `planner` (Plan Route), `mycommutes`, `transit` (Transit Search), `together`
(Travel Together), `feed` (Live Alerts), `notifications`, `devicealerts`,
`installshare` (Install & Share), `analytics` (PWA Analytics), `offlinequeue`
(Offline Queue, Day 11). Backend HTTP paths used
by the frontend are listed in
`CURRENT_STATE.md`.

## 11. Important reusable components

UI kit lives in `frontend/src/components/ui/` (barrel-exported). Most reused:
`Button`, `Card`, `Modal` (focus trap/ESC/aria-modal), `ConfirmDialog`, `Badge`,
`StatTile`, `Tabs`/`TabPanel`, `SearchInput`, `FilterBar`, `Select`, `Input`,
`FormField`, `EmptyState`, `ErrorState`, `LoadingState`, `Spinner`, `Skeleton`/
`ListSkeleton`, `Alert`, `Toast` (app-level, `components/Toast.jsx`), `ProgressBar`,
`ComparisonBars`, `Toggle` (Day 7), `FeatureHighlight` + `InstallPromoDialog` (Day 9),
`ShareableCard` + `InstallStatusCard` (Day 8), `EventLogList` (Day 10),
`QueueReportItem` (Day 11). Component conventions are documented in
`frontend/src/components/ui/README.md`.

## 12. Important frontend services

- `services/api.js` — the **only** place that calls `fetch`; exports `FrontendApiError`,
  `planCommute`, `fetchLiveReports`, `postLiveReport`, `confirmReport`,
  `contradictReport`, `fetchRideGroups`, `postRideGroup`, `joinRideGroup`,
  `searchTransitNetwork`, `submitFeedback`, `resetDemoState`, `checkHealth`.
- `services/socket.js` — Socket.IO connection.
- `services/planner.js`, `liveReports.js`, `rideGroups.js`, `transit.js` — domain-level
  helpers composed on top of `api.js`.
- `services/deviceAlerts.js` — Notification API wrapper + SW fallback + permission watch.
- `services/shareTarget.js` — Share Target payload storage + SW messaging.
- `services/installPromotion.js` — install-promo eligibility + snooze persistence.
- `services/pwaAnalytics.js` — Day-10 device-local analytics snapshot (merged with the
  SW metrics store) + install/offline recording + SW message watch (no network calls).
- `services/offlineQueue.js` — Day-11 offline report queue: localStorage persistence
  (`smart_commute_offline_queue`), bounded enqueue/discard/retry helpers, and
  `syncQueue()` which delivers through the existing `liveReports.createReport()`
  contract (network errors stay pending; HTTP rejections become visible failures).
- Browser-API-only services make **no network calls**; only `api.js`-based services do.

## 13. State management approach

Local-first: component `useState`/`useReducer`-free hooks (`useAsyncResource` for
loading/error/retry), App-level `useState` for cross-cutting state (tab, socket reports,
toasts, modal flags, install state), passed down as props. Persistence is exclusively
`localStorage` through `utils/uiPreferences.js` (validated reads, failure-safe writes;
`saved commutes` intentionally surfaces storage errors). No Redux/Zustand/Context store
exists. **Convention: prefer local state; do not introduce a global store casually.**

## 14. PWA architecture

- `frontend/public/manifest.json` — name "Smart Student Commute Companion", short
  `SSCC`, `display: standalone`, theme `#10b981`, SVG icons, **shortcuts** (Plan Route
  `/?tab=planner`, Live Feed `/?tab=feed`), **share_target** POST `/share-target`
  (multipart).
- `frontend/public/sw.js` — pre-caches static shell (`sscc-static-v1`), network-only for
  API/socket, `skipWaiting` update flow + old-cache cleanup, share-target POST handling
  (message to window client, redirect `/`); Day 10 added a separate `pwa-analytics-v1`
  metrics cache (cache hit/miss + worker error counters) with
  sync/reset/updated messages. **No** `push` event handler and **no**
  background-sync (verified by grep).
- `frontend/src/utils/registerSW.js` — registration; SW disabled in dev by default
  (`VITE_SW_DEV=true` opt-in).
- UI: `PwaStatusBanner` (offline + update-ready), `usePwaInstall` (deferred
  `beforeinstallprompt`), Day 8 Install & Share hub, Day 9 install-promotion banner,
  Day 10 PWA analytics dashboard (`?tab=analytics`).
- Device alerts (Day 7) use `Notification` API with `registration.showNotification`
  fallback — not Web Push.

## 15. API integration approach

All HTTP goes through `services/api.js` (`API_BASE_URL`, default `VITE_API_BASE_URL=/api`),
with AbortController timeout (15s), HTTP→friendly-error mapping, no stack-trace leaks.
Domain services wrap it; components never call `fetch` directly. Live data arrives via
Socket.IO (`live_report_created/updated/expired`, `demo_reset`, connection status).
The anonymous `x-user-token` in `api.js` is a **UX pseudonym for crowd voting only** —
not authentication; all real authorization is server-side.

## 16. Authentication dependencies / blockers

The backend exposes authenticated route groups that require `Authorization: Bearer <JWT>`:
`/auth`, `/student`, `/notifications`, `/academic`, `/calendar` (verified:
`router.use(authenticate)` in those route files). **The frontend has no authentication
implementation at all** (no login UI, no token storage — by design so far). Any feature
needing those endpoints is **BLOCKED** until a real auth story exists; do not fake it.
The endpoints the frontend currently uses are all unauthenticated. See FEATURES.md
"Backend Dependent".

## 17. Testing / lint / type-check / build

- **Tests**: `cd frontend && npm run verify` (alias `npm test`) → `verify-frontend.js`,
  a Node script performing **262 static source checks across 20 sections** (structure,
  config, design system, PWA, and per-day feature checks). These are source-level
  assertions, not runtime unit tests. No Jest/Vitest/Playwright exists.
- **Lint**: **none configured** (no eslint config or script — verified).
- **Type-check**: **none** (plain JS/JSX, no tsconfig — verified).
- **Build**: `npm run build` (Vite 6). Known pre-existing warning: one chunk > 500 kB.
- Backend has its own test scripts (`backend/scripts/…`, `backend/package.json`) — not
  run as part of frontend verification.

## 18. Known limitations

- No frontend auth → authenticated backend domains unreachable (§16).
- No lint/type-check gate; verification is static + build only.
- Single bundle chunk exceeds Vite's 500 kB warning threshold.
- Offline support = static shell + a device-local offline report queue (Day 11); no
  Background Sync / push / offline data caching (queueing was previously documented as
  intentionally out of scope in `frontend/PWA_SUMMARY.md` — that file was not edited).
- Roadmap checkboxes in `frontend/PWA_SETUP.md` are stale (e.g., Day 8–9 items are
  implemented in code but still `- [ ]` in that file).
- **Day 6 anomaly**: seven *empty* commits carrying Day-6 messages exist
  (`9a43783…957a74d`, all 2026-09-29 23:11, zero file changes). The real Day 6 content is
  the following sequence (`a1e3d78…8a3f441`). See `days/DAY-06.md`.

## 19. Known blockers

- **JWT auth gap** (§16) — the only structural blocker for frontend features.
- Missing backend capability that has *not* blocked anything so far: none; all Days 1–11
  frontend features were completable client-side.
- Environment: browser-PWA features (install prompt, share target) can only be truly
  exercised in a real/installable browser context; headless checks approximate them.

## 20. How a new AI should begin

1. Read `AI_HANDOFF.md` (short), then `CURRENT_STATE.md` and `FEATURES.md`.
2. Read only the latest `days/DAY-0X.md` relevant to the work you are continuing.
3. Branch: work on `frontfeat`, follow `GIT_WORKFLOW.md` (sync main → frontfeat FIRST).
4. Read `ARCHITECTURE.md` before adding code — follow the existing props-driven page
   pattern, the `ui/` kit, the single `api.js` service, and localStorage helpers.
5. Verify with `npm run verify` + `npm run build` (both must pass) before committing.
6. Never edit `backend/`, never fake APIs/auth, never introduce a router or global store
   without explicit direction.
