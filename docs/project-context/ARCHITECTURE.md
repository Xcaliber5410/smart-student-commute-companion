# Frontend Architecture — Smart Student Companion (`frontend/`)

> For a new AI adding features **without breaking conventions**. Each area states
> **where it lives** and **how new code should interact with it**. This documents THIS
> project, not generic React.

---

## Framework & toolchain

- React 18.3 (JSX, no TypeScript), Vite 6, Tailwind CSS 3.4 (+ autoprefixer), lucide-react
  icons, `clsx` + `tailwind-merge`, socket.io-client, leaflet + react-leaflet.
- Package manager: npm (`frontend/package.json` scripts: `dev`, `build`, `preview`,
  `verify`/`test`, `icons`).
- **No** router, **no** state library, **no** lint/type-check tooling.

## Application entry point

- **Where**: `frontend/src/main.jsx` → renders `App.jsx`; registers the service worker
  via `utils/registerSW.js`; `frontend/index.html` holds PWA meta/manifest link.
- **How to interact**: global wiring (socket, install hook, banners, toasts, modals) is
  composed in `App.jsx`. A new cross-cutting concern belongs there, passed into
  `MainLayout`'s children slot or rendered alongside `<Toast>` — not inside a page.

## Routing

- **Where**: `App.jsx` holds `activeTab` state; `renderTabContent()` switches on tab id;
  tab ids are defined once in `NAV_ITEMS` (`components/Navbar.jsx`), which also drives
  desktop nav, mobile drawer, and bottom bar. `?tab=` deep-link parsing (validated
  against `NAV_ITEMS`) is in `App.jsx`.
- **How to add a screen**: (1) create `src/pages/YourPage.jsx` + export in
  `src/pages/index.js`; (2) append an entry to `NAV_ITEMS` (id, label, shortLabel, icon,
  description) — the three nav surfaces update automatically; (3) add a `case` in
  `renderTabContent()` wiring props from App state/services. Keep deep links working by
  using the same id. There is no URL path per screen — do not add react-router.

## Page structure

- **Where**: `src/pages/*` — 10 pages, presentation-only: they receive data/callbacks via
  props, render `<header><h1>…</h1></header>` + labelled `<section>`s, and use
  `ui/` loading/empty/error components. Existing pattern examples:
  `DeviceAlertsPage.jsx` (status + settings), `InstallShareHubPage.jsx` (multi-section).
- **How to add**: follow the same props-driven shape; keep business logic and fetches in
  App or hooks, not in pages; give each section `aria-label`; one `h1` per page; grids
  `grid-cols-1 sm:grid-cols-2` / `md:grid-cols-3`.

## Component structure

- **Where**: feature components in `src/components/` (one concern per file, PascalCase);
  reusable kit in `src/components/ui/` with a barrel `index.js` and a conventions README
  (`ui/README.md` — read it before adding a ui component).
- **Rules observed by every existing feature**:
  - Reuse from `ui/` first; create a new ui component only when genuinely reusable.
  - Export new ui components from `ui/index.js` (barrel) — feature files import from
    `'../components/ui'`.
  - Dialogs: use `ui/Modal` (role=dialog, focus trap, ESC, scroll lock, focus return)
    or `ui/ConfirmDialog`; never hand-roll overlays.
  - Icons: lucide-react, decorative ones wrapped `aria-hidden="true"`.
  - Interactive elements are native `<button>`s with visible `focus:ring-emerald-500`
    focus styles and accessible names (aria-label when icon-only).

## Styling / design system

- **Where**: Tailwind utility classes inline; tokens in `frontend/tailwind.config.js`
  (emerald primary, slate dark surfaces); global styles/keyframes in
  `src/index.css`; the documented system is `frontend/docs/DESIGN_SYSTEM.md` (902 lines)
  and `ui/README.md`.
- **How to interact**: match existing recipes — cards `rounded-2xl border
  border-slate-800 bg-slate-900/60 p-4`; primary buttons `bg-emerald-500 text-slate-950`;
  section headings `text-sm font-bold uppercase tracking-wide text-slate-400`; focus
  `focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
  focus:ring-offset-slate-950`. Touch targets ≥ 36 px (`min-h-9`) — enforced in Day 8/9
  audits. Mobile: respect the fixed bottom nav (content must not sit under it).

## State management

- **Where**: local `useState`/`useEffect` inside components; `hooks/useAsyncResource.js`
  for `{ data, isLoading, loadError, load() }` request state; App-level `useState` for
  tab, live reports, socket status, toast queue, modal flags, PWA install state,
  preferences; everything passed by props.
