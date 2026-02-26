#!/usr/bin/env node
// BITGET LEARNING ENGINE - Self-improving trading system
// Updated: 2026-02-26

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = '/root/trading-bot/bitget-trade-history.json';
const WEIGHTS_FILE = '/root/trading-bot/bitget-signal-weights.json';
const PATTERNS_FILE = '/root/trading-bot/bitget-patterns.json';

const DEFAULT_WEIGHTS = {
  rsi_neutral: 5,
  macd_crossover: 10,
  macd_bullish: 4,
  above_ema20: 5,
  volume_rising: 3,
  momentum_24h: 1.5,
  momentum_1h: 4,
  volume_base: 2
};

class BitgetLearning {
  constructor() {
    this.history = this.loadHistory();
    this.weights = this.loadWeights();
    this.patterns = this.loadPatterns();
    this.log('Learning engine initialized');
  }

  loadHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
    return [];
  }

  loadWeights() {
    if (fs.existsSync(WEIGHTS_FILE)) {
      return JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
    }
    return { ...DEFAULT_WEIGHTS, lastUpdated: null };
  }

  loadPatterns() {
    if (fs.existsSync(PATTERNS_FILE)) {
      return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
    }
    return { patterns: [], lastAnalyzed: null };
  }

  saveHistory() {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
  }

  saveWeights() {
    this.weights.lastUpdated = new Date().toISOString();
    fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(this.weights, null, 2));
  }

  savePatterns() {
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.patterns, null, 2));
  }

  log(msg) {
    const ts = `[${new Date().toLocaleTimeString('id-ID')}]`;
    console.log(`${ts} 📚 Learning: ${msg}`);
  }

  // Record a completed trade
  recordTrade(trade) {
    this.history.push({
      ...trade,
      recordedAt: new Date().toISOString()
    });
    this.saveHistory();
    this.log(`Recorded trade: ${trade.symbol} ${trade.pnlPct > 0 ? 'WIN' : 'LOSS'} ${trade.pnlPct.toFixed(2)}%`);

    // Update weights if enough trades
    if (this.history.length % 5 === 0) {
      this.updateWeights();
    }

    // Detect patterns if enough trades
    if (this.history.length >= 10) {
      this.detectPatterns();
    }
  }

  // Update signal weights based on trade results
  updateWeights() {
    const recentTrades = this.history.slice(-10);
    const wins = recentTrades.filter(t => t.pnlPct > 0);
    const losses = recentTrades.filter(t => t.pnlPct <= 0);

    if (wins.length === 0 || losses.length === 0) {
      this.log('Not enough data for weight update (need both wins and losses)');
      return;
    }

    // Analyze which signals correlated with wins vs losses
    const winSignals = {};
    const lossSignals = {};

    wins.forEach(t => {
      if (t.signals) {
        Object.entries(t.signals).forEach(([k, v]) => {
          if (v) winSignals[k] = (winSignals[k] || 0) + 1;
        });
      }
    });

    losses.forEach(t => {
      if (t.signals) {
        Object.entries(t.signals).forEach(([k, v]) => {
          if (v) lossSignals[k] = (lossSignals[k] || 0) + 1;
        });
      }
    });

    // Adjust weights
    Object.keys(this.weights).forEach(key => {
      if (key === 'lastUpdated') return;

      const winRate = winSignals[key] ? winSignals[key] / wins.length : 0;
      const lossRate = lossSignals[key] ? lossSignals[key] / losses.length : 0;

      if (winRate > lossRate + 0.1) {
        // Winning signal - increase weight
        this.weights[key] = Math.min(20, this.weights[key] * 1.1);
        this.log(`↑ ${key}: ${this.weights[key].toFixed(2)} (win rate ${(winRate*100).toFixed(0)}%)`);
      } else if (lossRate > winRate + 0.1) {
        // Losing signal - decrease weight
        this.weights[key] = Math.max(0.5, this.weights[key] * 0.9);
        this.log(`↓ ${key}: ${this.weights[key].toFixed(2)} (loss rate ${(lossRate*100).toFixed(0)}%)`);
      }
    });

    this.saveWeights();
  }

  // Detect winning patterns
  detectPatterns() {
    const recentTrades = this.history.slice(-20);
    const wins = recentTrades.filter(t => t.pnlPct > 0);

    if (wins.length < 3) {
      this.log('Not enough wins to detect patterns');
      return;
    }

    const newPatterns = [];

    // Pattern: RSI range
    const rsiWins = wins.filter(t => t.signals && t.signals.rsi >= 40 && t.signals.rsi <= 55);
    if (rsiWins.length >= wins.length * 0.6) {
      newPatterns.push({
        type: 'rsi_range',
        description: 'RSI 40-55 has higher win rate',
        rsiMin: 40,
        rsiMax: 55,
        confidence: (rsiWins.length / wins.length).toFixed(2)
      });
    }

    // Pattern: MACD crossover
    const crossWins = wins.filter(t => t.signals && t.signals.macdCrossover);
    if (crossWins.length >= wins.length * 0.5) {
      newPatterns.push({
        type: 'macd_crossover',
        'MACD crossover signal has higher win rate': true,
        confidence: (crossWins.length / wins.length).toFixed(2)
      });
    }

    if (newPatterns.length > 0) {
      this.patterns.patterns = [...this.patterns.patterns, ...newPatterns];
      this.patterns.lastAnalyzed = new Date().toISOString();
      this.savePatterns();
      this.log(`Detected ${newPatterns.length} new patterns`);
    }
  }

  // Get performance stats
  getStats() {
    const recent = this.history.slice(-20);
    if (recent.length === 0) return null;

    const wins = recent.filter(t => t.pnlPct > 0);
    const losses = recent.filter(t => t.pnlPct <= 0);
    const winRate = (wins.length / recent.length) * 100;
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b.pnlPct, 0) / losses.length : 0;
    const totalPnl = recent.reduce((a, b) => a + b.pnlPct, 0);

    return {
      totalTrades: recent.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1) + '%',
      avgWin: avgWin.toFixed(2) + '%',
      avgLoss: avgLoss.toFixed(2) + '%',
      totalPnl: totalPnl.toFixed(2) + '%'
    };
  }
}

module.exports = BitgetLearning;
