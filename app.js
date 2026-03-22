// ============================================================
// ETF SIGNAL DASHBOARD — app.js (DARK FINTECH MAGIC EDITION)
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

// ── Daten laden (data.json) ─────────────────────────────────
async function loadData() {
    // ?t=Timestamp zwingt den Browser, nicht auf alte gespeicherte Werte zurückzugreifen
    const url = './data.json?t=' + Date.now(); 
    const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`data.json Fehler: ${res.status}`);
    return await res.json();
}

// ── Benutzeroberfläche (UI) befüllen und färben ─────────────
function updateUI() {
    
    // ---- 1. VIX KARTE ----
    if (state.vix.value !== null) {
        animateValue(el.valVix, state.vix.value, true); 
        el.badgeVix.innerText = state.vix.ok ? 'OK' : 'ZU NIEDRIG';
        
        // Tailwind Klassen umschreiben für rotes/grünes Leuchten
        if(state.vix.ok) {
            // Grüner Leucht-Zustand (Dark Fintech Magic)
            el.badgeVix.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-fintech-accent/20 text-fintech-accent border border-fintech-accent/50 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all';
            el.progressVix.className = 'h-full bg-fintech-accent transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.8)]'; 
        } else {
            // Roter "Gefahr"-Zustand
            el.badgeVix.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 transition-all';
            el.progressVix.className = 'h-full bg-red-500 transition-all duration-1000 ease-out';
        }
        
        // Balken berechnen und animieren
        const prog = Math.min((state.vix.value / (VIX_THRESHOLD * 1.5)) * 100, 100);
        el.progressVix.style.width = prog + '%';
    }

    // ---- 2. TREND (FTSE) KARTE ----
    if (state.ftse.price !== null && state.ftse.sma200 !== null) {
        animateValue(el.valPrice, state.ftse.price, true);
        animateValue(el.valSma, state.ftse.sma200, true);
        
        el.badgeTrend.innerText = state.ftse.ok ? 'ERFÜLLT' : 'ZU TEUER';
        if(state.ftse.ok) {
            el.badgeTrend.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-fintech-accent/20 text-fintech-accent border border-fintech-accent/50 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all';
        } else {
            el.badgeTrend.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 transition-all';
        }
    }

    // ---- 3. SENTIMENT (Fear & Greed) KARTE ----
    if (state.fng.value !== null) {
        animateValue(el.valFng, state.fng.value, false);
        el.badgeSentiment.innerText = state.fng.ok ? 'PANIK' : 'NORMAL';
        
        if(state.fng.ok) {
            el.badgeSentiment.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-fintech-accent/20 text-fintech-accent border border-fintech-accent/50 shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all';
            el.progressFng.className = 'h-full bg-fintech-accent transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.8)]'; 
        } else {
            el.badgeSentiment.className = 'text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 transition-all';
            el.progressFng.className = 'h-full bg-red-500 transition-all duration-1000 ease-out';
        }
        
        // Da der FNG-Balken von rechts nach links füllt, weil niedrige Werte gut sind:
        el.progressFng.style.width = (100 - state.fng.value) + '%'; 
    }

    // ---- 4. DAS ÜBERGEORDNETE SIGNAL-BANNER ----
    const allOk = state.vix.ok && state.ftse.ok && state.fng.ok;
    const subtextEl = document.querySelector('.status-subtext');

    if (allOk) {
        el.globalIcon.innerText = '🚀';
        el.globalText.innerText = 'KAUFSIGNAL AKTIV!';
        
        // Richtig magisches Leuchten auf dem Text und Rand, wenn alles perfekt ist!
        el.globalText.className = 'text-2xl font-black text-fintech-accent drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all';
        if (subtextEl) subtextEl.innerText = 'Bedingungen sind optimal. Einstieg prüfen.';
        
        el.globalStatus.classList.remove('border-slate-700/50');
        el.globalStatus.classList.add('border-fintech-accent', 'shadow-[0_0_30px_rgba(16,185,129,0.3)]');
        
        sendNotification(); // Push an den User generieren
    } else {
        el.globalIcon.innerText = '⏳';
        el.globalText.innerText = 'Warten auf Signal...';
        el.globalText.className = 'text-xl font-bold text-white transition-all';
        if (subtextEl) subtextEl.innerText = 'Bedingungen noch nicht vollständig erfüllt.';
        
        el.globalStatus.classList.add('border-slate-700/50');
        el.globalStatus.classList.remove('border-fintech-accent', 'shadow-[0_0_30px_rgba(16,185,129,0.3)]');
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
    el.updateTime.innerText = 'Lade Werte...';
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
        el.updateTime.innerText = 'Ladefehler';
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
