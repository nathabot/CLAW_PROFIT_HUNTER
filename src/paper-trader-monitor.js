#!/usr/bin/env node
/**
 * PAPER TRADER MONITOR
 * Regular reporting to Telegram group
 */

const fs = require('fs');
const fetch = require('node-fetch');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

const CONFIG = {
  BOT_TOKEN: TELEGRAM_BOT_TOKEN,
  CHAT_ID: TELEGRAM_CHAT_ID,
  TOPIC_ID: 25, // Evaluations topic
  STATE_FILE: '/root/trading-bot/paper-trader-v5-state.json',
  POSITIVE_FILE: '/root/trading-bot/bok/16-positive-strategies.md',
  LOG_FILE: '/root/trading-bot/logs/paper-trader-monitor.log'
};

class PaperTraderMonitor {
  constructor() {
    this.state = this.loadState();
    this.lastReportedSimCount = 0;
  }

  loadState() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
    } catch (e) {
      return { simulationCount: 0, results: {} };
    }
  }

  async notify(msg) {
    try {
      await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.CHAT_ID,
          message_thread_id: CONFIG.TOPIC_ID,
          text: msg,
          parse_mode: 'Markdown'
        })
      });
      console.log('✅ Report sent to Telegram');
    } catch (e) {
      console.error('❌ Telegram error:', e.message);
    }
  }

  generateReport() {
    const state = this.loadState();
    const sorted = Object.values(state.results)
      .filter(r => r.total > 0)
      .sort((a, b) => (b.wins / b.total) - (a.wins / a.total));
    
    let msg = `📊 **PAPER TRADER MONITOR**\n\n`;
    msg += `🎯 Progress: ${state.simulationCount}/50 simulations\n`;
    msg += `📅 ${new Date().toLocaleString('id-ID')}\n\n`;
    
    if (sorted.length > 0) {
      // Best strategy
      const best = sorted[0];
      const bestWR = best.total > 0 ? ((best.wins / best.total) * 100).toFixed(1) : '0.0';
      const bestPnL = (best.totalProfit + best.totalLoss).toFixed(4);
      
      msg += `🏆 **Best: ${best.name}**\n`;
      msg += `WR: ${bestWR}% | PnL: ${bestPnL} SOL\n\n`;
      
      // All strategies
      msg += `📈 **All Strategies:**\n`;
      for (const s of sorted.slice(0, 8)) {
        const wr = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(1) : '0.0';
        const pnl = (s.totalProfit + s.totalLoss).toFixed(4);
        const emoji = wr >= 70 ? '🟢' : wr >= 50 ? '🟡' : '🔴';
        msg += `${emoji} ${s.name}: ${wr}% (${s.wins}W/${s.losses}L) ${pnl} SOL\n`;
      }
      
      // BOK Status
      const qualified = sorted.filter(r => {
        const wr = r.wins / r.total;
        return r.total >= 3 && wr >= 0.70;
      }).length;
      
      msg += `\n📚 **BOK Status:**\n`;
      msg += `✅ Qualified (≥70% WR, 3+ trades): ${qualified}\n`;
      msg += `🎯 Target: WR ≥ 70% for Live Trading\n`;
    } else {
      msg += `⏳ Building statistics...\n`;
    }
    
    // Progress bar
    const progress = Math.min(100, Math.round((state.simulationCount / 50) * 100));
    const filled = Math.round(progress / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    msg += `\n📊 Progress: [${bar}] ${progress}%\n`;
    
    if (state.simulationCount >= 50) {
      msg += `\n🔄 **CYCLE COMPLETE** - Auto-resetting...\n`;
    }
    
    return msg;
  }

  async run() {
    console.log('📊 Paper Trader Monitor - Starting...');
    const report = this.generateReport();
    await this.notify(report);
    console.log('✅ Monitor complete');
  }
}

// Run
const monitor = new PaperTraderMonitor();
monitor.run().catch(console.error);
