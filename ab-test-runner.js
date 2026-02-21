#!/usr/bin/env node
/**
 * A/B Test Runner v4 - Fixed async handling
 */

const fs = require('fs');
const fetch = require('node-fetch');

const tokens = require('./ab-test-tokens.json');

const modes = {
  A: { 
    name: 'Conservative', 
    minScore: 8, 
    minLiquidity: 20000, 
    sl: 10, 
    tp1: 25, 
    tp2: 50,
    entryFib: 0.382,
    tpFib: 1.618
  },
  B: { 
    name: 'Aggressive', 
    minScore: 6, 
    minLiquidity: 10000, 
    sl: 15, 
    tp1: 30, 
    tp2: 74,
    entryFib: 0.500,
    tpFib: 1.272
  },
  C: { 
    name: 'Proven Best', 
    minScore: 6, 
    minLiquidity: 10000, 
    sl: 15, 
    tp1: 30, 
    tp2: 74,
    entryFib: 0.618,
    tpFib: 1.000
  }
};

const results = { A: {wins:0,losses:0,trades:0}, B: {wins:0,losses:0,trades:0}, C: {wins:0,losses:0,trades:0} };

function getBestPair(data) {
  if (!data?.pairs?.length) return null;
  return data.pairs.sort((a,b) => parseFloat(b.liquidity?.usd||0) - parseFloat(a.liquidity?.usd||0))[0];
}

function calcScore(pair) {
  if (!pair) return 0;
  let s = 5;
  const liq = parseFloat(pair.liquidity?.usd||0);
  const vol = parseFloat(pair.volume?.h24||0);
  const chg = parseFloat(pair.priceChange?.h24||0);
  const buys = pair.txns?.h1?.buys||0;
  const sells = pair.txns?.h1?.sells||0;
  const bp = buys / (buys+sells||1);
  
  if (liq>50000) s+=2; else if(liq>20000) s+=1;
  if (vol>100000) s+=2; else if(vol>50000) s+=1;
  if (chg>20) s+=2; else if(chg>10) s+=1; else if(chg<-10) s-=1;
  if (bp>0.6) s+=1; else if(bp<0.4) s-=1;
  return Math.max(1, Math.min(10, s));
}

function simulate(mode, pair) {
  const cfg = modes[mode];
  const score = calcScore(pair);
  if (score < cfg.minScore) return null;
  
  const liquidity = parseFloat(pair.liquidity?.usd||0);
  if (liquidity < cfg.minLiquidity) return null;
  
  const recent = parseFloat(pair.priceChange?.h1||0);
  const proj = recent + (Math.random()-0.45)*10;
  let pnl = proj, exit = 'HOLD';
  
  if (proj >= cfg.tp2) { pnl = cfg.tp2; exit='TP2'; }
  else if (proj >= cfg.tp1) { pnl = cfg.tp1; exit='TP1'; }
  else if (proj <= -cfg.sl) { pnl = -cfg.sl; exit='SL'; }
  
  return {symbol: pair.baseToken?.symbol, score, pnl, exit, liquidity};
}

async function getPair(addr) {
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + addr);
    const d = await r.json();
    return getBestPair(d);
  } catch { return null; }
}

async function run() {
  console.log('\n🚀 A/B TEST RUNNER v4');
  console.log('='.repeat(50));
  
  // Fetch all token data first
  const tokenData = [];
  for (const t of tokens) {
    const p = await getPair(t.address);
    if (p) tokenData.push({symbol: t.symbol, pair: p});
  }
  
  console.log(`Fetched ${tokenData.length} tokens\n`);
  
  // Simulate trades
  for (const {symbol, pair} of tokenData) {
    const sc = calcScore(pair);
    console.log(`${symbol}: score=${sc}, liq=$${parseFloat(pair.liquidity?.usd||0).toFixed(0)}`);
    
    for (const m of ['A','B','C']) {
      const tr = simulate(m, pair);
      if (tr) {
        results[m].trades++;
        if (tr.pnl>0) results[m].wins++;
        else results[m].losses++;
      }
    }
  }
  
  // Report
  console.log('\n📊 RESULTS');
  let msg = '🏆 *A/B TEST RESULTS*\n\n';
  let best = {m: 'A', wr: 0};
  
  for (const m of ['A','B','C']) {
    const r = results[m];
    const wr = r.trades ? (r.wins/r.trades*100).toFixed(1) : 0;
    console.log(`Mode ${m} (${modes[m].name}): ${wr}% WR (${r.wins}W/${r.losses}L)`);
    msg += `*${m}:* ${modes[m].name} - ${wr}% (${r.wins}W/${r.losses}L)\n`;
    if (parseFloat(wr) > best.wr) best = {m, wr: parseFloat(wr), name: modes[m].name};
  }
  
  msg += `\n🏆 *Winner: Mode ${best.m}* - ${best.wr}% WR`;
  console.log(`\n🏆 Winner: Mode ${best.m} (${best.name})`);
  
  // Save results
  fs.writeFileSync('/root/trading-bot/ab-test-results.json', JSON.stringify({results, modes, best, ts: Date.now()}, null, 2));
  
  // Auto-integrate to proven tokens (v3 with centralized threshold)
  try {
    const { execSync } = require('child_process');
    execSync('node /root/trading-bot/src/ab-test-to-proven-v2.js', {stdio: 'inherit'});
  } catch(e) {
    console.log('⚠️ Integration to proven tokens failed');
  }
  
  // Send to Telegram
  try {
    await fetch(`https://api.telegram.org/bot8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU/sendMessage`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({chat_id: '-1003212463774', text: msg, parse_mode: 'Markdown'})
    });
  } catch(e) {}
  
  console.log('\n⏱️ Next run in 1 hour...');
}

run();
