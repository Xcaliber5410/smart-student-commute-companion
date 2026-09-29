# Day 5 — Dashboard, Visualizations, Feedback, Preferences & PWA (Xcaliber)

Day 5 extended the Day 1–4 frontend with a student dashboard overview, a
saved-commutes screen, reusable progress/data-visualization components, a
dismissible notification queue, device-local personalization controls, PWA
install/offline UX, and a focused responsive/accessibility polish pass.

---

## 📄 Day 5 Commits

| # | Commit message |
|---|----------------|
| 1 | `feat(frontend): enhance student dashboard experience` |
| 2 | `feat(ui): add reusable progress and data visualization components` |
| 3 | `feat(frontend): add notification and user feedback experiences` |
| 4 | `feat(frontend): add student personalization and preference controls` |
| 5 | `feat(pwa): improve installability and offline user experience` |
| 6 | `fix(frontend): complete responsive and accessibility polish` |
| 7 | `test(frontend): verify Day 5 frontend implementation` |

---

## 🗺️ Feature Screens

```
frontend/src/pages/
├── PlannerPage.jsx          # Plan Route + dashboard overview (Day 5)
├── MyCommutesPage.jsx       # Saved commute setups (NEW — Day 5)
├── TravelTogetherPage.jsx   # Ride groups (Day 3/4)
├── LiveAlertsPage.jsx       # Live disruptions (Day 3/4)
└── TransitSearchPage.jsx    # Transit Search (Day 4)
```

### 1. Student dashboard (commit 1)

`DashboardOverview.jsx` sits at the top of the planner screen:

- Summary tiles fed by **real application state** (saved commutes, live
  alerts, ride groups, socket sync status) — counts render `—` during the
  first load instead of a misleading `0`.
- Quick-access actions (My Commutes, Transit Search, Post a disruption).
- Recent transit searches as one-tap chips with a meaningful empty state.
- An inline `Alert` + Retry when the initial counts fail to load.

### My Commutes (commit 1)

Saved commute setups stored **on this device only** through the existing
`uiPreferences` localStorage store:

- `saveCommute` / `removeSavedCommute` / `readSavedCommutes` with
  signature-based duplicate collapse (capped at 8 entries).
- Sanitized on read (invalid entries are dropped, corrupt payloads reset).
- Card list with `Plan this commute` (loads the setup into the planner and
  runs it) and `Remove` behind a confirmation dialog.
- Honest storage note: area-level planner fields only — never accounts,
  tokens, or exact locations.

---

## 📊 Reusable Progress & Data Visualization (commit 2)

| Component | Purpose |
|-----------|---------|
| `ui/ProgressBar.jsx` | Accessible `role="progressbar"` meter with clamped values, exact value text, and an explicit "no data" state |
| `ui/ComparisonBars.jsx` | Dependency-free horizontal bar chart with a scale derived from the data (never an invented axis) and an empty state |

Used with **real plan/weather data** in `RouteResults.jsx`:

- Fare vs the student's max budget (with remaining-budget hint).
- Rain probability from the weather API (high-risk styling).
- Travel time and fare comparisons across the recommended route and its
  alternatives.

No charting library was introduced.

---

## 🔔 Notifications & Feedback (commit 3)

`Toast.jsx` became a dismissible notification **queue**:

- Capped at three entries; each toast owns its auto-dismiss timer
  (errors linger 6s, others 3.5s) so overlapping events can't cancel
  each other.
- Success/info/warning announce via `role="status"` (polite); failures use
  `role="alert"` (assertive).
- Every toast has a keyboard-focusable dismiss button with a labeled name.
- The region floats above the mobile bottom nav without reflowing layout.
- A socket disconnect transition now surfaces as a warning toast; a
  reconnection confirms when the stream returns.

---

## 🎛️ Personalization & Preferences (commit 4)

`PreferencesDialog.jsx` (opened from the navbar and the mobile drawer):

- **Show dashboard overview** — hides/shows the summary section live.
- **Live report notifications** — mutes/unmutes live-report toasts
  (checked fresh on each socket event).
- Labeled native switches (`role="switch"`), immediate visual feedback,
  toast confirmation, `Restore defaults`.
- Persisted via `writeAppPreferences` in `uiPreferences.js`; the dialog
  states plainly that preferences are **device-local** — there is no
  backend sync endpoint and none is implied.

---

## 📲 PWA Installability & Offline (commit 5)

- **Manifest**: added `id`, `scope`, `lang`, `dir`, `display_override`
  for a stable install identity.
- **Install prompt**: `hooks/usePwaInstall.js` captures
  `beforeinstallprompt` (guarded, one-shot) and the navbar/mobile drawer
  show an **Install App** action only when the browser offers it.
- **Status banner**: `PwaStatusBanner.jsx` reports offline state, back-online
  recovery (both announced politely), and a pending service-worker update
  with an explicit Refresh action.
- **Service worker**: caching strategy preserved (cache-first static,
  `/api/` + sockets excluded, network-only dynamic data). Added a branded
  offline fallback page for first-visit-while-offline navigations instead of
  a raw browser error. No sensitive data is cached.

---

## 🧼 Responsive & Accessibility Polish (commit 6)

Fixed issues found by a scripted audit of all five screens at 390/768/1280px:

- **Layout viewport bug**: the top privacy banner's `truncate` span lacked a
  `min-w-0` flex parent, forcing a 498px min-width on every mobile page.
  Fixed with `min-w-0 flex-1` — the viewport now respects 390px.
- **Touch targets**: range sliders grew from 6px to 24px (custom track/thumb
  styling in `index.css`); Leaflet attribution links padded to 24px.
- **Heading outline**: `EmptyState`/`ErrorState`/`LoadingState` gained a
  `headingLevel` prop; page-level states render `h2`, removing the h1→h3
  jump on My Commutes, Travel Together, and Live Alerts.

---

## ✅ Day 5 Verification

Run from `frontend/`:

```bash
npm test     # verify-frontend.js (now includes "14. DAY 5 FEATURES")
npm run build
```

Results (Day 5):

- `verify-frontend.js` — **154 checks passed, 0 failed** (new Day 5 section
  covers the dashboard, My Commutes, visualization components, notification
  queue, preferences, PWA manifest/SW/hook/banner, and the polish fixes).
- `vite build` — successful production build (no lint/type-check is
  configured in this project).
- Headless-browser audits (Chrome + CDP against the dev server):
  - Dashboard/My Commutes smoke — 16/16.
  - Visualizations with an injected real-shaped plan payload — 18/18.
  - Notification queue (success, error, dismiss, keyboard, mobile) — 11/11.
  - Preferences (toggle, persist across reload, restore, Escape, mobile) — 28/28.
  - PWA against the production preview (SW registered): manifest identity,
    install prompt, offline banner, **full offline reload from SW cache**,
    API responses uncached — 19/19.
  - Responsive/a11y audit across five screens × three viewports — 34/34;
    touch-target/dialog audit — 10/10.
- Backend note: the backend currently answers core endpoints with
  `401 UNAUTHORIZED` for anonymous clients (a known backend/middleware
  regression tracked outside the frontend). All Day 5 UI verified against it
  degrades gracefully — error toasts and retry states, no crashes.

---

## 🚧 Blocked by Missing Backend Functionality

- Server-side persistence of user preferences (the app stores them
  device-locally and says so; no sync endpoint exists).
- Anonymous plan requests currently require auth (backend regression above),
  so route visualizations were verified with a fixture payload matching the
  documented `commutePlanService` response shape.
