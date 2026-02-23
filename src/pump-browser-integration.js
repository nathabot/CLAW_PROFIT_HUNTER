/**
 * PUMP.FUN BROWSER SCANNER INTEGRATION
 * 
 * Bridges browser-based pump.fun scraping to existing trading system
 * Signal Source: Browser (pump.fun)
 * → Strategy Intelligence Format
 * → Paper Trader
 * → Live Trader
 */

const fs = require('fs');
const path = require('path');

// Config
const CONFIG = {
  // Filter thresholds (must match existing system)
  MIN_SCORE: 6,
  MAX_POSITION_SIZE: 0.005,
  
  // Pump.fun specific filters
  MIN_MC: 5000,              // $
  MAX_MC: 90000,             // $ (pre-grad)
  MAX_DEV_HOLDER: 50,        // %
  MIN_LIQUIDITY: 3000,       // $
  MIN_CURVE: 5,              // %
  MAX_AGE_HOURS: 12,         // hours
  
  // Integration paths
  SIGNAL_DB: '/root/trading-bot/strategy-intelligence.db',
  TRADING_CONFIG: '/root/trading-bot/trading-config.json',
  PROVEN_TOKENS: '/root/trading-bot/bok/proven-degen.json',
};

/**
 * Parse token from browser snapshot data
 * Returns standardized token object
 */
function parseTokenFromSnapshot(tokenData) {
  const token = {
    symbol: tokenData.symbol || 'UNKNOWN',
    name: tokenData.name || tokenData.symbol || 'Unknown',
    ca: tokenData.ca,
    mc: parseMC(tokenData.mcStr),
    change24h: parsePercent(tokenData.changeStr),
    curve: tokenData.curve || 0,
    devHolder: tokenData.devHolder || 100,
    liquidity: tokenData.liquidity || 0,
    age: parseAge(tokenData.ageStr),
    url: tokenData.url,
    source: 'pumpfun-browser',
    timestamp: Date.now(),
  };
  
  // Calculate derived values
  token.graduated = token.mc > 90000;
  
  return token;
}

function parseMC(mcStr) {
  if (!mcStr) return 0;
  const match = mcStr.match(/\$?([\d.]+)([KMB]?)/i);
  if (!match) return 0;
  let val = parseFloat(match[1]);
  if (match[2] === 'K') val *= 1000;
  if (match[2] === 'M') val *= 1000000;
  if (match[2] === 'B') val *= 1000000000;
  return val;
}

function parsePercent(pctStr) {
  if (!pctStr) return 0;
  const match = pctStr.match(/([\d.-]+)%/);
  return match ? parseFloat(match[1]) : 0;
}

function parseAge(ageStr) {
  if (!ageStr) return 999;
  const match = ageStr.match(/(\d+)\s*(m|min|h|d|day)/i);
  if (!match) return 999;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm' || unit === 'min') return val / 60;
  if (unit === 'h') return val;
  if (unit === 'd' || unit === 'day') return val * 24;
  return 999;
}

/**
 * Apply ALL filters - with special handling for pre-grad tokens
 * Pre-grad tokens (MC < $90k) have dev holding 100% - this is NORMAL
 */
