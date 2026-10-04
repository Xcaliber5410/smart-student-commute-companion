# Full Project Audit — Frontend/PWA, Day 1 → Day 13 (Xcaliber)

> Audit date: 2026-10-04 · Branch: `frontfeat` · Base at audit start: `ef64b1d`
> (Day-13 docs). Method: repository + Git-history inspection, backend-contract
> cross-check, static checks, production build, and **runtime testing of the
> production bundle in headless Chrome (CDP)** — including a real offline
> reload and a real share-target launch simulation.
> Everything below states how each claim was verified. Nothing was taken from
> the existing markdown on trust.

## 1. Scope

All frontend/PWA work Day 1–13: architecture, shell, tab routing, UI kit,
forms/validation, state, API/service integration, auth-adjacent behavior,
PWA (manifest, SW, caching, offline, install, share target, notifications),
Day-10 analytics, responsive, accessibility, tests, build, dependencies,
environment config, security-relevant checks, documentation accuracy.

## 2. Days audited — verification matrix

| Day | Feature | Documented | Implemented | Reachable | Integrated | Tested | Runtime-verified | Notes / Evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | Shell, nav, design system | ✓ | ✓ | ✓ | ✓ | suite | ✓ tabs render | `layouts/`, `Navbar`, kit; all 10 tabs render in prod build |
| 2 | Pages, states, deep links | ✓ | ✓ | ✓ | ✓ | suite | ✓ all 10 `?tab=` URLs | unknown tab falls back to planner (runtime) |
| 3 | Planner / Live feed / Groups (API) | ✓ | ✓ | ✓ | ✓ | suite | PARTIAL (backend blocked) | endpoints+shapes match controllers (`reports`/`groups`) |
| 4 | Transit search (GTFS) | ✓ | ✓ | ✓ | ✓ | suite | PARTIAL | `GET /transit/search` → `{success,stops,routes}` matches |
| 5 | Preferences, saved commutes | ✓ | ✓ | ✓ | ✓ | suite | code-verified | validated localStorage helpers; forms use ui/Input etc. |
| 6 | Demo reset wiring | ✓ | ✓ | ✓ | ✓ | suite | not runtime-tested | note: 7 empty Day-6 commits pollute history (pre-existing) |
| 7 | Device alerts (OS notifications) | ✓ | ✓ | ✓ | ✓ | suite | code-verified | permission + SW-notification fallback correct |
| 8 | Install & Share hub, Share Target | ✓ | **BROKEN → FIXED** | ✓ | **fixed** | suite + new locks | **✓ verified after fix** | see Finding A (P1) |
| 9 | Install promo banner/dialog | ✓ | ✓ | ✓ | ✓ | suite | code-verified | eligibility + 7-day snooze honest-degradation |
| 10 | PWA analytics & monitoring | ✓ | ✓ | ✓ | ✓ | suite | **✓ store sync seen live** | SW↔page `pwa-analytics-store` observed at runtime |
| 11 | Offline report queue | ✓ | ✓ | ✓ | ✓ | suite | code-verified | delivery uses existing `POST /api/live-reports` only |
| 12 | Notification read state + badges | ✓ | ✓ | ✓ | ✓ | suite | code-verified | bounded 300 ids, failure-safe |
| 13 | Quiet hours / notification prefs | ✓ | ✓ | ✓ | ✓ | suite | code-verified | wrap + empty-window guards confirmed in source |

## 3. Runtime verification performed (production build)

Commands: `npm run build` → `npx vite preview --port 4173` → headless Chrome
via CDP (session-local script, not committed).

Results (verified):

- All 10 tabs + unknown-tab fallback render with **zero uncaught page
  exceptions**; only expected network errors (backend not running).
- **Service worker registers, activates and controls the page** (scope `/`).
- **Offline reload serves the cached shell** for `/` and deep links
  (`/?tab=planner`, `/?tab=feed`) with the network fully emulated offline.
- **Share-target flow**: `POST /share-target` through the real SW → 303
  redirect to `/?share-target=1` → payload delivered to the UI **after Fix A**
  (before the fix it never reached the UI — reproduced first).
- Manifest served and valid: 10 icons (incl. 2 maskable), share_target
  declared; `pwa-analytics-store` sync observed live (hits/misses counters).
- 360px viewport: no horizontal overflow; 10-item bottom nav present.

## 4. Findings

### A. P1 — Share-target payload never reached the app (found + FIXED)

