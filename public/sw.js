const CACHE_NAME = 'athletic-specimen-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/supabase.js',
  './vendor/babel.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
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
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});