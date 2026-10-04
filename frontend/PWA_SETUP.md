# PWA Foundation - Smart Student Commute Companion

## Overview

The Smart Student Commute Companion now has Progressive Web App (PWA) capabilities, allowing users to install the app on their devices and use it with offline-capable static assets.

## What's Implemented

### ✅ Core PWA Features

1. **Web App Manifest** (`public/manifest.json`)
   - Application name: "Smart Student Commute Companion"
   - Short name: "SSCC"
   - Standalone display mode
   - Theme color: #10b981 (emerald-500)
   - Background color: #020617 (slate-950)
   - Portrait-primary orientation
   - App shortcuts for quick access to Plan and Feed tabs

2. **App Icons** (`public/icons/`)
   - SVG icons in multiple sizes (72x72 to 512x512)
   - Maskable icons for adaptive icon support
   - Favicon included
   - **Note**: SVG icons work in modern browsers. For production, convert to PNG (see conversion guide)

3. **Service Worker** (`public/sw.js`)
   - Safe caching strategy for static assets only
   - Cache-first for JS/CSS/fonts/images
   - Network-only for API calls and dynamic content
   - Automatic cache cleanup on updates
   - Graceful fallback when offline

4. **Service Worker Registration** (`src/utils/registerSW.js`)
   - Auto-registration on app load
   - Update detection and notification
   - Graceful degradation when SW not supported
   - Development mode handling

5. **Enhanced HTML Meta Tags** (`index.html`)
   - PWA manifest link
   - Theme color meta tag
   - Apple touch icon support
   - Open Graph tags for social sharing
   - Improved SEO metadata

## Installation

The app can now be installed on supported devices:

### Desktop (Chrome/Edge)
1. Visit the app URL
2. Look for the install icon in the address bar
3. Click "Install" in the prompt

### Mobile (Android)
1. Open the app in Chrome
2. Tap the menu (⋮)
3. Select "Add to Home Screen"
4. Confirm installation

### Mobile (iOS/Safari)
1. Open the app in Safari
2. Tap the Share button
3. Select "Add to Home Screen"
4. Confirm installation

## Caching Strategy

### What IS Cached
- ✅ HTML pages (index.html)
- ✅ JavaScript bundles
- ✅ CSS stylesheets
- ✅ Fonts (Google Fonts)
- ✅ App icons
- ✅ Static images

### What is NOT Cached
- ❌ API responses (`/api/*`)
- ❌ WebSocket connections (`/socket.io/*`)
- ❌ User authentication data
- ❌ Real-time transit data
- ❌ Location data
- ❌ Form submissions

## Browser Support

### Full PWA Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+ (limited)
- Samsung Internet 14+

### Partial Support (iOS Safari)
- Install to home screen: ✅
- Offline caching: ✅
- Push notifications: ❌ (not yet implemented)
- Background sync: ❌ (not yet implemented)

## Testing PWA Features

### Chrome DevTools
1. Open DevTools (F12)
2. Go to "Application" tab
3. Check:
   - **Manifest**: Verify all fields load correctly
   - **Service Workers**: Ensure SW registers and activates
   - **Cache Storage**: Check cached resources
   - **Lighthouse**: Run PWA audit

### Testing Installation
1. Open app in browser
2. Check for install prompt
3. Install the app
4. Launch from home screen/app launcher
5. Verify standalone mode (no browser UI)

### Testing Offline
1. Open DevTools → Application → Service Workers
2. Check "Offline" mode
3. Refresh the page
4. Verify cached assets load
5. Verify API calls fail gracefully

## Development Workflow

### Service Worker in Development
By default, the service worker is **disabled in development** to avoid caching issues.

To enable it in dev mode:
```bash
# .env.local
VITE_SW_DEV=true
```

### Clearing Service Worker Cache
```javascript
// Open browser console and run:
navigator.serviceWorker.getRegistration().then(reg => reg.unregister());
caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
```

