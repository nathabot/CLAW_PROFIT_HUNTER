const fetch = require('node-fetch');

const CA = 'C7V47ci5u2Ak3VYb62a1obLTY74BLFxLB7d2NLKRpump';
const ENTRY = 0.000186;

async function check() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${CA}`);
    const data = await res.json();
    
    if (!data.pairs || !data.pairs[0]) {
      console.log('No data');
      return;
    }
    
    const pair = data.pairs[0];
    const current = parseFloat(pair.priceUsd);
    const pnl = ((current - ENTRY) / ENTRY * 100).toFixed(2);
    
    console.log('AI Token Analysis:');
    console.log('Current Price:', current);
    console.log('Entry:', ENTRY);
    console.log('PnL:', pnl + '%');
    console.log('5m change:', pair.priceChange?.m5 + '%');
    console.log('1h change:', pair.priceChange?.h1 + '%');
    
    if (parseFloat(pnl) <= -7) {
      console.log('⚠️ HIT STOP LOSS - Should sell');
    } else if (parseFloat(pnl) >= 15) {
      console.log('✅ HIT TARGET - Should sell');
    } else {
      console.log('⏳ HOLD - Waiting for target or stop');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

check();
