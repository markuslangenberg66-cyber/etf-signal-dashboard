// ETF SIGNAL DASHBOARD — app.js (STITCH TECHNICAL LEDGER EDITION)
// 
// Vibe Coder Info:
// Dieses Skript kümmert sich um das Laden der Daten und das
// flüssige, animierte Aktualisieren der Zahlen im Dashboard.
// ============================================================

const VIX_THRESHOLD = 30;
const FNG_THRESHOLD = 30;

// Hier greifen wir alle Benutzeroberflächen-Elemente aus unserer neuen HTML ab
const el = {
    updateTime:     document.getElementById('last-update'),
    globalStatus:   document.getElementById('global-status'),
    globalIcon:     document.getElementById('global-icon'),
    globalText:     document.getElementById('global-text'),
    valVix:         document.getElementById('val-vix'),
    badgeVix:       document.getElementById('badge-vix'),
    progressVix:    document.getElementById('progress-vix'),
    valPrice:       document.getElementById('val-price'),
    valSma:         document.getElementById('val-sma'),
    badgeTrend:     document.getElementById('badge-trend'),
    valFng:         document.getElementById('val-fng'),
    badgeSentiment: document.getElementById('badge-sentiment'),
    progressFng:    document.getElementById('progress-fng'),
    btnNotif:       document.getElementById('enable-notifications')
};

// Der "Zustand" (State) der App. Wenn wir Daten aus dem Internet holen,
// werden diese hier sicher zwischengespeichert.
let state = {
    vix:  { value: null, ok: false },
    ftse: { price: null, sma200: null, ok: false },
    fng:  { value: null, ok: false },
    lastUpdated: null
};

// Hilfsfunktion: Macht aus "1234.5" eine deutsche schöne Zahl: "1.234,50"
const fmt = (n, d = 2) => n != null
    ? Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '--';

// ── VIBE CODING MAGIE: Zahlen hochzählen ────────────────────
// Erklärt: Diese Funktion lässt eine Zahl weich von 0 auf ihren Zielwert hochzählen,
// anstatt sie einfach "aufpoppen" zu lassen (bekannt aus Apple/Samsung Aktien-Apps).
function animateValue(obj, targetValue, isDecimal = false) {
    let current = 0;
    const duration = 1200; // Dauer der Animation in ms (1.2 Sekunden)
    const steps = 60; // In wie vielen Bildern (frames) soll es hochzählen
    const increment = targetValue / steps;
    
    // SetIntervall ist wie eine Zeitschleife, die ganz oft pro Sekunde feuert
    const counter = setInterval(() => {
        current += increment;
        if (current >= targetValue) {
            current = targetValue;
            clearInterval(counter); // Beende die Zeitschleife
        }
        
        // Schreibe die aktuelle Zwischenzahl physisch ins HTML
        if(isDecimal) {
            obj.innerText = fmt(current, 2);
        } else {
            obj.innerText = Math.round(current);
        }
    }, duration / steps);
}

// ── CORS-Proxy Helfer ───────────────────────────────────────
// Browser können keine Daten von externen APIs laden, weil die
// Browser-Sicherheit (CORS) das blockiert. Wir nutzen mehrere
// Proxy-Dienste als Vermittler (Fallback-Kette).
const CORS_PROXIES = [
    'https://corsproxy.io/?url=',
    'https://api.allorigins.win/raw?url=',
];

async function fetchWithProxy(url, timeout = 25000) {
    for (const proxy of CORS_PROXIES) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(proxy + encodeURIComponent(url), {
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch(e) {
            clearTimeout(timer);
            console.warn(`Proxy ${proxy} fehlgeschlagen:`, e.message);
            // Nächsten Proxy versuchen
        }
    }
    throw new Error('Alle CORS-Proxies fehlgeschlagen');
}

// ── LIVE-API: VIX von Yahoo Finance (Spark = leichtgewichtig!) ──
async function fetchVIX() {
    // Versuch 1: Yahoo Finance Spark (ganz kleine Response, nur aktueller Preis)
    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5d&interval=1d';
        const res = await fetchWithProxy(url);
        const data = await res.json();
        const meta = data.chart.result[0].meta;
        const vix = parseFloat(meta.regularMarketPrice || meta.previousClose);
        if (vix > 0) {
            console.log('[VIX] Yahoo Wert:', vix);
            return vix;
        }
    } catch(e) {
        console.warn('VIX Yahoo Fehler:', e.message);
    }

    // Versuch 2: CBOE Delayed Quotes (einzelner aktueller Wert)
    try {
        const url = 'https://cdn.cboe.com/api/global/delayed_quotes/charts/_VIX.json';
        const res = await fetchWithProxy(url);
        const data = await res.json();
        const vix = parseFloat(data.data.close || data.data[data.data.length - 1].close);
        console.log('[VIX] CBOE Wert:', vix);
        return vix;
    } catch(e) {
        console.warn('VIX CBOE Fehler:', e.message);
    }

    return null;
}