Or use the DevTools:
1. Application → Service Workers → Unregister
2. Application → Cache Storage → Delete all caches

### Force Update Service Worker
```javascript
// In browser console:
navigator.serviceWorker.getRegistration().then(reg => reg.update());
```

## Icon Conversion to PNG

SVG icons are generated and work in modern browsers. For maximum compatibility, convert to PNG:

### Using vite-plugin-pwa (Recommended)

```bash
npm install -D vite-plugin-pwa
```

Update `vite.config.js`:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // Use our custom manifest
      workbox: false, // Use our custom service worker
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      // Auto-generate PNG icons
      iconPaths: {
        favicon: '/icons/icon-512x512.svg',
        apple: '/icons/icon-192x192.svg',
        maskable: '/icons/icon-maskable-512x512.svg'
      }
    })
  ],
  // ... rest of config
});
```

### Manual Conversion
See `docs/icons/convert-to-png.md` for manual conversion options.

## Future PWA Roadmap

These features are NOT yet implemented but planned for future iterations:

### Day 2-3: Enhanced Offline Support
- [ ] Offline mode indicator UI
- [ ] Queue failed API requests for retry
- [ ] Offline fallback pages
- [ ] Smart cache invalidation strategy

### Day 4-5: Background Sync
- [ ] Sync reports when connection restored
- [ ] Background data updates
- [ ] Periodic background sync for transit data

### Day 6-7: Push Notifications
- [ ] Server-side push notification setup
- [ ] User notification preferences
- [ ] Real-time disruption alerts
- [ ] Route delay notifications

### Day 8-9: Advanced Features
- [ ] Share Target API (share routes to app)
- [ ] Install promotion banner
- [ ] Update notification UI
- [ ] App shortcuts customization

### Day 10: Analytics & Monitoring
- [ ] PWA installation tracking
- [ ] Offline usage analytics
- [ ] Cache hit/miss rates
- [ ] Service worker error monitoring

## Troubleshooting

### Manifest Not Loading
- Check browser console for errors
- Verify `/manifest.json` is accessible
- Check MIME type (should be `application/json`)

### Service Worker Not Registering
- Must serve over HTTPS (or localhost)
- Check browser console for registration errors
- Verify `/sw.js` is accessible
- Check for syntax errors in SW file

### Icons Not Appearing
- Verify icon paths in manifest
- Check if icons are publicly accessible
- Try hard refresh (Ctrl+Shift+R)
- Check DevTools → Application → Manifest

### App Not Installable
- Ensure manifest is valid
- Must have at least 192x192 icon
- Must be served over HTTPS
- Some browsers require HTTPS + service worker

### Cache Not Working
- Check if SW is active (DevTools → Application → Service Workers)
- Verify cached resources (DevTools → Application → Cache Storage)
- Check SW fetch event is firing
- Ensure resources are same-origin

## Configuration Files

```
frontend/
├── public/
│   ├── manifest.json          # Web app manifest
│   ├── sw.js                  # Service worker
│   ├── favicon.svg            # Favicon
│   └── icons/                 # App icons
│       ├── icon-*.svg         # Standard icons
│       └── icon-maskable-*.svg # Maskable icons
├── src/
│   └── utils/
│       └── registerSW.js      # SW registration utility
├── scripts/
│   └── generate-icons.js      # Icon generator
└── index.html                 # PWA meta tags
```

## Resources

- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [Workbox (Google's SW library)](https://developers.google.com/web/tools/workbox)

## Notes

- Service worker registration happens **after** React app renders to avoid blocking
- All service worker operations are wrapped in try-catch for safety
- App works perfectly fine even if service worker fails to register
- No user data or API responses are cached for privacy/security
- Cache version (`sscc-v1`) should be bumped when making breaking SW changes

## Questions?

For PWA-specific questions, check:
- Service worker console logs (prefixed with `[SW]`)
- Chrome DevTools Application tab
- Lighthouse PWA audit report
- This documentation file
