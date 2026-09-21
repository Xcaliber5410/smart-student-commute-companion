# Frontend Developer Guide

Complete guide for working with the Smart Student Commute Companion frontend.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Available Commands](#available-commands)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Frontend Checks](#frontend-checks)
6. [Component Conventions](#component-conventions)
7. [PWA Development](#pwa-development)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)
10. [Known Limitations](#known-limitations)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 9+
- Code editor (VS Code recommended)
- Git

### Initial Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your configuration
# (Required: VITE_API_BASE_URL, VITE_SOCKET_URL)

# Start development server
npm run dev
```

The app will be available at **http://localhost:5173**

---

## 📦 Available Commands

### Development

```bash
# Start development server with hot reload
npm run dev

# Development server runs on http://localhost:5173
# Changes auto-reload in browser
```

### Production Build

```bash
# Build for production
npm run build

# Output: dist/ directory with optimized assets
# Includes: minified JS/CSS, tree-shaking, code splitting
```

### Preview Production Build

```bash
# Preview production build locally
npm run preview

# Serves the dist/ folder on http://localhost:4173
# Use this to test production behavior before deploying
```

### Verification

```bash
# Run comprehensive verification checks
node verify-frontend.js

# Checks:
# - Project structure
# - Configuration system
# - Layout & routing
# - Design system
# - UI components
# - PWA foundation
# - Build configuration
# - Documentation
```

### Generate PWA Icons

```bash
# Generate SVG icons for PWA
node scripts/generate-icons.js

# Creates icons in public/icons/
# See public/icons/convert-to-png.md for PNG conversion
```

---

## 📁 Project Structure

```
frontend/
├── public/                    # Static assets (served as-is)
│   ├── icons/                # PWA app icons
│   │   ├── icon-*.svg       # Standard icons (72x72 to 512x512)
│   │   └── icon-maskable-*.svg  # Maskable icons
│   ├── favicon.svg          # Browser favicon
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service worker
│   └── INSTALL.md           # User installation guide
│
├── src/                      # Source code
│   ├── components/          # React components
│   │   ├── ui/             # Reusable UI library
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Select.jsx
│   │   │   ├── Textarea.jsx
│   │   │   ├── Spinner.jsx
│   │   │   ├── Alert.jsx
│   │   │   ├── EmptyState.jsx
│   │   │   ├── Card.jsx
│   │   │   ├── index.js    # Barrel export
│   │   │   └── README.md   # Component documentation
│   │   │
│   │   └── [feature components]  # Feature-specific components
│   │
│   ├── config/              # Configuration management
│   │   └── index.js        # Centralized config with validation
│   │
│   ├── layouts/             # Layout components
│   │   ├── MainLayout.jsx  # Main app layout with header/footer
│   │   ├── PageContainer.jsx  # Page content wrapper
│   │   ├── NotFound.jsx    # 404 page
│   │   ├── Toast.jsx       # Toast notifications
│   │   └── index.js        # Layout exports
│   │
│   ├── services/            # API and external services
│   │   ├── api.js          # HTTP API client
│   │   └── socket.js       # WebSocket client
│   │
│   ├── utils/               # Utility functions
│   │   └── registerSW.js   # Service worker registration
│   │
│   ├── App.jsx              # Main app component
│   ├── main.jsx             # Application entry point
│   └── index.css            # Global styles & design system
│
├── scripts/                  # Build and utility scripts
│   └── generate-icons.js   # PWA icon generator
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md     # Frontend architecture
│   ├── DESIGN_SYSTEM.md    # Design guidelines
│   └── ROUTING_AND_LAYOUT.md  # Routing patterns
│
├── .env.example             # Environment template
├── .env.local               # Local environment (gitignored)
├── index.html               # HTML entry point
├── vite.config.js           # Vite build configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS configuration
├── package.json             # Dependencies and scripts
├── verify-frontend.js       # Verification script
├── PWA_SETUP.md            # PWA setup guide
├── PWA_TESTING.md          # PWA testing checklist
├── PWA_SUMMARY.md          # PWA implementation summary
├── DAY_01_FOUNDATION_SUMMARY.md  # Day 1 summary
└── DEVELOPER_GUIDE.md      # This file
```

---

## 🔄 Development Workflow

### 1. Start Development Server

```bash
npm run dev
```

- Hot Module Replacement (HMR) enabled
- Changes reflect immediately
- Service worker disabled by default (avoids caching issues)

### 2. Make Changes

- Edit files in `src/`
- Browser auto-refreshes on save
- Check browser console for errors

### 3. Test Changes

- **Visual**: Check in browser at multiple viewport sizes
- **Keyboard**: Tab through interactive elements
- **Console**: Ensure no errors
- **Network**: Check API calls in DevTools

### 4. Build for Production

```bash
npm run build
```

- Output in `dist/` directory
- Minified and optimized
- Source maps generated

### 5. Preview Production Build

```bash
npm run preview
```

- Test service worker behavior
- Verify bundle size
- Check for build errors

---

## ✅ Frontend Checks

### Automated Verification

Run the verification script to check all Day 1 foundation work:

```bash
node verify-frontend.js
```

**Checks performed:**
- ✓ Project structure (directories, core files)
- ✓ Configuration system (config module, env variables)
- ✓ Layout & routing (MainLayout, PageContainer, App integration)
- ✓ Design system (CSS variables, Tailwind config, component classes)
- ✓ UI components (all 8 components, barrel export, accessibility)
- ✓ PWA foundation (manifest, service worker, icons)
- ✓ HTML & meta tags (viewport, theme-color, manifest link)
- ✓ Build configuration (Vite, package.json scripts)
- ✓ Documentation (guides and READMEs)

### Manual Checks

#### Visual Regression

```bash
# Start dev server
npm run dev

# Open http://localhost:5173
# Test each tab:
# - Plan
# - Feed
# - Ride Groups
# - Reports
# - Demo
```

#### Responsive Testing

Test at these viewport sizes:
- **Mobile**: 375x667 (iPhone SE)
- **Tablet**: 768x1024 (iPad)
- **Desktop**: 1920x1080

In Chrome DevTools:
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select device or enter custom dimensions

#### Accessibility Testing

**Keyboard Navigation:**
```
Tab       - Move to next interactive element
Shift+Tab - Move to previous element
Enter     - Activate button/link
Space     - Toggle checkbox, activate button
Escape    - Close modal/dialog
```

**Screen Reader:**
- Windows: NVDA (free)
- Mac: VoiceOver (built-in, Cmd+F5)
- Chrome: ChromeVox extension

#### PWA Testing

See `PWA_TESTING.md` for comprehensive PWA checklist.

**Quick PWA check:**
1. Open DevTools → Application tab
2. Check Manifest section (should load without errors)
3. Check Service Workers section (registers in production)
4. Try installing the app (look for install prompt)

---

## 🎨 Component Conventions

### File Naming

- **Components**: PascalCase with `.jsx` extension
  - `Button.jsx`, `UserProfile.jsx`
- **Utilities**: camelCase with `.js` extension
  - `formatDate.js`, `apiHelpers.js`
- **Styles**: kebab-case with `.css` extension
  - `global-styles.css`, `button-overrides.css`

### Component Structure

```jsx
/**
 * Brief component description
 * 
 * @param {Object} props - Component props
 * @param {string} props.label - Button label text
 * @param {Function} props.onClick - Click handler
 */
export default function ComponentName({ label, onClick }) {
  // Hooks at the top
  const [state, setState] = useState(null);
  
  // Event handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // Render
  return (
    <div className="component-name">
      {/* Component JSX */}
    </div>
  );
}
```

### Props Conventions

```jsx
// ✅ Good: Destructure props, use descriptive names
function Button({ label, variant = 'primary', disabled = false, onClick }) {
  return <button className={`btn-${variant}`} disabled={disabled} onClick={onClick}>
    {label}
  </button>;
}

// ❌ Avoid: Using props object directly
function Button(props) {
  return <button onClick={props.onClick}>{props.label}</button>;
}
```

### Styling

**Use Tailwind utilities:**
```jsx
<div className="flex items-center gap-4 p-4 bg-slate-800 rounded-lg">
```

**For reusable patterns, use design system classes:**
```jsx
<button className="btn-primary">Submit</button>
<input className="input" />
<div className="card">...</div>
```

**Custom styles in index.css:**
```css
/* Use CSS variables */
.custom-class {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
}
```

### Accessibility

**Always include:**
- Semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- ARIA labels for icon-only buttons
- `alt` text for images
- Keyboard event handlers where needed
- Focus indicators (never remove outline without replacement)

```jsx
// ✅ Good accessibility
<button 
  aria-label="Close dialog"
  onClick={handleClose}
  className="focus:ring-2 focus:ring-blue-500"
>
  <XIcon />
</button>

// ❌ Poor accessibility
<div onClick={handleClose}>
  <XIcon />
</div>
```

### Component Documentation

Add JSDoc comments to exported components:

```jsx
/**
 * Primary button component with multiple variants
 * 
 * @example
 * <Button variant="primary" onClick={handleClick}>
 *   Click Me
 * </Button>
 * 
 * @param {Object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'} props.variant - Button style variant
 * @param {'sm'|'md'|'lg'} props.size - Button size
 * @param {boolean} props.disabled - Whether button is disabled
 * @param {boolean} props.loading - Show loading spinner
 * @param {ReactNode} props.children - Button content
 * @param {Function} props.onClick - Click handler
 */
export default function Button({ variant = 'primary', ...props }) {
  // Implementation
}
```

---

## 🔧 PWA Development

### Service Worker in Development

**Default**: Service worker is **disabled** in development to avoid caching issues.

**To enable** (for testing):
```bash
# Add to .env.local
VITE_SW_DEV=true
```

### Clear Service Worker Cache

```javascript
// Open browser console and run:
navigator.serviceWorker.getRegistration()
  .then(reg => reg?.unregister());

caches.keys()
  .then(keys => Promise.all(keys.map(k => caches.delete(k))));

// Then hard refresh (Ctrl+Shift+R)
```

### Test PWA Locally

1. **Build** for production:
   ```bash
   npm run build
   ```

2. **Serve** with HTTPS (required for SW):
   ```bash
   npm run preview
   ```

3. **Open** DevTools → Application tab

4. **Check**:
   - Manifest loads
   - Service worker registers
   - Assets cache correctly
   - Install prompt appears

### PWA Debugging

**Chrome DevTools Application Tab:**
- **Manifest**: View parsed manifest, check for errors
- **Service Workers**: Registration status, update, unregister
- **Cache Storage**: View cached resources
- **Clear storage**: Delete all data for debugging

**Common Issues:**

| Issue | Solution |
|-------|----------|
| SW not registering | Must use HTTPS or localhost |
| Manifest not loading | Check MIME type is `application/json` |
| Icons not showing | Verify paths in manifest match files |
| Changes not reflecting | Unregister SW, clear cache, hard refresh |

---

## ⚙️ Configuration

### Environment Variables

All environment variables must be prefixed with `VITE_` to be exposed to the client.

**Required variables** (`.env.local`):
```bash
# API endpoint (proxied in dev, full URL in production)
VITE_API_BASE_URL=/api

# WebSocket endpoint
VITE_SOCKET_URL=/

# App metadata
VITE_APP_TITLE=Smart Student Commute Companion
VITE_APP_DESCRIPTION=AI-powered student mobility assistant

# Feature flags
VITE_ENABLE_DEMO_RESET=true

# Development
VITE_LOG_LEVEL=info
```

**Optional variables**:
```bash
# Enable service worker in development
VITE_SW_DEV=true
```

### Accessing Configuration

```javascript
import config from '@/config';

// Access configuration
console.log(config.apiBaseUrl);    // /api
console.log(config.appTitle);       // Smart Student Commute Companion
console.log(config.features.demoReset);  // true
```

### Configuration Validation

Configuration is validated on app startup. If required variables are missing, you'll see an error screen in development with details.

---

## 🐛 Troubleshooting

### Development Server Won't Start

```bash
# Check if port 5173 is in use
netstat -ano | findstr :5173

# Kill process if needed (Windows)
taskkill /PID <process_id> /F

# Or use a different port
npm run dev -- --port 3000
```

### Build Fails

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite

# Try build again
npm run build
```

### Service Worker Issues

```bash
# Unregister service worker
# Open browser console:
navigator.serviceWorker.getRegistration().then(r => r?.unregister());

# Clear all caches
caches.keys().then(k => Promise.all(k.map(c => caches.delete(c))));

# Hard refresh (Ctrl+Shift+R)
```

### Hot Reload Not Working

1. Check if file is inside `src/`
2. Check for syntax errors in console
3. Try restarting dev server
4. Check if file is being watched (some editors need config)

### Tailwind Classes Not Working

1. Check `tailwind.config.js` includes correct content paths
2. Restart dev server after config changes
3. Check for typos in class names
4. Verify PostCSS is configured

### API Calls Failing

1. Check backend is running (port 5000)
2. Check API proxy in `vite.config.js`
3. Check CORS configuration on backend
4. Check network tab in DevTools for errors

---

## ⚠️ Known Limitations

### Day 1 Foundation

These are intentional limitations of the Day 1 foundation that will be addressed in future iterations:

#### PWA
- ❌ **Icons are SVG** - Work in modern browsers, but PNG recommended for max compatibility
  - **Future**: Convert to PNG or add `vite-plugin-pwa`
- ❌ **No push notifications** - Not yet implemented
  - **Future**: Day 6-7 roadmap
- ❌ **No background sync** - Offline operations don't queue
  - **Future**: Day 4-5 roadmap
- ❌ **No offline fallback UI** - Basic error handling only
  - **Future**: Day 2-3 roadmap

#### Testing
- ❌ **No automated tests** - Manual testing only
  - **Future**: Add Vitest or Jest for unit tests
  - **Future**: Add Playwright for E2E tests
- ❌ **No visual regression testing** - Manual visual checks required
  - **Future**: Consider Percy or Chromatic

#### Accessibility
- ✅ **Keyboard navigation** - Fully implemented
- ✅ **ARIA labels** - Present on components
- ⚠️ **Screen reader testing** - Patterns followed, but needs real testing
  - **Future**: Test with actual screen readers (NVDA, JAWS, VoiceOver)
- ❌ **Focus management** - Basic implementation only
  - **Future**: Advanced focus trapping for modals

#### Performance
- ❌ **No code splitting** - Single bundle (small app, not critical yet)
  - **Future**: Lazy load routes/features
- ❌ **No image optimization** - Icons only, no complex images yet
  - **Future**: Add image optimization plugin
- ❌ **No bundle analysis** - No visibility into bundle size
  - **Future**: Add `rollup-plugin-visualizer`

#### Developer Experience
- ❌ **No linting** - No ESLint configured
  - **Future**: Add ESLint with React rules
- ❌ **No formatting** - No Prettier configured
  - **Future**: Add Prettier with pre-commit hooks
- ❌ **No TypeScript** - Using JavaScript with JSDoc
  - **Future**: Consider TypeScript migration

### Browser Support

- ✅ **Chrome 90+** - Full support
- ✅ **Firefox 88+** - Full support
- ✅ **Edge 90+** - Full support
- ⚠️ **Safari 14+** - Limited service worker support
- ❌ **IE 11** - Not supported (React 18 requirement)

### Mobile Support

- ✅ **iOS Safari 14+** - Install support, limited SW
- ✅ **Chrome Android** - Full PWA support
- ✅ **Samsung Internet** - Full PWA support
- ⚠️ **Firefox iOS** - Limited (uses Safari engine)

---

## 📚 Additional Resources

### Documentation
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Frontend architecture overview
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) - Complete design guidelines
- [ROUTING_AND_LAYOUT.md](docs/ROUTING_AND_LAYOUT.md) - Routing patterns
- [PWA_SETUP.md](PWA_SETUP.md) - PWA setup and configuration
- [PWA_TESTING.md](PWA_TESTING.md) - PWA testing checklist
- [src/components/ui/README.md](src/components/ui/README.md) - UI component library

### External Resources
- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## 🤝 Contributing

When adding new features:

1. **Follow conventions** - Match existing code style
2. **Document components** - Add JSDoc comments
3. **Ensure accessibility** - Test keyboard and screen readers
4. **Update documentation** - Keep guides current
5. **Test thoroughly** - Manual testing at minimum
6. **Run verification** - `node verify-frontend.js`

---

## 📞 Support

For questions:
1. Check this guide and related documentation
2. Review component source code (has JSDoc comments)
3. Check browser console for errors
4. Review `PWA_TESTING.md` for PWA issues

---

**Last Updated**: Day 1 Foundation Complete  
**Version**: 1.0.0  
**Maintainer**: Xcaliber (Frontend)
