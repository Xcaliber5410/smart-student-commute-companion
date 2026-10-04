# Day 13 — Notification Preferences: Quiet Hours (Xcaliber)

> Verified from the Day-13 diffs, `verify-frontend.js` section 22, and the checks run
> at day end. Date: 2026-10-04 (all 7 commits).

## Objective

Implement the client-side "User notification preferences" roadmap item
(`frontend/PWA_SETUP.md` — Day 6-7 Push Notifications → **User notification
preferences**) for the Smart Student Companion. It is the natural continuation of
Day 12's Notifications center: instead of *showing* notifications, the student now
gets to *control when they arrive*.

The documentable scope of this item is the **device-local** preference set:
graders of *when* the student is disturbed. The remaining Day 6-7 items were
evaluated and deliberately left unbuilt:

- **Server-side push notification setup** — BLOCKED: no push subscription exists on
  the backend (push is server-initiated; this project has none).
- **Route delay notifications** — no route-delay data exists client-side; the data
  would have to come from a backend endpoint that is itself still internal, so this
  is deferred (not faked).
- **Real-time disruption alerts** — already delivered (socket live feed + Day 7 OS
  alerts).

Nothing was invented: every control reuses existing services and conventions.

## Selected feature and why

**"User notification preferences"**, concretely delivered as **"quiet hours"** — a
device-local daily window (default 22:00–07:00) during which live report toasts and
OS-level device alerts are suppressed, while the feed still receives every report.

Rationale:

- It is a documented, *unfinished* roadmap checkbox — the only remaining
  notification-related item beyond Day 12.
- It is real, meaningful product value (students stop being interrupted during
  night study) without a backend dependency at all.
- It is safe to verify and low-risk: no new API, no endpoints; purely
  client-side preference + trigger gating. The only harder roadmap item —
  Background Sync — was deliberately declined: the service worker cannot read the
  Day-11 localStorage queue, and a second independent flusher would risk
  **duplicate reports in the crowdsourced feed**, which static verification alone
  cannot prove. Deferred, documented as known risk.
- Continues the leading theme of the last two days (Day 12: notification *view*,
  Day 13: notification *control*) without touching navigation or any other tab.

## Implemented (verified from diffs)

- **Screen surface** `src/components/PreferencesDialog.jsx` — the app's existing
  personalization dialog gained a "Notifications" tab-group with:
  - the existing "Live report notifications" toasts switch (reused, not duplicated),
  - the new **"Quiet hours"** switch,
  - a labelled start/end time pair (`TimeRangeInput`),
  - a live status line ("Quiet hours are active now (22:00–07:00) — toasts and
    device alerts are paused. Reports still appear in Live Alerts.") that recomputes
    each minute so it never goes stale while the dialog stays open;
  - honest copy: quiet hours mute **pop-ups only**; nothing in the feed is hidden.
- **Component** `src/components/ui/TimeRangeInput.jsx` (new) — a labelled
  start/end time pair wrapped in a `fieldset`/`legend` (group announced by screen
  readers before each time, joint disabling, per-field error messages,
  hint slot). Exported from the ui barrel and documented in `ui/README.md`.
- **Component deduplication** — the dialog previously carried its own copy of a
  `Switch` (a local ~40-line replica of `ui/Toggle`). Replaced with the shared
  `ui/Toggle` so the dialog adopts the project's committed pattern (visible label +
  description, explicit focus rings, ON/OFF text, native keyboard operation).
- **Interactions** (client-side): type-in drafts so half-typed times never snap
  back; live validation with `role="alert"` messages on invalid `HH:MM`; forgiving
  blur — an unparsable draft reverts to the stored value instead of trapping the
  student; drafts are re-synced whenever the parent resets defaults; the
  quiet-hours switch clears in-progress time errors.
- **Persistence** via the existing `utils/uiPreferences.js` conventions: three new
  keys (`quietHoursEnabled` bool, `quietHoursStart`/`End` `HH:MM` strings) in
  `DEFAULT_APP_PREFERENCES`, per-key validation in `readAppPreferences`/`writeAppPreferences`,
  and two helpers: `isValidQuietHoursTime` (value shape) and `isQuietHoursActive`
  (window evaluation — handles overnight wrap, refusal of empty windows, and
  defaults application per key). Storage envelope unchanged: failure-safe,
  bounded-capacity (Day-11 style).
- **Trigger-point integration** in `App.jsx`: the two notification pop-up paths
  (`live_report_created` toast + device-alert mirror) now read `isQuietHoursActive`
  **fresh on every event** and gate both. Critically, reports *still reach the feed*
  — a quiet moment suppresses the announcement, not the report:
  `reportsResource.setData` runs before the gate, and the gate only wraps the
  `showToast`/`showDeviceNotification` calls.
  Preference-change toasts now include quiet-hours phrasing
  (`"Quiet hours now run 22:00–07:00"`), and `handlePreferenceChange` handles the
  new keys.
- **Cross-screen state surfacing** in `pages/DeviceAlertsPage.jsx`: when quiet
  hours are active an honest `role="alert"` warning explains the pause and the
  resume time, the Device alerts tile hint changes to "Paused by quiet hours",
  and the footer text adjusts accordingly. A 60-second clock tick keeps the
  "active now" reading fresh across the window boundary. Manual test alerts still
  fire (explicit user action), as the alert text states.