function applyFilters(token) {
  const failures = [];
  
  // Pre-grad check
  if (token.graduated) {
    failures.push('Already graduated');
  }
  
  // MC range
  if (token.mc < CONFIG.MIN_MC) {
    failures.push(`MC $${token.mc} < $${CONFIG.MIN_MC}`);
  }
  if (token.mc > CONFIG.MAX_MC) {
    failures.push(`MC $${token.mc} > $${CONFIG.MAX_MC}`);
  }
  
  // Dev holder - DIFFERENT LOGIC FOR PRE-GRAD vs GRADUATED
  // Pre-grad: dev holding 100% is NORMAL (hasn't sold any)
  // Graduated: dev should have sold some, so check %
  if (token.graduated && token.devHolder >= CONFIG.MAX_DEV_HOLDER) {
    failures.push(`Dev ${token.devHolder}% >= ${CONFIG.MAX_DEV_HOLDER}%`);
  }
  // For pre-grad, dev holder check is SKIPPED (100% is normal)
  
  // Liquidity - for pre-grad, curve progress matters more
  if (token.liquidity < CONFIG.MIN_LIQUIDITY) {
    // But if curve is progressing well, still okay
    if (token.curve < 20) {
      failures.push(`Liquidity $${token.liquidity} < $${CONFIG.MIN_LIQUIDITY} AND curve < 20%`);
    }
  }
  
  // Bonding curve - critical for pre-grad
  // Lower curve = less time on market = better entry
  if (token.curve > 80) {
    failures.push(`Curve ${token.curve}% > 80% (too late, close to graduation)`);
  }
  if (token.curve < CONFIG.MIN_CURVE) {
    // But if MC is very low, still okay (just launched)
    if (token.mc > 3000) {
      failures.push(`Curve ${token.curve}% < ${CONFIG.MIN_CURVE}%`);
    }
  }
  
  // Age
  if (token.age > CONFIG.MAX_AGE_HOURS) {
    failures.push(`Age ${token.age.toFixed(1)}h > ${CONFIG.MAX_AGE_HOURS}h`);
  }
  
  return {
    passed: failures.length === 0,
    failures
  };
}

/**
 * Calculate score (1-10) - optimized for PRE-GRAD tokens
 * 
 * Pre-grad scoring focuses on:
 * - Curve progress (more = more real trading)
 * - MC sweet spot (lower = earlier = more upside)
 * - Momentum (positive change = good)
 * - Age (newer = better entry)
 */
function calculateScore(token) {
  let score = 0;
  
  // 1. Bonding curve progress (0-25) - higher = more real trades
  // Sweet spot: 20-60% (enough trading, not too close to graduation)
  if (token.curve >= 20 && token.curve <= 60) {
    score += 25;
  } else if (token.curve >= 10 && token.curve <= 80) {
    score += 15;
  } else if (token.curve > 0) {
    score += 5;
  }
  
  // 2. MC sweet spot (0-25) - lower = earlier = more upside
  if (token.mc >= 5000 && token.mc <= 20000) {
    score += 25; // Perfect spot
  } else if (token.mc >= 20000 && token.mc <= 40000) {
    score += 20;
  } else if (token.mc >= 40000 && token.mc <= 70000) {
    score += 15;
  } else if (token.mc < 5000) {
    score += 10; // Too low = might be scam
  } else {
    score += 5; // Too close to graduation
  }
  
  // 3. Price momentum (0-20) - positive = buyers coming in
  if (token.change24h > 0) {
    if (token.change24h >= 50) score += 20;
    else if (token.change24h >= 20) score += 15;
    else if (token.change24h >= 10) score += 10;
    else score += 5;
  } else {
    score += 0; // Negative momentum = bad
  }
  
  // 4. Age (0-15) - newer = earlier entry = more potential
  if (token.age <= 0.25) score += 15; // <15 min = very new
  else if (token.age <= 1) score += 12; // <1 hour
  else if (token.age <= 3) score += 8;
  else if (token.age <= 6) score += 5;
  else score += 2;
  
  // 5. Liquidity presence (0-15) - some liquidity = real
  if (token.liquidity >= 5000) score += 15;
  else if (token.liquidity >= 2000) score += 10;
  else if (token.liquidity >= 500) score += 5;
  else score += 0;
  
  return Math.min(100, score);
}

/**
 * Convert to Strategy Intelligence format
 * Matches: strategy-intelligence.db schema
 */
function toSignalFormat(token, rawScore) {
  const normalizedScore = Math.min(10, rawScore / 10);
  
  return {
    symbol: token.symbol,
    name: token.name,
    tokenAddress: token.ca,
    source: 'pumpfun-browser',
    confidence: normalizedScore,
    timestamp: Date.now(),
    
    // Metrics for analysis
    metrics: {
      marketCap: token.mc,
      liquidity: token.liquidity,
      volume24h: token.volume24h || 0,
      change24h: token.change24h,
      bondingCurve: token.curve,
      devHolder: token.devHolder,
      age: token.age,
    },
    
    // Recommendation
    recommendation: normalizedScore >= CONFIG.MIN_SCORE ? 'BUY' : 'SKIP',
    reason: normalizedScore >= CONFIG.MIN_SCORE 
      ? `Score ${normalizedScore.toFixed(1)}/10 meets threshold`
      : `Score ${normalizedScore.toFixed(1)}/10 below threshold ${CONFIG.MIN_SCORE}`,
  };
}

