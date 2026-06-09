const CACHE_NAME = "percorsi-lavoro-v258";
const STATIC_ASSETS = [
  "/styles.css?v=20260609-829",
  "/app.js?v=20260609-829",
  "/manifest.webmanifest?v=20260609-829",
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

  // index.html: sempre dal server (contiene il tema SSR), mai da cache
  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Tutti gli altri asset: network-first con fallback cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
