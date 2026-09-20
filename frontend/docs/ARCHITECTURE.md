# Frontend Architecture Documentation

## Overview

The Smart Student Commute Companion frontend is a **React 18** single-page application (SPA) built with **Vite** as the build tool and development server. It provides an AI-powered transit planning interface with real-time community reporting and multimodal route optimization for Mumbai college students.

**Last Updated**: Day 1 - Foundation Audit (September 21, 2026)

---

## Technology Stack

### Core Framework & Build Tools
- **React**: 18.3.1 (with React Strict Mode enabled)
- **Vite**: 6.1.0 (build tool and dev server)
- **Package Manager**: npm (package-lock.json present)
- **Language**: JavaScript (JSX) with ES Modules

### UI & Styling
- **Tailwind CSS**: 3.4.17 (utility-first CSS framework)
- **PostCSS**: 8.5.1 with Autoprefixer 10.4.20
- **Icon System**: lucide-react 0.475.0 (comprehensive React icon library)
- **CSS Utilities**: clsx 2.1.1, tailwind-merge 3.0.1 (for dynamic className handling)
- **Fonts**: Inter & Outfit (from Google Fonts CDN)
- **Color Scheme**: Dark mode only (slate-950 base)

### State Management
- **Pattern**: Local React state (useState, useEffect)
- **No Global State Library**: All state is component-level or lifted to App.jsx
- **Data Flow**: Props drilling from App.jsx → child components

### Mapping & Geospatial
- **Leaflet**: 1.9.4 (mapping library)
- **react-leaflet**: 4.2.1 (React bindings for Leaflet)
- **Tile Provider**: OpenStreetMap (no Mapbox dependency)
- **Map Style**: Custom dark mode aesthetic via CSS overrides

### Real-time Communication
- **Socket.IO Client**: 4.8.1
- **Connection**: WebSocket with fallback to polling
- **Events**: Live report creation, updates, expiration, demo resets

### TypeScript Support
- **@types/leaflet**: 1.9.16
- **@types/react**: 18.3.18
- **@types/react-dom**: 18.3.5
- **Note**: TypeScript types are installed but project uses pure JavaScript

---

## Project Structure

```
frontend/
├── index.html                 # Entry HTML with dark mode setup, meta tags, fonts
├── package.json               # Dependencies and scripts
├── vite.config.js             # Vite build & dev server config with proxy
├── tailwind.config.js         # Tailwind custom theme (brand & navy colors)
├── postcss.config.js          # PostCSS plugins (Tailwind + Autoprefixer)
├── docs/
│   └── ARCHITECTURE.md        # This file
└── src/
    ├── main.jsx               # React app entry point (ReactDOM.createRoot)
    ├── App.jsx                # Root application component with all state
    ├── index.css              # Global styles (Tailwind imports + custom CSS)
    ├── components/            # All UI components (9 components)
    │   ├── Navbar.jsx
    │   ├── PlannerForm.jsx
    │   ├── RouteResults.jsx
    │   ├── MapView.jsx
    │   ├── LiveStudentFeed.jsx
    │   ├── TravelTogether.jsx
    │   ├── CreateReportModal.jsx
    │   ├── CreateGroupModal.jsx
    │   └── FeedbackModal.jsx
    └── services/              # API & WebSocket abstraction layer
        ├── api.js             # REST API functions
        └── socket.js          # Socket.IO client singleton
```

---

## Application Architecture

### Entry Point Flow
1. **index.html** → loads `/src/main.jsx` as ES module
2. **main.jsx** → renders `<App />` in React.StrictMode to `#root`
3. **App.jsx** → orchestrates all state, layout, and component composition

### Component Hierarchy

```
<App> (Root State Container)
├── <Navbar> (Sticky header with tabs, connection status, demo reset)
├── <main> (Grid layout: 7 cols left + 5 cols right)
│   ├── LEFT COLUMN (activeTab-based routing)
│   │   ├── IF activeTab === 'planner':
│   │   │   ├── <PlannerForm>
│   │   │   ├── <RouteResults>
│   │   │   └── <LiveStudentFeed> (quick embedded view)
│   │   ├── IF activeTab === 'together':
│   │   │   └── <TravelTogether>
│   │   └── IF activeTab === 'feed':
│   │       └── <LiveStudentFeed>
│   └── RIGHT COLUMN (sticky map)
│       └── <MapView>
├── <footer> (Credits and tech stack notice)
└── MODALS (conditionally rendered at root level)
    ├── <CreateReportModal>
    ├── <CreateGroupModal>
    └── <FeedbackModal>
```

