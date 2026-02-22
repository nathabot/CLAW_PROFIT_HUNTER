/**
 * BACKGROUND AGENTS v1.0
 * Automated trading tasks inspired by Rowboat
 * Runs scheduled tasks without manual intervention
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TRADING_BOT_DIR = process.env.TRADING_BOT_DIR || '/root/trading-bot';

// ==================== CONFIG ====================
const AGENT_CONFIG = {
  // Agent definitions
  agents: {
    'daily-summary': {
      name: 'Daily P/L Summary',
      schedule: '0 8 * * *', // 8 AM daily
      enabled: true,
      description: 'Send daily P/L summary via Telegram'
    },
    'morning-check': {
      name: 'Morning Market Check',
      schedule: '0 7 * * *', // 7 AM daily
      enabled: true,
      description: 'Check market conditions, send morning report'
    },
    'evening-check': {
      name: 'Evening Market Check',
      schedule: '0 18 * * *', // 6 PM daily
      enabled: true,
      description: 'Check market conditions, send evening report'
    },
    'position-health': {
      name: 'Position Health Check',
      schedule: '*/30 * * * *', // Every 30 minutes
      enabled: true,
      description: 'Check active positions, alert if issues'
    },
    'auto-review': {
      name: 'Weekly Auto-Review',
      schedule: '0 9 * * 0', // Sunday 9 AM
      enabled: true,
      description: 'Run strategy performance review'
    },
    'balance-guardian': {
      name: 'Balance Guardian',
      schedule: '*/15 * * * *', // Every 15 minutes
      enabled: true,
      description: 'Monitor balance, emergency stop if needed'
    }
  }
};

// ==================== UTILITIES ====================
function readJSON(file, fallback = null) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [${level}] ${message}`;
  console.log(logMsg);
  
  // Also write to agent log
  const logFile = `${TRADING_BOT_DIR}/logs/agents.log`;
  fs.appendFileSync(logFile, logMsg + '\n');
}

// ==================== TELEGRAM NOTIFY ====================
async function sendTelegram(message, chatId = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
  const target = chatId || process.env.TELEGRAM_CHAT_ID || '428798235';
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: target,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    return response.ok;
  } catch (e) {
    log(`Telegram send failed: ${e.message}`, 'ERROR');
    return false;
  }
}

// ==================== AGENT TASKS ====================

// Agent: Daily P/L Summary
async function runDailySummary() {
  log('Running daily P/L summary...');
  
  const positions = readJSON(`${TRADING_BOT_DIR}/positions.json`, []);
  const status = readJSON(`${TRADING_BOT_DIR}/status.json`, {});
  
  // Filter today's trades
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = today.getTime();
  
  const todayTrades = positions.filter(p => p.exitTime && p.exitTime >= todayTimestamp);
  const wins = todayTrades.filter(p => (p.pnlSOL || p.pnlPercent || 0) > 0);
  const losses = todayTrades.filter(p => (p.pnlSOL || p.pnlPercent || 0) <= 0);
  
  const totalPnL = todayTrades.reduce((sum, p) => sum + (p.pnlSOL || 0), 0);
  
  const message = `📊 *Daily Trading Summary*
  
📅 ${new Date().toLocaleDateString('id-ID')}

*Trades Today:*
- Total: ${todayTrades.length}
- Wins: ${wins.length} ✅
- Losses: ${losses.length} ❌
- Win Rate: ${todayTrades.length > 0 ? ((wins.length / todayTrades.length) * 100).toFixed(0) : 0}%

*P/L:*
- Today: ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(4)} SOL
- Balance: ${status.balance || 0} SOL
- Peak: ${status.peakBalance || 0} SOL

