// --- PROXY STRATEGY ---
// We try multiple proxies in sequence for Yahoo Finance (which blocks direct browser requests).
// CNN Fear & Greed is fetched directly because it supports CORS.

const PROXIES = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

// Constants
const VIX_THRESHOLD = 30;
const FNG_THRESHOLD = 30;
const SYMBOL_FTSE = 'VWCE.DE';
const URL_VIX = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d`;
const URL_FTSE = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL_FTSE}?range=1y&interval=1d`;

// State
let state = {
    vix: { value: null, ok: false },
    ftse: { price: null, sma200: null, ok: false },
    fng: { value: null, ok: false },
    lastUpdated: null,
};

// Elements
const el = {
    updateTime: document.getElementById('last-update'),
    globalStatus: document.getElementById('global-status'),
    globalIcon: document.getElementById('global-icon'),
    globalText: document.getElementById('global-text'),
    
    valVix: document.getElementById('val-vix'),
    badgeVix: document.getElementById('badge-vix'),
    progressVix: document.getElementById('progress-vix'),

    valPrice: document.getElementById('val-price'),
    valSma: document.getElementById('val-sma'),
    badgeTrend: document.getElementById('badge-trend'),

    valFng: document.getElementById('val-fng'),
    badgeSentiment: document.getElementById('badge-sentiment'),
    progressFng: document.getElementById('progress-fng'),

    btnNotifications: document.getElementById('enable-notifications')
};

// Utils
const formatNumber = (num, decimals = 2) => num ? Number(num).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '--';

// Try to parse the response from a proxy (some wrap in {contents:...}, others return raw JSON)
async function tryParseProxy(res) {
    const text = await res.text();
    // allorigins wraps with {contents: "..."}
    try {
        const wrapper = JSON.parse(text);
        if (wrapper.contents) return JSON.parse(wrapper.contents);
        if (wrapper.chart || wrapper.optionChain) return wrapper; // direct JSON
        return wrapper;
    } catch(e) {
        return JSON.parse(text);
    }
}

// Fetch a Yahoo Finance URL through multiple proxies in sequence until one works
async function yahooFetch(url) {
    for (const proxyFn of PROXIES) {
        const proxyUrl = proxyFn(url);
        try {
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) { console.warn(`Proxy returned ${res.status} for ${proxyUrl}`); continue; }
            const data = await tryParseProxy(res);
            if (data?.chart?.result?.[0]) return data; // valid response
            console.warn('Proxy returned unexpected data structure, trying next.', data);
        } catch(e) {
            console.warn(`Proxy failed: ${proxyUrl}`, e.message);
        }
    }
    return null; // all proxies failed
}

async function getVix() {
    try {
        const data = await yahooFetch(URL_VIX);
        if (!data) throw new Error('All proxies failed for VIX');
        return data.chart.result[0].meta.regularMarketPrice;
    } catch (e) {
        console.error("VIX fetch failed:", e.message);
        return null;
    }
}

async function getFtse() {
    try {
        const data = await yahooFetch(URL_FTSE);
        if (!data) throw new Error('All proxies failed for FTSE');
        const result = data.chart.result[0];
        const closePrices = result.indicators.quote[0].close;
        const currentPrice = result.meta.regularMarketPrice;

        const validPrices = closePrices.filter(p => p !== null && p !== undefined);
        let sma200 = null;
        if (validPrices.length >= 200) {
            sma200 = validPrices.slice(-200).reduce((a, b) => a + b, 0) / 200;
        } else {
            sma200 = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
        }
        return { price: currentPrice, sma: sma200 };
    } catch (e) {
        console.error("FTSE fetch failed:", e.message);
        return null;
    }
}

async function getFng() {
    // CNN supports CORS – fetch directly, no proxy needed
    try {
        const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
            signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
            const data = await res.json();
            return data.fear_and_greed.score;
        }
    } catch (e) {
        console.warn('CNN F&G direct fetch failed, trying alternative.me fallback:', e.message);
    }
    // Fallback: alternative.me (crypto index, often correlated)
    try {
        const res = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        return Number(data.data[0].value);
    } catch (e) {
        console.error('All F&G sources failed:', e.message);
        return null;
    }
}


function checkNotificationPermission() {
    if ("Notification" in window) {
        if (Notification.permission === "default") {
            el.btnNotifications.style.display = "flex";
            el.btnNotifications.addEventListener('click', async () => {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    el.btnNotifications.style.display = "none";
                }
            });
        }
    }
}

