const CACHE_NAME = 'etf-signal-cache-v6';
const basePath = '/etf-signal-dashboard/';
const urlsToCache = [
  basePath,
  basePath + 'index.html',
  basePath + 'style.css',
  basePath + 'app.js',
  basePath + 'manifest_app.json',
  basePath + 'icon.svg',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

const API_HOSTS = ['cdn.cboe.com', 'stooq.com', 'production.dataviz.cnn.io', 'api.alternative.me', 'api.allorigins.win', 'corsproxy.io', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache API hosts OR data.json (must always be fresh)
  if (API_HOSTS.some(h => url.hostname.includes(h)) || url.pathname.endsWith('data.json')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Periodic Background Sync for Hourly checking (requires browser support and installation)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'etf-signal-hourly') {
        event.waitUntil(checkSignalsInBackground());
    }
});

async function checkSignalsInBackground() {
    // Re-implementation of fetch logic for background sync
    const PROXY = 'https://api.allorigins.win/get?url=';
    const VIX_THRESHOLD = 30;
    const FNG_THRESHOLD = 30;
    
    // We just do a quick fetch
    try {
        const vixRes = await fetch(PROXY + encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/^VIX?range=1d&interval=1d`));
        const vixWrapper = await vixRes.json();
        const vixData = JSON.parse(vixWrapper.contents);
        const vix = vixData.chart.result[0].meta.regularMarketPrice;

        const ftseRes = await fetch(PROXY + encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1y&interval=1d`));
        const ftseWrapper = await ftseRes.json();
        const ftseData = JSON.parse(ftseWrapper.contents);
        const ftseResult = ftseData.chart.result[0];
        const validPrices = ftseResult.indicators.quote[0].close.filter(p => p !== null && p !== undefined);
        const sma200 = validPrices.slice(-200).reduce((a, b) => a + b, 0) / 200;
        const price = ftseResult.meta.regularMarketPrice;

        const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
        const fngData = await fngRes.json();
        const fng = Number(fngData.data[0].value);

        if (vix > VIX_THRESHOLD && price <= sma200 && fng < FNG_THRESHOLD) {
             self.registration.showNotification("Kaufsignal!", {
                body: "Alle Kriterien für den FTSE All World Einstieg sind erfüllt.",
                icon: "./icon.svg",
                vibrate: [200, 100, 200],
                tag: "etf-signal"
            });
        }
    } catch(e) {
        console.error("Background sync failed", e);
    }
}
