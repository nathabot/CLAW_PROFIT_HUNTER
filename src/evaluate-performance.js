#!/usr/bin/env node
/**
 * PERFORMANCE EVALUATION SYSTEM
 * Run every 2 hours to assess trading performance
 * Auto-action: Pause/Continue based on metrics
 */

const fs = require('fs');
const fetch = require('node-fetch');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

const CONFIG = {
  BOT_TOKEN: TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  CHAT_ID: TELEGRAM_CHAT_ID || '-1003212463774',
  TOPIC_ID: 24,
  EVALUATION_FILE: '/root/trading-bot/bok/15-performance-evaluations.md',
  STATE_FILE: '/root/trading-bot/evaluation-state.json',
  POSITIONS_FILE: '/root/trading-bot/positions.json',
  TRADES_LOG: '/root/trading-bot/live-trades.log',
  THRESHOLDS: {
    MIN_WIN_RATE: 60,        // Minimum 60% WR
    MIN_PROFIT_SOL: 0.05,    // Minimum 0.05 SOL profit
    MAX_DRAWDOWN: 20,        // Max 20% drawdown
    MAX_VOLATILITY: 40       // Max 40% volatility
  }
};

class PerformanceEvaluator {
  constructor() {
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      lastEvaluation: null,
      totalEvaluations: 0,
      consecutiveNegative: 0,
      tradingEnabled: true
    };
  }

  saveState() {
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2));
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
    } catch (e) {
      console.error('Telegram notify failed:', e.message);
    }
  }

  calculateMetrics() {
    // Read positions file
    let positions = [];
    try {
      if (fs.existsSync(CONFIG.POSITIONS_FILE)) {
        positions = JSON.parse(fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('Error reading positions:', e.message);
    }

    // Calculate metrics
    const closedPositions = positions.filter(p => p.exited);
    const winningTrades = closedPositions.filter(p => (p.exitPrice / p.entryPrice - 1) > 0);
    const losingTrades = closedPositions.filter(p => (p.exitPrice / p.entryPrice - 1) <= 0);
    
    const totalTrades = closedPositions.length;
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    
    let totalProfit = 0;
    let maxDrawdown = 0;
    let peak = 0;
    
    closedPositions.forEach(p => {
      const pnl = (p.exitPrice / p.entryPrice - 1) * 100;
      totalProfit += (pnl / 100) * (p.positionSize || 0.02);
      
      // Calculate drawdown
      if (totalProfit > peak) peak = totalProfit;
      const drawdown = ((peak - totalProfit) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    // Calculate volatility (standard deviation of returns)
    const returns = closedPositions.map(p => (p.exitPrice / p.entryPrice - 1) * 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length || 0;
    const volatility = Math.sqrt(variance);

    return {
      totalTrades,
      winRate: winRate.toFixed(2),
      profitSOL: totalProfit.toFixed(4),
      drawdown: maxDrawdown.toFixed(2),
      volatility: volatility.toFixed(2),
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length
    };
  }

  evaluate(metrics) {
    const checks = {
      winRate: parseFloat(metrics.winRate) >= CONFIG.THRESHOLDS.MIN_WIN_RATE,
      profit: parseFloat(metrics.profitSOL) >= CONFIG.THRESHOLDS.MIN_PROFIT_SOL,
      drawdown: parseFloat(metrics.drawdown) <= CONFIG.THRESHOLDS.MAX_DRAWDOWN,
      volatility: parseFloat(metrics.volatility) <= CONFIG.THRESHOLDS.MAX_VOLATILITY
    };

    // Verdict logic
    let verdict = 'NEUTRAL';
    let action = 'CONTINUE';

    if (checks.winRate && checks.profit && checks.drawdown) {
      verdict = 'POSITIVE';
      action = 'CONTINUE';
      this.state.consecutiveNegative = 0;
    } else if (!checks.winRate || parseFloat(metrics.profitSOL) < 0 || !checks.drawdown) {
      verdict = 'NEGATIVE';
      action = 'STOP_AND_REEVALUATE';
      this.state.consecutiveNegative++;
    }

    // Auto-disable if 3 consecutive negative evaluations
    if (this.state.consecutiveNegative >= 3) {
      action = 'EMERGENCY_STOP';
      this.state.tradingEnabled = false;
    }

    return { verdict, action, checks };
  }

  async takeAction(action) {
    switch (action) {
      case 'STOP_AND_REEVALUATE':
        console.log('⏸️  Pausing trading...');
        // Create pause flag file
        fs.writeFileSync('/root/trading-bot/PAUSE_TRADING', Date.now().toString());
        await this.notify('⏸️ **TRADING PAUSED**\n\nNegative evaluation detected.\nManual review required before resuming.');
        break;
      
      case 'EMERGENCY_STOP':
        console.log('🛑 EMERGENCY STOP!');
        fs.writeFileSync('/root/trading-bot/EMERGENCY_STOP', Date.now().toString());
        await this.notify('🛑 **EMERGENCY STOP ACTIVATED**\n\n3 consecutive negative evaluations.\nTrading HALTED until manual intervention.');
        break;
      
      case 'CONTINUE':
        console.log('✅ Trading continues...');
        // Remove pause files if exist
        try {
          fs.unlinkSync('/root/trading-bot/PAUSE_TRADING');
        } catch (e) {}
        break;
    }
  }

  logEvaluation(metrics, evaluation) {
    const timestamp = new Date().toISOString();
    const entry = `
### ${timestamp} - Evaluation #${this.state.totalEvaluations + 1}

**Metrics:**
- Total Trades: ${metrics.totalTrades}
- Win Rate: ${metrics.winRate}%
- Profit: ${metrics.profitSOL} SOL
- Drawdown: ${metrics.drawdown}%
- Volatility: ${metrics.volatility}%

**Checks:**
- Win Rate ≥ ${CONFIG.THRESHOLDS.MIN_WIN_RATE}%: ${evaluation.checks.winRate ? '✅' : '❌'}
- Profit ≥ ${CONFIG.THRESHOLDS.MIN_PROFIT_SOL} SOL: ${evaluation.checks.profit ? '✅' : '❌'}
- Drawdown ≤ ${CONFIG.THRESHOLDS.MAX_DRAWDOWN}%: ${evaluation.checks.drawdown ? '✅' : '❌'}
- Volatility ≤ ${CONFIG.THRESHOLDS.MAX_VOLATILITY}%: ${evaluation.checks.volatility ? '✅' : '❌'}

**Verdict:** ${evaluation.verdict}
**Action:** ${evaluation.action}
**Consecutive Negative:** ${this.state.consecutiveNegative}

---
`;

    fs.appendFileSync(CONFIG.EVALUATION_FILE, entry);
  }

  async run() {
    console.log('🔍 Starting Performance Evaluation...\n');

    // Calculate metrics
    const metrics = this.calculateMetrics();
    console.log('📊 Metrics:');
    console.log(`  Win Rate: ${metrics.winRate}%`);
    console.log(`  Profit: ${metrics.profitSOL} SOL`);
    console.log(`  Drawdown: ${metrics.drawdown}%`);
    console.log(`  Volatility: ${metrics.volatility}%`);
    console.log(`  Total Trades: ${metrics.totalTrades}\n`);

    // Evaluate
    const evaluation = this.evaluate(metrics);
    console.log(`📋 Verdict: ${evaluation.verdict}`);
    console.log(`🎯 Action: ${evaluation.action}\n`);

    // Take action
    await this.takeAction(evaluation.action);

    // Update state
    this.state.lastEvaluation = new Date().toISOString();
    this.state.totalEvaluations++;
    this.saveState();

    // Log to file
    this.logEvaluation(metrics, evaluation);

    // Send notification
    const msg = `📊 **PERFORMANCE EVALUATION #${this.state.totalEvaluations}**

**Metrics:**
• Win Rate: ${metrics.winRate}% (${metrics.winningTrades}W/${metrics.losingTrades}L)
• Profit: ${metrics.profitSOL} SOL
• Drawdown: ${metrics.drawdown}%

**Verdict:** ${evaluation.verdict === 'POSITIVE' ? '✅' : evaluation.verdict === 'NEGATIVE' ? '❌' : '⚠️'} ${evaluation.verdict}
**Action:** ${evaluation.action}

${evaluation.action === 'CONTINUE' ? '🟢 Trading continues' : evaluation.action === 'STOP_AND_REEVALUATE' ? '⏸️ Trading PAUSED' : '🛑 EMERGENCY STOP'}

⏰ Next eval: 2 hours`;

    await this.notify(msg);

    console.log('✅ Evaluation complete!\n');
  }
}

// Run evaluation
const evaluator = new PerformanceEvaluator();
evaluator.run().catch(console.error);