- **Responsive polish**: the preferences dialog grew from ~40 to ~80 lines of
  controls, so its `Modal` size moved from `md` to `lg`; the dialog scrolls
  (`overflow-y-auto`) on short viewports. `TimeRangeInput` pairs become two
  columns only at ≥420px (measured inner width ~160px per time field — fits the
  native time picker) and stack on narrow screens; every modal renders
  `overflow-y-auto` and the document scrolls.
- **Accessibility (C6)**: dialog section labels are real `h4` headings under the
  dialog `h3` title; the quiet status is a polite `role="status"` region; time
  fields use `<fieldset>`/`<legend>`; per-field errors reuse `Input`'s built-in
  `role="alert"` + `aria-invalid`; disabled states are styled through
  `fieldset` propagation; the shared `Toggle` exposes its `disabled` prop; all
  focus behaviour comes from native controls inside the Modal focus trap (pre-existing,
  verified by reading the Modal source).

## Important Files

`frontend/src/components/PreferencesDialog.jsx`, `frontend/src/utils/uiPreferences.js`,
`frontend/src/components/ui/TimeRangeInput.jsx`, `frontend/src/components/ui/README.md`,
`frontend/src/components/ui/index.js`, `frontend/src/App.jsx`,
`frontend/src/pages/DeviceAlertsPage.jsx`, `frontend/verify-frontend.js`

## Routes Added/Changed

- **None.** The feature lives in an existing settings surface;
  all 10 tabs, 10 pages and the routing table are untouched. No new tab,
  no `?tab=` deep links, no `backend/` files.

## Services / API Integrations

- Reused, never invented: `services/uiPreferences.js` (localStorage `smart_commute_*`
  pattern, `safeRead`/`safeWrite` envelope), `services/liveReports` contract is
  *unaffected* (reports flow unchanged), `showToast`/`showDeviceNotification`
  triggers gated client-side, `ui/Toggle`, `ui/Input(type=time)`,
  `ui/TimeRangeInput` (Day 13), Modal focus management.
- **No new endpoint, no new payload, no fabricated response.**

## Client-Side State

App-level `appPreferences.quietHoursEnabled/Start/End` (persisted to localStorage by
the existing preference store, `smart_commute_notification_quiet_hours`-free design),
plus dialog-local drafts, clock tick, and per-field time errors. Reset-forwards
pure rendering.

## PWA Behavior

None added to `sw.js`: quiet hours are purely in-process gating of
push-style pop-ups; there is no background sync and no data caching in this day.

## Testing / Checks Performed

- `cd frontend && npm run verify` → **310/310** (baseline 285 + 25 Day-13 checks
  across sections 22) — run at day end and again after the `main` merge.
- `cd frontend && npm run build` → green (pre-existing >500 kB chunk warning only).
- Lint / type-check: N/A (not configured in this repo).
- Browser/PWA runtime verification: session-local only — "Not verified from
  repository implementation" for live quiet-hour cross-boundary behaviour.

## Known Limitations

- Read-only mitigation, not a product decision: quiet hours suppress **pop-ups**
  *and* OS alerts; the feed/Notifications screen is unaffected.
- Quiet hours are device-local in the same privacy posture as all the other
  preference data — they never leave the browser.
- Silent-window equivalence: start == end is deliberately rejected as a quiet
  window (would otherwise mute for 24h) — the store keeps both values; a future
  explicit "24h" mode could be added separately.
- The stale-checkbox file `frontend/PWA_SETUP.md` was **not** edited (documented
  doc drift in Days 8‑12; see `docs/project-context/CURRENT_STATE.md`).

## Backend Dependencies / Blockers

- None added. Deferred (JWT-blocked or data-absent, documented, never faked):
  - Server-side push subscription (if any) — `PWA_SETUP.md` day 6-7. Push requires
    a server push system this project does not have.
  - Real-time route-delay notification data — no route-delay data source exists,
    and its backend endpoints are not exposed to this project.
- JWT-gated backend domains remain untouched (FEATURES.md §Backend Dependent).

## Next Logical Frontend Work

- The last roadmap checkboxes are the install-promotion/shortcuts and the
  remaining PWA_SETUP items (see `docs/project-context/CURRENT_STATE.md`).
- Background Sync for the Day-11 offline queue remains the top open correctness
  question for a future day (same risks as documented above).
- Auth-gated domains stay BLOCKED until a real auth story exists.

## Git

- Start-of-day sync: `main` and `frontfeat` both at `03fc35b` (Day-12 docs);
  merge reported "Already up to date", clean working tree.
- Seven implementation commits (each pushed immediately, exact messages, no
  attribution):
  - `c778720` feat(frontend): implement Day 13 feature screen
  - `c3b1f49` feat(ui): add Day 13 feature components
  - `a7263bd` feat(frontend): add Day 13 feature interactions
  - `c19dcbe` feat(frontend): integrate Day 13 feature with existing services
  - `52a8714` fix(frontend): polish Day 13 feature responsiveness
  - `3ff004e` fix(frontend): improve Day 13 feature accessibility and states
  - `bef9454` test(frontend): verify Day 13 frontend implementation
- One docs commit (`docs: update project context for Day 13`), pushed;
  end-of-day sync `main → frontfeat` and merge `frontfeat → main`, both pushed.
- Note: an intermediate edit accidentally introduced a phantom render node in
  `App.jsx` (work in progress only); it was removed from the working tree before
  any commit landed — `main`/`frontfeat` contain clean Day-13 diffs
  (verified: `0` occurrences in `frontend/src/App.jsx`).
