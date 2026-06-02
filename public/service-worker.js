const CACHE_NAME = "percorsi-lavoro-v23";
const STATIC_ASSETS = [
  "/?v=20260602-11",
  "/index.html?v=20260602-11",
  "/styles.css?v=20260602-11",
  "/cache-fix.css?v=20260602-11",
  "/order-feature.css?v=20260602-11",
  "/map-feature.css?v=20260602-11",
  "/startup-guard.js?v=20260602-11",
  "/map-enhancer.js?v=20260602-11",
  "/order-enhancer.js?v=20260602-11",
  "/route-actions-enhancer.js?v=20260602-11",
  "/contact-tools.js?v=20260602-11",
  "/archive-filter-lite.js?v=20260602-11",
  "/seed-addresses.json?v=20260602-11",
  "/app.js?v=20260602-11",
  "/manifest.webmanifest?v=20260602-11",
  "/icons/icon-180.svg",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (event.request.method === "GET" && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});