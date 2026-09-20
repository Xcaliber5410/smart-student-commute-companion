# PWA Testing Checklist

Quick reference for testing PWA functionality.

## ✅ Pre-Deployment Checklist

### 1. Manifest Validation
- [ ] Open DevTools → Application → Manifest
- [ ] Verify all fields display correctly
- [ ] Check that icons resolve (no 404 errors)
- [ ] Verify theme color appears in browser UI

### 2. Service Worker Registration
- [ ] Open DevTools → Application → Service Workers
- [ ] Verify SW status shows "activated and running"
- [ ] Check console for `[SW]` registration messages
- [ ] No red errors in console

### 3. Icon Resolution
- [ ] Navigate to `/icons/icon-192x192.svg`
- [ ] Navigate to `/icons/icon-512x512.svg`
- [ ] Navigate to `/favicon.svg`
- [ ] All should load without 404

### 4. Caching Test
```javascript
// In browser console:
caches.keys().then(keys => console.log('Cache keys:', keys));
caches.open('sscc-static-v1').then(cache => cache.keys().then(keys => console.log('Cached URLs:', keys)));
```
Expected: Should show cached static assets

### 5. Install Prompt Test
- [ ] Open app in Chrome (desktop or mobile)
- [ ] Wait for install prompt or check address bar for install icon
- [ ] Click install
- [ ] Verify app launches in standalone mode

### 6. Offline Test
- [ ] Open DevTools → Network tab
- [ ] Select "Offline" from throttling dropdown
- [ ] Refresh the page
- [ ] App should load (cached HTML/JS/CSS)
- [ ] API calls should fail gracefully (no crashes)

## 🔍 Lighthouse Audit

Run Lighthouse PWA audit:

1. Open DevTools → Lighthouse tab
2. Select:
   - Categories: Progressive Web App
   - Device: Mobile or Desktop
3. Click "Analyze page load"
4. Review PWA score (aim for 90+)

### Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Does not register a service worker" | SW not registered | Check console, verify SW registration code |
| "Manifest doesn't have a maskable icon" | No maskable icon in manifest | Already included, check icon paths |
| "Content not sized correctly for viewport" | Missing viewport meta | Already included in index.html |
| "Theme color not set" | Missing theme-color meta | Already included in index.html |

## 🧪 Browser-Specific Tests

### Chrome/Edge Desktop
```bash
1. Open app
2. Look for install icon in address bar (⊕)
3. Click install
4. Launch from Chrome Apps (chrome://apps)
5. Verify standalone window (no browser UI)
```

### Chrome Android
```bash
1. Open app in Chrome
2. Tap "⋮" menu → "Add to Home Screen"
3. Confirm "Install"
4. Launch from home screen
5. Verify standalone mode
```

### Safari iOS
```bash
1. Open app in Safari
2. Tap Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Confirm
5. Launch from home screen
Note: Limited service worker support on iOS
```

### Firefox Desktop
```bash
1. Open app
2. Look for install icon in address bar
3. Click install
4. Launch from browser's apps menu
```

## 📊 Manual Test Cases

### Test Case 1: First Load
```
Steps:
1. Clear all caches and unregister SW
2. Load app for first time
3. Check DevTools → Application → Service Workers

Expected:
- SW registers and activates
- Static assets cached
- App loads normally
```

### Test Case 2: Update Detection
```
Steps:
1. Load app (SW active)
2. Modify sw.js (change CACHE_NAME version)
3. Deploy/refresh
4. Check console

Expected:
- New SW detected
- "New service worker found" message
- Old cache cleaned up
```

### Test Case 3: Offline Navigation
```
Steps:
1. Load app online
2. Enable offline mode (DevTools → Network → Offline)
3. Navigate between tabs
4. Try to refresh page

Expected:
- Cached pages load
- Static assets load
- API calls fail gracefully (no crash)
- Error messages displayed appropriately
```

### Test Case 4: API Request While Offline
```
Steps:
1. Load app
2. Enable offline mode
3. Try to plan a route (API call)

Expected:
- Network error caught
- User-friendly error message
- App doesn't crash
- Can still interact with cached UI
```