// ── LIVE-API: FTSE/VWCE Kurs & SMA200 ──────────────────────
async function fetchFTSE() {
    // Versuch 1: Yahoo Finance (VWCE.DE, 1 Jahr für SMA200-Berechnung)
    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1y&interval=1d';
        const res = await fetchWithProxy(url);
        const data = await res.json();
        const result = data.chart.result[0];
        const closes = result.indicators.quote[0].close.filter(v => v !== null);
        
        if (closes.length < 10) throw new Error('Zu wenige Datenpunkte');
        
        const price = closes[closes.length - 1];
        const last200 = closes.slice(-200);
        const sma200 = last200.reduce((a, b) => a + b, 0) / last200.length;
        console.log('[FTSE] Yahoo Wert:', price, 'SMA200:', sma200);
        return { price: Math.round(price * 100) / 100, sma200: Math.round(sma200 * 10000) / 10000 };
    } catch(e) {
        console.warn('FTSE Yahoo Fehler:', e.message);
    }

    // Versuch 2: Stooq CSV
    try {
        const url = 'https://stooq.com/q/d/l/?s=vwce.de&i=d';
        const res = await fetchWithProxy(url);
        const raw = await res.text();
        const lines = raw.trim().split('\n');
        const dataRows = lines.slice(1).filter(l => l.trim().length > 0);
        const closes = dataRows.map(row => {
            const cols = row.split(',');
            return parseFloat(cols[4]);
        }).filter(v => !isNaN(v));

        if (closes.length === 0) throw new Error('Keine Kursdaten');

        const price = closes[closes.length - 1];
        const last200 = closes.slice(-200);
        const sma200 = last200.reduce((a, b) => a + b, 0) / last200.length;
        console.log('[FTSE] Stooq Wert:', price, 'SMA200:', sma200);
        return { price: price, sma200: Math.round(sma200 * 10000) / 10000 };
    } catch(e) {
        console.warn('FTSE Stooq Fehler:', e.message);
    }

    return null;
}


// ── LIVE-API: Fear & Greed Index (CNN = Aktienmarkt!) ───────
// WICHTIG: alternative.me misst den KRYPTO F&G Index (falsch!).
// Der korrekte Wert ist der CNN Fear & Greed für den Aktienmarkt.
async function fetchFearGreed() {
    // Versuch 1: CNN Fear & Greed (Aktienmarkt-Index = korrekte Quelle!)
    try {
        const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
        const res = await fetchWithProxy(url);
        const data = await res.json();
        const fng = parseFloat(data.fear_and_greed.score);
        console.log('[F&G] CNN Aktienmarkt-Wert:', fng);
        return fng;
    } catch(e) {
        console.warn('F&G CNN Fehler:', e.message);
    }

    // Versuch 2: alternative.me (Krypto-Index, nur als Notfall-Fallback)
    // Achtung: Dieser Wert bezieht sich auf Kryptowährungen, nicht auf Aktien!
    try {
        const url = 'https://api.alternative.me/fng/?limit=1&format=json';
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        const fng = parseFloat(data.data[0].value);
        console.log('[F&G] alternative.me Krypto-Wert (Fallback):', fng);
        return fng;
    } catch(e) {
        console.warn('F&G alternative.me Fehler:', e.message);
    }

    return null;
}

