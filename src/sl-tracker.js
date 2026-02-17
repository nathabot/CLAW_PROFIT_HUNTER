#!/usr/bin/env node
/**
 * SL TRACKER & STRIKE RECORDER
 * Monitor exit monitors, detect SL hits, record strikes
 * Auto-blacklist after 3 strikes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
  EXIT_MONITOR_DIR: '/root/trading-bot',
  LOG_PATTERN: '*-exit.log',
  STRIKE_FILE: '/root/trading-bot/token-strike-count.json',
  BLACKLIST_FILE: '/root/trading-bot/blacklist.json',
  BOK_FILE: '/root/trading-bot/book-of-profit-hunter-knowledge/06-toxic-tokens.md',
  MAX_STRIKES: 3,
  COOLDOWN_HOURS: 24
};

class SLTracker {
  constructor() {
    this.strikes = this.loadStrikes();
    this.blacklist = this.loadBlacklist();
  }

  loadStrikes() {
    try {
      if (fs.existsSync(CONFIG.STRIKE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STRIKE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {};
  }

  saveStrikes() {
    fs.writeFileSync(CONFIG.STRIKE_FILE, JSON.stringify(this.strikes, null, 2));
  }

  loadBlacklist() {
    try {
      if (fs.existsSync(CONFIG.BLACKLIST_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.BLACKLIST_FILE, 'utf8'));
      }
    } catch (e) {}
    return [];
  }

  saveBlacklist() {
    fs.writeFileSync(CONFIG.BLACKLIST_FILE, JSON.stringify(this.blacklist, null, 2));
  }

  recordStrike(ca, symbol) {
    // Reset if 24h passed
    if (this.strikes[ca]) {
      const hoursSince = (Date.now() - this.strikes[ca].firstStrike) / (1000 * 60 * 60);
      if (hoursSince >= CONFIG.COOLDOWN_HOURS) {
        delete this.strikes[ca];
      }
    }

    if (!this.strikes[ca]) {
      this.strikes[ca] = {
        symbol,
        count: 1,
        firstStrike: Date.now(),
        lastStrike: Date.now(),
        history: []
      };
    } else {
      this.strikes[ca].count++;
      this.strikes[ca].lastStrike = Date.now();
    }

    this.strikes[ca].history.push({
      time: Date.now(),
      pnl: 'SL'
    });

    this.saveStrikes();
    console.log(`⚠️  Strike recorded: ${symbol} - ${this.strikes[ca].count}/3`);

    // Check for blacklist
    if (this.strikes[ca].count >= CONFIG.MAX_STRIKES) {
      this.blacklistToken(ca, symbol);
    }

    return this.strikes[ca].count;
  }

  blacklistToken(ca, symbol) {
    if (!this.blacklist.includes(ca)) {
      this.blacklist.push(ca);
      this.saveBlacklist();
      
      console.log(`🚫 BLACKLISTED: ${symbol} - 3 strikes`);
      
      // Add to BOK
      this.addToBOK(ca, symbol);
      
      // Notify
      this.notifyBlacklist(symbol, ca);
    }
  }

  addToBOK(ca, symbol) {
    const entry = `
## 🚫 ${symbol}

**CA:** ${ca}
**Status:** PERMANENT BLACKLIST
**Reason:** 3 consecutive SL hits
**Date:** ${new Date().toISOString()}
**Strike History:**
${this.strikes[ca].history.map(h => `- ${new Date(h.time).toISOString()}: ${h.pnl}`).join('\n')}

---
`;
    fs.appendFileSync(CONFIG.BOK_FILE, entry);
  }

  notifyBlacklist(symbol, ca) {
    try {
      const fetch = require('node-fetch');
      fetch(`https://api.telegram.org/bot8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: '-1003212463774',
          message_thread_id: 24,
          text: `🚫 **TOKEN BLACKLISTED**\n\n${symbol}\nCA: ${ca.slice(0, 15)}...\n\nReason: 3x SL hit\nAction: NO MORE TRADES`,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    } catch (e) {}
  }

  scanExitMonitors() {
    console.log('🔍 Scanning exit monitor logs...\n');
    
    const logFiles = execSync(`ls ${CONFIG.EXIT_MONITOR_DIR}/exit-monitor-*.log 2>/dev/null || echo ""`)
      .toString()
      .trim()
      .split('\n')
      .filter(f => f);

    let slDetected = 0;

    for (const logFile of logFiles) {
      try {
        const content = fs.readFileSync(logFile, 'utf8');
        
        // Check for SL hit
        if (content.includes('STOP LOSS') || content.includes('SL HIT')) {
          // Extract token info from filename or content
          const basename = path.basename(logFile, '.log');
          const symbol = basename.replace('exit-monitor-', '').toUpperCase();
          
          // Find CA from positions.json
          const ca = this.findCAFromSymbol(symbol);
          
          if (ca && !this.isAlreadyRecorded(ca, content)) {
            this.recordStrike(ca, symbol);
            slDetected++;
          }
        }
      } catch (e) {
        console.error(`Error reading ${logFile}:`, e.message);
      }
    }

    console.log(`\n✅ Scan complete. ${slDetected} new SL detected.`);
  }

  findCAFromSymbol(symbol) {
    try {
      const positions = JSON.parse(fs.readFileSync('/root/trading-bot/positions.json', 'utf8'));
      const pos = positions.find(p => p.symbol?.toLowerCase() === symbol.toLowerCase());
      return pos?.address || pos?.ca;
    } catch (e) {
      return null;
    }
  }

  isAlreadyRecorded(ca, content) {
    // Check if this SL already recorded (by timestamp or hash)
    // Simplified: check if lastStrike is recent
    if (this.strikes[ca]) {
      const minutesSince = (Date.now() - this.strikes[ca].lastStrike) / (1000 * 60);
      return minutesSince < 5; // Skip if recorded in last 5 min
    }
    return false;
  }

  showStatus() {
    console.log('\n📊 STRIKE STATUS:\n');
    
    for (const [ca, data] of Object.entries(this.strikes)) {
      console.log(`${data.symbol}: ${data.count}/3 strikes`);
      if (data.count >= 3) {
        console.log(`  🚫 BLACKLISTED`);
      }
    }
    
    console.log(`\n🚫 Blacklisted tokens: ${this.blacklist.length}`);
  }
}

// Run
const tracker = new SLTracker();

if (process.argv.includes('--status')) {
  tracker.showStatus();
} else {
  tracker.scanExitMonitors();
}
