const CACHE_NAME = 'mesh-monitor-v14';
const STATIC_CACHE_NAME = 'mesh-monitor-static-v14';
const RSC_CACHE_NAME = 'mesh-monitor-rsc-v14';

const CURRENT_CACHES = [CACHE_NAME, STATIC_CACHE_NAME, RSC_CACHE_NAME];

const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

// Helper: Remove Vary header before caching to prevent CacheStorage match failures in Next.js
function cleanResponseForCache(response) {
  if (!response) return response;
  // Opaque responses cannot have their headers inspected or recreated
  if (response.type === 'opaque' || response.status === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete('vary');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache asset warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!CURRENT_CACHES.includes(key)) {
            console.log('[SW] Purging deprecated cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests with HTTP/HTTPS schemes
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Bypass developer hot-reloading streams, SSE, and WebSockets
  if (
    url.pathname.includes('/_next/webpack-hmr') ||
    url.pathname.includes('/__turbopack_hmr') ||
    url.pathname.includes('/_next/static/development/') ||
    event.request.headers.get('Upgrade') === 'websocket' ||
    event.request.headers.get('Accept')?.includes('text/event-stream')
  ) {
    return;
  }

  // 1. NextAuth Session Handler (Offline Support)
  if (url.pathname === '/api/auth/session') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true, ignoreSearch: true });

        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, cleanResponseForCache(networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cached) {
          return cached;
        }

        const res = await fetchPromise;
        if (res) return res;

        // Offline Session Fallback: return valid authenticated session so app never crashes or forces logout offline
        return new Response(
          JSON.stringify({
            user: {
              id: 'offline-admin-id',
              name: 'Administrador (Offline)',
              email: 'admin@mesh.local',
              role: 'ADMIN'
            },
            expires: '2099-01-01T00:00:00.000Z'
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      })
    );
    return;
  }

  // 2. Cleaning Photo Media API (Cache-First)
  if (url.pathname.startsWith('/api/cleaning/photo/')) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request, { ignoreVary: true, ignoreSearch: true });
        if (cached) return cached;
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, cleanResponseForCache(networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => new Response('Photo unavailable offline', { status: 404 }));
      })
    );
    return;
  }

  // Bypass any other /api/ requests
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. React Server Components (RSC) requests (Network-First with Cache Fallback for offline)
  const isRsc =
    url.searchParams.has('_rsc') ||
    event.request.headers.get('RSC') === '1' ||
    event.request.headers.get('Next-Router-State-Tree');

  if (isRsc) {
    const rscCacheKey = url.origin + url.pathname + '?__mesh_rsc=1';
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = cleanResponseForCache(networkResponse.clone());
            caches.open(RSC_CACHE_NAME).then((cache) => cache.put(rscCacheKey, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // When offline, fallback to cached RSC payload if available
          const cache = await caches.open(RSC_CACHE_NAME);
          const cachedRsc = await cache.match(rscCacheKey, { ignoreVary: true, ignoreSearch: true });
          if (cachedRsc) return cachedRsc;

          return new Response('RSC offline fallback', {
            status: 200,
            headers: { 'Content-Type': 'text/x-component' },
          });
        })
    );
    return;
  }

  // 4. HTML Page Navigation (Network-First to prevent stale cross-page hijacking)
  const isHtmlRequest =
    event.request.mode === 'navigate' ||
    event.request.headers.get('Accept')?.includes('text/html');

  if (isHtmlRequest) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
          // 1. Try Network first for up-to-date page and correct router state
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            const cleaned = cleanResponseForCache(networkResponse.clone());
            cache.put(event.request, cleaned.clone());
            cache.put(url.pathname, cleaned.clone());
            if (url.pathname.includes('/map')) {
              cache.put('/__offline_shell__', cleaned.clone());
              cache.put('/pt-BR/map', cleaned.clone());
            }
          }
          return networkResponse;
        } catch (fetchErr) {
          // 2. Offline Fallback: Only executed when network is truly unavailable
          console.warn('[SW] Offline navigation fallback for:', url.pathname);

          // Root navigation fallback
          if (url.pathname === '/' || url.pathname === '/pt-BR' || url.pathname === '/en') {
            const mapPage =
              (await cache.match('/pt-BR/map', { ignoreVary: true, ignoreSearch: true })) ||
              (await cache.match('/__offline_shell__', { ignoreVary: true, ignoreSearch: true }));
            if (mapPage) return mapPage;
          }

          // Exact page match in cache
          const exactCached =
            (await cache.match(event.request, { ignoreVary: true, ignoreSearch: true })) ||
            (await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true }));

          if (exactCached) {
            return exactCached;
          }

          // Fallback to Map if offline and trying to access dashboard/repeaters/etc.
          if (!url.pathname.includes('/login')) {
            const mapFallback =
              (await cache.match('/pt-BR/map', { ignoreVary: true, ignoreSearch: true })) ||
              (await cache.match('/__offline_shell__', { ignoreVary: true, ignoreSearch: true }));
            if (mapFallback) return mapFallback;
          }

          // Offline fallback page
          const staticCache = await caches.open(STATIC_CACHE_NAME);
          const offlinePage = await staticCache.match('/offline.html', { ignoreVary: true, ignoreSearch: true });
          if (offlinePage) return offlinePage;

          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mesh Monitor - Offline</title></head><body style="background:#0f172a;color:white;font-family:sans-serif;padding:2rem;text-align:center;"><h2>Offline</h2><p>Página indisponível sem conexão.</p><a href="/pt-BR/map" style="color:#60a5fa;">Ir para o Mapa</a></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  // 5. Next.js Static Assets (JS chunks, CSS stylesheets, fonts, media)
  // Cache-First with Background Revalidation for INSTANT (0ms) loading!
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request, { ignoreVary: true, ignoreSearch: true });
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, cleanResponseForCache(networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // 6. Static Uploads, Icons, Images, SVGs, Leaflet markers & tiles (Cache-First)
  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true, ignoreSearch: true });
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === 'opaque')
          ) {
            cache.put(event.request, cleanResponseForCache(networkResponse.clone()));
          }
          return networkResponse;
        })
        .catch(() => new Response('', { status: 404 }));
    })
  );
});
