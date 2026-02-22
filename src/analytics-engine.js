/**
 * ANALYTICS ENGINE v1.0
 * Period filtering and trade analytics
 * Inspired by ClawTrol Factory v2 analytics
 */

const fs = require('fs');
const path = require('path');

const TRADING_BOT_DIR = process.env.TRADING_BOT_DIR || '/root/trading-bot';

// ==================== CONFIG ====================
const CONFIG = {
  periods: ['24h', '7d', '30d', 'all'],
  defaultPeriod: '7d'
};

// ==================== UTILITIES ====================
function readJSON(file, fallback = null) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return fallback;
}

function getTimestampXHoursAgo(hours) {
  return Date.now() - (hours * 60 * 60 * 1000);
}

function getTimestampXDaysAgo(days) {
  return Date.now() - (days * 24 * 60 * 60 * 1000);
}

// ==================== PERIOD FILTERING ====================
function filterByPeriod(positions, period) {
  if (period === 'all') return positions;
  
  let cutoff;
  switch (period) {
    case '24h':
      cutoff = getTimestampXHoursAgo(24);
      break;
    case '7d':
      cutoff = getTimestampXDaysAgo(7);
      break;
    case '30d':
      cutoff = getTimestampXDaysAgo(30);
      break;
    default:
      cutoff = getTimestampXDaysAgo(7);
  }
  
  return positions.filter(p => {
    const entryTime = p.entryTime || p.timestamp || 0;
    return entryTime >= cutoff;
  });
}

// ==================== HELPER: Get PnL ====================
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

// ==================== ANALYTICS ====================
function calculateAnalytics(positions, period = 'all') {
  const filtered = filterByPeriod(positions, period);
  
  if (filtered.length === 0) {
    return {
      period,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      byToken: {},
      byStrategy: {}
    };
  }
  
  const wins = filtered.filter(p => getPnL(p) > 0);
  const losses = filtered.filter(p => getPnL(p) <= 0);
  const totalPnL = filtered.reduce((sum, p) => sum + getPnL(p), 0);
  
  // By Token
  const byToken = {};
  filtered.forEach(p => {
    const token = p.symbol || p.token || 'UNKNOWN';
    if (!byToken[token]) {
      byToken[token] = { trades: 0, wins: 0, pnl: 0 };
    }
    byToken[token].trades++;
    if (getPnL(p) > 0) byToken[token].wins++;
    byToken[token].pnl += getPnL(p);
  });
  
  // By Strategy
  const byStrategy = {};
  filtered.forEach(p => {
    const strategy = p.strategy || 'unknown';
    if (!byStrategy[strategy]) {
      byStrategy[strategy] = { trades: 0, wins: 0, pnl: 0 };
    }
    byStrategy[strategy].trades++;
    if (getPnL(p) > 0) byStrategy[strategy].wins++;
    byStrategy[strategy].pnl += getPnL(p);
  });
  
  return {
    period,
    totalTrades: filtered.length,
    wins: wins.length,
    losses: losses.length,
    winRate: ((wins.length / filtered.length) * 100).toFixed(1),
    totalPnL: totalPnL.toFixed(4),
    avgPnL: (totalPnL / filtered.length).toFixed(4),
    avgWin: wins.length > 0 ? (wins.reduce((s, p) => s + getPnL(p), 0) / wins.length).toFixed(4) : 0,
    avgLoss: losses.length > 0 ? (losses.reduce((s, p) => s + getPnL(p), 0) / losses.length).toFixed(4) : 0,
    bestTrade: Math.max(...filtered.map(p => getPnL(p))).toFixed(4),
    worstTrade: Math.min(...filtered.map(p => getPnL(p))).toFixed(4),
    byToken,
    byStrategy
  };
}

// ==================== WIN RATE TRENDS ====================
function calculateWinRateTrends(positions, days = 30) {
  const daily = {};
  const cutoff = getTimestampXDaysAgo(days);
  
  positions.forEach(p => {
    const time = p.entryTime || p.timestamp || 0;
    if (time < cutoff) return;
    
    const date = new Date(time).toISOString().split('T')[0];
    if (!daily[date]) {
      daily[date] = { trades: 0, wins: 0 };
    }
    daily[date].trades++;
    if (getPnL(p) > 0) daily[date].wins++;
  });
  
  return Object.entries(daily)
    .map(([date, data]) => ({
      date,
      trades: data.trades,
      wins: data.wins,
      winRate: ((data.wins / data.trades) * 100).toFixed(1)
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ==================== MODEL USAGE TRACKING ====================
function trackModelUsage(model, taskType) {
  const usageFile = `${TRADING_BOT_DIR}/model-usage.json`;
  const usage = readJSON(usageFile, { models: {}, tasks: {} });
  
  const today = new Date().toISOString().split('T')[0];
  
  if (!usage.models[model]) {
    usage.models[model] = { count: 0, byDate: {} };
  }
  usage.models[model].count++;
  usage.models[model].byDate[today] = (usage.models[model].byDate[today] || 0) + 1;
  
  if (!usage.tasks[taskType]) {
    usage.tasks[taskType] = { count: 0 };
  }
  usage.tasks[taskType].count++;
  
  fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2));
  return usage;
}

function getModelUsage() {
  return readJSON(`${TRADING_BOT_DIR}/model-usage.json`, { models: {}, tasks: {} });
}

// ==================== EXPORT ====================
module.exports = {
  CONFIG,
  filterByPeriod,
  calculateAnalytics,
  calculateWinRateTrends,
  trackModelUsage,
  getModelUsage
};
