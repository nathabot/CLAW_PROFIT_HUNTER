/**
 * PUMP.FUN EARLY DETECTOR
 * 
 * Finds tokens BEFORE they pump
 * Key insight: We need to catch tokens in first 30 minutes
 * 
 * Run: node src/pump-early-detector.js
 */

const fs = require('fs');
const path = require('path');

const TOKEN_FILE = '/root/trading-bot/pump-tokens-current.json';
const ALERT_FILE = '/root/trading-bot/pump-alerts.json';
const HISTORY_FILE = '/root/trading-bot/pump-token-history.json';

// Strict rules for EARLY detection
const RULES = {
  // VERY STRICT for early entry
  MAX_CHANGE: 20,           // % - Must be <20% (just launched)
  MAX_CURVE: 40,            // % - Must be <40% (early curve)
  MAX_MC: 20000,            // $ - Must be <$20k (very early)
  MIN_MC: 3000,             // $ - Must be >$3k (has some liquidity)
  MAX_AGE_MINUTES: 30,      // minutes - Must be <30 min old
  MIN_SCORE: 70,             // /100 - Must be >=70
  
  // Position rules
  POSITION_SIZE: 0.003,     // SOL - Small for early stage
  TP1: 30,                  // % - Sell 50% at +30%
  TP2: 50,                  // % - Sell all at +50%
  SL: 15,                   // %
};

// Telegram config
const TELEGRAM = {
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  CHAT_ID: '428798235',  // Yusron
  TOPIC: '22'  // Scanner alerts
};

/**
 * Load previous tokens
 */
function loadPreviousTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Save current tokens
 */
function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

/**
 * Load token history
 */
function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Add to history
 */
function addToHistory(token) {
  const history = loadHistory();
  history.unshift({
    ...token,
    firstSeen: Date.now()
  });
  // Keep last 500
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 500), null, 2));
}

/**
 * Check if token is new (not in previous scan)
 */
function isNewToken(token, previousTokens) {
  return !previousTokens.some(t => t.ca === token.ca);
}

/**
 * Calculate score for early detection
 */
function calculateScore(token) {
  let score = 0;
  
  // 1. Price change (lower = earlier = better for early detection)
  if (token.change24h <= 5) score += 30;
  else if (token.change24h <= 10) score += 25;
  else if (token.change24h <= 15) score += 20;
  else if (token.change24h <= 20) score += 15;
  else score += 0;
  
  // 2. Bonding curve (lower = earlier = better)
  if (token.curve <= 10) score += 25;
  else if (token.curve <= 20) score += 20;
  else if (token.curve <= 30) score += 15;
  else if (token.curve <= 40) score += 10;
  else score += 0;
  
  // 3. MC sweet spot (lower = earlier)
  if (token.mc >= 5000 && token.mc <= 15000) score += 25;
  else if (token.mc >= 3000 && token.mc <= 20000) score += 20;
  else score += 10;
  
  // 4. Age (newer = better)
  if (token.age <= 5) score += 20;       // <5 min
  else if (token.age <= 15) score += 15;  // <15 min
  else if (token.age <= 30) score += 10; // <30 min
  else score += 0;
  
  return Math.min(100, score);
}

/**
 * Validate early entry rules
 */
function validateEarlyEntry(token) {
  const reasons = [];
  
  if (token.change24h >= RULES.MAX_CHANGE) {
    reasons.push(`Change +${token.change24h}% >= ${RULES.MAX_CHANGE}% (too late)`);
  }
  
  if (token.curve >= RULES.MAX_CURVE) {
    reasons.push(`Curve ${token.curve}% >= ${RULES.MAX_CURVE}% (too far along)`);
  }
  
  if (token.mc < RULES.MIN_MC) {
    reasons.push(`MC $${token.mc} < $${RULES.MIN_MC} (too low)`);
  }
  
  if (token.mc > RULES.MAX_MC) {
    reasons.push(`MC $${token.mc} > $${RULES.MAX_MC} (already grew)`);
  }
  
  if (token.age > RULES.MAX_AGE_MINUTES) {
    reasons.push(`Age ${token.age.toFixed(0)}min > ${RULES.MAX_AGE_MINUTES}min (too old)`);
  }
  
  return {
    valid: reasons.length === 0,
    reasons
  };
}

/**
 * Send Telegram alert
 */
