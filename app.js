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
    // Score Engine DOM Refs
    scoreDisplay:     document.getElementById('composite-score-display'),
    scoreBar:         document.getElementById('composite-score-bar'),
    scoreBadge:       document.getElementById('composite-score-badge'),
    scoreExpl:        document.getElementById('composite-score-expl'),
    // Score factor mini-bars
    sbYc:  document.getElementById('sb-yc'),
    sbRr:  document.getElementById('sb-rr'),
    sbHys: document.getElementById('sb-hys'),
    sbUr:  document.getElementById('sb-ur'),
    sbIc:  document.getElementById('sb-ic'),
    sbCs:  document.getElementById('sb-cs'),
    // FRED Score Karten
    valUnrate:    document.getElementById('val-unrate'),
    badgeUnrate:  document.getElementById('badge-unrate'),
    txtUnrateExpl:document.getElementById('txt-unrate-expl'),
    valIcsa:      document.getElementById('val-icsa'),
    badgeIcsa:    document.getElementById('badge-icsa'),
    txtIcsaExpl:  document.getElementById('txt-icsa-expl'),
    valHys:       document.getElementById('val-hys'),
    badgeHys:     document.getElementById('badge-hys'),
    txtHysExpl:   document.getElementById('txt-hys-expl'),
    valFedfunds:  document.getElementById('val-fedfunds'),
    badgeFedfunds:document.getElementById('badge-fedfunds'),
    txtFedfundsExpl: document.getElementById('txt-fedfunds-expl'),
    valEurusd:    document.getElementById('val-eurusd'),
    badgeEurusd:  document.getElementById('badge-eurusd'),
    txtEurusdExpl:document.getElementById('txt-eurusd-expl'),
    valUmcsent:   document.getElementById('val-umcsent'),
    badgeUmcsent: document.getElementById('badge-umcsent'),
    txtUmcsentExpl: document.getElementById('txt-umcsent-expl'),
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
    marginDebt: { value: null },
    yieldCurve: { value: null },
    realRate:   { value: null },
    // ── Market Conditions Score Engine (FRED®) ────────────────
    unrate:     { value: null },    // Arbeitslosenquote %
    icsa:       { value: null },    // Initial Jobless Claims (4w-Avg)
    hys:        { value: null },    // High Yield OAS Spread %
    fedfunds:   { value: null },    // Federal Funds Rate %
    eurusd:     { value: null },    // EUR/USD Wechselkurs
    umcsent:    { value: null },    // UMich Consumer Sentiment 0-100+
    compositeScore: null,           // Berechneter Score 0-100
    scoreBreakdown: {},             // Faktor-Aufschlüsselung
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

    // Parallel: Live-Daten + data.json (fuer FRED-Werte aus GitHub Action)
    // CAPE + Buffett + PCR via Scraping entfernt – CAPE/PCR haben keine zuverlaessige Quelle,
    // Buffett kommt jetzt sauber via FRED (WILL5000INDFC / GDP)
    const [vixResult, ftseResult, fngResult, treasuryResult, fredData] = await Promise.all([
        fetchVIX().catch(e           => { console.error('[VIX] FEHLER:', e.message);   return null; }),
        fetchFTSE().catch(e          => { console.error('[FTSE] FEHLER:', e.message);  return null; }),
        fetchFearGreed().catch(e     => { console.error('[F&G] FEHLER:', e.message);   return null; }),
        fetchTreasuryYield().catch(e => { console.error('[TNX] FEHLER:', e.message);   return null; }),
        // FRED-Daten aus data.json (sicher, kein API-Key im Browser)
        fetch('./data.json?t=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}))
    ]);

    const marginDebtFRED = fredData.margin_debt  ?? null;
    const yieldCurveFRED = fredData.yield_curve  ?? null;
    const realRateFRED   = fredData.real_rate     ?? null;
    const buffettFRED    = fredData.buffett       ?? null;  // via WILL5000INDFC/GDP

    console.log('[FRED] Aus data.json:', {
        marginDebt: marginDebtFRED, yieldCurve: yieldCurveFRED,
        realRate: realRateFRED, buffett: buffettFRED
    });

    return {
        timestamp:   new Date().toISOString(),
        vix:         vixResult,
        ftse_price:  ftseResult ? ftseResult.price  : null,
        sma200:      ftseResult ? ftseResult.sma200  : null,
        sma50:       ftseResult ? ftseResult.sma50   : null,
        fng:         fngResult,
        treasury:    treasuryResult,
        buffett:     buffettFRED,       // FRED: WILL5000INDFC / GDP * 100
        marginDebt:  marginDebtFRED,
        yieldCurve:  yieldCurveFRED,
        realRate:    realRateFRED,
        // Score Engine - 6 neue Felder aus data.json
        unrate:   fredData.unrate   ?? null,
        icsa:     fredData.icsa     ?? null,
        hys:      fredData.hys      ?? null,
        fedfunds: fredData.fedfunds ?? null,
        eurusd:   fredData.eurusd   ?? null,
        umcsent:  fredData.umcsent  ?? null
    };
}

