// Shell service worker. Must NOT mediate workers/scripts under COEP:
// Safari blocks Worker() loads when a SW calls respondWith() for them,
// even when Cross-Origin-Resource-Policy is present on the network response.
const SHELL_CACHE_PREFIX = "osrs-typescript-shell-";
const CACHE_NAME = `${SHELL_CACHE_PREFIX}v4`;
const SCOPE_URL = new URL(self.registration.scope);
const SHELL_URL = new URL("index.html", SCOPE_URL).toString();
const STATIC_PATH_PREFIX = new URL("static/", SCOPE_URL).pathname;

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll([SHELL_URL]))
            .catch(() => {}),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        // Cache Storage also holds the multi-hundred-megabyte game cache.
                        // A shell upgrade owns only older shell entries and must never
                        // evict cache data belonging to another subsystem.
                        .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_NAME)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const destination = event.request.destination;
    if (
        destination === "worker" ||
        destination === "script" ||
        destination === "sharedworker" ||
        destination === "audioworklet" ||
        destination === "paintworklet"
    ) {
        // Let the browser fetch directly so COEP/CORP checks see real response headers.
        return;
    }

    let url;
    try {
        url = new URL(event.request.url);
    } catch {
        return;
    }

    if (url.origin === self.location.origin && url.pathname.startsWith(STATIC_PATH_PREFIX)) {
        return;
    }

    // Network-first navigations so COOP/COEP headers are not served from a stale shell cache.
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, copy)).catch(() => {});
                    return response;
                })
                .catch(async () => {
                    const cachedShell = await caches.match(SHELL_URL);
                    return (
                        cachedShell ??
                        new Response("August is offline and its application shell is unavailable.", {
                            status: 503,
                            headers: { "Content-Type": "text/plain; charset=utf-8" },
                        })
                    );
                }),
        );
    }
});
