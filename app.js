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
    updateTime:       document.getElementById('last-update'),
    globalStatus:     document.getElementById('global-status'),
    globalIcon:       document.getElementById('global-icon'),
    globalText:       document.getElementById('global-text'),
    valVix:           document.getElementById('val-vix'),
    badgeVix:         document.getElementById('badge-vix'),
    progressVix:      document.getElementById('progress-vix'),
    valPrice:         document.getElementById('val-price'),
    valSma:           document.getElementById('val-sma'),
    badgeTrend:       document.getElementById('badge-trend'),
    valFng:           document.getElementById('val-fng'),
    badgeSentiment:   document.getElementById('badge-sentiment'),
    progressFng:      document.getElementById('progress-fng'),
    btnNotif:         document.getElementById('enable-notifications'),
    // Tier 2: Zusatz-Indikatoren
    valCross:         document.getElementById('val-cross'),
    badgeCross:       document.getElementById('badge-cross'),
    txtCrossExpl:     document.getElementById('txt-cross-expl'),
    valSmaDist:       document.getElementById('val-sma-dist'),
    badgeSmaDist:     document.getElementById('badge-sma-dist'),
    txtSmaDistExpl:   document.getElementById('txt-sma-dist-expl'),
    valTreasury:      document.getElementById('val-treasury'),
    badgeTreasury:    document.getElementById('badge-treasury'),
    txtTreasuryExpl:  document.getElementById('txt-treasury-expl'),
    // Tier 3: Bewertungsindikatoren
    valCape:          document.getElementById('val-cape'),
    badgeCape:        document.getElementById('badge-cape'),
    txtCapeExpl:      document.getElementById('txt-cape-expl'),
    valBuffett:       document.getElementById('val-buffett'),
    badgeBuffett:     document.getElementById('badge-buffett'),
    txtBuffettExpl:   document.getElementById('txt-buffett-expl'),
    valPcr:           document.getElementById('val-pcr'),
    badgePcr:         document.getElementById('badge-pcr'),
    txtPcrExpl:       document.getElementById('txt-pcr-expl'),
    valMarginDebt:    document.getElementById('val-margin-debt'),
    badgeMarginDebt:  document.getElementById('badge-margin-debt'),
    txtMarginDebtExpl:document.getElementById('txt-margin-debt-expl'),
    // FRED-Indikatoren (via GitHub Action + data.json)
    valYieldCurve:    document.getElementById('val-yield-curve'),
    badgeYieldCurve:  document.getElementById('badge-yield-curve'),
    txtYieldCurveExpl:document.getElementById('txt-yield-curve-expl'),
    valRealRate:      document.getElementById('val-real-rate'),
    badgeRealRate:    document.getElementById('badge-real-rate'),
    txtRealRateExpl:  document.getElementById('txt-real-rate-expl'),
};

