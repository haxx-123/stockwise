
// Basic Service Worker to satisfy PWA installation requirements
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Pass through all requests - no offline caching strategy enforced yet to avoid stale API data
  e.respondWith(fetch(e.request));
});
