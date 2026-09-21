# Design System Documentation

**Date**: September 21, 2026  
**Branch**: `day-01-foundationXcaliber`  
**Status**: ✅ **Complete**

---

## Overview

The Smart Student Commute Companion uses a **dark-first design system** built on Tailwind CSS with custom design tokens. This document defines all visual conventions that future frontend work should follow.

---

## Design Principles

1. **Dark Mode Only**: Optimized for low-light viewing conditions during commutes
2. **Mobile-First**: All components work perfectly on small screens first
3. **Accessible**: WCAG AA compliant with clear focus states
4. **Consistent**: Predictable patterns across all components
5. **Performance**: Minimal custom CSS, leveraging Tailwind utilities

---

## Color System

### Surface Colors (Backgrounds)

```css
/* Layering - Darkest to Lightest */
slate-950  (#020617)  → Page background (base layer)
slate-900  (#0f172a)  → Cards & elevated elements
slate-800  (#1e293b)  → Hover states & raised elements
slate-700  (#334155)  → Interactive hover backgrounds
```

**Usage**:
- `bg-slate-950`: Body background, input backgrounds
- `bg-slate-900/90`: Card backgrounds (with transparency)
- `bg-slate-800`: Button secondary, borders
- `bg-slate-700`: Hover states

### Text Colors

```css
/* Text Hierarchy - Lightest to Darkest */
slate-50   (#f8fafc)  → Primary headings (h1-h6)
slate-100  (#f1f5f9)  → Important text
slate-200  (#e2e8f0)  → Body text (default)
slate-300  (#cbd5e1)  → Labels & secondary text
slate-400  (#94a3b8)  → Muted text & placeholders
slate-500  (#64748b)  → Subtle text & disabled states
```

**Usage**:
- `text-white` or `text-slate-50`: Headings
- `text-slate-200`: Body copy
- `text-slate-300`: Labels
- `text-slate-400`: Muted text
- `text-slate-500`: Disabled text

### Brand Colors

```css
/* Primary Brand - Emerald Green */
emerald-400  (#34d399)  → Light accent
emerald-500  (#10b981)  → Primary brand color
emerald-600  (#059669)  → Hover state
emerald-700  (#047857)  → Pressed state

/* Brand Usage */
brand-primary: emerald-500
brand-hover: emerald-600
brand-light: emerald-400
```

**Usage**:
- Primary buttons: `bg-emerald-500 hover:bg-emerald-400`
- Active states: `bg-emerald-500 text-slate-950`
- Focus rings: `focus:ring-emerald-500`
- Icons & accents: `text-emerald-400`

### Semantic Colors

```css
/* Success */
emerald-500  (#10b981)  → Success messages, positive actions

/* Warning */
amber-500    (#f59e0b)  → Warnings, caution states

/* Error */
rose-500     (#ef4444)  → Errors, destructive actions

/* Info */
sky-500      (#3b82f6)  → Information, neutral states
```

**Badge Colors**:
- `badge-primary`: emerald-500/10 background
- `badge-warning`: amber-500/10 background
- `badge-error`: rose-500/10 background
- `badge-info`: sky-500/10 background

### Border Colors

```css
slate-800/50   → Subtle borders
slate-800/80   → Default borders
slate-700      → Emphasized borders
```

**Usage**:
- `border-slate-800/80`: Card borders
- `border-slate-700`: Input borders
- `border-slate-600`: Emphasized dividers

---

## Typography

### Font Families

```css
font-sans     → Inter (body text)
font-display  → Outfit (display text, optional)
```

**Usage**:
```jsx
<body className="font-sans">
<h1 className="font-display">  // Optional for headers
```

### Font Sizes

```css
text-xs      0.75rem   (12px)  → Small labels, badges
text-sm      0.875rem  (14px)  → Body text, inputs
text-base    1rem      (16px)  → Default size
text-lg      1.125rem  (18px)  → Section headings
text-xl      1.25rem   (20px)  → Card titles
text-2xl     1.5rem    (24px)  → Page titles
text-3xl     1.875rem  (30px)  → Large headings
```