---

## Routing Approach

**No Client-Side Router**

The application uses **tab-based conditional rendering** instead of React Router:

- **State Variable**: `activeTab` (one of: `'planner'`, `'together'`, `'feed'`)
- **Navigation**: Click handlers in `<Navbar>` set active tab
- **Rendering**: Conditional JSX in App.jsx based on `activeTab` value
- **No URL Changes**: All interactions happen on the same URL (SPA without routes)

**Rationale**: Single-page hackathon MVP with three distinct views that don't need deep linking or browser history.

---

## Styling System

### Tailwind CSS Configuration

**Custom Theme Extensions** (`tailwind.config.js`):
```javascript
colors: {
  brand: { 50, 100, 500, 600, 700 } // Green spectrum
  navy: { 800, 900, 950 }           // Dark backgrounds
}
```

**Content Scanning**:
- `./index.html`
- `./src/**/*.{js,ts,jsx,tsx}`

### Global CSS (`src/index.css`)

1. **Tailwind Directives**: `@tailwind base/components/utilities`
2. **Dark Mode Color Scheme**: `:root { color-scheme: dark }`
3. **Base Body Styles**: bg-slate-950, Inter font family
4. **Custom Scrollbars**: Dark theme webkit scrollbar styles
5. **Leaflet Dark Mode Overrides**: Map container, popup styling
6. **Custom Animation**: `@keyframes pulse-slow` for badge effects

### Styling Conventions

- **Utility-First Approach**: Inline Tailwind classes (no separate CSS modules)
- **Consistent Dark Palette**: slate-950/900/800/700 backgrounds, emerald/amber/rose accents
- **Responsive Design**: `sm:` and `lg:` breakpoints for mobile/tablet/desktop
- **Component-Level Styling**: All styles defined in JSX className attributes
- **Dynamic Classes**: Use `clsx()` or template literals for conditional styling
- **Consistent Spacing**: Gap utilities (gap-2, gap-4, gap-6) for layout

### Design System Patterns

**Color Usage**:
- **Primary Brand**: Emerald (success, active states, positive actions)
- **Warning/Alert**: Amber (disruption reports, live feed)
- **Danger/Error**: Rose (high-impact reports, contradictions)
- **Info**: Indigo/Sky (metadata, secondary actions)
- **Neutral**: Slate spectrum (backgrounds, borders, text)

**Component Patterns**:
- **Cards**: `rounded-2xl` or `rounded-xl`, `border border-slate-800`, `bg-slate-900`
- **Buttons**: `rounded-xl`, hover scale/color transitions, shadow on primary actions
- **Inputs**: `rounded-xl`, `bg-slate-950`, `border-slate-700`, emerald focus ring
- **Badges**: `rounded` or `rounded-full`, small text (`text-[10px]`), icon + label
- **Modals**: Fixed overlay with backdrop blur, centered card, explicit close button

---

## State Management

### Architecture Pattern

**Centralized State in App.jsx** with props drilling:

```javascript
// All state lives in App.jsx
const [activeTab, setActiveTab] = useState('planner');
const [formData, setFormData] = useState({...});
const [planResult, setPlanResult] = useState(null);
const [reports, setReports] = useState([]);
const [groups, setGroups] = useState([]);
const [isLoading, setIsLoading] = useState(false);
// ... etc
```

### State Categories

1. **Navigation State**: `activeTab` for view switching
2. **Connection State**: `isConnected` from Socket.IO status
3. **Form State**: `formData` for planner inputs (origin, destination, modes, etc.)
4. **Results State**: `planResult`, `selectedRouteId`
5. **Real-time Data**: `reports` (live disruptions), `groups` (ride share)
6. **Modal State**: `isReportModalOpen`, `isGroupModalOpen`, `isFeedbackModalOpen`
7. **Loading State**: `isLoading`, `isSubmittingReport`, `isSubmittingGroup`
8. **UI Feedback**: `toast` (success/error messages)

### Data Flow

1. **User Action** → handler in App.jsx
2. **Handler calls API** → `services/api.js` function
3. **API response** → updates state in App.jsx
4. **State change** → re-render → props passed to children
5. **Children render** → display updated data

### Real-time Updates

**Socket.IO Event Listeners** (in App.jsx `useEffect`):
- `connect` → set isConnected = true, emit join channel
- `disconnect` → set isConnected = false
- `live_report_created` → prepend to reports array, show toast
- `live_report_updated` → update matching report in array
- `live_report_expired` → filter out by ID
- `demo_reset` → reload fresh data

