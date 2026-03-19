// ETF Signal Dashboard — Service Worker
// Kein Caching der App-Dateien — die App braucht immer Internet.
// Der SW existiert nur noch für Push-Benachrichtigungen.

const SW_VERSION = 'v7-no-cache';

self.addEventListener('install', event => {
    console.log('[SW] Installiert:', SW_VERSION);
    // Alten SW sofort ersetzen, nicht auf Tab-Schließen warten
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[SW] Aktiviert:', SW_VERSION);
    // Alle alten Caches löschen
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => {
                console.log('[SW] Lösche Cache:', key);
                return caches.delete(key);
            }))
        ).then(() => self.clients.claim())
    );
});

// Kein Fetch-Handler → Browser holt alles direkt vom Netzwerk
// (kein Cache-First, kein Caching überhaupt)

// Push-Benachrichtigungen (für Kaufsignal)
self.addEventListener('push', event => {
    const data = event.data?.json() || {};
    self.registration.showNotification(data.title || 'Kaufsignal!', {
        body: data.body || 'Alle Kriterien für den FTSE All World Einstieg sind erfüllt.',
        icon: './icon.svg',
        vibrate: [200, 100, 200],
        tag: 'etf-signal'
    });
});
