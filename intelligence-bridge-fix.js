#!/usr/bin/env node
// Intelligence Bridge Fix - Auto-insert signals to database
// Runs after Strategy Intelligence Network cycle

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const CONFIG = {
  DB_PATH: '/root/trading-bot/strategy-intelligence.db',
  INTELLIGENCE_DIR: '/root/.openclaw/agents/main/sessions',
  TELEGRAM_BOT: '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  TELEGRAM_CHAT: '-1003212463774',
  TOPIC_ALERTS: '22',
  MIN_CONFIDENCE: 6.0
};

function log(message) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${message}`);
}

async function sendTelegram(message, topicId = null) {
  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT}/sendMessage`;
    const params = new URLSearchParams({
      chat_id: CONFIG.TELEGRAM_CHAT,
      text: message,
      parse_mode: 'Markdown'
    });
    if (topicId) params.append('message_thread_id', topicId);
    exec(`curl -s -X POST "${url}" -d "${params.toString()}"`, () => resolve());
  });
}

// Parse latest Intelligence files
function parseIntelligenceFiles() {
  const signals = [];
  
  try {
    // Find latest intelligence files
    const files = fs.readdirSync(CONFIG.INTELLIGENCE_DIR)
      .filter(f => f.includes('intelligence') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      log('No intelligence files found');
      return signals;
    }
    
    // Parse latest file
    const latestFile = files[0];
    const filePath = path.join(CONFIG.INTELLIGENCE_DIR, latestFile);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract signals from content (regex pattern for table format)
    const signalPattern = /\*\*(\w+)\*\*\s*\|\s*(BUY|SELL|HOLD)\s*\|\s*(\d+\.?\d?)\/10/gi;
    let match;
    
    while ((match = signalPattern.exec(content)) !== null) {
      signals.push({
        token: match[1],
        action: match[2],
        confidence: parseFloat(match[3]),
        source: 'Intelligence-Network'
      });
    }
    
    // Alternative: Parse from summary format
    if (signals.length === 0) {
      const altPattern = /([^|]+)\s*\|\s*(BUY|SELL|HOLD)\s*\|\s*(\d+\.?\d?)\/10/gi;
      while ((match = altPattern.exec(content)) !== null) {
        signals.push({
          token: match[1].trim(),
          action: match[2],
          confidence: parseFloat(match[3]),
          source: 'Intelligence-Network'
        });
      }
    }
    
    log(`Found ${signals.length} signals in ${latestFile}`);
    
  } catch (error) {
    log(`Parse error: ${error.message}`);
  }
  
  return signals;
}

// Insert signal to database
async function insertSignal(db, signal) {
  return new Promise((resolve, reject) => {
    // Check if signal already exists
    db.get(
      'SELECT id FROM signals WHERE token_symbol = ? AND confidence = ? AND executed = 0',
      [signal.token, signal.confidence],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          log(`  Signal ${signal.token} ${signal.confidence}/10 already exists`);
          resolve(false);
          return;
        }
        
        // Insert new signal
        const strategyMap = {
          'SOL': 2,      // RSI Bounce
          'ETH': 1,      // Smart Money
          'BTC': 1,      // Smart Money
          'COIN': 1,     // Smart Money
          'HOOD': 1,     // Smart Money
          'HYPE': 3,     // Momentum
          'UNI': 4,      // Volume Profile
          'PIPPIN': 3,   // Momentum
          'PUMP': 4      // Volume Profile
        };
        
        const strategyId = strategyMap[signal.token] || 1;
        const entryPrice = 0; // Will be filled by executor
        const targetPrice = 0;
        const stopLoss = 0;
        
        db.run(
          `INSERT INTO signals (token_symbol, strategy_id, signal_type, entry_price, target_price, stop_loss, source, confidence, executed) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [signal.token, strategyId, signal.action, entryPrice, targetPrice, stopLoss, signal.source, signal.confidence],
          function(err) {
            if (err) {
              reject(err);
            } else {
              log(`  ✅ Inserted ${signal.token} ${signal.confidence}/10 (ID: ${this.lastID})`);
              resolve(true);
            }
          }
        );
      }
    );
  });
}

// Send alert to Telegram
async function sendAlert(signal) {
  const tokenCA = {
    'SOL': 'So11111111111111111111111111111111111111112',
    'ETH': '7vfCXTUXx5WJV5JMWK3E8xWwxtR8cKtx4t8JbA4y8o',
    'BTC': '9n4nbM75fTDUiW9D4tQ8P2y4aWZy8K9FCzXWbQ1t8J5',
    'COIN': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'HYPE': 'BhN9mJpC8G4wEGGkZwyTDt1vEPjFWdd5AufqSSqeM2',
    'UNI': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
  }[signal.token] || 'UNKNOWN';
  
  const alertMsg = `**${signal.token}** (Intelligence Signal)\n\n` +
    `📊 Composite Score: ${signal.confidence}/10\n` +
    `📡 Source: ${signal.source}\n` +
    `⏰ Time: ${new Date().toLocaleTimeString()}\n` +
    `CA: \`${tokenCA}\``;
  
  await sendTelegram(alertMsg, CONFIG.TOPIC_ALERTS);
}

// Main
async function main() {
  log('═══════════════════════════════════════════');
  log('  INTELLIGENCE BRIDGE - SIGNAL INJECTOR');
  log('═══════════════════════════════════════════');
  
  // Parse intelligence files
  const signals = parseIntelligenceFiles();
  
  if (signals.length === 0) {
    log('No signals to process');
    return;
  }
  
  // Filter high confidence
  const qualifiedSignals = signals.filter(s => s.confidence >= CONFIG.MIN_CONFIDENCE);
  log(`\nQualified signals (≥${CONFIG.MIN_CONFIDENCE}): ${qualifiedSignals.length}`);
  
  if (qualifiedSignals.length === 0) {
    return;
  }
  
  // Open database
  const db = new sqlite3.Database(CONFIG.DB_PATH);
  
  let inserted = 0;
  for (const signal of qualifiedSignals) {
    try {
      const isNew = await insertSignal(db, signal);
      if (isNew) {
        await sendAlert(signal);
        inserted++;
      }
    } catch (error) {
      log(`  ❌ Error inserting ${signal.token}: ${error.message}`);
    }
  }
  
  db.close();
  
  log(`\n✅ Done: ${inserted} new signals inserted`);
  
  if (inserted > 0) {
    await sendTelegram(
      `🎯 **${inserted} NEW SIGNALS INSERTED**\n\n` +
      `Executor will auto-trade within 2 minutes.\n` +
      `Watch Topic #24 for execution alerts.`,
      CONFIG.TOPIC_ALERTS
    );
  }
}

main().catch(err => {
  log(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
