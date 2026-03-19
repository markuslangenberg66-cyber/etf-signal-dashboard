// ============================================================
// ETF SIGNAL DASHBOARD — app.js
//
// Strategie: Die App liest nur die statische data.json aus dem
// Repository. Diese Datei wird stündlich von einem GitHub Action
// (server-seitig!) aktualisiert → keinerlei CORS-Probleme.
// ============================================================

const VIX_THRESHOLD = 30;
const FNG_THRESHOLD = 30;

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

let state = {
    vix:  { value: null, ok: false },
    ftse: { price: null, sma200: null, ok: false },
    fng:  { value: null, ok: false },
    lastUpdated: null
};

const fmt = (n, d = 2) => n != null
    ? Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '--';

// ── data.json laden (immer frisch, kein Cache) ──────────────
async function loadData() {
    const url = './data.json?t=' + Date.now(); // einzigartiger Timestamp bei jedem Aufruf
    const res = await fetch(url, {
        cache: 'no-store',  // Browser-Cache komplett umgehen
        headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`data.json Fehler: ${res.status}`);
    return await res.json();
}

// ── UI aktualisieren ────────────────────────────────────────
function updateUI() {
    if (state.vix.value !== null) {
        el.valVix.innerText   = fmt(state.vix.value);
        el.badgeVix.innerText = state.vix.ok ? 'Erfüllt' : 'Nicht Erfüllt';
        el.badgeVix.className = state.vix.ok ? 'status-badge badge-success' : 'status-badge badge-error';
        const prog = Math.min((state.vix.value / (VIX_THRESHOLD * 1.5)) * 100, 100);
        el.progressVix.style.width = prog + '%';
        el.progressVix.style.backgroundColor = state.vix.ok ? 'var(--accent-success)' : 'var(--accent-danger)';
    }

    if (state.ftse.price !== null && state.ftse.sma200 !== null) {
        el.valPrice.innerText    = fmt(state.ftse.price) + ' €';
        el.valSma.innerText      = fmt(state.ftse.sma200) + ' €';
        el.badgeTrend.innerText  = state.ftse.ok ? 'Erfüllt' : 'Nicht Erfüllt';
        el.badgeTrend.className  = state.ftse.ok ? 'status-badge badge-success' : 'status-badge badge-error';
    }

    if (state.fng.value !== null) {
        el.valFng.innerText         = Math.round(state.fng.value);
        el.badgeSentiment.innerText = state.fng.ok ? 'Erfüllt' : 'Nicht Erfüllt';
        el.badgeSentiment.className = state.fng.ok ? 'status-badge badge-success' : 'status-badge badge-error';
        el.progressFng.style.width  = state.fng.value + '%';
        el.progressFng.style.backgroundColor = state.fng.ok ? 'var(--accent-success)' : 'var(--accent-danger)';
    }

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

// ── Daten laden und UI befüllen ─────────────────────────────
async function refreshData() {
    el.updateTime.innerText = 'Aktualisiere…';
    try {
        const d = await loadData();

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

        // Letztes Update aus der JSON-Datei selbst (gesetzt vom GitHub-Server)
        if (d.timestamp) {
            state.lastUpdated = new Date(d.timestamp);
        }
    } catch (e) {
        console.error('Fehler beim Laden von data.json:', e);
        el.updateTime.innerText = 'Fehler beim Laden';
    }
    updateUI();
}

// ── PWA-Setup & Start ───────────────────────────────────────
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
    setInterval(refreshData, 60 * 60 * 1000); // stündlich UI neu laden
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW:', reg.scope))
            .catch(err => console.warn('SW Fehler:', err));
    });
}

init();
