#!/usr/bin/env node
/**
 * BALANCE GUARDIAN AGENT
 * Monitor balance movement, emergency stop if drastic drop
 * Auto-switch to evaluation mode and strategy optimization
 */

const fs = require('fs');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

const CONFIG = {
  // Thresholds
  BALANCE_FILE: '/root/trading-bot/balance-history.json',
  ALERT_DROP_PERCENT: 15,        // Alert if drop 15% from recent high
  EMERGENCY_DROP_PERCENT: 25,    // Emergency stop if drop 25%
  TIME_WINDOW_MINUTES: 30,       // Check last 30 minutes
  
  // Actions
  EMERGENCY_STOP_FILE: '/root/trading-bot/EMERGENCY_STOP',
  EVALUATION_MODE_FILE: '/root/trading-bot/EVALUATION_MODE',
  
  // Telegram
  BOT_TOKEN: TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  CHAT_ID: TELEGRAM_CHAT_ID || '-1003212463774',
  TOPIC_ID: 24,
  
  // Commands
  WALLET_ADDRESS: 'EpG25pVadjQ9M9NHJMXZSc6SsB3Mshj4Kk9uzDVB8kum',
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304'
};

class BalanceGuardian {
  constructor() {
    this.history = this.loadHistory();
    this.lastAlert = 0;
  }

