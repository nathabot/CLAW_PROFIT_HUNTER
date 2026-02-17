#!/usr/bin/env node

/**
 * WATCHDOG AGENT - Autonomous Trading Continuity
 * 
 * Purpose: Ensure paper trader + Prana bot run 24/7 without manual intervention
 * Target: $50/day profit (0.2 SOL minimum)
 * 
 * Monitors:
 * - Paper trader health (Nathabot VPS)
 * - Prana live bot health (Prana VPS)
 * - Process status & log freshness
 * - Error detection & auto-recovery
 * - Target progress tracking
 */

const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Monitoring intervals
  CHECK_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  LOG_STALE_THRESHOLD_MS: 30 * 60 * 1000, // 30 minutes
  
  // Targets
  DAILY_PROFIT_TARGET_SOL: 0.2,
  DAILY_PROFIT_TARGET_USD: 50,
  
  // VPS Prana (remote monitoring via SSH)
  PRANA_HOST: 'root@72.61.124.167',
  PRANA_BOT_PATH: '/root/trading-bot/prana-live-trader-v3-secure.js',
  PRANA_LOG_PATH: '/root/trading-bot/secure-trades.log',
  PRANA_CRON_PATTERN: 'prana-live-trader-v3-secure.js',
  
  // Local paper trader (Nathabot VPS)
  PAPER_TRADER_PATH: '/root/trading-bot/paper-trader-active.js', // Symlink to current variant
  PAPER_LOG_PATH: '/root/trading-bot/paper-trades.log',
  PAPER_CRON_PATTERN: 'paper-trader-active.js',
  
  // State tracking
  STATE_FILE: '/root/trading-bot/watchdog-state.json',
  
  // Telegram reporting
  TELEGRAM_TOKEN: '8295470573:AAEfp_o-I2FEOaQcfMeHHbWce54WTNHBwCE',
  TELEGRAM_CHAT_ID: '428798235',
  REPORT_TOPIC_ID: 26, // Performance Tracking topic
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function loadState() {
  if (fs.existsSync(CONFIG.STATE_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
  }
  return {
    lastCheck: null,
    lastPranaRestart: null,
    lastPaperRestart: null,
    dailyStats: {
      date: new Date().toISOString().split('T')[0],
      pranaProfit: 0,
      paperTrades: 0,
      paperWins: 0,
      issues: []
    }
  };
}

function saveState(state) {
  fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

async function checkProcessRunning(pattern) {
  return new Promise((resolve) => {
    exec(`ps aux | grep "${pattern}" | grep -v grep`, (err, stdout) => {
      resolve(!!stdout.trim());
    });
  });
}

async function checkLogFreshness(logPath, isRemote = false) {
  return new Promise((resolve) => {
    const cmd = isRemote 
      ? `ssh ${CONFIG.PRANA_HOST} "stat -c %Y ${logPath} 2>/dev/null || echo 0"`
      : `stat -c %Y ${logPath} 2>/dev/null || echo 0`;
    
    exec(cmd, (err, stdout) => {
      const lastModified = parseInt(stdout.trim()) * 1000;
      const age = Date.now() - lastModified;
      resolve({ fresh: age < CONFIG.LOG_STALE_THRESHOLD_MS, age });
    });
  });
}

async function checkCronActive(pattern, isRemote = false) {
  return new Promise((resolve) => {
    const cmd = isRemote
      ? `ssh ${CONFIG.PRANA_HOST} "crontab -l 2>/dev/null | grep '${pattern}' | grep -v '^#'"`
      : `crontab -l 2>/dev/null | grep '${pattern}' | grep -v '^#'`;
    
    exec(cmd, (err, stdout) => {
      resolve(!!stdout.trim());
    });
  });
}

async function checkPranaHealth() {
  const issues = [];
  
  // Check if bot file exists
  const fileExists = await new Promise((resolve) => {
    exec(`ssh ${CONFIG.PRANA_HOST} "test -f ${CONFIG.PRANA_BOT_PATH} && echo yes || echo no"`, 
      (err, stdout) => resolve(stdout.trim() === 'yes'));
  });
  
  if (!fileExists) {
    issues.push('Prana bot file missing');
  }
  
  // Check cron
  const cronActive = await checkCronActive(CONFIG.PRANA_CRON_PATTERN, true);
  if (!cronActive) {
    issues.push('Prana cron not found');
  }
  
  // Check log freshness
  const logStatus = await checkLogFreshness(CONFIG.PRANA_LOG_PATH, true);
  if (!logStatus.fresh) {
    issues.push(`Prana log stale (${Math.round(logStatus.age / 60000)}m old)`);
  }
  
  return { healthy: issues.length === 0, issues };
}

async function checkPaperHealth() {
  const issues = [];
  
  // Check if paper trader exists
  if (!fs.existsSync(CONFIG.PAPER_TRADER_PATH)) {
    issues.push('Paper trader file missing');
  }
  
  // Check cron
  const cronActive = await checkCronActive(CONFIG.PAPER_CRON_PATTERN, false);
  if (!cronActive) {
    issues.push('Paper trader cron not found');
  }
  
  // Check log freshness
  if (fs.existsSync(CONFIG.PAPER_LOG_PATH)) {
    const logStatus = await checkLogFreshness(CONFIG.PAPER_LOG_PATH, false);
    if (!logStatus.fresh) {
      issues.push(`Paper log stale (${Math.round(logStatus.age / 60000)}m old)`);
    }
  }
  
  return { healthy: issues.length === 0, issues };
}

// ============================================================================
// AUTO-RECOVERY
// ============================================================================

async function restartPranaBot() {
  console.log('🔄 Restarting Prana bot...');
  
  return new Promise((resolve) => {
    // Kill any existing process
    exec(`ssh ${CONFIG.PRANA_HOST} "pkill -f prana-live-trader-v3-secure.js"`, () => {
      // Verify cron exists
      exec(`ssh ${CONFIG.PRANA_HOST} "crontab -l | grep -q prana-live-trader-v3-secure.js || (crontab -l 2>/dev/null; echo '*/5 * * * * cd /root/trading-bot && node prana-live-trader-v3-secure.js >> secure-trades.log 2>&1') | crontab -"`, 
        () => {
          console.log('✅ Prana bot cron verified/updated');
          resolve(true);
        }
      );
    });
  });
}

async function restartPaperTrader() {
  console.log('🔄 Restarting paper trader...');
  
  return new Promise((resolve) => {
    // Kill any existing process
    exec(`pkill -f paper-trader-active.js`, () => {
      // Verify cron exists (adjust timing as needed)
      exec(`crontab -l | grep -q paper-trader-active.js || (crontab -l 2>/dev/null; echo '*/10 * * * * cd /root/trading-bot && node paper-trader-active.js >> paper-trades.log 2>&1') | crontab -`, 
        () => {
          console.log('✅ Paper trader cron verified/updated');
          resolve(true);
        }
      );
    });
  });
}

// ============================================================================
// PERFORMANCE TRACKING
// ============================================================================

async function getPranaBalance() {
  return new Promise((resolve) => {
    exec(`ssh ${CONFIG.PRANA_HOST} "grep -oP 'Balance: \\K[0-9.]+' ${CONFIG.PRANA_LOG_PATH} | tail -1"`, 
      (err, stdout) => {
        const balance = parseFloat(stdout.trim()) || 0;
        resolve(balance);
      }
    );
  });
}

async function getPaperStats() {
  if (!fs.existsSync(CONFIG.PAPER_LOG_PATH)) {
    return { trades: 0, wins: 0, winRate: 0 };
  }
  
  const log = fs.readFileSync(CONFIG.PAPER_LOG_PATH, 'utf8');
  const trades = (log.match(/\[PAPER TRADE\]/g) || []).length;
  const wins = (log.match(/WIN \+/g) || []).length;
  const winRate = trades > 0 ? (wins / trades * 100).toFixed(1) : 0;
  
  return { trades, wins, winRate };
}

// ============================================================================
// TELEGRAM REPORTING
// ============================================================================

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: CONFIG.TELEGRAM_CHAT_ID,
    message_thread_id: CONFIG.REPORT_TOPIC_ID,
    text: message,
    parse_mode: 'HTML'
  };
  
  return new Promise((resolve) => {
    exec(`curl -s -X POST ${url} -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`, 
      () => resolve()
    );
  });
}