// Der "Zustand" (State) der App. Wenn wir Daten aus dem Internet holen,
// werden diese hier sicher zwischengespeichert.
let state = {
    vix:        { value: null, ok: false },
    ftse:       { price: null, sma200: null, sma50: null, ok: false },
    fng:        { value: null, ok: false },
    cross:      { value: null, isgolden: null },
    smaDist:    { value: null },
    treasury:   { value: null },
    cape:       { value: null },
    buffett:    { value: null },
    pcr:        { value: null },
    marginDebt: { value: null },        // via FRED (data.json)
    yieldCurve: { value: null },        // 10J-2J Spread via FRED (data.json)
    realRate:   { value: null },        // 10J Realzins via FRED (data.json)
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

// ── LIVE-API: FTSE/VWCE Kurs, SMA200 & SMA50 von Yahoo Finance ─
// Einzige Quelle: Yahoo Finance. Kein Fallback.
async function fetchFTSE() {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1y&interval=1d';
    const res = await fetchWithProxy(url);
    const data = await res.json();
    const result = data.chart.result[0];
    const closes = result.indicators.quote[0].close.filter(v => v !== null);
    if (closes.length < 10) throw new Error('Zu wenige Datenpunkte von Yahoo');
    const price  = closes[closes.length - 1];
    const last200 = closes.slice(-200);
    const last50  = closes.slice(-50);
    const sma200 = last200.reduce((a, b) => a + b, 0) / last200.length;
    const sma50  = last50.reduce((a, b) => a + b, 0) / last50.length;
    console.log('[FTSE] Yahoo Wert:', price, 'SMA200:', sma200, 'SMA50:', sma50);
    return {
        price:  Math.round(price  * 100)   / 100,
        sma200: Math.round(sma200 * 10000) / 10000,
        sma50:  Math.round(sma50  * 10000) / 10000
    };
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

// ── LIVE-API: 10-Jährige US-Anleihenrendite (^TNX) ──────────
// Einzige Quelle: Yahoo Finance. Kein Fallback.
async function fetchTreasuryYield() {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=5d&interval=1d';
    const res = await fetchWithProxy(url);
    const data = await res.json();
    const meta = data.chart.result[0].meta;
    const yield10y = parseFloat(meta.regularMarketPrice || meta.previousClose);
    if (!yield10y || yield10y <= 0) throw new Error('Ungültiger Treasury-Wert');
    console.log('[Treasury] 10J-Rendite:', yield10y);
    return yield10y;
}
// ── LIVE-API: CAPE Ratio / Shiller P/E (multpl.com) ──────────
// Einzige Quelle: multpl.com. Kein Fallback.
// Hinweis: Monatlich aktualisiert.
async function fetchCapeRatio() {
    const url = 'https://www.multpl.com/shiller-pe';
    const res = await fetchWithProxy(url);
    const html = await res.text();
    // Mehrere Muster probieren, da multpl.com das Format gelegentlich ändert
    // Format 1: id="current">38.00 (einfach)
    // Format 2: "Current Shiller PE Ratio: 38.00" (in Text)
    // Format 3: id="current-value">38.00
    const patterns = [
        /id=["']current["'][^>]*>\s*([0-9]+\.?[0-9]*)/,
        /Current Shiller PE Ratio[:\s]+([0-9]+\.?[0-9]*)/i,
        /Shiller PE Ratio[^0-9]*([0-9]+\.?[0-9]*)/i,
        /<span[^>]+id=["'][^"']*current[^"']*["'][^>]*>\s*([0-9]+\.?[0-9]*)/i
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const val = parseFloat(match[1]);
            if (!isNaN(val) && val > 5 && val < 200) {
                console.log('[CAPE] Shiller P/E:', val);
                return val;
            }
        }
    }
    throw new Error('CAPE: Kein gültiger Wert auf multpl.com/shiller-pe gefunden');
}

// ── LIVE-API: Buffett-Indikator (currentmarketvaluation.com) ───
// multpl.com hat die Seite entfernt (404).
// Neue Quelle: currentmarketvaluation.com. Kein Fallback.
// Alternativ: Berechnung aus Yahoo Finance Wilshire 5000 + FRED GDP.
async function fetchBuffettIndicator() {
    // Ansatz: Wilshire 5000 Total Market Cap via Yahoo Finance (^W5000)
    // geteilt durch das US-BIP (via FRED ohne Key als statischer Referenzwert ~29000 Mrd.)
    // Da GDP nur quartalsweise verfügbar: Wir holen Wilshire 5000 Niveau und
    // vergleichen mit dem jetzigen BIP-Schätzwert.
    // Sauberste kostenlose Methode: currentmarketvaluation.com scrapen.
    const url = 'https://currentmarketvaluation.com/models/buffett-indicator';
    const res = await fetchWithProxy(url);
    const html = await res.text();
    // Die Seite zeigt typisch: "175.2%" oder "current ratio is 175%"
    const patterns = [
        /current(?:\s+ratio)?(?:\s+is)?[:\s]+([0-9]+\.?[0-9]*)\s*%/i,
        /Buffett\s+Indicator[^0-9]*([0-9]+\.?[0-9]*)\s*%/i,
        /Market\s+Cap.*?GDP[^0-9]*([0-9]+\.?[0-9]*)\s*%/i,
        /([1-2][0-9]{2}(?:\.[0-9]*)?)\s*%/    // Zahl im Bereich 100-299%
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const val = parseFloat(match[1]);
            if (!isNaN(val) && val > 50 && val < 400) {
                console.log('[Buffett] Indikator:', val, '%');
                return val;
            }
        }
    }
    throw new Error('Buffett: Kein gültiger Wert auf currentmarketvaluation.com gefunden');
}

// ── LIVE-API: Put/Call Ratio (CBOE Statistik-Seite HTML) ───
// CBOE CDN blockiert direkte JSON-Requests (403).
// Neuer Ansatz: CBOE Statistik-Seite scrapen.
async function fetchPutCallRatio() {
    const url = 'https://www.cboe.com/us/options/market_statistics/daily/';
    const res = await fetchWithProxy(url);
    const html = await res.text();
    // Die CBOE-Seite zeigt Zeilen wie:
    // "Total Put/Call Ratio" | 0.99
    // "Equity Put/Call Ratio" | 0.56
    // Wir wollen "Equity Put/Call" (genauer für Stimmungsindikator)
    const patterns = [
        /Equity\s+Put\/?Call\s+Ratio[^0-9]*([0-9]+\.[0-9]+)/i,
        /Equity[^<]{0,50}Put\/?Call[^0-9]*([0-9]+\.[0-9]+)/i,
        /Total\s+Put\/?Call\s+Ratio[^0-9]*([0-9]+\.[0-9]+)/i,
        /([0-9]+\.[0-9]{2})(?=\s*<\/td>)/  // Erste Dezimalzahl als Fallback
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const val = parseFloat(match[1]);
            if (!isNaN(val) && val > 0.1 && val < 5) {
                console.log('[Put/Call] CBOE Equity PCR:', val);
                return val;
            }
        }
    }
    throw new Error('Put/Call: Kein gültiger Wert auf CBOE-Seite gefunden');
}

// ── LIVE-API: Margin Debt (FINRA HTML-Scraping) ────────────
// Einzige Quelle: FINRA Margin Statistics. Kein Fallback.
// Hinweis: Monatlich aktualisiert. Wert in Millionen USD.
async function fetchMarginDebt() {
    const url = 'https://www.finra.org/investors/learn-to-invest/advanced-investing/margin-statistics';
    const res = await fetchWithProxy(url);
    const html = await res.text();
    // Suche nach einer großen Zahl (mindestens 6 Ziffern) in der Debittabelle
    // Typisch: 756,123 oder 756123 (in Millionen USD)
    const patterns = [
        /Debit[^<]{0,200}?([4-9]\d{2},\d{3})/si,
        /([4-9]\d{2},\d{3})(?=.*million|.*USD|.*\$)/si,
        /<td[^>]*>\s*([4-9]\d{2},\d{3})\s*<\/td>/i
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const val = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(val) && val > 100000) {
                const billions = val / 1000;
                console.log('[Margin Debt] FINRA:', billions.toFixed(1), 'Mrd. USD');
                return billions; // Rückgabe in Milliarden USD
            }
        }
    }
    throw new Error('Margin Debt: Daten konnten nicht aus FINRA-Seite extrahiert werden');
}