// ── Daten laden: LIVE-APIs + intelligentes Mischen mit Fallback ──
async function loadData() {
    console.log('[Dashboard] Starte Live-Datenabfrage...');
    
    // Alle drei APIs gleichzeitig abfragen (parallel = schneller)
    const [vix, ftse, fng] = await Promise.all([
        fetchVIX(),
        fetchFTSE(),
        fetchFearGreed()
    ]);

    console.log('[Dashboard] Live-Ergebnis:', { vix, ftse, fng });

    // Fallback: Lade data.json für fehlende Werte
    let fallback = {};
    try {
        const url = './data.json?t=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) fallback = await res.json();
    } catch(e) {
        console.warn('[Dashboard] data.json Fallback nicht verfügbar');
    }

    // Intelligentes Mischen: Live-Daten haben Priorität, Fallback füllt Lücken
    return {
        timestamp: new Date().toISOString(),
        vix: vix ?? fallback.vix ?? null,
        ftse_price: ftse ? ftse.price : (fallback.ftse_price ?? null),
        sma200: ftse ? ftse.sma200 : (fallback.sma200 ?? null),
        fng: fng ?? fallback.fng ?? null
    };
}


// ── Benutzeroberfläche (UI) befüllen und färben ─────────────
function updateUI() {
    
    // ---- 1. VIX KARTE ----
    if (state.vix.value !== null) {
        animateValue(el.valVix, state.vix.value, true); 
        el.badgeVix.innerText = state.vix.ok ? 'OPTIMAL' : 'LOW LIQUIDITY';
        
        // Stitch Design System: Status Coloring
        if(state.vix.ok) {
            // Primary Buy Signal (#46f1c5)
            el.badgeVix.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 shadow-[0_0_15px_rgba(70,241,197,0.2)] transition-all';
            el.progressVix.className = 'h-full bg-stitch-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(70,241,197,0.5)]'; 
        } else {
            // Tertiary Risk Signal (#ffcbc6)
            el.badgeVix.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-tertiary/10 text-stitch-tertiary border border-stitch-tertiary/20 transition-all';
            el.progressVix.className = 'h-full bg-stitch-outline/30 transition-all duration-1000 ease-out';
        }
        
        // Balken berechnen und animieren
        const prog = Math.min((state.vix.value / (VIX_THRESHOLD * 1.5)) * 100, 100);
        el.progressVix.style.width = prog + '%';
    }

    // ---- 2. TREND (FTSE) KARTE ----
    if (state.ftse.price !== null && state.ftse.sma200 !== null) {
        animateValue(el.valPrice, state.ftse.price, true);
        animateValue(el.valSma, state.ftse.sma200, true);
        
        el.badgeTrend.innerText = state.ftse.ok ? 'BULLISH' : 'OVERVALUED';
        if(state.ftse.ok) {
            el.badgeTrend.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 shadow-[0_0_15px_rgba(70,241,197,0.2)] transition-all';
        } else {
            el.badgeTrend.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-tertiary/10 text-stitch-tertiary border border-stitch-tertiary/20 transition-all';
        }
    }

    // ---- 3. SENTIMENT (Fear & Greed) KARTE ----
    if (state.fng.value !== null) {
        animateValue(el.valFng, state.fng.value, false);
        el.badgeSentiment.innerText = state.fng.ok ? 'EXTREME FEAR' : 'GREED/NEUTRAL';
        
        if(state.fng.ok) {
            el.badgeSentiment.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 shadow-[0_0_15px_rgba(70,241,197,0.2)] transition-all';
            el.progressFng.className = 'h-full bg-stitch-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(70,241,197,0.5)]'; 
        } else {
            el.badgeSentiment.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-tertiary/10 text-stitch-tertiary border border-stitch-tertiary/20 transition-all';
            el.progressFng.className = 'h-full bg-stitch-outline/30 transition-all duration-1000 ease-out';
        }
        
        // Da der FNG-Balken von rechts nach links füllt, weil niedrige Werte gut sind:
        el.progressFng.style.width = (100 - state.fng.value) + '%'; 
    }

    // ---- 4. DAS ÜBERGEORDNETE SIGNAL-BANNER ----
    const allOk = state.vix.ok && state.ftse.ok && state.fng.ok;
    const subtextEl = document.querySelector('.status-subtext');

    if (allOk) {
        el.globalIcon.innerText = '🚀';
        el.globalText.innerText = 'BUY SIGNAL ACTIVE';
        
        // Stitch Primary Style for positive signal
        el.globalText.className = 'display-lg text-stitch-primary drop-shadow-[0_0_20px_rgba(70,241,197,0.3)] transition-all';
        if (subtextEl) subtextEl.innerText = 'All entry protocols satisfied. Initiate position.';
        
        el.globalStatus.classList.remove('border-stitch-outline/20');
        el.globalStatus.classList.add('border-stitch-primary', 'shadow-[0_0_40px_rgba(70,241,197,0.1)]');
        
        sendNotification(); // Push an den User generieren
    } else {
        el.globalIcon.innerText = '⏳';
        el.globalText.innerText = 'NO SIGNAL';
        el.globalText.className = 'display-lg text-white transition-all';
        if (subtextEl) subtextEl.innerText = 'Incomplete market alignment. Standby for updates.';
        
        el.globalStatus.classList.add('border-stitch-outline/20');
        el.globalStatus.classList.remove('border-stitch-primary', 'shadow-[0_0_40px_rgba(70,241,197,0.1)]');
    }

    // Aktualisierungszeit ganz oben
    if (state.lastUpdated) {
        el.updateTime.innerText = 'Stand: ' + 
            state.lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
}

// ── Push-Benachrichtigung (Unverändert) ──────────────────────
function sendNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification('Kaufsignal!', {
                body: '🚀 Alle Kriterien für den FTSE All World Einstieg sind jetzt erfüllt.',
                icon: './icon.svg',
                vibrate: [200, 100, 200],
                tag: 'etf-signal'
            });
        });
    }
}

function checkNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        el.btnNotif.style.display = 'flex';
        el.btnNotif.addEventListener('click', async () => {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') el.btnNotif.style.display = 'none';
        });
    }
}

// ── STARTPUNKT DER APP ──────────────────────────────────────
async function refreshData() {
    el.updateTime.innerText = 'Live-Daten laden...';
    try {
        const d = await loadData();

        // Befülle unseren State
        if (d.vix != null) {
            state.vix.value = d.vix;
            state.vix.ok    = d.vix > VIX_THRESHOLD;
        }
        if (d.ftse_price != null && d.sma200 != null) {
            state.ftse.price = d.ftse_price;
            state.ftse.sma200 = d.sma200;
            state.ftse.ok    = d.ftse_price <= d.sma200;
        }
        if (d.fng != null) {
            state.fng.value = d.fng;
            state.fng.ok    = d.fng < FNG_THRESHOLD;
        }
        if (d.timestamp) {
            state.lastUpdated = new Date(d.timestamp);
        }
    } catch (e) {
        console.error('Fehler beim Laden:', e);
        el.updateTime.innerText = 'API-Fehler – Neuladen...';
    }
    
    // UI neu zeichnen und Effekte abspielen
    updateUI();
}

// PWA Setup und Knöpfe aktivieren
function init() {
    checkNotificationPermission();

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Zeige den echten Installations-Button im Modal
        const nativeBtn = document.getElementById('btn-native-install');
        if (nativeBtn) nativeBtn.classList.remove('hidden');
    });

    document.getElementById('btn-install-main').addEventListener('click', () => {
        document.getElementById('manual-install-modal').style.display = 'flex';
    });

    const nativeBtn = document.getElementById('btn-native-install');
    if (nativeBtn) {
        nativeBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
                if (outcome === 'accepted') {
                    document.getElementById('manual-install-modal').style.display = 'none';
                    document.getElementById('btn-install-main').style.display = 'none';
                }
            }
        });
    }

    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('manual-install-modal').style.display = 'none';
    });
    
    // Klick auf grauen Hintergrund (Modal schließen)
    document.getElementById('manual-install-modal').addEventListener('click', e => {
        if (e.target.id === 'manual-install-modal') {
            document.getElementById('manual-install-modal').style.display = 'none';
        }
    });

    // PWA Button verstecken, falls App eh schon auf dem Homescreen ist
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.getElementById('btn-install-main').style.display = 'none';
    }

    refreshData(); // Direkt am Anfang 1x laden
    
    // Danach heimlich alle 60 Minuten erneuern
    setInterval(refreshData, 60 * 60 * 1000);
}

// Service Worker anwerfen für echten App-Support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW läuft:', reg.scope))
            .catch(err => console.warn('SW Fehler:', err));
    });
}

init();
