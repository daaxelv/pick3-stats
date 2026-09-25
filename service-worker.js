// Service worker for the NJ Pick 3/4 Ghost Combo Engine.
// Pure static-site PWA support: caches the app shell so it opens offline
// and can be added to the home screen, while always fetching the live
// results CSV from the network first (falling back to cache only if the
// network is unavailable) so stats never go stale on purpose.
const CACHE_VERSION = 'ghost-engine-v4-quickdraw-link';
const APP_SHELL = [
  './',
  './index.html',
  './odds.js',
  './recent-history.js',
  './crowd-model.js',
  './feed-status.js',
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
  const isDataCsv = url.pathname.endsWith('/data/nj_numbers_canonical.csv') || url.pathname.endsWith('/data/feed-status.json');

  if (isDataCsv) {
    // Network-first for the results data: freshness matters more than speed.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) throw new Error('Results request failed: '+res.status);
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached=await caches.match(req);
          if(!cached) return Response.error();
          const headers=new Headers(cached.headers);
          headers.set('X-Pick3-Cached','1');
          return new Response(await cached.arrayBuffer(),{status:200,headers});
        })
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
