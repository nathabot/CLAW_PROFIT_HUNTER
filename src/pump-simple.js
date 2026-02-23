// Simple pump.fun scanner - polls Dexscreener for new tokens

const axios = require('axios');

const LOG_FILE = __dirname + '/../logs/pump-simple.log';
const STATE_FILE = __dirname + '/../pump-simple-state.json';

let state = {
  knownTokens: new Set(),
  candidates: [],
};

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function scan() {
  try {
    // Get latest tokens from all DEXs
    const res = await axios.get('https://api.dexscreener.com/latest/dex/tokens/solana', {
      timeout: 15000,
      headers: {'Accept': 'application/json'}
    });
    
    const tokens = res.data?.tokens || [];
    log(`Checking ${tokens.length} tokens...`);
    
    let newFound = 0;
    
    for (const t of tokens) {
      // Check if pump.fun token (very new = pre-grad)
      const isPumpFun = t.dexId === 'pumpfun' || 
                        t.url?.includes('pump') ||
                        (t.pairCreatedAt && (Date.now() - t.pairCreatedAt) < 3600000); // < 1 hour old
      
      if (!isPumpFun) continue;
      
      if (state.knownTokens.has(t.baseToken.address)) continue;
      
      // New token!
      state.knownTokens.add(t.baseToken.address);
      newFound++;
      
      // Analyze
      const score = analyzeToken(t);
      
      if (score >= 5) {
        log(`=== FOUND: ${t.baseToken.symbol} (score: ${score}/10)`);
        log(`   Liquidity: $${t.liquidity?.usd || 0}`);
        log(`   Market Cap: $${t.marketCap || 0}`);
        log(`   24h: ${t.priceChange?.h24 || 0}%`);
        log(`   Age: ${t.pairCreatedAt ? Math.round((Date.now() - t.pairCreatedAt)/3600000) + 'h' : '?'}`);
        
        state.candidates.push({
          token: t,
          score,
          foundAt: Date.now()
        });
      }
    }
    
    if (newFound > 0) log(`Found ${newFound} new pump.fun tokens`);
    
    // Keep only recent
    state.candidates = state.candidates.filter(c => Date.now() - c.foundAt < 3600000);
    
  } catch (e) {
    log(`Error: ${e.message}`);
  }
}

function analyzeToken(t) {
  let score = 0;
  
  const liq = t.liquidity?.usd || 0;
  const mc = t.marketCap || 0;
  const age = t.pairCreatedAt ? (Date.now() - t.pairCreatedAt) / 3600000 : 999;
  const vol = t.volume?.h24 || 0;
  const change = t.priceChange?.h24 || 0;
  
  if (liq >= 2000) score += 2;
  if (mc >= 8000) score += 2;
  if (age >= 0.5 && age <= 24) score += 2; // 30min to 24h
  if (vol >= 3000) score += 2;
  if (change > 0) score += 2;
  
  return score;
}

log('Starting simple pump scanner...');
scan();
setInterval(scan, 30000);
