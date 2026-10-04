# UI Components Library

This directory contains reusable, accessible UI components for the Smart Student Commute Companion frontend. All components follow the project's design system and are built with React + Tailwind CSS.

## Design Principles

- **Accessible by default**: Semantic HTML, ARIA attributes, keyboard navigation, screen reader support
- **Responsive**: Mobile-first design, adapts to all screen sizes
- **Themeable**: Uses CSS variables from the design system (dark theme)
- **Composable**: Simple props interface, can be combined for complex UIs
- **Consistent**: Follows existing patterns in `index.css` and `tailwind.config.js`

## Available Components

### Button
Multi-variant button with loading states and icon support.

**Variants**: `primary` (default), `secondary`, `ghost`, `danger`  
**Sizes**: `sm`, `md` (default), `lg`

```jsx
import { Button } from '@/components/ui';

// Primary button
<Button onClick={handleSubmit}>Submit</Button>

// With loading state
<Button loading disabled>Processing...</Button>

// With icon
<Button variant="secondary" icon={<UserIcon />}>
  Profile
</Button>

// Full width
<Button fullWidth>Continue</Button>
```

### Input
Text input with label, error messages, and optional icons.

```jsx
import { Input } from '@/components/ui';

<Input
  label="Email Address"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
  hint="We'll never share your email"
  required
/>

// With icon
<Input
  label="Search"
  icon={<SearchIcon />}
  placeholder="Search routes..."
/>
```

### Select
Dropdown select with label and error handling.

```jsx
import { Select } from '@/components/ui';

<Select
  label="Commute Type"
  value={commuteType}
  onChange={(e) => setCommuteType(e.target.value)}
  options={[
    { value: 'transit', label: 'Public Transit' },
    { value: 'walking', label: 'Walking' },
    { value: 'biking', label: 'Biking' }
  ]}
  required
/>
```

### Textarea
Multi-line text input with character count.

```jsx
import { Textarea } from '@/components/ui';

<Textarea
  label="Feedback"
  value={feedback}
  onChange={(e) => setFeedback(e.target.value)}
  rows={4}
  maxLength={500}
  hint="Tell us about your experience"
/>
```

### Spinner
Loading indicator with size and color variants.

**Sizes**: `sm`, `md` (default), `lg`  
**Variants**: `default` (blue), `white`, `muted` (gray)

```jsx
import { Spinner } from '@/components/ui';

// Inline loading
<Spinner size="sm" />

// Full-page loading
<div className="flex justify-center items-center min-h-screen">
  <Spinner size="lg" />
</div>
```

### Alert
Notification/message component with variants.

**Variants**: `success`, `error`, `warning`, `info`

```jsx
import { Alert } from '@/components/ui';

<Alert variant="success" title="Route saved">
  Your commute plan has been saved successfully.
</Alert>

// Dismissible
<Alert 
  variant="error" 
  title="Connection failed"
  dismissible
  onDismiss={() => setError(null)}
>
  Unable to fetch transit data. Please try again.
</Alert>
```

### EmptyState
Placeholder for empty lists, search results, etc.

```jsx
import { EmptyState } from '@/components/ui';
import { MapIcon } from 'lucide-react';

<EmptyState
  icon={<MapIcon />}
  title="No routes found"
  description="Try adjusting your search criteria or destination"
  action={
    <Button onClick={handleReset}>Clear Filters</Button>
  }
/>
```

### Card
Container component for grouped content.

```jsx
import { Card } from '@/components/ui';
import { SettingsIcon } from 'lucide-react';

// Simple card
<Card>
  <p>Card content goes here</p>
</Card>

// With title and action
<Card
  title="Route Options"
  headerAction={
    <button className="text-blue-400">
      <SettingsIcon size={20} />
    </button>
  }
>
  <ul>...</ul>
</Card>

// With footer
<Card
  title="Route Summary"
  footer={
    <Button fullWidth>View Details</Button>
  }
>
  <div>Route info...</div>
</Card>
```

### Tabs (+ TabPanel)
Accessible tab strip / segmented control for switching between related views of the same data. Active state is owned by the caller.

