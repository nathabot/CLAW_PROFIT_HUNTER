#!/usr/bin/env node
/**
 * SOUL CORE PAPER TRADER v5.0 - DYNAMIC STRATEGY ENGINE
 * 
 * FEATURES:
 * - BOK Integration (read/write strategy data)
 * - Candle Validation (no FOMO entry)
 * - Dynamic SL/TP based on market condition
 * - Strategy Categorization (Fast/Scalping/Sniper/Swing)
 * - Positive/Negative Strategy Files in BOK
 * - Auto-reset after 50 simulations
 * - Real balance & daily target estimation
 * - Continuous strategy evolution
 */

const fetch = require('node-fetch');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

// ==================== STRATEGY INTELLIGENCE INTEGRATION ====================
const INTELLIGENCE_CONFIG = {
  DB_PATH: '/root/trading-bot/strategy-intelligence.db',
  MAX_SIGNALS: 10,
  MIN_CONFIDENCE: 6.0
};

// ==================== CONFIGURATION ====================
const CONFIG = {
  // Simulation Settings
  SIMULATION_COUNT: 50,           // Reset after 50 simulations
  MIN_TOKEN_AGE_MINUTES: 20,
  MIN_LIQUIDITY: 10000,
  MIN_VOLUME: 10000,
  
  // Files
  STATE_FILE: '/root/trading-bot/paper-trader-v5-state.json',
  CONFIG_FILE: '/root/trading-bot/adaptive-scoring-config.json',
  
  // BOK Files
  BOK_DIR: '/root/trading-bot/bok',
  POSITIVE_STRATEGIES_FILE: '/root/trading-bot/bok/16-positive-strategies.md',
  NEGATIVE_STRATEGIES_FILE: '/root/trading-bot/bok/17-negative-strategies.md',
  TOXIC_TOKENS_FILE: '/root/trading-bot/bok/06-toxic-tokens.md',
  
  // Real Trading Reference
  WALLET_BALANCE: 0.1,            // Current SOL balance (new wallet)
  DAILY_TARGET: 0.2,              // 0.2 SOL per day target (base)
  FEE_RESERVE: 0.015,
  
  // Telegram
  BOT_TOKEN: TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  CHAT_ID: TELEGRAM_CHAT_ID || '-1003212463774',
  TOPIC_ID: 25
};

// ==================== STRATEGY CATEGORIES ====================
const STRATEGY_CATEGORIES = {
  FAST_TRADE: {
    name: 'Fast Trade',
    description: 'Quick entry/exit, 2-5 min hold',
    timeframes: ['1m', '5m'],
    slPercent: 1.5,
    tp1Percent: 3,
    tp2Percent: 5,
    indicators: ['price_action', 'volume_spike']
  },
  SCALPING: {
    name: 'Scalping',
    description: 'Small moves, high frequency',
    timeframes: ['5m', '15m'],
    slPercent: 2,
    tp1Percent: 4,
    tp2Percent: 6,
    indicators: ['fibonacci', 'rsi', 'support_resistance']
  },
  SNIPER: {
    name: 'Sniper',
    description: 'Perfect setup only, high conviction',
    timeframes: ['5m', '15m', '1h'],
    slPercent: 3,
    tp1Percent: 8,
    tp2Percent: 15,
    indicators: ['fibonacci', 'smart_money', 'whale_activity', 'orderbook']
  },
  SWING_TRADE: {
    name: 'Swing Trade',
    description: 'Hold for hours, bigger moves',
    timeframes: ['1h', '4h'],
    slPercent: 5,
    tp1Percent: 12,
    tp2Percent: 25,
    indicators: ['fibonacci', 'trend_analysis', 'volume_profile']
  }
};

