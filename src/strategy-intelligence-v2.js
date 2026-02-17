#!/usr/bin/env node
/**
 * STRATEGY INTELLIGENCE NETWORK v2.0 - DYNAMIC
 * Auto-generate signals from market data (DexScreener, On-chain)
 * Runs every 4 hours via cron
 */

const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const CONFIG = {
  DB_PATH: '/root/trading-bot/strategy-intelligence.db',
  DEXSCREENER_API: 'https://api.dexscreener.com',
  MIN_LIQUIDITY: 25000,          // $25k minimum liquidity
  MIN_VOLUME_24H: 10000,          // $10k minimum volume (24h)
  TOP_TOKENS: 20,
  CONFIDENCE_THRESHOLD: 6.0
};

// Logger
function log(msg, type = 'info') {
  const timestamp = new Date().toISOString();
  const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';
  console.log(`[${timestamp}] ${icon} ${msg}`);
}

// Fetch trending tokens from DexScreener
async function fetchTrendingTokens() {
  return new Promise((resolve, reject) => {
    log('Fetching trending tokens from DexScreener...');
    
    https.get(`${CONFIG.DEXSCREENER_API}/token-profiles/latest/v1`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const profiles = JSON.parse(data);
          resolve(profiles.slice(0, CONFIG.TOP_TOKENS));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Fetch detailed token data
async function fetchTokenData(tokenAddress) {
  return new Promise((resolve, reject) => {
    https.get(`${CONFIG.DEXSCREENER_API}/latest/dex/tokens/${tokenAddress}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.pairs?.[0] || null);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Calculate signal confidence
function calculateConfidence(pair) {
  let score = 0;
  const reasons = [];
  
  const liquidity = parseFloat(pair.liquidity?.usd || 0);
  const volume24h = parseFloat(pair.volume?.h24 || 0);
  const priceChange5m = parseFloat(pair.priceChange?.m5 || 0);
  const priceChange1h = parseFloat(pair.priceChange?.h1 || 0);
  const priceChange24h = parseFloat(pair.priceChange?.h24 || 0);
  const buys = parseFloat(pair.txns?.h24?.buys || 0);
  const sells = parseFloat(pair.txns?.h24?.sells || 0);
  
  // Volume score (0-2.5)
  if (volume24h > 1000000) {
    score += 2.5;
    reasons.push('Very high volume');
  } else if (volume24h > 500000) {
    score += 2;
    reasons.push('High volume');
  } else if (volume24h > 100000) {
    score += 1.5;
    reasons.push('Good volume');
  } else if (volume24h > 50000) {
    score += 1;
    reasons.push('Moderate volume');
  }
  
  // Price momentum score (0-2.5)
  if (priceChange24h > 50 && priceChange5m > -5) {
    score += 2.5;
    reasons.push('Strong 24h momentum');
  } else if (priceChange24h > 20 && priceChange5m > -3) {
    score += 2;
    reasons.push('Good momentum');
  } else if (priceChange24h > 10 && priceChange5m > -2) {
    score += 1.5;
    reasons.push('Positive momentum');
  } else if (priceChange1h > 5 && priceChange5m > 0) {
    score += 1;
    reasons.push('Hourly uptrend');
  }
  
  // Buy/Sell ratio score (0-2.5)
  const buySellRatio = sells > 0 ? buys / sells : 1;
  if (buySellRatio > 2) {
    score += 2.5;
    reasons.push('Heavy buying pressure');
  } else if (buySellRatio > 1.5) {
    score += 2;
    reasons.push('Strong buying');
  } else if (buySellRatio > 1.2) {
    score += 1.5;
    reasons.push('More buyers than sellers');
  } else if (buySellRatio > 1) {
    score += 1;
    reasons.push('Slight buying edge');
  }
  
  // Liquidity score (0-2.5)
  if (liquidity > 500000) {
    score += 2.5;
    reasons.push('Excellent liquidity');
  } else if (liquidity > 200000) {
    score += 2;
    reasons.push('Good liquidity');
  } else if (liquidity > 100000) {
    score += 1.5;
    reasons.push('Adequate liquidity');
  } else if (liquidity > 50000) {
    score += 1;
    reasons.push('Moderate liquidity');
  }
  
  // Penalty for negative short-term
  if (priceChange5m < -10) {
    score -= 1;
    reasons.push('Warning: Sharp 5min decline');
  }
  
  // Penalty for high sell pressure
  if (buySellRatio < 0.8) {
    score -= 1.5;
    reasons.push('Warning: Sell pressure');
  }
  
  return {
    score: Math.max(0, Math.min(10, score)),
    reasons: reasons,
    metrics: {
      liquidity,
      volume24h,
      priceChange5m,
      priceChange1h,
      priceChange24h,
      buySellRatio,
      buys,
      sells
    }
  };
}

// Calculate entry, target, stop
function calculateTargets(currentPrice, confidence) {
  // Higher confidence = tighter stop, higher target
  const volatilityFactor = confidence.score > 7 ? 1.2 : confidence.score > 6 ? 1.0 : 0.8;
  
  const stopLoss = currentPrice * (1 - (0.05 * volatilityFactor)); // 5% SL base
  const target1 = currentPrice * (1 + (0.08 * volatilityFactor));  // 8% TP1
  const target2 = currentPrice * (1 + (0.15 * volatilityFactor));  // 15% TP2
  
  return { stopLoss, target1, target2 };
}

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(CONFIG.DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Drop old table if exists (to update schema)
      db.run(`DROP TABLE IF EXISTS signals`, () => {
        // Create new table with updated schema
        db.run(`
          CREATE TABLE signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_symbol TEXT NOT NULL,
            token_address TEXT,
            strategy_id INTEGER DEFAULT 1,
            signal_type TEXT DEFAULT 'BUY',
            entry_price REAL,
            target_price REAL,
            target_price_2 REAL,
            stop_loss REAL,
            source TEXT DEFAULT 'IntelligenceNetwork',
            confidence REAL,
            confidence_reasons TEXT,
            metrics TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            executed INTEGER DEFAULT 0,
            UNIQUE(token_symbol, created_at)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve(db);
        });
      });
    });
  });
}

