const CACHE_NAME = 'mesh-monitor-v9';
const STATIC_CACHE_NAME = 'mesh-monitor-static-v9';
const RSC_CACHE_NAME = 'mesh-monitor-rsc-v9';

const CURRENT_CACHES = [CACHE_NAME, STATIC_CACHE_NAME, RSC_CACHE_NAME];

const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

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

  // 1. NextAuth Session Handler (Network-First with Cache Fallback)
  if (url.pathname === '/api/auth/session') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedSession = await cache.match(event.request);
          if (cachedSession) return cachedSession;
          return new Response(JSON.stringify({ user: null, expires: null }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        })
    );
    return;
  }

  // 2. Cleaning Photo Media API (Cache-First with Network Fallback)
  if (url.pathname.startsWith('/api/cleaning/photo/')) {
    event.respondWith(
      caches.open(STATIC_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
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

  // 3. React Server Components (RSC) requests (Network-First with Cache Fallback)
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
            const clone = networkResponse.clone();
            caches.open(RSC_CACHE_NAME).then((cache) => cache.put(rscCacheKey, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(RSC_CACHE_NAME);
          const cachedRsc = await cache.match(rscCacheKey);
          if (cachedRsc) {
            return cachedRsc;
          }
          // Return 503 so client-side router falls back to hard navigation (event.request.mode === 'navigate')
          return new Response('RSC offline fallback', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
    );
    return;
  }

  // 4. HTML Page Navigation (Full Page Reloads, Deep Links, Start URL)
  // Network-First with Fallback to Cached Page, App Shell, or Offline HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
              cache.put(url.pathname, networkResponse.clone());
              if (url.pathname.includes('/map') || url.pathname.includes('/dashboard')) {
                cache.put('/__offline_shell__', networkResponse.clone());
              }
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);

          // 1. Try exact requested URL or pathname
          const cachedPage = (await cache.match(event.request)) || (await cache.match(url.pathname));
          if (cachedPage) return cachedPage;

          // 2. If navigating to root "/" or start_url while offline:
          if (url.pathname === '/' || url.pathname === '/pt-BR' || url.pathname === '/en') {
            const mapPage = await cache.match('/pt-BR/map');
            if (mapPage) return mapPage;
            const dashPage = await cache.match('/pt-BR/dashboard');
            if (dashPage) return dashPage;
            const shell = await cache.match('/__offline_shell__');
            if (shell) return shell;
            const loginPage = await cache.match('/pt-BR/login');
            if (loginPage) return loginPage;
          }

          // 3. Fallback to generic cached app shell
          const shell = await cache.match('/__offline_shell__');
          if (shell) return shell;

          // 4. Fallback to pre-cached offline.html
          const staticCache = await caches.open(STATIC_CACHE_NAME);
          const offlinePage = await staticCache.match('/offline.html');
          if (offlinePage) return offlinePage;

          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mesh Monitor - Offline</title></head><body style="background:#0f172a;color:white;font-family:sans-serif;padding:2rem;text-align:center;"><h2>Offline</h2><p>Página indisponível sem conexão.</p><a href="/pt-BR/map" style="color:#60a5fa;">Ir para o Mapa</a></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 5. Next.js Static Assets (JS chunks, CSS stylesheets, fonts, media)
  // Network-First (with instant cache fallback when offline)
  // This guarantees zero hydration mismatches while online, and full offline functionality!
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const cached = await cache.match(event.request);
          if (cached) return cached;
          return new Response('Asset unavailable offline', { status: 408 });
        })
    );
    return;
  }

  // 6. Static Uploads, Icons, Images, SVGs
  // Cache-First with Network Fallback
  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => new Response('Asset not found', { status: 404 }));
    })
  );
});
