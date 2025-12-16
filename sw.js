
const CACHE_NAME = 'prism-stockwise-v2-dynamic';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API Requests (Supabase REST) -> Stale-While-Revalidate
  // We cache GET requests to /rest/v1/ so users can see lists even when offline
  if (url.pathname.includes('/rest/v1/') && event.request.method === 'GET') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            // Clone and update cache
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => {
             // Network failed, do nothing (we rely on cache return below)
             // or return a fallback json if needed
          });

          // Return cached response immediately if available, otherwise wait for network
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 2. Static Assets -> Cache First
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((networkResponse) => {
         // Optionally cache new static assets visited
         return networkResponse;
      });
    })
  );
});
