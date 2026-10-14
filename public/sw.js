// Offline support: keeps the app shell available with no connection.
// Network-first so a new deploy shows up on the next load; cache is the fallback.
const CACHE = "jjh-shell-v1";
const SHELL = ["./", "index.html", "css/styles.css", "js/app.js", "js/billing.js", "js/store.js",
               "js/firebase-config.js", "manifest.webmanifest", "assets/logo.png", "assets/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  const cacheable = e.request.method === "GET" &&
    (url.origin === location.origin || url.hostname === "www.gstatic.com");
  if (!cacheable) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
