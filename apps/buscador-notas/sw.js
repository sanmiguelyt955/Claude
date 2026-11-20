// Service worker: guarda la app para que abra aunque no haya internet.
const CACHE = 'buscar-notas-v1';
const ARCHIVOS = [
  './index.html',
  './manifest.webmanifest',
  './data/notas.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  e.respondWith(
    caches.match(e.request).then(function (en_cache) {
      return en_cache || fetch(e.request);
    })
  );
});
