// Service worker: guarda la interfaz para que la app abra sin conexión.
// Nunca guarda nada de SoundCloud (/api, /play, /hls, /auth): esas peticiones van siempre a la red.
const CACHE = 'eco-shell-v2';
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

  // Interfaz: responde al instante con la copia guardada y la actualiza por detrás.
  // Así abre igual de rápido con señal débil o sin datos; los cambios llegan en la siguiente apertura.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(e.request)
      .then((res) => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      });
    if (cached) {
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh.catch(() => Response.error());
  })());
});