// ── MARKET CONDITIONS SCORE ENGINE ────────────────────────
// Regelbasiertes Bewertungssystem: 6 Faktoren, max. 100 Punkte.
// KEINE Kursvorhersage! Zeigt ob Bedingungen historisch günstig sind.
function calculateCompositeScore() {
    let totalPts = 0;
    let maxPts   = 0;
    const bd = {}; // breakdown

    // ① Zinskurve T10Y2Y (max 20 Pkt) – höher = besser
    if (state.yieldCurve.value !== null) {
        const yc = state.yieldCurve.value;
        const p  = yc > 1.5 ? 20 : yc > 0.5 ? 16 : yc > 0 ? 10 : yc > -0.5 ? 4 : 0;
        totalPts += p; maxPts += 20;
        bd.yieldCurve = { pts: p, max: 20, val: yc };
    }
    // ② Realzins DFII10 (max 15 Pkt) – niedriger = besser
    if (state.realRate.value !== null) {
        const rr = state.realRate.value;
        const p  = rr < 0 ? 15 : rr < 1 ? 11 : rr < 2 ? 7 : rr < 2.5 ? 3 : 0;
        totalPts += p; maxPts += 15;
        bd.realRate = { pts: p, max: 15, val: rr };
    }
    // ③ High-Yield Spread BAMLH0A0HYM2 (max 20 Pkt) – niedriger = besser
    if (state.hys.value !== null) {
        const hys = state.hys.value;
        const p   = hys < 3 ? 20 : hys < 4 ? 15 : hys < 5 ? 10 : hys < 7 ? 4 : 0;
        totalPts += p; maxPts += 20;
        bd.hys = { pts: p, max: 20, val: hys };
    }
    // ④ Arbeitslosenquote UNRATE (max 15 Pkt) – 4-5% optimal
    if (state.unrate.value !== null) {
        const ur = state.unrate.value;
        const p  = ur < 3.5 ? 10 : ur < 5 ? 15 : ur < 6.5 ? 8 : ur < 8 ? 3 : 1;
        totalPts += p; maxPts += 15;
        bd.unrate = { pts: p, max: 15, val: ur };
    }
    // ⑤ Initial Claims ICSA (max 15 Pkt) – niedriger = besser
    if (state.icsa.value !== null) {
        const ic = state.icsa.value;
        const p  = ic < 220000 ? 15 : ic < 260000 ? 12 : ic < 310000 ? 7 : ic < 400000 ? 3 : 0;
        totalPts += p; maxPts += 15;
        bd.icsa = { pts: p, max: 15, val: ic };
    }
    // ⑥ Consumer Sentiment UMCSENT (max 15 Pkt) – höher = besser
    if (state.umcsent.value !== null) {
        const cs = state.umcsent.value;
        const p  = cs > 90 ? 15 : cs > 75 ? 12 : cs > 60 ? 8 : cs > 50 ? 5 : 2;
        totalPts += p; maxPts += 15;
        bd.umcsent = { pts: p, max: 15, val: cs };
    }

    if (maxPts === 0) { state.compositeScore = null; state.scoreBreakdown = bd; return; }
    state.compositeScore = Math.round((totalPts / maxPts) * 100);
    state.scoreBreakdown = bd;
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

    // ┌──────────────────────────────────────────────────────────────
    // │         MARKET CONDITIONS SCORE (0–100)                  │
    // └─────────────────────────────────────────────────────────────┘
    if (el.scoreDisplay) {
        const s = state.compositeScore;
        if (s !== null) {
            // Score-Zahl
            el.scoreDisplay.innerText = s;

            // Farbe und Label je nach Score-Höhe
            let color, label, expl;
            if (s >= 80) {
                color = 'text-stitch-primary drop-shadow-[0_0_30px_rgba(70,241,197,0.5)]';
                label = '🚀 STARKE KAUFBEDINGUNGEN';
                expl = `Score ${s}/100 – Alle wichtigen Marktbedingungen sind gleichzeitig bullisch ausgerichtet. Historisch sehr günstige Einstiegsphase.`;
            } else if (s >= 60) {
                color = 'text-stitch-primary';
                label = '✅ GÜNSTIGE BEDINGUNGEN';
                expl = `Score ${s}/100 – Mehrheit der Indikatoren zeigt positives Umfeld. Gutes Zeitfenster für positionsaufbau.`;
            } else if (s >= 40) {
                color = 'text-yellow-300';
                label = '⚖️ NEUTRALE PHASE';
                expl = `Score ${s}/100 – Gemischtes Bild. Einige Faktoren positiv, andere negativ. Kein klares Kaufsignal.`;
            } else if (s >= 20) {
                color = 'text-stitch-tertiary';
                label = '⚠️ VORSICHT';
                expl = `Score ${s}/100 – Mehrheit der Bedingungen bremst. Riskantes Einstiegsumfeld. Abwarten empfohlen.`;
            } else {
                color = 'text-stitch-error';
                label = '🔴 RISIKO-UMFELD';
                expl = `Score ${s}/100 – Stark bremsendes Marktumfeld. Historisch hohe Verlustwahrscheinlichkeit. Kein Einstieg.`;
            }

            el.scoreDisplay.className = `text-8xl sm:text-9xl font-black leading-none transition-all ${color}`;
            el.scoreBadge.innerText = label;
            if (el.scoreExpl) el.scoreExpl.innerText = expl;

            // Fortschrittsbalken (gefärbt 0-100%)
            const barColor = s >= 80 ? 'bg-stitch-primary shadow-[0_0_20px_rgba(70,241,197,0.4)]'
                           : s >= 60 ? 'bg-stitch-primary/70'
                           : s >= 40 ? 'bg-yellow-400/70'
                           : s >= 20 ? 'bg-stitch-tertiary/70' : 'bg-stitch-error/70';
            el.scoreBar.style.width = s + '%';
            el.scoreBar.className = `h-full transition-all duration-1000 ease-out rounded-full ${barColor}`;

            // Faktor-Mini-Bars aktualisieren
            const bd = state.scoreBreakdown;
            const setBar = (el, pts, max) => { if(el) el.style.width = (max > 0 ? Math.round((pts/max)*100) : 0) + '%'; };
            setBar(el.sbYc,  bd.yieldCurve?.pts ?? 0, bd.yieldCurve?.max ?? 20);
            setBar(el.sbRr,  bd.realRate?.pts   ?? 0, bd.realRate?.max   ?? 15);
            setBar(el.sbHys, bd.hys?.pts        ?? 0, bd.hys?.max        ?? 20);
            setBar(el.sbUr,  bd.unrate?.pts     ?? 0, bd.unrate?.max     ?? 15);
            setBar(el.sbIc,  bd.icsa?.pts       ?? 0, bd.icsa?.max       ?? 15);
            setBar(el.sbCs,  bd.umcsent?.pts    ?? 0, bd.umcsent?.max    ?? 15);
        } else {
            el.scoreDisplay.innerText = '--';
            el.scoreDisplay.className = 'text-8xl sm:text-9xl font-black leading-none text-stitch-outline/40';
            if (el.scoreBadge) el.scoreBadge.innerText = 'FRED-DATEN WERDEN GELADEN...';
            if (el.scoreExpl)  el.scoreExpl.innerText = 'Der Score berechnet sich automatisch, sobald die FRED-Daten via GitHub Action verfügbar sind.';
        }
    }

    // ─ SCORE KARTEN: UNRATE ───────────────────────────────────────────
    if (el.valUnrate && state.unrate.value !== null) {
        const ur = state.unrate.value;
        el.valUnrate.innerText = fmt(ur, 1) + '%';
        let badge, expl, cls;
        if (ur < 3.5) {
            badge = 'ÜBERHITZUNG?'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(ur,1)}% – Extrem niedriger Wert. Kann auf Überhitzung und späteren Inflationsdruck hinweisen.`;
        } else if (ur < 5) {
            badge = 'STARK'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(ur,1)}% – Starker Arbeitsmarkt. Idealer Bereich: Wirtschaft wächst ohne Überhitzung.`;
        } else if (ur < 6.5) {
            badge = 'MODERAT'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(ur,1)}% – Normaler Bereich. Keine akute Rezessionsgefahr, aber Vorsicht angebracht.`;
        } else {
            badge = 'SCHWACH'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${fmt(ur,1)}% – Deutlich erhöhte Arbeitslosigkeit. Rezession wahrscheinlich, Märkte unter Druck.`;
        }
        el.badgeUnrate.innerText = badge; el.badgeUnrate.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtUnrateExpl) el.txtUnrateExpl.innerText = expl;
    } else if (el.valUnrate) {
        el.valUnrate.innerText = '--'; el.badgeUnrate.innerText = 'API ERROR'; el.badgeUnrate.className = errorBadge;
    }

    // ─ SCORE KARTEN: ICSA ────────────────────────────────────────────
    if (el.valIcsa && state.icsa.value !== null) {
        const ic = state.icsa.value;
        const icK = (ic / 1000).toFixed(0);
        el.valIcsa.innerText = icK + 'K';
        let badge, expl, cls;
        if (ic < 220000) {
            badge = 'SEHR GUT'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${icK}K – Sehr wenige Entlassungen. Arbeitsmarkt sehr fest. Positives Signal.`;
        } else if (ic < 260000) {
            badge = 'GUT'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${icK}K – Normaler Bereich. Kein Stress im Arbeitsmarkt sichtbar.`;
        } else if (ic < 310000) {
            badge = 'ERHOHT'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${icK}K – Leichter Aufwärtstrend bei Entlassungen. Erste Warnsignale.`;
        } else {
            badge = 'ALARM'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${icK}K – Starker Anstieg! Massenentlassungen beginnen. Rezession nähert sich.`;
        }
        el.badgeIcsa.innerText = badge; el.badgeIcsa.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtIcsaExpl) el.txtIcsaExpl.innerText = expl;
    } else if (el.valIcsa) {
        el.valIcsa.innerText = '--'; el.badgeIcsa.innerText = 'API ERROR'; el.badgeIcsa.className = errorBadge;
    }

    // ─ SCORE KARTEN: HIGH YIELD SPREAD ───────────────────────────
    if (el.valHys && state.hys.value !== null) {
        const hys = state.hys.value;
        el.valHys.innerText = fmt(hys, 2) + '%';
        let badge, expl, cls;
        if (hys < 3) {
            badge = 'RISIKOAPPETIT'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(hys,2)}% – Sehr enger Spread. Profis nehmen freudvoll Risiko. Starker Risk-On Modus.`;
        } else if (hys < 4) {
            badge = 'NORMAL'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(hys,2)}% – Historisch normaler Bereich. Keine erhöhte Kreditstress-Warnung.`;
        } else if (hys < 5.5) {
            badge = 'ERHOHT'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(hys,2)}% – Spreads weiten sich. Profis preisen mehr Ausfallrisiko ein. Vorsicht.`;
        } else if (hys < 7) {
            badge = 'STRESS'; cls = 'bg-stitch-tertiary/10 text-stitch-tertiary border-stitch-tertiary/20';
            expl = `${fmt(hys,2)}% – Kreditstress sichtbar. Typisch für Rezessionen oder Krisen.`;
        } else {
            badge = 'PANIK'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${fmt(hys,2)}% – Extremwert! Letztes Mal so hoch: 2020 (Covid), 2009 (Finanzkrise).`;
        }
        el.badgeHys.innerText = badge; el.badgeHys.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtHysExpl) el.txtHysExpl.innerText = expl;
    } else if (el.valHys) {
        el.valHys.innerText = '--'; el.badgeHys.innerText = 'API ERROR'; el.badgeHys.className = errorBadge;
    }

    // ─ SCORE KARTEN: FED FUNDS RATE ──────────────────────────────
    if (el.valFedfunds && state.fedfunds.value !== null) {
        const ff = state.fedfunds.value;
        el.valFedfunds.innerText = fmt(ff, 2) + '%';
        let badge, expl, cls;
        if (ff < 2) {
            badge = 'EXPANSIV'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(ff,2)}% – Lockere Geldpolitik. Sehr günstig für Aktien und Wachstumswerte.`;
        } else if (ff < 3.5) {
            badge = 'NEUTRAL'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(ff,2)}% – Normalisierte Zinsen. Weder Bremse noch Gas für Märkte.`;
        } else if (ff < 5) {
            badge = 'RESTRIKTIV'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(ff,2)}% – Fed bremst Wirtschaft. Höherer Druck auf Aktienmarkt.`;
        } else {
            badge = 'STARK RESTRIKTIV'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${fmt(ff,2)}% – Sehr hohe Zinsen! Historisch hat das Rezessionen auslöst. Große Vorsicht.`;
        }
        el.badgeFedfunds.innerText = badge; el.badgeFedfunds.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtFedfundsExpl) el.txtFedfundsExpl.innerText = expl;
    } else if (el.valFedfunds) {
        el.valFedfunds.innerText = '--'; el.badgeFedfunds.innerText = 'API ERROR'; el.badgeFedfunds.className = errorBadge;
    }

    // ─ SCORE KARTEN: EUR/USD ──────────────────────────────────────────
    if (el.valEurusd && state.eurusd.value !== null) {
        const eu = state.eurusd.value;
        el.valEurusd.innerText = fmt(eu, 4);
        let badge, expl, cls;
        if (eu > 1.12) {
            badge = 'EUR STARK'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(eu,4)} – Starker Euro. USD-Anlagen bringen weniger in EUR um. Dämpft VWCE-Rendite.`;
        } else if (eu > 1.05) {
            badge = 'AUSGEWOGEN'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(eu,4)} – EUR/USD in normalem Bereich. Neutraler Einfluss auf VWCE in Euro.`;
        } else {
            badge = 'EUR SCHWACH'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(eu,4)} – Schwacher Euro. USD-Anlagen in EUR umgerechnet teurer. Erhöht VWCE-Kurs in EUR.`;
        }
        el.badgeEurusd.innerText = badge; el.badgeEurusd.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtEurusdExpl) el.txtEurusdExpl.innerText = expl;
    } else if (el.valEurusd) {
        el.valEurusd.innerText = '--'; el.badgeEurusd.innerText = 'API ERROR'; el.badgeEurusd.className = errorBadge;
    }

    // ─ SCORE KARTEN: CONSUMER SENTIMENT ──────────────────────────
    if (el.valUmcsent && state.umcsent.value !== null) {
        const cs = state.umcsent.value;
        el.valUmcsent.innerText = fmt(cs, 1);
        let badge, expl, cls;
        if (cs > 90) {
            badge = 'EUPHORISCH'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(cs,1)} – Sehr optimistische Konsumenten. Starkes Wirtschaftsvertrauen.`;
        } else if (cs > 75) {
            badge = 'POSITIV'; cls = 'bg-stitch-primary/10 text-stitch-primary border-stitch-primary/30';
            expl = `${fmt(cs,1)} – Gesundes Verbrauchervertrauen. Günstig für Konsum und Wirtschaftswachstum.`;
        } else if (cs > 60) {
            badge = 'NEUTRAL'; cls = 'bg-stitch-outline/30 text-stitch-on-surface border-stitch-outline/30';
            expl = `${fmt(cs,1)} – Durchschnittliche Stimmung. Wirtschaft läuft, aber keine Euphorie.`;
        } else if (cs > 50) {
            badge = 'VERUNSICHERT'; cls = 'bg-stitch-secondary/10 text-stitch-secondary border-stitch-secondary/30';
            expl = `${fmt(cs,1)} – Gedämpfte Stimmung. Konsumenten zurückhaltend, oft Vorböte für Abschwung.`;
        } else {
            badge = 'ANGST'; cls = 'bg-stitch-error/10 text-stitch-error border-stitch-error/30';
            expl = `${fmt(cs,1)} – Sehr gedrücktes Vertrauen! Historisch oft auf Rezessionen folgend.`;
        }
        el.badgeUmcsent.innerText = badge; el.badgeUmcsent.className = `label-sm px-2 py-0.5 rounded-sm border transition-all ${cls}`;
        if (el.txtUmcsentExpl) el.txtUmcsentExpl.innerText = expl;
    } else if (el.valUmcsent) {
        el.valUmcsent.innerText = '--'; el.badgeUmcsent.innerText = 'API ERROR'; el.badgeUmcsent.className = errorBadge;
    }

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
        if (d.unrate   != null)    { state.unrate.value      = d.unrate; }
        if (d.icsa     != null)    { state.icsa.value        = d.icsa; }
        if (d.hys      != null)    { state.hys.value         = d.hys; }
        if (d.fedfunds != null)    { state.fedfunds.value    = d.fedfunds; }
        if (d.eurusd   != null)    { state.eurusd.value      = d.eurusd; }
        if (d.umcsent  != null)    { state.umcsent.value     = d.umcsent; }
        // Score berechnen
        calculateCompositeScore();
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
