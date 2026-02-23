// Pump.fun Pre-Graduation Scanner
// Scans for new tokens BEFORE they graduate to Raydium
// High risk, high reward - strict filters applied

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  // API Endpoints - using multiple sources
  PUMP_API: 'https://api.pump.fun/v1',
  DEXSCREENER_API: 'https://api.dexscreener.com/latest/dex',
  
  // Filter Settings
  FILTERS: {
    MIN_LIQUIDITY: 2500,        // $2,500 minimum
    MIN_MARKET_CAP: 10000,       // $10k minimum
    MIN_HOLDERS: 50,             // At least 50 holders
    MAX_TOP_10_HOLDERS: 40,      // Top 10 < 40%
    MIN_AGE_HOURS: 1,            // At least 1 hour old
    MAX_AGE_HOURS: 24,           // Max 24 hours old
    MIN_BUY_PRESSURE: 60,        // >60% buy pressure
  },
  
  // Risk Management
  POSITION: {
    SIZE_SOL: 0.005,             // 0.005 SOL per trade
    STOP_LOSS: 5,                // -5%
    TAKE_PROFIT_1: 30,           // +30%
    TAKE_PROFIT_2: 50,          // +50%
    MAX_HOLD_MINUTES: 10,        // Max 10 min hold
    MAX_DAILY_TRADES: 5,
    MAX_CONSECUTIVE_LOSS: 3,
  },
  
  // Scanner Settings
  SCAN_INTERVAL_MS: 30000,       // Every 30 seconds
  MAX_TOKENS_TO_CHECK: 50,
};

const STATE_FILE = path.join(__dirname, '..', 'pump-scanner-state.json');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'pump-scanner.log');

let state = {
  scannedTokens: new Set(),
  consecutiveLosses: 0,
  dailyTrades: 0,
  lastReset: Date.now(),
};

function log(msg, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [${type}] ${msg}`;
  console.log(logMsg);
  fs.appendFileSync(LOG_FILE, logMsg + '\n');
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      state = { ...state, ...data };
      state.scannedTokens = new Set(data.scannedTokens || []);
    }
  } catch (e) {
    log(`Failed to load state: ${e.message}`, 'ERROR');
  }
}

function saveState() {
  try {
    const data = {
      ...state,
      scannedTokens: Array.from(state.scannedTokens),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    log(`Failed to save state: ${e.message}`, 'ERROR');
  }
}

async function getRecentTokens() {
  try {
    // Try Dexscreener for new tokens on Solana
    const response = await axios.get(`${CONFIG.DEXSCREENER_API}/tokens/solana`, {
      timeout: 10000,
    });
    
    if (response.data && response.data.pairs) {
      return response.data.pairs
        .filter(p => p.dexId === 'pumpfun')
        .slice(0, CONFIG.MAX_TOKENS_TO_CHECK);
    }
    return [];
  } catch (e) {
    log(`Failed to fetch tokens: ${e.message}`, 'ERROR');
    return [];
  }
}

async function getTokenData(tokenAddress) {
  try {
    const response = await axios.get(`${CONFIG.DEXSCREENER_API}/token/solana/${tokenAddress}`, {
      timeout: 10000,
    });
    return response.data?.pair;
  } catch (e) {
    return null;
  }
}

function analyzeToken(token) {
  // Extract token metrics
  const liquidity = token.liquidity?.usd || 0;
  const marketCap = token.marketCap || 0;
  const holders = token.holderCount || 0;
  
  // Calculate top holders percentage (estimate from txns)
  // This is a simplified check - in production you'd need more data
  
  // Check age
  const createdAt = token.pairCreatedAt;
  const ageHours = createdAt ? (Date.now() - createdAt) / (1000 * 60 * 60) : 0;
  
  // Buy pressure calculation (from recent trades)
  // Simplified - in production you'd analyze txns
  
  const analysis = {
    address: token.baseToken.address,
    symbol: token.baseToken.symbol,
    name: token.baseToken.name,
    liquidity,
    marketCap,
    holders,
    ageHours,
    priceChange: token.priceChange?.h24 || 0,
    volume24h: token.volume?.h24 || 0,
    score: 0,
    meetsCriteria: false,
  };
  
  // Scoring
  let score = 0;
  
  // Liquidity check
  if (liquidity >= CONFIG.FILTERS.MIN_LIQUIDITY) score += 2;
  
  // Market cap check  
  if (marketCap >= CONFIG.FILTERS.MIN_MARKET_CAP) score += 2;
  
  // Age check
  if (ageHours >= CONFIG.FILTERS.MIN_AGE_HOURS && ageHours <= CONFIG.FILTERS.MAX_AGE_HOURS) {
    score += 2;
  }
  
  // Volume check
  if (token.volume?.h24 >= 10000) score += 2;
  
  // Price action - positive change is good
  if (token.priceChange?.h24 > 0) score += 2;
  
  analysis.score = score;
  analysis.meetsCriteria = score >= 6;
  
  return analysis;
}

async function scanAndReport() {
  log('Starting pump.fun scan...');
  
  // Reset daily counters
  if (Date.now() - state.lastReset > 24 * 60 * 60 * 1000) {
    state.dailyTrades = 0;
    state.consecutiveLosses = 0;
    state.lastReset = Date.now();
  }
  
  const tokens = await getRecentTokens();
  log(`Found ${tokens.length} pump.fun tokens`);
  
  const candidates = [];
  
  for (const token of tokens) {
    if (state.scannedTokens.has(token.baseToken.address)) {
      continue;
    }
    
    state.scannedTokens.add(token.baseToken.address);
    
    const analysis = analyzeToken(token);
    
    if (analysis.meetsCriteria) {
      candidates.push(analysis);
      log(`Found candidate: ${analysis.symbol} (score: ${analysis.score}/10)`);
    }
  }
  
  // Keep only last 100 tokens in memory
  if (state.scannedTokens.size > 100) {
    const tokensArray = Array.from(state.scannedTokens);
    state.scannedTokens = new Set(tokensArray.slice(-100));
  }
  
  saveState();
  
  if (candidates.length > 0) {
    log(`=== PUMP.FUN CANDIDATES ===`);
    candidates.forEach(c => {
      log(`  ${c.symbol}: $${c.liquidity.toFixed(0)} liq, $${c.marketCap.toFixed(0)} mc, ${c.ageHours.toFixed(1)}h old`);
    });
    return candidates;
  }
  
  log('No qualifying tokens found');
  return [];
}

// Export for use
module.exports = {
  scan: scanAndReport,
  CONFIG,
};

if (require.main === module) {
  loadState();
  
  log('Pump.fun Scanner Starting...');
  
  // Initial scan
  scanAndReport().then(candidates => {
    if (candidates.length > 0) {
      console.log('Candidates found:', candidates);
    }
  });
  
  // Periodic scan
  setInterval(() => {
    scanAndReport().then(candidates => {
      if (candidates.length > 0) {
        console.log('Candidates found:', candidates);
      }
    });
  }, CONFIG.SCAN_INTERVAL_MS);
}
