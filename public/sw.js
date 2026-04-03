const CACHE_VERSION = 'nerve-v1';
const SHELL_ASSETS = ['/', '/m'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Network-first for API calls and WebSocket
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;
  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
