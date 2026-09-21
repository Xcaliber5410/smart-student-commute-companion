# Frontend Routing and Layout Architecture

**Date**: September 21, 2026  
**Branch**: `day-01-foundationXcaliber`  
**Status**: ✅ **Complete**

---

## Overview

The Smart Student Commute Companion uses a **tab-based routing system** without React Router. This provides a lightweight, simple navigation approach suitable for the MVP scope while maintaining excellent UX and accessibility.

---

## Routing Architecture

### Tab-Based Routing

**Pattern**: State-driven conditional rendering

```javascript
const [activeTab, setActiveTab] = useState('planner');

// Navigation
<button onClick={() => setActiveTab('planner')}>Plan Route</button>

// Rendering
{activeTab === 'planner' && <PlannerView />}
```

**Available Routes/Tabs**:
- `'planner'` - Main commute planning interface (default)
- `'together'` - Travel Together / ride-share coordination
- `'feed'` - Live student disruption feed

**Fallback**:
- Any unknown `activeTab` value → `<NotFound />` component

### Why Not React Router?

**Decision Rationale**:
1. **Simplicity**: Three views don't require complex routing
2. **Performance**: No router bundle overhead
3. **User Experience**: Instant tab switching (no route loading)
4. **Scope**: MVP doesn't require:
   - Deep linking (shareable URLs)
   - Browser history navigation
   - Nested routes
   - Route guards

**Future Migration Path**:
If deep linking becomes required, migration to React Router is straightforward:
```javascript
// Current
{activeTab === 'planner' && <PlannerView />}

// React Router equivalent
<Route path="/planner" element={<PlannerView />} />
```

---

## Layout Structure

### Component Hierarchy

```
<MainLayout> (Application shell)
├── <Navbar> (Sticky navigation)
│   ├── Logo & branding
│   ├── <nav> Tab navigation with keyboard support
│   ├── Connection status indicator
│   └── Demo reset button (feature flag)
├── <main> (Content area)
│   ├── Left column (7/12 on desktop)
│   │   └── {children} (Active tab content)
│   └── Right column (5/12 on desktop)
│       └── {sidebar} (Map component)
└── <footer> (Attribution & credits)
```

### Layout Components

#### 1. MainLayout (`layouts/MainLayout.jsx`)

**Purpose**: Primary application shell

**Props**:
- `children` (ReactNode) - Main content area
- `sidebar` (ReactNode) - Right sidebar (typically map)
- `navbarProps` (Object) - Props passed to Navbar

**Features**:
- Responsive grid (stacks on mobile, side-by-side on desktop)
- Sticky navbar at top
- Sticky sidebar on desktop
- Footer at bottom
- Max-width container (7xl = 1280px)

**Responsive Behavior**:
```css
Mobile (< 1024px):    [Content]
                      [Sidebar]

Desktop (≥ 1024px):   [Content 7/12] [Sidebar 5/12]
```

#### 2. PageContainer (`layouts/PageContainer.jsx`)

**Purpose**: Reusable content wrapper with consistent styling

**Props**:
- `title` (string, optional) - Section title
- `description` (string, optional) - Section description
- `children` (ReactNode) - Content
- `className` (string, optional) - Additional classes
- `as` (string, optional) - HTML element (default: 'div')

**Features**:
- Dark-themed card styling
- Consistent padding and spacing
- Optional header section
- Flexible semantic HTML

**Usage**:
```javascript
<PageContainer 
  title="Plan Your Commute" 
  description="AI-powered multimodal transit planning"
>
  <form>...</form>
</PageContainer>
```

---

## Navigation System

### Navbar Component (`components/Navbar.jsx`)

**Sections**:
1. **Top Banner**: Privacy notice & verification badges
2. **Main Navbar**: Logo, tabs, status, controls
3. **Tab Navigation**: Three tabs with active state

**Props**:
- `activeTab` (string) - Currently active tab
- `setActiveTab` (function) - Tab switch handler
- `isConnected` (boolean) - Socket.IO connection status
- `onResetDemo` (function) - Demo reset handler
- `isResetting` (boolean) - Reset loading state
- `reportsCount` (number) - Live report count badge

### Keyboard Accessibility

**Features Implemented**:
✅ Focus ring on all interactive elements  
✅ Keyboard event handlers (Enter, Space)  
✅ `aria-current="page"` on active tab  
✅ `aria-label` on icon-only buttons  
✅ `aria-hidden="true"` on decorative icons  
✅ `role="navigation"` on nav container  

**Keyboard Navigation**:
```
Tab       → Navigate through elements
Enter     → Activate focused button
Space     → Activate focused button
Shift+Tab → Navigate backwards
```

