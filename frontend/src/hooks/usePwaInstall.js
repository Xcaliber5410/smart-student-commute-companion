import { useState, useEffect, useCallback } from 'react';

/**
 * usePwaInstall - Captures the browser's install prompt (PWA installability)
 *
 * Listens for `beforeinstallprompt` (Chrome/Edge/Android) and exposes a
 * single `promptInstall()` helper that plays nice with the browser's
 * deferred prompt. Also detects an already-installed standalone app so the
 * UI can stop offering installation.
 *
 * All operations are guarded: browsers that never fire the event simply
 * report `canInstall: false`, and the app never breaks without support.
 *
 * @returns {{canInstall: boolean, isInstalled: boolean, promptInstall: Function}}
 */
export default function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      // Chrome requires preventDefault() to keep the deferred prompt usable
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    // Already running as an installed app?
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      // The deferred prompt can only be used once
      setDeferredPrompt(null);
      return choice?.outcome || 'dismissed';
    } catch {
      // Prompt already consumed or unsupported — degrade silently
      setDeferredPrompt(null);
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt),
    isInstalled,
    promptInstall,
  };
}
