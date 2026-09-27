# Day 2 — Frontend Foundation & Architecture (Xcaliber)

Day 2 delivered the reusable application layer on top of the Day 1 foundation:
application shell, responsive navigation, reusable page states, a client-side
form foundation, an accessibility/responsive polish pass, and a centralized
API/service integration layer.

---

## 🧱 Frontend Architecture (current)

```
frontend/src/
├── components/
│   ├── ui/                 # Reusable primitives (Day 1) + page states (Day 2)
│   │   ├── Button.jsx        # variants: primary/secondary/ghost/danger, loading state
│   │   ├── Input.jsx         # with accessible error wiring (aria-describedby/aria-invalid)
│   │   ├── Textarea.jsx / Select.jsx
│   │   ├── Card.jsx / Alert.jsx / Spinner.jsx
│   │   ├── LoadingState.jsx  # page-level loading with configurable label
│   │   ├── ErrorState.jsx    # page-level error with optional onRetry
│   │   ├── EmptyState.jsx    # generic empty state (icon/title/description/action)
│   │   ├── SuccessState.jsx  # confirmation state with optional action
│   │   ├── Skeleton.jsx      # skeleton loading primitives
│   │   └── FormField.jsx     # label + hint + error wrapper for any input
│   └── ...
├── layouts/
│   ├── AppShell.jsx        # Main application shell (header / main / mobile nav / footer)
│   ├── MainLayout.jsx      # AppShell + <Outlet /> for routed pages
│   ├── PageContainer.jsx   # Consistent content width/padding wrapper
│   ├── Navbar.jsx          # Top navigation with active-route indication
│   └── Toast.jsx           # Lightweight toast notifications
├── services/
│   ├── api.js              # Centralized API client (fetch-based)
│   └── socket.js           # Socket.io client abstraction
└── utils/
    └── validation.js       # Reusable client-side validators
```

---

## 🧭 Navigation Conventions

- All routed pages render inside `MainLayout` → `AppShell`.
- Navigation items are defined centrally from the existing route table; only
  valid, application-approved routes appear in navigation.
- Active route is indicated via `NavLink`-style matching (`aria-current="page"`).
- Mobile navigation is a collapsible drawer below the desktop breakpoint:
  - Opens/closes reliably; closes on route change and on `Escape`.
  - Focus is moved into the drawer when opened and restored when closed.
  - Trigger buttons expose `aria-expanded` / `aria-controls`.
- All navigation is keyboard operable; visible focus indicators are preserved.

---

## 🔄 UI-State Conventions

Use the shared state components instead of ad-hoc markup:

| Situation            | Component       |
|----------------------|-----------------|
| Page/data loading    | `LoadingState` or `Skeleton` for shape-preview |
| Nothing to show yet  | `EmptyState`    |
| Request failure      | `ErrorState` (pass `onRetry` for retry) |
| Action confirmed     | `SuccessState`  |

- Components are generic: pass `title`, `description`, `action`, etc. as props.
- Error messages are user-facing; stack traces and technical details are never
  rendered or logged.

---

## 📝 Form Conventions

- Wrap inputs in `FormField` (handles label association, hint, and error text).
- Inputs wire errors accessibly: `aria-invalid` + `aria-describedby`.
- Reuse validators from `utils/validation.js` (required, text, numeric, email,
  min/max) instead of duplicating logic.
- Values are preserved on failed validation; never clear user input.
- Submit buttons support `loading` state and are disabled while submitting to
  prevent duplicate submissions.
- **Note:** client-side validation is UX only — never a security boundary.

---

## 🌐 API/Service Usage Conventions

- All backend communication goes through `services/api.js`.
- Base URL comes from `VITE_API_BASE_URL` (env config) — never hardcoded.
- Request helper handles: success responses, HTTP errors, network failures,
  timeouts/aborts, and JSON parsing.
- API failures are converted to frontend-friendly error objects; map them to
  `ErrorState` in the UI.
- Never log tokens, credentials, or sensitive data.

```js
import { api } from '../services/api';

// GET
const data = await api.get('/students/feeding-queue');

// POST
const result = await api.post('/routes/optimize', payload);
```

---

## 🧪 Testing Commands

```bash
cd frontend
npm test        # Full frontend verification (verify-frontend.js)
npm run build   # Production build check
npm run dev     # Start dev server
npm run preview # Preview production build
```

**Day 2 final verification results (executed on this branch):**
- `npm test` → 94/94 checks passed (0 failures, 0 warnings)
- `npm run build` → success (vite 6, 1693 modules)

---

## ⚠️ Known Limitations

- No dedicated lint or TypeScript config in the frontend yet; checks rely on
  the verification script and the production build.
- No frontend unit-test framework installed; verification is structural +
  build-based. Adding Vitest is recommended for Day 3+.
- API layer has no retry/backoff or auth-token injection yet — intentionally
  deferred until backend auth conventions are finalized.
- `note`: backend `main` received changes from another contributor during
  Day 2 (backend folder); Xcaliber did not touch backend files. Sync handled
  via merge of `main` into this branch per the Day 2 workflow.

---

**Last Updated**: Day 2 Complete
**Version**: 2.0.0
**Maintainer**: Xcaliber (Frontend)
