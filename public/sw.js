const CACHE_NAME = 'eventscanner-v2'; // Incrementa versione per forzare update
const STATIC_CACHE = [
    '/',
    '/crea',
    '/mappa',
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache when offline or for specific API calls
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // Cache-First strategy for events API
    if (event.request.url.includes('/api/events') && event.request.method === 'GET') {
        console.log('[SW] Handling API request with Cache-First:', event.request.url);
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('[SW] Serving from cache:', event.request.url);
                    // Optional: Update cache in background (Stale-While-Revalidate)
                    // fetch(event.request).then(response => {
                    //     if (response.ok) {
                    //         const responseToCache = response.clone();
                    //         caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    //     }
                    // });
                    return cachedResponse;
                }

                return fetch(event.request).then((fetchResponse) => {
                    if (fetchResponse.ok) {
                        console.log('[SW] Fetching and caching API response:', event.request.url);
                        const responseToCache = fetchResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return fetchResponse;
                });
            })
        );
        return;
    }

    // Bypassing cache for other API requests (POST, etc.)
    if (event.request.url.includes('/api/')) {
        console.log('[SW] Bypassing cache for API request:', event.request.url);
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached version or fetch from network
            return response || fetch(event.request).then((fetchResponse) => {
                // Cache successful GET requests (but not API calls - already handled above)
                if (event.request.method === 'GET' && fetchResponse.ok && !event.request.url.includes('/api/')) {
                    const responseToCache = fetchResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return fetchResponse;
            });
        }).catch(() => {
            // Offline fallback
            if (event.request.destination === 'document') {
                return caches.match('/');
            }
        })
    );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data.type === 'CLEAR_CACHE') {
        console.log('[SW] Clearing all caches...');
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        console.log('[SW] Deleting cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
            }).then(() => {
                console.log('[SW] All caches cleared');
                // Notify all clients that cache was cleared
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'CACHE_CLEARED' });
                    });
                });
            })
        );
    }

    if (event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting...');
        self.skipWaiting();
    }
});

// Handle push notifications (future feature)
self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'EventScanner';
    const options = {
        body: data.body || 'Nuovo evento disponibile',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        data: data.url || '/'
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    event.waitUntil(
        clients.openWindow(event.notification.data || '/')
    );
});