/* global self, caches, fetch, URL, console */
// Service Worker with network-first updates for app code & assets, and Vite dev bypass.
const CACHE_NAME = 'procstore-v18';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/aistudio/ERTVCBuilding_f08d2c46.jpg',
  '/assets/aistudio/images_6692f763.jpg',
  '/assets/aistudio/kenya_coat_of_arms.png',
  '/assets/aistudio/ertvc_crest.png',
  'https://cdn.tailwindcss.com?plugins=typography,forms',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache).catch(err => {
          console.error('Failed to cache initial assets:', err);
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Never intercept or cache Vite dev/HMR modules so code updates apply immediately
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/src/') ||
      url.pathname.startsWith('/@') ||
      url.pathname.startsWith('/node_modules/') ||
      url.searchParams.has('t') ||
      url.searchParams.has('v'))
  ) {
    return;
  }

  // Network-first for all same-origin files (HTML, built JS/CSS, public assets)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate only for immutable third-party CDN assets
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      });
    })
  );
});