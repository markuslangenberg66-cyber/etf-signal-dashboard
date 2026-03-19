const https = require('https');
const fs    = require('fs');

function get(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...extraHeaders } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    }).on('error', reject);
  });
}

async function main() {
  const result = { timestamp: new Date().toISOString(), vix: null, ftse_price: null, sma200: null, fng: null };

  // VIX
  try {
    const r = await get('https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/_VIX.json');
    const data = JSON.parse(r.data);
    result.vix = parseFloat(data.data[data.data.length - 1].close);
    console.log('VIX:', result.vix);
  } catch(e) { console.error('VIX:', e.message); }

  // FTSE
  try {
    const r = await get('https://stooq.com/q/d/l/?s=vwce.de&i=d');
    const lines = r.data.trim().split('\n').slice(1).filter(Boolean);
    const closes = lines.map(l => parseFloat(l.split(',')[4])).filter(n => !isNaN(n) && n > 0);
    result.ftse_price = closes[closes.length - 1];
    const last200 = closes.slice(-200);
    result.sma200 = Math.round((last200.reduce((a,b) => a+b, 0) / last200.length) * 10000) / 10000;
    console.log('FTSE:', result.ftse_price, 'SMA200:', result.sma200);
  } catch(e) { console.error('FTSE:', e.message); }

  // F&G - CNN with browser-like accept headers
  try {
    const r = await get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://edition.cnn.com/'
    });
    console.log('CNN status:', r.status, r.data.substring(0, 100));
    if (r.status === 200) {
      const data = JSON.parse(r.data);
      result.fng = parseFloat(data.fear_and_greed.score);
    }
  } catch(e) { console.error('CNN F&G:', e.message); }

  // F&G fallback: alternative.me  
  if (result.fng === null) {
    try {
      const r = await get('https://api.alternative.me/fng/?limit=1');
      console.log('alternative.me status:', r.status, r.data.substring(0, 100));
      const data = JSON.parse(r.data);
      result.fng = Number(data.data[0].value);
    } catch(e) { console.error('alternative.me:', e.message); }
  }

  console.log('\nF&G:', result.fng);
  fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
  console.log('\ndata.json geschrieben:', JSON.stringify(result));
}

main();
