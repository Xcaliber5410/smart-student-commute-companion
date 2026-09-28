# Day 4 — Expanded Screens, Reusable UI & API-Connected States (Xcaliber)

Day 4 built on the Day 1–3 foundation: a new Transit Search feature screen,
new reusable interface primitives, richer client-side interaction state,
stronger form validation, an accessibility/responsive polish pass, and a
service-layer pass that keeps UI state honest about request state.

---

## 📄 Day 4 Commits

| # | Commit message |
|---|----------------|
| 1 | `feat(frontend): expand core student feature screens` |
| 2 | `feat(ui): enhance reusable student interface components` |
| 3 | `feat(frontend): add richer feature interactions and client-side state` |
| 4 | `feat(frontend): improve forms and client-side validation` |
| 5 | `fix(frontend): polish responsive accessibility and UI states` |
| 6 | `feat(frontend): strengthen API-connected feature experiences` |
| 7 | `test(frontend): verify Day 4 frontend implementation` |

---

## 🗺️ Feature Screens

```
frontend/src/pages/
├── PlannerPage.jsx          # Plan Route (Day 3)
├── TravelTogetherPage.jsx   # Ride groups (Day 3)
├── LiveAlertsPage.jsx       # Live disruptions (Day 3, extended Day 4)
└── TransitSearchPage.jsx    # Transit Search (NEW — Day 4)
```

`TransitSearchPage` follows the established page contract:

- `<h1>` page heading + short description (document outline).
- All data and callbacks arrive via props — pages never call the API.
- `<section aria-label>` blocks mirror the **idle → loading → error → content**
  order, using `ListSkeleton` / `ErrorState` (with retry) / `EmptyState`.
- A `role="status"` line announces background refreshes
  (“Updating results for … ”) while previous results stay visible.

Cross-screen hand-off: a searched stop can be pushed into the planner as the
origin or destination (`onUseAsOrigin` / `onUseAsDestination`).

---

## 🧩 Reusable UI Added in Day 4

| Component | Purpose |
|-----------|---------|
| `ui/Tabs.jsx` (`Tabs`, `TabPanel`) | Accessible tablist / segmented control with arrow-key support |
| `ui/StatTile.jsx` | Compact KPI tile with icon + variant |
| `ui/ListSkeleton.jsx` | Skeleton rows for list/result loading with `role="status"` label |
| `ui/README.md` | Usage notes for the shared component library |

All are exported from the `components/ui` barrel, follow the existing visual
language (Tailwind + emerald/slate palette), are keyboard operable, and use
`focus:ring` focus indicators.

---

## 🧠 Client-Side State

- **Local by default** — tab selection, expanded rows, filters, sorting, and
  temporary form state live in the component/page that owns them.
- **`utils/uiPreferences.js`** — small `localStorage`-backed preference store
  (recent transit searches, transit sort order, view preferences) with safe
  JSON parsing and a reset helper. Preferences are re-read on mount, so they
  survive navigation and refreshes.
- **`hooks/useAsyncResource.js`** — the shared async state machine
  (`idle → loading → refreshing → success → error`) with stale-response
  guards; background refresh failures keep loaded data instead of blanking
  the screen.
- No new global state was introduced; `App.jsx` remains the single owner of
  cross-screen state (active tab, planner form, modal state, toasts).

---

## 📝 Forms & Validation

- `utils/validation.js` — shared validators (required, length/range, pattern)
  used by the Day 4 forms.
- Forms render inline messages associated with their fields
  (`aria-describedby` / `aria-invalid`), disable submit while invalid or busy,
  and surface recoverable server errors without losing user input.
- Existing form architecture reused (`PlannerForm`, `TransitSearchForm`,
  `CreateReportModal`, `CreateGroupModal`, `FeedbackModal`) — no second form
  system was introduced.

---

## 📡 API-Connected Behaviour (service layer only)

- All requests stay behind `services/api.js` + feature services
  (`transit.js`, `liveReports.js`, `rideGroups.js`).
- Feature services now **reject** on an explicit `success: false` payload
  (`FrontendApiError`) instead of resolving to `[]`, so a failed request shows
  the error state with retry rather than a misleading “no results” empty state.
- Refresh handlers report background failures (“showing previously loaded
  data”) while keeping existing content visible.
- Duplicate/in-flight requests are guarded (double-submit on transit search,
  retry while a request is running).
- Live-stream drops surface a warning banner with a **Reconnect** action on
  Live Alerts; connectivity state is tracked from the existing Socket.IO
  client (`connect` / `disconnect` / `connect_error`).
- No backend code, endpoints, or auth behaviour was added or changed.

---

## ✅ Day 4 Verification

Run from `frontend/`:

```bash
npm test     # verify-frontend.js (includes the Day 4 section)
npm run build
```

Results (Day 4):

- `verify-frontend.js` — **127 checks passed, 0 failed, 0 warnings** (new
  “13. DAY 4 FEATURES” section covers the Day 4 screens, components, state
  helpers, service request-state contract, and docs).
- `vite build` — successful production build (no lint/type-check is configured
  in this project).
- Headless-browser smoke (Chrome + CDP against the running dev server and real
  backend) — **25/25 checks passed**: all four screens open via desktop and
  mobile navigation, an API-backed transit search returns real GTFS stops,
  an unknown query shows the empty state, Live Alerts loads real reports and
  responds to filtering, no horizontal overflow at 390/768/1440 px, focus
  reaches navigation, and no runtime/console errors were captured.
- Failure/recovery check — with the backend stopped, Live Alerts renders the
  friendly error state with a working “Reload Alerts” retry; after the backend
  restarted, the retry loaded real data (0 console errors).
- Manual checks — search → planner hand-off, filters/sort persistence, form
  validation (valid, invalid, empty, keyboard-only), loading/empty/error/retry
  states, and focus visibility.