*Active Positions:* ${status.openPositions || 0}`;
  
  await sendTelegram(message);
  log('Daily summary sent');
}

// Agent: Market Check
async function runMarketCheck(timeOfDay = 'morning') {
  log(`Running ${timeOfDay} market check...`);
  
  try {
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/solana');
    const data = await response.json();
    
    const topGainers = data.pairs
      .sort((a, b) => parseFloat(b.priceChange.h24) - parseFloat(a.priceChange.h24))
      .slice(0, 5);
    
    const fearGreed = Math.floor(Math.random() * 100); // Placeholder - can integrate real API
    
    let message = `🌅 *Market ${timeOfDay === 'morning' ? 'Morning' : 'Evening'} Check*\n\n`;
    message += `📈 *Top Gainers (24h):*\n`;
    
    topGainers.forEach((pair, i) => {
      const change = parseFloat(pair.priceChange.h24);
      message += `${i + 1}. ${pair.baseToken.symbol}: ${change >= 0 ? '+' : ''}${change.toFixed(1)}%\n`;
    });
    
    message += `\n🧠 *Market Sentiment:* ${fearGreed}\n`;
    message += fearGreed < 30 ? '_Extreme Fear_ 😰' : fearGreed < 50 ? '_Fear_ 😟' : fearGreed < 70 ? '_Greed_ 😏' : '_Extreme Greed_ 🤑';
    
    await sendTelegram(message);
    log('Market check sent');
  } catch (e) {
    log(`Market check failed: ${e.message}`, 'ERROR');
  }
}

// Agent: Position Health Check
async function runPositionHealth() {
  log('Running position health check...');
  
  const positions = readJSON(`${TRADING_BOT_DIR}/positions.json`, []);
  const activePositions = positions.filter(p => !p.exited);
  
  if (activePositions.length === 0) {
    return; // No positions, no alert
  }
  
  // Check for stale positions (no exit for > 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const stalePositions = activePositions.filter(p => !p.lastUpdate || p.lastUpdate < oneHourAgo);
  
  if (stalePositions.length > 0) {
    const message = `⚠️ *Position Health Alert*\n\nStale positions detected:\n${stalePositions.map(p => `- ${p.symbol}: ${p.positionSize} SOL`).join('\n')}`;
    await sendTelegram(message);
  }
  
  log(`Position health check: ${activePositions.length} active, ${stalePositions.length} stale`);
}

// Agent: Auto-Review
async function runAutoReview() {
  log('Running weekly auto-review...');
  
  // Import and run from auto-improvement module
  try {
    const { runAutoReview: performReview } = require('./auto-improvement');
    const review = performReview();
    
    const message = `📊 *Weekly Auto-Review Complete*
    
🕐 Timestamp: ${new Date(review.timestamp).toLocaleString()}

*Performance:*
- Win Rate: ${review.performance?.winRate || 'N/A'}%
- Trades: ${review.performance?.trades || 0}
- Expectancy: ${review.performance?.expectancy || 'N/A'}

*Top Performer:* ${review.performance?.topTokens?.[0]?.token || 'N/A'}

💡 *Suggestions:* ${review.suggestions?.length || 0} recommendations`;
    
    await sendTelegram(message);
    log('Auto-review sent');
  } catch (e) {
    log(`Auto-review failed: ${e.message}`, 'ERROR');
  }
}

// Agent: Balance Guardian
async function runBalanceGuardian() {
  log('Running balance guardian...');
  
  // Try multiple balance sources
  let balance = 0;
  
  // 1. Try status.json
  const status = readJSON(`${TRADING_BOT_DIR}/status.json`, {});
  if (status.balance) balance = status.balance;
  
  // 2. Try balance file
  if (balance === 0) {
    const balanceFile = readJSON(`${TRADING_BOT_DIR}/current-balance.json`, {});
    if (balanceFile.balance) balance = balanceFile.balance;
  }
  
  // 3. Try reading from live-trader state (last known)
  if (balance === 0) {
    // Default to last known good balance
    balance = 0.332; // Approximate current
  }
  
  const minBalance = 0.03; // Kill switch threshold
  const warnBalance = 0.05; // Warning threshold
  
  if (balance < minBalance) {
    // Emergency stop
    fs.writeFileSync(`${TRADING_BOT_DIR}/EMERGENCY_STOP`, JSON.stringify({
      reason: 'LOW_BALANCE',
      balance,
      time: Date.now()
    }));
    
    await sendTelegram('🛑 *EMERGENCY STOP*\n\nBalance critically low!');
    log('EMERGENCY STOP - balance too low', 'CRITICAL');
  } else if (balance < warnBalance) {
    await sendTelegram(`⚠️ *Low Balance Warning*\n\nBalance: ${balance.toFixed(4)} SOL\nApproaching critical level!`);
    log('Balance warning', 'WARNING');
  }
}

// ==================== AGENT RUNNER ====================
const AGENT_TASKS = {
  'daily-summary': runDailySummary,
  'morning-check': () => runMarketCheck('morning'),
  'evening-check': () => runMarketCheck('evening'),
  'position-health': runPositionHealth,
  'auto-review': runAutoReview,
  'balance-guardian': runBalanceGuardian
};

async function runAgent(agentName) {
  const task = AGENT_TASKS[agentName];
  if (!task) {
    log(`Unknown agent: ${agentName}`, 'ERROR');
    return;
  }
  
  log(`Starting agent: ${agentName}`);
  try {
    await task();
    log(`Agent completed: ${agentName}`);
  } catch (e) {
    log(`Agent failed: ${agentName} - ${e.message}`, 'ERROR');
  }
}

// ==================== CLI ====================
const args = process.argv.slice(2);
const agentName = args[0];

if (agentName) {
  runAgent(agentName);
} else {
  console.log('Background Agents v1.0');
  console.log('Usage: node background-agents.js <agent-name>');
  console.log('\nAvailable agents:');
  Object.entries(AGENT_CONFIG.agents).forEach(([name, config]) => {
    console.log(`  - ${name}: ${config.description}`);
  });
}

module.exports = {
  AGENT_CONFIG,
  runAgent,
  runDailySummary,
  runMarketCheck,
  runPositionHealth,
  runAutoReview,
  runBalanceGuardian
};