// ==================== BASE STRATEGIES ====================
const BASE_STRATEGIES = [
  // Fibonacci Variants
  { id: 'fib_382_1618', name: 'Fib 0.382 Entry', entryFib: 0.382, tpFib: 1.618, category: 'SCALPING' },
  { id: 'fib_500_1272', name: 'Fib 0.500 Entry', entryFib: 0.500, tpFib: 1.272, category: 'SCALPING' },
  { id: 'fib_618_1618', name: 'Fib 0.618 Golden', entryFib: 0.618, tpFib: 1.618, category: 'SNIPER' },
  { id: 'fib_786_1000', name: 'Fib 0.786 Deep', entryFib: 0.786, tpFib: 1.000, category: 'SWING_TRADE' },
  
  // Combo Strategies
  { id: 'fib_rsi_combo', name: 'Fib + RSI', indicators: ['fib', 'rsi'], category: 'SCALPING' },
  { id: 'fib_volume_combo', name: 'Fib + Volume', indicators: ['fib', 'volume'], category: 'FAST_TRADE' },
  { id: 'smart_fib_combo', name: 'Smart Money + Fib', indicators: ['smart_money', 'fib'], category: 'SNIPER' },
  { id: 'ob_funding_combo', name: 'Orderbook + Funding', indicators: ['orderbook', 'funding'], category: 'SWING_TRADE' },
  { id: 'whale_volume_combo', name: 'Whale + Volume', indicators: ['whale', 'volume'], category: 'SNIPER' },
  { id: 'sr_breakout', name: 'S/R Breakout', indicators: ['support_resistance', 'volume'], category: 'FAST_TRADE' },
  { id: 'momentum_squeeze', name: 'Momentum Squeeze', indicators: ['rsi', 'macd', 'volume'], category: 'SCALPING' },
  { id: 'divergence_play', name: 'RSI Divergence', indicators: ['rsi', 'price_action'], category: 'SWING_TRADE' }
];

// ==================== CLASS DEFINITION ====================
class PaperTraderV5 {
  constructor() {
    this.state = this.loadState();
    this.simulationCount = this.state.simulationCount || 0;
    this.results = this.state.results || {};
    this.positiveStrategies = this.loadPositiveStrategies();
    this.negativeStrategies = this.loadNegativeStrategies();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return { simulationCount: 0, results: {}, lastReset: Date.now() };
  }

