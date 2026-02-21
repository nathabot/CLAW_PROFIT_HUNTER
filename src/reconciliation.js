/**
 * RECONCILIATION MODULE
 * Deterministic 15-minute position reconciliation
 * 
 * Checks:
 * 1. Position state vs expected state
 * 2. SL/TP triggers
 * 3. Max hold timeout
 * 4. Deviation alerts
 */

const fs = require('fs');
const fetch = require('node-fetch');

const CONFIG = {
  POSITIONS_FILE: '/root/trading-bot/positions.json',
  LOG_DIR: '/root/trading-bot/reconcile-logs',
  MAX_DEVIATION_ALERT: 0.05,    // 5% - alert only
  MAX_DEVIATION_FORCE: 0.20,     // 20% - force close
  MAX_HOLD_HOURS: 3,            // 3 hours max hold
  CHECK_INTERVAL: 15 * 60 * 1000 // 15 minutes
};

// Ensure log directory exists
if (!fs.existsSync(CONFIG.LOG_DIR)) {
  fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
}

/**
 * Main reconciliation function
 */
async function reconcile() {
  const result = {
    timestamp: new Date().toISOString(),
    positions: [],
    alerts: [],
    actions: [],
    summary: { checked: 0, ok: 0, alerts: 0, forced: 0 }
  };
  
  console.log('🔄 Starting reconciliation...');
  
  try {
    // Load positions
    const positions = JSON.parse(fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8'));
    const activePositions = positions.filter(p => !p.exited && p.positionSize >= 0.01);
    
    result.summary.checked = activePositions.length;
    
    if (activePositions.length === 0) {
      console.log('✅ No active positions to reconcile');
      result.summary.ok = 0;
      saveResult(result);
      return result;
    }
    
    // Check each position
    for (const pos of activePositions) {
      const check = await checkPosition(pos);
      result.positions.push(check);
      
      if (check.status === 'ALERT') {
        result.alerts.push(check);
        result.summary.alerts++;
      } else if (check.status === 'FORCE_CLOSE') {
        result.actions.push({ type: 'FORCE_CLOSE', symbol: pos.symbol, reason: check.reason });
        result.summary.forced++;
      } else {
        result.summary.ok++;
      }
    }
    
    // Save result
    saveResult(result);
    
    // Send alert if needed
    if (result.alerts.length > 0 || result.summary.forced > 0) {
      await sendAlert(result);
    }
    
    console.log(`✅ Reconciliation complete: ${result.summary.ok} OK, ${result.summary.alerts} alerts, ${result.summary.forced} forced`);
    
  } catch (e) {
    console.error('❌ Reconciliation error:', e.message);
    result.error = e.message;
    saveResult(result);
  }
  
  return result;
}

/**
 * Check single position
 */
async function checkPosition(pos) {
  const check = {
    symbol: pos.symbol,
    ca: pos.ca,
    entryTime: pos.entryTime,
    entryPrice: pos.entryPrice,
    currentPrice: null,
    pnlPercent: null,
    hoursHeld: null,
    status: 'OK',
    issues: []
  };
  
  try {
    // Get current price
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pos.ca}`);
    const data = await resp.json();
    
    if (data.pairs?.[0]) {
      check.currentPrice = parseFloat(data.pairs[0].priceUsd);
      check.pnlPercent = ((check.currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    }
    
    // Calculate hours held
    check.hoursHeld = (Date.now() - pos.entryTime) / (1000 * 60 * 60);
    
    // Check 1: Max hold timeout
    if (check.hoursHeld > CONFIG.MAX_HOLD_HOURS) {
      check.issues.push(`Max hold exceeded: ${check.hoursHeld.toFixed(1)}h > ${CONFIG.MAX_HOLD_HOURS}h`);
      check.status = 'ALERT';
    }
    
    // Check 2: SL trigger (if we have targets)
    if (pos.targets?.sl && check.currentPrice) {
      const slPercent = ((check.currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      if (slPercent <= pos.targets.slPercent) {
        check.issues.push(`SL triggered: ${slPercent.toFixed(2)}% <= ${pos.targets.slPercent}%`);
        check.status = 'FORCE_CLOSE';
        check.reason = 'SL_triggered';
      }
    }
    
    // Check 3: TP trigger (if price above TP1)
    if (pos.targets?.tp1 && check.currentPrice) {
      if (check.currentPrice >= pos.targets.tp1) {
        check.issues.push(`TP1 reached: $${check.currentPrice} >= $${pos.targets.tp1}`);
        check.status = 'ALERT';
        check.reason = 'TP1_reached';
      }
    }
    
    // Check 4: Large deviation (possible issue)
    if (check.pnlPercent !== null && Math.abs(check.pnlPercent) > CONFIG.MAX_DEVIATION_FORCE * 100) {
      check.issues.push(`Large deviation: ${check.pnlPercent.toFixed(2)}%`);
      check.status = 'FORCE_CLOSE';
      check.reason = 'deviation';
    }
    
    // Check 5: Negative PnL > 15%
    if (check.pnlPercent !== null && check.pnlPercent < -15) {
      check.issues.push(`Large loss: ${check.pnlPercent.toFixed(2)}%`);
      check.status = 'FORCE_CLOSE';
      check.reason = 'large_loss';
    }
    
  } catch (e) {
    check.error = e.message;
    check.status = 'ERROR';
  }
  
  return check;
}

/**
 * Save reconciliation result
 */
function saveResult(result) {
  const date = new Date().toISOString().split('T')[0];
  const logFile = `${CONFIG.LOG_DIR}/${date}.json`;
  
  let logs = [];
  if (fs.existsSync(logFile)) {
    try { logs = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
  }
  
  logs.push(result);
  
  // Keep only last 100 entries
  if (logs.length > 100) logs = logs.slice(-100);
  
  fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

/**
 * Send alert to Telegram
 */
async function sendAlert(result) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  
  let message = `⚠️ **RECONCILIATION ALERT**\n\n`;
  message += `Checked: ${result.summary.checked} positions\n`;
  message += `Alerts: ${result.summary.alerts}\n`;
  message += `Force Close: ${result.summary.forced}\n\n`;
  
  for (const alert of result.alerts) {
    message += `🔶 ${alert.symbol}: ${alert.issues.join(', ')}\n`;
  }
  
  for (const action of result.actions) {
    message += `🔴 ${action.type}: ${action.symbol} - ${action.reason}\n`;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {
    console.error('Failed to send alert:', e.message);
  }
}

// CLI: Run once
if (require.main === module) {
  reconcile().then(r => {
    console.log('\n📊 Result:', JSON.stringify(r.summary, null, 2));
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

// Export for cron
module.exports = { reconcile, CONFIG };