**Common Patterns**:
- Form inputs: `text-sm`
- Body paragraphs: `text-sm` or `text-base`
- Card titles: `text-base` or `text-lg`
- Page headings: `text-xl` or `text-2xl`
- Labels: `text-xs`
- Badges: `text-[11px]` (custom)

### Font Weights

```css
font-normal     400  → Body text
font-medium     500  → Emphasized text
font-semibold   600  → Buttons, tabs
font-bold       700  → Headings
font-extrabold  800  → Hero text, important headings
```

### Line Heights

Automatically set via Tailwind's fontSize scale. Manual overrides:
```css
leading-tight    1.25   → Headings
leading-normal   1.5    → Body text (default)
leading-relaxed  1.625  → Longer paragraphs
```

---

## Spacing System

### Spacing Scale

```css
0.5   2px     → Minimal spacing
1     4px     → Tight spacing
1.5   6px     → Small spacing
2     8px     → Standard small
3     12px    → Medium-small
4     16px    → Standard
5     20px    → Medium
6     24px    → Large
8     32px    → Extra large
```

### Common Patterns

**Card Padding**: `p-5` (20px)  
**Input Padding**: `px-3.5 py-2.5` (14px/10px)  
**Button Padding**: `px-4 py-2.5` (16px/10px)  
**Section Spacing**: `space-y-4` or `space-y-6`  
**Grid Gaps**: `gap-4` or `gap-6`

### Responsive Spacing

```jsx
// Mobile: smaller padding, Desktop: larger
<div className="px-4 sm:px-6 lg:px-8">
<div className="py-4 md:py-6">
```

---

## Border Radius

### Radius Scale

```css
rounded-sm    6px     → Small elements
rounded-md    8px     → Standard rounded
rounded-lg    12px    → Medium rounded
rounded-xl    16px    → Large rounded (buttons, inputs)
rounded-2xl   24px    → Extra large (cards)
rounded-3xl   32px    → Very large
rounded-full  9999px  → Pills, avatars
```

### Common Usage

- **Cards**: `rounded-2xl` (24px)
- **Buttons**: `rounded-xl` (16px)
- **Inputs**: `rounded-xl` (16px)
- **Badges**: `rounded-full` or `rounded`
- **Small buttons**: `rounded-lg` (12px)
- **Pills**: `rounded-full`

---

## Shadows

### Shadow Scale

```css
shadow-sm     → Subtle shadow
shadow        → Default shadow
shadow-md     → Medium shadow
shadow-lg     → Large shadow
shadow-xl     → Extra large shadow (cards)
shadow-2xl    → Very large shadow
```

### Custom Shadows

```css
shadow-glow      → Emerald glow effect
shadow-glow-lg   → Large emerald glow
```

**Usage**:
- Cards: `shadow-xl`
- Dropdowns: `shadow-2xl`
- Focused elements: `shadow-glow` (optional)

---

## Button System

### Button Variants

#### Primary Button
```jsx
<button className="btn-primary">
  Primary Action
</button>

// Or inline:
<button className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-semibold transition-all active:scale-95 focus:ring-2 focus:ring-emerald-500">
  Primary
</button>
```

**Classes**: `btn-primary`  
**Style**: Emerald background, dark text, active scale effect

#### Secondary Button
```jsx
<button className="btn-secondary">
  Secondary Action
</button>
```

**Classes**: `btn-secondary`  
**Style**: Dark background, border, muted text

#### Ghost Button
```jsx
<button className="btn-ghost">
  Tertiary Action
</button>
```

**Classes**: `btn-ghost`  
**Style**: No background, hover background on interaction

#### Danger Button
```jsx
<button className="btn-danger">
  Delete
</button>
```

**Classes**: `btn-danger`  
**Style**: Rose background, white text

### Button Sizes

```jsx
<button className="btn-primary btn-sm">Small</button>
<button className="btn-primary">Default</button>
<button className="btn-primary btn-lg">Large</button>
```

**Sizes**: `btn-sm`, default, `btn-lg`

### Button States

