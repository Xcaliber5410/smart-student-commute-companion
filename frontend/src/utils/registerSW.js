/**
 * Service Worker Registration
 * 
 * Handles service worker registration with proper error handling and
 * graceful degradation when service workers are unavailable.
 */

/**
 * Register the service worker
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.info('[SW] Service workers are not supported in this browser');
    return null;
  }
  
  // Skip in development mode unless explicitly enabled
  if (import.meta.env.DEV && !import.meta.env.VITE_SW_DEV) {
    console.info('[SW] Service worker disabled in development mode');
    return null;
  }
  
  try {
    // Wait for page to load before registering
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        window.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }
    
    console.log('[SW] Registering service worker...');
    
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none' // Always check for updates
    });
    
    console.log('[SW] Service worker registered successfully:', registration.scope);
    
    // Check for updates on page load
    registration.update().catch(error => {
      console.warn('[SW] Failed to check for updates:', error);
    });
    
    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('[SW] New service worker found, installing...');
      
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[SW] New service worker installed, awaiting activation');
          // Optionally notify user about update
          notifyUpdate(registration);
        }
      });
    });
    
    // Handle controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Service worker controller changed');
      // Optionally reload the page to use new SW
      // window.location.reload();
    });
    
    return registration;
    
  } catch (error) {
    console.error('[SW] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Unregister the service worker (for debugging/testing)
 * @returns {Promise<boolean>}
 */
export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const success = await registration.unregister();
      console.log('[SW] Service worker unregistered:', success);
      return success;
    }
    return false;
  } catch (error) {
    console.error('[SW] Failed to unregister service worker:', error);
    return false;
  }
}

/**
 * Notify user about available update
 * @param {ServiceWorkerRegistration} registration
 */
function notifyUpdate(registration) {
  // For now, just log. In future, show a toast/banner
  console.log('[SW] New version available! Refresh to update.');
  
  // You can dispatch a custom event that the app can listen to
  window.dispatchEvent(new CustomEvent('swUpdateAvailable', {
    detail: { registration }
  }));
}

/**
 * Check if service worker is supported and active
 * @returns {boolean}
 */
export function isServiceWorkerSupported() {
  return 'serviceWorker' in navigator;
}

/**
 * Check if the app is currently controlled by a service worker
 * @returns {boolean}
 */
export function isServiceWorkerActive() {
  return Boolean(navigator.serviceWorker?.controller);
}

/**
 * Get current service worker registration
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function getServiceWorkerRegistration() {
  if (!isServiceWorkerSupported()) {
    return null;
  }
  
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch (error) {
    console.error('[SW] Failed to get registration:', error);
    return null;
  }
}

/**
 * Force service worker to skip waiting and activate immediately
 * @returns {Promise<void>}
 */
export async function skipWaiting() {
  const registration = await getServiceWorkerRegistration();
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}
