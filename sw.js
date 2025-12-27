const CACHE_VERSION = '1.1.0';
const CACHE_NAME = `ducktorrents-v${CACHE_VERSION}`;
const DATA_CACHE_NAME = `ducktorrents-data-v${CACHE_VERSION}`;

// Static assets to cache on install
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

// CDN resources (cached separately)
const CDN_RESOURCES = [
    'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap',
    'https://fonts.gstatic.com/'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(CACHE_NAME).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),
            // Pre-cache data cache for parquet/csv files
            caches.open(DATA_CACHE_NAME)
        ]).then(() => {
            console.log('[SW] Installation complete');
            // Skip waiting to activate immediately
            return self.skipWaiting();
        }).catch((error) => {
            console.error('[SW] Installation failed:', error);
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker v' + CACHE_VERSION);
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches
                    if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Activation complete, claiming clients');
            // Take control of all clients immediately
            return self.clients.claim();
        })
    );
});

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Strategy 1: Stale-While-Revalidate for data files (Parquet/CSV)
    if (url.pathname.endsWith('.parquet') || url.pathname.endsWith('.csv')) {
        event.respondWith(staleWhileRevalidate(request, DATA_CACHE_NAME));
        return;
    }

    // Strategy 2: Cache-First for WASM and worker files (they don't change often)
    if (url.pathname.endsWith('.wasm') || url.pathname.includes('worker.js')) {
        event.respondWith(cacheFirst(request, CACHE_NAME));
        return;
    }

    // Strategy 3: Network-First for HTML (always get latest)
    if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === './') {
        event.respondWith(networkFirst(request, CACHE_NAME));
        return;
    }

    // Strategy 4: Stale-While-Revalidate for CDN resources
    if (url.origin !== location.origin) {
        event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
        return;
    }

    // Strategy 5: Cache-First for other static assets (CSS, JS, fonts)
    event.respondWith(cacheFirst(request, CACHE_NAME));
});

// Cache Strategy: Stale-While-Revalidate
// Returns cached version immediately, updates cache in background
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    // Fetch from network in background
    const fetchPromise = fetch(request).then((networkResponse) => {
        // Only cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch((error) => {
        console.warn('[SW] Network request failed:', request.url, error);
        return cachedResponse; // Fallback to cache if network fails
    });

    // Return cached version immediately if available, otherwise wait for network
    return cachedResponse || fetchPromise;
}

// Cache Strategy: Cache-First
// Returns cached version if available, otherwise fetches from network
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Fetch failed:', request.url, error);
        
        // Return offline fallback if available
        return new Response('Offline - Please check your connection', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

// Cache Strategy: Network-First
// Tries network first, falls back to cache if offline
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.warn('[SW] Network request failed, using cache:', request.url);
        
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline fallback
        return new Response('Offline - Cached version not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

// Message handler for manual cache updates
self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data.action === 'clearCache') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            }).then(() => {
                console.log('[SW] All caches cleared');
                event.ports[0].postMessage({ success: true });
            })
        );
    }
    
    if (event.data.action === 'getCacheSize') {
        event.waitUntil(
            caches.open(DATA_CACHE_NAME).then((cache) => {
                return cache.keys().then((keys) => {
                    event.ports[0].postMessage({ 
                        cacheSize: keys.length,
                        cacheName: DATA_CACHE_NAME
                    });
                });
            })
        );
    }
});

// Background sync for updating data when back online
self.addEventListener('sync', (event) => {
    if (event.tag === 'update-torrents') {
        event.waitUntil(
            caches.open(DATA_CACHE_NAME).then((cache) => {
                return fetch('./torrents.parquet').then((response) => {
                    if (response && response.status === 200) {
                        return cache.put('./torrents.parquet', response);
                    }
                });
            }).then(() => {
                console.log('[SW] Background sync completed');
            }).catch((error) => {
                console.error('[SW] Background sync failed:', error);
            })
        );
    }
});

// Log current cache status
console.log('[SW] Service Worker loaded, version:', CACHE_VERSION);