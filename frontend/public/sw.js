/**
 * Service Worker - Smart Student Commute Companion
 * 
 * Basic PWA service worker with safe caching strategy.
 * Caches static assets only. Does NOT cache:
 * - API responses (private user data)
 * - Dynamic content
 * - Authentication data
 * 
 * Cache Strategy: Cache-first for static assets, Network-only for dynamic content
 */

const CACHE_NAME = 'sscc-v1';
const STATIC_CACHE_NAME = 'sscc-static-v1';

// Assets to cache on install (critical static assets only)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
  // Vite bundles are cache-busted, so we don't pre-cache them
  // They'll be cached on first load via fetch event
];

// Minimal offline fallback for first-visit-while-offline navigations.
// Keeps the same visual language as the app shell (dark, system fonts).
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#10b981">
<title>Offline — Smart Student Commute</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#020617; color:#e2e8f0; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; padding:1.5rem; }
  main { max-width:26rem; text-align:center; }
  h1 { font-size:1.25rem; color:#fff; margin:0 0 .5rem; }
  p { font-size:.9rem; color:#94a3b8; line-height:1.6; margin:0 0 1.25rem; }
  button { background:#10b981; color:#020617; border:0; border-radius:.75rem; padding:.65rem 1.4rem;
           font-size:.9rem; font-weight:700; cursor:pointer; }
  button:focus-visible { outline:3px solid #34d399; outline-offset:2px; }
</style>
</head>
<body>
<main>
  <h1>You&rsquo;re offline</h1>
  <p>This page isn&rsquo;t cached yet and there&rsquo;s no connection. Reconnect and try again — the app shell will load from cache once it&rsquo;s been visited online.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;

// Assets that should NEVER be cached
const EXCLUDED_PATHS = [
  '/api/',           // All API calls
  '/socket.io/',     // WebSocket connections
  'chrome-extension' // Browser extensions
];

/**
 * Install Event - Cache critical static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old caches that don't match current version
              return cacheName.startsWith('sscc-') && 
                     cacheName !== STATIC_CACHE_NAME &&
                     cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim(); // Take control immediately
      })
  );
});

/**
 * Fetch Event - Serve from cache for static assets, network for dynamic content
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip caching for excluded paths (API calls, WebSockets, etc.)
  if (EXCLUDED_PATHS.some(path => url.pathname.startsWith(path))) {
    return; // Let browser handle these normally
  }
  
  // Skip caching for non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip caching for chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // If we have a cached response, return it
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cachedResponse;
        }
        
        // Otherwise, fetch from network
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful responses for same-origin requests
            if (networkResponse.ok && url.origin === self.location.origin) {
              // Cache static assets (JS, CSS, fonts, images)
              const contentType = networkResponse.headers.get('content-type') || '';
              const shouldCache = 
                request.destination === 'script' ||
                request.destination === 'style' ||
                request.destination === 'font' ||
                request.destination === 'image' ||
                contentType.includes('javascript') ||
                contentType.includes('css') ||
                contentType.includes('font');
              
              if (shouldCache) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    console.log('[SW] Caching new resource:', url.pathname);
                    cache.put(request, responseToCache);
                  })
                  .catch((error) => {
                    console.warn('[SW] Failed to cache resource:', error);
                  });
              }
            }
            
            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            
            // For navigation requests, return cached index.html if available
            if (request.destination === 'document' || request.mode === 'navigate') {
              return caches.match('/index.html')
                .then((cachedIndex) => {
                  if (cachedIndex) {
                    console.log('[SW] Serving cached index.html as fallback');
                    return cachedIndex;
                  }
                  // No shell cached yet (first visit was offline) — serve a
                  // clear offline page instead of a raw browser error.
                  return new Response(OFFLINE_FALLBACK_HTML, {
                    status: 503,
                    statusText: 'Offline',
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                  });
                });
            }
            
            throw error;
          });
      })
  );
});

/**
 * Message Event - Handle messages from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    console.log('[SW] Received CACHE_URLS message');
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urls))
      .then(() => {
        event.ports[0].postMessage({ success: true });
      })
      .catch((error) => {
        console.error('[SW] Failed to cache URLs:', error);
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }
});

console.log('[SW] Service worker script loaded');
