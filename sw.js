const V = 'hn-v1';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 先用快取（離線可用），同時背景更新
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r.ok && new URL(e.request.url).origin === location.origin) {
          const cp = r.clone();
          caches.open(V).then(c => c.put(e.request, cp));
        }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
