// Service worker: guarda la interfaz para que la app abra sin conexión.
// Nunca guarda nada de SoundCloud (/api, /play, /hls, /auth): esas peticiones van siempre a la red.
const CACHE = 'eco-shell-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'local-library.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
];
const NETWORK_ONLY = /^\/(api|play|hls|auth|health)(\/|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || NETWORK_ONLY.test(url.pathname)) return;

  // Interfaz: red primero (para recibir actualizaciones) y caché si no hay conexión.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const hit = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
      if (hit) return hit;
      if (e.request.mode === 'navigate') return cache.match('index.html');
      return Response.error();
    }
  })());
});
