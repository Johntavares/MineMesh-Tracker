const CACHE_NAME = 'mesh-monitor-v5';
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  // Do not intercept hot-reloading next.js developer files or server actions
  if (event.request.url.includes('/_next/') || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to update cache (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/').then(res => {
            if (res) return res;
            return new Response(
              '<!DOCTYPE html><html><head><title>Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#1e293b;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;flex-direction:column;"><h2>Voc\u00ea est\u00e1 Offline</h2><p>Verifique sua conex\u00e3o e tente novamente.</p><button onclick="window.location.reload()" style="margin-top:20px;padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:5px;cursor:pointer;">Tentar Novamente</button></body></html>',
              { status: 200, headers: { 'Content-Type': 'text/html' } }
            );
          });
        }
        return new Response('Network error happened', { status: 408, headers: { 'Content-Type': 'text/plain' } });
      });
    })
  );
});
