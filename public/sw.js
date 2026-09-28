const CACHE_NAME = 'eventscanner-v5'; // Incrementa versione per forzare update
const SHARE_CACHE_NAME = 'eventscanner-shared-files-v1';
const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STATIC_CACHE = [
    '/',
    '/crea',
    '/mappa',
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png'
];

function getShareRequest(shareId) {
    const url = new URL('/api/share-target', self.location.origin);
    url.searchParams.set('shareId', shareId);
    return new Request(url.toString());
}

async function pruneSharedFiles(cache) {
    const requests = await cache.keys();
    const cutoff = Date.now() - SHARE_MAX_AGE_MS;

    await Promise.all(requests.map(async (request) => {
        const response = await cache.match(request);
        const storedAt = Number(response?.headers.get('X-EventScanner-Shared-At'));
        if (!storedAt || storedAt < cutoff) {
            await cache.delete(request);
        }
    }));
}

async function receiveSharedFile(request) {
    try {
        const formData = await request.formData();
        const sharedFile = formData.get('image') || formData.get('file');
        if (!(sharedFile instanceof File) || !sharedFile.type.startsWith('image/')) {
            return Response.redirect(new URL('/crea?shared=true', self.location.origin), 303);
        }

        const shareId = typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const cache = await caches.open(SHARE_CACHE_NAME);
        await pruneSharedFiles(cache);
        await cache.put(
            getShareRequest(shareId),
            new Response(sharedFile, {
                headers: {
                    'Content-Type': sharedFile.type,
                    'X-EventScanner-Shared-At': String(Date.now()),
                },
            })
        );

        const destination = new URL('/crea', self.location.origin);
        destination.searchParams.set('shared', 'true');
        destination.searchParams.set('shareId', shareId);
        return Response.redirect(destination.toString(), 303);
    } catch (error) {
        console.error('[SW] Could not receive shared image:', error);
        return Response.redirect(new URL('/crea?shared=true', self.location.origin), 303);
    }
}

async function readSharedFile(shareId) {
    const cache = await caches.open(SHARE_CACHE_NAME);
    const request = getShareRequest(shareId);
    const response = await cache.match(request);
    if (!response) {
        return new Response('Immagine condivisa non trovata o scaduta.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }

    await cache.delete(request);
    return response;
}

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
                    if (cache !== CACHE_NAME && cache !== SHARE_CACHE_NAME) {
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
    // Bypass cache for local development
    const isLocalhost = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
    if (isLocalhost) {
        return; // Let the browser handle the request normally
    }

    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Store shared screenshots locally before redirecting into the app.
    if (
        event.request.method === 'POST' &&
        (requestUrl.pathname === '/api/share-target' || requestUrl.pathname === '/crea')
    ) {
        event.respondWith(receiveSharedFile(event.request));
        return;
    }

    // The app retrieves each shared file once, then the cached copy is deleted.
    if (event.request.method === 'GET' && requestUrl.pathname === '/api/share-target') {
        const shareId = requestUrl.searchParams.get('shareId');
        event.respondWith(shareId
            ? readSharedFile(shareId)
            : Promise.resolve(new Response('shareId richiesto.', { status: 400 })));
        return;
    }

    // Avoid stale Next.js runtime/assets that can trigger "server action not found"
    if (requestUrl.pathname.startsWith('/_next/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Navigation requests should prefer network to avoid stale app shell after deploy
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((fetchResponse) => {
                    if (fetchResponse.ok) {
                        const responseToCache = fetchResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return fetchResponse;
                })
                .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match('/')))
        );
        return;
    }

    // Network-First strategy for events API (fresh data first, cache fallback offline)
    if (event.request.url.includes('/api/events') && event.request.method === 'GET') {
        console.log('[SW] Handling API request with Network-First:', event.request.url);
        event.respondWith(
            fetch(event.request)
                .then((fetchResponse) => {
                    if (fetchResponse.ok) {
                        console.log('[SW] Fetched fresh API response, updating cache:', event.request.url);
                        const responseToCache = fetchResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return fetchResponse;
                })
                .catch(() => {
                    console.log('[SW] Network failed for API request, trying cache fallback:', event.request.url);
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        return new Response(JSON.stringify({ error: 'offline' }), {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' },
                        });
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