function triggerNotification() {
    if ("Notification" in window && Notification.permission === "granted") {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification("Kaufsignal!", {
                body: "Alle Kriterien für den FTSE All World Einstieg sind erfüllt.",
                icon: "./icon.svg",
                vibrate: [200, 100, 200],
                tag: "etf-signal"
            });
        });
    }
}

function updateUI() {
    // VIX
    if (state.vix.value !== null) {
        el.valVix.innerText = formatNumber(state.vix.value);
        el.badgeVix.innerText = state.vix.ok ? "Erfüllt" : "Nicht Erfüllt";
        el.badgeVix.className = state.vix.ok ? "status-badge badge-success" : "status-badge badge-error";
        
        let vixProg = Math.min((state.vix.value / (VIX_THRESHOLD * 1.5)) * 100, 100);
        el.progressVix.style.width = vixProg + "%";
        el.progressVix.style.backgroundColor = state.vix.ok ? "var(--accent-success)" : "var(--accent-danger)";
    }

    // FTSE
    if (state.ftse.price !== null && state.ftse.sma200 !== null) {
        el.valPrice.innerText = formatNumber(state.ftse.price) + " €";
        el.valSma.innerText = formatNumber(state.ftse.sma200) + " €";
        
        el.badgeTrend.innerText = state.ftse.ok ? "Erfüllt" : "Nicht Erfüllt";
        el.badgeTrend.className = state.ftse.ok ? "status-badge badge-success" : "status-badge badge-error";
    }

    // FnG
    if (state.fng.value !== null) {
        el.valFng.innerText = Math.round(state.fng.value);
        el.badgeSentiment.innerText = state.fng.ok ? "Erfüllt" : "Nicht Erfüllt";
        el.badgeSentiment.className = state.fng.ok ? "status-badge badge-success" : "status-badge badge-error";

        let fngProg = state.fng.value; // 0-100
        el.progressFng.style.width = fngProg + "%";
        el.progressFng.style.backgroundColor = state.fng.ok ? "var(--accent-success)" : "var(--accent-danger)";
    }

    // Global
    const allOk = state.vix.ok && state.ftse.ok && state.fng.ok;
    const subtextEl = el.globalStatus.querySelector('.status-subtext');
    
    if (allOk) {
        el.globalIcon.innerText = "🚀";
        el.globalText.innerText = "Kaufsignal aktiv!";
        if(subtextEl) subtextEl.innerText = "Alle Bedingungen erfüllt.";
        el.globalStatus.classList.add('signal-active');
        triggerNotification(); 
    } else {
        el.globalIcon.innerText = "⏳";
        el.globalText.innerText = "Kein Signal";
        if(subtextEl) subtextEl.innerText = "Bedingungen (noch) nicht erfüllt.";
        el.globalStatus.classList.remove('signal-active');
    }

    if(state.lastUpdated) {
        el.updateTime.innerText = "Stand: " + state.lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
}

async function refreshData() {
    el.updateTime.innerText = "Aktualisiere...";
    
    const [vix, ftse, fng] = await Promise.all([
        getVix(),
        getFtse(),
        getFng()
    ]);

    if (vix !== null) {
        state.vix.value = vix;
        state.vix.ok = vix > VIX_THRESHOLD;
    }
    
    if (ftse !== null) {
        state.ftse.price = ftse.price;
        state.ftse.sma200 = ftse.sma;
        state.ftse.ok = ftse.price <= ftse.sma;
    }
    
    if (fng !== null) {
        state.fng.value = fng;
        state.fng.ok = fng < FNG_THRESHOLD;
    }

    state.lastUpdated = new Date();
    updateUI();

    // Cache the recent fetch timestamp in localStorage
    localStorage.setItem('lastFetch', Date.now().toString());
}

function init() {
    checkNotificationPermission();

    // PWA Install Prompt handling
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('install-prompt').style.display = 'flex';
    });

    document.getElementById('btn-install').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('install-prompt').style.display = 'none';
            }
            deferredPrompt = null;
        }
    });

    document.getElementById('btn-close-install').addEventListener('click', () => {
        document.getElementById('install-prompt').style.display = 'none';
    });

    // Determine if we should fetch immediately
    const lastFetch = localStorage.getItem('lastFetch');
    const now = Date.now();
    
    // Auto check hourly (3600000 ms)
    const ONE_HOUR = 60 * 60 * 1000;
    
    if (!lastFetch || now - parseInt(lastFetch) > ONE_HOUR) {
        refreshData();
    } else {
        // We still fetch once on app load to ensure fresh UI, but you could load from cache instead
        refreshData();
    }

    setInterval(() => {
        refreshData();
    }, ONE_HOUR);
}

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            console.log('SW registered: ', registration);
        }).catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
        });
    });
}

// Start app
init();
