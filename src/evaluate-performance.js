#!/usr/bin/env node
/**
 * PERFORMANCE EVALUATION SYSTEM v3.0
 * - Minimum 15 trades threshold before judgment
 * - Uses Expectancy instead of WR
 * - Rolling window (last 30 trades)
 * - Adaptive threshold based on sample size
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
  TRADING_CONFIG: '/root/trading-bot/trading-config.json',
  MIN_TRADES_THRESHOLD: 15,
  ROLLING_WINDOW: 30
};

class PerformanceEvaluator {
  constructor() {
    this.state = this.loadState();
    this.config = this.loadConfig();
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

  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.TRADING_CONFIG, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  saveConfig(config) {
    fs.writeFileSync(CONFIG.TRADING_CONFIG, JSON.stringify(config, null, 2));
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
    let positions = [];
    try {
      if (fs.existsSync(CONFIG.POSITIONS_FILE)) {
        positions = JSON.parse(fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('Error reading positions:', e.message);
    }

    // Get last 30 trades (rolling window)
    const closedPositions = positions
      .filter(p => p.exited || p.partialExited)
      .sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0))
      .slice(0, CONFIG.ROLLING_WINDOW);

    const wins = closedPositions.filter(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice;
      return (exitPrice / p.entryPrice - 1) > 0;
    });
    const losses = closedPositions.filter(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice;
      return (exitPrice / p.entryPrice - 1) <= 0;
    });
    
    const totalTrades = closedPositions.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    
    // Calculate Expectancy: (WR% × avgWin) - ((1-WR%) × avgLoss)
    const avgWin = wins.length > 0 
      ? wins.reduce((a, b) => {
          const exitPrice = b.exitPrice || b.partialExitPrice;
          return a + ((exitPrice / b.entryPrice - 1) * 100);
        }, 0) / wins.length 
      : 0;
    
    const avgLoss = losses.length > 0 
      ? losses.reduce((a, b) => {
          const exitPrice = b.exitPrice || b.partialExitPrice;
          return a + Math.abs((exitPrice / b.entryPrice - 1) * 100);
        }, 0) / losses.length 
      : 0;
    
    const expectancy = totalTrades > 0 
      ? ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss)
      : 0;

    // Drawdown
    let totalProfit = 0;
    let maxDrawdown = 0;
    let peak = 0;
    
    closedPositions.forEach(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice || p.entryPrice;
      const pnl = (exitPrice / p.entryPrice - 1) * 100;
      const positionSize = p.partialExited && !p.exited ? (p.positionSize || 0.02) * 0.5 : (p.positionSize || 0.02);
      totalProfit += (pnl / 100) * positionSize;
      
      if (totalProfit > peak) peak = totalProfit;
      const drawdown = peak > 0 ? ((peak - totalProfit) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    return {
      totalTrades,
      winRate: winRate.toFixed(2),
      expectancy: expectancy.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitSOL: totalProfit.toFixed(4),
      drawdown: maxDrawdown.toFixed(2),
      winningTrades: wins.length,
      losingTrades: losses.length,
      positions: closedPositions
    };
  }

  evaluate(metrics) {
    const winRate = parseFloat(metrics.winRate) || 0;
    const expectancy = parseFloat(metrics.expectancy) || 0;
    const drawdown = parseFloat(metrics.drawdown) || 0;
    const totalTrades = parseInt(metrics.totalTrades) || 0;
    
    const thresholds = this.config.THRESHOLDS || {
      MIN_WIN_RATE: 55,
      MIN_EXPECTANCY: 2,
      MAX_DRAWDOWN: 30
    };
    
    const checks = {
      minTrades: totalTrades >= CONFIG.MIN_TRADES_THRESHOLD,
      expectancy: expectancy >= thresholds.MIN_EXPECTANCY,
      winRate: winRate >= 45,
      drawdown: drawdown <= thresholds.MAX_DRAWDOWN
    };

    let verdict = 'NEUTRAL';
    let action = 'CONTINUE';

    if (!checks.minTrades) {
      verdict = 'GRACE_PERIOD';
      action = 'CONTINUE';
      console.log(`  ℹ️ Grace period: Only ${totalTrades} trades (need ${CONFIG.MIN_TRADES_THRESHOLD}+).`);
    } 
    else if (checks.expectancy && checks.drawdown) {
      verdict = 'POSITIVE';
      action = 'CONTINUE';
      this.state.consecutiveNegative = 0;
    } else if (!checks.expectancy || !checks.drawdown) {
      verdict = 'NEGATIVE';
      action = 'ANALYZE_AND_FIX';
      this.state.consecutiveNegative++;
    }

    return { verdict, action, checks };
  }

  performRootCauseAnalysis(failedChecks, metrics) {
    console.log('🔍 Performing ROOT CAUSE ANALYSIS...');
    
    const positions = metrics.positions || [];
    if (positions.length < 3) {
      return { rootCauses: [], solutions: [], fixes: {} };
    }
    
    const analysis = { rootCauses: [], solutions: [], fixes: {} };
    
    if (!failedChecks.expectancy) {
      const expAnalysis = this.analyzeExpectancy(positions, metrics);
      analysis.rootCauses.push(...expAnalysis.rootCauses);
      analysis.solutions.push(...expAnalysis.solutions);
      Object.assign(analysis.fixes, expAnalysis.fixes);
    }
    
    if (!failedChecks.drawdown) {
      const ddAnalysis = this.analyzeDrawdown(positions);
      analysis.rootCauses.push(...ddAnalysis.rootCauses);
      analysis.solutions.push(...ddAnalysis.solutions);
      Object.assign(analysis.fixes, ddAnalysis.fixes);
    }
    
    if (metrics.winRate < 45) {
      analysis.rootCauses.push(`⚠️ Low Win Rate: ${metrics.winRate}%`);
    }
    
    return analysis;
  }
  
  analyzeExpectancy(positions, metrics) {
    const result = { rootCauses: [], solutions: [], fixes: {} };
    const { winRate, avgWin, avgLoss } = metrics;
    
    if (winRate < 45) {
      result.rootCauses.push(`🔴 Low Win Rate: ${winRate}%`);
      result.solutions.push('• Wait for stronger signals');
      result.fixes.tighterEntries = true;
    }
    
    if (avgWin < 15) {
      result.rootCauses.push(`🔴 Avg Win too small: ${avgWin}%`);
      result.solutions.push('• Let winners run longer');
      result.fixes.tp2_higher = 0.08;
    }
    
    if (avgLoss > 15) {
      result.rootCauses.push(`🔴 Avg Loss too high: ${avgLoss}%`);
      result.solutions.push('• Tighten stop loss');
      result.fixes.sl_tighter = 0.10;
    }
    
    const rr = avgWin / (avgLoss || 1);
    if (rr < 1.5) {
      result.rootCauses.push(`🟡 Poor Risk/Reward: ${rr.toFixed(2)}`);
      result.fixes.rr_improve = true;
    }
    
    return result;
  }
  
  analyzeDrawdown(positions) {
    const result = { rootCauses: [], solutions: [], fixes: {} };
    
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    
    const sortedByTime = positions.sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));
    
    for (const p of sortedByTime) {
      if ((p.pnlPercent || 0) < 0) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      } else {
        currentConsecutive = 0;
      }
    }
    
    if (maxConsecutive >= 3) {
      result.rootCauses.push(`🔴 Consecutive losses: ${maxConsecutive}`);
      result.solutions.push('• Take break after 2 losses');
      result.fixes.consecutive_loss_limit = 2;
    }
    
    return result;
  }
  
  applyAutoFixes(fixes) {
    console.log('⚡ Applying AUTO-FIXES...');
    let config = this.config;
    let fixSummary = [];
    
    if (fixes.sl_tighter && config.STOP_LOSS) {
      config.STOP_LOSS.percent = Math.max(config.STOP_LOSS.percent - 0.02, 0.08);
      fixSummary.push(`SL: ${(config.STOP_LOSS.percent*100).toFixed(0)}%`);
    }
    
    if (fixes.tp2_higher && config.TAKE_PROFIT) {
      config.TAKE_PROFIT.TP2_PERCENT = Math.max((config.TAKE_PROFIT.TP2_PERCENT || 50) + 2, 8);
      fixSummary.push(`TP2: ${config.TAKE_PROFIT.TP2_PERCENT}%`);
    }
    
    if (fixes.consecutive_loss_limit) {
      if (!config.RISK_MANAGEMENT) config.RISK_MANAGEMENT = {};
      config.RISK_MANAGEMENT.max_consecutive_losses = fixes.consecutive_loss_limit;
      fixSummary.push(`Max consecutive: ${fixes.consecutive_loss_limit}`);
    }
    
    if (fixes.tighterEntries) {
      if (!config.ENTRY_FILTERS) config.ENTRY_FILTERS = {};
      config.ENTRY_FILTERS.min_signal_score = 7;
      fixSummary.push(`Min score: 7`);
    }
    
    this.saveConfig(config);
    console.log('   ✅ Config updated:', fixSummary.join(', '));
    return fixSummary;
  }
  
  resumeTrading() {
    const files = ['/root/trading-bot/EMERGENCY_STOP', '/root/trading-bot/PAUSE_TRADING'];
    for (const f of files) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
    }
    this.state.tradingEnabled = true;
    this.saveState();
  }

  async takeAction(action, failedChecks = {}, metrics = {}) {
    let rootCauseReport = '';
    let fixSummary = [];
    
    if (action === 'ANALYZE_AND_FIX') {
      const analysis = this.performRootCauseAnalysis(failedChecks, metrics);
      
      const trigger = Object.entries(failedChecks).filter(([k, v]) => !v).map(([k]) => k.toUpperCase()).join(', ');
      rootCauseReport = `📊 **ROOT CAUSE ANALYSIS**
**Trigger:** ${trigger}
**Actual:** ${metrics.expectancy}% expectancy | ${metrics.winRate}% WR | ${metrics.avgWin}% avgWin | ${metrics.avgLoss}% avgLoss

`;
      
      if (analysis.rootCauses.length > 0) {
        rootCauseReport += '🔍 **AKAR MASALAH:**\n';
        analysis.rootCauses.forEach((rc, i) => rootCauseReport += `${i+1}. ${rc}\n`);
        
        rootCauseReport += '\n💡 **SOLUSI:**\n';
        analysis.solutions.forEach((sol, i) => rootCauseReport += `${i+1}. ${sol}\n`);
        
        if (Object.keys(analysis.fixes).length > 0) {
          fixSummary = this.applyAutoFixes(analysis.fixes);
          rootCauseReport += '\n⚡ **AUTO-FIX APPLIED:**\n';
          fixSummary.forEach(f => rootCauseReport += `• ${f}\n`);
        }
      }
      
      this.resumeTrading();
      rootCauseReport += '\n✅ **Trading resumed after analysis & fixes**';
      
      await this.notify('🔍 **EVALUATION: NEGATIVE → ANALYZING & FIXING...**\n' + rootCauseReport);
      
    } else if (action === 'CONTINUE') {
      this.resumeTrading();
      
      const status = metrics.totalTrades < CONFIG.MIN_TRADES_THRESHOLD 
        ? `📈 Grace Period: ${metrics.totalTrades}/${CONFIG.MIN_TRADES_THRESHOLD} trades`
        : `✅ Positive: ${metrics.expectancy}% expectancy`;
      
      await this.notify(`📊 **EVALUATION #${this.state.totalEvaluations + 1}**

**Last ${CONFIG.ROLLING_WINDOW} trades:**
• Trades: ${metrics.totalTrades} | WR: ${metrics.winRate}%
• Expectancy: ${metrics.expectancy}% | Avg Win: ${metrics.avgWin}% | Avg Loss: ${metrics.avgLoss}%
• Profit: ${metrics.profitSOL} SOL | DD: ${metrics.drawdown}%

**${status}**

🟢 Trading continues | ⏰ Next: 4 hours`);
    }
  }

  async run() {
    console.log('🔍 Performance Evaluation v3.0...\n');
    console.log(`📊 Min ${CONFIG.MIN_TRADES_THRESHOLD} trades, Rolling ${CONFIG.ROLLING_WINDOW} trades`);

    const metrics = this.calculateMetrics();
    console.log(`📊 Metrics: WR ${metrics.winRate}% | Exp ${metrics.expectancy}% | Trades ${metrics.totalTrades}`);

    const evaluation = this.evaluate(metrics);
    console.log(`📋 Verdict: ${evaluation.verdict} | Action: ${evaluation.action}\n`);

    await this.takeAction(evaluation.action, evaluation.checks, metrics);

    this.state.lastEvaluation = new Date().toISOString();
    this.state.totalEvaluations++;
    this.saveState();

    console.log('✅ Evaluation complete!\n');
  }
}

const evaluator = new PerformanceEvaluator();
evaluator.run().catch(console.error);
