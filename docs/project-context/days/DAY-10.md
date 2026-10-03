# Day 10 — PWA Analytics & Monitoring (Xcaliber)

> Verified from the Day-10 diffs, `verify-frontend.js` section 19, and session-local
> browser checks. Date: 2026-10-03 (all 7 commits).

## Objective

Implement the last unchecked `frontend/PWA_SETUP.md` roadmap section —
**"Day 10: Analytics & Monitoring"** — as one coherent feature: PWA installation
tracking, offline usage analytics, cache hit/miss rates, and service-worker error
monitoring. Entirely client-side (device-local metrics only; no backend needed, no
endpoints invented).

## Implemented (verified from diffs)

- **Feature screen** `src/pages/AnalyticsPage.jsx` — ninth tab (`?tab=analytics`).
  Header + Refresh; explicit loading / empty / error / retry states for the recorded
  snapshot; four sections (Installation tracking, Offline usage, Cache performance
  with a `ProgressBar` hit-rate meter, Service worker monitoring); privacy footer
  ("counted and stored on this device only"). Live facts (install status, display
  mode via `matchMedia('(display-mode: standalone)')`, connection, SW control via
  `controllerchange`) always render.
- **Component** `ui/EventLogList.jsx` — reusable chronological log: ordered list +
  `aria-label`, kind badges (install/offline/online/cache/sw-error/sw-update), level
  dots (never color-only), wrapping messages, `role="status"` empty message; exported
  from the ui barrel and documented in `ui/README.md`.
- **Interactions** — `TIME_WINDOWS` chips (`aria-pressed`, labelled `role="group"`)
  filter the logs; Show more/Show less expansion (`EVENT_ROWS_STEP = 5`); reset via
  shared `ConfirmDialog` through the `onResetAnalytics` prop.
- **Service** `src/services/pwaAnalytics.js` — failure-safe localStorage
  (`smart_commute_pwa_analytics`); `readAnalyticsSnapshot()` (merges the SW's own
  counters + storage estimate), `recordInstallOutcome`, `markInstalled`,
  `beginAnalyticsSession`/`beginOfflinePeriod`/`endOfflinePeriod`, `resetAnalytics`
  (forwards `pwa-analytics-reset`), `watchAnalytics` — all SW messaging on the
  **`navigator.serviceWorker` container** (see Blockers).
- **Service worker** `public/sw.js` — dedicated cache store `pwa-analytics-v1`
  (URL `/__pwa-analytics-store__`, deliberately **not** `sscc-`-prefixed so the
  activation cleanup skips it); `recordAnalytics()` counts `cache-hit`/`cache-miss`
  (same-origin only) and worker `error`/`unhandledrejection`; message branches
  `pwa-analytics-sync` (pull), `pwa-analytics-reset`, `pwa-analytics-updated`
  broadcast; writes serialized on an `analyticsTx` promise chain.
- **App wiring** `App.jsx` — `analyticsResource` (`useAsyncResource`), snapshot load
  at mount + on offline/online transitions + `appinstalled` + after install outcomes;
  `handleRefreshAnalytics` (warns on failure while keeping data) and
  `handleResetAnalytics` (confirm → clear → reload → toast).
- **Responsiveness (C5)** — Desktop nav labels re-tiered for nine tabs:
  icon-only <1536px, short labels 2xl→1919px, full labels `min-[1920px]` (fixes a
  measured +56px header overflow at 1750–1919px); bottom-nav padding `px-1`/`px-0.5`;
  analytics tiles `sm:grid-cols-2`/`md:grid-cols-3` (fixes tile clipping at 1280);
  controls raised to `min-h-9` (36px). Verified: `scrollWidth − innerWidth ≤ 0` at
  360/768/1024/1280/1536/1750/1920.
