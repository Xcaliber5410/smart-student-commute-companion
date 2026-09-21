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
      if (pkg.dependencies && pkg.dependencies[dep]) {
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
  'DAY_01_FOUNDATION_SUMMARY.md'
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
