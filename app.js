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

// ── LIVE-API: VIX von Yahoo Finance ────────────────────────
// Einzige Quelle: Yahoo Finance. Kein Fallback.
async function fetchVIX() {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5d&interval=1d';
    const res = await fetchWithProxy(url);
    const data = await res.json();
    const meta = data.chart.result[0].meta;
    const vix = parseFloat(meta.regularMarketPrice || meta.previousClose);
    if (!vix || vix <= 0) throw new Error('Ungültiger VIX-Wert erhalten');
    console.log('[VIX] Yahoo Wert:', vix);
    return vix;
}

// ── LIVE-API: FTSE/VWCE Kurs & SMA200 von Yahoo Finance ─────
// Einzige Quelle: Yahoo Finance. Kein Fallback.
async function fetchFTSE() {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1y&interval=1d';
    const res = await fetchWithProxy(url);
    const data = await res.json();
    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(v => v !== null);
    if (closes.length < 10) throw new Error('Zu wenige Datenpunkte von Yahoo');
    const price = closes[closes.length - 1];
    const last200 = closes.slice(-200);
    const sma200 = last200.reduce((a, b) => a + b, 0) / last200.length;
    console.log('[FTSE] Yahoo Wert:', price, 'SMA200:', sma200);
    return { price: Math.round(price * 100) / 100, sma200: Math.round(sma200 * 10000) / 10000 };
}

// ── LIVE-API: CNN Fear & Greed Index (Aktienmarkt) ──────────
// Einzige Quelle: CNN. Kein Fallback.
async function fetchFearGreed() {
    const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
    const res = await fetchWithProxy(url);
    const data = await res.json();
    const fng = parseFloat(data.fear_and_greed.score);
    if (isNaN(fng)) throw new Error('Ungültiger F&G-Wert von CNN');
    console.log('[F&G] CNN Aktienmarkt-Wert:', fng);
    return fng;
}


// ── Daten laden: NUR LIVE – kein Fallback ───────────────────
// Wenn eine API nicht erreichbar ist, bleibt der Wert null.
// Die UI zeigt dann eine klare Fehlermeldung statt alter Daten.
async function loadData() {
    console.log('[Dashboard] Starte Live-Datenabfrage...');

    // Alle drei APIs parallel abfragen. Fehler werden abgefangen
    // und als null zurückgegeben, damit Promise.all nicht abbricht.
    const [vixResult, ftseResult, fngResult] = await Promise.all([
        fetchVIX().catch(e => { console.error('[VIX] FEHLER:', e.message); return null; }),
        fetchFTSE().catch(e => { console.error('[FTSE] FEHLER:', e.message); return null; }),
        fetchFearGreed().catch(e => { console.error('[F&G] FEHLER:', e.message); return null; })
    ]);

    console.log('[Dashboard] Live-Ergebnis:', { vix: vixResult, ftse: ftseResult, fng: fngResult });

    // Kein Fallback! Null bleibt null. Die UI zeigt einen Fehler.
    return {
        timestamp: new Date().toISOString(),
        vix: vixResult,
        ftse_price: ftseResult ? ftseResult.price : null,
        sma200: ftseResult ? ftseResult.sma200 : null,
        fng: fngResult
    };
}


// ── Benutzeroberfläche (UI) befüllen und färben ─────────────
function updateUI() {
    // Fehler-Badge CSS (einheitlich für alle Karten)
    const errorBadge = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-error/10 text-stitch-error border border-stitch-error/30 transition-all';

    // ---- 1. VIX KARTE ----
    if (state.vix.value !== null) {
        animateValue(el.valVix, state.vix.value, true); 
        el.badgeVix.innerText = state.vix.ok ? 'OPTIMAL' : 'LOW LIQUIDITY';
        if(state.vix.ok) {
            el.badgeVix.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 shadow-[0_0_15px_rgba(70,241,197,0.2)] transition-all';
            el.progressVix.className = 'h-full bg-stitch-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(70,241,197,0.5)]'; 
        } else {
            el.badgeVix.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-tertiary/10 text-stitch-tertiary border border-stitch-tertiary/20 transition-all';
            el.progressVix.className = 'h-full bg-stitch-outline/30 transition-all duration-1000 ease-out';
        }
        const prog = Math.min((state.vix.value / (VIX_THRESHOLD * 1.5)) * 100, 100);
        el.progressVix.style.width = prog + '%';
    } else {
        // API-Fehler: klare Fehlermeldung, kein alter Wert
        el.valVix.innerText = '--';
        el.badgeVix.innerText = 'API ERROR';
        el.badgeVix.className = errorBadge;
        el.progressVix.style.width = '0%';
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
    } else {
        el.valPrice.innerText = '--';
        el.valSma.innerText = '--';
        el.badgeTrend.innerText = 'API ERROR';
        el.badgeTrend.className = errorBadge;
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
        el.progressFng.style.width = (100 - state.fng.value) + '%'; 
    } else {
        el.valFng.innerText = '--';
        el.badgeSentiment.innerText = 'API ERROR';
        el.badgeSentiment.className = errorBadge;
        el.progressFng.style.width = '0%';
    }

    // ---- 4. DAS ÜBERGEORDNETE SIGNAL-BANNER ----
    const anyError = state.vix.value === null || state.ftse.price === null || state.fng.value === null;
    const allOk = !anyError && state.vix.ok && state.ftse.ok && state.fng.ok;
    const subtextEl = document.querySelector('.status-subtext');

    if (anyError) {
        // Mindestens eine API ist ausgefallen – kein Signal möglich
        el.globalIcon.innerText = '⚠️';
        el.globalText.innerText = 'DATA ERROR';
        el.globalText.className = 'display-lg text-stitch-error transition-all';
        if (subtextEl) subtextEl.innerText = 'One or more data sources unavailable. Cannot evaluate signal.';
        el.globalStatus.classList.remove('border-stitch-primary', 'shadow-[0_0_40px_rgba(70,241,197,0.1)]');
        el.globalStatus.classList.add('border-stitch-outline/20');
    } else if (allOk) {
        el.globalIcon.innerText = '🚀';
        el.globalText.innerText = 'BUY SIGNAL ACTIVE';
        el.globalText.className = 'display-lg text-stitch-primary drop-shadow-[0_0_20px_rgba(70,241,197,0.3)] transition-all';
        if (subtextEl) subtextEl.innerText = 'All entry protocols satisfied. Initiate position.';
        el.globalStatus.classList.remove('border-stitch-outline/20');
        el.globalStatus.classList.add('border-stitch-primary', 'shadow-[0_0_40px_rgba(70,241,197,0.1)]');
        sendNotification();
    } else {
        el.globalIcon.innerText = '⛔';
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