```jsx
<button className="btn-primary" disabled>
  Disabled
</button>
```

**States**: `:hover`, `:active`, `:focus`, `:disabled`

### Icon Buttons

```jsx
<button className="btn-primary">
  <Icon className="w-4 h-4" />
  <span>Label</span>
</button>

// Icon only
<button className="btn-ghost p-2">
  <Icon className="w-4 h-4" aria-hidden="true" />
  <span className="sr-only">Accessible label</span>
</button>
```

---

## Form Controls

### Input Field

```jsx
<input 
  type="text"
  className="input"
  placeholder="Enter text..."
/>

// Or inline:
<input 
  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
/>
```

**Classes**: `input`  
**Features**: Focus ring, border highlight, placeholder styling

### Textarea

```jsx
<textarea 
  className="textarea"
  rows={4}
  placeholder="Enter description..."
/>
```

**Classes**: `textarea`  
**Features**: Resizable, focus states

### Select Dropdown

```jsx
<select className="select">
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</select>
```

**Classes**: `select`  
**Features**: Styled options, focus ring

### Label

```jsx
<label className="label">
  Field Label
</label>

// With required indicator
<label className="label">
  Email <span className="text-rose-400">*</span>
</label>
```

**Classes**: `label`  
**Style**: Small, semibold, muted color

### Checkbox & Radio

```jsx
<input type="checkbox" className="checkbox" />
<input type="radio" className="radio" />
```

**Classes**: `checkbox`, `radio`  
**Features**: Emerald when checked, focus ring

### Form Layout Pattern

```jsx
<div className="space-y-4">
  <div>
    <label className="label">Email</label>
    <input type="email" className="input" />
  </div>
  
  <div>
    <label className="label">Password</label>
    <input type="password" className="input" />
  </div>
  
  <button className="btn-primary w-full">
    Submit
  </button>
</div>
```

---

## Cards & Surfaces

### Card

```jsx
<div className="card">
  <div className="card-header">
    <h3 className="card-title">Card Title</h3>
  </div>
  <div className="card-body">
    {/* Content */}
  </div>
</div>

// Or inline:
<div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
  {/* Content */}
</div>
```

**Classes**: `card`, `card-header`, `card-title`, `card-body`  
**Features**: Dark background, subtle border, backdrop blur

### Badges

```jsx
<span className="badge badge-primary">Active</span>
<span className="badge badge-warning">Pending</span>
<span className="badge badge-error">Error</span>
<span className="badge badge-info">Info</span>
```

**Classes**: `badge`, `badge-primary`, `badge-warning`, `badge-error`, `badge-info`  
**Usage**: Status indicators, count labels

---

## Focus States

### Standard Focus Ring

```css
focus:outline-none 
focus:ring-2 
focus:ring-emerald-500 
focus:ring-offset-2 
focus:ring-offset-slate-950
```

**Usage**: All interactive elements (buttons, inputs, links)

### Focus Utility Classes

```jsx
// Apply to any interactive element
<button className="focus-ring">Button</button>

// Focus visible only (keyboard only)
<button className="focus-visible-ring">Button</button>
```

**Classes**: `focus-ring`, `focus-visible-ring`

### Focus State Examples

```jsx
// Button
<button className="... focus:ring-2 focus:ring-emerald-500">

// Input
<input className="... focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500">

// Link
<a className="... focus:ring-2 focus:ring-emerald-500 rounded">
```

---

## Responsive Breakpoints

### Breakpoint Scale

```css
sm:   640px   → Small tablets
md:   768px   → Medium tablets
lg:   1024px  → Laptops (PRIMARY)
xl:   1280px  → Desktops
2xl:  1536px  → Large desktops
```

### Mobile-First Approach

```jsx
// Base styles apply to mobile
<div className="px-4 sm:px-6 lg:px-8">

// Mobile → Tablet → Desktop
<div className="text-sm md:text-base lg:text-lg">

// Mobile: stack, Desktop: grid
<div className="grid grid-cols-1 lg:grid-cols-12">
```

### Common Responsive Patterns