**Focus Ring Styling**:
```css
focus:outline-none 
focus:ring-2 
focus:ring-emerald-500 
focus:ring-offset-2 
focus:ring-offset-slate-950
```

### Active Route Indication

**Visual Indicators**:
1. **Background Color**: Active tab has emerald-500 background
2. **Text Color**: Active tab text is slate-950 (high contrast)
3. **Font Weight**: Active tab is font-semibold
4. **Shadow**: Active tab has shadow effect
5. **ARIA**: `aria-current="page"` attribute

**Inactive Tab Styling**:
- Text: slate-300 (muted)
- Hover: white text + slate-800 background
- Transition: smooth color/background transitions

### Mobile Behavior

**Responsive Design**:
- **< 640px (Mobile)**: 
  - Navigation wraps to multiple rows if needed
  - Tab text always visible
  - Icon + text layout
  
- **640px - 1024px (Tablet)**:
  - Navigation stays on one row
  - All features visible
  
- **≥ 1024px (Desktop)**:
  - Full layout with sidebar
  - "Reset Demo" button shows text

**Touch-Friendly**:
- Minimum tap target: 44x44px (iOS/Android guidelines)
- Adequate spacing between buttons
- Clear visual feedback on tap

---

## Fallback / Not Found

### NotFound Component (`components/NotFound.jsx`)

**Purpose**: Friendly error state for unknown routes

**Props**:
- `onNavigateHome` (function, optional) - Navigate to planner
- `message` (string, optional) - Custom error message

**Use Cases**:
1. Unknown `activeTab` value
2. Future feature pages (coming soon)
3. Error recovery

**Features**:
- Clear visual hierarchy
- Amber warning icon
- Descriptive message
- Call-to-action button
- Consistent card styling

**Default Behavior**:
```javascript
// In App.jsx renderTabContent()
default:
  return (
    <NotFound 
      message="Unknown View"
      onNavigateHome={() => setActiveTab('planner')}
    />
  );
```

---

## Toast Notifications

### Toast Component (`components/Toast.jsx`)

**Purpose**: Floating feedback messages

**Props**:
- `message` (string) - Message text
- `type` (string) - 'success', 'error', 'warning', 'info'

**Types & Styling**:
```javascript
success → emerald border + background
error   → rose border + background
warning → amber border + background
info    → sky border + background
```

**Features**:
- Fixed bottom-right position
- Auto-dismiss after 3.5s
- Fade-in animation
- Icon + message layout
- Backdrop blur effect
- High z-index (3000)

**Usage**:
```javascript
const [toast, setToast] = useState(null);

const showToast = (message, type = 'success') => {
  setToast({ message, type });
  setTimeout(() => setToast(null), 3500);
};

// In JSX
{toast && <Toast message={toast.message} type={toast.type} />}
```

---

## Responsive Behavior

### Breakpoints

**Tailwind Breakpoints Used**:
```javascript
sm:  640px  // Small tablets
md:  768px  // Medium tablets  
lg:  1024px // Laptops (primary breakpoint)
xl:  1280px // Desktops
```

**Primary Breakpoint**: `lg:` (1024px) for main layout split

### Mobile-First Approach

**Mobile (< 1024px)**:
- Single column layout
- Content stacks vertically
- Map below content (full width, fixed height)
- Navigation wraps if needed
- Simplified controls

**Desktop (≥ 1024px)**:
- Two-column layout (7:5 ratio)
- Content left, map right
- Sticky map scrolls with content
- Full navigation on one row
- All features visible

### Component Responsiveness

**Example: Navbar**:
```javascript
// Logo subtitle - hidden on mobile
<p className="text-[11px] text-slate-400 hidden sm:block">
  Multimodal Transit • Community Disruptions
</p>

// Reset button text - hidden on mobile
<span className="hidden md:inline">Reset Demo</span>

// Status text - hidden on mobile
<span className="font-medium text-[11px] hidden sm:inline">Live Sync</span>
```

---

## Layout Best Practices

### 1. Consistent Spacing

**System Scale**:
```javascript
gap-2  → 0.5rem (8px)
gap-4  → 1rem (16px)
gap-6  → 1.5rem (24px)
p-5    → 1.25rem (20px)
```

**Usage**:
- Card padding: `p-5`
- Grid gap: `gap-6`
- Component spacing: `space-y-6`

### 2. Dark Theme Colors

**Background Layers**:
```javascript
slate-950  → Base (darkest)
slate-900  → Cards & elevated elements
slate-800  → Borders & dividers
slate-700  → Hover states
```

**Text Colors**:
```javascript
white          → Primary headings
slate-100      → Important text
slate-200-300  → Body text
slate-400      → Muted text
```

### 3. Component Composition

