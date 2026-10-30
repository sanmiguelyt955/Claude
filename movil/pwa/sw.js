const CACHE = "panel-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("estado.json")) {
    e.respondWith(fetch(e.request).catch(() => caches.match("estado.json")));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((n) => {
    const copia = n.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copia));
    return n;
  })));
});
