# AI Handoff — Start Here If You Know Nothing

> Audience: a NEW AI agent continuing development tomorrow. Read in this order:
> 1. `docs/project-context/README.md` (mental model, ~10 min)
> 2. `docs/project-context/CURRENT_STATE.md` (what exists now, blockers)
> 3. `docs/project-context/FEATURES.md` (status inventory)
> 4. **Only** the latest relevant `docs/project-context/days/DAY-0X.md` when continuing
>    daily work (e.g., DAY-13.md to continue from Day 13). Older day logs = archaeology,
>    not instructions. For what was already verified/fixed across all days, also read
>    `days/DAY-01-13-AUDIT.md` once.

---

## 1. What the project is (one paragraph)

Mumbai student commute PWA: React 18 + Vite + Tailwind frontend (`frontend/`, the
**Xcaliber** role — client-side only) + Express/SQLite backend (`backend/`, the
**Skan** role). Daily frontend work happens on `frontfeat` in 7 fixed-message commits
per "Day", merged to `main` at day end. Currently at **Day 13 + full audit**
(see `days/DAY-01-13-AUDIT.md`).

## 2. Which branch to work on

`frontfeat`. Before ANY work: sync `main` → `frontfeat` first (see `GIT_WORKFLOW.md`).
After the day's 7 commits: merge `frontfeat` → `main` and push both. Never create a
branch; never force-push; never delete `frontfeat`.

## 3. Architecture & conventions to follow (details in ARCHITECTURE.md)

- **No router, no global store, no TypeScript, no new frameworks** without direction.
- Screens = tab pages: `src/pages/XPage.jsx` (props-driven, presentation only) +
  `NAV_ITEMS` entry in `components/Navbar.jsx` + `case` in `App.jsx`.
- Reuse `src/components/ui/` first; export new kit components from the barrel
  `index.js`; dialogs go through `ui/Modal`/`ConfirmDialog`.
- **All HTTP** through `src/services/api.js` (+ domain services). Components never call
  `fetch`. Browser-API features go in their own feature-detecting service file.
- Persistence = `utils/uiPreferences.js` (localStorage, `smart_commute_*` keys).
- Feedback = `showToast(...)` from App; states = `LoadingState`/`EmptyState`/
  `ErrorState`; accessible names + `focus:ring-emerald-500` on every control;
  touch targets ≥ 36 px; respect the fixed mobile bottom nav.
- Styling = Tailwind recipes already in the code; see `frontend/docs/DESIGN_SYSTEM.md`
  and `ui/README.md`.

## 4. Things NOT to recreate (already done)

- Install/share UX: Day 8 hub + Day 9 promo banner/dialog — don't build a third
  install surface.
- PWA analytics: Day 10 dashboard (`?tab=analytics`) + `services/pwaAnalytics.js` + the
  SW `pwa-analytics-v1` metrics store — extend `recordAnalytics`, don't build a second
  monitoring surface.
- Device alerts, notifications view, PWA banners, preferences dialog, toasts, saved
  commutes, all 10 tabs, demo reset, share target, `?tab=` deep links.
- Offline report queue: Day 11 screen (`?tab=offlinequeue`) + `services/offlineQueue.js`
  + App wiring — a network-failed report submission is enqueued and auto-delivered on
  reconnect; extend `syncQueue`, don't build a second queueing path.
- Notification read state: Day 12 App-level `notificationReadIds` +
  `ui/UnreadCountBadge` + `utils/uiPreferences.js` helpers — read marks persist on
  device and drive the nav badges; don't add a second read-state store or re-derive
  unread counts in components.
- Quiet hours / notification preferences: Day 13 `PreferencesDialog` notifications
  section + `ui/TimeRangeInput` + `isQuietHoursActive()` in `utils/uiPreferences.js` —
  both pop-up paths (live-report toasts, OS device alerts) consult it per event;
  don't build a second preferences surface or duplicate the window math.
- Share-target delivery: the SW→page channel is `navigator.serviceWorker` and the
  request type is `SHARE_TARGET_FETCH` (fixed in the Day 1–13 audit after a runtime
  reproduction) — don't re-listen on `window` only or invent a new message type.
- The `verify-frontend.js` suite — **extend**, never weaken; add a numbered section.
- Any backend route/DB code (Skan's domain — off limits).

## 5. Known API / auth blockers (do not work around by faking)

- Backend `/auth`, `/student`, `/notifications`, `/academic`, `/calendar` require JWT;
  the frontend has **no auth**. Those features are BLOCKED (FEATURES.md §Backend
  Dependent). Do not invent endpoints, tokens, or fake login flows.
- Available unauthenticated endpoints are listed in `CURRENT_STATE.md` — verify a route
  exists before wiring it.

## 6. How frontend work is integrated

Data arrives via (a) `api.js` fetches on mount/user action with
loading/success/empty/error/retry states, and (b) Socket.IO listeners registered in
`App.jsx` updating App state passed down as props. Backend responses shape: whatever
the route returns — the frontend renders defensively (no assumed fields beyond what
existing rendering code uses).

## 7. Git workflow (summary — full detail in GIT_WORKFLOW.md)

```
git fetch origin; git switch main; git pull origin main
git switch frontfeat; git pull origin frontfeat; git merge main   # conflicts → resolve carefully
git push origin frontfeat                                          # sync BEFORE work
# ...7 commits, each pushed immediately:
git add <files> && git commit -m "<fixed message>" && git push origin frontfeat
# end of day:
git switch main; git pull origin main
git switch frontfeat; git pull origin frontfeat; git merge main; git push origin frontfeat
git switch main; git merge frontfeat; git push origin main
```

Commit messages are **exact and fixed** per day (see day logs). One day = exactly
7 commits; no combining; no extra commits (documentation commits like this one are the
documented exception).

## 8. Verification workflow (before every commit)

```bash
cd frontend && npm run verify    # must be 100%, currently 314 checks
cd frontend && npm run build     # must succeed (chunk >500kB warning is pre-existing)
```

There is no lint or type-check (absent by design so far) — report them as N/A.
Manual/browser verification during Days 7–11 used session-local Chrome-CDP scripts that
were **not committed**; recreate ad hoc if needed ("Not verified from repository
history" as repo assets). SW→page messages must be read from the
`navigator.serviceWorker` container, not `window` (see DAY-10.md Blockers).

## 9. Important warnings

- **Accuracy over invention**: if something can't be verified in the repo, say
  "Not verified from repository history" rather than guessing.
- Don't claim a feature exists because a prompt asked for it — check source.
- Don't "fix" the Day-6 empty commits (history rewriting = force-push = forbidden).
- Keep `main` green: never push `frontfeat`→`main` with failing verify/build.
- The `backend/` tree is Skan's; frontend PRs must not touch it.
- `.freebuff/` (if present locally) is excluded via `.git/info/exclude` — session
  tooling, never commit it.