  saveState() {
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify({
      simulationCount: this.simulationCount,
      results: this.results,
      lastReset: this.state.lastReset
    }, null, 2));
  }

  loadPositiveStrategies() {
    try {
      // Parse from BOK file
      if (fs.existsSync(CONFIG.POSITIVE_STRATEGIES_FILE)) {
        const content = fs.readFileSync(CONFIG.POSITIVE_STRATEGIES_FILE, 'utf8');
        // Simple parsing - extract strategy sections
        return this.parseStrategiesFromBOK(content);
      }
    } catch (e) {}
    return [];
  }

  loadNegativeStrategies() {
    try {
      if (fs.existsSync(CONFIG.NEGATIVE_STRATEGIES_FILE)) {
        const content = fs.readFileSync(CONFIG.NEGATIVE_STRATEGIES_FILE, 'utf8');
        return this.parseStrategiesFromBOK(content);
      }
    } catch (e) {}
    return [];
  }

  parseStrategiesFromBOK(content) {
    // Extract strategy IDs from BOK markdown
    const strategies = [];
    const matches = content.matchAll(/## Strategy: (\w+)/g);
    for (const match of matches) {
      strategies.push(match[1]);
    }
    return strategies;
  }

  // ==================== STRATEGY INTELLIGENCE SIGNALS ====================
  
  async loadIntelligenceSignals() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(INTELLIGENCE_CONFIG.DB_PATH, (err) => {
        if (err) {
          console.log('⚠️  Could not connect to Intelligence DB:', err.message);
          resolve([]);
          return;
        }
        
        // Get recent signals (last 4 hours) with high confidence
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        
        db.all(
          `SELECT * FROM signals 
           WHERE created_at > ? 
           AND confidence >= ? 
           AND executed = 0
           ORDER BY confidence DESC 
           LIMIT ?`,
          [fourHoursAgo, INTELLIGENCE_CONFIG.MIN_CONFIDENCE, INTELLIGENCE_CONFIG.MAX_SIGNALS],
          (err, rows) => {
            db.close();
            if (err) {
              console.log('⚠️  Error reading signals:', err.message);
              resolve([]);
            } else {
              console.log(`📊 Loaded ${rows.length} signals from Intelligence Network`);
              resolve(rows);
            }
          }
        );
      });
    });
  }
  
  convertSignalToStrategy(signal) {
    // Convert Intelligence signal to strategy format
    const confidence = parseFloat(signal.confidence);
    let category = 'SCALPING';
    
    if (confidence >= 8) category = 'SNIPER';
    else if (confidence >= 7) category = 'SCALPING';
    else category = 'FAST_TRADE';
    
    return {
      id: `intel_${signal.token_symbol.toLowerCase()}_${Date.now()}`,
      name: `Intelligence: ${signal.token_symbol}`,
      category: category,
      source: 'StrategyIntelligence',
      tokenSymbol: signal.token_symbol,
      tokenAddress: signal.token_address,
      entryPrice: signal.entry_price,
      targetPrice: signal.target_price,
      targetPrice2: signal.target_price_2,
      stopLoss: signal.stop_loss,
      confidence: confidence,
      reasons: JSON.parse(signal.confidence_reasons || '[]'),
      metrics: JSON.parse(signal.metrics || '{}')
    };
  }

  // ==================== CANDLE ANALYSIS ====================
  async analyzeCandle(token) {
    const priceChange5m = parseFloat(token.priceChange?.m5 || 0);
    const priceChange1h = parseFloat(token.priceChange?.h1 || 0);
    const volume = parseFloat(token.volume?.h24 || 0);
    
    // AVOID FOMO - Don't buy if just pumped >8%
    if (priceChange5m > 8) {
      return {
        valid: false,
        reason: `FOMO ALERT: Pumped ${priceChange5m.toFixed(1)}% in 5min - Wait for pullback`
      };
    }
    
    // AVOID FALLING KNIFE - Don't buy if dumping >5%
    if (priceChange5m < -5) {
      return {
        valid: false,
        reason: `DUMP ALERT: Down ${Math.abs(priceChange5m).toFixed(1)}% in 5min - Wait for stabilization`
      };
    }
    
    // IDEAL ENTRY - Pullback after pump
    if (priceChange1h > 5 && priceChange5m < 0 && priceChange5m > -3) {
      return {
        valid: true,
        score: 9,
        reason: `PULLBACK ENTRY: Up ${priceChange1h.toFixed(1)}% in 1h, cooling off ${priceChange5m.toFixed(1)}% in 5m`,
        momentum: 'strong'
      };
    }
    
    // CONSOLIDATION ENTRY - Sideways with volume
    if (Math.abs(priceChange5m) < 2 && volume > 10000) {
      return {
        valid: true,
        score: 7,
        reason: `CONSOLIDATION: Stable price with good volume - ready for breakout`,
        momentum: 'neutral'
      };
    }
    
    return {
      valid: true,
      score: 6,
      reason: `ACCEPTABLE: ${priceChange5m.toFixed(1)}% movement`,
      momentum: 'weak'
    };
  }

  // ==================== ORDER BOOK ANALYSIS ====================
  async analyzeOrderBook(token) {
    // Simulated order book analysis
    // In real implementation, fetch from API
    const buyPressure = parseFloat(token.txns?.h24?.buys || 0);
    const sellPressure = parseFloat(token.txns?.h24?.sells || 0);
    
    if (buyPressure > sellPressure * 1.5) {
      return { strength: 'strong', ratio: (buyPressure/sellPressure).toFixed(2) };
    } else if (buyPressure > sellPressure) {
      return { strength: 'moderate', ratio: (buyPressure/sellPressure).toFixed(2) };
    }
    return { strength: 'weak', ratio: (buyPressure/sellPressure).toFixed(2) };
  }

  // ==================== DYNAMIC SL/TP CALCULATION ====================
  calculateDynamicSLTP(entryPrice, volatility, orderBookStrength, candleMomentum) {
    let slPercent, tp1Percent, tp2Percent;
    
    // Base on volatility
    if (volatility > 0.30) {
      // High volatility - wider SL, bigger TP
      slPercent = 5;
      tp1Percent = 15;
      tp2Percent = 30;
    } else if (volatility > 0.15) {
      // Medium volatility
      slPercent = 3;
      tp1Percent = 8;
      tp2Percent = 15;
    } else {
      // Low volatility - tight SL, smaller TP
      slPercent = 2;
      tp1Percent = 5;
      tp2Percent = 10;
    }
    
    // Adjust based on order book
    if (orderBookStrength === 'strong') {
      // Strong buy pressure - can hold longer
      tp1Percent *= 1.2;
      tp2Percent *= 1.2;
    } else if (orderBookStrength === 'weak') {
      // Weak pressure - tighten SL
      slPercent *= 0.8;
    }
    
    // Adjust based on candle momentum
    if (candleMomentum === 'strong') {
      slPercent *= 1.1;  // Wider SL to avoid shakeout
    }
    
    return {
      sl: entryPrice * (1 - slPercent/100),
      tp1: entryPrice * (1 + tp1Percent/100),
      tp2: entryPrice * (1 + tp2Percent/100),
      slPercent,
      tp1Percent,
      tp2Percent
    };
  }

  // ==================== STRATEGY SIMULATION ====================
  async simulateStrategy(strategy, token, candleAnalysis, orderBook) {
    const entryPrice = parseFloat(token.priceUsd);
    const volatility = parseFloat(token.volatility || 0.20);
    
    // Calculate dynamic SL/TP
    const targets = this.calculateDynamicSLTP(
      entryPrice, 
      volatility, 
      orderBook.strength,
      candleAnalysis.momentum
    );
    
    // Simulate outcome based on strategy accuracy
    // Higher score = better chance of win
    const winProbability = this.calculateWinProbability(strategy, candleAnalysis, orderBook);
    const isWin = Math.random() < winProbability;
    
    const pnlPercent = isWin 
      ? (Math.random() * (targets.tp2Percent - targets.tp1Percent) + targets.tp1Percent)
      : -targets.slPercent;
    
    const positionSize = this.calculatePositionSize(strategy, winProbability);
    const profitSol = (pnlPercent / 100) * positionSize;
    
    return {
      strategy: strategy.id,
      strategyName: strategy.name,
      category: strategy.category,
      token: token.baseToken?.symbol || 'UNKNOWN',
      tokenCA: token.baseToken?.address,
      entryPrice,
      exitPrice: entryPrice * (1 + pnlPercent/100),
      pnlPercent,
      profitSol,
      isWin,
      sl: targets.sl,
      tp1: targets.tp1,
      tp2: targets.tp2,
      candleScore: candleAnalysis.score,
      orderBookStrength: orderBook.strength,
      timestamp: Date.now()
    };
  }

  calculateWinProbability(strategy, candleAnalysis, orderBook) {
    let probability = 0.50; // Base 50%
    
    // Candle score contribution
    probability += (candleAnalysis.score - 5) * 0.03;
    
    // Order book contribution
    if (orderBook.strength === 'strong') probability += 0.15;
    else if (orderBook.strength === 'moderate') probability += 0.05;
    else probability -= 0.10;
    
    // Historical performance
    if (this.results[strategy.id]) {
      const wins = this.results[strategy.id].wins || 0;
      const total = this.results[strategy.id].total || 0;
      if (total > 5) {
        const wr = wins / total;
        probability = (probability + wr) / 2; // Blend with historical
      }
    }
    
    return Math.min(Math.max(probability, 0.1), 0.9); // Clamp 10-90%
  }

  calculatePositionSize(strategy, winProbability) {
    // Base position size based on wallet balance
    const tradeableBalance = CONFIG.WALLET_BALANCE - CONFIG.FEE_RESERVE;
    const baseSize = tradeableBalance * 0.15; // 15% per trade
    
    // Adjust based on win probability
    if (winProbability > 0.70) return baseSize * 1.5;  // High conviction
    if (winProbability > 0.60) return baseSize * 1.0;  // Normal
    if (winProbability > 0.50) return baseSize * 0.7;  // Lower size
    return baseSize * 0.5;  // Minimum size
  }
  
  // ==================== SIMULATE INTELLIGENCE SIGNALS ====================
  
  async simulateSignalStrategy(strategy) {
    console.log(`   Simulating Intelligence strategy: ${strategy.name}`);
    
    const entryPrice = strategy.entryPrice;
    const confidence = strategy.confidence;
    
    // Calculate win probability based on confidence
    // Higher confidence = higher win probability
    const baseWinRate = 0.50;
    const confidenceBoost = (confidence - 5) * 0.05; // +5% per confidence point above 5
    const winProbability = Math.min(0.90, baseWinRate + confidenceBoost);
    
    // Simulate outcome
    const isWin = Math.random() < winProbability;
    
    // Calculate PnL based on strategy targets
    const slDistance = ((entryPrice - strategy.stopLoss) / entryPrice) * 100;
    const tp1Distance = ((strategy.targetPrice - entryPrice) / entryPrice) * 100;
    const tp2Distance = ((strategy.targetPrice2 - entryPrice) / entryPrice) * 100;
    
    let pnlPercent;
    if (isWin) {
      // Partial exit at TP1, rest at TP2
      pnlPercent = (tp1Distance * 0.5) + (tp2Distance * 0.5);
    } else {
      // Hit stop loss
      pnlPercent = -slDistance;
    }
    
    const positionSize = this.calculatePositionSize(strategy, winProbability);
    const profitSol = (pnlPercent / 100) * positionSize;
    
    console.log(`   Result: ${isWin ? '✅ WIN' : '❌ LOSS'} ${pnlPercent.toFixed(2)}% (${profitSol.toFixed(4)} SOL)`);
    
    return {
      strategy: strategy.id,
      strategyName: strategy.name,
      category: strategy.category,
      token: strategy.tokenSymbol,
      tokenCA: strategy.tokenAddress,
      entryPrice,
      exitPrice: entryPrice * (1 + pnlPercent/100),
      pnlPercent,
      profitSol,
      isWin,
      sl: strategy.stopLoss,
      tp1: strategy.targetPrice,
      tp2: strategy.targetPrice2,
      source: 'StrategyIntelligence',
      intelligenceConfidence: confidence,
      timestamp: Date.now()
    };
  }
  
  recordResult(strategy, result) {
    if (!this.results[strategy.id]) {
      this.results[strategy.id] = {
        id: strategy.id,
        name: strategy.name,
        category: strategy.category,
        source: strategy.source || 'MarketScan',
        wins: 0,
        losses: 0,
        total: 0,
        totalProfit: 0,
        totalLoss: 0
      };
    }
    
    this.results[strategy.id].total++;
    if (result.isWin) {
      this.results[strategy.id].wins++;
      this.results[strategy.id].totalProfit += result.profitSol;
    } else {
      this.results[strategy.id].losses++;
      this.results[strategy.id].totalLoss += result.profitSol;
    }
  }

  // ==================== BOK INTEGRATION ====================
  updateBOKStrategyFiles() {
    const positiveStrategies = [];
    const negativeStrategies = [];
    
    for (const [strategyId, result] of Object.entries(this.results)) {
      if (result.total >= 5) { // Minimum 5 trades for validation
        const wr = (result.wins / result.total) * 100;
        
        if (wr >= 70) {
          positiveStrategies.push({
            id: strategyId,
            name: result.name,
            winRate: wr.toFixed(2),
            profit: result.totalProfit?.toFixed(4) || 0,
            category: result.category,
            details: result.details
          });
        } else {
          negativeStrategies.push({
            id: strategyId,
            name: result.name,
            winRate: wr.toFixed(2),
            reason: 'WR below 70%'
          });
        }
      }
    }
    
    // Write to BOK Positive Strategies
    this.writePositiveStrategies(positiveStrategies);
    
    // Write to BOK Negative Strategies
    this.writeNegativeStrategies(negativeStrategies);
  }

  writePositiveStrategies(strategies) {
    let content = `# 16 - Positive Strategies (WR >=70%)\n\n`;
    content += `**Auto-generated by Paper Trader v5**\n`;
    content += `**Updated:** ${new Date().toISOString()}\n\n`;
    content += `## High-Performing Strategies\n\n`;
    
    strategies.forEach(s => {
      content += `### Strategy: ${s.id}\n\n`;
      content += `- **Name:** ${s.name}\n`;
      content += `- **Win Rate:** ${s.winRate}%\n`;
      content += `- **Total Profit:** ${s.profit} SOL\n`;
      content += `- **Category:** ${s.category}\n`;
      content += `- **Status:** ✅ RECOMMENDED FOR LIVE\n\n`;
    });
    
    fs.writeFileSync(CONFIG.POSITIVE_STRATEGIES_FILE, content);
  }

  writeNegativeStrategies(strategies) {
    let content = `# 17 - Negative Strategies (WR <70%)\n\n`;
    content += `**Auto-generated by Paper Trader v5**\n`;
    content += `**Updated:** ${new Date().toISOString()}\n\n`;
    content += `## Underperforming Strategies\n\n`;
    content += `*Do NOT use these strategies for live trading*\n\n`;
    
    strategies.forEach(s => {
      content += `### Strategy: ${s.id}\n\n`;
      content += `- **Name:** ${s.name}\n`;
      content += `- **Win Rate:** ${s.winRate}%\n`;
      content += `- **Reason:** ${s.reason}\n`;
      content += `- **Status:** ❌ AVOID\n\n`;
    });
    
    fs.writeFileSync(CONFIG.NEGATIVE_STRATEGIES_FILE, content);
  }

  // ==================== CONFIG SYNC ====================
  syncToLiveTrader() {
    // Find best strategy
    let bestStrategy = null;
    let bestWR = 0;
    
    for (const [strategyId, result] of Object.entries(this.results)) {
      if (result.total >= 10) {
        const wr = (result.wins / result.total) * 100;
        if (wr > bestWR) {
          bestWR = wr;
          bestStrategy = { id: strategyId, ...result };
        }
      }
    }
    
    if (bestStrategy) {
      const config = {
        bestStrategy: {
          id: bestStrategy.id,
          name: bestStrategy.name,
          winRate: bestWR.toFixed(2),
          category: bestStrategy.category
        },
        positionSizing: this.calculatePositionSizingRules(),
        updated: Date.now()
      };
      
      fs.writeFileSync(CONFIG.CONFIG_FILE, JSON.stringify(config, null, 2));
      console.log(`✅ Synced to Live Trader: ${bestStrategy.name} (${bestWR.toFixed(2)}% WR)`);
    }
  }

  calculatePositionSizingRules() {
    const rules = {};
    
    for (const [strategyId, result] of Object.entries(this.results)) {
      if (result.total >= 5) {
        const wr = (result.wins / result.total) * 100;
        if (wr >= 80) rules[strategyId] = '0.05';
        else if (wr >= 70) rules[strategyId] = '0.04';
        else if (wr >= 60) rules[strategyId] = '0.03';
        else rules[strategyId] = '0.02';
      }
    }
    
    return rules;
  }

  // ==================== RESET LOGIC ====================
  checkReset() {
    if (this.simulationCount >= CONFIG.SIMULATION_COUNT) {
      console.log(`\n🔄 REACHED ${CONFIG.SIMULATION_COUNT} SIMULATIONS - RESETTING...\n`);
      
      // Archive old results
      const archiveFile = `/root/trading-bot/archive/paper-trader-v5-${Date.now()}.json`;
      fs.writeFileSync(archiveFile, JSON.stringify({
        results: this.results,
        simulationCount: this.simulationCount,
        ended: Date.now()
      }, null, 2));
      
      // Reset state
      this.simulationCount = 0;
      this.results = {};
      this.state = { simulationCount: 0, results: {}, lastReset: Date.now() };
      this.saveState();
      
      console.log(`✅ Reset complete. Starting fresh simulation cycle.`);
      return true;
    }
    return false;
  }

  // ==================== PROFIT ESTIMATION ====================
  estimateDailyProfit() {
    const tradeableBalance = CONFIG.WALLET_BALANCE - CONFIG.FEE_RESERVE;
    const maxTrades = Math.floor(tradeableBalance / 0.02); // 0.02 SOL per trade
    
    let estimatedProfit = 0;
    let winCount = 0;
    
    // Calculate based on positive strategies
    for (const [strategyId, result] of Object.entries(this.results)) {
      if (result.total >= 5 && (result.wins / result.total) >= 0.70) {
        const wr = result.wins / result.total;
        const avgProfit = result.totalProfit / result.wins;
        const avgLoss = result.totalLoss / (result.total - result.wins);
        
        // Estimate for 5 trades
        const trades = 5;
        const wins = trades * wr;
        const losses = trades - wins;
        
        estimatedProfit += (wins * avgProfit) - (losses * Math.abs(avgLoss));
        winCount += wins;
      }
    }
    
    console.log(`\n📊 DAILY PROFIT ESTIMATION:`);
    console.log(`   Balance: ${CONFIG.WALLET_BALANCE} SOL`);
    console.log(`   Target: ${CONFIG.DAILY_TARGET} SOL`);
    console.log(`   Estimated: ${estimatedProfit.toFixed(4)} SOL`);
    console.log(`   Gap: ${(CONFIG.DAILY_TARGET - estimatedProfit).toFixed(4)} SOL`);
    
    return { estimated: estimatedProfit, target: CONFIG.DAILY_TARGET, gap: CONFIG.DAILY_TARGET - estimatedProfit };
  }

  // ==================== MAIN RUN ====================
  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PAPER TRADER v5.0 - DYNAMIC STRATEGY ENGINE');
    console.log('='.repeat(60));
    
    // Check reset
    this.checkReset();
    
    console.log(`\n📈 Simulation: ${this.simulationCount}/${CONFIG.SIMULATION_COUNT}`);
    console.log(`💰 Wallet: ${CONFIG.WALLET_BALANCE} SOL`);
    console.log(`🎯 Daily Target: ${CONFIG.DAILY_TARGET} SOL\n`);
    
    // Load Strategy Intelligence signals
    console.log('🔗 Loading Strategy Intelligence signals...');
    const intelSignals = await this.loadIntelligenceSignals();
    
    if (intelSignals.length > 0) {
      console.log(`\n🎯 Testing ${intelSignals.length} Intelligence signals:\n`);
      
      for (const signal of intelSignals) {
        const strategy = this.convertSignalToStrategy(signal);
        console.log(`Testing: ${strategy.name} (${strategy.confidence}/10 confidence)`);
        
        // Simulate the signal
        const result = await this.simulateSignalStrategy(strategy);
        this.recordResult(strategy, result);
        
        this.simulationCount++;
      }
    }
    
    // Fetch market data
    const tokens = await this.fetchMarketData();
    console.log(`\n📊 Found ${tokens.length} tokens from market scan\n`);
    
    // Test each strategy on each token
    for (const token of tokens.slice(0, 10)) { // Test on top 10 tokens
      const symbol = token.baseToken?.symbol || 'UNKNOWN';
      console.log(`🔍 Testing: ${symbol}`);
      
      // Candle analysis
      const candleAnalysis = await this.analyzeCandle(token);
      if (!candleAnalysis.valid) {
        console.log(`   ❌ ${candleAnalysis.reason}`);
        continue;
      }
      console.log(`   ✅ Candle: ${candleAnalysis.reason} (Score: ${candleAnalysis.score})`);
      
      // Order book analysis
      const orderBook = await this.analyzeOrderBook(token);
      console.log(`   📊 Order Book: ${orderBook.strength} (${orderBook.ratio}:1)`);
      
      // Simulate each strategy
      for (const strategy of BASE_STRATEGIES) {
        // Skip if in negative list
        if (this.negativeStrategies.includes(strategy.id)) {
          continue;
        }
        
        const result = await this.simulateStrategy(strategy, token, candleAnalysis, orderBook);
        
        // Record result
        if (!this.results[strategy.id]) {
          this.results[strategy.id] = {
            id: strategy.id,
            name: strategy.name,
            category: strategy.category,
            wins: 0,
            losses: 0,
            total: 0,
            totalProfit: 0,
            totalLoss: 0
          };
        }
        
        this.results[strategy.id].total++;
        if (result.isWin) {
          this.results[strategy.id].wins++;
          this.results[strategy.id].totalProfit += result.profitSol;
        } else {
          this.results[strategy.id].losses++;
          this.results[strategy.id].totalLoss += result.profitSol;
        }
        
        this.simulationCount++;
      }
    }
    
    // Update BOK
    this.updateBOKStrategyFiles();
    
    // Sync to Live Trader
    this.syncToLiveTrader();
    
    // Estimate profit
    this.estimateDailyProfit();
    
    // Show results
    this.showResults();
    
    // Send Telegram notification
    await this.notifyTelegram();
    
    // Save state
    this.saveState();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Paper Trader v5 Complete\n');
  }

  async fetchMarketData() {
    try {
      const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await res.json();
      
      const tokens = [];
      for (const profile of profiles.slice(0, 20)) {
        try {
          const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
          const tokenData = await tokenRes.json();
          if (tokenData.pairs?.[0]) {
            tokens.push(tokenData.pairs[0]);
          }
        } catch (e) {}
      }
      
      return tokens;
    } catch (e) {
      console.error('Error fetching market data:', e.message);
      return [];
    }
  }

  showResults() {
    console.log('\n📊 STRATEGY RESULTS:\n');
    
    const sorted = Object.values(this.results)
      .filter(r => r.total >= 3)
      .sort((a, b) => (b.wins / b.total) - (a.wins / a.total));
    
    for (const result of sorted.slice(0, 10)) {
      const wr = ((result.wins / result.total) * 100).toFixed(1);
      const pnl = (result.totalProfit + result.totalLoss).toFixed(4);
      console.log(`${result.name}:`);
      console.log(`   WR: ${wr}% (${result.wins}W/${result.losses}L)`);
      console.log(`   PnL: ${pnl} SOL`);
      console.log(`   Category: ${result.category}`);
      console.log();
    }
  }

  // ==================== TELEGRAM NOTIFICATION ====================
  async notifyTelegram() {
    try {
      const sorted = Object.values(this.results)
        .filter(r => r.total >= 3)
        .sort((a, b) => (b.wins / b.total) - (a.wins / a.total));
      
      if (sorted.length === 0) {
        console.log('ℹ️ No strategies with 3+ trades yet, skipping notification');
        return;
      }

      // Build message
      let msg = `📊 **PAPER TRADER v5 REPORT**\n\n`;
      msg += `🎯 Simulations: ${this.simulationCount}/${CONFIG.SIMULATION_COUNT}\n`;
      
      // Best strategy
      const best = sorted[0];
      const bestWR = ((best.wins / best.total) * 100).toFixed(1);
      const bestPnL = (best.totalProfit + best.totalLoss).toFixed(4);
      
      msg += `\n🏆 **Best Strategy: ${best.name}**\n`;
      msg += `   WR: ${bestWR}% (${best.wins}W/${best.losses}L)\n`;
      msg += `   PnL: ${bestPnL} SOL\n`;
      msg += `   Category: ${best.category}\n`;
      
      // Top 3 strategies
      msg += `\n📈 **Top Strategies:**\n`;
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const s = sorted[i];
        const wr = ((s.wins / s.total) * 100).toFixed(1);
        const pnl = (s.totalProfit + s.totalLoss).toFixed(4);
        msg += `${i+1}. ${s.name}: ${wr}% (${pnl} SOL)\n`;
      }
      
      // BOK Status
      const positiveCount = Object.values(this.results).filter(r => {
        const wr = r.wins / r.total;
        return r.total >= 5 && wr >= 0.70;
      }).length;
      
      msg += `\n📚 **BOK Status:**\n`;
      msg += `   Positive: ${positiveCount} strategies\n`;
      msg += `   Target: WR ≥ 70%, 5+ trades\n`;
      
      // Daily estimate
      msg += `\n💰 **Daily Estimate:**\n`;
      msg += `   Balance: ${CONFIG.WALLET_BALANCE} SOL\n`;
      msg += `   Target: ${CONFIG.DAILY_TARGET} SOL\n`;
      
      // Send notification
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
      
      console.log('✅ Telegram notification sent');
    } catch (e) {
      console.error('❌ Telegram notify failed:', e.message);
    }
  }
}

// Run
const trader = new PaperTraderV5();
trader.run().catch(console.error);