// ============================================================================
// MAIN WATCHDOG LOOP
// ============================================================================

async function runHealthCheck() {
  console.log('\n🔍 Running health check...');
  const state = loadState();
  const issues = [];
  
  // Check Prana bot
  const pranaHealth = await checkPranaHealth();
  if (!pranaHealth.healthy) {
    issues.push(...pranaHealth.issues);
    await restartPranaBot();
    state.lastPranaRestart = new Date().toISOString();
    await sendTelegram(`⚠️ <b>Watchdog Alert</b>\n\nPrana bot issues detected:\n${pranaHealth.issues.join('\n')}\n\nAuto-restart initiated.`);
  }
  
  // Check paper trader
  const paperHealth = await checkPaperHealth();
  if (!paperHealth.healthy) {
    issues.push(...paperHealth.issues);
    await restartPaperTrader();
    state.lastPaperRestart = new Date().toISOString();
    await sendTelegram(`⚠️ <b>Watchdog Alert</b>\n\nPaper trader issues detected:\n${paperHealth.issues.join('\n')}\n\nAuto-restart initiated.`);
  }
  
  // Update state
  state.lastCheck = new Date().toISOString();
  if (issues.length > 0) {
    state.dailyStats.issues.push({
      timestamp: new Date().toISOString(),
      issues
    });
  }
  
  saveState(state);
  
  if (issues.length === 0) {
    console.log('✅ All systems healthy');
  } else {
    console.log(`⚠️ Issues found and recovery initiated: ${issues.length}`);
  }
}

