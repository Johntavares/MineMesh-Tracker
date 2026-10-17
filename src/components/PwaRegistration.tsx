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

        // Actively cache map page & static assets directly into CacheStorage
        if (navigator.onLine && 'caches' in window) {
          const lang = window.location.pathname.split('/')[1] || 'pt-BR';
          setTimeout(async () => {
            try {
              const mapUrl = `/${lang}/map`;
              const response = await fetch(mapUrl, {
                credentials: 'same-origin',
                headers: { Accept: 'text/html' },
              });

              if (response.ok) {
                const text = await response.text();
                // Store cleaned HTML in CacheStorage
                const appCache = await caches.open('mesh-monitor-v14');
                const htmlResponse = new Response(text, {
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                  status: 200,
                });
                await appCache.put(mapUrl, htmlResponse.clone());
                await appCache.put('/pt-BR/map', htmlResponse.clone());
                await appCache.put('/__offline_shell__', htmlResponse.clone());

                // Find all static assets referenced in HTML and cache them
                const staticCache = await caches.open('mesh-monitor-static-v14');
                const matches = text.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g);
                for (const match of matches) {
                  const assetUrl = match[1];
                  const has = await staticCache.match(assetUrl, { ignoreSearch: true });
                  if (!has) {
                    fetch(assetUrl)
                      .then((r) => {
                        if (r.ok) staticCache.put(assetUrl, r);
                      })
                      .catch(() => {});
                  }
                }
              }
            } catch (warmErr) {
              console.warn('[PWA] Pre-warming notice:', warmErr);
            }
          }, 1500);
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