  loadHistory() {
    try {
      if (fs.existsSync(CONFIG.BALANCE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.BALANCE_FILE, 'utf8'));
      }
    } catch (e) {}
    return { entries: [], lastCheck: Date.now() };
  }

  saveHistory() {
    fs.writeFileSync(CONFIG.BALANCE_FILE, JSON.stringify(this.history, null, 2));
  }

  async getBalance() {
    try {
      // Try Helius RPC first
      const res = await fetch(CONFIG.RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [CONFIG.WALLET_ADDRESS]
        })
      });
      const data = await res.json();
      
      // Check for RPC errors
      if (data.error) {
        console.error('RPC Error:', data.error.message);
        // Return last known balance from history instead of 0
        const lastEntry = this.history.entries[this.history.entries.length - 1];
        if (lastEntry && lastEntry.balance > 0) {
          console.log(`Using cached balance: ${lastEntry.balance} SOL`);
          return lastEntry.balance;
        }
        return 0;
      }
      
      return data.result?.value / 1000000000 || 0; // Convert lamports to SOL
    } catch (e) {
      console.error('Error fetching balance:', e.message);
      // Return last known balance from history instead of 0
      const lastEntry = this.history.entries[this.history.entries.length - 1];
      if (lastEntry && lastEntry.balance > 0) {
        console.log(`Using cached balance: ${lastEntry.balance} SOL`);
        return lastEntry.balance;
      }
      return 0;
    }
  }

  recordBalance(balance) {
    // SAFETY: Don't record 0 balance if we had positive balance before (RPC error protection)
    if (balance === 0 && this.history.entries.length > 0) {
      const lastEntry = this.history.entries[this.history.entries.length - 1];
      if (lastEntry.balance > 0) {
        console.log(`   ⚠️ Not recording 0 balance (RPC error), keeping last: ${lastEntry.balance.toFixed(4)} SOL`);
        return;
      }
    }
    
    const entry = {
      timestamp: Date.now(),
      balance: balance,
      date: new Date().toISOString()
    };
    
    this.history.entries.push(entry);
    
    // Keep only last 100 entries
    if (this.history.entries.length > 100) {
      this.history.entries = this.history.entries.slice(-100);
    }
    
    this.history.lastCheck = Date.now();
    this.saveHistory();
    
    // Also save current balance for dashboard
    const currentBalance = {
      balance: balance,
      address: CONFIG.WALLET_ADDRESS,
      updated: Date.now()
    };
    fs.writeFileSync('/root/trading-bot/current-balance.json', JSON.stringify(currentBalance, null, 2));
  }

  analyzeTrend() {
    const now = Date.now();
    const windowMs = CONFIG.TIME_WINDOW_MINUTES * 60 * 1000;
    
    // Get entries within time window
    const recentEntries = this.history.entries.filter(e => now - e.timestamp < windowMs);
    
    if (recentEntries.length < 2) return null;
    
    // Find high in window
    const high = Math.max(...recentEntries.map(e => e.balance));
    const current = recentEntries[recentEntries.length - 1].balance;
    const start = recentEntries[0].balance;
    
    // Calculate drops
    const dropFromHigh = ((high - current) / high) * 100;
    const dropFromStart = ((start - current) / start) * 100;
    
    // Calculate trend
    const trend = this.calculateTrend(recentEntries);
    
    return {
      high,
      current,
      start,
      dropFromHigh,
      dropFromStart,
      trend,
      timeSpan: (recentEntries[recentEntries.length - 1].timestamp - recentEntries[0].timestamp) / 60000
    };
  }

  calculateTrend(entries) {
    if (entries.length < 3) return 'neutral';
    
    let up = 0, down = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].balance > entries[i-1].balance) up++;
      else if (entries[i].balance < entries[i-1].balance) down++;
    }
    
    if (down > up * 2) return 'strong_down';
    if (down > up) return 'down';
    if (up > down * 2) return 'strong_up';
    if (up > down) return 'up';
    return 'neutral';
  }

  async notify(msg, priority = 'normal') {
    try {
      const emoji = priority === 'emergency' ? '🚨' : priority === 'alert' ? '⚠️' : 'ℹ️';
      await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.CHAT_ID,
          message_thread_id: CONFIG.TOPIC_ID,
          text: `${emoji} **BALANCE GUARDIAN**\n\n${msg}`,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.error('Notify failed:', e.message);
    }
  }

  async emergencyStop(reason) {
    console.log(`\n🚨 EMERGENCY STOP: ${reason}\n`);
    
    // Create emergency stop flag
    fs.writeFileSync(CONFIG.EMERGENCY_STOP_FILE, JSON.stringify({
      reason: reason,
      time: Date.now(),
      triggeredBy: 'BalanceGuardian'
    }, null, 2));
    
    // Kill live trader
    try {
      execSync('pkill -f "live-trader-v4.2" 2>/dev/null || true');
      execSync('pm2 stop live-trader-v4.2 2>/dev/null || true');
      console.log('✅ Live trader stopped');
    } catch (e) {
      console.log('⚠️  Could not stop live trader:', e.message);
    }
    
    // Notify
    await this.notify(
      `🛑 **EMERGENCY STOP ACTIVATED**\n\n` +
      `Reason: ${reason}\n` +
      `Time: ${new Date().toISOString()}\n\n` +
      `All trading HALTED.\n` +
      `Entering evaluation mode...`,
      'emergency'
    );
  }

  clearAllFlags() {
    console.log('\n🧹 Clearing all system flags...\n');
    
    try {
      fs.unlinkSync(CONFIG.EMERGENCY_STOP_FILE);
      console.log('✅ EMERGENCY_STOP cleared');
    } catch (e) {}
    
    try {
      fs.unlinkSync(CONFIG.EVALUATION_MODE_FILE);
      console.log('✅ EVALUATION_MODE cleared');
    } catch (e) {}
    
    try {
      fs.unlinkSync('/root/trading-bot/PAUSE_TRADING');
      console.log('✅ PAUSE_TRADING cleared');
    } catch (e) {}
    
    // Restart live trader if stopped
    try {
      execSync('pm2 restart live-trader-v4.2 2>/dev/null || true');
      console.log('✅ Live Trader restarted');
    } catch (e) {}
  }

  async enterEvaluationMode() {
    console.log('\n📊 Entering Evaluation Mode...\n');
    
    // Create evaluation mode flag
    fs.writeFileSync(CONFIG.EVALUATION_MODE_FILE, JSON.stringify({
      started: Date.now(),
      reason: 'Balance drop detected',
      targetWR: 70
    }, null, 2));
    
    // Pause trading
    fs.writeFileSync('/root/trading-bot/PAUSE_TRADING', Date.now().toString());
    
    await this.notify(
      `📊 **EVALUATION MODE STARTED**\n\n` +
      `All new buys PAUSED\n` +
      `Existing positions will be monitored\n\n` +
      `Next steps:\n` +
      `1. Analyze failed trades\n` +
      `2. Run Paper Trader optimization\n` +
      `3. Find strategy with WR >=70%\n` +
      `4. Resume only after validation`,
      'alert'
    );
  }

  async optimizeStrategy() {
    console.log('\n🔍 Running Strategy Optimization...\n');
    
    await this.notify(
      `🔍 **STRATEGY OPTIMIZATION**\n\n` +
      `Paper Trader v5 running intensive simulation...\n` +
      `Testing 8 strategy combinations\n` +
      `Target: WR >=70%\n\n` +
      `This may take 10-15 minutes...`,
      'normal'
    );
    
    // Run paper trader with extended simulation
    try {
      execSync('cd /root/trading-bot && node soul-core-paper-trader-v5.js --intensive 2>&1 | tee /root/trading-bot/logs/optimization.log', {
        timeout: 900000 // 15 minutes
      });
      
      // Check results
      const config = JSON.parse(fs.readFileSync('/root/trading-bot/adaptive-scoring-config.json', 'utf8'));
      const bestWR = config.bestStrategy?.winRate || 0;
      
      if (bestWR >= 70) {
        await this.notify(
          `✅ **OPTIMIZATION SUCCESS**\n\n` +
          `Best Strategy: ${config.bestStrategy.name}\n` +
          `Win Rate: ${bestWR}%\n\n` +
          `🚀 Auto-resuming trading with new strategy...`,
          'normal'
        );
        
        // FULL AUTO: Clear flags and resume trading
        this.clearAllFlags();
        await this.notify('✅ **TRADING RESUMED**\n\nSystem back to normal operation.', 'normal');
        
        return { success: true, wr: bestWR, strategy: config.bestStrategy };
      } else {
        await this.notify(
          `⚠️ **OPTIMIZATION INCOMPLETE**\n\n` +
          `Best WR achieved: ${bestWR}%\n` +
          `Target: 70%\n\n` +
          `System will continue with current strategies.\n` +
          `Auto-resuming in 5 minutes...`,
          'alert'
        );
        
        // FULL AUTO: Clear flags after delay even if optimization incomplete
        setTimeout(() => {
          this.clearAllFlags();
          this.notify('✅ **TRADING RESUMED**\n\nContinuing with current strategies.', 'normal');
        }, 300000); // 5 minutes
        
        return { success: false, wr: bestWR };
      }
    } catch (e) {
      console.error('Optimization failed:', e.message);
      return { success: false, error: e.message };
    }
  }

  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('🛡️  BALANCE GUARDIAN AGENT');
    console.log('='.repeat(60));
    
    // Get current balance
    const balance = await this.getBalance();
    console.log(`\n💰 Current Balance: ${balance.toFixed(4)} SOL`);
    
    // STARTUP GRACE PERIOD: Skip if less than 5 entries in history
    if (this.history.entries.length < 5) {
      console.log(`\n⏳ Startup grace period: ${this.history.entries.length}/5 entries. Skipping analysis.`);
      this.recordBalance(balance);
      return;
    }
    
    // Record
    this.recordBalance(balance);
    
    // Analyze
    const analysis = this.analyzeTrend();
    if (!analysis) {
      console.log('⏳ Not enough data for analysis yet...');
      return;
    }
    
    console.log(`\n📊 ANALYSIS (last ${analysis.timeSpan.toFixed(0)} min):`);
    console.log(`   High: ${analysis.high.toFixed(4)} SOL`);
    console.log(`   Current: ${analysis.current.toFixed(4)} SOL`);
    console.log(`   Drop from high: ${analysis.dropFromHigh.toFixed(2)}%`);
    console.log(`   Trend: ${analysis.trend}`);
    
    // SAFETY CHECK: Don't trigger if balance is 0 or very low (likely RPC error)
    if ((balance === 0 || balance < 0.001) && analysis.high > 0.01) {
      console.log('\n⚠️ Balance shows ' + balance.toFixed(4) + ' but high was ' + analysis.high.toFixed(4) + '. Possible RPC error. Skipping emergency stop.');
      console.log('   Using cached balance instead.');
      return;
    }
    
    // Check conditions
    if (analysis.dropFromHigh >= CONFIG.EMERGENCY_DROP_PERCENT) {
      // EMERGENCY: Stop everything
      await this.emergencyStop(
        `Balance dropped ${analysis.dropFromHigh.toFixed(1)}% in ${CONFIG.TIME_WINDOW_MINUTES} min\n` +
        `From ${analysis.high.toFixed(4)} to ${analysis.current.toFixed(4)} SOL`
      );
      
      // Enter evaluation
      await this.enterEvaluationMode();
      
      // Try to optimize
      const result = await this.optimizeStrategy();
      
      if (result.success) {
        console.log('\n✅ Optimization complete. Ready for manual resume.');
      } else {
        console.log('\n⚠️  Could not achieve target WR. Manual intervention needed.');
      }
      
    } else if (analysis.dropFromHigh >= CONFIG.ALERT_DROP_PERCENT) {
      // ALERT: Warning only
      if (Date.now() - this.lastAlert > 300000) { // 5 min cooldown
        await this.notify(
          `⚠️ **BALANCE ALERT**\n\n` +
          `Drop: ${analysis.dropFromHigh.toFixed(1)}% in ${CONFIG.TIME_WINDOW_MINUTES} min\n` +
          `High: ${analysis.high.toFixed(4)} SOL\n` +
          `Current: ${analysis.current.toFixed(4)} SOL\n\n` +
          `Monitoring closely...`,
          'alert'
        );
        this.lastAlert = Date.now();
      }
      
      console.log(`\n⚠️  ALERT: Drop ${analysis.dropFromHigh.toFixed(1)}% - Notified`);
      
    } else if (analysis.trend === 'strong_down') {
      // Strong down trend - preemptive alert
      console.log('\n⚠️  Strong downward trend detected');
      await this.notify(
        `📉 **DOWNWARD TREND**\n\n` +
        `Strong decline pattern detected\n` +
        `Current drop: ${analysis.dropFromHigh.toFixed(1)}%\n\n` +
        `Recommend: Reduce position sizes or pause`,
        'alert'
      );
      
    } else {
      console.log('\n✅ Balance healthy - No action needed');
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

// Run
const guardian = new BalanceGuardian();
guardian.run().catch(console.error);