async function generateDailyReport() {
  const state = loadState();
  const today = new Date().toISOString().split('T')[0];
  
  // Reset stats if new day
  if (state.dailyStats.date !== today) {
    state.dailyStats = {
      date: today,
      pranaProfit: 0,
      paperTrades: 0,
      paperWins: 0,
      issues: []
    };
  }
  
  // Fetch current stats
  const pranaBalance = await getPranaBalance();
  const paperStats = await getPaperStats();
  
  // Calculate progress
  const solPrice = 180; // Approximate, could fetch from API
  const pranaUSD = pranaBalance * solPrice;
  const targetProgress = (pranaUSD / CONFIG.DAILY_PROFIT_TARGET_USD * 100).toFixed(1);
  
  const report = `
📊 <b>Daily Watchdog Report</b>
📅 ${today}

<b>Prana Live Bot:</b>
💰 Balance: ${pranaBalance.toFixed(4)} SOL (~$${pranaUSD.toFixed(2)})
🎯 Target: $${CONFIG.DAILY_PROFIT_TARGET_USD} (${targetProgress}%)

<b>Paper Trader:</b>
📈 Trades: ${paperStats.trades}
✅ Wins: ${paperStats.wins}
📊 Win Rate: ${paperStats.winRate}%

<b>System Health:</b>
${state.dailyStats.issues.length === 0 ? '✅ No issues today' : `⚠️ ${state.dailyStats.issues.length} issues auto-recovered`}
🔄 Last check: ${new Date(state.lastCheck).toLocaleTimeString('id-ID')}
  `.trim();
  
  await sendTelegram(report);
  saveState(state);
}

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  console.log('🐕 Watchdog Agent Starting...');
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`⏱️  Check interval: ${CONFIG.CHECK_INTERVAL_MS / 60000} minutes`);
  
  // Initial health check
  await runHealthCheck();
  
  // Schedule regular checks
  setInterval(runHealthCheck, CONFIG.CHECK_INTERVAL_MS);
  
  // Daily report at midnight (adjust as needed)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow - now;
  
  setTimeout(() => {
    generateDailyReport();
    setInterval(generateDailyReport, 24 * 60 * 60 * 1000); // Every 24h
  }, msUntilMidnight);
  
  console.log('✅ Watchdog is now monitoring...');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Watchdog shutting down...');
  process.exit(0);
});

main().catch(console.error);