async function sendAlert(token, score) {
  const message = `🎯 *EARLY DETECTION ALERT*

*${token.symbol}* - Score: ${score}/100

📊 Stats:
• MC: $${token.mc}
• Change: +${token.change24h}%
• Curve: ${token.curve}%
• Age: ${token.age.toFixed(0)} min

🎯 Action: READY TO BUY
💰 Position: ${RULES.POSITION_SIZE} SOL
🎯 TP1: +${RULES.TP1}% | TP2: +${RULES.TP2}%

🔗 ${token.url}`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM.BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM.CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    console.log('✅ Telegram alert sent');
  } catch (e) {
    console.log('⚠️ Telegram alert failed:', e.message);
  }
}

/**
 * Save alert
 */
function saveAlert(token, score) {
  const alerts = fs.existsSync(ALERT_FILE) 
    ? JSON.parse(fs.readFileSync(ALERT_FILE, 'utf8'))
    : [];
  
  alerts.unshift({
    token,
    score,
    timestamp: Date.now()
  });
  
  fs.writeFileSync(ALERT_FILE, JSON.stringify(alerts.slice(0, 50), null, 2));
}

/**
 * Main detection logic
 */
async function detect() {
  console.log('\n🎯 EARLY DETECTION SCAN');
  console.log('========================\n');
  
  // Load previous tokens
  const previousTokens = loadPreviousTokens();
  const previousCA = new Set(previousTokens.map(t => t.ca));
  
  // For now, we'll use the browser to get fresh data
  // In production, this would be automated
  
  console.log('📡 Scanning for NEW tokens...');
  console.log(`   Previous tokens known: ${previousCA.size}`);
  
  // Read from quick scan results
  const quickScanPath = '/root/trading-bot/signals-pumpfun.json';
  let currentTokens = [];
  
  if (fs.existsSync(quickScanPath)) {
    const signals = JSON.parse(fs.readFileSync(quickScanPath, 'utf8'));
    
    // Convert to token format
    currentTokens = signals.map(s => ({
      symbol: s.symbol,
      ca: s.tokenAddress,
      mc: s.metrics?.marketCap || 0,
      change24h: s.metrics?.change24h || 0,
      curve: s.metrics?.bondingCurve || 0,
      age: s.metrics?.age || 0,
      url: `https://pump.fun/coin/${s.tokenAddress}`,
      score: (s.confidence || 0) * 10
    }));
  }
  
  console.log(`   Current tokens in system: ${currentTokens.length}`);
  
  // Find NEW tokens
  const newTokens = currentTokens.filter(t => !previousCA.has(t.ca));
  console.log(`   NEW tokens found: ${newTokens.length}`);
  
  if (newTokens.length > 0) {
    console.log('\n🆕 NEW TOKENS:');
    newTokens.forEach(t => console.log(`   - ${t.symbol}: MC $${t.mc}, +${t.change24h}%, ${t.curve}% curve`));
  }
  
  // Save current tokens for next comparison
  saveTokens(currentTokens);
  
  // Check each token for early entry
  let alerts = 0;
  
  for (const token of currentTokens) {
    const score = calculateScore(token);
    const validation = validateEarlyEntry(token);
    
    // Add score to token
    token.earlyScore = score;
    
    if (validation.valid && score >= RULES.MIN_SCORE) {
      console.log(`\n🎯 EARLY ENTRY SIGNAL: ${token.symbol}`);
      console.log(`   Score: ${score}/100`);
      console.log(`   MC: $${token.mc} | Change: +${token.change24h}% | Curve: ${token.curve}% | Age: ${token.age.toFixed(0)}min`);
      
      // Save alert
      saveAlert(token, score);
      
      // Send Telegram (only for truly new tokens)
      if (isNewToken(token, previousTokens)) {
        await sendAlert(token, score);
        addToHistory(token);
        alerts++;
      }
    }
  }
  
  console.log('\n📊 SUMMARY:');
  console.log(`   Total scanned: ${currentTokens.length}`);
  console.log(`   New this scan: ${newTokens.length}`);
  console.log(`   Qualified (early entry): ${currentTokens.filter(t => t.earlyScore >= RULES.MIN_SCORE).length}`);
  console.log(`   Alerts sent: ${alerts}`);
  
  return currentTokens;
}

// Run if called directly
if (require.main === module) {
  detect()
    .then(() => {
      console.log('\n✅ Detection complete');
      process.exit(0);
    })
    .catch(e => {
      console.error('❌ Error:', e);
      process.exit(1);
    });
}

module.exports = { detect, calculateScore, validateEarlyEntry, RULES };
