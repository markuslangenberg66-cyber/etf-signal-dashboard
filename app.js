// ============================================================
// ETF SIGNAL DASHBOARD - app.js
// Datenquellen (alle CORS-fähig, KEIN Proxy nötig):
//   VIX  → CBOE offizielle API (cdn.cboe.com)
//   FTSE → Stooq.com CSV
//   F&G  → CNN Fear & Greed direkt / alternative.me Fallback
// ============================================================

const VIX_THRESHOLD  = 30;
const FNG_THRESHOLD  = 30;

// UI-Elemente
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

// App-Zustand
let state = {
    vix:  { value: null, ok: false },
    ftse: { price: null, sma200: null, ok: false },
    fng:  { value: null, ok: false },
    lastUpdated: null
};

const fmt = (n, d = 2) => n != null
    ? Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '--';

// ── VIX via CBOE (offiziell, CORS-erlaubt) ─────────────────
async function getVix() {
    try {
        const res = await fetch(
            'https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_VIX.json',
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) throw new Error(`CBOE status ${res.status}`);
        const json = await res.json();
        const entries = json.data;
        if (!entries?.length) throw new Error('Leer');
        const last = entries[entries.length - 1];
        return parseFloat(last.close);
    } catch (e) {
        console.error('VIX Fehler:', e.message);
        return null;
    }
}

// ── FTSE/VWCE via Stooq CSV (CORS-erlaubt, kein Proxy) ─────
async function getFtse() {
    try {
        const res = await fetch(
            'https://stooq.com/q/d/l/?s=vwce.de&i=d',
            { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) throw new Error(`Stooq status ${res.status}`);
        const csv = await res.text();
        const lines = csv.trim().split('\n')
            .slice(1)                         // Kopfzeile überspringen
            .filter(l => l.trim());           // Leerzeilen herausfiltern

        if (lines.length < 5) throw new Error('Zu wenige Daten');

        // Schlusskurs = Spalte 4 (0-indiziert)
        const closes = lines
            .map(l => parseFloat(l.split(',')[4]))
            .filter(n => !isNaN(n) && n > 0);

        const currentPrice = closes[closes.length - 1];
        const last200      = closes.slice(-200);
        const sma200       = last200.reduce((a, b) => a + b, 0) / last200.length;

        return { price: currentPrice, sma: sma200 };
    } catch (e) {
        console.error('FTSE Fehler:', e.message);
        return null;
    }
}

// ── Fear & Greed: CNN direkt, Fallback alternative.me ───────
async function getFng() {
    try {
        const res = await fetch(
            'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
            { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
            const d = await res.json();
            return d.fear_and_greed.score;
        }
    } catch (e) {
        console.warn('CNN F&G fehlgeschlagen:', e.message);
    }
    try {
        const res = await fetch(
            'https://api.alternative.me/fng/?limit=1',
            { signal: AbortSignal.timeout(8000) }
        );
        const d = await res.json();
        return Number(d.data[0].value);
    } catch (e) {
        console.error('Alle F&G-Quellen fehlgeschlagen:', e.message);
        return null;
    }
}

// ── UI aktualisieren ────────────────────────────────────────
function updateUI() {
    // VIX
    if (state.vix.value !== null) {
        el.valVix.innerText = fmt(state.vix.value);
        el.badgeVix.innerText   = state.vix.ok ? 'Erfüllt' : 'Nicht Erfüllt';
        el.badgeVix.className   = state.vix.ok ? 'status-badge badge-success' : 'status-badge badge-error';
        const vixProg = Math.min((state.vix.value / (VIX_THRESHOLD * 1.5)) * 100, 100);
        el.progressVix.style.width           = vixProg + '%';
        el.progressVix.style.backgroundColor = state.vix.ok ? 'var(--accent-success)' : 'var(--accent-danger)';
    }

    // FTSE
    if (state.ftse.price !== null && state.ftse.sma200 !== null) {
        el.valPrice.innerText    = fmt(state.ftse.price) + ' €';
        el.valSma.innerText      = fmt(state.ftse.sma200) + ' €';
        el.badgeTrend.innerText  = state.ftse.ok ? 'Erfüllt' : 'Nicht Erfüllt';
        el.badgeTrend.className  = state.ftse.ok ? 'status-badge badge-success' : 'status-badge badge-error';
    }

    // Fear & Greed
    if (state.fng.value !== null) {
        el.valFng.innerText          = Math.round(state.fng.value);
        el.badgeSentiment.innerText  = state.fng.ok ? 'Erfüllt' : 'Nicht Erfüllt';
        el.badgeSentiment.className  = state.fng.ok ? 'status-badge badge-success' : 'status-badge badge-error';
        el.progressFng.style.width   = state.fng.value + '%';
        el.progressFng.style.backgroundColor = state.fng.ok ? 'var(--accent-success)' : 'var(--accent-danger)';
    }

    // Gesamt-Signal
    const allOk = state.vix.ok && state.ftse.ok && state.fng.ok;
    const subtextEl = el.globalStatus.querySelector('.status-subtext');

    if (allOk) {
        el.globalIcon.innerText = '🚀';
        el.globalText.innerText = 'Kaufsignal aktiv!';
        if (subtextEl) subtextEl.innerText = 'Alle Bedingungen erfüllt!';
        el.globalStatus.classList.add('signal-active');
        sendNotification();
    } else {
        el.globalIcon.innerText = '⏳';
        el.globalText.innerText = 'Kein Signal';
        if (subtextEl) subtextEl.innerText = 'Bedingungen (noch) nicht erfüllt.';
        el.globalStatus.classList.remove('signal-active');
    }

    if (state.lastUpdated) {
        el.updateTime.innerText = 'Stand: ' +
            state.lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
}

// ── Push-Benachrichtigung ───────────────────────────────────
function sendNotification() {
    if ('Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification('Kaufsignal!', {
                body: 'Alle Kriterien für den FTSE All World Einstieg sind erfüllt.',
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

// ── Daten laden ─────────────────────────────────────────────
async function refreshData() {
    el.updateTime.innerText = 'Aktualisiere…';

    const [vix, ftse, fng] = await Promise.all([getVix(), getFtse(), getFng()]);

    if (vix  !== null) { state.vix.value  = vix;        state.vix.ok  = vix > VIX_THRESHOLD; }
    if (ftse !== null) { state.ftse.price = ftse.price; state.ftse.sma200 = ftse.sma; state.ftse.ok = ftse.price <= ftse.sma; }
    if (fng  !== null) { state.fng.value  = fng;        state.fng.ok  = fng < FNG_THRESHOLD; }

    state.lastUpdated = new Date();
    updateUI();
    localStorage.setItem('lastFetch', Date.now().toString());
}

// ── PWA-Logik & Start ───────────────────────────────────────
function init() {
    checkNotificationPermission();

    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('install-prompt').style.display = 'flex';
    });
    document.getElementById('btn-install').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') document.getElementById('install-prompt').style.display = 'none';
            deferredPrompt = null;
        }
    });
    document.getElementById('btn-close-install').addEventListener('click', () => {
        document.getElementById('install-prompt').style.display = 'none';
    });

    refreshData();
    setInterval(refreshData, 60 * 60 * 1000); // stündlich
}

// Service Worker registrieren
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registriert:', reg.scope))
            .catch(err => console.warn('SW Fehler:', err));
    });
}

init();