- **Root cause (two stacked bugs):** `services/shareTarget.js` listened for
  the SW reply on `window`, but SW `client.postMessage()` arrives on the
  `navigator.serviceWorker` container; and `watchShareTargetDeliveries()`
  pinged with type `SHARE_TARGET_PING`, which the worker never handles (it
  answers `SHARE_TARGET_FETCH`). The "sessionStorage fallback" claim in the
  Day-10 notes was false — nothing writes sessionStorage in this flow.
- **Reproduced at runtime before fixing:** SW stash worked (303 + cache),
  reply observed on `navigator.serviceWorker` only, `window` got nothing,
  shared content absent from the UI.
- **Fix:** listen on `navigator.serviceWorker` (window kept as fallback);
  request stashed payloads with `SHARE_TARGET_FETCH`.
- **Verified after fix:** shared title/text render in the Install & Share
  hub; sessionStorage populated then consumed/cleared; worker cache cleaned.

### B. P2 — Ride-group join skipped backend guards (found + FIXED)

Backend `joinRideGroup` reads `req.user || req.headers['x-user-token']` to
enforce creator/already-member guards; the frontend never sent the header
(the same anonymous token the vote endpoints already send). Fixed in
`services/api.js` (`joinRideGroup` now sends `x-user-token`). Contract-only
change — no backend modification, no invented endpoint.

### C. P3 — Dead import (found + FIXED)

`App.jsx` imported `isShareTargetLaunch` but never called it. Removed.

### D. P4 — Documentation inaccuracies (corrected)

- `CURRENT_STATE.md` claimed forms are "built on `ui/FormField`" — false;
  forms use `ui/Input`/`ui/Select`/`ui/Textarea` directly (verified).
- Share-target bug notes ("sessionStorage fallback covers the real flow")
  were wrong — corrected to record the real root cause and the fix.
- Verify counts updated: the suite grew 310 → **314 checks / 23 sections**
  (new section 23, regression locks from this audit).

### E. P4 — Noted, intentionally NOT changed

- `public/icons/convert-to-png.md` ships into `dist/` (public/ is copied
  verbatim); referenced by 5 docs — moving it is churn for a harmless file.
- `sw.js` has a second `message` listener block — legal, both run.
- `sw.js` `CACHE_URLS` branch has no client sender (dead handler); removing
  SW code risks more than it buys; documented instead.
- `utils/registerSW.js` debug helpers (`skipWaiting`,
  `unregisterServiceWorker`, …) are unused but are documented dev utilities.
- Five ui-kit components are exported but unused outside the kit
  (`FeatureHighlight`, `FormField`, `Skeleton`, `Spinner`, `SuccessState`) —
  design-system kit members, documented; not deleted.
- Day-6 history anomaly and stale `frontend/PWA_SETUP.md` checkboxes remain
  as previously documented (history untouched by design).

## 5. Backend blockers (not frontend problems)

- **Local runtime integration testing BLOCKED**: `backend/db/commute.db` has
  a schema mismatch — `SqliteError: no such column: goal_id` at
  `backend/db/database.js:96` prevents the server from starting. The stale
  DB file was left untouched (not Xcaliber's domain). Full E2E with real API
  data therefore remains "not verified at runtime"; error paths were
  verified instead (the app showed honest error states for 500s).
- Auth-gated backend areas (`GET /api/alerts` needs JWT) remain blocked as
  previously documented; the frontend has no fake auth anywhere (verified:
  only the anonymous `x-user-token` pseudonym exists).
- Push notifications / Background Sync: no backend push system exists;
  `sw.js` verified to have no push handler — still correctly absent.

## 6. Exact checks and results (final state)

- `cd frontend && npm run verify` → **314/314 passed, 0 failed, 0 warnings**
  (23 sections; section 23 = new audit regression locks).
- `cd frontend && npm run build` → **green** (pre-existing >500 kB chunk
  warning only).
- Lint / type-check: **N/A** (no eslint config, no tsconfig — confirmed on
  disk).
- Production build + preview + headless-Chrome runtime checks: **pass** (see
  section 3).

## 7. Remaining issues / recommended next work

1. Backend: fix the `goal_id` schema mismatch in the local DB bootstrap so
   local E2E verification becomes possible (Skan's domain).
2. Real-device/Lighthouse PWA audit (install prompt, notifications on
   Android) — still open per `PWA_SUMMARY.md`.
3. Background Sync for the Day-11 queue — deferred (duplicate-report risk:
   the SW cannot read the localStorage queue).
4. Optional P3/P4 cleanups listed in section 5E.

## 8. Verdict

**READY WITH KNOWN ISSUES** — all Day 1–13 features are implemented,
reachable and statically tested; one real integration bug (share-target
delivery) existed and was fixed and runtime-verified during this audit;
full E2E with live backend data is blocked by a backend-local DB issue, and
real-device PWA checks remain open.
