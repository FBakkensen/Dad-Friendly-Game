/* global self, caches, fetch, URL */
// App-shell service worker. Online it always goes to the network first, so a
// new deploy is picked up on the next load; the cache is only an offline
// fallback. Hashed /assets/ files never change, so they may come from cache.
// Cross-origin traffic (Firestore, Google sign-in) and Firebase's reserved
// /__/ paths are never touched.
const CACHE = "dad-mine-shell-v1";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/icons/icon-192.png",
];
const MAX_ASSETS = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/__/"))
    return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
    await trimAssets(cache);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (
      response.ok &&
      (request.mode === "navigate" ||
        SHELL.includes(new URL(request.url).pathname))
    ) {
      const cache = await caches.open(CACHE);
      await cache.put(
        request.mode === "navigate" ? "/" : request,
        response.clone(),
      );
    }
    return response;
  } catch (error) {
    const cached = await caches.match(
      request.mode === "navigate" ? "/" : request,
    );
    if (cached) return cached;
    throw error;
  }
}

async function trimAssets(cache) {
  const assets = (await cache.keys()).filter((req) =>
    new URL(req.url).pathname.startsWith("/assets/"),
  );
  for (const old of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) {
    await cache.delete(old);
  }
}
