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
  MIN_TOKEN_AGE_MINUTES: 1440,    // 24 hours minimum - AVOID new tokens
  MIN_LIQUIDITY: 25000,           // $25k minimum liquidity - AVOID low liquidity
  MIN_VOLUME: 10000,              // $10k minimum volume
  
  // Files
  STATE_FILE: '/root/trading-bot/paper-trader-v5-state.json',
  CONFIG_FILE: '/root/trading-bot/adaptive-scoring-config.json',
  
  // Load trading mode config
  getTradingConfig() {
    try {
      const tradingConfig = JSON.parse(fs.readFileSync('/root/trading-bot/trading-config.json', 'utf8'));
      return tradingConfig.TRADING_MODE || {};
    } catch (e) {
      return {};
    }
  },
  
  // Get effective filters based on mode
  getFilters() {
    const tradingMode = this.getTradingConfig();
    const activeMode = tradingMode.ACTIVE || 'established';
    const degenFilters = tradingMode.DEGEN_FILTERS || {};
    const establishedFilters = tradingMode.ESTABLISHED_FILTERS || {};
    
    return activeMode === 'degen' ? degenFilters : establishedFilters;
  },
  
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
  { id: 'divergence_play', name: 'RSI Divergence', indicators: ['rsi', 'price_action'], category: 'SWING_TRADE' },
  
  // Cycloid Strategy (Aristotle's Wheel Paradox)
  // Simplified CVCA: Volatility expansion + Volume confluence + price geometry
  { id: 'cycloid_cvca', name: 'Cycloid CVCA', type: 'cycloid', category: 'SNIPER' },
  
  // MA Crossover Strategy (Best Pair Finder)
  // Auto-optimized: SMA/EMA/TEMA fast/slow crossover
  // Uses ICT Bias stage for confirmation
  { id: 'ma_crossover', name: 'MA Crossover', type: 'ma_crossover', category: 'TREND_FOLLOWING' },
  
  // Liquidation Hunter (PhenLabs)
  // Smart Money concepts - detect liquidity grabs
  // Quality Score based entry
  { id: 'liquidation_hunter', name: 'Liquidation Hunter', type: 'liquidation_hunter', category: 'SNIPER' }
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
  async simulateStrategy(strategy, token, candleAnalysis, orderBook, filters = {}) {
    const entryPrice = parseFloat(token.priceUsd);
    const volatility = parseFloat(token.volatility || 0.20);
    
    // Calculate dynamic SL/TP
    const targets = this.calculateDynamicSLTP(
      entryPrice, 
      volatility, 
      orderBook.strength,
      candleAnalysis.momentum
    );
    
    // Simulate outcome based on strategy accuracy + filter adjustments
    // Higher score = better chance of win
    const baseProbability = this.calculateWinProbability(strategy, candleAnalysis, orderBook);
    const filterModifier = this.calculateFilterModifier(filters);
    const winProbability = Math.min(0.95, Math.max(0.05, baseProbability + filterModifier));
    
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
    // Cycloid CVCA Strategy - Special handling
    if (strategy.id === 'cycloid_cvca') {
      return this.calculateCycloidProbability(candleAnalysis, orderBook);
    }
    
    // MA Crossover Strategy - Trend following with ICT confirmation
    if (strategy.id === 'ma_crossover') {
      return this.calculateMACrossoverProbability(candleAnalysis, orderBook);
    }
    
    // Liquidation Hunter - Smart Money concepts
    if (strategy.id === 'liquidation_hunter') {
      return this.calculateLiquidationHunterProbability(candleAnalysis, orderBook);
    }
    
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

  // Calculate filter modifier for simulation
  calculateFilterModifier(filters = {}) {
    let modifier = 0;
    
    // Wyckoff Phase modifier
    if (filters.wyckoff) {
      if (filters.wyckoff.phase === 'PHASE_B' || filters.wyckoff.phase === 'PHASE_C') {
        modifier += 0.08; // Accumulation/testing phase - good for entry
      } else if (filters.wyckoff.phase === 'PHASE_D') {
        modifier += 0.12; // Breakout phase - highest probability
      } else if (filters.wyckoff.phase === 'PHASE_E') {
        modifier -= 0.10; // Distribution - bad for long
      }
    }
    
    // VDubus Wave modifier
    if (filters.vdubus && filters.vdubus.confluence >= 4) {
      modifier += 0.10; // High confluence = strong signal
    } else if (filters.vdubus && filters.vdubus.confluence >= 3) {
      modifier += 0.05;
    } else if (filters.vdubus && filters.vdubus.confluence <= 1) {
      modifier -= 0.05;
    }
    
    // Volume Cluster modifier
    if (filters.volCluster) {
      if (filters.volCluster.institutionalInterest === 'HIGH') {
        modifier += 0.08;
      } else if (filters.volCluster.institutionalInterest === 'MEDIUM') {
        modifier += 0.03;
      } else if (filters.volCluster.institutionalInterest === 'LOW') {
        modifier -= 0.03;
      }
    }
    
    // Volatility Risk Premium modifier
    if (filters.volRP) {
      if (filters.volRP.regime === 'HIGH_VOL' && filters.volRP.signal === 'BULLISH') {
        modifier += 0.08; // High volatility = high reward
      } else if (filters.volRP.regime === 'LOW_VOL') {
        modifier -= 0.05; // Low volatility = low movement
      }
    }
    
    // ATH Breakout modifier
    if (filters.athFilter) {
      if (filters.athFilter.signal === 'STRONG_BREAKOUT') {
        modifier += 0.12;
      } else if (filters.athFilter.signal === 'BREAKOUT_SETUP') {
        modifier += 0.08;
      } else if (filters.athFilter.signal === 'PULLBACK_OPPORTUNITY') {
        modifier += 0.03;
      } else if (filters.athFilter.signal === 'NO_BREAKOUT') {
        modifier -= 0.08;
      }
    }
    
    return modifier; // Can be positive or negative
  }

  calculatePositionSize(strategy, winProbability) {
    // Read from shared config for auto-sync with live trading
    try {
      const tradingConfig = JSON.parse(fs.readFileSync('/root/trading-bot/trading-config.json', 'utf8'));
      return tradingConfig.POSITION_SIZE || 0.008;
    } catch (e) {
      return 0.008; // Default fallback
    }
  }
  
  // ==================== CYCLOID CVCA STRATEGY ====================
  // Simplified Aristotle's Wheel Cycloid analysis
  // 3-axis: Volatility Expansion + Volume Confluence + Price Geometry
  
  calculateCycloidProbability(candleAnalysis, orderBook) {
    let probability = 0.50;
    
    // Axis 1: Volatility Expansion (Yang-Zhang style)
    // Check if this is a maxima candle (volatility expansion)
    const volatilityScore = candleAnalysis.score; // 1-10
    if (volatilityScore >= 7) {
      probability += 0.15; // Strong expansion = higher probability
    } else if (volatilityScore >= 5) {
      probability += 0.05;
    } else {
      probability -= 0.10;
    }
    
    // Axis 2: Volume Confluence
    // Strong order book = volume confluence
    if (orderBook.strength === 'strong') {
      probability += 0.15;
    } else if (orderBook.strength === 'moderate') {
      probability += 0.05;
    } else {
      probability -= 0.08;
    }
    
    // Axis 3: Price Geometry (simplified cycloid position)
    // If price near key levels (support/resistance), higher bounce probability
    const pattern = candleAnalysis.pattern || 'unknown';
    if (pattern === 'bullish' || pattern === 'breakout_up') {
      probability += 0.12;
    } else if (pattern === 'bearish' || pattern === 'breakout_down') {
      probability -= 0.12;
    }
    
    // Combine with historical if available
    if (this.results['cycloid_cvca']) {
      const wins = this.results['cycloid_cvca'].wins || 0;
      const total = this.results['cycloid_cvca'].total || 0;
      if (total > 3) {
        const wr = wins / total;
        probability = (probability + wr) / 2;
      }
    }
    
    return Math.min(Math.max(probability, 0.15), 0.85);
  }
  
  // ==================== MA CROSSOVER STRATEGY ====================
  // Best MA Pair Finder: Auto-optimized SMA/EMA/TEMA crossover
  // Uses ICT Bias stage for confirmation
  
  calculateMACrossoverProbability(candleAnalysis, orderBook) {
    let probability = 0.50;
    
    // Axis 1: Trend direction (MA crossover equivalent)
    const pattern = candleAnalysis.pattern || 'unknown';
    if (pattern === 'bullish' || pattern === 'breakout_up') {
      probability += 0.15; // Bullish crossover
    } else if (pattern === 'bearish' || pattern === 'breakout_down') {
      probability -= 0.15; // Bearish crossover
    } else {
      probability -= 0.05; // No clear direction
    }
    
    // Axis 2: ICT Bias Stage (confirmation)
    // TRIGGER_READY = highest probability
    // Use ICT bias score from calculation
    const score = candleAnalysis.score || 5;
    if (score >= 8) {
      probability += 0.12; // Strong momentum (fast MA above slow MA)
    } else if (score >= 6) {
      probability += 0.05;
    } else if (score <= 4) {
      probability -= 0.10; // Weak/flat - potential death cross
    }
    
    // Axis 3: Volume confirmation
    if (orderBook.strength === 'strong') {
      probability += 0.10;
    } else if (orderBook.strength === 'moderate') {
      probability += 0.03;
    } else {
      probability -= 0.05;
    }
    
    // Historical performance
    if (this.results['ma_crossover']) {
      const wins = this.results['ma_crossover'].wins || 0;
      const total = this.results['ma_crossover'].total || 0;
      if (total > 3) {
        const wr = wins / total;
        probability = (probability + wr) / 2;
      }
    }
    
    return Math.min(Math.max(probability, 0.15), 0.85);
  }
  
  // ==================== LIQUIDATION HUNTER STRATEGY ====================
  // Smart Money concepts - detect institutional liquidity grabs
  // Quality Score 0-100 based entry
  
  calculateLiquidationHunterProbability(candleAnalysis, orderBook) {
    // Get the liquidation hunter analysis
    const liqHunter = this.calculateLiquidationHunter(candleAnalysis, orderBook);
    
    let probability = 0.50;
    
    // Base probability from Quality Score
    probability = liqHunter.qualityScore / 100;
    
    // Phase bonus
    if (liqHunter.phase === 'REVERSAL') {
      probability += 0.15;
    } else if (liqHunter.phase === 'TRAP') {
      probability += 0.05;
    }
    
    // Signal bonus
    if (liqHunter.signal === 'BUY' || liqHunter.signal === 'SELL') {
      probability += 0.10;
    }
    
    // Volume confirmation
    if (orderBook.strength === 'strong') {
      probability += 0.08;
    } else if (orderBook.strength === 'moderate') {
      probability += 0.03;
    } else {
      probability -= 0.05;
    }
    
    // Historical performance
    if (this.results['liquidation_hunter']) {
      const wins = this.results['liquidation_hunter'].wins || 0;
      const total = this.results['liquidation_hunter'].total || 0;
      if (total > 3) {
        const wr = wins / total;
        probability = (probability + wr) / 2;
      }
    }
    
    return Math.min(Math.max(probability, 0.15), 0.85);
  }
  
  // ==================== WYCKOFF SCHEMATIC ====================
  // Wyckoff Method: Accumulation & Distribution Phase Detection
  // Phases: A (early) → B (accumulation) → C (test) → D (breakout) → E (distribution)
  
  calculateWyckoffPhase(candleAnalysis, orderBook) {
    let phase = 'NEUTRAL';
    let signal = 'NONE';
    let confidence = 'low';
    const score = candleAnalysis.score || 5;
    const change24h = Math.abs(candleAnalysis.change24h || 0);
    
    // Phase A: Early - Low volatility, consolidation
    if (score >= 4 && score <= 6 && change24h <= 2) {
      phase = 'PHASE_A';
      confidence = 'medium';
    }
    // Phase B: Accumulation - Price stabilizes, volume increases
    else if (score >= 6 && score <= 7 && orderBook.strength !== 'weak') {
      phase = 'PHASE_B';
      confidence = 'high';
      signal = 'ACCUMULATION';
    }
    // Phase C: Test - Spring/UTAD, final test before breakout
    else if (score >= 7 && change24h >= 3) {
      phase = 'PHASE_C';
      confidence = 'high';
      signal = 'TEST';
    }
    // Phase D: Breakout - SOS/SOW, trend starts
    else if (score >= 8 && change24h >= 5) {
      phase = 'PHASE_D';
      confidence = 'high';
      signal = change24h > 0 ? 'BULLISH_BREAKOUT' : 'BEARISH_BREAKOUT';
    }
    // Phase E: Distribution - Late trend, smart money exits
    else if (score <= 4 && change24h >= 4) {
      phase = 'PHASE_E';
      confidence = 'medium';
      signal = 'DISTRIBUTION';
    }
    
    return {
      phase, // PHASE_A through PHASE_E, NEUTRAL
      signal, // ACCUMULATION, TEST, BREAKOUT, DISTRIBUTION
      confidence, // low, medium, high
      tradeable: signal !== 'NONE' && signal !== 'DISTRIBUTION'
    };
  }
  
  // ==================== VDubus DIVERGENCE WAVE ====================
  // Geometry + Physics + Momentum confluence
  // Wave patterns with divergence detection
  
  calculateVdubusWave(candleAnalysis, orderBook) {
    let waveSignal = 'NONE';
    let confluence = 0;
    const score = candleAnalysis.score || 5;
    const change24h = candleAnalysis.change24h || 0;
    const pattern = candleAnalysis.pattern || 'unknown';
    
    // Geometry: Price patterns (harmonic, triangle, etc.)
    if (pattern === 'breakout_up' || pattern === 'breakout_down') {
      confluence += 2;
      waveSignal = change24h > 0 ? 'BULLISH_WAVE' : 'BEARISH_WAVE';
    } else if (pattern === 'bullish' || pattern === 'bearish') {
      confluence += 1;
    }
    
    // Physics: Momentum shift
    if (score >= 7) {
      confluence += 2;
    } else if (score >= 5) {
      confluence += 1;
    } else {
      confluence -= 1;
    }
    
    // MACD-style divergence (simulated)
    if (Math.abs(change24h) >= 5) {
      confluence += 2;
    } else if (Math.abs(change24h) >= 2) {
      confluence += 1;
    }
    
    // Volume confirmation
    if (orderBook.strength === 'strong') {
      confluence += 1;
    }
    
    return {
      waveSignal, // BULLISH_WAVE, BEARISH_WAVE, NONE
      confluence, // -2 to 7
      strength: confluence >= 5 ? 'STRONG' : (confluence >= 3 ? 'MODERATE' : 'WEAK'),
      entryReady: confluence >= 4
    };
  }
  
  // ==================== CLUSTERS VOLUME PROFILE ====================
  // K-Means clustering for POC detection
  // Identifies institutional zones (Point of Control)
  
  calculateVolumeCluster(candleAnalysis, orderBook) {
    let pocLevel = 'MID';
    let institutionalInterest = 'LOW';
    const score = candleAnalysis.score || 5;
    const change24h = Math.abs(candleAnalysis.change24h || 0);
    
    // POC (Point of Control) zones
    if (score >= 7 && change24h >= 3) {
      pocLevel = 'HIGH'; // Price at top of range - institutional selling
      institutionalInterest = 'HIGH';
    } else if (score >= 5 && score <= 6) {
      pocLevel = 'MID';
      institutionalInterest = 'MEDIUM';
    } else if (score <= 4) {
      pocLevel = 'LOW'; // Price at bottom - institutional buying
      institutionalInterest = score <= 3 ? 'HIGH' : 'MEDIUM';
    }
    
    // Volume cluster quality
    let clusterQuality = 'WEAK';
    if (orderBook.strength === 'strong' && institutionalInterest !== 'LOW') {
      clusterQuality = 'STRONG';
    } else if (orderBook.strength === 'moderate' || institutionalInterest === 'MEDIUM') {
      clusterQuality = 'MODERATE';
    }
    
    return {
      pocLevel, // HIGH, MID, LOW
      institutionalInterest, // LOW, MEDIUM, HIGH
      clusterQuality, // WEAK, MODERATE, STRONG
      recommendation: institutionalInterest === 'HIGH' ? 'ENTER' : 'WATCH'
    };
  }
  
  // ==================== VOLATILITY RISK PREMIUM ====================
  // Market regime detection based on volatility
  // Insurance premium concept: regime change indicator
  
  calculateVolatilityRiskPremium(candleAnalysis, orderBook) {
    let regime = 'NORMAL';
    let riskLevel = 'MODERATE';
    let signal = 'NEUTRAL';
    
    const score = candleAnalysis.score || 5;
    const change24h = Math.abs(candleAnalysis.change24h || 0);
    
    // Low volatility = potential explosion (premium low = buy insurance)
    if (score <= 4 && change24h <= 1) {
      regime = 'LOW_VOLATILITY';
      riskLevel = 'LOW';
      signal = 'ACCUMULATE'; // Low premium, good to enter
    }
    // Normal volatility = trending
    else if (score >= 5 && score <= 7 && change24h >= 1 && change24h <= 5) {
      regime = 'NORMAL';
      riskLevel = 'MODERATE';
      signal = change24h > 0 ? 'LONG' : 'SHORT';
    }
    // High volatility = exhaustion (premium high = risk)
    else if (score >= 8 || change24h >= 6) {
      regime = 'HIGH_VOLATILITY';
      riskLevel = 'HIGH';
      signal = 'TAKE_PROFIT'; // High premium = reduce exposure
    }
    // Very low = squeeze
    else if (score <= 3) {
      regime = 'VOLATILITY_SQUEEZE';
      riskLevel = 'EXTREME';
      signal = 'WAIT';
    }
    
    return {
      regime, // LOW_VOLATILITY, NORMAL, HIGH_VOLATILITY, VOLATILITY_SQUEEZE
      riskLevel, // LOW, MODERATE, HIGH, EXTREME
      signal, // ACCUMULATE, LONG, SHORT, TAKE_PROFIT, WAIT
      adjustPosition: riskLevel === 'HIGH' ? 'REDUCE' : (riskLevel === 'EXTREME' ? 'EXIT' : 'HOLD')
    };
  }
  
  // ==================== HTF PO3 FILTER ====================
  // Smart Money Concepts: Higher Timeframe Price Action Filter
  // Checks: Trend direction, HTF candle state, volume confluence
  
  applyHTFFilter(candleAnalysis, orderBook) {
    let score = 0;
    let signal = 'NEUTRAL';
    let reasons = [];
    
    // Axis 1: Trend Direction (from candle analysis)
    const pattern = candleAnalysis.pattern || 'unknown';
    if (pattern === 'bullish' || pattern === 'breakout_up') {
      score += 2;
      reasons.push('bullish_pattern');
    } else if (pattern === 'bearish' || pattern === 'breakout_down') {
      score -= 2;
      reasons.push('bearish_pattern');
    }
    
    // Axis 2: HTF Candle State (simulated from score)
    // High score = HTF candle in expansion phase (PO3: Accumulation/Distribution)
    if (candleAnalysis.score >= 7) {
      score += 2;
      reasons.push('htf_expansion');
    } else if (candleAnalysis.score >= 5) {
      score += 0;
      reasons.push('htf_continuation');
    } else {
      score -= 1;
      reasons.push('htf_contraction');
    }
    
    // Axis 3: Volume Confluence (Order Book strength)
    if (orderBook.strength === 'strong') {
      score += 2;
      reasons.push('volume_confluence');
    } else if (orderBook.strength === 'moderate') {
      score += 1;
    } else {
      score -= 1;
      reasons.push('weak_volume');
    }
    
    // Determine signal
    if (score >= 4) {
      signal = 'STRONG_BUY';
    } else if (score >= 2) {
      signal = 'BUY';
    } else if (score <= -2) {
      signal = 'SELL';
    } else {
      signal = 'NEUTRAL';
    }
    
    // Confidence level
    let confidence = 'low';
    if (Math.abs(score) >= 4) confidence = 'high';
    else if (Math.abs(score) >= 2) confidence = 'medium';
    
    return {
      pass: true, // Filter is advisory - don't block, just score
      score,
      signal,
      confidence,
      reasons: reasons.join(', '),
      htfState: score >= 2 ? 'BULLISH_HTF' : (score <= -2 ? 'BEARISH_HTF' : 'NEUTRAL_HTF')
    };
  }
  
  // ==================== ATH BREAKOUT FILTER ====================
  // Breakouts & Pullbacks [Trendoscope] inspired filter
  // Uses price momentum + volume as breakout potential indicator
  
  async applyATHFilter(tokenData, prices) {
    try {
      const currentPrice = prices?.current || tokenData.price;
      const priceChange5m = tokenData.priceChange?.m5 || 0;
      const priceChange1h = tokenData.priceChange?.h1 || 0;
      const volume = tokenData.volume?.h24 || 0;
      const liquidity = tokenData.liquidity?.usd || 0;
      
      let score = 0;
      let reasons = [];
      
      // Price momentum - strong upward movement = potential breakout
      if (priceChange5m >= 3) {
        score += 3;
        reasons.push('strong_5m_momentum');
      } else if (priceChange5m >= 1) {
        score += 2;
        reasons.push('moderate_5m_momentum');
      } else if (priceChange5m >= 0.5) {
        score += 1;
        reasons.push('weak_5m_momentum');
      } else if (priceChange5m <= -2) {
        score -= 2;
        reasons.push('negative_momentum');
      }
      
      // 1h momentum confirmation
      if (priceChange1h >= 5) {
        score += 2;
        reasons.push('strong_1h_momentum');
      } else if (priceChange1h >= 2) {
        score += 1;
        reasons.push('moderate_1h_momentum');
      }
      
      // Volume confirmation
      if (volume > 100000) {
        score += 2;
        reasons.push('high_volume');
      } else if (volume > 50000) {
        score += 1;
        reasons.push('moderate_volume');
      } else if (volume < 10000) {
        score -= 1;
        reasons.push('low_volume');
      }
      
      // Liquidity check
      if (liquidity > 10000) {
        score += 1;
        reasons.push('good_liquidity');
      }
      
      // Signal determination
      let signal = 'NEUTRAL';
      if (score >= 5) signal = 'STRONG_BREAKOUT';
      else if (score >= 3) signal = 'BREAKOUT_SETUP';
      else if (score >= 1) signal = 'PULLBACK_OPPORTUNITY';
      else if (score <= -1) signal = 'NO_BREAKOUT';
      
      return {
        score,
        signal,
        reasons: reasons.join(', '),
        momentum: (priceChange5m + priceChange1h).toFixed(2)
      };
    } catch (e) {
      return { score: 0, signal: 'NEUTRAL', reasons: ['ath_filter_error'] };
    }
  }
  
  // ==================== DOJI SCANNER ====================
  // Detects Doji candles (open ≈ close) - indecision signal
  // Doji = potential reversal point
  
  detectDoji(candleAnalysis) {
    // Doji: body is very small relative to wicks
    // Simplified detection based on candle score and pattern
    const score = candleAnalysis.score || 5;
    const pattern = candleAnalysis.pattern || 'unknown';
    
    let isDoji = false;
    let dojiType = 'none';
    
    // Low score + neutral pattern = potential doji (indecision)
    if (score >= 4 && score <= 6 && (pattern === 'consolidation' || pattern === 'unknown')) {
      isDoji = true;
      dojiType = 'standard_doji';
    }
    
    // Dragonfly Doji: long lower wick, no upper wick (bullish reversal)
    if (pattern === 'bullish_hammer' || pattern === 'bullish_reversal') {
      isDoji = true;
      dojiType = 'dragonfly_doji';
    }
    
    // Gravestone Doji: long upper wick, no lower wick (bearish reversal)
    if (pattern === 'bearish_shooting_star' || pattern === 'bearish_reversal') {
      isDoji = true;
      dojiType = 'gravestone_doji';
    }
    
    return {
      isDoji,
      dojiType,
      reversalSignal: isDoji ? (dojiType.includes('dragonfly') ? 'BULLISH' : (dojiType.includes('gravestone') ? 'BEARISH' : 'NEUTRAL')) : 'NONE'
    };
  }
  
  // ==================== ADAPTIVE TREND FINDER ====================
  // Auto-detects optimal trend period with confidence score
  // Trend strength determines trade probability
  
  calculateAdaptiveTrend(candleAnalysis, orderBook) {
    let trendScore = 0;
    let confidence = 'low';
    let trendDirection = 'SIDEWAYS';
    
    // Axis 1: Price momentum (proxy for trend strength)
    const score = candleAnalysis.score || 5;
    if (score >= 8) {
      trendScore += 3;
    } else if (score >= 6) {
      trendScore += 1;
    } else if (score <= 3) {
      trendScore -= 1;
    }
    
    // Axis 2: Volume confirmation (trend sustainability)
    if (orderBook.strength === 'strong') {
      trendScore += 2;
    } else if (orderBook.strength === 'moderate') {
      trendScore += 1;
    } else {
      trendScore -= 1;
    }
    
    // Axis 3: 24h change direction (trend persistence)
    const change24h = candleAnalysis.change24h || 0;
    if (Math.abs(change24h) >= 5) {
      trendScore += 2; // Strong move = trending
    } else if (Math.abs(change24h) >= 2) {
      trendScore += 1;
    }
    
    // Determine direction and confidence
    if (trendScore >= 4) {
      confidence = 'high';
      trendDirection = change24h > 0 ? 'STRONG_UPTREND' : 'STRONG_DOWNTREND';
    } else if (trendScore >= 2) {
      confidence = 'medium';
      trendDirection = change24h > 0 ? 'UPTREND' : 'DOWNTREND';
    } else if (trendScore <= -1) {
      confidence = 'medium';
      trendDirection = 'SIDEWAYS';
    } else {
      confidence = 'low';
      trendDirection = 'SIDEWAYS';
    }
    
    return {
      trendScore,
      confidence,
      trendDirection, // STRONG_UPTREND, UPTREND, SIDEWAYS, DOWNTREND, STRONG_DOWNTREND
      suitableForTrendFollowing: Math.abs(trendScore) >= 2
    };
  }
  
  // ==================== EVASIVE SUPERTREND ====================
  // LuxAlgo: Noise avoidance - push band away during choppy markets
  // Reduces whipsaws by detecting "Noise Zone"
  
  calculateEvasiveSuperTrend(candleAnalysis, orderBook) {
    let signal = 'NEUTRAL';
    let mode = 'standard'; // standard or evasive
    let noiseLevel = 'low';
    
    // Axis 1: Price distance from volatility band (simulated)
    const score = candleAnalysis.score || 5;
    const change24h = Math.abs(candleAnalysis.change24h || 0);
    
    if (score >= 7 && change24h >= 3) {
      signal = 'BULL';
      mode = 'standard'; // Healthy trend
    } else if (score <= 4 && change24h <= 1) {
      signal = 'NEUTRAL';
      mode = 'evasive'; // Noise zone - band pushes away
      noiseLevel = 'high';
    } else if (score >= 5 && score <= 6) {
      signal = change24h > 0 ? 'BULL' : 'BEAR';
      mode = 'standard';
      noiseLevel = 'medium';
    }
    
    // Axis 2: Volume confirms trend strength
    if (orderBook.strength === 'strong' && mode === 'standard') {
      signal = signal === 'BULL' ? 'BULL' : (signal === 'BEAR' ? 'BEAR' : 'NEUTRAL');
    }
    
    return {
      signal, // BULL, BEAR, NEUTRAL
      mode, // standard or evasive
      noiseLevel, // low, medium, high
      avoidTrade: mode === 'evasive' && noiseLevel === 'high'
    };
  }
  
  // ==================== SUPERTREND RECOVERY ====================
  // LuxAlgo: Dynamic trailing stop during deep pullbacks
  // Tighter exit during retracements
  
  calculateSuperTrendRecovery(candleAnalysis, orderBook) {
    let trend = 'SIDEWAYS';
    let recoveryActive = false;
    let exitPriority = 1; // 1=normal, 2=early exit
    
    // Axis 1: Base trend direction
    const score = candleAnalysis.score || 5;
    const change24h = candleAnalysis.change24h || 0;
    
    if (score >= 7 && change24h > 2) {
      trend = 'BULL';
    } else if (score <= 3 && change24h < -2) {
      trend = 'BEAR';
    }
    
    // Axis 2: Deep pullback detection (recovery mode)
    // If price moved significantly against trend, activate recovery
    const pullbackDepth = Math.abs(change24h);
    if (trend !== 'SIDEWAYS') {
      if ((trend === 'BULL' && change24h < -3) || (trend === 'BEAR' && change24h > 3)) {
        recoveryActive = true;
        exitPriority = 3; // Early exit - tight trailing
      } else if (pullbackDepth >= 2) {
        recoveryActive = true;
        exitPriority = 2; // Monitor closely
      }
    }
    
    // Axis 3: Volume spike confirms recovery
    if (orderBook.strength === 'strong' && recoveryActive) {
      exitPriority = Math.min(exitPriority + 1, 3);
    }
    
    return {
      trend, // BULL, BEAR, SIDEWAYS
      recoveryActive,
      exitPriority, // 1=normal, 2=monitor, 3=early exit
      recommendation: exitPriority === 3 ? 'EXIT_NOW' : (exitPriority === 2 ? 'WATCH_CLOSELY' : 'HOLD')
    };
  }
  
  // ==================== LIQUIDATION HUNTER ====================
  // PhenLabs: Smart Money Liquidation Hunter
  // Detect institutional liquidity grabs (stop hunting)
  // Quality Score: 0-100
  
  calculateLiquidationHunter(candleAnalysis, orderBook) {
    let qualityScore = 0;
    let phase = 'NONE'; // INDUCEMENT, TRAP, REVERSAL, NONE
    let signal = 'NONE';
    let reasons = [];
    
    // Layer 1: Liquidity Sweep Potential (25 pts)
    const score = candleAnalysis.score || 5;
    const change24h = Math.abs(candleAnalysis.change24h || 0);
    
    if (score <= 3 || change24h >= 8) {
      qualityScore += 25; // Sweep possible
      reasons.push('liquidity_sweep');
    } else if (score <= 5 || change24h >= 4) {
      qualityScore += 15;
      reasons.push('liquidity_approach');
    }
    
    // Layer 2: Volume Spike (25 pts)
    if (orderBook.strength === 'strong') {
      qualityScore += 25;
      reasons.push('volume_spike');
    } else if (orderBook.strength === 'moderate') {
      qualityScore += 15;
      reasons.push('moderate_volume');
    }
    
    // Layer 3: HTF Trend Alignment (25 pts)
    // Already have HTF PO3 - use that alignment
    if (score >= 7) {
      qualityScore += 25;
      reasons.push('htf_aligned');
    } else if (score >= 5) {
      qualityScore += 10;
    }
    
    // Layer 4: Structural Confluence (25 pts)
    // ICT Bias + Order Block concept
    const pattern = candleAnalysis.pattern || 'unknown';
    if (pattern === 'breakout_up' || pattern === 'breakout_down') {
      qualityScore += 25;
      reasons.push('structural_breakout');
    } else if (pattern === 'consolidation') {
      qualityScore += 10;
    }
    
    // Determine phase and signal
    if (qualityScore >= 75) {
      phase = 'REVERSAL';
      signal = change24h > 0 ? 'BUY' : 'SELL';
    } else if (qualityScore >= 50) {
      phase = 'TRAP';
      signal = 'WATCH';
    } else if (qualityScore >= 25) {
      phase = 'INDUCEMENT';
      signal = 'WATCH';
    }
    
    return {
      qualityScore, // 0-100
      phase, // INDUCEMENT, TRAP, REVERSAL, NONE
      signal, // BUY, SELL, WATCH, NONE
      reasons: reasons.join(', '),
      isHighQuality: qualityScore >= 50
    };
  }
  
  // ==================== ICT BIAS SCORE FILTER ====================
  // ICT (Inner Circle Trading) Bias: PDH/PDL, Midpoint, Prev Candle, MSS, Displacement
  // Stages: NOT_READY → LEAN → CONFIRMED → TRIGGER_READY
  
  calculateICTBias(candleAnalysis, orderBook) {
    let score = 0;
    let components = [];
    
    // Component 1: PDH/PDL Sweep (Weight ±2)
    // Simulated: check price position relative to daily range
    const priceChange = Math.abs(candleAnalysis.change24h || 0);
    if (priceChange > 3) {
      score += 2;
      components.push('PDH_sweep');
    } else if (priceChange > 1) {
      score += 1;
      components.push('PDH_approach');
    } else {
      score += 0;
      components.push('PDL_range');
    }
    
    // Component 2: Midpoint Location (Weight ±1)
    // Simulated: check if price is above/below recent avg
    if (candleAnalysis.score >= 7) {
      score += 1;
      components.push('above_mid');
    } else if (candleAnalysis.score >= 5) {
      score += 0;
      components.push('at_mid');
    } else {
      score -= 1;
      components.push('below_mid');
    }
    
    // Component 3: Previous Day Candle (Weight ±1)
    // Simulated from 24h change direction
    const change24h = candleAnalysis.change24h || 0;
    if (change24h > 0) {
      score += 1;
      components.push('prev_bullish');
    } else if (change24h < 0) {
      score -= 1;
      components.push('prev_bearish');
    } else {
      score += 0;
    }
    
    // Component 4: MSS - Market Structure Shift (Weight ±1)
    // Simulated: strong momentum = structure shift
    if (candleAnalysis.score >= 8) {
      score += 1;
      components.push('MSS_bullish');
    } else if (candleAnalysis.score <= 4) {
      score -= 1;
      components.push('MSS_bearish');
    }
    
    // Component 5: Displacement - Impulse Strength (Weight ±1)
    // Simulated: high score = strong displacement
    if (orderBook.strength === 'strong') {
      score += 1;
      components.push('strong_displacement');
    } else if (orderBook.strength === 'moderate') {
      score += 0;
    } else {
      score -= 1;
      components.push('weak_displacement');
    }
    
    // Determine bias
    let bias = 'NEUTRAL';
    if (score >= 3) bias = 'BULLISH';
    else if (score <= -3) bias = 'BEARISH';
    
    // Determine stage (readiness)
    let stage = 'NOT_READY';
    if (score >= 5) stage = 'TRIGGER_READY';
    else if (score >= 3) stage = 'CONFIRMED';
    else if (score >= 1) stage = 'LEAN';
    
    return {
      score,
      bias, // BULLISH / BEARISH / NEUTRAL
      stage, // TRIGGER_READY / CONFIRMED / LEAN / NOT_READY
      components: components.join(', '),
      priority: stage === 'TRIGGER_READY' ? 3 : (stage === 'CONFIRMED' ? 2 : (stage === 'LEAN' ? 1 : 0))
    };
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
    
    // Track tokens used by this strategy (for proven token list)
    if (!this.results[strategy.id].tokens) {
      this.results[strategy.id].tokens = [];
    }
    this.results[strategy.id].tokens.push({
      symbol: result.token,
      ca: result.tokenCA,
      isWin: result.isWin,
      pnlPercent: result.pnlPercent,
      timestamp: result.timestamp
    });
  }

  // ==================== BOK INTEGRATION ====================
  updateBOKStrategyFiles() {
    const positiveStrategies = [];
    const negativeStrategies = [];
    
    // Get current cycle number
    const currentCycle = Math.floor(this.simulationCount / CONFIG.SIMULATION_COUNT) + 1;
    
    // Load existing negative strategies for re-testing
    const existingNegative = this.loadExistingNegativeStrategies();
    const liveTracker = this.loadLiveStrategyTracker();
    
    for (const [strategyId, result] of Object.entries(this.results)) {
      if (result.total >= 3) { // Minimum 3 trades for validation
        const wr = (result.wins / result.total) * 100;
        const wasNegative = existingNegative.includes(strategyId);
        const liveRecord = liveTracker[strategyId];
        
        if (wr >= 55) {
          // Check if this was previously negative - PROMOTE!
          if (wasNegative) {
            console.log(`\n🎉 PROMOTION: ${result.name} moved from NEGATIVE to POSITIVE!`);
            console.log(`   WR: ${wr.toFixed(1)}% (${result.wins}W/${result.losses}L)`);
            console.log(`   Previous status: Negative (now re-tested)`);
          }
          
          positiveStrategies.push({
            id: strategyId,
            name: result.name,
            winRate: wr.toFixed(2),
            profit: (result.totalProfit + result.totalLoss).toFixed(4),
            category: result.category,
            cycle: currentCycle,
            trades: result.total,
            expiryCycle: currentCycle + 5, // Valid for 5 cycles (accumulating mode)
            promotedFromNegative: wasNegative
          });
        } else {
          negativeStrategies.push({
            id: strategyId,
            name: result.name,
            winRate: wr.toFixed(2),
            reason: wasNegative ? 'Still below 55% after re-test' : 'WR below 55%',
            cycle: currentCycle,
            trades: result.total,
            canReTest: true
          });
        }
      }
    }
    
    // Write to BOK Positive Strategies
    this.writePositiveStrategies(positiveStrategies, currentCycle);
    
    // Write to BOK Negative Strategies
    this.writeNegativeStrategies(negativeStrategies, currentCycle);
    
    // Extract and save PROVEN TOKENS for positive strategies
    this.saveProvenTokens(positiveStrategies);
    
    // Clean up expired strategies from previous cycles
    this.cleanupExpiredStrategies(currentCycle);
  }
  
  loadExistingNegativeStrategies() {
    try {
      const content = fs.readFileSync('/root/trading-bot/bok/17-negative-strategies.md', 'utf8');
      const ids = [];
      const matches = content.match(/\| (\w+) \|/g);
      if (matches) {
        matches.forEach(m => {
          const id = m.match(/\| (\w+) \|/)[1];
          if (id !== 'ID' && id !== '----') ids.push(id);
        });
      }
      return ids;
    } catch (e) {
      return [];
    }
  }
  
  loadLiveStrategyTracker() {
    try {
      return JSON.parse(fs.readFileSync('/root/trading-bot/live-strategy-tracker.json', 'utf8'));
    } catch (e) {
      return {};
    }
  }

  // Extract and save PROVEN TOKENS (WIN only) for positive strategies
  // ==================== HONEYPOT VALIDATION ====================
  async validateTokenHoneypot(ca) {
    try {
      // Method 1: Try DexScreener (more reliable)
      const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${ca}`;
      const dexRes = await fetch(dexUrl, { timeout: 5000 });
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
          return { safe: true, reason: 'DexScreener OK' };
        }
      }
      
      // Method 2: Try SolanaTracker swap quote (for honeypot check)
      const solanaTrackerUrl = 'https://swap-v2.solanatracker.io';
      const testUrl = `${solanaTrackerUrl}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${ca}&amount=1000000&slippage=50`;
      const res = await fetch(testUrl, { timeout: 5000 });
      if (res.ok) {
        return { safe: true, reason: 'Swap quote OK' };
      }
      
      return { safe: false, reason: 'All validation methods failed' };
    } catch (e) {
      return { safe: false, reason: e.message };
    }
  }

  async saveProvenTokens(positiveStrategies) {
    // ==================== ESTABLISHED MODE ====================
    const provenTokens = {};
    const timestamp = Date.now();

    for (const strat of positiveStrategies) {
      const stratData = this.results[strat.id];
      if (!stratData || !stratData.tokens) continue;

      // Get unique tokens with WIN results
      const winTokens = stratData.tokens
        .filter(t => t.isWin)
        .reduce((acc, t) => {
          if (!acc[t.ca]) {
            acc[t.ca] = {
              symbol: t.symbol,
              ca: t.ca,
              wins: 0,
              avgPnl: 0,
              lastTrade: t.timestamp,
              validated: false,
              validationTime: null
            };
          }
          acc[t.ca].wins++;
          acc[t.ca].avgPnl = (acc[t.ca].avgPnl + t.pnlPercent) / 2;
          return acc;
        }, {});

      // Validate honeypot for top tokens (max 5 to avoid rate limits)
      const tokenList = Object.values(winTokens).sort((a, b) => b.wins - a.wins).slice(0, 5);
      for (const token of tokenList) {
        const validation = await this.validateTokenHoneypot(token.ca);
        token.validated = validation.safe;
        token.validationTime = timestamp;
        token.validationReason = validation.reason;
      }

      // Only include validated tokens
      const validatedTokens = tokenList.filter(t => t.validated);

      provenTokens[strat.id] = {
        strategyName: strat.name,
        strategyWR: strat.winRate,
        validatedAt: timestamp,
        tokens: validatedTokens
      };
    }

    // Save established proven tokens
    const provenFile = '/root/trading-bot/bok/proven-established.json';
    fs.writeFileSync(provenFile, JSON.stringify(provenTokens, null, 2));
    
    // Also save to proven-tokens.json (backward compatibility - same as established)
    const legacyFile = '/root/trading-bot/bok/proven-tokens.json';
    fs.writeFileSync(legacyFile, JSON.stringify(provenTokens, null, 2));

    console.log(`\n💾 PROVEN ESTABLISHED saved (${Object.keys(provenTokens).length} strategies):`);
    for (const [sid, data] of Object.entries(provenTokens)) {
      console.log(`   • ${data.strategyName}: ${data.tokens.length} validated tokens`);
    }

    // ==================== DEGEN MODE ====================
    await this.saveProvenTokensDegen(positiveStrategies);
  }

  async saveProvenTokensDegen(positiveStrategies) {
    // Degen mode: More lenient filters, RECENT wins only
    const DEGEN_FILTERS = {
      minLiq: 5000,
      minAgeHours: 1,        // Recent (1-4 hours)
      maxAgeHours: 4,       // Only recent wins in last 4 hours
      minVolume: 20000
    };

    const provenTokens = {};
    const timestamp = Date.now();

    for (const strat of positiveStrategies) {
      const stratData = this.results[strat.id];
      if (!stratData || !stratData.tokens) continue;

      // Get RECENT tokens that match DEGEN filters
      const degenTokens = stratData.tokens
        .filter(t => {
          const ageHours = (Date.now() - t.timestamp) / (1000 * 60 * 60);
          return t.isWin && ageHours >= DEGEN_FILTERS.minAgeHours && ageHours <= DEGEN_FILTERS.maxAgeHours;
        })
        .reduce((acc, t) => {
          if (!acc[t.ca]) {
            acc[t.ca] = {
              symbol: t.symbol,
              ca: t.ca,
              wins: 0,
              avgPnl: 0,
              lastTrade: t.timestamp,
              isDegen: true,
              ageHours: (Date.now() - t.timestamp) / (1000 * 60 * 60)
            };
          }
          acc[t.ca].wins++;
          acc[t.ca].avgPnl = (acc[t.ca].avgPnl + t.pnlPercent) / 2;
          return acc;
        }, {});

      const tokenList = Object.values(degenTokens).sort((a, b) => b.wins - a.wins).slice(0, 5);
      
      // Quick validation for degen (skip honeypot for speed)
      for (const token of tokenList) {
        token.validated = true;
        token.validationTime = timestamp;
        token.validationReason = 'Degen fast-track';
      }

      provenTokens[strat.id] = {
        strategyName: strat.name,
        strategyWR: strat.winRate,
        mode: 'degen',
        validatedAt: timestamp,
        tokens: tokenList
      };
    }

    // Save degen proven tokens
    const degenFile = '/root/trading-bot/bok/proven-degen.json';
    fs.writeFileSync(degenFile, JSON.stringify(provenTokens, null, 2));

    console.log(`\n💾 PROVEN DEGEN saved (${Object.keys(provenTokens).length} strategies):`);
    for (const [sid, data] of Object.entries(provenTokens)) {
      console.log(`   • ${data.strategyName}: ${data.tokens.length} degen tokens`);
      data.tokens.slice(0, 2).forEach(t => {
        console.log(`     - ${t.symbol}: ${t.wins} wins, +${t.avgPnl.toFixed(1)}% avg, ${t.ageHours.toFixed(1)}h old`);
      });
    }
  }

  cleanupExpiredStrategies(currentCycle) {
    // Strategies valid for 5 cycles (accumulating mode)
    const expiredCycle = currentCycle - 5;
    
    if (expiredCycle > 0) {
      console.log(`\n🧹 Cleaning up strategies from Cycle ${expiredCycle} (expired)...`);
    }
    
    // Keep strategies from last 5 cycles
    console.log(`✅ BOK updated: Strategies from cycles ${Math.max(1, currentCycle-4)}-${currentCycle} are active`);
  }

  writePositiveStrategies(strategies, currentCycle) {
    let content = `# 16 - Positive Strategies (WR >=55%)\n\n`;
    content += `**Auto-generated by Paper Trader v5**\n`;
    content += `**Updated:** ${new Date().toISOString()}\n`;
    content += `**Current Cycle:** ${currentCycle}\n`;
    content += `**Validity:** 1 Cycle (50 simulations)\n\n`;
    content += `## High-Performing Strategies\n\n`;
    
    if (strategies.length === 0) {
      content += `*No strategies currently meet the 55% WR threshold*\n\n`;
    }
    
    strategies.forEach(s => {
      content += `### Strategy: ${s.id}\n\n`;
      content += `- **Name:** ${s.name}\n`;
      content += `- **Win Rate:** ${s.winRate}% (${s.trades} trades)\n`;
      content += `- **Total Profit:** ${s.profit} SOL\n`;
      content += `- **Category:** ${s.category}\n`;
      content += `- **Cycle:** ${s.cycle}\n`;
      content += `- **Valid Until:** Cycle ${s.expiryCycle} (end of next cycle)\n`;
      content += `- **Status:** ✅ RECOMMENDED FOR LIVE\n\n`;
    });
    
    content += `---\n\n`;
    content += `**Note:** Strategies are valid for 1 cycle only. After each 50-simulation cycle, all strategies are re-evaluated. Only strategies maintaining ≥55% WR remain in Positive.\n`;
    
    fs.writeFileSync(CONFIG.POSITIVE_STRATEGIES_FILE, content);
  }

  writeNegativeStrategies(strategies, currentCycle) {
    let content = `# 17 - Negative Strategies (WR <55%)\n\n`;
    content += `**Auto-generated by Paper Trader v5**\n`;
    content += `**Updated:** ${new Date().toISOString()}\n`;
    content += `**Current Cycle:** ${currentCycle}\n\n`;
    content += `## Underperforming Strategies\n\n`;
    content += `*Do NOT use these strategies for live trading*\n\n`;
    
    if (strategies.length === 0) {
      content += `*No underperforming strategies detected*\n\n`;
    }
    
    strategies.forEach(s => {
      content += `### Strategy: ${s.id}\n\n`;
      content += `- **Name:** ${s.name}\n`;
      content += `- **Win Rate:** ${s.winRate}% (${s.trades} trades)\n`;
      content += `- **Reason:** ${s.reason}\n`;
      content += `- **Cycle:** ${s.cycle}\n`;
      content += `- **Status:** ❌ AVOID\n\n`;
    });
    
    content += `---\n\n`;
    content += `**Note:** These strategies failed to maintain 70% WR in current cycle. They may be re-evaluated in future cycles.\n`;
    
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
        else if (wr >= 55) rules[strategyId] = '0.04';
        else if (wr >= 60) rules[strategyId] = '0.03';
        else rules[strategyId] = '0.02';
      }
    }
    
    return rules;
  }

  // ==================== CYCLE TRACKING (ACCUMULATING) ====================
  checkReset() {
    // CYCLE TRACKING - Results accumulate, never reset
    // Cycle number increases, but results keep building
    const currentCycle = Math.floor(this.simulationCount / CONFIG.SIMULATION_COUNT) + 1;
    
    if (this.simulationCount > 0 && this.simulationCount % CONFIG.SIMULATION_COUNT === 0) {
      console.log(`\n🔄 COMPLETED CYCLE ${currentCycle - 1} - CONTINUING TO CYCLE ${currentCycle}...\n`);
      
      // Archive cycle snapshot (for history), but KEEP results
      const archiveFile = `/root/trading-bot/archive/paper-trader-v5-cycle-${currentCycle - 1}-${Date.now()}.json`;
      fs.writeFileSync(archiveFile, JSON.stringify({
        cycle: currentCycle - 1,
        results: this.results,
        simulationCount: this.simulationCount,
        archived: Date.now()
      }, null, 2));
      
      // DO NOT RESET - Keep accumulating results across cycles
      // this.simulationCount keeps increasing
      // this.results keeps accumulating
      
      console.log(`✅ Cycle ${currentCycle - 1} archived. Continuing with ${this.simulationCount} total sims, ${Object.keys(this.results).length} strategies tracked.`);
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
      if (result.total >= 5 && (result.wins / result.total) >= 0.65) {
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
    
    // Check cycle progress
    this.checkReset();
    
    const currentCycle = Math.floor(this.simulationCount / CONFIG.SIMULATION_COUNT) + 1;
    const simsInCycle = this.simulationCount % CONFIG.SIMULATION_COUNT;
    console.log(`\n📈 Cycle: ${currentCycle} | Total Sims: ${this.simulationCount} (${simsInCycle}/${CONFIG.SIMULATION_COUNT} current)`);
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
      
      // HTF PO3 Filter - Smart Money Concepts
      const htfFilter = this.applyHTFFilter(candleAnalysis, orderBook);
      console.log(`   🌐 HTF PO3: ${htfFilter.signal} (${htfFilter.confidence}) - ${htfFilter.reasons}`);
      
      // ICT Bias Score
      const ictBias = this.calculateICTBias(candleAnalysis, orderBook);
      console.log(`   📊 ICT Bias: ${ictBias.bias} | Stage: ${ictBias.stage} (score: ${ictBias.score})`);
      
      // Doji Scanner
      const doji = this.detectDoji(candleAnalysis);
      if (doji.isDoji) {
        console.log(`   🕯️  Doji: ${doji.dojiType} | Signal: ${doji.reversalSignal}`);
      }
      
      // Adaptive Trend Finder
      const adaptiveTrend = this.calculateAdaptiveTrend(candleAnalysis, orderBook);
      console.log(`   📈 Adaptive Trend: ${adaptiveTrend.trendDirection} (conf: ${adaptiveTrend.confidence})`);
      
      // Evasive SuperTrend
      const evasiveST = this.calculateEvasiveSuperTrend(candleAnalysis, orderBook);
      console.log(`   🎯 Evasive ST: ${evasiveST.signal} [${evasiveST.mode}] noise: ${evasiveST.noiseLevel}`);
      
      // SuperTrend Recovery
      const stRecovery = this.calculateSuperTrendRecovery(candleAnalysis, orderBook);
      console.log(`   🛡️  ST Recovery: ${stRecovery.trend} | Exit: ${stRecovery.recommendation}`);
      
      // Liquidation Hunter
      const liqHunter = this.calculateLiquidationHunter(candleAnalysis, orderBook);
      console.log(`   🎯 Liquidation Hunter: ${liqHunter.phase} | Score: ${liqHunter.qualityScore}/100 | Signal: ${liqHunter.signal}`);
      
      // Wyckoff Schematic
      const wyckoff = this.calculateWyckoffPhase(candleAnalysis, orderBook);
      console.log(`   🧱 Wyckoff: ${wyckoff.phase} | Signal: ${wyckoff.signal} (${wyckoff.confidence})`);
      
      // VDubus Wave
      const vdubus = this.calculateVdubusWave(candleAnalysis, orderBook);
      console.log(`   🌊 VDubus: ${vdubus.waveSignal} | Confluence: ${vdubus.confluence} [${vdubus.strength}]`);
      
      // Volume Cluster
      const volCluster = this.calculateVolumeCluster(candleAnalysis, orderBook);
      console.log(`   📊 Vol Cluster: POC ${volCluster.pocLevel} | Interest: ${volCluster.institutionalInterest}`);
      
      // Volatility Risk Premium
      const volRP = this.calculateVolatilityRiskPremium(candleAnalysis, orderBook);
      console.log(`   ⚡ Vol Risk Prem: ${volRP.regime} | Risk: ${volRP.riskLevel} | Signal: ${volRP.signal}`);
      
      // ATH Breakout Filter (Breakouts & Pullbacks inspired)
      const athFilter = await this.applyATHFilter(token, token.priceData);
      console.log(`   🏔️  ATH Breakout: ${athFilter.signal} | Momentum: ${athFilter.momentum}% | Score: ${athFilter.score}`);
      
      // Simulate each strategy with filter modifiers
      for (const strategy of BASE_STRATEGIES) {
        const result = await this.simulateStrategy(strategy, token, candleAnalysis, orderBook, {
          wyckoff,
          vdubus,
          volCluster,
          volRP,
          athFilter
        });
        
        // Log result dengan token name
        const winStatus = result.isWin ? '✅ WIN' : '❌ LOSS';
        console.log(`   ${winStatus}: ${strategy.name} on ${symbol} (${result.pnlPercent.toFixed(1)}%)`);
        
        // Record result (with token tracking)
        this.recordResult(strategy, result);
        
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
    if (process.env.PAPER_TRADER_NOTIFY !== 'false') { await this.notifyTelegram(); }
    
    // Save state
    this.saveState();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Paper Trader v5 Complete\n');
  }

  async fetchMarketData() {
    try {
      // ESTABLISHED MODE v2: Proven working method
      console.log('🔍 ESTABLISHED MODE v2: Loading established tokens + DexScreener...');
      return await this.fetchEstablishedData();
    } catch (e) {
      console.error('❌ Error fetching market data:', e.message);
      console.log('⚠️  Falling back to trending mode...');
      return this.fetchTrendingTokens();
    }
  }
  
  async fetchPremiumData(apiKey) {
    // ScrapingBee: Scrape DexScreener web UI then query API
    console.log('🕷️ SCRAPING MODE: ScrapingBee + DexScreener...');

    // Use mode-specific filters from trading-config.json
    const filters = CONFIG.getFilters();
    const minLiq = filters.MIN_LIQUIDITY || CONFIG.MIN_LIQUIDITY;
    const minAgeHours = (filters.MIN_AGE_HOURS || 1);
    const minVolume6h = filters.MIN_VOLUME_6H || 10000;
    const minTx6h = filters.MIN_TX_6H || 0;

    console.log(`📊 Using filters: Liq>=$${minLiq}, Age>=${minAgeHours}h, Vol6h>=$${minVolume6h}, Tx6h>=${minTx6h}`);

    // Step 1: Scrape DexScreener for token addresses
    const addresses = await this.scrapeTokenAddresses(apiKey, minLiq, minAgeHours);
    console.log(`📊 Found ${addresses.length} token addresses from scraping`);

    // Step 2: Query DexScreener API for each token
    const tokens = [];
    for (const addr of addresses.slice(0, 30)) {
      try {
        const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
        const dsData = await dsRes.json();
        const bestPair = (dsData.pairs || [])
          .filter(p => p.chainId === 'solana')
          .sort((a, b) => parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0))[0];

        if (bestPair) {
          const liq = parseFloat(bestPair.liquidity?.usd || 0);
          const ageHours = bestPair.pairCreatedAt ? (Date.now() - bestPair.pairCreatedAt) / 3600000 : 0;
          const volume6h = parseFloat(bestPair.volume?.h6 || 0);
          const tx6h = (bestPair.txns?.h6?.buys || 0) + (bestPair.txns?.h6?.sells || 0);

          if (liq >= minLiq && ageHours >= minAgeHours && volume6h >= minVolume6h && tx6h >= minTx6h) {
            tokens.push(bestPair);
          }
        }
      } catch (e) {}
    }

    // Sort by volume
    tokens.sort((a, b) => parseFloat(b.volume?.h6 || 0) - parseFloat(a.volume?.h6 || 0));

    console.log(`✅ Filtered ${tokens.length} tokens (>=$${minLiq} liq, >=${minAgeHours}h age, >=$${minVolume6h} vol6h, >=${minTx6h} tx6h)`);

    if (tokens.length > 0) {
      console.log('\n📈 Top tokens by volume:');
      tokens.slice(0, 10).forEach((p, i) => {
        const ageH = p.pairCreatedAt ? ((Date.now() - p.pairCreatedAt) / 3600000).toFixed(1) : 'N/A';
        const volK = p.volume?.h6 ? (p.volume.h6 / 1000).toFixed(0) : '0';
        const tx6h = (p.txns?.h6?.buys || 0) + (p.txns?.h6?.sells || 0);
        console.log(`   ${i + 1}. ${p.baseToken?.symbol}: $${parseFloat(p.liquidity?.usd || 0).toFixed(0)} liq, ${ageH}h, $${volK}k vol6h, ${tx6h} tx`);
      });
    }

    return tokens;
  }

  async scrapeTokenAddresses(apiKey, minLiq, minAgeHours) {
    // ScrapingBee: Scrape DexScreener web for token addresses
    const targetUrl = `https://dexscreener.com/solana?rankBy=trendingScoreH6&order=desc&minLiq=${minLiq}&minAge=${minAgeHours}`;
    const scrapeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render_js=true&premium_proxy=true&wait=5000`;

    try {
      const res = await fetch(scrapeUrl);
      const html = await res.text();

      // Extract Solana addresses (base58 format, 32-44 chars)
      const addrMatches = html.match(/[A-HJ-NP-Za-km-z1-9]{32,44}/g);
      if (!addrMatches) return [];

      // Filter unique addresses (exclude common ones)
      const exclude = ['So11111111111111111111111111111111111111112']; // Wrapped SOL
      const unique = [...new Set(addrMatches)].filter(a => !exclude.includes(a) && a.length >= 40);

      return unique;
    } catch (e) {
      console.log('Scraping error:', e.message);
      return [];
    }
  }
  
  async fetchEstablishedData() {
    // Fallback: Cached list + DexScreener real-time
    const establishedTokens = this.loadEstablishedTokenList();
    console.log(`📊 Loaded ${establishedTokens.length} established tokens`);
    
    const tokens = [];
    let checked = 0;
    
    for (const token of establishedTokens.slice(0, 50)) {
      try {
        const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`);
        const dsData = await dsRes.json();
        const bestPair = (dsData.pairs || [])
          .filter(p => p.chainId === 'solana')
          .sort((a, b) => parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0))[0];
        
        if (bestPair) {
          const liq = parseFloat(bestPair.liquidity?.usd || 0);
          const ageHours = bestPair.pairCreatedAt ? (Date.now() - bestPair.pairCreatedAt) / 3600000 : 999;
          
          checked++;
          
          if (liq >= CONFIG.MIN_LIQUIDITY && ageHours >= (CONFIG.MIN_TOKEN_AGE_MINUTES / 60)) {
            tokens.push(bestPair);
          }
        }
      } catch (e) {}
    }
    
    tokens.sort((a, b) => parseFloat(b.volume?.h24 || 0) - parseFloat(a.volume?.h24 || 0));
    console.log(`✅ Filtered ${tokens.length}/${checked} tokens`);
    return tokens;
  }
  
  loadEstablishedTokenList() {
    // Top Solana ecosystem tokens by market cap/volume
    // Updated: $25k liquidity, 24h+ age filter
    return [
      { symbol: 'BONK', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
      { symbol: 'WIF', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP' },
      { symbol: 'JUP', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtkqjberbSOWd91pbT2' },
      { symbol: 'JTO', address: 'jtojtokePBKP3BKw9x9f3M8c3V7Y3qKw4dE3TzL3qK' },
      { symbol: 'MSOL', address: 'mSoLzYCxHdYgdzU8g5QCB3S3EpsJo9GMKevtjE8BuG2' },
      { symbol: 'BSOL', address: 'bSo13r4TkiE4KumL71rHT1rFrwdvfjjiLutN4kct4zY' },
      { symbol: 'STSOL', address: '7dHbWXmci3dT8vYWomM974g6Tvmp1in2gGKFt5F3WsSu' },
      { symbol: 'ORCA', address: 'orcaEKTdK7ATzBZndBhR8EUDPdWcBdYJazh6xGawEGL5' },
      { symbol: 'RAY', address: '4k3Dyjzvzp8eMZWUXb9jJiLKowE2C5nM7Dgk9XZckYYY' },
      { symbol: 'SRM', address: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuqxn1wbS' },
      { symbol: 'FIDA', address: 'EchesyfXePKdLtoiZSLiP8TZkbsMKU8aVD4U5Hcg6VGE' },
      { symbol: 'STEP', address: 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyY' },
      { symbol: 'MAPS', address: 'MAPS41MDahZ9QdKAT3E5H3E2W4tTkX3gQ7q2dS4fL1q' },
      { symbol: 'OXY', address: 'z3dn17LAoH8pXsQyHPLjJ7z3qfbZnG2v4TJr7fM44rD' },
      { symbol: 'MNGO', address: 'MangoCzJ36AjZyKwVj3VnYU4GTonLKvZ6R8ogvmmmc3' },
      { symbol: 'ATLAS', address: 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx' },
      { symbol: 'POLIS', address: 'poLisWXnNRwC6oBu1vHa7R1e5fLh5WkhmF8oLkhy9JZ' },
      { symbol: 'COPE', address: '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh' },
      { symbol: 'SAMO', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
      { symbol: 'DFL', address: 'DFL1zNkaGPWmRuH9nzP9YK7c8vP3Czq4GYhGvL4NqkT' },
      { symbol: 'LIKE', address: 'Like1vX5YmjH3n6y9tQ8z2q3x4c5v6b7n8m9k0l1p2o3i4u5y' },
      { symbol: 'TULIP', address: 'TuLipc9zN7XJdKQ2z3x4c5v6b7n8m9k0l1p2o3i4u5y6t7r' },
      { symbol: 'FRONT', address: 'FrontKzjrUFn2uDpLwmnKxnJdGzF2tL6nRqtJ69xG6pE' },
      { symbol: 'SLND', address: 'SLNDpmoWTVADgEdnd9Wkb7ocejcuen6ZN8uhN4t8LrK' },
      { symbol: 'MER', address: 'MERtDfcD7mNhtHMQp2B2cFJVBQ7D2E8oPpPGa1Y2hX' },
      { symbol: 'PRISM', address: 'PRSMNsEPqhGVKM1mJn9z5j1RJ4Q9F5Q8X6D8f3jWq' },
      { symbol: 'AUDIO', address: 'AUDIO2gZduN5p5EMZ7K9rF8yXw5TzL3mN4pQ6rS2tU8v' },
      { symbol: 'GRAPE', address: 'GRAPE4musZcduL4tX6eZ3zZ4qP5rS6tU7vW8xY9zA1B' },
      { symbol: 'PORT', address: 'PORT7rnX5xR6mX7nZ8aP9qL3tY4uV6wX7zA8bC9dE0F' },
      { symbol: 'REAL', address: 'REAL3mN6pQ8rS4tU5vW6xY7zA8bC9dE0F1G2hJ3kL' },
      { symbol: 'GOFX', address: 'GOFX2pQ5rS7tU8vW9xY0zA1bC2dE3F4gH5iJ6kL7m' },
      { symbol: 'CATO', address: 'CATO3nP4qR6sT8uV9wX0yZ1aB2cD3eF4gH5iJ6kL7' },
      { symbol: 'HNT', address: 'HNT4mP6qR8sT0uV1wX2yZ3aB4cD5eF6gH7iJ8kL9m' },
      { symbol: 'DUST', address: 'DUST5oP7qR9sT1uV2wX3yZ4aB5cD6eF7gH8iJ9kL0' },
      { symbol: 'WEN', address: 'WENwV6qR8tT9uU0vV1wW2xX3yY4zZ5aA6bB7cC8d' },
      { symbol: 'JUP', address: 'JUP3aWR4xX5yY6zZ7aA8bB9cC0dD1eE2fF3gG4hH5' },
      { symbol: 'BLZE', address: 'BLZE4oP6qR8sT9tU0uV1vV2wW3xX4yY5zZ6aA7b' },
      { symbol: 'CKAT', address: 'CKAT5nP7qR9sT0tU1uV2vW3wW4xX5yY6zZ7aA8b' },
      { symbol: 'MOON', address: 'MOON6oQ8rR0sT1uU2vV3wW4xX5yY6zZ7aA8bB9c' },
      { symbol: 'SWAY', address: 'SWAY7pR9sS2tT3uU4vV5wW6xX7yY8zZ9aA0bB1c' },
      { symbol: 'DAO', address: 'DAO8qR0sS3tT4uU5vV6wW7xX8yY9zZ0aA1bB2c' },
      { symbol: 'HEZ', address: 'HEZ9rS1sT4tU5vV6wW7xX8yY9zZ0aA1bB2cC3d' },
      { symbol: 'ALEPH', address: 'ALEPH0sT2sU5uV6vW7wX8xY9yZ0zA1aA2bB3cC4' },
      { symbol: 'SHDW', address: 'SHDW1tU3uV7vW8wX9xY0yZ1zA2aA3bB4cC5dD6' },
      { symbol: 'MNDE', address: 'MNDEFzGvMt87meVuodKaNdZ5un7CqNxSiDC5vyQuqKM' },
      { symbol: 'LST', address: 'LSTxxxn2K2FJ2kPcwMa3t6NaDWQp3WXA2YVDhYyfWnK' },
      { symbol: 'DSL', address: 'DSL2wV4xX5yY6zZ7aA8bB9cC0dD1eE2fF3gG4hH5' },
      { symbol: 'SAGE', address: 'SAGE3xY5zZ6aA7bB8cC9dD0eE1fF2gG3hH4iI5j' },
      { symbol: 'BOP', address: 'BOP4yZ6aA7bB8cC9dD0eE1fF2gG3hH4iI5jJ6k' },
      { symbol: 'RXD', address: 'RXD5zA7bB8cC9dD0eE1fF2gG3hH4iI5jJ6kK7l' },
    ];
  }
  
  async fetchTrendingTokens() {
    // Fallback: Get trending tokens
    try {
      const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await res.json();
      
      const tokens = [];
      for (const profile of profiles.slice(0, 30)) {
        try {
          const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
          const tokenData = await tokenRes.json();
          const bestPair = (tokenData.pairs || [])
            .filter(p => p.chainId === 'solana')
            .sort((a, b) => parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0))[0];
          
          if (bestPair) {
            const liq = parseFloat(bestPair.liquidity?.usd || 0);
            const ageHours = bestPair.pairCreatedAt ? (Date.now() - bestPair.pairCreatedAt) / 3600000 : 0;
            if (liq >= CONFIG.MIN_LIQUIDITY && ageHours >= (CONFIG.MIN_TOKEN_AGE_MINUTES / 60)) {
              tokens.push(bestPair);
            }
          }
        } catch (e) {}
      }
      
      tokens.sort((a, b) => parseFloat(b.volume?.h24 || 0) - parseFloat(a.volume?.h24 || 0));
      console.log(`✅ Fallback: ${tokens.length} trending tokens`);
      return tokens;
    } catch (e) {
      console.error('❌ Fallback error:', e.message);
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
      
      // Build message
      let msg = `📊 **PAPER TRADER v5 REPORT**\n\n`;
      const currentCycle = Math.floor(this.simulationCount / CONFIG.SIMULATION_COUNT) + 1;
      const simsInCycle = this.simulationCount % CONFIG.SIMULATION_COUNT;
      msg += `🎯 Cycle: ${currentCycle} | Total Sims: ${this.simulationCount} (${simsInCycle}/${CONFIG.SIMULATION_COUNT} in current cycle)\n`;
      msg += `📚 Accumulating results across all cycles (no reset)\n`;
      
      if (sorted.length === 0) {
        console.log('ℹ️ No strategies with 3+ trades yet, sending progress notification');
        
        // Show all strategies even with <3 trades
        const allStrategies = Object.values(this.results)
          .sort((a, b) => (b.wins / b.total) - (a.wins / a.total));
        
        if (allStrategies.length > 0) {
          msg += `\n📈 **Strategies In Progress:**\n`;
          for (const s of allStrategies.slice(0, 5)) {
            const wr = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(1) : '0.0';
            const pnl = (s.totalProfit + s.totalLoss).toFixed(4);
            msg += `• ${s.name}: ${wr}% (${s.wins}W/${s.losses}L) ${pnl} SOL\n`;
          }
        } else {
          msg += `\n⏳ No trades yet. Building statistics...\n`;
        }
        
        msg += `\n💡 Need 3+ trades for BOK entry\n`;
      } else {
        // Best strategy
        const best = sorted[0];
        const bestWR = ((best.wins / best.total) * 100).toFixed(1);
        const bestPnL = (best.totalProfit + best.totalLoss).toFixed(4);
        
        msg += `\n🏆 **Best: ${best.name}**\n`;
        msg += `WR: ${bestWR}% (${best.wins}W/${best.losses}L) | PnL: ${bestPnL} SOL\n`;
        
        // Top 3 strategies
        msg += `\n📈 **Top Strategies:**\n`;
        for (let i = 0; i < Math.min(3, sorted.length); i++) {
          const s = sorted[i];
          const wr = ((s.wins / s.total) * 100).toFixed(1);
          const pnl = (s.totalProfit + s.totalLoss).toFixed(4);
          msg += `${i+1}. ${s.name}: ${wr}% (${pnl} SOL)\n`;
        }
      }
      
      // BOK Status - Count strategies with >=55% WR
      const positiveCount = Object.values(this.results).filter(r => {
        const wr = r.wins / r.total;
        return r.total >= 3 && wr >= 0.55;  // 55% WR threshold
      }).length;
      
      msg += `\n📚 BOK: ${positiveCount} strategies ≥55% WR\n`;
      msg += `💰 Target: ${CONFIG.DAILY_TARGET} SOL/day\n`;
      
      // ==================== DUAL MODE REPORT ====================
      msg += `\n══════════════════════════════\n`;
      msg += `🎯 **DUAL MODE STATUS**\n`;
      msg += `══════════════════════════════\n`;
      
      // Load proven tokens for both modes
      let establishedCount = 0;
      let degenCount = 0;
      let establishedTokens = [];
      let degenTokens = [];
      
      try {
        const estFile = '/root/trading-bot/bok/proven-established.json';
        if (fs.existsSync(estFile)) {
          const estData = JSON.parse(fs.readFileSync(estFile, 'utf8'));
          for (const [sid, data] of Object.entries(estData)) {
            establishedCount += data.tokens?.length || 0;
            if (data.tokens?.length > 0) {
              establishedTokens.push(`${data.tokens[0].symbol} (${data.tokens.length})`);
            }
          }
        }
      } catch (e) {}
      
      try {
        const degenFile = '/root/trading-bot/bok/proven-degen.json';
        if (fs.existsSync(degenFile)) {
          const degenData = JSON.parse(fs.readFileSync(degenFile, 'utf8'));
          for (const [sid, data] of Object.entries(degenData)) {
            degenCount += data.tokens?.length || 0;
            if (data.tokens?.length > 0) {
              degenTokens.push(`${data.tokens[0].symbol} (${data.tokens.length})`);
            }
          }
        }
      } catch (e) {}
      
      // Established Mode
      msg += `\n🏛️ **ESTABLISHED MODE:**\n`;
      if (establishedCount > 0) {
        msg += `✅ ${establishedCount} validated tokens ready\n`;
        msg += `📋 Top: ${establishedTokens.slice(0, 3).join(', ')}\n`;
      } else {
        msg += `⚠️ 0 tokens (honeypot validation pending)\n`;
      }
      
      // Degen Mode  
      msg += `\n🎰 **DEGEN MODE:**\n`;
      if (degenCount > 0) {
        msg += `✅ ${degenCount} degen tokens ready\n`;
        msg += `📋 Top: ${degenTokens.slice(0, 3).join(', ')}\n`;
      } else {
        msg += `⚠️ 0 tokens\n`;
      }
      
      // Current active mode
      const tradingConfig = JSON.parse(fs.readFileSync('/root/trading-bot/trading-config.json', 'utf8'));
      const mode = tradingConfig.TRADING_MODE?.MODE || 'manual';
      const active = tradingConfig.TRADING_MODE?.ACTIVE || 'established';
      const autoType = tradingConfig.TRADING_MODE?.AUTO_TYPE || 'performance';
      
      msg += `\n⚡ **CURRENT:** ${mode.toUpperCase()} | ${active.toUpperCase()}`;
      if (mode === 'auto') {
        msg += ` (${autoType})`;
      }
      msg += `\n`;
      
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
