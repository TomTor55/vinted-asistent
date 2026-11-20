'use strict';
// Offline režim: appka sa otvorí aj bez signálu (odoslanie počká na pripojenie).
// Pri zmene súborov appky zvýš číslo verzie.
const CACHE = 'vinted-asistent-v3';
const FILES = ['./', 'index.html', 'styles.css', 'config.js', 'ciselniky.js', 'db.js', 'drive.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Najprv sieť (aby sa načítala nová verzia), pri výpadku z cache.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
