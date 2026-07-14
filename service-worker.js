// Service worker for the NJ Pick 3/4 Ghost Combo Engine.
// Pure static-site PWA support: caches the app shell so it opens offline
// and can be added to the home screen, while always fetching the live
// results CSV from the network first (falling back to cache only if the
// network is unavailable) so stats never go stale on purpose.
const CACHE_VERSION = 'ghost-engine-v1';
const APP_SHELL = [
  './',
  './index.html',
  './odds.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isDataCsv = url.pathname.endsWith('/data/nj_numbers_canonical.csv') || url.pathname.endsWith('data/nj_numbers_canonical.csv');

  if (isDataCsv) {
    // Network-first for the results data: freshness matters more than speed.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for the app shell (HTML/JS/icons/manifest): instant load,
  // works offline, refreshed in the background on every visit.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