**Container Padding**:
```jsx
<div className="px-4 sm:px-6 py-4 md:py-6">
```

**Typography**:
```jsx
<h1 className="text-xl md:text-2xl lg:text-3xl">
```

**Grid Layout**:
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

**Show/Hide**:
```jsx
<span className="hidden sm:inline">Desktop only</span>
<span className="sm:hidden">Mobile only</span>
```

---

## Transitions & Animations

### Transition Durations

```css
transition-all          → 200ms (default)
duration-150           → Fast transition
duration-300           → Slow transition
```

### Easing Functions

```css
ease-in                → Acceleration
ease-out               → Deceleration (default for most)
ease-in-out            → Smooth both ends
```

### Custom Animations

```css
animate-pulse-slow     → Subtle pulse (badges, indicators)
animate-fade-in        → Fade in from bottom
animate-spin-slow      → Slow rotation (loading states)
```

**Usage**:
```jsx
<div className="animate-pulse-slow">Pulsing badge</div>
<div className="animate-fade-in">Fading in</div>
<Icon className="animate-spin-slow" />
```

### Button Active States

```jsx
<button className="... active:scale-95">
  Scales down slightly on click
</button>
```

---

## Accessibility Guidelines

### Keyboard Navigation

1. **All interactive elements must be keyboard accessible**
   ```jsx
   <button tabIndex={0}>Accessible</button>
   ```

2. **Visible focus states are required**
   ```jsx
   <button className="focus:ring-2 focus:ring-emerald-500">
   ```

3. **Skip links for navigation**
   ```jsx
   <a href="#main-content" className="skip-link">
     Skip to main content
   </a>
   ```

### ARIA Attributes

1. **Icon-only buttons need labels**
   ```jsx
   <button aria-label="Close">
     <X className="w-4 h-4" aria-hidden="true" />
   </button>
   ```

2. **Decorative icons should be hidden**
   ```jsx
   <Icon className="w-4 h-4" aria-hidden="true" />
   ```

3. **Active states should be announced**
   ```jsx
   <button aria-current="page">Active Tab</button>
   ```

### Color Contrast

**Minimum Ratios** (WCAG AA):
- Normal text: 4.5:1
- Large text (18px+): 3:1
- UI components: 3:1

**Verified Combinations**:
- `text-white` on `bg-emerald-500` ✅ 
- `text-slate-950` on `bg-emerald-500` ✅
- `text-slate-200` on `bg-slate-900` ✅
- `text-slate-300` on `bg-slate-950` ✅

### Screen Reader Support

1. **Semantic HTML**
   ```jsx
   <nav>  // Not <div>
   <main>
   <header>
   <footer>
   ```

2. **Label form inputs**
   ```jsx
   <label htmlFor="email">Email</label>
   <input id="email" />
   ```

3. **Alt text for images**
   ```jsx
   <img src="..." alt="Description" />
   ```

---

## Component Patterns

### Loading States

```jsx
// Button loading
<button className="btn-primary" disabled>
  <Icon className="w-4 h-4 animate-spin" />
  <span>Loading...</span>
</button>

// Spinner
<div className="flex items-center justify-center">
  <Icon className="w-6 h-6 animate-spin text-emerald-400" />
</div>
```

### Empty States

```jsx
<div className="text-center py-8 px-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
  No data available
</div>
```

### Error States

```jsx
<div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl text-rose-200 text-sm">
  Error message here
</div>
```

### Success States

```jsx
<div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-emerald-200 text-sm">
  Success message here
</div>
```

---

## Dark Theme Only

This application uses a **dark-only theme**. There is no light mode implementation.

**Rationale**:
- Optimized for low-light commute viewing
- Reduces eye strain during transit
- Better battery life on OLED screens
- Consistent brand experience

**Future Light Mode** (if needed):
1. Add `darkMode: 'class'` to Tailwind config
2. Create CSS variables for light theme colors
3. Add theme toggle component
4. Duplicate color scales for light variants

---

## Best Practices

### Do's ✅

