# Day 3 — Core Feature UI & Interactions (Xcaliber)

Day 3 delivered the core feature layer on top of the Day 1/Day 2 foundation:
feature page structures, reusable data-display components, search/filter/sort
interactions, shared dialog & confirmation patterns, cleaner interaction state,
and feature-specific API service modules.

---

## 📄 Feature-Page Conventions

Feature pages live in `frontend/src/pages/` and are presentation containers:

```
frontend/src/pages/
├── PlannerPage.jsx       # Plan Route feature (form + results + embedded feed)
├── TravelTogetherPage.jsx# Ride group feature
├── LiveAlertsPage.jsx    # Live disruption feed feature
└── index.js              # Barrel export
```

Rules:
- Each page renders an `<h1>` page heading + short description (document outline).
- Pages receive ALL data and callbacks via props — no API calls, no business logic.
- Sections use `<section aria-label>` and mirror loading → error → content order.
- Loading uses `LoadingState`, errors use `ErrorState` (with retry), empty uses
  `EmptyState`, "no filter matches" uses `EmptyState` (it is not an error).
- Composition only: pages compose existing feature components (`PlannerForm`,
  `RouteResults`, `TravelTogether`, `LiveStudentFeed`).

---

## 🧱 Data-Display Conventions

Reusable display primitives in `components/ui/` (Day 3):

| Component  | Purpose |
|------------|---------|
| `Badge`    | Status/mode/impact label — **always includes text**, never color-only |
| `DataCard` | Card shell: header / title / subtitle / body / footer + optional accent strip |
| `MetaRow` (+ `MetaList`) | Icon + truncated value metadata rows inside cards |

Rules:
- Do not hand-roll card/badge markup in feature components — use these.
- Long text truncates (`truncate` + `min-w-0`) so cards never break list layouts.
- Interactive elements inside cards keep accessible labels (`aria-label`).

---

## 🔍 Search / Filter / Sort Conventions

- Controls: `SearchInput` (labeled, clear button) + `FilterBar` (toolbar shell,
  active-filter chips, "Clear all" reset, live result count) + existing `Select`.
- Logic: pure helpers in `utils/listControls.js`:
  `matchesQuery`, `matchesFilters`, `sortItems`, `applyListControls`,
  `buildActiveFilters`.
- **State lives in the feature page** (`useState` + `useMemo`), never inside the
  generic controls — controls are presentation-only.
- Client-side filtering operates on lists already delivered by the API layer
  (socket-pushed reports, loaded groups). Server-side filter contracts exist on
  `GET /live-reports` and `GET /ride-groups` and are supported by the API client
  (`fetchLiveReports(filters)`, `fetchRideGroups(filters)`).
- Active filters are always visible as removable chips; results are announced
  via `aria-live` in the FilterBar.
- Resetting filters never reloads the page or refetches data.

---

## 🪟 Dialog / Confirmation Conventions

- `Modal` — the ONLY overlay container. Provides `role="dialog"`, `aria-modal`,
  accessible name (title), Escape close, overlay-click close, focus move-in,
  focus trap (Tab cycling), focus return to trigger, body scroll lock, and a
  mobile-safe max-height with internal scrolling.
- `ConfirmDialog` — destructive/consequential actions built on `Modal`
  (confirm/cancel, `destructive` variant, `isPending` disables both buttons to
  prevent duplicate submissions).
- Existing feature dialogs (`CreateReportModal`, `CreateGroupModal`,
  `FeedbackModal`) now wrap their content in `Modal` — do not re-implement
  overlays. Wired example: **Reset Demo** in `Navbar` asks for confirmation.
- No modal library — the built-in pattern is sufficient.

---

## 🔄 State-Management Conventions

No state library. Local React state + one small hook:

`hooks/useAsyncResource.js` — async data state machine:

```
idle → loading → success | error        (first load: full placeholders)
success → refreshing → success           (refresh: data stays visible)
```

- Stale responses ignored via sequence numbers (only latest request wins).
- Refresh failures keep existing data (never blank the page).
- `setData` supports functional updates for socket events; delivering data
  after an error transitions back to success.
- Duplicate submissions guarded by `useRef` locks (`planInFlightRef`,
  `resetInFlightRef`) plus `isSubmitting` checks in create handlers.
- Search/filter/sort state stays local to the page that owns the list.
- Modal open/close state stays with the nearest owner (App or Navbar).
- Loading placeholders are stable-size sections — no layout jumps.

---

## 🌐 API Integration Conventions

```
services/
├── api.js           # Centralized fetch client (timeouts, friendly errors)
├── liveReports.js   # listReports, createReport, voteStillHappening, voteCleared
├── rideGroups.js    # listGroups, createGroup, joinGroup
├── planner.js       # requestPlan, sendFeedback
└── socket.js        # Socket.IO client
```

- Presentation components NEVER call endpoints — App wires pages to feature
  services; feature services wrap the central client.
- `fetchLiveReports(filters)` / `fetchRideGroups(filters)` support the **real**
  backend query contracts (`page, limit, mode, area, impact, status` /
  `page, limit, mode, origin, destination, status`).
- Failures reject with `FrontendApiError` — user-friendly messages only; no
  stack traces, tokens, or secrets ever reach the UI or logs.
- **Known backend dependency:** Day 3 UI uses only existing endpoints. Server-
  side filtering is available but unused for the live lists because socket
  events keep them complete client-side.

---

## 🧪 Testing Commands

```bash
cd frontend
npm test        # verify-frontend.js (110 checks incl. Day 3 section)
npm run build   # production build
npm run dev     # dev server (http://localhost:5173)
```

**Day 3 verification results (actually executed):**
- `npm test` → **110/110 passed** (0 failed, 0 warnings) — includes new
  section "12. DAY 3 FEATURES" (pages, data display, filters, dialogs, state
  hook, services, barrel exports)
- `npm run build` → success (vite 6)
- Dev server start → HTTP 200 on `/`
- Headless Chrome render → page `<h1>` present, **0 console/uncaught errors**
- Lint/type checks: none exist in this frontend (known limitation)

---

## ⚠️ Known Limitations

- No lint/type-check tooling yet (JS project) — verification is structural +
  build + runtime-render based.
- No unit-test framework; the verify script is file/structure-level.
- Client-side list filtering is applied to full lists; for very large datasets,
  switch to the server-side filter params already supported by the API client.
- Map sidebar interactions and PWA service worker were not modified in Day 3
  (Day 1/2 behavior intact and re-verified by `npm test`).

---

**Last Updated**: Day 3 Complete
**Version**: 3.0.0
**Maintainer**: Xcaliber (Frontend)
