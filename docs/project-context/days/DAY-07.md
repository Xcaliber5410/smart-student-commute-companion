# Day 7 — Device Alerts (OS-Level Notifications) (Xcaliber)

> Reconstructed from Git history. Date: 2026-10-01 (all 7 commits).

## Objective

Let the app raise operating-system-level alerts for live disruption reports while the
tab is backgrounded (the PWA roadmap's Web Notifications work), with honest permission
handling and a preference to opt out.

## Implemented (verified from diffs)

- Screen: `pages/DeviceAlertsPage.jsx` (167) — status/permission section, enable +
  send-test actions, explanation ("How it works") and settings sections.
- Components: `components/DeviceAlertPermissionCard.jsx` (87 — status badge +
  `role="status"` live region); `ui/Toggle` (79 — `role="switch"` checkbox, ON/OFF
  text, `peer-focus-visible` ring) exported from the ui barrel.
- Service: `services/deviceAlerts.js` (113) — feature-detect Notification API,
  `requestPermission`, `showNotification` with
  `navigator.serviceWorker.ready` registration fallback (Android Chrome),
  `getDeviceAlertPermission`, `watchPermission` (external changes), never throws when
  unsupported.
- App integration: permission state + request handler + test-alert sender; preference
  `deviceAlerts` added to `DEFAULT_APP_PREFERENCES` (`uiPreferences.js` +8);
  socket listener `live_report_created` → `showDeviceNotification` only when
  pref on && permission granted && `!document.hasFocus()`; `watchDeviceAlertPermission`
  wired on mount; navbar `devicealerts` tab (+30 lines in `Navbar.jsx`).
- Verify suite +109 (current section "16. DAY 7 DEVICE ALERTS").

## Important Files

`frontend/src/pages/DeviceAlertsPage.jsx`,
`frontend/src/services/deviceAlerts.js`,
`frontend/src/components/DeviceAlertPermissionCard.jsx`,
`frontend/src/components/ui/Toggle.jsx`, `frontend/src/App.jsx`,
`frontend/src/utils/uiPreferences.js`

## Frontend Features

Device Alerts tab: permission card (unsupported/denied/granted states), enable toggle
(persisted), "Send test alert", automatic backgrounded alerts for new live reports.

## UI/UX

Permission states shown as badge + description (never color-only); accessible switch
with visible focus; explanation/settings sections per the standard page pattern.

## API/Service Integration

No HTTP endpoints. Pure browser Notification API + Socket.IO trigger
(`live_report_created`). Not Web Push — no server push subscription.

## PWA

Uses the service worker only as a notification fallback
(`registration.showNotification`); no `push` handler added to `sw.js`.

## State Management

New persisted preference `deviceAlerts` (default true) via the Day-5 preferences
pattern; permission kept live via a watcher.

## Testing

`23469db test(frontend): verify Day 7 feature` — suite green (175 checks at that
point). Browser-level checks during this day used session-local tooling (not
committed — Not verified from repository history as repo assets).

## Git

- `54c7af2` feat(frontend): implement Day 7 feature screen
- `8f350ee` feat(ui): add Day 7 feature components
- `f9d3930` feat(frontend): add Day 7 feature interactions
- `c89e10b` feat(frontend): integrate Day 7 feature with existing services
- `d36f4c9` fix(frontend): polish Day 7 feature UX and responsiveness
- `f9c8e54` fix(frontend): improve Day 7 feature accessibility and states
- `23469db` test(frontend): verify Day 7 feature
- Sync context: backend planning/calendar suite (09-30: `17f6603`…`c1766d0`, Skan) sits
  directly before Day 7 in history with NO merge commit between it and Day 6 —
  consistent with a fast-forward `main` → `frontfeat` sync at Day-7 start (the exact
  sync command is not recorded in history).

## Blockers

None. Notification permission is browser-controlled; denied permission degrades to
honest guidance (documented in-page).

## Notes For Future AI

- The 7-commit message template ("implement Day X feature screen" → "test(frontend):
  verify Day X feature") became fixed from this day on (Days 8 and 9 reused it
  verbatim with the day substituted).
- Respect the `deviceAlerts` preference and `!document.hasFocus()` guard when touching
  alerting logic — they exist to avoid nagging while the user is looking at the app.
