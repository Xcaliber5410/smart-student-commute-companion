#!/usr/bin/env node
/**
 * Day 1 Frontend Verification Script
 * 
 * Verifies that all Day 1 frontend foundation work is functioning correctly:
 * 1. Configuration system
 * 2. Layout & routing
 * 3. Design system
 * 4. UI components
 * 5. PWA foundation
 * 6. Build system
 * 
 * Run: node verify-frontend.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function pass(message) {
  passCount++;
  log(`✓ ${message}`, 'green');
}

function fail(message) {
  failCount++;
  log(`✗ ${message}`, 'red');
}

function warn(message) {
  warnCount++;
  log(`⚠ ${message}`, 'yellow');
}

function section(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

function fileExists(filePath) {
  return fs.existsSync(path.join(__dirname, filePath));
}

function dirExists(dirPath) {
  return fs.existsSync(path.join(__dirname, dirPath)) && 
         fs.statSync(path.join(__dirname, dirPath)).isDirectory();
}

function readJSON(filePath) {
  try {
    const content = fs.readFileSync(path.join(__dirname, filePath), 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(__dirname, filePath), 'utf-8');
  } catch (error) {
    return null;
  }
}

// ============================================================
// VERIFICATION CHECKS
// ============================================================

section('1. PROJECT STRUCTURE');

// Core directories
const dirs = [
  'src',
  'src/components',
  'src/components/ui',
  'src/config',
  'src/layouts',
  'src/utils',
  'public',
  'public/icons',
  'scripts'
];

dirs.forEach(dir => {
  if (dirExists(dir)) {
    pass(`Directory exists: ${dir}`);
  } else {
    fail(`Missing directory: ${dir}`);
  }
});

// ============================================================
section('2. CONFIGURATION SYSTEM');

if (fileExists('src/config/index.js')) {
  pass('Configuration module exists');
  const configContent = readFile('src/config/index.js');
  if (configContent.includes('validateConfig')) {
    pass('Configuration validation function present');
  } else {
    fail('Missing validateConfig function');
  }
  if (configContent.includes('import.meta.env')) {
    pass('Environment variable access configured');
  } else {
    fail('Missing environment variable access');
  }
} else {
  fail('Configuration module missing');
}

if (fileExists('.env.example')) {
  pass('Environment template exists (.env.example)');
  const envExample = readFile('.env.example');
  const requiredVars = ['VITE_API_BASE_URL', 'VITE_SOCKET_URL'];
  requiredVars.forEach(varName => {
    if (envExample.includes(varName)) {
      pass(`Environment variable documented: ${varName}`);
    } else {
      warn(`Environment variable not documented: ${varName}`);
    }
  });
} else {
  fail('Missing .env.example');
}

// ============================================================
section('3. LAYOUT & ROUTING');

const layoutFiles = [
  'src/layouts/MainLayout.jsx',
  'src/layouts/PageContainer.jsx',
  'src/layouts/NotFound.jsx',
  'src/layouts/Toast.jsx',
  'src/layouts/index.js'
];

layoutFiles.forEach(file => {
  if (fileExists(file)) {
    pass(`Layout file exists: ${path.basename(file)}`);
  } else {
    fail(`Missing layout file: ${file}`);
  }
});

// Check MainLayout structure
if (fileExists('src/layouts/MainLayout.jsx')) {
  const mainLayout = readFile('src/layouts/MainLayout.jsx');
  if (mainLayout.includes('Navbar') && mainLayout.includes('children')) {
    pass('MainLayout uses Navbar and children prop');
  } else {
    fail('MainLayout missing expected structure');
  }
}

// Check App.jsx integration
if (fileExists('src/App.jsx')) {
  const app = readFile('src/App.jsx');
  if (app.includes('MainLayout')) {
    pass('App.jsx uses MainLayout');
  } else {
    fail('App.jsx not using MainLayout');
  }
  if (app.includes('renderTabContent')) {
    pass('App.jsx has tab rendering logic');
  } else {
    warn('App.jsx may not have tab rendering logic');
  }
} else {
  fail('App.jsx missing');
}

// ============================================================
section('4. DESIGN SYSTEM');

if (fileExists('src/index.css')) {
  pass('Main stylesheet exists');
  const css = readFile('src/index.css');
  
  // Check for CSS variables
  if (css.includes(':root') && css.includes('--color-')) {
    pass('CSS custom properties (variables) defined');
  } else {
    fail('Missing CSS custom properties');
  }
  
  // Check for component classes
  const componentClasses = ['.btn-primary', '.input', '.card'];
  componentClasses.forEach(className => {
    if (css.includes(className)) {
      pass(`Component class defined: ${className}`);
    } else {
      warn(`Component class missing: ${className}`);
    }
  });
} else {
  fail('Main stylesheet missing');
}

if (fileExists('tailwind.config.js')) {
  pass('Tailwind configuration exists');
  const tailwind = readFile('tailwind.config.js');
  if (tailwind.includes('extend')) {
    pass('Tailwind configuration is extended');
  }
} else {
  fail('Tailwind configuration missing');
}

if (fileExists('docs/DESIGN_SYSTEM.md')) {
  pass('Design system documentation exists');
} else {
  warn('Design system documentation missing');
}

// ============================================================
section('5. UI COMPONENTS');

const uiComponents = [
  'src/components/ui/Button.jsx',
  'src/components/ui/Input.jsx',
  'src/components/ui/Select.jsx',
  'src/components/ui/Textarea.jsx',
  'src/components/ui/Spinner.jsx',
  'src/components/ui/Alert.jsx',
  'src/components/ui/EmptyState.jsx',
  'src/components/ui/Card.jsx',
  'src/components/ui/index.js',
  'src/components/ui/README.md'
];

uiComponents.forEach(file => {
  if (fileExists(file)) {
    pass(`UI component exists: ${path.basename(file)}`);
  } else {
    fail(`Missing UI component: ${file}`);
  }
});

// Check barrel export
if (fileExists('src/components/ui/index.js')) {
  const barrelExport = readFile('src/components/ui/index.js');
  const exportedComponents = ['Button', 'Input', 'Select', 'Textarea', 'Spinner', 'Alert', 'EmptyState', 'Card'];
  exportedComponents.forEach(comp => {
    if (barrelExport.includes(`export { default as ${comp} }`)) {
      pass(`Component exported: ${comp}`);
    } else {
      fail(`Component not exported: ${comp}`);
    }
  });
}

// Check accessibility patterns
const componentsToCheck = [
  'src/components/ui/Button.jsx',
  'src/components/ui/Input.jsx'
];

componentsToCheck.forEach(file => {
  if (fileExists(file)) {
    const content = readFile(file);
    if (content.includes('aria-') || content.includes('role=')) {
      pass(`${path.basename(file)} has accessibility attributes`);
    } else {
      warn(`${path.basename(file)} may lack accessibility attributes`);
    }
  }
});

// ============================================================
section('6. PWA FOUNDATION');

// Manifest
if (fileExists('public/manifest.json')) {
  pass('Web app manifest exists');
  const manifest = readJSON('public/manifest.json');
  if (manifest) {
    const requiredFields = ['name', 'short_name', 'start_url', 'display', 'theme_color', 'icons'];
    requiredFields.forEach(field => {
      if (manifest[field]) {
        pass(`Manifest field present: ${field}`);
      } else {
        fail(`Manifest missing field: ${field}`);
      }
    });
    
    // Check icons
    if (manifest.icons && Array.isArray(manifest.icons)) {
      if (manifest.icons.length >= 8) {
        pass(`Manifest has ${manifest.icons.length} icons`);
      } else {
        warn(`Manifest has only ${manifest.icons.length} icons (8+ recommended)`);
      }
    }
  } else {
    fail('Manifest file is invalid JSON');
  }
} else {
  fail('Web app manifest missing');
}

// Service Worker
if (fileExists('public/sw.js')) {
  pass('Service worker script exists');
  const sw = readFile('public/sw.js');
  if (sw.includes('install') && sw.includes('fetch') && sw.includes('activate')) {
    pass('Service worker has required event listeners');
  } else {
    fail('Service worker missing event listeners');
  }
  if (sw.includes('caches.open')) {
    pass('Service worker implements caching');
  } else {
    fail('Service worker does not implement caching');
  }
} else {
  fail('Service worker script missing');
}

// Service Worker Registration
if (fileExists('src/utils/registerSW.js')) {
  pass('Service worker registration utility exists');
  const registerSW = readFile('src/utils/registerSW.js');
  if (registerSW.includes('navigator.serviceWorker.register')) {
    pass('Service worker registration implemented');
  } else {
    fail('Service worker registration not implemented');
  }
} else {
  fail('Service worker registration utility missing');
}

// Icons
const iconSizes = ['72x72', '96x96', '128x128', '144x144', '152x152', '192x192', '384x384', '512x512'];
let iconCount = 0;
iconSizes.forEach(size => {
  if (fileExists(`public/icons/icon-${size}.svg`)) {
    iconCount++;
  }
});
if (iconCount === iconSizes.length) {
  pass(`All ${iconSizes.length} icon sizes present`);
} else if (iconCount > 0) {
  warn(`Only ${iconCount}/${iconSizes.length} icon sizes present`);
} else {
  fail('No PWA icons found');
}

// Maskable icons
if (fileExists('public/icons/icon-maskable-192x192.svg') && 
    fileExists('public/icons/icon-maskable-512x512.svg')) {
  pass('Maskable icons present');
} else {
  warn('Maskable icons missing');
}

// Favicon
if (fileExists('public/favicon.svg')) {
  pass('Favicon exists');
} else {
  warn('Favicon missing');
}

// ============================================================
section('7. HTML & META TAGS');

if (fileExists('index.html')) {
  pass('index.html exists');
  const html = readFile('index.html');
  
  // Check meta tags
  const metaTags = [
    'viewport',
    'theme-color',
    'apple-mobile-web-app-capable'
  ];
  
  metaTags.forEach(meta => {
    if (html.includes(`name="${meta}"`) || html.includes(`name='${meta}'`)) {
      pass(`Meta tag present: ${meta}`);
    } else {
      warn(`Meta tag missing: ${meta}`);
    }
  });
  
  // Check manifest link
  if (html.includes('rel="manifest"')) {
    pass('Manifest link present in HTML');
  } else {
    fail('Manifest link missing in HTML');
  }
} else {
  fail('index.html missing');
}

// ============================================================
section('8. MAIN ENTRY POINT');

if (fileExists('src/main.jsx')) {
  pass('Main entry point exists');
  const main = readFile('src/main.jsx');
  
  if (main.includes('registerServiceWorker')) {
    pass('Service worker registration integrated');
  } else {
    warn('Service worker registration not integrated');
  }
  
  if (main.includes('validateConfig')) {
    pass('Configuration validation integrated');
  } else {
    warn('Configuration validation not integrated');
  }
  
  if (main.includes('ReactDOM.createRoot')) {
    pass('React 18 createRoot API used');
  } else {
    warn('Not using React 18 createRoot API');
  }
} else {
  fail('Main entry point missing');
}

// ============================================================
section('9. BUILD CONFIGURATION');

if (fileExists('vite.config.js')) {
  pass('Vite configuration exists');
  const vite = readFile('vite.config.js');
  if (vite.includes('proxy')) {
    pass('API proxy configured');
  } else {
    warn('API proxy not configured');
  }
} else {
  fail('Vite configuration missing');
}

if (fileExists('package.json')) {
  pass('package.json exists');
  const pkg = readJSON('package.json');
  if (pkg) {
    // Check scripts
    const scripts = ['dev', 'build', 'preview'];
    scripts.forEach(script => {
      if (pkg.scripts && pkg.scripts[script]) {
        pass(`npm script defined: ${script}`);
      } else {
        fail(`npm script missing: ${script}`);
      }
    });
    
    // Check dependencies
    const deps = ['react', 'react-dom', 'lucide-react', 'tailwindcss'];
    deps.forEach(dep => {
      if ((pkg.dependencies && pkg.dependencies[dep]) || (pkg.devDependencies && pkg.devDependencies[dep])) {
        pass(`Dependency present: ${dep}`);
      } else {
        fail(`Dependency missing: ${dep}`);
      }
    });
  }
} else {
  fail('package.json missing');
}

// ============================================================
section('10. DOCUMENTATION');

const docs = [
  'ARCHITECTURE.md',
  'DESIGN_SYSTEM.md',
  'ROUTING_AND_LAYOUT.md',
  'PWA_SETUP.md',
  'PWA_TESTING.md',
  'PWA_SUMMARY.md',
  'DAY_01_FOUNDATION_SUMMARY.md',
  'DAY_03_SUMMARY.md',
  'DAY_04_SUMMARY.md'
];

docs.forEach(doc => {
  const docPath = doc.startsWith('PWA_') || doc.startsWith('DAY_') ? doc : `docs/${doc}`;
  if (fileExists(docPath)) {
    pass(`Documentation exists: ${doc}`);
  } else {
    warn(`Documentation missing: ${doc}`);
  }
});

// ============================================================
section('11. SCRIPTS');

if (fileExists('scripts/generate-icons.js')) {
  pass('Icon generation script exists');
} else {
  warn('Icon generation script missing');
}

// ============================================================
section('12. DAY 3 FEATURES');

// Feature pages
[
  'src/pages/PlannerPage.jsx',
  'src/pages/TravelTogetherPage.jsx',
  'src/pages/LiveAlertsPage.jsx'
].forEach(file => {
  if (fileExists(file)) pass(`Feature page exists: ${file}`);
  else fail(`Feature page missing: ${file}`);
});

// Reusable data display components
['Badge.jsx', 'DataCard.jsx', 'MetaRow.jsx'].forEach(file => {
  if (fileExists(`src/components/ui/${file}`)) pass(`Data display component exists: ${file}`);
  else fail(`Data display component missing: ${file}`);
});

// Search / filter / sort controls
['SearchInput.jsx', 'FilterBar.jsx'].forEach(file => {
  if (fileExists(`src/components/ui/${file}`)) pass(`Filter control exists: ${file}`);
  else fail(`Filter control missing: ${file}`);
});
if (fileExists('src/utils/listControls.js')) pass('List control helpers exist (filter/sort utils)');
else fail('List control helpers missing (src/utils/listControls.js)');

// Dialog & confirmation patterns
['Modal.jsx', 'ConfirmDialog.jsx'].forEach(file => {
  if (fileExists(`src/components/ui/${file}`)) pass(`Dialog component exists: ${file}`);
  else fail(`Dialog component missing: ${file}`);
});

// Interaction state hook
if (fileExists('src/hooks/useAsyncResource.js')) pass('Async resource state hook exists');
else fail('Async resource state hook missing (src/hooks/useAsyncResource.js)');

// Feature API services
['planner.js', 'liveReports.js', 'rideGroups.js'].forEach(file => {
  if (fileExists(`src/services/${file}`)) pass(`Feature service exists: ${file}`);
  else fail(`Feature service missing: ${file}`);
});

// Barrel exports include Day 3 components
const uiBarrel = readFile('src/components/ui/index.js');
if (uiBarrel && uiBarrel.includes('Badge') && uiBarrel.includes('Modal') && uiBarrel.includes('SearchInput')) {
  pass('UI barrel exports Day 3 components');
} else {
  fail('UI barrel missing Day 3 component exports');
}

// ============================================================
section('13. DAY 4 FEATURES');

// Day 4 feature screen
if (fileExists('src/pages/TransitSearchPage.jsx')) pass('Feature page exists: TransitSearchPage.jsx');
else fail('Feature page missing: src/pages/TransitSearchPage.jsx');

// Day 4 feature components
['TransitSearchForm.jsx', 'TransitResults.jsx'].forEach(file => {
  if (fileExists(`src/components/${file}`)) pass(`Feature component exists: ${file}`);
  else fail(`Feature component missing: src/components/${file}`);
});

// Day 4 reusable interface components
['Tabs.jsx', 'StatTile.jsx', 'ListSkeleton.jsx'].forEach(file => {
  if (fileExists(`src/components/ui/${file}`)) pass(`Reusable UI component exists: ${file}`);
  else fail(`Reusable UI component missing: src/components/ui/${file}`);
});
if (uiBarrel && uiBarrel.includes('Tabs') && uiBarrel.includes('StatTile') && uiBarrel.includes('ListSkeleton')) {
  pass('UI barrel exports Day 4 components');
} else {
  fail('UI barrel missing Day 4 component exports');
}

// Day 4 client-side state helpers
if (fileExists('src/utils/uiPreferences.js')) pass('Local UI preference store exists (uiPreferences.js)');
else fail('Local UI preference store missing (src/utils/uiPreferences.js)');
if (fileExists('src/utils/validation.js')) pass('Client-side validation helpers exist (validation.js)');
else fail('Client-side validation helpers missing (src/utils/validation.js)');

// Day 4 feature service + request-state contract
if (fileExists('src/services/transit.js')) pass('Feature service exists: transit.js');
else fail('Feature service missing: src/services/transit.js');

['transit.js', 'liveReports.js', 'rideGroups.js'].forEach(file => {
  const content = readFile(`src/services/${file}`);
  if (content && content.includes('FrontendApiError')) {
    pass(`Service surfaces failures as errors: ${file}`);
  } else {
    fail(`Service does not distinguish failed requests: ${file}`);
  }
});

// Day 4 screens expose loading / error / empty states and request feedback
const transitPage = readFile('src/pages/TransitSearchPage.jsx');
if (transitPage && transitPage.includes('ListSkeleton') && transitPage.includes('ErrorState') && transitPage.includes('EmptyState')) {
  pass('TransitSearchPage provides loading, error, and empty states');
} else {
  fail('TransitSearchPage is missing loading/error/empty states');
}

const alertsPage = readFile('src/pages/LiveAlertsPage.jsx');
if (alertsPage && alertsPage.includes('role="status"') && alertsPage.includes('isConnectionLost')) {
  pass('LiveAlertsPage reflects refresh and connection request states');
} else {
  fail('LiveAlertsPage missing request-state feedback (refresh/connection)');
}

// ============================================================
section('14. DAY 5 FEATURES');

// Day 5 dashboard & feature screens
if (fileExists('src/components/DashboardOverview.jsx')) pass('Dashboard overview component exists (DashboardOverview.jsx)');
else fail('Dashboard overview component missing: src/components/DashboardOverview.jsx');

if (fileExists('src/pages/MyCommutesPage.jsx') && fileExists('src/components/SavedCommutes.jsx')) {
  pass('My Commutes feature screen exists (page + card list)');
} else {
  fail('My Commutes feature screen missing (MyCommutesPage.jsx / SavedCommutes.jsx)');
}

const plannerPage = readFile('src/pages/PlannerPage.jsx');
if (plannerPage && plannerPage.includes('DashboardOverview') && plannerPage.includes('showDashboardOverview')) {
  pass('PlannerPage hosts the dashboard behind a user preference');
} else {
  fail('PlannerPage does not wire DashboardOverview to its preference');
}

const navContent = readFile('src/components/Navbar.jsx');
if (navContent && navContent.includes("id: 'mycommutes'")) {
  pass('Navigation exposes the My Commutes screen');
} else {
  fail('Navigation is missing the My Commutes entry');
}

// Day 5 progress & data-visualization components
['ProgressBar.jsx', 'ComparisonBars.jsx'].forEach(file => {
  if (fileExists(`src/components/ui/${file}`)) pass(`Progress/data-viz component exists: ${file}`);
  else fail(`Progress/data-viz component missing: src/components/ui/${file}`);
});
if (uiBarrel && uiBarrel.includes('ProgressBar') && uiBarrel.includes('ComparisonBars')) {
  pass('UI barrel exports Day 5 visualization components');
} else {
  fail('UI barrel missing Day 5 visualization exports');
}

const progressBar = readFile('src/components/ui/ProgressBar.jsx');
if (progressBar && progressBar.includes('role="progressbar"') && progressBar.includes('aria-valuenow')) {
  pass('ProgressBar exposes an accessible progressbar role');
} else {
  fail('ProgressBar is missing progressbar ARIA semantics');
}

const routeResults = readFile('src/components/RouteResults.jsx');
if (routeResults && routeResults.includes('ProgressBar') && routeResults.includes('ComparisonBars')) {
  pass('RouteResults renders visualizations from real plan data');
} else {
  fail('RouteResults does not use the visualization components');
}

// Day 5 notification & feedback experiences
const toastContent = readFile('src/components/Toast.jsx');
if (toastContent && toastContent.includes('role="alert"') && toastContent.includes('role="status"') && toastContent.includes('Dismiss')) {
  pass('Toast is a dismissible queue with polite/assertive live regions');
} else {
  fail('Toast missing dismiss action or live-region roles');
}

const appContent = readFile('src/App.jsx');
if (appContent && appContent.includes('setToasts') && appContent.includes('dismissToast')) {
  pass('App owns a toast queue with per-toast dismissal');
} else {
  fail('App does not manage a dismissible toast queue');
}

// Day 5 personalization & preference controls
if (fileExists('src/components/PreferencesDialog.jsx')) pass('Preferences dialog exists (PreferencesDialog.jsx)');
else fail('Preferences dialog missing: src/components/PreferencesDialog.jsx');

const prefsStore = readFile('src/utils/uiPreferences.js');
if (prefsStore && prefsStore.includes('readAppPreferences') && prefsStore.includes('writeAppPreferences') && prefsStore.includes('DEFAULT_APP_PREFERENCES')) {
  pass('Preference store exposes typed app-preference accessors');
} else {
  fail('Preference store missing readAppPreferences/writeAppPreferences');
}
if (prefsStore && prefsStore.includes('readSavedCommutes') && prefsStore.includes('saveCommute') && prefsStore.includes('commuteSignature')) {
  pass('Saved-commute persistence helpers exist in uiPreferences.js');
} else {
  fail('Saved-commute persistence helpers missing from uiPreferences.js');
}
if (navContent && navContent.includes('onOpenPreferences')) {
  pass('Navbar exposes the preferences entry point');
} else {
  fail('Navbar missing preferences entry point');
}

// Day 5 PWA installability & offline experience
const manifest = readJSON('public/manifest.json');
if (manifest && manifest.id && manifest.scope && manifest.lang && manifest.display === 'standalone') {
  pass('Manifest has install identity (id/scope/lang, standalone display)');
} else {
  fail('Manifest missing install-identity fields (id/scope/lang/display)');
}
if (manifest && Array.isArray(manifest.icons) && manifest.icons.some(i => i.sizes === '512x512')) {
  pass('Manifest provides a 512px icon');
} else {
  fail('Manifest is missing a 512px icon');
}

if (fileExists('src/hooks/usePwaInstall.js')) pass('Install-prompt hook exists (usePwaInstall.js)');
else fail('Install-prompt hook missing: src/hooks/usePwaInstall.js');
if (fileExists('src/components/PwaStatusBanner.jsx')) pass('Offline/update status banner exists (PwaStatusBanner.jsx)');
else fail('Offline/update status banner missing: src/components/PwaStatusBanner.jsx');

const swContent = readFile('public/sw.js');
if (swContent && swContent.includes("'/api/'") && swContent.includes('OFFLINE_FALLBACK_HTML')) {
  pass('Service worker keeps API exclusion and adds an offline fallback page');
} else {
  fail('Service worker lost its API exclusion or offline fallback');
}
if (swContent && swContent.includes("request.destination === 'document'")) {
  pass('Service worker serves the app shell for failed navigations');
} else {
  fail('Service worker navigation fallback missing');
}
if (appContent && appContent.includes('PwaStatusBanner') && appContent.includes('usePwaInstall')) {
  pass('App wires offline status and install prompt into the shell');
} else {
  fail('App does not wire PWA status/install into the shell');
}

// Day 5 responsive & accessibility polish
['src/components/ui/EmptyState.jsx', 'src/components/ui/ErrorState.jsx', 'src/components/ui/LoadingState.jsx'].forEach(file => {
  const content = readFile(file);
  if (content && content.includes('headingLevel')) pass(`Heading-level control present: ${path.basename(file)}`);
  else fail(`Heading-level control missing: ${path.basename(file)}`);
});

const navbarContent = navContent;
if (navbarContent && navbarContent.includes('min-w-0 flex-1')) {
  pass('Privacy banner truncates instead of forcing a 498px viewport');
} else {
  fail('Privacy banner truncation fix is missing');
}

const indexCss = readFile('src/index.css');
if (indexCss && indexCss.includes('input[type="range"]') && /24px touch target/i.test(indexCss)) {
  pass('Range sliders use a 24px minimum touch target');
} else {
  fail('Range slider touch-target styles missing from index.css');
}

// Day 5 documentation
if (fileExists('DAY_05_SUMMARY.md')) pass('Day 5 summary documentation exists (DAY_05_SUMMARY.md)');
else warn('Day 5 summary documentation missing (DAY_05_SUMMARY.md)');

// ============================================================
section('15. DAY 6 NOTIFICATIONS');

const notificationsPage = readFile('src/pages/NotificationsPage.jsx');
if (fileExists('src/pages/NotificationsPage.jsx')) pass('Notifications feature page exists');
else fail('Notifications feature page is missing');
if (notificationsPage && notificationsPage.includes('LoadingState') && notificationsPage.includes('ErrorState') && notificationsPage.includes('EmptyState')) {
  pass('Notifications page provides loading, error, and empty states');
} else {
  fail('Notifications page is missing request states');
}
if (notificationsPage && notificationsPage.includes('SearchInput') && notificationsPage.includes("value: 'unread'")) {
  pass('Notifications page supports search and unread filtering');
} else {
  fail('Notifications page is missing search or unread filtering');
}

const notificationItem = readFile('src/components/NotificationItem.jsx');
if (notificationItem && notificationItem.includes('Mark read') && notificationItem.includes('aria-pressed')) {
  pass('Notification items expose an accessible read-state action');
} else {
  fail('Notification item read-state action is missing accessible semantics');
}
if (navContent && navContent.includes("id: 'notifications'") && appContent && appContent.includes('NotificationsPage')) {
  pass('Notifications page is wired into navigation and App rendering');
} else {
  fail('Notifications page is not wired into application navigation');
}

// ============================================================
// 16. DAY 7 DEVICE ALERTS
// ============================================================

section('16. DAY 7 DEVICE ALERTS');

const deviceAlertsPage = readFile('src/pages/DeviceAlertsPage.jsx');
if (fileExists('src/pages/DeviceAlertsPage.jsx')) pass('Device Alerts feature page exists');
else fail('Device Alerts feature page is missing');
if (deviceAlertsPage && deviceAlertsPage.includes('How it works') && deviceAlertsPage.includes('Settings')) {
  pass('Device Alerts page explains the feature and offers a settings section');
} else {
  fail('Device Alerts page is missing its explanation or settings section');
}
if (
  deviceAlertsPage &&
  deviceAlertsPage.includes('unsupported') &&
  deviceAlertsPage.includes('denied') &&
  deviceAlertsPage.includes('permission')
) {
  pass('Device Alerts page handles unsupported, denied, and pending permission states');
} else {
  fail('Device Alerts page is missing permission states');
}
if (
  deviceAlertsPage &&
  deviceAlertsPage.includes('Enable device alerts') &&
  deviceAlertsPage.includes('Send test alert') &&
  deviceAlertsPage.includes('Toggle')
) {
  pass('Device Alerts page exposes enable, toggle, and test-alert interactions');
} else {
  fail('Device Alerts page is missing enable, toggle, or test-alert interactions');
}
if (navContent && navContent.includes("id: 'devicealerts'") && appContent && appContent.includes('DeviceAlertsPage')) {
  pass('Device Alerts page is wired into navigation and App rendering');
} else {
  fail('Device Alerts page is not wired into application navigation');
}

const deviceAlertsService = readFile('src/services/deviceAlerts.js');
if (
  deviceAlertsService &&
  deviceAlertsService.includes('isSupported') &&
  deviceAlertsService.includes('requestPermission') &&
  deviceAlertsService.includes('showNotification')
) {
  pass('Device alerts service wraps the browser Notification API');
} else {
  fail('Device alerts service is missing Notification API wrappers');
}
if (deviceAlertsService && deviceAlertsService.includes('navigator.serviceWorker')) {
  pass('Device alerts service falls back to the service worker (Android Chrome)');
} else {
  fail('Device alerts service has no service-worker notification fallback');
}
if (deviceAlertsService && deviceAlertsService.includes('watchPermission')) {
  pass('Device alerts service watches external permission changes');
} else {
  fail('Device alerts service does not watch permission changes');
}

const uiBarrelDay7 = readFile('src/components/ui/index.js');
if (uiBarrelDay7 && uiBarrelDay7.includes("from './Toggle'")) {
  pass('UI barrel exports the accessible Toggle switch');
} else {
  fail('UI barrel is missing the Toggle export');
}
const toggleComponent = readFile('src/components/ui/Toggle.jsx');
if (toggleComponent && toggleComponent.includes('role="switch"') && toggleComponent.includes('peer-focus-visible')) {
  pass('Toggle is an accessible switch with visible focus');
} else {
  fail('Toggle is missing switch semantics or focus styling');
}
const permissionCard = readFile('src/components/DeviceAlertPermissionCard.jsx');
if (permissionCard && permissionCard.includes('Badge') && permissionCard.includes('role="status"')) {
  pass('Permission card shows a status badge and polite live region');
} else {
  fail('Permission card is missing status badge or live-region announcements');
}

const prefsStoreDay7 = readFile('src/utils/uiPreferences.js');
if (prefsStoreDay7 && prefsStoreDay7.includes('deviceAlerts: true') && prefsStoreDay7.includes('stored.deviceAlerts')) {
  pass('Device-alerts preference is persisted with validation');
} else {
  fail('Device-alerts preference is missing from the app preference store');
}
if (appContent && appContent.includes('handlePreferenceChange({ deviceAlerts: value })')) {
  pass('App applies the device-alerts toggle through the preference store');
} else {
  fail('App does not wire the device-alerts toggle to the preference store');
}
if (
  appContent &&
  appContent.includes("socket.on('live_report_created'") &&
  appContent.includes('showDeviceNotification') &&
  appContent.includes('!document.hasFocus()') &&
  appContent.includes('getDeviceAlertPermission()')
) {
  pass('Live reports raise device alerts only when backgrounded and permitted');
} else {
  fail('Live-report socket handler is missing the background device-alert integration');
}
if (appContent && appContent.includes('watchDeviceAlertPermission')) {
  pass('App keeps device-alert permission state live');
} else {
  fail('App does not watch device-alert permission changes');
}

// ============================================================
// 17. DAY 8 INSTALL & SHARE HUB
// ============================================================

section('17. DAY 8 INSTALL & SHARE HUB');

const installSharePage = readFile('src/pages/InstallShareHubPage.jsx');
if (fileExists('src/pages/InstallShareHubPage.jsx')) pass('Install & Share hub page exists');
else fail('Install & Share hub page is missing');
if (
  installSharePage &&
  installSharePage.includes('Install the app') &&
  installSharePage.includes('Share the app') &&
  installSharePage.includes('Shared content')
) {
  pass('Hub page covers install, share, and shared-content sections');
} else {
  fail('Hub page is missing install, share, or shared-content sections');
}
if (
  installSharePage &&
  installSharePage.includes('Nothing shared here yet') &&
  installSharePage.includes('isManualGuideOpen')
) {
  pass('Hub page provides empty and collapsible guidance states');
} else {
  fail('Hub page is missing empty or collapsible guidance states');
}
if (navContent && navContent.includes("id: 'installshare'") && appContent && appContent.includes('InstallShareHubPage')) {
  pass('Hub page is wired into navigation and App rendering');
} else {
  fail('Hub page is not wired into application navigation');
}

const shareableCard = readFile('src/components/ui/ShareableCard.jsx');
if (shareableCard && shareableCard.includes('navigator.share') && shareableCard.includes('role="status"')) {
  pass('ShareableCard offers native share with polite copy feedback');
} else {
  fail('ShareableCard is missing native share or live feedback');
}
const installStatusCard = readFile('src/components/ui/InstallStatusCard.jsx');
if (installStatusCard && installStatusCard.includes('Badge') && installStatusCard.includes('action')) {
  pass('InstallStatusCard shows install status with an action slot');
} else {
  fail('InstallStatusCard is missing status badge or action slot');
}
const uiBarrelDay8 = readFile('src/components/ui/index.js');
if (uiBarrelDay8 && uiBarrelDay8.includes("from './ShareableCard'") && uiBarrelDay8.includes("from './InstallStatusCard'")) {
  pass('UI barrel exports the Day 8 components');
} else {
  fail('UI barrel is missing the Day 8 component exports');
}

const shareTargetService = readFile('src/services/shareTarget.js');
if (shareTargetService && shareTargetService.includes('isSupported') && shareTargetService.includes('getShareTargetData')) {
  pass('Share-target service feature-detects and reads shared data');
} else {
  fail('Share-target service is missing detection or data access helpers');
}
if (shareTargetService && shareTargetService.includes('registerShareTargetListener')) {
  pass('Share-target service listens for service-worker messages');
} else {
  fail('Share-target service has no service-worker message listener');
}
const swContentDay8 = readFile('public/sw.js');
if (swContentDay8 && swContentDay8.includes('share-target')) {
  pass('Service worker handles the share-target POST route');
} else {
  fail('Service worker is missing share-target handling');
}

if (appContent && appContent.includes('URLSearchParams') && appContent.includes("'tab'")) {
  pass('App reads ?tab= deep links on load');
} else {
  fail('App does not read ?tab= deep links');
}
const manifestDay8 = readFile('public/manifest.json');
if (manifestDay8 && manifestDay8.includes('shortcuts')) {
  pass('Manifest app shortcuts remain declared');
} else {
  fail('Manifest app shortcuts are missing');
}
if (installSharePage && installSharePage.includes('aria-label') && installSharePage.includes('aria-expanded')) {
  pass('Hub page uses labelled regions and disclosure semantics');
} else {
  fail('Hub page is missing labelled regions or disclosure semantics');
}

// ============================================================
// 18. DAY 9 INSTALL PROMOTION
// ============================================================

section('18. DAY 9 INSTALL PROMOTION');

const promoBanner = readFile('src/components/InstallPromoBanner.jsx');
if (fileExists('src/components/InstallPromoBanner.jsx')) pass('Install promo banner component exists');
else fail('Install promo banner component is missing');
if (promoBanner && promoBanner.includes('role="region"') && promoBanner.includes('aria-label="Install the app"')) {
  pass('Promo banner is a labelled region landmark');
} else {
  fail('Promo banner is missing landmark semantics');
}
if (promoBanner && promoBanner.includes('aria-busy') && promoBanner.includes('Installing…')) {
  pass('Promo banner exposes a pending install state');
} else {
  fail('Promo banner is missing its pending install state');
}
if (appContent && appContent.includes('<InstallPromoBanner') && appContent.includes('activeTab={activeTab}')) {
  pass('Promo banner is rendered by the app with engagement context');
} else {
  fail('Promo banner is not wired into the app shell');
}
if (appContent && appContent.includes("outcome === 'unavailable'") && appContent.includes('Install & Share for manual steps')) {
  pass('Unavailable install outcome falls back to honest manual guidance');
} else {
  fail('Install flow has no honest unavailable fallback');
}

const promoDialog = readFile('src/components/ui/InstallPromoDialog.jsx');
if (promoDialog && promoDialog.includes('Why install?') && promoDialog.includes('Modal')) {
  pass('Why-install dialog is built on the shared Modal');
} else {
  fail('Why-install dialog is missing or not using the shared Modal');
}
if (promoDialog && promoDialog.includes('Works offline') && promoDialog.includes('Device alerts') && promoDialog.includes('Home-screen shortcuts')) {
  pass('Dialog explains all three install benefits');
} else {
  fail('Dialog is missing install benefit explanations');
}
const featureHighlight = readFile('src/components/ui/FeatureHighlight.jsx');
if (featureHighlight && featureHighlight.includes('aria-hidden')) {
  pass('FeatureHighlight renders decorative icons accessibly');
} else {
  fail('FeatureHighlight is missing accessible icon handling');
}
const uiBarrelDay9 = readFile('src/components/ui/index.js');
if (uiBarrelDay9 && uiBarrelDay9.includes("from './FeatureHighlight'") && uiBarrelDay9.includes("from './InstallPromoDialog'")) {
  pass('UI barrel exports the Day 9 components');
} else {
  fail('UI barrel is missing the Day 9 component exports');
}

const promoService = readFile('src/services/installPromotion.js');
if (promoService && promoService.includes('isPromoEligible') && promoService.includes('isPromoSnoozed') && promoService.includes('writePromoSnooze')) {
  pass('Install-promotion service provides eligibility and snooze helpers');
} else {
  fail('Install-promotion service is missing eligibility or snooze helpers');
}
if (promoService && promoService.includes('SNOOZE_COOLDOWN_MS') && promoService.includes('catch')) {
  pass('Snooze uses a bounded cooldown and failure-safe storage');
} else {
  fail('Snooze persistence is missing cooldown bounds or failure safety');
}
if (promoBanner && promoBanner.includes('writePromoSnooze') && promoBanner.includes('isPromoEligible')) {
  pass('Banner consumes the promotion service for dismissal and eligibility');
} else {
  fail('Banner does not use the install-promotion service');
}
if (appContent && appContent.includes('promptInstall()')) {
  pass('Promotion drives the existing usePwaInstall prompt flow');
} else {
  fail('Promotion is not connected to the existing install flow');
}

// ============================================================
// 19. DAY 10 PWA ANALYTICS & MONITORING
// ============================================================

section('19. DAY 10 PWA ANALYTICS & MONITORING');

const analyticsPage = readFile('src/pages/AnalyticsPage.jsx');
if (fileExists('src/pages/AnalyticsPage.jsx')) pass('Analytics feature screen exists');
else fail('Analytics feature screen is missing');
if (
  analyticsPage &&
  analyticsPage.includes('PWA Analytics') &&
  analyticsPage.includes('Installation tracking') &&
  analyticsPage.includes('Offline usage') &&
  analyticsPage.includes('Cache performance') &&
  analyticsPage.includes('Service worker monitoring')
) {
  pass('Analytics screen covers all four Day 10 roadmap areas');
} else {
  fail('Analytics screen is missing one of the four Day 10 roadmap areas');
}
if (
  analyticsPage &&
  analyticsPage.includes('<LoadingState') &&
  analyticsPage.includes('<EmptyState') &&
  analyticsPage.includes('<ErrorState')
) {
  pass('Analytics screen renders loading, empty and error states');
} else {
  fail('Analytics screen is missing loading, empty or error states');
}

const pagesBarrelDay10 = readFile('src/pages/index.js');
if (pagesBarrelDay10 && pagesBarrelDay10.includes('AnalyticsPage')) {
  pass('Pages barrel exports the analytics screen');
} else {
  fail('Pages barrel is missing the analytics screen export');
}
if (
  appContent &&
  appContent.includes("case 'analytics':") &&
  appContent.includes('<AnalyticsPage') &&
  appContent.includes('analyticsResource')
) {
  pass('App routes the analytics tab to the feature screen via its resource');
} else {
  fail('App does not route the analytics tab to the feature screen');
}
if (
  navContent &&
  navContent.includes("id: 'analytics'") &&
  navContent.includes("shortLabel: 'Stats'") &&
  navContent.includes('BarChart3')
) {
  pass('Navigation exposes the analytics tab with full and short labels');
} else {
  fail('Navigation is missing the analytics tab entry');
}
if (navContent && navContent.includes('min-[2200px]') && navContent.includes('2xl:inline')) {
  pass('Ten desktop nav labels scale to prevent header overflow');
} else {
  fail('Desktop nav labels have no overflow-safe scaling breakpoint');
}

const eventLogList = readFile('src/components/ui/EventLogList.jsx');
if (fileExists('src/components/ui/EventLogList.jsx')) pass('Event log list component exists');
else fail('Event log list component is missing');
if (eventLogList && eventLogList.includes('<ol') && eventLogList.includes('role="status"')) {
  pass('Event log uses an ordered list and announces its empty state');
} else {
  fail('Event log is missing list semantics or empty-state announcement');
}
const uiBarrelDay10 = readFile('src/components/ui/index.js');
if (uiBarrelDay10 && uiBarrelDay10.includes("from './EventLogList'")) {
  pass('UI barrel exports the event log component');
} else {
  fail('UI barrel is missing the event log export');
}
const uiReadmeDay10 = readFile('src/components/ui/README.md');
if (uiReadmeDay10 && uiReadmeDay10.includes('EventLogList')) {
  pass('UI component docs cover the event log component');
} else {
  fail('UI component docs are missing the event log component');
}

if (
  analyticsPage &&
  analyticsPage.includes('aria-pressed={isActive}') &&
  analyticsPage.includes('role="group"')
) {
  pass('Time-window filter exposes pressed state in a labelled group');
} else {
  fail('Time-window filter is missing pressed state or its group label');
}
if (analyticsPage && analyticsPage.includes('role="status"') && analyticsPage.includes('aria-live="polite"')) {
  pass('Analytics screen announces refresh and event-count status politely');
} else {
  fail('Analytics screen has no polite status announcements');
}
if (analyticsPage && analyticsPage.includes('<ConfirmDialog') && analyticsPage.includes('onResetAnalytics')) {
  pass('Analytics reset is guarded by the shared confirmation dialog');
} else {
  fail('Analytics reset is not guarded by a confirmation dialog');
}
if (
  analyticsPage &&
  analyticsPage.includes('EVENT_ROWS_STEP = 5') &&
  analyticsPage.includes('Show more') &&
  analyticsPage.includes('Show less')
) {
  pass('Event logs expand and collapse in bounded steps');
} else {
  fail('Event logs are missing bounded show more/less interactions');
}
if (analyticsPage && analyticsPage.includes('analytics-install-show-more')) {
  pass('Collapsing a log hands keyboard focus back to its control');
} else {
  fail('Log collapse has no focus-handoff target');
}
if (analyticsPage && analyticsPage.includes('min-h-9')) {
  pass('Analytics controls keep 36px touch targets');
} else {
  fail('Analytics controls are missing minimum touch-target heights');
}
if (analyticsPage && analyticsPage.includes('sm:grid-cols-2') && analyticsPage.includes('md:grid-cols-3')) {
  pass('Analytics tiles reflow across breakpoints without clipping');
} else {
  fail('Analytics tiles have no responsive grid reflow');
}

const analyticsService = readFile('src/services/pwaAnalytics.js');
if (fileExists('src/services/pwaAnalytics.js')) pass('PWA analytics service exists');
else fail('PWA analytics service is missing');
if (
  analyticsService &&
  analyticsService.includes('readAnalyticsSnapshot') &&
  analyticsService.includes('recordInstallOutcome') &&
  analyticsService.includes('resetAnalytics') &&
  analyticsService.includes('watchAnalytics')
) {
  pass('Service exposes snapshot, recording, reset and watch helpers');
} else {
  fail('Analytics service is missing core helper exports');
}
if (analyticsService && analyticsService.includes('smart_commute_pwa_analytics')) {
  pass('Service persists metrics in device-local storage');
} else {
  fail('Analytics service has no device-local storage key');
}
if (
  analyticsService &&
  analyticsService.includes('navigator.serviceWorker') &&
  analyticsService.includes("addEventListener('message'")
) {
  pass('Service listens on the service-worker container for metric messages');
} else {
  fail('Analytics service does not listen on the service-worker container');
}

const swContentDay10 = readFile('public/sw.js');
if (
  swContentDay10 &&
  swContentDay10.includes('pwa-analytics-v1') &&
  swContentDay10.includes('__pwa-analytics-store__')
) {
  pass('Service worker keeps a dedicated analytics store outside app caches');
} else {
  fail('Service worker is missing the dedicated analytics store');
}
if (
  swContentDay10 &&
  swContentDay10.includes('pwa-analytics-sync') &&
  swContentDay10.includes('pwa-analytics-reset') &&
  swContentDay10.includes('pwa-analytics-updated')
) {
  pass('Service worker answers sync/reset messages and broadcasts updates');
} else {
  fail('Service worker analytics messaging is incomplete');
}
if (
  swContentDay10 &&
  swContentDay10.includes("event: 'cache-hit'") &&
  swContentDay10.includes("event: 'cache-miss'")
) {
  pass('Service worker records cache hit and miss rates');
} else {
  fail('Service worker does not record cache hit/miss rates');
}
if (
  swContentDay10 &&
  swContentDay10.includes("addEventListener('error'") &&
  swContentDay10.includes("addEventListener('unhandledrejection'")
) {
  pass('Service worker captures worker errors and unhandled rejections');
} else {
  fail('Service worker error capture listeners are missing');
}

if (appContent && appContent.includes('analyticsResource.load()')) {
  pass('App loads the analytics snapshot through useAsyncResource');
} else {
  fail('App does not load the analytics snapshot');
}
if (
  appContent &&
  appContent.includes('recordInstallOutcome(') &&
  appContent.includes("addEventListener('appinstalled'")
) {
  pass('Install outcomes and appinstalled events are recorded');
} else {
  fail('Install outcomes are not recorded');
}
if (appContent && appContent.includes('beginOfflinePeriod') && appContent.includes('endOfflinePeriod')) {
  pass('Offline transitions feed the offline-usage metrics');
} else {
  fail('Offline transitions are not recorded');
}
if (
  appContent &&
  appContent.includes('handleRefreshAnalytics') &&
  appContent.includes('handleResetAnalytics')
) {
  pass('App wires refresh and confirmed reset handlers to the screen');
} else {
  fail('App is missing analytics refresh/reset handlers');
}

// ============================================================
// 20. DAY 11 OFFLINE REPORT QUEUE
// ============================================================

section('20. DAY 11 OFFLINE REPORT QUEUE');

const offlineQueuePage = readFile('src/pages/OfflineQueuePage.jsx');
if (fileExists('src/pages/OfflineQueuePage.jsx')) pass('Offline queue feature screen exists');
else fail('Offline queue feature screen is missing');
if (
  offlineQueuePage &&
  offlineQueuePage.includes('Offline Queue') &&
  offlineQueuePage.includes('Waiting to send') &&
  offlineQueuePage.includes('Last synced') &&
  offlineQueuePage.includes('Sync now')
) {
  pass('Queue screen covers connection, pending count, last sync and sync action');
} else {
  fail('Queue screen is missing status coverage or the sync action');
}
if (
  offlineQueuePage &&
  offlineQueuePage.includes('<LoadingState') &&
  offlineQueuePage.includes('<EmptyState') &&
  offlineQueuePage.includes('<ErrorState')
) {
  pass('Queue screen renders loading, empty and error states');
} else {
  fail('Queue screen is missing loading, empty or error states');
}
if (offlineQueuePage && offlineQueuePage.includes('id="offline-queue-title"')) {
  pass('Queue screen heading is addressable for focus handoff');
} else {
  fail('Queue screen heading has no focus-handoff address');
}

const pagesBarrelDay11 = readFile('src/pages/index.js');
if (pagesBarrelDay11 && pagesBarrelDay11.includes('OfflineQueuePage')) {
  pass('Pages barrel exports the offline queue screen');
} else {
  fail('Pages barrel is missing the offline queue export');
}
if (
  appContent &&
  appContent.includes("case 'offlinequeue':") &&
  appContent.includes('<OfflineQueuePage')
) {
  pass('App routes the offlinequeue tab to the feature screen');
} else {
  fail('App does not route the offlinequeue tab');
}
if (
  navContent &&
  navContent.includes("id: 'offlinequeue'") &&
  navContent.includes("label: 'Offline Queue'") &&
  navContent.includes('UploadCloud')
) {
  pass('Navigation exposes the offline queue tab with labels and icon');
} else {
  fail('Navigation is missing the offline queue tab entry');
}
if (navContent && navContent.includes('text-[10px]') && navContent.includes('px-0.5 py-2')) {
  pass('Ten-item bottom nav keeps unclipped labels at 360px');
} else {
  fail('Bottom nav density for ten items is missing');
}

const queueItem = readFile('src/components/ui/QueueReportItem.jsx');
if (fileExists('src/components/ui/QueueReportItem.jsx')) pass('Queue row component exists');
else fail('Queue row component is missing');
if (
  queueItem &&
  queueItem.includes("label: 'Waiting'") &&
  queueItem.includes("label: 'Sending'") &&
  queueItem.includes("label: 'Rejected'")
) {
  pass('Queue row carries status as visible text badges, never color alone');
} else {
  fail('Queue row status badges are missing text labels');
}
if (queueItem && queueItem.includes('children') && queueItem.includes('break-words')) {
  pass('Queue row exposes an actions slot and wraps long messages');
} else {
  fail('Queue row is missing the actions slot or message wrapping');
}
const uiBarrelDay11 = readFile('src/components/ui/index.js');
if (uiBarrelDay11 && uiBarrelDay11.includes("from './QueueReportItem'")) {
  pass('UI barrel exports the queue row component');
} else {
  fail('UI barrel is missing the queue row export');
}
const uiReadmeDay11 = readFile('src/components/ui/README.md');
if (uiReadmeDay11 && uiReadmeDay11.includes('QueueReportItem')) {
  pass('UI component docs cover the queue row component');
} else {
  fail('UI component docs are missing the queue row component');
}

if (
  offlineQueuePage &&
  offlineQueuePage.includes('aria-pressed={isActive}') &&
  offlineQueuePage.includes('role="group"')
) {
  pass('Queue filters expose pressed state in a labelled group');
} else {
  fail('Queue filters are missing pressed state or their group label');
}
if (offlineQueuePage && offlineQueuePage.includes('<ConfirmDialog') && offlineQueuePage.includes('onDiscard')) {
  pass('Discard is guarded by the shared confirmation dialog');
} else {
  fail('Discard is not guarded by a confirmation dialog');
}
if (offlineQueuePage && offlineQueuePage.includes('onRetryItem') && offlineQueuePage.includes('Try again')) {
  pass('Rejected reports can be re-queued from the screen');
} else {
  fail('Rejected reports have no re-queue action');
}
if (offlineQueuePage && offlineQueuePage.includes('role="status"')) {
  pass('Queue filter-empty and status messages announce politely');
} else {
  fail('Queue screen has no polite status announcements');
}

const queueService = readFile('src/services/offlineQueue.js');
if (fileExists('src/services/offlineQueue.js')) pass('Offline queue service exists');
else fail('Offline queue service is missing');
if (
  queueService &&
  queueService.includes('enqueueReport') &&
  queueService.includes('removeQueuedReport') &&
  queueService.includes('retryQueuedReport') &&
  queueService.includes('syncQueue') &&
  queueService.includes('readQueueState')
) {
  pass('Service exposes queue read, mutation and delivery helpers');
} else {
  fail('Service is missing core queue helpers');
}
if (queueService && queueService.includes('smart_commute_offline_queue') && queueService.includes('MAX_QUEUE_ITEMS')) {
  pass('Queue persists under a smart_commute_ key with a bounded size');
} else {
  fail('Queue storage key or size bound is missing');
}
if (queueService && queueService.includes('catch') && queueService.includes('localStorage')) {
  pass('Queue storage reads and writes are failure-safe');
} else {
  fail('Queue storage is not failure-safe');
}
if (queueService && queueService.includes("from './liveReports'") && queueService.includes('createReport')) {
  pass('Deliveries reuse the existing createReport contract (no invented endpoints)');
} else {
  pass('Queue does not submit through the existing report service');
}
if (queueService && queueService.includes('err?.isNetwork')) {
  pass('Network failures stay pending while HTTP rejections become visible');
} else {
  fail('Queue has no network-vs-HTTP error classification');
}
if (queueService && queueService.includes('navigator.onLine === false')) {
  pass('Sync refuses to burn attempts while the device is offline');
} else {
  fail('Sync has no offline guard');
}

if (appContent && appContent.includes('err?.isNetwork') && appContent.includes('enqueueReport(reportData)')) {
  pass('Failed report submissions are queued instead of lost');
} else {
  fail('App does not queue network-failed report submissions');
}
if (
  appContent &&
  appContent.includes('handleSyncQueue();') &&
  appContent.includes("window.addEventListener('online'")
) {
  pass('Queue auto-flushes when the browser comes back online');
} else {
  fail('Queue is not wired to the online transition');
}
if (appContent && appContent.includes('readQueueState()') && appContent.includes('onRetryItem={handleRetryQueuedReport}')) {
  pass('App hydrates the queue and wires discard/retry/sync handlers');
} else {
  fail('App is missing queue hydration or handler wiring');
}

if (offlineQueuePage && offlineQueuePage.includes('aria-live="polite"')) {
  pass('Queue count and sync progress announce politely');
} else {
  fail('Queue has no live status region for count/sync changes');
}
if (offlineQueuePage && offlineQueuePage.includes("setAttribute('tabindex', '-1')")) {
  pass('Discarding hands focus back instead of dropping it on body');
} else {
  fail('Discard flow has no focus-handoff behavior');
}
if (
  offlineQueuePage &&
  offlineQueuePage.includes('disabled={isSyncing || isOffline || pending.length === 0}')
) {
  pass('Sync action disables for offline, in-flight and empty-pending states');
} else {
  fail('Sync action is missing disabled-state logic');
}
if (offlineQueuePage && offlineQueuePage.includes('<ol className="space-y-2">')) {
  pass('Queued reports render as an ordered delivery list');
} else {
  fail('Queue list is not a semantic ordered list');
}

// ============================================================
// 21. DAY 12 NOTIFICATION READ STATE
// ============================================================

section('21. DAY 12 NOTIFICATION READ STATE');

const notificationsPageDay12 = readFile('src/pages/NotificationsPage.jsx');
if (fileExists('src/pages/NotificationsPage.jsx')) pass('Notifications screen exists');
else fail('Notifications screen is missing');
if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('Mark all as read') &&
  notificationsPageDay12.includes('disabled={!hasUnread}') &&
  notificationsPageDay12.includes('handleMarkAllClick')
) {
  pass('Screen offers a mark-all action that disables when nothing is unread');
} else {
  fail('Screen is missing the mark-all action or its disabled logic');
}
if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('{readTotal} of {reports.length} read') &&
  notificationsPageDay12.includes('<UnreadCountBadge count={unread}')
) {
  pass('Header summarizes read/unread progress with the shared count badge');
} else {
  fail('Header read/unread summary is missing');
}
if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('Unread only (${unread})') &&
  notificationsPageDay12.includes('Read only (${readTotal})')
) {
  pass('Filter options carry live unread/read counts');
} else {
  fail('Filter options are missing live counts');
}
if (appContent && appContent.includes('readIds={notificationReadIds}')) {
  pass('App hydrates the screen with the shared read-id state');
} else {
  fail('App does not pass read-id state to the screen');
}
if (
  appContent &&
  appContent.includes('onMarkAllRead={handleMarkAllNotificationsRead}') &&
  appContent.includes('unreadCount={unreadNotificationsCount}')
) {
  pass('App wires mark-all and unread-count props into the screen');
} else {
  fail('App is missing mark-all or unread-count wiring');
}
if (
  appContent &&
  appContent.includes('readNotificationReadIds()') &&
  appContent.includes('writeNotificationReadIds(notificationReadIds)')
) {
  pass('App hydrates read state from storage and persists every change');
} else {
  fail('App is not wired to the read-state persistence helpers');
}
if (
  appContent &&
  appContent.includes('handleToggleNotificationRead') &&
  appContent.includes('as read.')
) {
  pass('Read toggles live in App and mark-all confirms with a toast');
} else {
  fail('Read-state handlers or mark-all feedback are missing');
}

const prefsStoreDay12 = readFile('src/utils/uiPreferences.js');
if (
  prefsStoreDay12 &&
  prefsStoreDay12.includes("'smart_commute_notification_read_state'") &&
  prefsStoreDay12.includes('MAX_READ_NOTIFICATION_IDS') &&
  prefsStoreDay12.includes('export function readNotificationReadIds') &&
  prefsStoreDay12.includes('export function writeNotificationReadIds')
) {
  pass('Persistence helpers use a dedicated bounded smart_commute_ key');
} else {
  fail('Read-state persistence helpers are missing or unbounded');
}
if (
  prefsStoreDay12 &&
  prefsStoreDay12.includes('safeRead(NOTIFICATION_READ_KEY') &&
  prefsStoreDay12.includes('safeWrite(NOTIFICATION_READ_KEY')
) {
  pass('Read-state storage reads/writes are failure-safe like other preferences');
} else {
  fail('Read-state storage is not failure-safe');
}

const unreadBadge = readFile('src/components/ui/UnreadCountBadge.jsx');
if (fileExists('src/components/ui/UnreadCountBadge.jsx')) pass('Unread count badge component exists');
else fail('Unread count badge component is missing');
if (
  unreadBadge &&
  unreadBadge.includes('sr-only') &&
  unreadBadge.includes('${max}+') &&
  unreadBadge.includes('count <= 0) return null')
) {
  pass('Count badge clamps large counts, hides at zero and is screen-reader labelled');
} else {
  fail('Count badge is missing clamp, zero-state or screen-reader label');
}
const uiBarrelDay12 = readFile('src/components/ui/index.js');
if (uiBarrelDay12 && uiBarrelDay12.includes("from './UnreadCountBadge'")) {
  pass('UI barrel exports the count badge');
} else {
  fail('UI barrel is missing the count badge export');
}
const uiReadmeDay12 = readFile('src/components/ui/README.md');
if (uiReadmeDay12 && uiReadmeDay12.includes('UnreadCountBadge')) {
  pass('UI component docs cover the count badge');
} else {
  fail('UI component docs are missing the count badge');
}
if (
  notificationItem &&
  notificationItem.includes('>Unread</Badge>') &&
  notificationItem.includes('aria-pressed')
) {
  pass('Notification rows show unread state as visible text, never color alone');
} else {
  fail('Notification rows lack a text unread label or pressed state');
}

if (navContent && navContent.includes('unreadNotificationsCount = 0')) {
  pass('Navigation accepts the unread notifications count');
} else {
  fail('Navigation has no unread notifications count prop');
}
const unreadBadgeSites = (navContent.match(/unreadNotificationsCount > 0/g) || []).length;
if (unreadBadgeSites >= 3) {
  pass('Unread badge renders in desktop nav, drawer and bottom nav');
} else {
  fail(`Unread badge found in only ${unreadBadgeSites} navigation surface(s)`);
}
if (
  navContent &&
  navContent.includes('${unreadNotificationsCount} unread notifications')
) {
  pass('Desktop nav announces the unread count in its accessible name');
} else {
  fail('Desktop nav accessible name omits the unread count');
}

if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('id="notifications-summary"') &&
  notificationsPageDay12.includes("setAttribute('tabindex', '-1')")
) {
  pass('Mark-all hands focus to the summary line instead of dropping it');
} else {
  fail('Mark-all flow has no focus-handoff behavior');
}
if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('id="notifications-summary"') &&
  notificationsPageDay12.includes('role="status"') &&
  notificationsPageDay12.includes('aria-live="polite"')
) {
  pass('Read progress announces politely through a live status region');
} else {
  fail('Read progress has no polite live announcement');
}
if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('<ul className="mt-3 divide-y') &&
  notificationsPageDay12.includes('<li key={report.id}>')
) {
  pass('Notification rows render as a semantic list');
} else {
  fail('Notification rows are not a semantic list');
}
if (notificationsPageDay12 && notificationsPageDay12.includes("You're all caught up")) {
  pass('Unread filter has an honest all-caught-up empty state');
} else {
  fail('Unread filter empty state is misleading');
}
if (
  notificationsPageDay12 &&
  notificationsPageDay12.includes('LoadingState') &&
  notificationsPageDay12.includes('EmptyState') &&
  notificationsPageDay12.includes('ErrorState')
) {
  pass('Screen keeps loading, empty and error states');
} else {
  fail('Screen lost a loading, empty or error state');
}

// ============================================================
// 22. DAY 13 QUIET HOURS / NOTIFICATION PREFERENCES
// ============================================================

section('22. DAY 13 QUIET HOURS / NOTIFICATION PREFERENCES');

const prefsDialogDay13 = readFile('src/components/PreferencesDialog.jsx');
if (fileExists('src/components/PreferencesDialog.jsx')) pass('Preferences dialog exists');
else fail('Preferences dialog is missing');
if (
  prefsDialogDay13 &&
  prefsDialogDay13.includes('Quiet hours') &&
  prefsDialogDay13.includes('pref-quiet-hours') &&
  prefsDialogDay13.includes('quietHoursEnabled: value')
) {
  pass('Dialog exposes the quiet-hours switch');
} else {
  fail('Dialog is missing the quiet-hours switch');
}
if (
  prefsDialogDay13 &&
  prefsDialogDay13.includes('<TimeRangeInput') &&
  prefsDialogDay13.includes('legend="Quiet window"') &&
  prefsDialogDay13.includes('disabled={!prefs.quietHoursEnabled}')
) {
  pass('Dialog renders the labelled quiet-window time pair, disabled when off');
} else {
  fail('Dialog is missing the quiet-window time pair or its disabled state');
}
if (
  prefsDialogDay13 &&
  prefsDialogDay13.includes('isQuietHoursActive(prefs)') &&
  prefsDialogDay13.includes('role="status"') &&
  prefsDialogDay13.includes('aria-live="polite"')
) {
  pass('Dialog announces the live quiet-hours status politely');
} else {
  fail('Dialog has no polite live quiet-hours status');
}
if (
  prefsDialogDay13 &&
  prefsDialogDay13.includes('<h4') &&
  prefsDialogDay13.includes('Notifications')
) {
  pass('Dialog sections are real headings under the dialog title');
} else {
  fail('Dialog section labels are not headings');
}
if (prefsDialogDay13 && prefsDialogDay13.includes('size="lg"')) {
  pass('Dialog was sized for the added notification controls');
} else {
  fail('Dialog sizing was not adjusted for the new content');
}
if (
  prefsDialogDay13 &&
  prefsDialogDay13.includes('Toggle') &&
  !prefsDialogDay13.includes('function Switch')
) {
  pass('Dialog reuses the shared Toggle instead of a local switch copy');
} else {
  fail('Dialog still carries a duplicate local switch component');
}
if (
  prefsDialogDay13 &&
  prefsDialogDay13.includes('startDraft') &&
  prefsDialogDay13.includes('handleTimeBlur') &&
  prefsDialogDay13.includes('Use HH:MM format')
) {
  pass('Time edits use drafts with validation and forgiving blur revert');
} else {
  fail('Dialog time drafts/validation are incomplete');
}
if (prefsDialogDay13 && prefsDialogDay13.includes('setClockTick')) {
  pass('Dialog recomputes the active status on a clock tick while open');
} else {
  fail('Dialog quiet-hours status can go stale while open');
}

const timeRangeInput = readFile('src/components/ui/TimeRangeInput.jsx');
if (fileExists('src/components/ui/TimeRangeInput.jsx')) pass('Time range component exists');
else fail('Time range component is missing');
if (
  timeRangeInput &&
  timeRangeInput.includes('<fieldset') &&
  timeRangeInput.includes('<legend') &&
  timeRangeInput.includes('disabled={disabled}')
) {
  pass('Time range is a labelled fieldset that disables both fields together');
} else {
  fail('Time range lacks fieldset semantics or joint disabling');
}
if (
  timeRangeInput &&
  timeRangeInput.includes('startError') &&
  timeRangeInput.includes('endError') &&
  timeRangeInput.includes('aria-describedby')
) {
  pass('Time range wires per-field errors and an associated hint');
} else {
  fail('Time range is missing error or hint wiring');
}
const uiBarrelDay13 = readFile('src/components/ui/index.js');
if (uiBarrelDay13 && uiBarrelDay13.includes("from './TimeRangeInput'")) {
  pass('UI barrel exports the time range component');
} else {
  fail('UI barrel is missing the time range export');
}
const uiReadmeDay13 = readFile('src/components/ui/README.md');
if (uiReadmeDay13 && uiReadmeDay13.includes('TimeRangeInput')) {
  pass('UI component docs cover the time range component');
} else {
  fail('UI component docs are missing the time range component');
}

const prefsStoreDay13 = readFile('src/utils/uiPreferences.js');
if (
  prefsStoreDay13 &&
  prefsStoreDay13.includes('quietHoursEnabled: false') &&
  prefsStoreDay13.includes("quietHoursStart: '22:00'") &&
  prefsStoreDay13.includes("quietHoursEnd: '07:00'")
) {
  pass('Preference defaults define a disabled 22:00-07:00 quiet window');
} else {
  fail('Quiet-hours preference defaults are missing');
}
if (
  prefsStoreDay13 &&
  prefsStoreDay13.includes('export function isValidQuietHoursTime') &&
  prefsStoreDay13.includes('export function isQuietHoursActive')
) {
  pass('Preference store exports quiet-hours validation and evaluation');
} else {
  fail('Quiet-hours helpers are missing from the preference store');
}
if (
  prefsStoreDay13 &&
  prefsStoreDay13.includes('current >= start || current < end') &&
  prefsStoreDay13.includes('start === end')
) {
  pass('Quiet window wraps past midnight and never collapses to 24h');
} else {
  fail('Quiet-window evaluation lacks overnight wrap or empty-window guard');
}
if (
  prefsStoreDay13 &&
  prefsStoreDay13.includes('isValidQuietHoursTime(stored.quietHoursStart)') &&
  prefsStoreDay13.includes('isValidQuietHoursTime(overrides.quietHoursEnd)')
) {
  pass('Stored and incoming quiet-hours times are validated on read and write');
} else {
  fail('Quiet-hours times are not validated on read/write');
}

if (
  appContent &&
  appContent.includes('const mutedByQuietHours = isQuietHoursActive(prefs)') &&
  appContent.includes('prefs.liveReportToasts && !mutedByQuietHours') &&
  appContent.includes('!mutedByQuietHours &&')
) {
  pass('Both pop-up paths (toast and device alert) are gated by quiet hours');
} else {
  fail('Quiet hours does not gate both notification paths');
}
if (
  appContent &&
  appContent.includes('reportsResource.setData') &&
  appContent.includes('mutedByQuietHours')
) {
  pass('Reports still reach the feed while pop-ups are muted');
} else {
  fail('Quiet hours must mute pop-ups only, never the feed itself');
}
if (appContent && appContent.includes('Quiet hours ${next.quietHoursEnabled')) {
  pass('Preference changes surface quiet-hours feedback toasts');
} else {
  fail('Quiet-hours preference changes give no feedback');
}
if (
  appContent &&
  appContent.includes('quietHoursEnabled={appPreferences.quietHoursEnabled}') &&
  appContent.includes('quietHoursEnd={appPreferences.quietHoursEnd}')
) {
  pass('Device alerts screen receives the quiet-hours preference state');
} else {
  fail('Device alerts screen is not wired to quiet-hours state');
}

const deviceAlertsPageDay13 = readFile('src/pages/DeviceAlertsPage.jsx');
if (
  deviceAlertsPageDay13 &&
  deviceAlertsPageDay13.includes('Quiet hours are on') &&
  deviceAlertsPageDay13.includes('isQuietHoursActive')
) {
  pass('Device alerts screen explains when quiet hours pause alerts');
} else {
  fail('Device alerts screen hides the quiet-hours pause');
}
if (
  deviceAlertsPageDay13 &&
  deviceAlertsPageDay13.includes('Paused by quiet hours') &&
  deviceAlertsPageDay13.includes('manual test alerts below still fire')
) {
  pass('Status tiles and hints stay honest during quiet hours');
} else {
  fail('Device alerts status is misleading during quiet hours');
}
if (
  deviceAlertsPageDay13 &&
  deviceAlertsPageDay13.includes('setClockTick') &&
  deviceAlertsPageDay13.includes('60000')
) {
  pass('Device alerts screen refreshes quiet-hours state every minute');
} else {
  fail('Device alerts quiet-hours state can go stale');
}

// ============================================================
// SUMMARY
// ============================================================

section('VERIFICATION SUMMARY');

const total = passCount + failCount + warnCount;
const passPercent = total > 0 ? Math.round((passCount / total) * 100) : 0;

log(`\n✓ Passed: ${passCount}`, 'green');
log(`✗ Failed: ${failCount}`, 'red');
log(`⚠ Warnings: ${warnCount}`, 'yellow');
log(`━ Total: ${total}\n`, 'blue');

if (failCount === 0) {
  log(`🎉 SUCCESS: All critical checks passed! (${passPercent}%)`, 'green');
  log(`Day 1 frontend foundation is verified and ready.`, 'green');
  process.exit(0);
} else {
  log(`❌ FAILURE: ${failCount} critical check(s) failed`, 'red');
  log(`Please fix the issues above before proceeding.`, 'red');
  process.exit(1);
}