- **Accessibility (C6)** — polite `role="status"` live regions for refresh
  ("Refreshing metrics…" → "Metrics refreshed.") and event counts ("Showing X of Y
  events (window)"); "Show less" hands focus back to the reappearing "Show more"
  control (project's `getElementById(...).focus()` pattern) so keyboard focus is not
  dropped on unmount.
- **Verify (C7)** — section "19. DAY 10 PWA ANALYTICS & MONITORING" (30 checks) —
  suite reached **231 checks / 19 sections**.

## Important Files

`frontend/src/pages/AnalyticsPage.jsx`, `frontend/src/services/pwaAnalytics.js`,
`frontend/public/sw.js`, `frontend/src/components/ui/EventLogList.jsx`,
`frontend/src/App.jsx`, `frontend/src/components/Navbar.jsx`,
`frontend/verify-frontend.js`

## Frontend Features

New `analytics` tab: install-prompt outcomes (accepted/dismissed/unavailable +
`appinstalled` timestamp), offline periods (count, cumulative duration, last seen),
cache hit-rate + raw hit/miss counters + `navigator.storage.estimate()` usage,
SW health (control state, error count, last error) with install/error event logs.

## UI/UX

Four-section dashboard on the existing shell; stat tiles reflow across breakpoints;
≥36px touch targets; label tiers keep the nine-tab header overflow-free; loading
(LoadingState), empty (EmptyState), error (ErrorState + retry) are honest about
absent data; destructive reset gated by ConfirmDialog; status feedback announced
politely.

## API/Service Integration

None — no backend endpoints used or needed (the roadmap items are browser-API
metrics). Only existing frontend abstractions: `useAsyncResource`, ui-kit states,
toasts. Nothing faked.

## PWA

Completes the four `PWA_SETUP.md` Day-10 roadmap items. SW now self-monitors: cache
hit/miss counters and worker error capture live in a cache store that survives page
reloads but is independent of the app shell caches; pages pull/merge it over
structured messages. Note: `PWA_SETUP.md` checkboxes were left untouched (documented
doc drift, same as Days 8–9).

## State Management

Dual-store snapshot: localStorage (page-side events + install/offline counters) merged
with the SW cache store (hit/miss/error counters) on every read; `watchAnalytics`
subscribes to `pwa-analytics-updated` broadcasts (container listener, coalesced).
Reset clears both sides. No global store introduced.

## Testing

- `cd frontend && npm run verify` → **231/231** (baseline 201 + 30 Day-10 checks);
  `npm run build` green (pre-existing >500 kB chunk warning). Lint/type-check: N/A
  (not configured).
- Session-local CDP checks (not committed, "Not verified from repository history"):
  live E2E against the preview build with a real SW (hit-rate meter rendered real
  counts, localStorage synced), responsive sweep 360–1920 (no overflow/clipping),
  keyboard focus rings + Show-less focus handoff, reset dialog → empty state,
  nav label tiers at 1280/1536/1919/1920, Day-9 regression (planner, installshare,
  feed, mycommutes render).

## Git

- Start-of-day sync: latest `main` (`57c5c51`, backend search work) pulled and merged
  into `frontfeat` (fast-forward), then pushed. A **user-approved single force-push**
  had earlier reset `frontfeat` (local + origin) to `1737f5f` to discard a broken
  abandoned Day-10 attempt; its WIP was preserved in stash
  `day10-failed-attempt-wip` and is intentionally NOT part of any commit.
- Seven implementation commits (each pushed immediately):
  - `5abf7f2` feat(frontend): implement Day 10 feature screen
  - `568194a` feat(ui): add Day 10 feature components
  - `2083bd0` feat(frontend): add Day 10 feature interactions
  - `f74f845` feat(frontend): integrate Day 10 feature with existing services
  - `813976b` fix(frontend): polish Day 10 feature responsiveness
  - `98ef445` fix(frontend): improve Day 10 feature accessibility and states
  - `0f5f756` test(frontend): verify Day 10 feature
- One docs commit (`docs: update project context for Day 10`), then end-of-day sync
  `main → frontfeat` and merge `frontfeat → main`, both pushed.

## Blockers

- None for this feature (no backend capability required).
- **Pre-existing bug found, NOT fixed (outside Day-10 scope):**
  `services/shareTarget.js` listens on `window.addEventListener('message')`, but
  service-worker `client.postMessage()` arrives on the `navigator.serviceWorker`
  container — so Day-8's SW→page share-target messages never reach the handler; the
  sessionStorage fallback covers the real flow. Day 10 deliberately uses container
  listeners everywhere to avoid the same trap.
- Pre-existing cosmetic issues documented, not fixed: brand title in the header can
  truncate at very wide viewports; `verify-frontend.js` still prints "Day 1 frontend
  foundation…" in its success footer.

## Notes For Future AI

- All SW→page messaging must listen on `navigator.serviceWorker` (container), never
  `window` — this bit both Day 8 and an earlier Day-10 draft.
- Keep `pwa-analytics-v1` out of the `sscc-` prefix on purpose: activation cleanup
  would delete the metrics store.
- Counters are same-origin-only and serialized (`analyticsTx`) to avoid double
  counting and interleaved writes; extend via `recordAnalytics`, don't inline writes.
- Session/offline timestamps are stored as ISO strings (`new Date(now).toISOString()`)
  and parsed with `Date.parse` — keep the format consistent.
- The analytics tab is the ninth nav item; any future tab must respect the
  `min-[1920px]` label tiering or the header will overflow again.
