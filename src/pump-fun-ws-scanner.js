// Pump.fun WebSocket Scanner - Real-time token detection
// Uses Solana WebSocket to detect new token mints

const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const RPC_WS = 'wss://restless-bitter-emerald.solana-mainnet.quiknode.pro/7dc960cd5584dba31d64260739c411f638b0fbb3';
const RPC_HTTP = 'https://restless-bitter-emerald.solana-mainnet.quiknode.pro/7dc960cd5584dba31d64260739c411f638b0fbb3';

const CONFIG = {
  PUMP_FUN_PROGRAM: '6EF8rrecthR5Dkzon8Nwu42h6vdjz46kxkUeZ9Vd2EM',
  FILTERS: {
    MIN_LIQUIDITY: 2500,
    MIN_MARKET_CAP: 10000,
    MIN_HOLDERS: 20,  // Lowered for pre-grad
    MAX_TOP_10: 50,
  },
  POSITION: {
    SIZE_SOL: 0.005,
    STOP_LOSS: 5,
    TP1: 30,
    TP2: 50,
    MAX_HOLD: 10 * 60 * 1000, // 10 min
  }
};

const LOG_FILE = path.join(__dirname, '..', 'logs', 'pump-ws.log');
const STATE_FILE = path.join(__dirname, '..', 'pump-ws-state.json');

let state = {
  recentTokens: [],
  lastReset: Date.now(),
};

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
  fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getTokenMeta(mint) {
  try {
    // Get token supply and metadata
    const response = await axios.post(RPC_HTTP, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenSupply',
      params: [mint]
    });
    return response.data.result;
  } catch (e) {
    return null;
  }
}

async function getDexScreenerData(mint) {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/token/solana/${mint}`, {
      timeout: 5000
    });
    return res.data?.pair;
  } catch (e) {
    return null;
  }
}

async function analyzeToken(mint) {
  const dexData = await getDexScreenerData(mint);
  
  if (!dexData) return null;
  
  const token = {
    mint,
    symbol: dexData.baseToken?.symbol || 'Unknown',
    name: dexData.baseToken?.name || 'Unknown',
    liquidity: dexData.liquidity?.usd || 0,
    marketCap: dexData.marketCap || 0,
    priceChange: dexData.priceChange?.h24 || 0,
    volume: dexData.volume?.h24 || 0,
    age: dexData.pairCreatedAt ? (Date.now() - dexData.pairCreatedAt) / (1000*60*60) : 0,
    score: 0,
  };
  
  // Score based on filters
  if (token.liquidity >= CONFIG.FILTERS.MIN_LIQUIDITY) token.score += 2;
  if (token.marketCap >= CONFIG.FILTERS.MIN_MARKET_CAP) token.score += 2;
  if (token.age <= 24 && token.age > 0.5) token.score += 2; // 30min to 24h
  if (token.volume >= 5000) token.score += 2;
  if (token.priceChange > 0) token.score += 2;
  
  return token;
}

async function scanMints() {
  log('Scanning recent token mints...');
  
  try {
    // Get recent transactions for pump.fun program
    const response = await axios.post(RPC_HTTP, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [
        CONFIG.PUMP_FUN_PROGRAM,
        { limit: 10 }
      ]
    }, { timeout: 10000 });
    
    const sigs = response.data?.result || [];
    log(`Found ${sigs.length} recent pump.fun transactions`);
    
    for (const sig of sigs) {
      // Get transaction details
      const txRes = await axios.post(RPC_HTTP, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [sig.signature, { encoding: 'jsonParsed' }]
      });
      
      const tx = txRes.data?.result;
      if (!tx) continue;
      
      // Extract token mint from transaction
      const mints = tx.meta?.innerInstructions?.[0]?.instructions
        ?.filter(i => i.parsed?.type === 'initializeMint')
        ?.map(i => i.parsed?.info?.mint) || [];
      
      for (const mint of mints) {
        if (state.recentTokens.includes(mint)) continue;
        
        log(`New token detected: ${mint}`);
        
        const tokenData = await analyzeToken(mint);
        
        if (tokenData && tokenData.score >= 6) {
          log(`=== QUALIFIED TOKEN: ${tokenData.symbol} (score: ${tokenData.score}/10)`);
          log(`  Liquidity: $${tokenData.liquidity.toFixed(0)}`);
          log(`  Market Cap: $${tokenData.marketCap.toFixed(0)}`);
          log(`  24h Change: ${tokenData.priceChange.toFixed(1)}%`);
          log(`  Age: ${tokenData.age.toFixed(1)} hours`);
          
          // Alert!
          state.recentTokens.push(mint);
        }
      }
    }
    
  } catch (e) {
    log(`Scan error: ${e.message}`);
  }
  
  // Keep only last 50
  if (state.recentTokens.length > 50) {
    state.recentTokens = state.recentTokens.slice(-50);
  }
  
  saveState();
}

// Also try simple API approach - check for new pairs
async function checkDexscreener() {
  try {
    // Get trending tokens from dexscreener
    const res = await axios.get('https://api.dexscreener.com/latest/dex/tokens/solana', {
      timeout: 10000
    });
    
    const tokens = res.data?.tokens?.slice(0, 50) || [];
    
    for (const t of tokens) {
      // Check if it's a pump.fun token (has very recent creation)
      if (t.dexId === 'pumpfun' || t.pairAddress?.includes('pumpfun')) {
        if (!state.recentTokens.includes(t.baseToken.address)) {
          log(`Found pump.fun token: ${t.baseToken.symbol}`);
          
          const tokenData = await analyzeToken(t.baseToken.address);
          if (tokenData && tokenData.score >= 6) {
            log(`=== QUALIFIED: ${tokenData.symbol} (score: ${tokenData.score}/10)`);
            state.recentTokens.push(t.baseToken.address);
          }
        }
      }
    }
  } catch (e) {
    log(`Dexscreener check failed: ${e.message}`);
  }
}

// Main
log('Pump.fun WS Scanner starting...');

// Initial scan
setTimeout(scanMints, 2000);

// Periodic scan every 30 seconds
setInterval(scanMints, 30000);

// Also try dexscreener every 30s
setInterval(checkDexscreener, 30000);

module.exports = { scan: scanMints };
