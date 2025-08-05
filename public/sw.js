const CACHE_NAME = 'athletic-specimen-cache-v1';
const ASSETS = [
  './index.html',
  './styles.css',
  './manifest.json',
  './app.js',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/supabase.js',
  './vendor/babel.min.js'
];

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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