### Local Storage

**User Token Generation** (`api.js`):
```javascript
function getOrGenerateUserToken() {
  let token = localStorage.getItem('smart_commute_user_token');
  if (!token) {
    token = 'student-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('smart_commute_user_token', token);
  }
  return token;
}
```

Used for vote tracking (confirm/contradict reports).

---

## Service Layer

### API Abstraction (`src/services/api.js`)

**Base URL**: `/api` (proxied by Vite to `http://localhost:5000`)

**Functions Exported**:
- `checkHealth()` → GET /api/health
- `planCommute(planData)` → POST /api/plan
- `fetchLiveReports()` → GET /api/live-reports
- `postLiveReport(reportData)` → POST /api/live-reports
- `confirmReport(reportId)` → POST /api/live-reports/:id/confirm (with user token)
- `contradictReport(reportId)` → POST /api/live-reports/:id/contradict (with user token)
- `fetchRideGroups()` → GET /api/ride-groups
- `postRideGroup(groupData)` → POST /api/ride-groups
- `joinRideGroup(groupId)` → POST /api/ride-groups/:id/join
- `submitFeedback(feedbackData)` → POST /api/feedback
- `resetDemoState()` → POST /api/demo/reset

**Error Handling Pattern**:
```javascript
if (!res.ok) {
  const errorData = await res.json().catch(() => ({}));
  throw new Error(errorData.message || 'Fallback error message');
}
```

### Socket.IO Abstraction (`src/services/socket.js`)

**Singleton Pattern**:
```javascript
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });
  }
  return socket;
}
```

**URL**: `/` (proxied by Vite to Socket.IO server at `http://localhost:5000`)

---

## Component Design Patterns

### 1. Controlled Form Inputs

All form components use controlled inputs with state lifted to App.jsx:

```javascript
<input
  value={formData.origin}
  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
/>
```

### 2. Modal Pattern

**Common Structure**:
- Conditional rendering based on `isOpen` prop
- Fixed overlay with backdrop blur
- Centered card with header, form body, and action buttons
- Explicit close button (X icon)
- `onClose` and `onSubmit` callback props
- `isSubmitting` prop for loading state

**Example**: `CreateReportModal`, `CreateGroupModal`, `FeedbackModal`

### 3. Loading States

**Button Patterns**:
```javascript
<button disabled={isLoading}>
  {isLoading ? 'Planning...' : 'Plan Route'}
</button>
```

**Icon Animations**:
```javascript
<RotateCcw className={isResetting ? 'animate-spin' : ''} />
```

### 4. Toast Notifications

**Implementation in App.jsx**:
```javascript
const [toast, setToast] = useState(null); // { message, type }

const showToast = (message, type = 'success') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3500);
};
```

**Rendering**: Fixed bottom-right, auto-dismiss after 3.5s, color-coded by type.

### 5. Icon + Label Pattern

**Lucide React Icons** consistently paired with text labels:

```javascript
<button className="flex items-center gap-1.5">
  <Compass className="w-4 h-4" />
  <span>Plan Route</span>
</button>
```

### 6. Conditional Rendering with Early Return

**Modal Pattern**:
```javascript
export default function Modal({ isOpen, ... }) {
  if (!isOpen) return null;
  // ... rest of JSX
}
```

### 7. Array Rendering with Keys

**List Pattern**:
```javascript
{reports.map((rep) => (
  <div key={rep.id}>
    {/* ... report card JSX */}
  </div>
))}
```

### 8. Inline SVG Icons

**Example in index.html**:
```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,..." />
```

---

## Component Inventory

### Navigation
- **Navbar.jsx**: Sticky header with logo, tab navigation, connection status, demo reset button

### Planning & Results
- **PlannerForm.jsx**: Multi-field form for origin, destination, time, modes, preferences
- **RouteResults.jsx**: Display planned routes with multimodal steps, fare, duration

### Mapping
- **MapView.jsx**: Leaflet map with route polylines, markers, disruption overlays

### Community Features
- **LiveStudentFeed.jsx**: Real-time disruption report feed with voting (confirm/contradict)
- **TravelTogether.jsx**: Ride-share/commute coordination group listings

### Modals
- **CreateReportModal.jsx**: Form to submit new live disruption report
- **CreateGroupModal.jsx**: Form to create new commute coordination group
- **FeedbackModal.jsx**: Form to submit feedback on route recommendations