/**
 * Save to Strategy Intelligence DB
 */
async function saveToIntelligenceDB(signal) {
  // Using JSON file as simple DB (matches existing system)
  const dbPath = '/root/trading-bot/signals-pumpfun.json';
  
  let signals = [];
  if (fs.existsSync(dbPath)) {
    try {
      signals = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      signals = [];
    }
  }
  
  // Add new signal
  signals.unshift(signal);
  
  // Keep only last 100 signals
  signals = signals.slice(0, 100);
  
  fs.writeFileSync(dbPath, JSON.stringify(signals, null, 2));
  console.log(`💾 Saved signal: ${signal.symbol} (${signal.confidence.toFixed(1)}/10)`);
}

/**
 * Process tokens from browser snapshot
 * Main entry point for integration
 */
async function processTokensFromBrowser(tokenList) {
  console.log('\n🧠 PROCESSING PUMP.FUN TOKENS...');
  console.log(`   Input: ${tokenList.length} tokens`);
  
  const results = {
    total: tokenList.length,
    passed: 0,
    scored: [],
    signals: [],
  };
  
  for (const rawToken of tokenList) {
    // Parse to standard format
    const token = parseTokenFromSnapshot(rawToken);
    
    // Apply filters
    const filterResult = applyFilters(token);
    token.filterPassed = filterResult.passed;
    token.filterFailures = filterResult.failures;
    
    if (!filterResult.passed) {
      console.log(`   ❌ ${token.symbol}: ${filterResult.failures.join(', ')}`);
      continue;
    }
    
    // Calculate score (now 0-100)
    const score = calculateScore(token);
    const normalizedScore = Math.min(10, score / 10); // Normalize to 1-10
    token.score = normalizedScore;
    
    results.passed++;
    results.scored.push(token);
    
    // Generate signal if passes threshold (use raw score)
    if (score >= CONFIG.MIN_SCORE * 10) {
      const signal = toSignalFormat(token, score);
      results.signals.push(signal);
      
      // Save to DB
      await saveToIntelligenceDB(signal);
      
      console.log(`   ✅ ${token.symbol}: Score ${score.toFixed(1)}/10 | MC $${token.mc} | Curve ${token.curve}%`);
    } else {
      console.log(`   ⚠️ ${token.symbol}: Score ${score.toFixed(1)}/10 (below threshold)`);
    }
  }
  
  // Summary
  console.log('\n📊 SCAN SUMMARY:');
  console.log(`   Total: ${results.total}`);
  console.log(`   Passed Filters: ${results.passed}`);
  console.log(`   Qualified (Score >= ${CONFIG.MIN_SCORE}): ${results.signals.length}`);
  
  if (results.signals.length > 0) {
    console.log('\n🎯 TOP SIGNALS:');
    results.signals.slice(0, 5).forEach((s, i) => {
      console.log(`   ${i+1}. ${s.symbol}: ${s.confidence.toFixed(1)}/10 - ${s.recommendation}`);
    });
  }
  
  return results;
}

/**
 * Check if signal is ready for live trading
 * Cross-references with BOK
 */
async function checkReadyForLive(signal) {
  // Check proven tokens
  let proven = false;
  let tokenWR = 0;
  
  if (fs.existsSync(CONFIG.PROVEN_TOKENS)) {
    const provenTokens = JSON.parse(fs.readFileSync(CONFIG.PROVEN_TOKENS, 'utf8'));
    const found = provenTokens.find(t => t.symbol === signal.symbol);
    if (found) {
      proven = true;
      tokenWR = found.winRate || 0;
    }
  }
  
  return {
    ready: signal.confidence >= CONFIG.MIN_SCORE && proven,
    reason: proven 
      ? `Proven token with ${tokenWR}% WR`
      : 'Not in proven list - use paper trader first',
    tokenWR
  };
}

module.exports = {
  CONFIG,
  parseTokenFromSnapshot,
  applyFilters,
  calculateScore,
  toSignalFormat,
  saveToIntelligenceDB,
  processTokensFromBrowser,
  checkReadyForLive,
};
