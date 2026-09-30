/* Serendipity Vintage — service worker: keeps the app usable with no signal.
   App files: network first (so updates show on the next open), falling back to the saved copy.
   Fonts: cache first. Dropbox requests are never touched.
   When you add, rename or remove an app file, update APP_FILES and bump VERSION. */
const VERSION = 'serendipity-v3';
const APP_FILES = [
  'vintage-shop.html', 'css/app.css',
  'js/core.js', 'js/dropbox.js', 'js/speech.js', 'js/camera.js', 'js/pieces.js', 'js/piece.js', 'js/hauls.js', 'js/money.js', 'js/settings.js', 'js/app.js',
  'icons/icon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'manifest.webmanifest',
];
const PAGE = 'vintage-shop.html';
const TIMEOUT_MS = 6000;
self.addEventListener('install', e => { e.waitUntil((async () => {
  const c = await caches.open(VERSION);
  await Promise.all(APP_FILES.map(f => fetch(f, { cache: 'no-cache' }).then(r => r.ok && c.put(f, r)).catch(() => {})));
  await self.skipWaiting();
})()); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
function appKey(url) {
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  let rel = url.pathname.slice(scope.pathname.length);
  if (rel === 'vintage-shop' || rel === '') rel = PAGE;
  return APP_FILES.includes(rel) ? rel : null;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const key = req.mode === 'navigate' && url.origin === location.origin ? PAGE : appKey(url);
  if (key) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const net = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), TIMEOUT_MS))]);
        if (net && net.ok) { c.put(key, net.clone()); return net; }
        throw new Error('bad response');
      } catch (err) {
        return (await c.match(key)) || new Response('Offline — open the app once with a connection first.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(VERSION); const hit = await c.match(req); if (hit) return hit;
      try { const net = await fetch(req); if (net && (net.ok || net.type === 'opaque')) c.put(req, net.clone()); return net; } catch (err) { return Response.error(); }
    })());
  }
});
