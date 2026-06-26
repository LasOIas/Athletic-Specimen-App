// NF-18 (2026-06-26): SINGLE SOURCE OF TRUTH for the version. app.js registers this worker as
// `/sw.js?v=<APP_VERSION>` (updateViaCache:'none'), so the SW URL already carries the app version and a
// bump activates a new worker. Derive the cache name from that ?v= param instead of a second hand-edited
// const — so APP_VERSION (app.js, ~line 27) is the ONLY place to bump and the cache name can never drift
// (kills the old "forgot to bump SW_VERSION → same cache name → stale precache served" bug).
const SW_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = 'athletic-specimen-cache-' + SW_VERSION;
const ASSETS = [
  '/',
  '/index.html',
  '/checkin.html',
  '/styles.css',
  '/manifest.json',
  '/app.js',
  '/pure.js',
  '/supabase-config.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];
const NETWORK_FIRST_PATHS = new Set(ASSETS);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isShellAsset = isSameOrigin && NETWORK_FIRST_PATHS.has(url.pathname);

  // Prefer network for app shell assets so deploy updates are not hidden by stale cache.
  if (event.request.mode === 'navigate' || isShellAsset) {
    const freshRequest = new Request(event.request, { cache: 'no-store' });
    event.respondWith(
      fetch(freshRequest)
        .then((response) => {
          if (isSameOrigin && response && response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.mode === 'navigate') return caches.match('/index.html');
            return undefined;
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
