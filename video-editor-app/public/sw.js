// Service worker mínimo: hace la app instalable. No cachea medios ni API (siempre red).
const CACHE = 've-shell-v2';
const SHELL = ['/', '/style.css', '/app.js', '/preview.js', '/lib/model.js', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/media/') || url.pathname.startsWith('/exports/')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