### Test Case 5: Install and Launch
```
Steps:
1. Install app from browser
2. Close browser
3. Launch app from home screen/app drawer

Expected:
- App opens in standalone window
- No browser chrome visible
- Splash screen shows (if configured)
- App functions normally
```

## 🛠️ Developer Tools Commands

### Check Service Worker Status
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Registration:', reg);
  console.log('Active:', reg?.active?.state);
  console.log('Waiting:', reg?.waiting?.state);
  console.log('Installing:', reg?.installing?.state);
});
```

### View All Caches
```javascript
caches.keys().then(keys => {
  console.log('Cache Names:', keys);
  keys.forEach(key => {
    caches.open(key).then(cache => {
      cache.keys().then(requests => {
        console.log(`\nCache: ${key}`);
        requests.forEach(req => console.log(`  - ${req.url}`));
      });
    });
  });
});
```

### Clear All Caches
```javascript
caches.keys().then(keys => {
  return Promise.all(keys.map(key => {
    console.log('Deleting cache:', key);
    return caches.delete(key);
  }));
}).then(() => console.log('All caches cleared'));
```

### Unregister Service Worker
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  if (reg) {
    reg.unregister().then(success => {
      console.log('Unregistered:', success);
      window.location.reload();
    });
  }
});
```

### Force Service Worker Update
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  if (reg) {
    reg.update().then(() => console.log('Update check triggered'));
  }
});
```

### Simulate Update Available
```javascript
// Skip waiting and activate new service worker immediately
navigator.serviceWorker.getRegistration().then(reg => {
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
});
```

## 🚨 Common Errors and Solutions

### Error: "Service worker registration failed"
**Cause**: Not served over HTTPS or localhost  
**Solution**: Use HTTPS or localhost for development

### Error: "Failed to fetch manifest"
**Cause**: Manifest path incorrect or MIME type wrong  
**Solution**: Verify `/manifest.json` is accessible and returns `application/json`

### Error: "No matching service worker detected"
**Cause**: SW script has errors or didn't activate  
**Solution**: Check browser console for SW errors, fix syntax

### Error: "The path of the provided scope is not under the max scope"
**Cause**: SW scope misconfiguration  
**Solution**: Ensure SW scope is `/` or valid subdirectory

### Warning: "Icons don't resolve"
**Cause**: Icon paths in manifest are incorrect  
**Solution**: Verify icon files exist at specified paths, check for typos

## 📱 Device Testing Matrix

| Device Type | Browser | Install | SW | Offline | Notes |
|-------------|---------|---------|-----|---------|-------|
| Desktop | Chrome 90+ | ✅ | ✅ | ✅ | Full support |
| Desktop | Firefox 88+ | ✅ | ✅ | ✅ | Full support |
| Desktop | Edge 90+ | ✅ | ✅ | ✅ | Full support |
| Desktop | Safari 14+ | ⚠️ | ⚠️ | ⚠️ | Limited support |
| Android | Chrome | ✅ | ✅ | ✅ | Full support |
| Android | Firefox | ✅ | ✅ | ✅ | Full support |
| Android | Samsung Internet | ✅ | ✅ | ✅ | Full support |
| iOS | Safari 14+ | ✅ | ⚠️ | ⚠️ | Limited SW support |
| iOS | Chrome | ✅ | ⚠️ | ⚠️ | Uses Safari engine |

Legend:
- ✅ Full support
- ⚠️ Partial/limited support
- ❌ Not supported

## 🎯 Success Criteria

Before marking PWA foundation as complete:

- [x] Manifest loads without errors
- [x] All icon sizes accessible
- [x] Service worker registers successfully
- [x] Static assets cache correctly
- [x] API calls excluded from cache
- [x] App installable on Chrome desktop
- [x] App installable on Chrome Android
- [x] Offline fallback works (cached assets)
- [x] App continues to work without SW
- [ ] Lighthouse PWA score 90+ (test after deployment)
- [ ] Test on at least 2 real devices
- [ ] Test offline behavior thoroughly

## 📚 Additional Resources

- [Chrome DevTools PWA Testing](https://developer.chrome.com/docs/devtools/progressive-web-apps/)
- [Lighthouse PWA Audits](https://web.dev/lighthouse-pwa/)
- [PWA Testing Best Practices](https://web.dev/pwa-testing/)
