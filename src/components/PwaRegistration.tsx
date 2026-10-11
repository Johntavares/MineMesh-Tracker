'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Update when a new version is detected
        registration.update();

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });

        // Pre-fetch map and dashboard HTML if online
        if (navigator.onLine) {
          const lang = window.location.pathname.split('/')[1] || 'pt-BR';
          setTimeout(() => {
            fetch(`/${lang}/map`, {
              credentials: 'same-origin',
              headers: { Accept: 'text/html' },
            }).catch(() => {});
          }, 2000);
        }
      } catch (err) {
        console.error('[PWA] Service Worker registration failed:', err);
      }
    };

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
  }, []);

  return null;
}