**Reuse over Duplication**:
```javascript
// ✅ Good: Reuse existing components
<PageContainer title="My Section">
  <PlannerForm ... />
</PageContainer>

// ❌ Bad: Duplicate card styling
<div className="bg-slate-900/90 border ...">
  <PlannerForm ... />
</div>
```

### 4. Accessibility

**Checklist**:
- [ ] Semantic HTML (nav, main, footer, section)
- [ ] ARIA attributes where needed
- [ ] Keyboard navigation support
- [ ] Focus indicators visible
- [ ] Icon-only buttons have aria-label
- [ ] Decorative icons have aria-hidden
- [ ] Color contrast meets WCAG AA

---

## Future Enhancements

### Potential Additions

**1. React Router Migration**
- Add `react-router-dom` dependency
- Convert tabs to URL routes (/planner, /together, /feed)
- Enable deep linking and browser history
- Add route-level code splitting

**2. Layout Variants**
- Create `MinimalLayout` for auth pages (future)
- Create `FullScreenLayout` for map-only mode
- Add `PrintLayout` for route printouts

**3. Advanced Navigation**
- Breadcrumbs for nested sections
- Search/command palette (Cmd+K)
- Quick switcher between recent views
- Keyboard shortcuts (1, 2, 3 for tabs)

**4. Progressive Enhancement**
- Save last active tab to localStorage
- Restore tab on page reload
- Add tab transition animations
- Implement tab preloading

**5. Accessibility Improvements**
- Skip to content link
- Landmark navigation (Header, Main, Footer)
- Announce route changes to screen readers
- Reduced motion preferences

---

## Migration Guide

### From Current to React Router

If deep linking becomes required, here's the migration path:

**Step 1**: Install React Router
```bash
npm install react-router-dom
```

**Step 2**: Wrap App in Router
```javascript
// main.jsx
import { BrowserRouter } from 'react-router-dom';

<BrowserRouter>
  <App />
</BrowserRouter>
```

**Step 3**: Convert Tabs to Routes
```javascript
// App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';

<Routes>
  <Route path="/" element={<Navigate to="/planner" replace />} />
  <Route path="/planner" element={<PlannerView />} />
  <Route path="/together" element={<TravelTogether />} />
  <Route path="/feed" element={<LiveFeed />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

**Step 4**: Update Navigation
```javascript
// Navbar.jsx
import { NavLink } from 'react-router-dom';

<NavLink 
  to="/planner"
  className={({ isActive }) => 
    isActive ? 'bg-emerald-500 ...' : 'text-slate-300 ...'
  }
>
  Plan Route
</NavLink>
```

**Benefits of Migration**:
- ✅ Shareable URLs
- ✅ Browser back/forward
- ✅ Deep linking
- ✅ SEO (if SSR added)
- ✅ Code splitting per route

**Estimated Effort**: 2-3 hours

---

## Testing Checklist

### Functional Testing

- [ ] All three tabs render correctly
- [ ] Tab switching updates URL and content
- [ ] Unknown tab shows NotFound
- [ ] Navigation buttons work
- [ ] Map persists across tab switches
- [ ] Modals work from all tabs
- [ ] Toast notifications appear correctly
- [ ] Demo reset button works (if enabled)

### Responsive Testing

- [ ] Mobile (375px): Layout stacks, navigation wraps
- [ ] Tablet (768px): Layout adjusts, navigation fits
- [ ] Desktop (1280px): Full two-column layout
- [ ] Ultra-wide (1920px): Content stays max-width

### Keyboard Testing

- [ ] Tab key navigates through all elements
- [ ] Enter/Space activates navigation buttons
- [ ] Focus rings are visible
- [ ] No keyboard traps
- [ ] Modals trap focus correctly

### Accessibility Testing

- [ ] Screen reader announces tab changes
- [ ] ARIA attributes correct
- [ ] Color contrast meets WCAG AA
- [ ] Icons have appropriate labels
- [ ] Semantic HTML structure

---

## Summary

✅ **Layout Structure**: Clean, responsive MainLayout with sidebar  
✅ **Tab Routing**: Simple state-driven navigation  
✅ **Not Found**: Friendly fallback for unknown routes  
✅ **Mobile Support**: Responsive breakpoints and touch-friendly  
✅ **Keyboard Access**: Full keyboard navigation support  
✅ **Active Indication**: Clear visual feedback on active tab  
✅ **Toast System**: Extracted notification component  
✅ **Documentation**: Comprehensive guide for future development  

**No Breaking Changes**: All existing functionality preserved

---

**Implemented By**: Xcaliber (Frontend Lead)  
**Date**: September 21, 2026  
**Branch**: `day-01-foundationXcaliber`
