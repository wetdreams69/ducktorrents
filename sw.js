const VERSION = '9f89af3'; // This will be replaced by GitHub Actions
const CACHE_NAME = `ducktorrents-${VERSION}`;
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './lib/duckdb-mvp.wasm',
    './lib/duckdb-eh.wasm',
    './lib/duckdb-browser-mvp.worker.js',
    './lib/duckdb-browser-eh.worker.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, update in background
self.addEventListener('fetch', (event) => {
    // Skip non-http/https requests (like chrome-extension://)
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    // For the parquet and CSV files, use stale-while-revalidate strategy
    if (url.pathname.endsWith('.parquet') || url.pathname.endsWith('.csv')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        // Update cache in the background
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => cachedResponse); // Fallback to cache if offline

                    // Return cached version immediately, or wait for network if not cached
                    return cachedResponse || fetchPromise;
                });
            })
        );
    } else {
        // For other assets, try cache first, then network
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});