// Wenn eine API nicht erreichbar ist, bleibt der Wert null.
// Die UI zeigt dann eine klare Fehlermeldung statt alter Daten.
async function loadData() {
    console.log('[Dashboard] Starte Live-Datenabfrage...');

    // Parallel: Live-Daten + data.json (für FRED-Werte aus GitHub Action)
    const [vixResult, ftseResult, fngResult, treasuryResult,
           capeResult, buffettResult, pcrResult, fredData] = await Promise.all([
        fetchVIX().catch(e             => { console.error('[VIX] FEHLER:', e.message);         return null; }),
        fetchFTSE().catch(e            => { console.error('[FTSE] FEHLER:', e.message);        return null; }),
        fetchFearGreed().catch(e       => { console.error('[F&G] FEHLER:', e.message);         return null; }),
        fetchTreasuryYield().catch(e   => { console.error('[TNX] FEHLER:', e.message);         return null; }),
        fetchCapeRatio().catch(e       => { console.error('[CAPE] FEHLER:', e.message);        return null; }),
        fetchBuffettIndicator().catch(e=> { console.error('[Buffett] FEHLER:', e.message);     return null; }),
        fetchPutCallRatio().catch(e    => { console.error('[Put/Call] FEHLER:', e.message);    return null; }),
        // FRED-Daten aus data.json (sicher, kein API-Key im Browser)
        fetch('./data.json?t=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}))
    ]);

    const marginDebtFRED  = fredData.margin_debt  ?? null;
    const yieldCurveFRED  = fredData.yield_curve  ?? null;
    const realRateFRED    = fredData.real_rate     ?? null;

    console.log('[FRED] Aus data.json:', { marginDebt: marginDebtFRED, yieldCurve: yieldCurveFRED, realRate: realRateFRED });

    return {
        timestamp:   new Date().toISOString(),
        vix:         vixResult,
        ftse_price:  ftseResult ? ftseResult.price  : null,
        sma200:      ftseResult ? ftseResult.sma200  : null,
        sma50:       ftseResult ? ftseResult.sma50   : null,
        fng:         fngResult,
        treasury:    treasuryResult,
        cape:        capeResult,
        buffett:     buffettResult,
        pcr:         pcrResult,
        marginDebt:  marginDebtFRED,   // FRED (zuverlässig, via GitHub Action)
        yieldCurve:  yieldCurveFRED,   // FRED T10Y2Y
        realRate:    realRateFRED      // FRED DFII10
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

    // ---- 5. GOLDEN / DEATH CROSS ----
    if (el.valCross && state.cross.value !== null && state.cross.isgolden !== null) {
        const isGolden = state.cross.isgolden;
        el.valCross.innerText = isGolden ? 'GOLDEN' : 'DEATH';
        el.valCross.className = isGolden
            ? 'display-lg text-stitch-primary'
            : 'display-lg text-stitch-error';
        el.badgeCross.innerText = isGolden ? 'BULLISH' : 'BEARISH';
        el.badgeCross.className = isGolden
            ? 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 transition-all'
            : 'label-sm px-2 py-0.5 rounded-sm bg-stitch-error/10 text-stitch-error border border-stitch-error/30 transition-all';
        el.txtCrossExpl.innerText = isGolden
            ? `SMA50 (${fmt(state.cross.value)}) liegt ÜBER SMA200 (${fmt(state.ftse.sma200)}) → langfristiger Aufwärtstrend bestätigt.`
            : `SMA50 (${fmt(state.cross.value)}) liegt UNTER SMA200 (${fmt(state.ftse.sma200)}) → Vorsicht, bearisches Signal.`;
    } else if (el.valCross) {
        el.valCross.innerText = '--';
        el.badgeCross.innerText = 'API ERROR';
        el.badgeCross.className = errorBadge;
        if (el.txtCrossExpl) el.txtCrossExpl.innerText = 'Keine Daten verfügbar.';
    }

    // ---- 6. SMA200 ABSTAND % ----
    if (el.valSmaDist && state.smaDist.value !== null) {
        const dist = state.smaDist.value;
        const distFmt = (dist >= 0 ? '+' : '') + fmt(dist, 1) + '%';
        el.valSmaDist.innerText = distFmt;
        let expl = '';
        if (dist < -10) {
            el.badgeSmaDist.innerText = 'STARK ÜBERVERKAUFT';
            el.badgeSmaDist.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 transition-all';
            expl = `ETF liegt ${Math.abs(dist).toFixed(1)}% unter dem SMA200 – historisch starke Kaufgelegenheit.`;
        } else if (dist < -5) {
            el.badgeSmaDist.innerText = 'KAUFZONE';
            el.badgeSmaDist.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-primary/10 text-stitch-primary border border-stitch-primary/30 transition-all';
            expl = `ETF liegt ${Math.abs(dist).toFixed(1)}% unter dem SMA200 – attraktive Kaufzone.`;
        } else if (dist < 0) {
            el.badgeSmaDist.innerText = 'LEICHT DARUNTER';
            el.badgeSmaDist.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-secondary/10 text-stitch-secondary border border-stitch-secondary/30 transition-all';
            expl = `ETF liegt knapp ${Math.abs(dist).toFixed(1)}% unter dem SMA200 – neutraler Bereich.`;
        } else if (dist < 5) {
            el.badgeSmaDist.innerText = 'AM TREND';
            el.badgeSmaDist.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-outline/30 text-stitch-on-surface border border-stitch-outline/30 transition-all';
            expl = `ETF ist nah am SMA200 (+${dist.toFixed(1)}%) – faire Bewertung, kein Extrembereich.`;
        } else if (dist < 15) {
            el.badgeSmaDist.innerText = 'ÜBER TREND';
            el.badgeSmaDist.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-tertiary/10 text-stitch-tertiary border border-stitch-tertiary/20 transition-all';
            expl = `ETF liegt ${dist.toFixed(1)}% über dem SMA200 – leicht erhöht, kein Kaufsignal.`;
        } else {
            el.badgeSmaDist.innerText = 'STARK ÜBERKAUFT';
            el.badgeSmaDist.className = 'label-sm px-2 py-0.5 rounded-sm bg-stitch-error/10 text-stitch-error border border-stitch-error/30 transition-all';
            expl = `ETF liegt ${dist.toFixed(1)}% über dem SMA200 – deutlich überkauft, Vorsicht.`;
        }
        if (el.txtSmaDistExpl) el.txtSmaDistExpl.innerText = expl;
    } else if (el.valSmaDist) {
        el.valSmaDist.innerText = '--';
        el.badgeSmaDist.innerText = 'API ERROR';
        el.badgeSmaDist.className = errorBadge;
        if (el.txtSmaDistExpl) el.txtSmaDistExpl.innerText = 'Keine Daten verfügbar.';
    }

    // ---- 7. 10J US-TREASURY YIELD ----
    if (el.valTreasury && state.treasury.value !== null) {
        const y = state.treasury.value;
        el.valTreasury.innerText = fmt(y, 2) + '%';
        let badge = '', expl = '', cls = '';
        if (y < 3) {
            badge = 'RÜCKENWIND'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${y.toFixed(2)}% – Niedrige Zinsen stützen Aktien. Günstige Bedingungen für Investitionen.`;
        } else if (y < 4) {
            badge = 'NEUTRAL'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${y.toFixed(2)}% – Moderate Zinsen. Aktien und Anleihen konkurrieren gleichwertig.`;
        } else if (y < 4.5) {
            badge = 'LEICHTER GEGENWIND'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${y.toFixed(2)}% – Erhöhte Zinsen erzeugen Gegenwind, Aktien bleiben dennoch attraktiv.`;
        } else if (y < 5) {
            badge = 'GEGENWIND'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `${y.toFixed(2)}% – Deutlicher Zinsgegenwind. Anleihen werden als Alternative attraktiver.`;
        } else {
            badge = 'STARKER GEGENWIND'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${y.toFixed(2)}% – Sehr hohe Zinsen. Signifikanter Gegenwind für Aktien und ETFs.`;
        }
        el.badgeTreasury.innerText = badge;
        el.badgeTreasury.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtTreasuryExpl) el.txtTreasuryExpl.innerText = expl;
    } else if (el.valTreasury) {
        el.valTreasury.innerText = '--';
        el.badgeTreasury.innerText = 'API ERROR';
        el.badgeTreasury.className = errorBadge;
        if (el.txtTreasuryExpl) el.txtTreasuryExpl.innerText = 'Keine Daten verfügbar.';
    }

    // ---- 8. CAPE RATIO / SHILLER P/E ----
    if (el.valCape && state.cape.value !== null) {
        const cape = state.cape.value;
        el.valCape.innerText = fmt(cape, 1);
        let badge, expl, cls;
        if (cape < 15) {
            badge = 'HISTORISCH GÜNSTIG'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `CAPE ${fmt(cape,1)} – Deutlich unter dem historischen Schnitt (~17). Seltene Kaufgelegenheit.`;
        } else if (cape < 22) {
            badge = 'FAIR BEWERTET'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `CAPE ${fmt(cape,1)} – Im Bereich des historischen Durchschnitts. Faire Bewertung des Marktes.`;
        } else if (cape < 28) {
            badge = 'LEICHT ERHÖHT'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `CAPE ${fmt(cape,1)} – Leicht über dem Schnitt. Aktien sind nicht billig, aber noch vertretbar.`;
        } else if (cape < 35) {
            badge = 'TEUER'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `CAPE ${fmt(cape,1)} – Deutlich über dem Schnitt. Höheres Rückschlagrisiko, langfristig vorsichtig.`;
        } else {
            badge = 'HISTORISCH TEUER'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `CAPE ${fmt(cape,1)} – Extrem hoch! Nur in Dotcom-Blase und 2021 so teuer. Erhebliches Rückschlagpotential.`;
        }
        el.badgeCape.innerText = badge;
        el.badgeCape.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtCapeExpl) el.txtCapeExpl.innerText = expl;
    } else if (el.valCape) {
        el.valCape.innerText = '--'; el.badgeCape.innerText = 'API ERROR';
        el.badgeCape.className = errorBadge;
        if (el.txtCapeExpl) el.txtCapeExpl.innerText = 'Daten von multpl.com nicht verfügbar.';
    }

    // ---- 9. BUFFETT-INDIKATOR ----
    if (el.valBuffett && state.buffett.value !== null) {
        const b = state.buffett.value;
        el.valBuffett.innerText = fmt(b, 0) + '%';
        let badge, expl, cls;
        if (b < 75) {
            badge = 'UNTERBEWERTET'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(b,0)}% – Markt klar unterbewertet (Buffetts Empfehlung: kaufen). Selten gute Gelegenheit.`;
        } else if (b < 100) {
            badge = 'FAIR BEWERTET'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(b,0)}% – Faire Bewertung. Buffett sieht hier neutrales Terrain für Investitionen.`;
        } else if (b < 125) {
            badge = 'LEICHT ÜBERBEWERTET'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(b,0)}% – Etwas über fair value. Buffett ist in diesem Bereich vorsichtig.`;
        } else if (b < 150) {
            badge = 'ÜBERBEWERTET'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `${fmt(b,0)}% – Deutlich überbewertet. Buffett hält Cash, kauft kaum noch Aktien.`;
        } else {
            badge = 'EXTREM ÜBERBEWERTET'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${fmt(b,0)}% – Historisch extrem! Buffett warnte ab 135%+ vor Markteinbruch. Große Vorsicht.`;
        }
        el.badgeBuffett.innerText = badge;
        el.badgeBuffett.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtBuffettExpl) el.txtBuffettExpl.innerText = expl;
    } else if (el.valBuffett) {
        el.valBuffett.innerText = '--'; el.badgeBuffett.innerText = 'API ERROR';
        el.badgeBuffett.className = errorBadge;
        if (el.txtBuffettExpl) el.txtBuffettExpl.innerText = 'Daten von multpl.com nicht verfügbar.';
    }

    // ---- 10. PUT/CALL RATIO ----
    if (el.valPcr && state.pcr.value !== null) {
        const pcr = state.pcr.value;
        el.valPcr.innerText = fmt(pcr, 2);
        let badge, expl, cls;
        if (pcr < 0.5) {
            badge = 'EXTREME GIER'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `PCR ${fmt(pcr,2)} – Sehr wenige Absicherungen! Anleger euphorisch. Contrarian: Warnsignal.`;
        } else if (pcr < 0.7) {
            badge = 'GIER'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `PCR ${fmt(pcr,2)} – Wenige Puts, viele Calls. Leichte Euphorie. Eher kein Kaufsignal.`;
        } else if (pcr < 0.9) {
            badge = 'NEUTRAL'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `PCR ${fmt(pcr,2)} – Ausgeglichenes Verhältnis Put/Call. Kein extremes Sentiment.`;
        } else if (pcr < 1.1) {
            badge = 'ANGST'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `PCR ${fmt(pcr,2)} – Viele Puts! Anleger sichern sich stark ab. Contrarian: Kaufgelegenheit.`;
        } else {
            badge = 'EXTREME ANGST'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `PCR ${fmt(pcr,2)} – Extreme Absicherung! Historisch starkes contrarian Kaufsignal.`;
        }
        el.badgePcr.innerText = badge;
        el.badgePcr.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtPcrExpl) el.txtPcrExpl.innerText = expl;
    } else if (el.valPcr) {
        el.valPcr.innerText = '--'; el.badgePcr.innerText = 'API ERROR';
        el.badgePcr.className = errorBadge;
        if (el.txtPcrExpl) el.txtPcrExpl.innerText = 'Daten von CBOE nicht verfügbar.';
    }

    // ---- 11. MARGIN DEBT ----
    if (el.valMarginDebt && state.marginDebt.value !== null) {
        const md = state.marginDebt.value; // in Milliarden USD
        el.valMarginDebt.innerText = '$' + fmt(md, 0) + 'B';
        let badge, expl, cls;
        if (md < 500) {
            badge = 'NIEDRIG'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `$${fmt(md,0)}B – Margin Debt niedrig. Kein Hebel-Exzess im Markt. Gesundes Umfeld.`;
        } else if (md < 700) {
            badge = 'MODERAT'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `$${fmt(md,0)}B – Normales Niveau. Kreditfinanzierte Käufe halten sich im Rahmen.`;
        } else if (md < 850) {
            badge = 'ERHÖHT'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `$${fmt(md,0)}B – Erhöhter Fremdkapitaleinsatz. Rücksetzer können verstärkt werden.`;
        } else if (md < 1000) {
            badge = 'HOCH'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `$${fmt(md,0)}B – Hohes Niveau! Droht Deleveraging, können Kurse schnell fallen.`;
        } else {
            badge = 'EXTREME ÜBERHITZUNG'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `$${fmt(md,0)}B – Historisches Extrem! 2021 auf Rekordhöhe. Starkes Warnsignal.`;
        }
        el.badgeMarginDebt.innerText = badge;
        el.badgeMarginDebt.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtMarginDebtExpl) el.txtMarginDebtExpl.innerText = expl + ' (via FRED® API · quarterly)';
    } else if (el.valMarginDebt) {
        el.valMarginDebt.innerText = '--'; el.badgeMarginDebt.innerText = 'API ERROR';
        el.badgeMarginDebt.className = errorBadge;
        if (el.txtMarginDebtExpl) el.txtMarginDebtExpl.innerText = 'Daten von FINRA nicht verfügbar.';
    }

    // ---- 12. ZINSKURVE (10J - 2J Spread) ────── via FRED ─────
    if (el.valYieldCurve && state.yieldCurve.value !== null) {
        const yc = state.yieldCurve.value;
        el.valYieldCurve.innerText = (yc >= 0 ? '+' : '') + fmt(yc, 2) + '%';
        let badge, expl, cls;
        if (yc < -0.5) {
            badge = 'INVERTIERT'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `Spread: ${fmt(yc,2)}% – Stark invertierte Zinskurve! Historisch zuverlässigster Rezessionsindikator. Vorsicht.`;
        } else if (yc < 0) {
            badge = 'LEICHT INVERTIERT'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `Spread: ${fmt(yc,2)}% – Leicht invertiert. Wirtschaft unter Stress. Erhöhtes Rezessionsrisiko.`;
        } else if (yc < 0.5) {
            badge = 'FLACH'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `Spread: ${fmt(yc,2)}% – Nahe Null. Wirtschaft in Übergangsphase, kein klares Signal.`;
        } else if (yc < 1.5) {
            badge = 'NORMAL'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `Spread: ${fmt(yc,2)}% – Gesunde Zinskurve. Kein Rezessionssignal. Günstiges Umfeld.`;
        } else {
            badge = 'STEIL'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `Spread: ${fmt(yc,2)}% – Sehr steile Kurve. Markt erwartet starkes Wirtschaftswachstum. Bullish.`;
        }
        el.badgeYieldCurve.innerText = badge;
        el.badgeYieldCurve.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtYieldCurveExpl) el.txtYieldCurveExpl.innerText = expl;
    } else if (el.valYieldCurve) {
        el.valYieldCurve.innerText = '--'; el.badgeYieldCurve.innerText = 'API ERROR';
        el.badgeYieldCurve.className = errorBadge;
        if (el.txtYieldCurveExpl) el.txtYieldCurveExpl.innerText = 'FRED-Daten nicht verfügbar (data.json nicht aktuell).';
    }

    // ---- 13. REALZINS 10J (TIPS) ─────────────── via FRED ────
    if (el.valRealRate && state.realRate.value !== null) {
        const rr = state.realRate.value;
        el.valRealRate.innerText = fmt(rr, 2) + '%';
        let badge, expl, cls;
        if (rr < 0) {
            badge = 'NEGATIV'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(rr,2)}% – Negativer Realzins! Anleger werden für Cash bestraft. Starker Rückenwind für Aktien.`;
        } else if (rr < 0.5) {
            badge = 'SEHR NIEDRIG'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(rr,2)}% – Sehr niedriger Realzins. Günstig für Aktien und Wachstumswerte.`;
        } else if (rr < 1.5) {
            badge = 'MODERAT'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(rr,2)}% – Normales Niveau. Neutrales Umfeld für Aktieninvestitionen.`;
        } else if (rr < 2.5) {
            badge = 'ERHÖHT'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(rr,2)}% – Hoher Realzins. Anleihen werden attraktiver. Gegenwind für Aktien.`;
        } else {
            badge = 'STARK ERHÖHT'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${fmt(rr,2)}% – Sehr hoher Realzins! Deutlicher Bewertungsdruck auf Aktien. Historisch selten.`;
        }
        el.badgeRealRate.innerText = badge;
        el.badgeRealRate.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtRealRateExpl) el.txtRealRateExpl.innerText = expl;
    } else if (el.valRealRate) {
        el.valRealRate.innerText = '--'; el.badgeRealRate.innerText = 'API ERROR';
        el.badgeRealRate.className = errorBadge;
        if (el.txtRealRateExpl) el.txtRealRateExpl.innerText = 'FRED-Daten nicht verfügbar (data.json nicht aktuell).';
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
            state.ftse.price  = d.ftse_price;
            state.ftse.sma200 = d.sma200;
            state.ftse.sma50  = d.sma50;
            state.ftse.ok     = d.ftse_price <= d.sma200;

            // Golden/Death Cross & SMA-Abstand berechnen
            if (d.sma50 != null) {
                state.cross.value    = d.sma50;
                state.cross.isgolden = d.sma50 >= d.sma200;
                state.smaDist.value  = ((d.ftse_price - d.sma200) / d.sma200) * 100;
            }
        }
        if (d.fng != null) {
            state.fng.value = d.fng;
            state.fng.ok    = d.fng < FNG_THRESHOLD;
        }
        if (d.treasury != null)    { state.treasury.value   = d.treasury; }
        if (d.cape != null)        { state.cape.value        = d.cape; }
        if (d.buffett != null)     { state.buffett.value     = d.buffett; }
        if (d.pcr != null)         { state.pcr.value         = d.pcr; }
        if (d.marginDebt != null)  { state.marginDebt.value  = d.marginDebt; }
        if (d.yieldCurve != null)  { state.yieldCurve.value  = d.yieldCurve; }
        if (d.realRate != null)    { state.realRate.value    = d.realRate; }
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
