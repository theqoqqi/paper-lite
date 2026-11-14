const CACHE_NAME = "paper-lite-v2";

const PRECACHE_URLS = [
    "./",
    "./index.html",
    "./manifest.json",
];

const isDev = (
    self.location.hostname === "localhost"
    || self.location.hostname === "127.0.0.1"
    || self.location.hostname.startsWith("192.168.")
    || self.location.hostname.startsWith("10.")
    || self.location.hostname.endsWith(".local")
);

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            const requests = PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" }));
            return cache.addAll(requests);
        }),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key)),
            );
        }).then(() => self.clients.claim()),
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.endsWith("/sw.js")) return;

    if (isDev || !isAssetRequest(url.pathname)) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    event.respondWith(cacheFirst(event.request));
});

function isAssetRequest(pathname) {
    return /\.(png|jpe?g|webp|gif|svg|ico|mp3|wav|ogg)$/i.test(pathname);
}

function networkFirst(request) {
    const fetchPromise = request.mode === "navigate"
        ? fetch(request.url, { cache: "no-cache" })
        : fetch(new Request(request, { cache: "no-cache" }));

    return fetchPromise
        .then((networkResponse) => {
            if (networkResponse && networkResponse.status >= 500) {
                return matchOfflineCache(request).then((cached) => cached || networkResponse);
            }
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
        })
        .catch(() => matchOfflineCache(request));
}

function cacheFirst(request) {
    return caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
            return cachedResponse;
        }

        return fetch(request)
            .then((networkResponse) => {
                if (
                    !networkResponse ||
                    networkResponse.status !== 200 ||
                    networkResponse.type !== "basic"
                ) {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseToCache);
                });

                return networkResponse;
            })
            .catch(() => matchOfflineCache(request));
    });
}

function matchOfflineCache(request) {
    return caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") {
            return caches.match("./index.html").then((fallback) => fallback || caches.match("./"));
        }
    });
}