// Insert signal to database
function insertSignal(db, signal) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO signals 
       (token_symbol, token_address, signal_type, entry_price, target_price, target_price_2, stop_loss, source, confidence, confidence_reasons, metrics) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'IntelligenceNetwork', ?, ?, ?)`,
      [
        signal.symbol,
        signal.address,
        signal.type,
        signal.entry,
        signal.target1,
        signal.target2,
        signal.stop,
        signal.confidence,
        JSON.stringify(signal.reasons),
        JSON.stringify(signal.metrics)
      ],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// Main function
async function main() {
  log('========================================');
  log('STRATEGY INTELLIGENCE NETWORK v2.0');
  log('Dynamic Signal Generation');
  log('========================================\n');
  
  try {
    // Initialize DB
    const db = await initDatabase();
    log('Database connected (schema updated)\n');
    
    // Fetch trending tokens
    const profiles = await fetchTrendingTokens();
    log(`Found ${profiles.length} trending tokens\n`);
    
    let inserted = 0;
    let skipped = 0;
    
    // Analyze each token
    for (const profile of profiles) {
      const symbol = profile.tokenAddress?.slice(0, 8) || 'UNKNOWN';
      
      try {
        // Fetch detailed data
        const pair = await fetchTokenData(profile.tokenAddress);
        if (!pair) {
          log(`Skipping ${symbol}: No data`, 'warning');
          skipped++;
          continue;
        }
        
        // Filter by minimum requirements
        const liquidity = parseFloat(pair.liquidity?.usd || 0);
        const volume = parseFloat(pair.volume?.h24 || 0);
        
        if (liquidity < CONFIG.MIN_LIQUIDITY) {
          log(`${pair.baseToken?.symbol || symbol}: Low liquidity ($${liquidity.toLocaleString()})`, 'warning');
          skipped++;
          continue;
        }
        
        if (volume < CONFIG.MIN_VOLUME_24H) {
          log(`${pair.baseToken?.symbol || symbol}: Low volume ($${volume.toLocaleString()})`, 'warning');
          skipped++;
          continue;
        }
        
        // Calculate confidence
        const confidence = calculateConfidence(pair);
        
        if (confidence.score < CONFIG.CONFIDENCE_THRESHOLD) {
          log(`${pair.baseToken?.symbol || symbol}: Confidence too low (${confidence.score.toFixed(1)}/10)`, 'warning');
          skipped++;
          continue;
        }
        
        // Calculate targets
        const currentPrice = parseFloat(pair.priceUsd);
        const targets = calculateTargets(currentPrice, confidence);
        
        // Create signal
        const signal = {
          symbol: pair.baseToken?.symbol || symbol,
          address: profile.tokenAddress,
          type: 'BUY',
          entry: currentPrice,
          target1: targets.target1,
          target2: targets.target2,
          stop: targets.stopLoss,
          confidence: confidence.score.toFixed(1),
          reasons: confidence.reasons,
          metrics: confidence.metrics
        };
        
        // Insert to database
        const isNew = await insertSignal(db, signal);
        
        if (isNew) {
          log(`${signal.symbol}: ✅ INSERTED (${signal.confidence}/10)`, 'success');
          log(`   Entry: $${signal.entry.toFixed(6)}`);
          log(`   TP1: $${signal.target1.toFixed(6)} | TP2: $${signal.target2.toFixed(6)}`);
          log(`   SL: $${signal.stop.toFixed(6)}`);
          log(`   Reasons: ${signal.reasons.join(', ')}\n`);
          inserted++;
        } else {
          log(`${signal.symbol}: Already exists`, 'warning');
          skipped++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
        
      } catch (e) {
        log(`Error processing ${symbol}: ${e.message}`, 'error');
        skipped++;
      }
    }
    
    // Summary
    log('\n========================================');
    log(`SUMMARY: ${inserted} new signals, ${skipped} skipped`);
    log('========================================\n');
    
    // Close database
    db.close();
    
  } catch (e) {
    log(`Fatal error: ${e.message}`, 'error');
    process.exit(1);
  }
}

// Run
main();
