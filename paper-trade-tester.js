const fs = require('fs');
const fetch = require('node-fetch');

// Load established tokens
const tokens = JSON.parse(fs.readFileSync('established-tokens.json', 'utf8'));
console.log(`Testing ${tokens.length} established tokens`);

// Define strategies to test
const strategies = [
  { id: 'sr_breakout', name: 'S/R Breakout', entry: 0.5, tp: 1.03, sl: 0.97 },
  { id: 'fib_786', name: 'Fib 0.786', entry: 0.786, tp: 1.05, sl: 0.97 },
  { id: 'fib_618', name: 'Fib 0.618', entry: 0.618, tp: 1.08, sl: 0.95 },
  { id: 'fib_500', name: 'Fib 0.500', entry: 0.5, tp: 1.10, sl: 0.93 },
];

async function getTokenPriceHistory(address) {
  // Get price data from DexScreener
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const data = await res.json();
    return data;
  } catch(e) {
    return null;
  }
}

async function runPaperTrade() {
  console.log('\n=== PAPER TRADING TEST ===\n');
  
  for (const token of tokens.slice(0, 10)) {
    console.log(`Testing ${token.symbol}...`);
    const data = await getTokenPriceHistory(token.address);
    
    if (data?.pairs?.[0]) {
      const pair = data.pairs[0];
      console.log(`  Price: $${pair.priceUsd}`);
      console.log(`  Liquidity: $${pair.liquidity?.usd?.toLocaleString()}`);
      console.log(`  Volume 24h: $${pair.volume?.h24?.toLocaleString()}`);
    }
  }
}

runPaperTrade().catch(console.error);
