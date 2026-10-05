/* D-TECH offline cache.
 * Bump VERSION on every deploy: the byte change is what tells browsers
 * to install the new worker, which then deletes the previous cache.
 * Forgetting this serves stale CSS/JS to returning visitors. */
var VERSION = 'dtech-v41';
var CORE = [
  '/',
  '/assets/bundle.min.css',
  '/assets/dtech-logo-blue.webp',
  '/assets/icon-192.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll(CORE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.indexOf('/_vercel/') === 0) return;
  // Live data (open roles, console records) must never come from the cache.
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/data/') === 0) return;
  event.respondWith(
    // Navigations go network-first so returning visitors always get the
    // newest HTML (which points at the newest assets); offline falls back
    // to cache. Static assets stay cache-first for speed.
    (req.mode === 'navigate' ? fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(VERSION).then(function (cache) {
          cache.put(req, copy);
        });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('/');
      });
    }) : caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(VERSION).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('/');
      });
    }))
  );
});