---

## Development & Build Configuration

### Vite Configuration (`vite.config.js`)

**Dev Server**:
- **Port**: 5173
- **Proxy Rules**:
  - `/api/*` → `http://localhost:5000` (backend REST API)
  - `/socket.io/*` → `http://localhost:5000` (WebSocket connection)

**Plugins**:
- `@vitejs/plugin-react` (JSX transformation, Fast Refresh)

**Build Output**:
- Default Vite output: `dist/` directory (not committed to git)

### NPM Scripts

```json
{
  "dev": "vite",             // Start dev server on port 5173
  "build": "vite build",     // Production build to dist/
  "preview": "vite preview"  // Preview production build locally
}
```

### Dependencies vs. DevDependencies

**Runtime Dependencies** (shipped in production bundle):
- React, React-DOM, Leaflet, react-leaflet
- Socket.IO client
- lucide-react (icons)
- clsx, tailwind-merge (utilities)

**Dev Dependencies** (build-time only):
- Vite, @vitejs/plugin-react
- Tailwind CSS, PostCSS, Autoprefixer
- TypeScript type definitions (@types/*)

---

## PWA Configuration

**Status**: ❌ **NOT IMPLEMENTED**

**Current State**:
- No web app manifest file
- No service worker registration
- No offline support
- No installability (Add to Home Screen)

**Recommendation for Future Implementation**:
- Add `vite-plugin-pwa` to devDependencies
- Create `manifest.json` with app metadata, icons, theme colors
- Generate service worker for offline route caching
- Add app icons in multiple sizes (192x192, 512x512, etc.)
- Add iOS splash screens and meta tags

---

## Assets & Icon System

### Current Icon System

**Lucide React** (0.475.0):
- Comprehensive React icon component library
- Tree-shakeable (only imported icons are bundled)
- Consistent styling with `className`, `size`, `color` props
- Examples: `<Compass />`, `<AlertTriangle />`, `<Users />`, `<MapPin />`

### External Assets

**Fonts**: Loaded from Google Fonts CDN in index.html:
- Inter (300, 400, 500, 600, 700, 800)
- Outfit (400, 500, 600, 700, 800)

**Map Tiles**: OpenStreetMap CDN (via Leaflet default tile layer)

**Inline SVG Favicon**: Data URI in index.html (no separate icon file)

### No Static Asset Directory

**Current**: No `public/` or `assets/` folder present.

**Recommendation**: Create `frontend/public/` for:
- App icons (for future PWA manifest)
- Social media preview images (og:image)
- Static JSON data files (if needed)

---

## Testing

**Status**: ❌ **NO TESTS IMPLEMENTED**

**Current State**:
- No test framework installed (no Jest, Vitest, Testing Library)
- No test files (`.test.js`, `.spec.js`) in frontend/src
- No test script in package.json
- No CI/CD test runs

**Recommendation for Future Implementation**:
- Add **Vitest** (Vite-native test runner)
- Add **@testing-library/react** for component testing
- Add **@testing-library/jest-dom** for DOM matchers
- Create test files for critical components (PlannerForm, RouteResults, MapView)
- Add `test` script to package.json: `"test": "vitest run"`
- Focus on integration tests for API service layer

---

## Code Conventions & Standards

### File Naming
- **Components**: PascalCase with `.jsx` extension (e.g., `PlannerForm.jsx`)
- **Services**: camelCase with `.js` extension (e.g., `api.js`, `socket.js`)
- **Config Files**: lowercase with `.js` extension (e.g., `vite.config.js`)

### Component Structure
1. Imports (React, icons, child components, services)
2. Helper functions (if needed, defined outside component)
3. Component function definition with named export
4. State declarations (useState, useEffect)
5. Event handlers (handle* prefix)
6. Early returns for conditional rendering
7. Main JSX return statement

### State Management Conventions
- Use `useState` for local component state
- Lift state to App.jsx when shared across components
- Use `useEffect` for side effects (data fetching, Socket.IO setup)
- Clean up side effects in `useEffect` return function

### Styling Conventions
- **Inline Tailwind classes** only (no separate CSS files per component)
- **Responsive utilities**: Use `sm:`, `md:`, `lg:` prefixes
- **Dark mode default**: All colors assume dark background
- **Dynamic classes**: Use `clsx()` or template literals for conditional styles
- **Consistent spacing**: Use gap utilities (gap-1, gap-2, etc.) instead of margins

### API Call Conventions
- All API calls in `services/api.js` (no fetch in components)
- Always handle errors with try/catch in components
- Show toast notifications for success/error feedback
- Set loading state before async calls, clear in finally block

### Component Prop Patterns
- **Callback props**: Use `onAction` naming (e.g., `onPlan`, `onSubmit`, `onClose`)
- **Boolean props**: Use `is` or `has` prefix (e.g., `isLoading`, `isOpen`)
- **Data props**: Descriptive nouns (e.g., `formData`, `planResult`, `reports`)

### Accessibility Considerations
- **ARIA**: Minimal ARIA attributes present (opportunity for improvement)
- **Semantic HTML**: Good use of `<header>`, `<main>`, `<footer>`, `<nav>` elements
- **Button vs. Link**: Consistent use of `<button>` for actions
- **Focus States**: Tailwind `focus:ring-*` utilities applied to inputs
- **Alt Text**: Not applicable (no `<img>` tags, only inline SVG icons)

---

## Technical Debt & Known Issues

### High Priority
1. **No Frontend Tests**: Zero test coverage, no testing infrastructure
2. **No PWA Support**: Missing manifest, service worker, offline capability
3. **Missing node_modules**: Dependencies not installed (need `npm install`)
4. **Props Drilling**: All state in App.jsx → potential performance issues
5. **No Error Boundaries**: Unhandled React errors will crash entire app

### Medium Priority
6. **No TypeScript**: Types installed but not used (pure JS project)
7. **No Code Splitting**: Single bundle, all components loaded upfront
8. **No Lazy Loading**: All routes/components loaded on initial render
9. **No Form Validation Library**: Manual validation in components
10. **No Accessibility Audit**: WCAG compliance unknown

### Low Priority
11. **No Component Documentation**: Missing PropTypes or JSDoc comments
12. **No Storybook**: No component playground/documentation
13. **No ESLint/Prettier**: No automated code formatting or linting
14. **Hardcoded API Base URL**: `/api` in api.js (could be env variable)
15. **No Analytics**: No user behavior tracking (consider privacy implications)

### Opportunities for Improvement
- **State Management**: Consider Zustand or React Context for cleaner state
- **Routing**: Add React Router if deep linking becomes needed
- **Form Handling**: Add React Hook Form for better form state management
- **API Client**: Consider Axios or TanStack Query for better API state management
- **Bundle Size**: Analyze with `vite-bundle-visualizer` and optimize
- **Performance**: Add React.memo for expensive components
- **Accessibility**: Run Lighthouse audit, add ARIA labels, keyboard nav
- **Mobile UX**: Test on real devices, consider touch-friendly hit targets
- **Offline Support**: Implement service worker for offline route caching

---

## Deployment Considerations

### Build Process
```bash
cd frontend
npm install          # Install dependencies (not in git)
npm run build        # Creates dist/ directory with optimized bundle
```

### Production Build Output
- **Directory**: `frontend/dist/`
- **Entry**: `index.html` (references hashed JS/CSS bundles)
- **Assets**: Bundled JS, CSS, source maps (optional)

### Hosting Options
- **Static Hosting**: Netlify, Vercel, GitHub Pages, AWS S3 + CloudFront
- **Server Integration**: Serve `dist/` from Express backend (Node.js)
- **Reverse Proxy**: Nginx or Apache serving static files with API proxy

### Environment Configuration
**Current**: No environment variables used in frontend.

**Recommendation**: Add `.env` support for:
- `VITE_API_BASE_URL` (currently hardcoded to `/api`)
- `VITE_SOCKET_URL` (currently hardcoded to `/`)
- `VITE_MAPBOX_TOKEN` (if switching from OSM to Mapbox)

Vite automatically loads `.env` files and exposes `VITE_*` variables via `import.meta.env`.

---

## Integration with Backend

### REST API Communication

**Backend Base URL**: `http://localhost:5000/api` (proxied as `/api` in dev)

**API Contract** (inferred from `api.js`):
- All endpoints return JSON
- Error responses include `message` or `error` field
- Success responses include `success: true` field
- Some endpoints require `x-user-token` header (voting actions)

### WebSocket Communication

**Backend Socket.IO Server**: `http://localhost:5000` (proxied as `/` in dev)

**Events Emitted by Frontend**:
- `join_commute_channel` → payload: `{ area: 'mumbai_general' }`

**Events Received from Backend**:
- `connect` → no payload
- `disconnect` → no payload
- `live_report_created` → payload: full report object
- `live_report_updated` → payload: updated report object
- `live_report_expired` → payload: `{ id }`
- `demo_reset` → payload: `{ freshReports }`

### Development Proxy Setup

**Vite Dev Server Proxies** (vite.config.js):
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true
  },
  '/socket.io': {
    target: 'http://localhost:5000',
    ws: true
  }
}
```

**Production**: Proxy rules must be replicated in production Nginx/Apache config or backend must serve frontend static files.

---

## Future Architectural Recommendations

### Short-term (Days 2-7)
1. **Install Dependencies**: Run `npm install` to enable builds
2. **Add Tests**: Vitest + Testing Library for critical paths
3. **Error Boundaries**: Wrap App.jsx in error boundary for graceful failures
4. **Form Validation**: Add Zod or Yup for schema validation
5. **Loading Skeletons**: Add skeleton screens for better perceived performance

### Medium-term (Days 8-14)
6. **PWA Implementation**: Manifest + service worker for offline support
7. **Code Splitting**: Lazy load modals and map component
8. **Performance Optimization**: React.memo, useMemo, useCallback where needed
9. **Accessibility Audit**: Add ARIA labels, keyboard navigation, focus traps
10. **State Management**: Migrate to Zustand or Context API to reduce props drilling

### Long-term (Days 15-21)
11. **TypeScript Migration**: Gradually convert `.jsx` → `.tsx` for type safety
12. **Component Library**: Extract reusable components to shared library
13. **Internationalization**: Add i18n support for multiple languages
14. **Analytics**: Add privacy-respecting analytics (e.g., Plausible, Umami)
15. **Monitoring**: Add error tracking (Sentry) and performance monitoring

---

## Security Considerations

### Current Security Posture

**Strengths**:
- No sensitive data in localStorage (only pseudonymous user token)
- HTTPS enforced in production (via server config, not frontend)
- No inline JavaScript (CSP-friendly)
- No third-party tracking scripts

**Weaknesses**:
- User token generation is predictable (Math.random())
- No CSRF protection on POST endpoints
- No rate limiting on frontend (rely on backend)
- Socket.IO connection not authenticated

**Recommendations**:
- Use crypto.randomUUID() for user token generation (if available)
- Add CSRF token to all mutating requests
- Implement Content Security Policy headers
- Add rate limiting on frontend (debounce form submissions)

---

## Performance Baseline

### Current Bundle Size (Estimated)
- **React + React-DOM**: ~130 KB (minified + gzipped)
- **Leaflet + react-leaflet**: ~140 KB
- **Socket.IO client**: ~60 KB
- **Lucide React**: ~10 KB (tree-shaken, only used icons)
- **Tailwind CSS**: ~15 KB (purged unused classes)
- **Application Code**: ~50 KB (estimated)

**Total Estimated**: ~400-450 KB initial bundle (gzipped)

### Performance Optimization Opportunities
- Code split modals (lazy load)
- Defer map loading until MapView visible
- Use React.memo for expensive list renders (LiveStudentFeed)
- Virtualize long lists if reports/groups exceed 50 items
- Add loading="lazy" to future image assets

---

## Key Takeaways for Future Development

### ✅ What's Working Well
1. **Clean Component Structure**: Well-organized, single-responsibility components
2. **Consistent Styling**: Tailwind utility classes with clear dark mode theme
3. **Service Layer Abstraction**: Clean separation of API/Socket logic from UI
4. **Real-time Updates**: Robust Socket.IO integration with proper cleanup
5. **Responsive Design**: Mobile-first layout with Tailwind breakpoints
6. **User Feedback**: Toast notifications for all async actions

### ⚠️ What Needs Attention
1. **No Testing**: Add test infrastructure ASAP
2. **Props Drilling**: Consider state management library
3. **No PWA**: Implement for mobile-first use case
4. **Missing Dependencies**: Run `npm install` before any development
5. **Accessibility**: Conduct full WCAG audit and add ARIA attributes

### 🔒 Critical Conventions
- **Never bypass service layer**: Always call `services/api.js`, not fetch directly
- **Always handle async errors**: Use try/catch and show user feedback
- **Keep state in App.jsx**: Don't introduce local state that should be shared
- **Dark mode only**: All new styles assume slate-950 background
- **Icon + Label pattern**: Always pair Lucide icons with text labels

---

## Version History

- **v1.0.0** (September 21, 2026): Initial architecture documentation (Day 1 audit)

---

**Document Maintained By**: Xcaliber (Frontend Lead)  
**Next Review**: Day 7 (End of Week 1)
