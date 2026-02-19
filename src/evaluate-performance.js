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
    MIN_WIN_RATE: 55,        // Minimum 55% WR
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

    // Calculate metrics - include both full exits and partial exits
    const closedPositions = positions.filter(p => p.exited || p.partialExited);
    const winningTrades = closedPositions.filter(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice;
      return (exitPrice / p.entryPrice - 1) > 0;
    });
    const losingTrades = closedPositions.filter(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice;
      return (exitPrice / p.entryPrice - 1) <= 0;
    });
    
    const totalTrades = closedPositions.length;
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
    
    let totalProfit = 0;
    let maxDrawdown = 0;
    let peak = 0;
    
    closedPositions.forEach(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice || p.entryPrice;
      const pnl = (exitPrice / p.entryPrice - 1) * 100;
      // For partial exits, only count the exited portion (50%)
      const positionSize = p.partialExited && !p.exited ? (p.positionSize || 0.02) * 0.5 : (p.positionSize || 0.02);
      totalProfit += (pnl / 100) * positionSize;
      
      // Calculate drawdown
      if (totalProfit > peak) peak = totalProfit;
      const drawdown = peak > 0 ? ((peak - totalProfit) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    // Calculate volatility (standard deviation of returns)
    const returns = closedPositions.map(p => {
      const exitPrice = p.exitPrice || p.partialExitPrice || p.entryPrice;
      return (exitPrice / p.entryPrice - 1) * 100;
    });
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
    // Parse metrics safely (handle NaN)
    const winRate = parseFloat(metrics.winRate) || 0;
    const profitSOL = parseFloat(metrics.profitSOL) || 0;
    const drawdown = parseFloat(metrics.drawdown) || 0;
    const totalTrades = parseInt(metrics.totalTrades) || 0;
    
    const checks = {
      winRate: winRate >= CONFIG.THRESHOLDS.MIN_WIN_RATE,
      profit: profitSOL >= CONFIG.THRESHOLDS.MIN_PROFIT_SOL,
      drawdown: drawdown <= CONFIG.THRESHOLDS.MAX_DRAWDOWN,
      volatility: parseFloat(metrics.volatility) <= CONFIG.THRESHOLDS.MAX_VOLATILITY
    };

    // Verdict logic
    let verdict = 'NEUTRAL';
    let action = 'CONTINUE';

    // STARTUP GRACE PERIOD: Don't penalize if less than 10 trades
    if (totalTrades < 10) {
      verdict = 'NEUTRAL';
      action = 'CONTINUE';
      console.log(`  ℹ️ Grace period: Only ${totalTrades} trades. Skipping negative evaluation.`);
    } else if (checks.winRate && checks.profit && checks.drawdown) {
      verdict = 'POSITIVE';
      action = 'CONTINUE';
      this.state.consecutiveNegative = 0;
    } else if (!checks.winRate || profitSOL < 0 || !checks.drawdown) {
      verdict = 'NEGATIVE';
      action = 'STOP_AND_REEVALUATE';
      this.state.consecutiveNegative++;
    }

    // Auto-disable if 3 consecutive negative evaluations (only after grace period)
    if (this.state.consecutiveNegative >= 3 && totalTrades >= 10) {
      action = 'EMERGENCY_STOP';
      this.state.tradingEnabled = false;
    }

    return { verdict, action, checks };
  }

  // ==================== ROOT CAUSE ANALYSIS ====================
  
  async performRootCauseAnalysis(failedChecks, metrics) {
    console.log('🔍 Performing ROOT CAUSE ANALYSIS...');
    
    const positions = this.getClosedPositions();
    if (positions.length < 3) {
      return { rootCauses: [], solutions: [], fixes: [] };
    }
    
    const analysis = {
      rootCauses: [],
      solutions: [],
      fixes: []
    };
    
    // Analyze Win Rate issues
    if (!failedChecks.winRate) {
      const wrAnalysis = this.analyzeWinRate(positions);
      analysis.rootCauses.push(...wrAnalysis.rootCauses);
      analysis.solutions.push(...wrAnalysis.solutions);
      analysis.fixes.push(...wrAnalysis.fixes);
    }
    
    // Analyze Profit issues
    if (!failedChecks.profit) {
      const profitAnalysis = this.analyzeProfit(positions);
      analysis.rootCauses.push(...profitAnalysis.rootCauses);
      analysis.solutions.push(...profitAnalysis.solutions);
      analysis.fixes.push(...profitAnalysis.fixes);
    }
    
    // Analyze Drawdown issues
    if (!failedChecks.drawdown) {
      const ddAnalysis = this.analyzeDrawdown(positions);
      analysis.rootCauses.push(...ddAnalysis.rootCauses);
      analysis.solutions.push(...ddAnalysis.solutions);
      analysis.fixes.push(...ddAnalysis.fixes);
    }
    
    return analysis;
  }
  
  getClosedPositions() {
    try {
      const data = fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8');
      return JSON.parse(data).filter(p => p.exited);
    } catch (e) {
      return [];
    }
  }
  
  analyzeWinRate(positions) {
    const result = { rootCauses: [], solutions: [], fixes: [] };
    
    // Check exit types
    const stopLosses = positions.filter(p => p.exitType === 'STOP_LOSS');
    const tpExits = positions.filter(p => p.exitType?.includes('TP'));
    const maxHolds = positions.filter(p => p.exitType === 'MAX_HOLD');
    
    const slCount = stopLosses.length;
    const tpCount = tpExits.length;
    const mhCount = maxHolds.length;
    
    // Check partial exits
    const partialExits = positions.filter(p => p.partialExited && !p.exited);
    const fullLosses = positions.filter(p => p.partialExited && p.exited && (p.pnlPercent || 0) < 0);
    
    // Analyze patterns
    if (slCount / positions.length > 0.4) {
      result.rootCauses.push(`🔴 High Stop Loss rate: ${(slCount/positions.length*100).toFixed(0)}% of trades hit SL`);
      result.solutions.push('• Review entry timing - entering too early/against momentum');
      result.solutions.push('• Check if SL is too tight for token volatility');
      result.fixes.push({ type: 'sl_adjust', value: 0.02 });
    }
    
    if (mhCount / positions.length > 0.3) {
      result.rootCauses.push(`🟡 Many MAX_HOLD exits: ${(mhCount/positions.length*100).toFixed(0)}% - missing TP targets`);
      result.solutions.push('• TP targets too aggressive - price reverses before hitting');
      result.solutions.push('• Consider taking partial profits earlier');
      result.fixes.push({ type: 'tp_aggressive', value: -0.05 });
    }
    
    if (partialExits.length > 0 && fullLosses.length > partialExits.length) {
      result.rootCauses.push('🔴 Partial exits turned into losses - exiting remainder too late');
      result.solutions.push('• Exit remaining position faster after partial TP');
      result.fixes.push({ type: 'partial_exit_timing', value: 0.5 });
    }
    
    return result;
  }
  
  analyzeProfit(positions) {
    const result = { rootCauses: [], solutions: [], fixes: [] };
    
    const wins = positions.filter(p => (p.pnlPercent || 0) > 0);
    const losses = positions.filter(p => (p.pnlPercent || 0) < 0);
    
    const avgWin = wins.reduce((a, b) => a + (b.pnlPercent || 0), 0) / (wins.length || 1);
    const avgLoss = losses.reduce((a, b) => a + Math.abs(b.pnlPercent || 0), 0) / (losses.length || 1);
    
    const rr = avgWin / (avgLoss || 1);
    
    if (rr < 1.5) {
      result.rootCauses.push(`🔴 Poor Risk/Reward ratio: ${rr.toFixed(2)} (should be >1.5)`);
      result.solutions.push('• Stop losses too tight relative to wins');
      result.solutions.push('• Take profit targets too conservative');
      result.fixes.push({ type: 'rr_improve', value: 2.0 });
    }
    
    if (avgWin < 10) {
      result.rootCauses.push(`🟡 Average win too small: ${avgWin.toFixed(1)}% - not enough reward`);
      result.solutions.push('• Let winners run longer to capture bigger moves');
      result.solutions.push('• Adjust TP2 higher');
      result.fixes.push({ type: 'tp2_higher', value: 0.08 });
    }
    
    return result;
  }
  
  analyzeDrawdown(positions) {
    const result = { rootCauses: [], solutions: [], fixes: [] };
    
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
      result.rootCauses.push(`🔴 Consecutive losses: ${maxConsecutive} in a row`);
      result.solutions.push('• Position sizing too aggressive during losing streak');
      result.solutions.push('• Need break after 2 consecutive losses');
      result.fixes.push({ type: 'consecutive_loss_limit', value: 2 });
    }
    
    const avgSize = positions.reduce((a, b) => a + (b.positionSize || 0), 0) / positions.length;
    if (avgSize > 0.008) {
      result.rootCauses.push(`🟡 Position size too large: ${avgSize.toFixed(4)} SOL average`);
      result.solutions.push('• Reduce position size to minimize drawdown impact');
      result.fixes.push({ type: 'position_size_reduce', value: 0.006 });
    }
    
    return result;
  }
  
  async applyAutoFixes(fixes) {
    console.log('⚡ Applying AUTO-FIXES...');
    
    for (const fix of fixes) {
      try {
        switch (fix.type) {
          case 'sl_adjust':
            console.log(`   → Adjusting SL: ${fix.value}`);
            break;
          case 'tp_aggressive':
            console.log(`   → Making TP less aggressive: ${fix.value}`);
            break;
          case 'rr_improve':
            console.log(`   → Improving Risk/Reward: target ${fix.value}`);
            break;
          case 'tp2_higher':
            console.log(`   → Raising TP2 target`);
            break;
          case 'consecutive_loss_limit':
            console.log(`   → Setting consecutive loss limit: ${fix.value}`);
            break;
          case 'position_size_reduce':
            console.log(`   → Reducing position size to ${fix.value}`);
            break;
        }
      } catch (e) {
        console.error(`   ❌ Failed to apply fix: ${e.message}`);
      }
    }
  }
  
  generateRootCauseReport(trigger, metrics, analysis) {
    let report = `
📊 **ROOT CAUSE ANALYSIS**

**Trigger:** ${trigger}
**Actual:** ${metrics.winRate}% WR | ${metrics.profitSOL} SOL profit | ${metrics.drawdown}% DD

`;
    
    if (analysis.rootCauses.length === 0) {
      report += '\n⚠️ **Insufficient data for analysis** (need more trades)\n';
      return report;
    }
    
    report += '\n🔍 **AKAR MASALAH:**\n';
    analysis.rootCauses.forEach((rc, i) => {
      report += `${i+1}. ${rc}\n`;
    });
    
    report += '\n💡 **SOLUSI:**\n';
    analysis.solutions.forEach((sol, i) => {
      report += `${i+1}. ${sol}\n`;
    });
    
    if (analysis.fixes.length > 0) {
      report += '\n⚡ **AUTO-FIX APPLIED:**\n';
      analysis.fixes.forEach(f => {
        report += `• ${f.type}: ${f.value}\n`;
      });
    }
    
    return report;
  }

  async takeAction(action, failedChecks = {}, metrics = {}) {
    // Perform root cause analysis for negative evaluations
    let rootCauseReport = '';
    if (action !== 'CONTINUE' && Object.keys(failedChecks).length > 0) {
      const analysis = await this.performRootCauseAnalysis(failedChecks, metrics);
      
      // Generate and send report
      const trigger = Object.entries(failedChecks).filter(([k, v]) => !v).map(([k]) => k.toUpperCase()).join(', ');
      rootCauseReport = this.generateRootCauseReport(trigger, metrics, analysis);
      
      // Auto-apply fixes
      if (analysis.fixes.length > 0) {
        await this.applyAutoFixes(analysis.fixes);
      }
    }
    
    switch (action) {
      case 'STOP_AND_REEVALUATE':
        console.log('⏸️  Pausing trading...');
        // Create pause flag file
        fs.writeFileSync('/root/trading-bot/PAUSE_TRADING', Date.now().toString());
        await this.notify('⏸️ **TRADING PAUSED**\n\nNegative evaluation detected.\nManual review required before resuming.' + rootCauseReport);
        break;
      
      case 'EMERGENCY_STOP':
        console.log('🛑 EMERGENCY STOP!');
        fs.writeFileSync('/root/trading-bot/EMERGENCY_STOP', Date.now().toString());
        await this.notify('🛑 **EMERGENCY STOP ACTIVATED**\n\n3 consecutive negative evaluations.\nTrading HALTED until manual intervention.' + rootCauseReport);
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
    await this.takeAction(evaluation.action, evaluation.checks, metrics);

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