```jsx
import { Tabs, TabPanel } from '@/components/ui';

const tabs = [
  { id: 'stops', label: 'Stops & Stations', icon: MapPin, count: 12 },
  { id: 'routes', label: 'Routes & Lines', icon: Train, count: 4 },
];

<Tabs
  idPrefix="transit-results"
  ariaLabel="Transit result type"
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
/>

<TabPanel idPrefix="transit-results" tabId={activeTab}>
  {/* active panel content */}
</TabPanel>
```

Roving tabindex + Arrow/Home/End keys move between tabs. Use the same `idPrefix` for `Tabs` and `TabPanel` so `aria-controls` / `aria-labelledby` line up.

### StatTile
Compact summary metric (value + label + optional icon/hint) for counts at the top of feature screens. Value and label are real text — never color-only.

```jsx
import { StatTile } from '@/components/ui';

<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
  <StatTile value={reports.length} label="Active alerts" icon={<AlertTriangle />} variant="amber" />
  <StatTile value={highImpact} label="High impact" icon={<AlertCircle />} variant="rose" />
</div>
```

**Variants**: `slate`, `emerald`, `sky`, `amber`, `rose`, `indigo`

### ListSkeleton
Stable-size shimmer rows mirroring the DataCard list layout, with an accessible status message for screen readers.

```jsx
import { ListSkeleton } from '@/components/ui';

// Loading placeholder — no layout jump when data arrives
<ListSkeleton rows={3} label="Searching the transit network" />
```

### EventLogList
Chronological log of timestamped, device-local events (install outcomes, connectivity transitions, cache activity, service-worker errors) rendered as a real ordered list. Severity is carried by a visible kind badge alongside the dot — never color alone — and messages wrap in full. The caller owns slicing/filtering, so the component stays purely presentational.

```jsx
import { EventLogList } from '@/components/ui';

<EventLogList
  label="Service worker error log"
  items={[
    { id: 1, kind: 'sw-error', level: 'error', message: 'Cache write failed', at: new Date().toISOString() },
  ]}
  emptyMessage="No worker errors recorded."
/>
```

**Kinds**: `install`, `offline`, `online`, `cache`, `sw-error`, `sw-update`  
**Levels**: `info`, `success`, `warning`, `error`

### QueueReportItem
Row for one pending submission waiting to reach the server (Day 11 offline queue). Renders as an `<li>` inside a caller-owned list; status is a visible text badge (never color alone), messages wrap in full, and an actions slot lets the caller add row buttons. The caller owns ordering, filtering and wiring.

```jsx
import { QueueReportItem } from '@/components/ui';

<ul>
  <QueueReportItem
    status="pending"
    title="Road closed near campus gate"
    queuedAt={item.queuedAt}
    area="Andheri"
    attempts={0}
  >
    <button type="button">Discard</button>
  </QueueReportItem>
</ul>
```

**Statuses**: `pending` (Waiting), `sending` (Sending), `failed` (Rejected)

### UnreadCountBadge
Numeric unread/new count pill (Day 12). Used by the Notifications screen header and the navigation badges. Clamps large counts (`9+`) so tight layouts (e.g. the ten-item bottom nav) never overflow, hides itself when the count is zero, and announces the full meaning to screen readers via a visually hidden label.

```jsx
import { UnreadCountBadge } from '@/components/ui';

// Nav badge — announces "5 unread notifications"
<UnreadCountBadge count={5} />

// Header — adjacent text carries the meaning; pass srLabel={null}
<UnreadCountBadge count={3} srLabel={null} />
```

**Props**: `count` (number, renders nothing ≤ 0), `max` (clamp, default 9), `srLabel` (string | null), `variant` (`emerald` | `amber`), `size` (`sm` | `md`), `className`

## Import Patterns

**Recommended** (barrel import):
```jsx
import { Button, Input, Card } from '@/components/ui';
```

**Alternative** (direct import):
```jsx
import Button from '@/components/ui/Button';
```

## Styling Guidelines

### Using with Tailwind
All components accept a `className` prop for additional styling:

```jsx
<Button className="mt-4 shadow-lg">
  Custom Styled Button
</Button>

<Card className="border-2 border-blue-500">
  Highlighted card
</Card>
```

### Responsive Design
Components use responsive Tailwind classes internally. For custom responsive behavior:

```jsx
<Button className="w-full md:w-auto">
  Full width on mobile, auto on desktop
</Button>
```

### Dark Theme
All components are optimized for the project's dark theme. Colors use CSS variables defined in `src/index.css`:

