
const CACHE_NAME = 'stockwise-cache-v2';
const DYNAMIC_CACHE = 'stockwise-dynamic-v2';

// Assets to pre-cache immediately
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
  'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js'
];

// Install Event: Cache Static Assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event: Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event: Intelligent Strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Supabase API Requests & Google Gemini API: Network Only (No Caching)
  // We want real-time data for inventory.
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis') || url.hostname.includes('stockwise.art')) {
    return; // Fallback to browser default (Network)
  }

  // 2. Static Assets (JS, CSS, Fonts, Libraries): Stale-While-Revalidate
  // Serve from cache immediately, but update in background.
  if (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    event.request.destination === 'font' ||
    event.request.destination === 'image' ||
    ASSETS_TO_CACHE.includes(url.href)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
             const responseToCache = networkResponse.clone();
             caches.open(DYNAMIC_CACHE).then((cache) => {
               cache.put(event.request, responseToCache);
             });
          }
          return networkResponse;
        }).catch(() => {
           // Network failed, nothing to do if cache missed too
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Navigation (HTML): Network First, Fallback to Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }
});
