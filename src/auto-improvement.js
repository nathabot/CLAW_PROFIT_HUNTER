/**
 * AUTO-IMPROVEMENT ENGINE v1.0
 * Weekly strategy review and parameter suggestions
 * Inspired by ClawTrol Factory v2
 */

const fs = require('fs');
const path = require('path');

const TRADING_BOT_DIR = process.env.TRADING_BOT_DIR || '/root/trading-bot';

// ==================== CONFIG ====================
const CONFIG = {
  reviewInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
  minTradesForReview: 10,
  confidenceThresholds: {
    HIGH: 70,
    MEDIUM: 50,
    LOW: 30
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

// Helper: Get PnL from position
function getPnL(position) {
  // Check pnlSOL first (in SOL)
  if (position.pnlSOL && position.pnlSOL > 0) return position.pnlSOL;
  // Check pnl (in SOL)  
  if (position.pnl && position.pnl > 0) return position.pnl;
  // Check pnlPercent - convert to SOL approximation
  if (position.pnlPercent && position.pnlPercent > 0) {
    const positionSize = position.positionSize || 0.01;
    return (position.pnlPercent / 100) * positionSize;
  }
  // Check partialExitPnl (in SOL)
  if (position.partialExitPnl && position.partialExitPnl > 0) {
    return position.partialExitPnl;
  }
  return 0;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ==================== PERFORMANCE ANALYSIS ====================
function analyzeStrategyPerformance(positions) {
  if (positions.length < CONFIG.minTradesForReview) {
    return { status: 'insufficient_data', trades: positions.length };
  }
  
  const wins = positions.filter(p => getPnL(p) > 0);
  const losses = positions.filter(p => getPnL(p) <= 0);
  const winRate = (wins.length / positions.length) * 100;
  
  // Calculate expectancy
  const avgWin = wins.length > 0 
    ? wins.reduce((s, p) => s + getPnL(p), 0) / wins.length 
    : 0;
  const avgLoss = losses.length > 0 
    ? Math.abs(losses.reduce((s, p) => s + getPnL(p), 0) / losses.length)
    : 0;
  
  const expectancy = (winRate / 100 * avgWin) - ((1 - winRate) / 100 * avgLoss);
  
  // Token performance
  const tokenPerf = {};
  positions.forEach(p => {
    const token = p.symbol || p.token || 'UNKNOWN';
    if (!tokenPerf[token]) {
      tokenPerf[token] = { trades: 0, wins: 0, pnl: 0 };
    }
    tokenPerf[token].trades++;
    if (getPnL(p) > 0) tokenPerf[token].wins++;
    tokenPerf[token].pnl += getPnL(p);
  });
  
  // Top performers
  const topTokens = Object.entries(tokenPerf)
    .map(([token, data]) => ({
      token,
      trades: data.trades,
      winRate: ((data.wins / data.trades) * 100).toFixed(1),
      pnl: data.pnl.toFixed(4)
    }))
    .sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));
  
  // Confidence level
  let confidence = 'LOW';
  if (positions.length >= 50 && winRate >= CONFIG.confidenceThresholds.HIGH) {
    confidence = 'HIGH';
  } else if (positions.length >= 20 && winRate >= CONFIG.confidenceThresholds.MEDIUM) {
    confidence = 'MEDIUM';
  }
  
  return {
    status: 'analyzed',
    trades: positions.length,
    winRate: winRate.toFixed(1),
    expectancy: expectancy.toFixed(4),
    avgWin: avgWin.toFixed(4),
    avgLoss: avgLoss.toFixed(4),
    topTokens: topTokens.slice(0, 5),
    bottomTokens: topTokens.slice(-3).reverse(),
    confidence,
    recommendation: getRecommendation(winRate, expectancy, confidence)
  };
}

function getRecommendation(winRate, expectancy, confidence) {
  if (confidence === 'LOW') {
    return 'Need more trade data before recommendations';
  }
  
  if (winRate >= 55 && expectancy > 0) {
    return 'Strategy performing well. Consider increasing position size on high-WR tokens.';
  }
  
  if (winRate < 40) {
    return 'Strategy underperforming. Review entry criteria and consider tighter stop-loss.';
  }
  
  if (expectancy <= 0) {
    return 'Negative expectancy. Review risk/reward ratio and TP/SL parameters.';
  }
  
  return 'Strategy performing within normal parameters. Continue monitoring.';
}

// ==================== PARAMETER SUGGESTIONS ====================
function suggestParameterTweaks(performance, currentParams) {
  const suggestions = [];
  
  if (performance.status !== 'analyzed') {
    return [{ type: 'info', message: 'Insufficient data for parameter suggestions' }];
  }
  
  const wr = parseFloat(performance.winRate);
  const exp = parseFloat(performance.expectancy);
  
  // Win rate based suggestions
  if (wr < 40) {
    suggestions.push({
      type: 'warning',
      area: 'entry',
      message: `Win rate ${wr}% is low. Consider tightening entry criteria (higher min score).`,
      action: 'Increase MIN_SIGNAL_SCORE by 1-2 points'
    });
  } else if (wr > 60) {
    suggestions.push({
      type: 'success',
      area: 'position',
      message: `Win rate ${wr}% is excellent. Consider increasing position size.`,
      action: 'Increase DEFAULT_POSITION by 0.002-0.005 SOL'
    });
  }
  
  // Expectancy based suggestions
  if (exp < 0) {
    suggestions.push({
      type: 'danger',
      area: 'risk',
      message: `Negative expectancy (${exp}). Risk/reward ratio needs adjustment.`,
      action: 'Tighten TP targets or widen SL'
    });
  }
  
  // TP/SL suggestions
  if (currentParams) {
    const tp1 = parseFloat(currentParams.TP1 || 0);
    if (tp1 > 15) {
      suggestions.push({
        type: 'warning',
        area: 'tp',
        message: `TP1 ${tp1}% may be too aggressive for current market.`,
        action: 'Consider lowering to +5-8%'
      });
    }
  }
  
  // Token-specific suggestions
  if (performance.topTokens && performance.topTokens.length > 0) {
    const topToken = performance.topTokens[0];
    suggestions.push({
      type: 'success',
      area: 'focus',
      message: `Top performer: ${topToken.token} (${topToken.winRate}% WR, +${topToken.pnl} PnL)`,
      action: `Consider prioritizing ${topToken.token} in proven tokens`
    });
  }
  
  return suggestions;
}

// ==================== AUTO REVIEW ====================
function runAutoReview(period = '7d') {
  const positions = readJSON(`${TRADING_BOT_DIR}/positions.json`, []);
  const config = readJSON(`${TRADING_BOT_DIR}/trading-config.json`, {});
  
  // Filter positions by period
  let filteredPositions = positions;
  const now = Date.now();
  
  if (period === '24h') {
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    filteredPositions = positions.filter(p => p.entryTime && p.entryTime >= oneDayAgo);
  } else if (period === '7d') {
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    filteredPositions = positions.filter(p => p.entryTime && p.entryTime >= sevenDaysAgo);
  } else if (period === '30d') {
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    filteredPositions = positions.filter(p => p.entryTime && p.entryTime >= thirtyDaysAgo);
  }
  
  const performance = analyzeStrategyPerformance(filteredPositions);
  const suggestions = suggestParameterTweaks(performance, config.TP_SETTINGS);
  
  const review = {
    timestamp: Date.now(),
    period,
    performance,
    suggestions,
    configSnapshot: config
  };
  
  // Save review
  const reviewFile = `${TRADING_BOT_DIR}/auto-review-latest.json`;
  writeJSON(reviewFile, review);
  
  // Save history
  const historyFile = `${TRADING_BOT_DIR}/auto-review-history.json`;
  const history = readJSON(historyFile, []);
  history.push(review);
  // Keep last 10 reviews
  if (history.length > 10) {
    history.shift();
  }
  writeJSON(historyFile, history);
  
  return review;
}

function getLatestReview() {
  return readJSON(`${TRADING_BOT_DIR}/auto-review-latest.json`, null);
}

function getReviewHistory() {
  return readJSON(`${TRADING_BOT_DIR}/auto-review-history.json`, []);
}

// ==================== EXPORT ====================
module.exports = {
  CONFIG,
  analyzeStrategyPerformance,
  suggestParameterTweaks,
  runAutoReview,
  getLatestReview,
  getReviewHistory
};
