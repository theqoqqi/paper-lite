const CACHE_NAME = "paper-lite-v1";

const PRECACHE_URLS = [
    "./",
    "./index.html",
    "./manifest.json",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_URLS);
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
        }),
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

const isDev = (
    self.location.hostname === "localhost"
    || self.location.hostname === "127.0.0.1"
    || self.location.hostname.startsWith("192.168.")
    || self.location.hostname.startsWith("10.")
    || self.location.hostname.endsWith(".local")
);

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    if (isDev) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request).then((cached) => {
                        if (cached) return cached;
                        if (event.request.mode === "navigate") {
                            return caches.match("./index.html");
                        }
                    });
                }),
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request)
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
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                })
                .catch(() => {
                    if (event.request.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                });
        }),
    );
});
