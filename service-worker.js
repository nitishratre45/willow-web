const CACHE_NAME = "criczone-shell-v1";
const SHELL_ASSETS = [
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icon-192.svg",
    "./icon-512.svg"
];
const SHELL_URLS = new Set(
    SHELL_ASSETS.map(path => new URL(path, self.registration.scope).href)
);

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll([...SHELL_URLS]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith("criczone-shell-") && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Only cache the local app shell. Never intercept APIs or external media streams.
self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const requestUrl = new URL(request.url);
    const scopeUrl = new URL(self.registration.scope);
    if (requestUrl.origin !== scopeUrl.origin) return;

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(async () => {
                const cachedPage = await caches.match(
                    new URL("./index.html", self.registration.scope).href
                );
                return cachedPage || Response.error();
            })
        );
        return;
    }

    requestUrl.search = "";
    const cacheUrl = requestUrl.href;
    if (!SHELL_URLS.has(cacheUrl)) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response && response.ok && response.type === "basic") {
                    const copy = response.clone();
                    event.waitUntil(
                        caches.open(CACHE_NAME).then(cache => cache.put(cacheUrl, copy))
                    );
                }
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(cacheUrl);
                return cached || Response.error();
            })
    );
});