- **Persistence**: via `src/utils/uiPreferences.js` helpers (validated reads,
  failure-safe writes), `src/utils/authSession.js` for the Day-14 session envelope, and
  `services/installPromotion.js` for its snooze key. Keys are prefixed `smart_commute_`.
- **How to interact**: keep new feature state local; lift to App only when a sibling
  (navbar badge, another page, socket) needs it. Do not introduce Redux/Context/global
  stores.

## API / service architecture

- **Where**: `src/services/api.js` is the single fetch layer (timeout, error
  normalization, `FrontendApiError`, anonymous vote token, Day-14 Bearer session header
  + 401 expiry). Domain services (`planner.js`, `liveReports.js`, `rideGroups.js`,
  `transit.js`, `auth.js`) compose it and are the
  only modules pages/hooks should import for data. Browser-API services
  (`deviceAlerts.js`, `shareTarget.js`, `installPromotion.js`) do no network I/O.
- **How to add an endpoint**: add an exported function in `api.js` (or a domain service
  that calls it) using `request(path, options)`; path is relative to `API_BASE_URL`.
  **Never** call `fetch` in a component; **never** invent endpoints — confirm the
  backend route exists and is either unauthenticated or reachable with the Day-14
  session (see `CURRENT_STATE.md`), otherwise treat the feature as BLOCKED.
- **Live data**: socket listeners are registered in `App.jsx` (`services/socket.js`
  connection); new events follow the same pattern (listen → update App state → props).

## Forms

- **Where**: form components (`PlannerForm`, `CreateReportModal`, `TransitSearchForm`,
  `CreateGroupModal`, `FeedbackModal`) are controlled components using
  `ui/Input`/`Select`/`Textarea` directly and `utils/validation.js` helpers; submit
  handlers come from App props and call domain services. (The kit's `ui/FormField`
  wrapper had zero consumers and was removed in the audit follow-up.)
- **How to add**: reuse `ui/Input`/`Select`/`Textarea` — they render the label
  (`htmlFor`/`id`), announce errors with `role=alert` and wire `aria-describedby` —
  validate client-side with `utils/validation.js`, keep submit logic in App, show
  pending state on the button and toasts on success/failure.

## Notifications

- **Where**: `src/components/Toast.jsx` renders the App's `toasts` array
  (`showToast(message, type)` in App); success/info → `role=status`, errors →
  `role=alert`; positioned above the mobile bottom nav, `z-[3000]`.
  `NotificationsPage` is a client-side view over loaded live reports.
  `services/deviceAlerts.js` + `DeviceAlertsPage` handle OS-level alerts (pref in
  `uiPreferences`, socket `live_report_created` → notify when backgrounded).
- **How to interact**: never console-only feedback — route user feedback through
  `showToast`; respect the `deviceAlerts` preference pattern for anything OS-level.

## PWA

- **Where**: `public/manifest.json`, `public/sw.js`, `utils/registerSW.js`,
  `hooks/usePwaInstall.js`, `components/PwaStatusBanner.jsx`,
  `components/InstallPromoBanner.jsx` + `services/installPromotion.js`,
  `services/shareTarget.js`, Day-8 `pages/InstallShareHubPage.jsx`.
- **How to interact**: static assets a new feature needs at install time go in
  `STATIC_ASSETS` (sw.js) + `manifest.json`; SW changes are additive and must not cache
  API responses; never register a second SW; install UX goes through `usePwaInstall`'s
  `promptInstall()` (App's `handleInstallApp`) — components must not touch
  `beforeinstallprompt` directly. Share-target payload consumption goes through
  `services/shareTarget.js` (already wired to prefill `CreateReportModal`).

## Testing / verification

- **Where**: `frontend/verify-frontend.js` — sequential `section(...)` blocks of
  `pass()`/`fail()` source assertions; the run must exit 0 (`100%`) before any commit.
- **How to add**: a new feature day adds its own numbered section at the end (sections
  12–18 exist for Days 3–9; pattern: file exists → wired → semantics → service
  integration). Do not weaken existing checks. Lint/typecheck: N/A (absent).
- **Build**: `npm run build` must pass (chunk-size warning is known/pre-existing).

## Build process

- **Where**: `vite.config.js` (Vite 6), `tailwind.config.js`, `postcss.config.js`;
  env vars read through `src/config/index.js` (`VITE_API_BASE_URL` default `/api`,
  `VITE_SOCKET_URL`, `VITE_ENABLE_DEMO_RESET`, `VITE_LOG_LEVEL`, `VITE_SW_DEV`);
  `.env.example` documents them.
- **How to interact**: any new env var must be read via `config/index.js` getters with a
  safe default and documented in `.env.example`.
