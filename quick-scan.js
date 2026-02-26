#!/usr/bin/env node
// Quick scanner for real-time opportunities
const crypto = require('crypto');
const fetch = require('node-fetch');
const { RSI, MACD, EMA } = require('technicalindicators');

const creds = JSON.parse(require('fs').readFileSync('/root/trading-bot/bitget-credentials.json','utf8'));

const ts = () => Date.now().toString();
const sign = (path, body='') => crypto.createHmac('sha256', creds.secretKey).update(ts() + 'GET' + path + body).digest('base64');

const req = async (path) => {
  const h = { 
    'ACCESS-KEY': creds.apiKey, 
    'ACCESS-SIGN': sign(path), 
    'ACCESS-TIMESTAMP': ts(), 
    'ACCESS-PASSPHRASE': creds.passphrase, 
    'Content-Type': 'application/json' 
  };
  const r = await fetch('https://api.bitget.com'+path, {headers:h});
  const d = await r.json();
  if(d.code !== '00000') throw new Error(d.msg);
  return d.data;
};

(async () => {
  console.log('🔍 Scanning...\n');
  
  const tickers = await req('/api/v2/spot/market/tickers');
  const usdt = tickers.filter(t => t.symbol && t.symbol.endsWith('USDT')).slice(0, 40);
  
  const scored = [];
  
  for (const t of usdt) {
    const chg = Math.abs(parseFloat(t.change24h || 0)) * 100;
    const vol = parseFloat(t.usdtVolume || t.quoteVolume || 0);
    
    if (chg < 2 || vol < 200000) continue;
    
    let ta = {};
    try {
      const candles = await req(`/api/v2/spot/market/candles?symbol=${t.symbol}&granularity=15min&limit=60`);
      if (candles && candles.length >= 26) {
        const closes = candles.map(c => parseFloat(c[4])).reverse();
        const rsi = RSI.calculate({ period: 14, values: closes });
        const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        const ema = EMA.calculate({ period: 20, values: closes });
        
        const r = rsi[rsi.length - 1];
        const m = macd[macd.length - 1];
        const mp = macd[macd.length - 2];
        
        ta = { 
          rsi: r, 
          macdBullish: m?.histogram > 0, 
          macdCross: m?.histogram > 0 && mp?.histogram <= 0,
          ema: closes[closes.length - 1] > ema[ema.length - 1]
        };
      }
    } catch (e) { continue; }
    
    if (!ta.rsi) continue;
    
    let score = 0;
    score += Math.min(chg * 1.5, 30);
    score += Math.min(Math.log10(vol) * 2, 20);
    if (ta.rsi >= 35 && ta.rsi <= 68) score += 5;
    else if (ta.rsi > 68) score -= 8;
    if (ta.macdCross) score += 10;
    if (ta.macdBullish) score += 4;
    if (ta.ema) score += 5;
    
    const bull = [ta.ema, ta.macdBullish, ta.rsi < 70, true].filter(Boolean).length;
    
    if (score >= 70 && bull >= 3) {
      scored.push({
        s: t.symbol,
        p: parseFloat(t.lastPr),
        chg,
        vol,
        score: score.toFixed(1),
        rsi: ta.rsi.toFixed(1),
        macd: ta.macdBullish,
        ema: ta.ema,
        bull,
        macdCross: ta.macdCross
      });
    }
  }
  
  scored.sort((a, b) => b.score - a.score);
  
  console.log('🎯 TOP CANDIDATES (Real-time):\n');
  scored.slice(0, 5).forEach((c, i) => {
    const risk = c.rsi > 65 ? '⚠️' : c.rsi < 40 ? '🔄' : '✅';
    console.log(`${i + 1}. ${c.s} | Score: ${c.score}`);
    console.log(`   Price: $${c.p} | 24h: ${c.chg > 0 ? '+' : ''}${c.chg.toFixed(1)}% | Vol: $${(c.vol / 1e6).toFixed(2)}M`);
    console.log(`   RSI: ${c.rsi} ${risk} | MACD: ${c.macd ? '✅' : '❌'} ${c.macdCross ? '🚀' : ''} | EMA20: ${c.ema ? '✅' : '❌'}`);
    console.log(`   Bullish: ${c.bull}/4\n`);
  });
})();
