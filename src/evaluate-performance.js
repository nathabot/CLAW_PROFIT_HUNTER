#!/usr/bin/env node
/**
 * PERFORMANCE EVALUATION SYSTEM v2.0
 * Run every 4 hours for quick evaluation + auto-fix
 * Process: Analyze (1 min) → Fix → Resume Trading
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
  TRADES_LOG: '/root/trading-bot/live-trades.log',
  ANALYSIS_TIMEOUT_MS: 60000 // 1 minute
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
      const positionSize = p.partialExited && !p.exited ? (p.positionSize || 0.02) * 0.5 : (p.positionSize || 0.02);
      totalProfit += (pnl / 100) * positionSize;
      
      if (totalProfit > peak) peak = totalProfit;
      const drawdown = peak > 0 ? ((peak - totalProfit) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    return {
      totalTrades,
      winRate: winRate.toFixed(2),
      profitSOL: totalProfit.toFixed(4),
      drawdown: maxDrawdown.toFixed(2),
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      positions: closedPositions
    };
  }

  evaluate(metrics) {
    const winRate = parseFloat(metrics.winRate) || 0;
    const profitSOL = parseFloat(metrics.profitSOL) || 0;
    const drawdown = parseFloat(metrics.drawdown) || 0;
    const totalTrades = parseInt(metrics.totalTrades) || 0;
    
    const thresholds = this.config.THRESHOLDS || {
      MIN_WIN_RATE: 55,
      MIN_PROFIT_SOL: 0.05,
      MAX_DRAWDOWN: 20
    };
    
    const checks = {
      winRate: winRate >= thresholds.MIN_WIN_RATE,
      profit: profitSOL >= thresholds.MIN_PROFIT_SOL,
      drawdown: drawdown <= thresholds.MAX_DRAWDOWN
    };

    let verdict = 'NEUTRAL';
    let action = 'CONTINUE';

    if (totalTrades < 10) {
      verdict = 'NEUTRAL';
      action = 'CONTINUE';
    } else if (checks.winRate && checks.profit && checks.drawdown) {
      verdict = 'POSITIVE';
      action = 'CONTINUE';
      this.state.consecutiveNegative = 0;
    } else if (!checks.winRate || profitSOL < 0 || !checks.drawdown) {
      verdict = 'NEGATIVE';
      action = 'ANALYZE_AND_FIX';
      this.state.consecutiveNegative++;
    }

    return { verdict, action, checks };
  }

  // ==================== ROOT CAUSE ANALYSIS ====================
  
  performRootCauseAnalysis(failedChecks, metrics) {
    console.log('🔍 Performing ROOT CAUSE ANALYSIS...');
    
    const positions = metrics.positions || [];
    if (positions.length < 3) {
      return { rootCauses: [], solutions: [], fixes: {} };
    }
    
    const analysis = {
      rootCauses: [],
      solutions: [],
      fixes: {}
    };
    
    // Analyze Win Rate
    if (!failedChecks.winRate) {
      const wrAnalysis = this.analyzeWinRate(positions);
      analysis.rootCauses.push(...wrAnalysis.rootCauses);
      analysis.solutions.push(...wrAnalysis.solutions);
      Object.assign(analysis.fixes, wrAnalysis.fixes);
    }
    
    // Analyze Profit
    if (!failedChecks.profit) {
      const profitAnalysis = this.analyzeProfit(positions);
      analysis.rootCauses.push(...profitAnalysis.rootCauses);
      analysis.solutions.push(...profitAnalysis.solutions);
      Object.assign(analysis.fixes, profitAnalysis.fixes);
    }
    
    // Analyze Drawdown
    if (!failedChecks.drawdown) {
      const ddAnalysis = this.analyzeDrawdown(positions);
      analysis.rootCauses.push(...ddAnalysis.rootCauses);
      analysis.solutions.push(...ddAnalysis.solutions);
      Object.assign(analysis.fixes, ddAnalysis.fixes);
    }
    
    return analysis;
  }
  
  analyzeWinRate(positions) {
    const result = { rootCauses: [], solutions: [], fixes: {} };
    
    const stopLosses = positions.filter(p => p.exitType === 'STOP_LOSS');
    const maxHolds = positions.filter(p => p.exitType === 'MAX_HOLD');
    const slCount = stopLosses.length;
    const mhCount = maxHolds.length;
    const total = positions.length;
    
    if (slCount / total > 0.4) {
      result.rootCauses.push(`🔴 High Stop Loss rate: ${(slCount/total*100).toFixed(0)}% of trades hit SL`);
      result.solutions.push('• Review entry timing - entering too early/against momentum');
      result.solutions.push('• Check if SL is too tight for token volatility');
      result.fixes.sl_adjust = 0.02; // Wider SL
    }
    
    if (mhCount / total > 0.2) {
      result.rootCauses.push(`🟡 Many MAX_HOLD exits: ${(mhCount/total*100).toFixed(0)}% - missing TP targets`);
      result.solutions.push('• TP targets too aggressive - price reverses before hitting');
      result.solutions.push('• Consider taking partial profits earlier');
      result.fixes.tp_aggressive = -0.03; // Less aggressive TP
    }
    
    return result;
  }
  
  analyzeProfit(positions) {
    const result = { rootCauses: [], solutions: [], fixes: {} };
    
    const wins = positions.filter(p => (p.pnlPercent || 0) > 0);
    const losses = positions.filter(p => (p.pnlPercent || 0) < 0);
    
    const avgWin = wins.reduce((a, b) => a + (b.pnlPercent || 0), 0) / (wins.length || 1);
    const avgLoss = losses.reduce((a, b) => a + Math.abs(b.pnlPercent || 0), 0) / (losses.length || 1);
    
    const rr = avgWin / (avgLoss || 1);
    
    if (rr < 1.5) {
      result.rootCauses.push(`🔴 Poor Risk/Reward ratio: ${rr.toFixed(2)} (should be >1.5)`);
      result.solutions.push('• Stop losses too tight relative to wins');
      result.solutions.push('• Take profit targets too conservative');
      result.fixes.rr_improve = true;
    }
    
    if (avgWin < 10) {
      result.rootCauses.push(`🟡 Average win too small: ${avgWin.toFixed(1)}% - not enough reward`);
      result.solutions.push('• Let winners run longer to capture bigger moves');
      result.fixes.tp2_higher = 0.08;
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
      result.rootCauses.push(`🔴 Consecutive losses: ${maxConsecutive} in a row`);
      result.solutions.push('• Position sizing too aggressive during losing streak');
      result.solutions.push('• Need break after 2 consecutive losses');
      result.fixes.consecutive_loss_limit = 2;
    }
    
    return result;
  }
  
  applyAutoFixes(fixes) {
    console.log('⚡ Applying AUTO-FIXES to trading-config.json...');
    
    let config = this.config;
    let fixSummary = [];
    
    if (fixes.sl_adjust) {
      if (config.STOP_LOSS) {
        config.STOP_LOSS.percent = Math.min(config.STOP_LOSS.percent + 0.02, 0.25);
        fixSummary.push(`SL: ${(config.STOP_LOSS.percent*100).toFixed(0)}%`);
      }
    }
    
    if (fixes.tp_aggressive) {
      if (config.TAKE_PROFIT) {
        config.TAKE_PROFIT.tp1_percent = Math.max(config.TAKE_PROFIT.tp1_percent - 0.03, 0.03);
        config.TAKE_PROFIT.tp2_percent = Math.max(config.TAKE_PROFIT.tp2_percent - 0.03, 0.05);
        fixSummary.push(`TP adjusted`);
      }
    }
    
    if (fixes.tp2_higher) {
      if (config.TAKE_PROFIT) {
        config.TAKE_PROFIT.tp2_percent = Math.max(config.TAKE_PROFIT.tp2_percent + 0.03, 0.08);
        fixSummary.push(`TP2: ${(config.TAKE_PROFIT.tp2_percent*100).toFixed(0)}%`);
      }
    }
    
    if (fixes.consecutive_loss_limit) {
      if (!config.RISK_MANAGEMENT) config.RISK_MANAGEMENT = {};
      config.RISK_MANAGEMENT.max_consecutive_losses = fixes.consecutive_loss_limit;
      fixSummary.push(`Max consecutive: ${fixes.consecutive_loss_limit}`);
    }
    
    this.saveConfig(config);
    console.log('   ✅ Config updated:', fixSummary.join(', '));
    
    return fixSummary;
  }
  
  resumeTrading() {
    // Remove EMERGENCY_STOP and PAUSE_TRADING files
    const files = ['/root/trading-bot/EMERGENCY_STOP', '/root/trading-bot/PAUSE_TRADING'];
    for (const f of files) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
          console.log(`   ✅ Removed ${f}`);
        }
      } catch (e) {}
    }
    
    // Enable trading in state
    this.state.tradingEnabled = true;
    this.saveState();
  }

  async takeAction(action, failedChecks = {}, metrics = {}) {
    let rootCauseReport = '';
    let fixSummary = [];
    
    if (action === 'ANALYZE_AND_FIX') {
      const analysis = this.performRootCauseAnalysis(failedChecks, metrics);
      
      // Generate report
      const trigger = Object.entries(failedChecks).filter(([k, v]) => !v).map(([k]) => k.toUpperCase()).join(', ');
      rootCauseReport = `
🔍 **Performing ROOT CAUSE ANALYSIS...**
📊 **ROOT CAUSE ANALYSIS**

**Trigger:** ${trigger}
**Actual:** ${metrics.winRate}% WR | ${metrics.profitSOL} SOL profit | ${metrics.drawdown}% DD

`;
      
      if (analysis.rootCauses.length === 0) {
        rootCauseReport += '\n⚠️ **Insufficient data for analysis** (need more trades)\n';
      } else {
        rootCauseReport += '\n🔍 **AKAR MASALAH:**\n';
        analysis.rootCauses.forEach((rc, i) => {
          rootCauseReport += `${i+1}. ${rc}\n`;
        });
        
        rootCauseReport += '\n💡 **SOLUSI:**\n';
        analysis.solutions.forEach((sol, i) => {
          rootCauseReport += `${i+1}. ${sol}\n`;
        });
        
        // Apply fixes
        if (Object.keys(analysis.fixes).length > 0) {
          fixSummary = this.applyAutoFixes(analysis.fixes);
          rootCauseReport += '\n⚡ **AUTO-FIX APPLIED:**\n';
          fixSummary.forEach(f => {
            rootCauseReport += `• ${f}\n`;
          });
        }
      }
      
      // Resume trading after analysis
      this.resumeTrading();
      rootCauseReport += '\n✅ **Trading resumed after analysis & fixes**';
      
      await this.notify('🔍 **EVALUATION: NEGATIVE → ANALYZING & FIXING...**\n' + rootCauseReport);
      
    } else if (action === 'CONTINUE') {
      console.log('✅ Trading continues...');
      this.resumeTrading();
      
      await this.notify(`✅ **EVALUATION: POSITIVE**\n\nWin Rate: ${metrics.winRate}% | Profit: ${metrics.profitSOL} SOL\n\n🟢 Trading continues normally\n⏰ Next eval: 4 hours`);
    }
  }

  async run() {
    console.log('🔍 Starting Performance Evaluation v2.0...\n');
    console.log(`⏱️ Analysis timeout: ${CONFIG.ANALYSIS_TIMEOUT_MS/1000} seconds\n`);

    // Calculate metrics
    const metrics = this.calculateMetrics();
    console.log('📊 Metrics:');
    console.log(`  Win Rate: ${metrics.winRate}%`);
    console.log(`  Profit: ${metrics.profitSOL} SOL`);
    console.log(`  Drawdown: ${metrics.drawdown}%`);
    console.log(`  Total Trades: ${metrics.totalTrades}\n`);

    // Evaluate
    const evaluation = this.evaluate(metrics);
    console.log(`📋 Verdict: ${evaluation.verdict}`);
    console.log(`🎯 Action: ${evaluation.action}\n`);

    // Take action (with analysis if negative)
    await this.takeAction(evaluation.action, evaluation.checks, metrics);

    // Update state
    this.state.lastEvaluation = new Date().toISOString();
    this.state.totalEvaluations++;
    this.saveState();

    console.log('✅ Evaluation complete!\n');
  }
}

// Run evaluation
const evaluator = new PerformanceEvaluator();
evaluator.run().catch(console.error);
