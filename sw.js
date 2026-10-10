/* D-TECH offline cache.
 * Bump VERSION on every deploy: the byte change is what tells browsers
 * to install the new worker, which then deletes the previous cache.
 * Forgetting this serves stale CSS/JS to returning visitors. */
var VERSION = 'dtech-v44';
var CORE = [
  '/',
  '/assets/bundle.min.css',
  '/assets/dtech-logo-blue.webp',
  '/assets/icon-192.png'
];

// Shown for a page that is not cached while the visitor is offline. Serving the
// home page instead would leave the requested address in the bar over the wrong
// content. Self-contained (no assets), as nothing else may be reachable.
function offlinePage() {
  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>You are offline | D-TECH SIPL</title>' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;' +
    'box-sizing:border-box;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'background:#f8fafc;color:#17324a}main{max-width:420px;text-align:center}' +
    'h1{font-size:24px;margin:0 0 8px}p{margin:0 0 20px;color:#475569}' +
    'a{display:inline-block;padding:10px 18px;border-radius:8px;background:#17324a;color:#fff;' +
    'text-decoration:none;font-weight:600}a:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}' +
    '@media (prefers-color-scheme:dark){body{background:#0f1c2a;color:#e2e8f0}p{color:#94a3b8}' +
    'a{background:#e2e8f0;color:#0f1c2a}}</style></head><body><main>' +
    '<h1>You are offline</h1>' +
    '<p>This page has not been saved on this device. Check your connection and try again.</p>' +
    '<a href="">Try again</a></main></body></html>';
  return new Response(html, {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

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
        return hit || offlinePage();
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
        if (req.mode === 'navigate') return offlinePage();
      });
    }))
  );
});