- `--color-background`: Main background
- `--color-surface`: Card/panel backgrounds
- `--color-text-primary`: Primary text
- `--color-text-secondary`: Secondary text
- `--color-text-muted`: Muted/disabled text
- `--color-border`: Border colors

## Accessibility Features

All components include:

✅ **Keyboard Navigation**: Tab, Enter, Escape support  
✅ **ARIA Attributes**: Proper roles, labels, and states  
✅ **Focus Indicators**: Visible focus rings (blue-500 ring)  
✅ **Screen Reader Support**: Descriptive labels and error messages  
✅ **Semantic HTML**: Native elements where possible  
✅ **Error Handling**: `aria-invalid` and `aria-describedby` for form fields

### Testing Accessibility

```bash
# Run accessibility audit (if configured)
npm run test:a11y

# Manual testing checklist:
# - Tab through all interactive elements
# - Test with screen reader (NVDA, JAWS, VoiceOver)
# - Verify focus indicators are visible
# - Check color contrast ratios
```

## Form Handling Example

Combine components for complete form UIs:

```jsx
import { Button, Input, Select, Textarea, Alert } from '@/components/ui';
import { useState } from 'react';

function FeedbackForm() {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    message: ''
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitFeedback(formData);
      // Show success message
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="error" title="Submission failed" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Input
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <Select
        label="Category"
        value={formData.category}
        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
        options={[
          { value: 'bug', label: 'Bug Report' },
          { value: 'feature', label: 'Feature Request' },
          { value: 'general', label: 'General Feedback' }
        ]}
        required
      />

      <Textarea
        label="Message"
        value={formData.message}
        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
        rows={6}
        maxLength={1000}
        required
      />

      <Button type="submit" loading={loading} fullWidth>
        Submit Feedback
      </Button>
    </form>
  );
}
```

## Component Customization

### Creating Variants
To add new variants to existing components, modify the variant mapping:

```jsx
// In Button.jsx
const variants = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
  // Add new variant:
  success: 'bg-green-600 hover:bg-green-700 text-white'
};
```

### Extending Components
For app-specific variations, create wrapper components:

```jsx
// components/RouteButton.jsx
import { Button } from '@/components/ui';
import { MapIcon } from 'lucide-react';

export default function RouteButton({ children, ...props }) {
  return (
    <Button icon={<MapIcon />} variant="primary" {...props}>
      {children}
    </Button>
  );
}
```

## Migration Guide

### From Legacy Components
If migrating from older custom components:

**Before**:
```jsx
<button className="btn-primary" onClick={handleClick}>
  {loading ? <LoadingSpinner /> : 'Submit'}
</button>
```

**After**:
```jsx
<Button onClick={handleClick} loading={loading}>
  Submit
</Button>
```

### From Inline Styles
**Before**:
```jsx
<input
  type="text"
  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
  aria-label="Search"
/>
```

**After**:
```jsx
<Input label="Search" />
```

## Best Practices

### DO ✅
- Use semantic HTML (`<button>` not `<div onClick>`)
- Include labels for all form fields
- Provide descriptive error messages
- Use loading states for async actions
- Test keyboard navigation
- Keep components single-responsibility

### DON'T ❌
- Don't override component internals with `!important`
- Don't remove focus indicators for aesthetics
- Don't use placeholders as labels
- Don't nest buttons inside buttons
- Don't skip error handling in forms
- Don't hardcode colors outside the design system

## Browser Support

Components are tested in:
- Chrome/Edge (Chromium) 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Related Documentation

- [Design System](./DESIGN_SYSTEM.md) - Color palette, typography, spacing
- [Architecture](../../ARCHITECTURE.md) - Frontend architecture overview
- [Routing & Layout](./ROUTING_AND_LAYOUT.md) - Page layouts and navigation

## Contributing

When adding new UI components:

1. Follow existing patterns (props interface, accessibility, Tailwind usage)
2. Add component to `index.js` barrel export
3. Document usage with code examples in this README
4. Test with keyboard navigation and screen readers
5. Ensure responsive behavior on mobile/tablet/desktop
6. Use CSS variables from design system for colors

## Questions?

For component-specific questions, check:
- Component source code (inline JSDoc comments)
- `DESIGN_SYSTEM.md` for styling conventions
- Existing feature components (`frontend/src/components/`) for usage examples
