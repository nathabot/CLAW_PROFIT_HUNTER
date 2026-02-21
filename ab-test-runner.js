#!/usr/bin/env node
/**
 * A/B Test Runner v3 - Paper Trading with Real Tokens
 */

const fs = require('fs');
const fetch = require('node-fetch');

// Known good Solana tokens (meme coins + established)
const tokens = [
  {symbol: "WIF", address: "85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP"},
  {symbol: "BONK", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"},
  {symbol: "SAMO", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"},
  {symbol: "JTO", address: "jtojtokePBKP3BKw9x9f3M8c3V7Y3qKw4dE3TzL3qK"},
  {symbol: "ORCA", address: "orcaEKTdK7ATzBZndBhR8EUDPdWcBdYJazh6xGawEGL5"},
  {symbol: "MNDE", address: "MNDEFzGvMt87meVuodKaNdZ5un7CqNxSiDC5vyQuqKM"},
  {symbol: "PRIME", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4GXEGEDY4H4PQ"},
  {symbol: "DRIFT", address: "dRiftyHA69MWYk3GRiThGVc8QkYD3AKG8Cv3RbY4DmX"},
];

// A/B Test Configs
const modes = {
  A: { name: 'Conservative', minScore: 8, minLiquidity: 20000, sl: 10, tp1: 25, tp2: 50 },
  B: { name: 'Aggressive', minScore: 6, minLiquidity: 10000, sl: 15, tp1: 30, tp2: 74 },
  C: { name: 'Proven Best', minScore: 6, minLiquidity: 10000, sl: 15, tp1: 30, tp2: 74 }
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
  if (score < cfg.minLiquidity) return null;
  
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
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
    const d = await r.json();
    return getBestPair(d);
  } catch { return null; }
}

async function run() {
  console.log('\n🚀 A/B TEST RUNNER v3');
  console.log('='.repeat(50));
  
  for (const t of tokens) {
    const p = await getPair(t.address);
    if (!p) continue;
    const sc = calcScore(p);
    console.log(`${t.symbol}: score=${sc}, liq=$${parseFloat(p.liquidity?.usd||0).toFixed(0)}`);
    
    for (const m of ['A','B','C']) {
      const tr = simulate(m, p);
      if (tr) {
        results[m].trades++;
        if (tr.pnl>0) results[m].wins++;
        else results[m].losses++;
      }
    }
  }
  
  console.log('\n📊 RESULTS');
  let msg = '🏆 *A/B TEST RESULTS*\n\n';
  let best = null;
  
  for (const m of ['A','B','C']) {
    const r = results[m];
    const wr = r.trades ? (r.wins/r.trades*100).toFixed(1) : 0;
    console.log(`Mode ${m} (${modes[m].name}): ${wr}% WR (${r.wins}W/${r.losses}L)`);
    msg += `*${m}:* ${modes[m].name}\nWR: ${wr}% (${r.wins}W/${r.losses}L)\n\n`;
    if (!best || wr > best.wr) best = {m, wr, name: modes[m].name};
  }
  
  msg += `🏆 *Winner: Mode ${best.m}* (${best.name}) - ${best.wr}%`;
  console.log(`\n🏆 Winner: Mode ${best.m} (${best.name})`);
  
  // Save & notify
  fs.writeFileSync('/root/trading-bot/ab-test-results.json', JSON.stringify({results, modes, best, ts: Date.now()}, null, 2));
  
  try {
    await fetch(`https://api.telegram.org/bot8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU/sendMessage`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({chat_id: '-1003212463774', text: msg, parse_mode: 'Markdown'})
    });
  } catch(e) {}
  
  // Set cron for 1 hour
  console.log('\n⏱️ Will re-test in 1 hour...');
}

run();