1. **Use Tailwind utility classes** instead of custom CSS
2. **Use existing color palette** (emerald, slate, amber, rose)
3. **Follow spacing scale** (use `p-4`, `gap-6`, not arbitrary values)
4. **Apply focus rings** to all interactive elements
5. **Use semantic HTML** (nav, main, section, article)
6. **Test keyboard navigation** on all interactive components
7. **Verify color contrast** meets WCAG AA standards
8. **Use component classes** (`btn-primary`, `input`, `card`)
9. **Follow mobile-first** responsive patterns
10. **Add ARIA labels** to icon-only buttons

### Don'ts ❌

1. **Don't use arbitrary values** unless absolutely necessary
2. **Don't add inline styles** (use Tailwind classes)
3. **Don't skip focus states** on interactive elements
4. **Don't use color alone** to convey information
5. **Don't create new color schemes** without documentation
6. **Don't use px values** in custom CSS (use rem)
7. **Don't ignore mobile breakpoints**
8. **Don't duplicate component styles** (extract to reusable classes)
9. **Don't use non-semantic divs** for navigation/sections
10. **Don't forget alt text** on informational images

---

## Code Examples

### Complete Form Example

```jsx
<form className="space-y-4" onSubmit={handleSubmit}>
  <div>
    <label htmlFor="email" className="label">
      Email Address <span className="text-rose-400">*</span>
    </label>
    <input 
      id="email"
      type="email"
      required
      className="input"
      placeholder="you@example.com"
    />
  </div>
  
  <div>
    <label htmlFor="message" className="label">
      Message
    </label>
    <textarea 
      id="message"
      className="textarea"
      rows={4}
      placeholder="Your message..."
    />
  </div>
  
  <div className="flex gap-3">
    <button type="submit" className="btn-primary flex-1">
      Send Message
    </button>
    <button type="button" className="btn-secondary" onClick={onCancel}>
      Cancel
    </button>
  </div>
</form>
```

### Complete Card Example

```jsx
<div className="card">
  <div className="card-header">
    <h3 className="card-title">
      <Icon className="w-4 h-4 text-emerald-400" />
      <span>Card Title</span>
    </h3>
    <span className="badge badge-primary">Active</span>
  </div>
  
  <div className="card-body">
    <p className="text-sm text-slate-300 mb-4">
      Card description goes here.
    </p>
    
    <div className="flex gap-2">
      <button className="btn-primary btn-sm">
        Primary Action
      </button>
      <button className="btn-ghost btn-sm">
        Secondary
      </button>
    </div>
  </div>
</div>
```

---

## Testing Checklist

### Visual Testing

- [ ] Component renders correctly on mobile (375px)
- [ ] Component renders correctly on tablet (768px)
- [ ] Component renders correctly on desktop (1280px)
- [ ] Text is readable at all sizes
- [ ] Spacing feels consistent
- [ ] Colors match design system

### Accessibility Testing

- [ ] All interactive elements keyboard accessible
- [ ] Focus states clearly visible
- [ ] Screen reader announces content correctly
- [ ] Color contrast meets WCAG AA
- [ ] ARIA attributes correct
- [ ] Forms have proper labels

### Functional Testing

- [ ] Buttons trigger expected actions
- [ ] Forms submit correctly
- [ ] Validation messages appear
- [ ] Loading states display
- [ ] Error states render
- [ ] Success messages show

---

## Summary

✅ **Typography**: Complete system with responsive scales  
✅ **Colors**: Full palette with semantic meanings  
✅ **Spacing**: Consistent scale across all components  
✅ **Borders**: Standardized radius system  
✅ **Buttons**: 4 variants with sizes and states  
✅ **Forms**: Complete input/select/textarea styling  
✅ **Focus States**: Accessible focus rings on all elements  
✅ **Responsive**: Mobile-first breakpoints documented  
✅ **Accessible**: WCAG AA compliant patterns  
✅ **Dark Theme**: Optimized for low-light viewing  

**Status**: ✅ **Design Foundation Complete**

---

**Implemented By**: Xcaliber (Frontend Lead)  
**Date**: September 21, 2026  
**Branch**: `day-01-foundationXcaliber`
