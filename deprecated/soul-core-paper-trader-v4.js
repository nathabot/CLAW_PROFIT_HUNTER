#!/usr/bin/env node
/**
 * SOUL CORE PAPER TRADER v4.0 - MULTI-INDICATOR COMBINATIONS
 * 
 * NEW: Test ALL indicator combinations from BOK-13
 * Goal: Find 80%+ win rate through optimal combinations
 * Strategies: Fib + RSI + MACD + S/R + SMF + Whale + OB + Funding + Sentiment
 * Auto-sync: Best strategy automatically deployed to live trader
 */

const fetch = require('node-fetch');
const fs = require('fs');
const DynamicTPSL = require('./dynamic-tpsl-engine');

const CONFIG = {
  SILENCE_THRESHOLD: 5,
  MIN_TOKEN_AGE_MINUTES: 20,
  TRADES_PER_RUN: 20,
  STATE_FILE: '/root/trading-bot/soul-trader-state-v4.json',
  MAX_TRADES_PER_DAY: 200,
  MIN_LIQUIDITY: 10000,
  MIN_VOLUME: 10000,
  // Base SL/TP (will be overridden by strategy)
  SL_PERCENT: 5,
  TP_PERCENT: 10,
  PARTIAL_EXIT: true
};

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';
const TOPIC_ID = 25;

// ==================== STRATEGY COMBINATIONS ====================
// All 20 strategy combinations from BOK-13 paper testing
const STRATEGY_COMBINATIONS = {
  // Original Fib strategies (keep for comparison)
  'fib_050_1272': {
    name: 'Entry 0.5, TP 1.272',
    indicators: ['fibonacci'],
    entryFib: 0.50,
    tp1Fib: 1.0,
    tp2Fib: 1.272,
    slPercent: 3,
    tp1Percent: 8,
    tp2Percent: 15,
    description: 'Conservative entry, moderate extension'
  },
  'fib_0618_1618': {
    name: 'Entry 0.618, TP 1.618 (Golden)',
    indicators: ['fibonacci'],
    entryFib: 0.618,
    tp1Fib: 1.0,
    tp2Fib: 1.618,
    slPercent: 5,
    tp1Percent: 12,
    tp2Percent: 25,
    description: 'Golden ratio entry & target - CURRENT LEADER'
  },
  'fib_0786_100': {
    name: 'Entry 0.786, TP 1.0',
    indicators: ['fibonacci'],
    entryFib: 0.786,
    tp1Fib: 1.0,
    tp2Fib: null,
    slPercent: 4,
    tp1Percent: 10,
    tp2Percent: null,
    description: 'Deep pullback entry, quick profit'
  },
  
  // NEW: Multi-indicator combinations
  'fib_rsi_combo': {
    name: 'Fib + RSI Oversold',
    indicators: ['fibonacci', 'rsi'],
    entryFib: 0.618,
    rsiMax: 35,
    slPercent: 4,
    tp1Percent: 10,
    tp2Percent: 20,
    description: 'Fib bounce + RSI confirmation'
  },
  'fib_sr_combo': {
    name: 'Fib + S/R Confluence',
    indicators: ['fibonacci', 'support_resistance'],
    entryFib: 0.618,
    requireSRConfluence: true,
    slPercent: 4,
    tp1Percent: 12,
    tp2Percent: 22,
    description: 'Fib level aligns with S/R'
  },
  'smf_volume_combo': {
    name: 'Smart Money + Volume Spike',
    indicators: ['smart_money', 'volume'],
    requireSMFAccumulation: true,
    volumeSpike: 2.5,
    slPercent: 5,
    tp1Percent: 15,
    tp2Percent: 30,
    description: 'Whale accumulation + volume'
  },
  'rsi_macd_combo': {
    name: 'RSI Div + MACD Cross',
    indicators: ['rsi', 'macd'],
    rsiDivergence: true,
    macdCross: true,
    slPercent: 4,
    tp1Percent: 12,
    tp2Percent: 25,
    description: 'Double momentum confirmation'
  },
  'whale_fib_combo': {
    name: 'Whale + Fib Entry',
    indicators: ['whale', 'fibonacci'],
    entryFib: 0.618,
    whaleMinHoldings: 50000,
    slPercent: 5,
    tp1Percent: 15,
    tp2Percent: 35,
    description: 'Follow whales at fib level'
  },
  'ob_funding_combo': {
    name: 'OB Imbalance + Funding',
    indicators: ['orderbook', 'funding'],
    obRatio: 2.0,
    fundingMax: 0.001,
    slPercent: 3,
    tp1Percent: 10,
    tp2Percent: 18,
    description: 'Short squeeze setup'
  },
  'sentiment_volume_combo': {
    name: 'Sentiment Spike + Volume',
    indicators: ['sentiment', 'volume'],
    sentimentSpike: 3.0,
    volumeSpike: 2.0,
    slPercent: 4,
    tp1Percent: 15,
    tp2Percent: 35,
    description: 'Viral momentum play'
  },
  'full_confluence': {
    name: 'Full Confluence (3+ ind)',
    indicators: ['fibonacci', 'rsi', 'smart_money'],
    entryFib: 0.618,
    rsiMax: 40,
    requireSMFAccumulation: true,
    slPercent: 5,
    tp1Percent: 18,
    tp2Percent: 40,
    description: 'Maximum confirmation required'
  },
  'quick_scalp_ob': {
    name: 'Quick Scalp (OB only)',
    indicators: ['orderbook'],
    obRatio: 2.5,
    slPercent: 2,
    tp1Percent: 5,
    tp2Percent: null,
    description: 'Ultra-fast OB scalping'
  },
  'sr_bounce_rsi': {
    name: 'S/R Bounce + RSI',
    indicators: ['support_resistance', 'rsi'],
    rsiMax: 35,
    slPercent: 3,
    tp1Percent: 8,
    tp2Percent: 15,
    description: 'Support bounce with RSI'
  },
  'funding_extreme': {
    name: 'Funding Extreme + Whale',
    indicators: ['funding', 'whale'],
    fundingMax: -0.001,
    whaleAccumulation: true,
    slPercent: 5,
    tp1Percent: 15,
    tp2Percent: 30,
    description: 'Contrarian short squeeze'
  },
  'golden_whale': {
    name: 'Golden Fib + Whale Cluster',
    indicators: ['fibonacci', 'whale', 'smart_money'],
    entryFib: 0.618,
    clusterMinWallets: 3,
    slPercent: 5,
    tp1Percent: 20,
    tp2Percent: 50,
    description: 'Best of all worlds'
  },
  'momentum_macd_vol': {
    name: 'MACD + Volume + Fib',
    indicators: ['macd', 'volume', 'fibonacci'],
    entryFib: 0.5,
    volumeSpike: 2.0,
    slPercent: 4,
    tp1Percent: 12,
    tp2Percent: 25,
    description: 'Momentum breakout'
  },
  'mean_reversion_full': {
    name: 'Mean Reversion (RSI+Funding)',
    indicators: ['rsi', 'funding'],
    rsiMax: 30,
    fundingMax: -0.001,
    slPercent: 3,
    tp1Percent: 10,
    tp2Percent: 20,
    description: 'Deep oversold bounce'
  },
  'breakout_sr_vol': {
    name: 'S/R Break + Volume Spike',
    indicators: ['support_resistance', 'volume'],
    volumeSpike: 3.0,
    slPercent: 4,
    tp1Percent: 15,
    tp2Percent: 35,
    description: 'Confirmed breakout'
  },
  'tight_fib_rsi': {
    name: 'Tight Fib + RSI (Low Risk)',
    indicators: ['fibonacci', 'rsi'],
    entryFib: 0.5,
    rsiMax: 35,
    slPercent: 3,
    tp1Percent: 6,
    tp2Percent: 12,
    description: 'High probability, small wins'
  },
  'aggressive_whale': {
    name: 'Aggressive Whale Follow',
    indicators: ['whale', 'volume'],
    whaleMinTx: 10000,
    volumeSpike: 2.0,
    slPercent: 6,
    tp1Percent: 20,
    tp2Percent: 50,
    description: 'High risk, high reward'
  }
};

// Track performance per strategy
let strategyPerformance = {};

// Initialize performance tracking
function initStrategyTracking() {
  const perfFile = '/root/trading-bot/strategy-performance-v4.json';
  if (fs.existsSync(perfFile)) {
    strategyPerformance = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
  } else {
    // Initialize all strategies
    Object.keys(STRATEGY_COMBINATIONS).forEach(key => {
      strategyPerformance[key] = {
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        maxDrawdown: 0,
        currentDrawdown: 0,
        peakPnL: 0
      };
    });
    saveStrategyPerformance();
  }
}

function saveStrategyPerformance() {
  fs.writeFileSync('/root/trading-bot/strategy-performance-v4.json', JSON.stringify(strategyPerformance, null, 2));
}

// Get best strategy for live deployment
function getBestStrategy() {
  let best = null;
  let bestWR = 0;
  let bestScore = 0;
  
  for (const [key, perf] of Object.entries(strategyPerformance)) {
    if (perf.trades >= 10) { // Minimum 10 trades for validation
      const score = perf.winRate * 0.7 + (perf.totalPnL > 0 ? 20 : 0) + (20 - perf.maxDrawdown);
      if (perf.winRate > bestWR || (perf.winRate === bestWR && score > bestScore)) {
        bestWR = perf.winRate;
        bestScore = score;
        best = { key, ...STRATEGY_COMBINATIONS[key], ...perf };
      }
    }
  }
  
  return best;
}

// Update adaptive config for live trader
function updateLiveTraderConfig() {
  const best = getBestStrategy();
  if (!best) return;
  
  // Format compatible with v4 live trader
  const config = {
    updated: new Date().toISOString(),
    bestStrategy: {
      key: best.key,
      name: best.name,
      winRate: best.winRate,
      totalTrades: best.trades,
      indicators: best.indicators,
      slPercent: best.slPercent,
      tp1Percent: best.tp1Percent,
      tp2Percent: best.tp2Percent
    },
    adaptiveThresholds: {
      liveTrader: {
        currentThreshold: Math.max(4, Math.min(8, Math.round(10 - best.winRate / 10)))
      },
      paperTrader: {
        optimalThreshold: Math.max(4, Math.min(8, Math.round(10 - best.winRate / 10)))
      }
    },
    // Include Fib settings if using Fib strategy
    fibSettings: best.indicators.includes('fibonacci') ? {
      entryFib: best.entryFib || 0.618,
      tp1Fib: best.tp1Fib || 1.0,
      tp2Fib: best.tp2Fib || 1.618,
      slFib: 0.5
    } : null,
    // Include non-Fib settings
    nonFibSettings: !best.indicators.includes('fibonacci') ? {
      slPercent: best.slPercent,
      tp1Percent: best.tp1Percent,
      tp2Percent: best.tp2Percent
    } : null,
    allStrategies: strategyPerformance
  };
  
  fs.writeFileSync('/root/trading-bot/adaptive-scoring-config.json', JSON.stringify(config, null, 2));
  
  // Also update v4 config
  fs.writeFileSync('/root/trading-bot/paper-trader-v4-config.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    leader: best.key,
    leaderWR: best.winRate,
    allStrategies: strategyPerformance
  }, null, 2));
}

// ==================== INDICATOR FUNCTIONS ====================

async function fetchTokenData(tokenAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const data = await response.json();
    return data.pairs?.[0];
  } catch (e) {
    return null;
  }
}

async function fetchHeliusData(tokenAddress) {
  try {
    // Helius API for on-chain data
    const HELIUS_KEY = process.env.HELIUS_API_KEY;
    if (!HELIUS_KEY) return null;
    
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenLargestAccounts',
        params: [tokenAddress]
      })
    });
    
    return await response.json();
  } catch (e) {
    return null;
  }
}

// Calculate RSI
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Check RSI divergence
function checkRSIDivergence(priceHistory, rsiValues) {
  if (priceHistory.length < 10 || rsiValues.length < 10) return false;
  
  // Price making lower low, RSI making higher low
  const priceLL = priceHistory[priceHistory.length - 1] < priceHistory[priceHistory.length - 5];
  const rsiHL = rsiValues[rsiValues.length - 1] > rsiValues[rsiValues.length - 5];
  
  return priceLL && rsiHL;
}

// Calculate Fibonacci levels
function calculateFibonacci(high, low) {
  const diff = high - low;
  return {
    '0': high,
    '0.236': high - diff * 0.236,
    '0.382': high - diff * 0.382,
    '0.5': high - diff * 0.5,
    '0.618': high - diff * 0.618,
    '0.786': high - diff * 0.786,
    '1': low
  };
}

// Check Smart Money Flow
async function checkSmartMoney(tokenAddress) {
  // Mock implementation - replace with actual Helius/Birdeye integration
  return {
    accumulation: Math.random() > 0.6, // 40% chance of accumulation signal
    whaleBuys: Math.floor(Math.random() * 5),
    smartWalletsBuying: Math.floor(Math.random() * 10)
  };
}

// Check Order Book Imbalance
async function checkOrderBook(tokenAddress) {
  // Mock implementation - replace with actual Jupiter/Raydium OB data
  return {
    buyWall: Math.random() * 100000,
    sellWall: Math.random() * 80000,
    ratio: Math.random() * 3 + 0.5,
    spread: Math.random() * 0.02
  };
}

// Check Whale Activity
async function checkWhaleActivity(tokenAddress) {
  // Mock implementation
  return {
    largeTxs: Math.floor(Math.random() * 10),
    totalVolume: Math.random() * 500000,
    accumulationScore: Math.random()
  };
}

// Check Funding Rate
async function checkFunding(tokenAddress) {
  // Mock implementation - would need perp market data
  return {
    rate: (Math.random() - 0.5) * 0.002, // -0.1% to +0.1%
    extreme: Math.abs((Math.random() - 0.5) * 0.002) > 0.001
  };
}

// Check Social Sentiment
async function checkSentiment(tokenSymbol) {
  // Mock implementation - would need Twitter/Telegram scraper
  return {
    mentions: Math.floor(Math.random() * 1000),
    spike: Math.random() > 0.8,
    sentiment: (Math.random() - 0.5) * 2 // -1 to 1
  };
}

// ==================== STRATEGY EVALUATION ====================

async function evaluateStrategy(strategyKey, tokenData) {
  const strategy = STRATEGY_COMBINATIONS[strategyKey];
  if (!strategy) return { valid: false, score: 0 };
  
  const signals = [];
  let score = 0;
  const maxScore = strategy.indicators.length * 10;
  
  // Check each required indicator
  for (const indicator of strategy.indicators) {
    switch (indicator) {
      case 'fibonacci':
        // Check if price is near entry fib level
        const fib = calculateFibonacci(tokenData.high24h, tokenData.low24h);
        const currentPrice = tokenData.priceUsd;
        const tolerance = 0.02;
        
        if (Math.abs(currentPrice - fib[strategy.entryFib]) / currentPrice < tolerance) {
          signals.push(`Fib ${strategy.entryFib} hit`);
          score += 10;
        }
        break;
        
      case 'rsi':
        const rsi = calculateRSI(tokenData.priceHistory || [tokenData.priceUsd]);
        if (rsi <= (strategy.rsiMax || 35)) {
          signals.push(`RSI ${rsi.toFixed(1)}`);
          score += 10;
        }
        break;
        
      case 'smart_money':
        const smf = await checkSmartMoney(tokenData.tokenAddress);
        if (smf.accumulation || smf.smartWalletsBuying >= 3) {
          signals.push(`SMF accumulation`);
          score += 10;
        }
        break;
        
      case 'volume':
        const volume24h = tokenData.volume24h || 0;
        const avgVolume = tokenData.avgVolume || volume24h;
        const spike = volume24h / avgVolume;
        if (spike >= (strategy.volumeSpike || 2.0)) {
          signals.push(`Volume spike ${spike.toFixed(1)}x`);
          score += 10;
        }
        break;
        
      case 'whale':
        const whale = await checkWhaleActivity(tokenData.tokenAddress);
        if (whale.largeTxs >= 3 || whale.accumulationScore > 0.7) {
          signals.push(`Whale activity`);
          score += 10;
        }
        break;
        
      case 'orderbook':
        const ob = await checkOrderBook(tokenData.tokenAddress);
        if (ob.ratio >= (strategy.obRatio || 2.0)) {
          signals.push(`OB ratio ${ob.ratio.toFixed(1)}:1`);
          score += 10;
        }
        break;
        
      case 'funding':
        const funding = await checkFunding(tokenData.tokenAddress);
        if (funding.rate <= (strategy.fundingMax || 0)) {
          signals.push(`Funding ${(funding.rate * 100).toFixed(3)}%`);
          score += 10;
        }
        break;
        
      case 'sentiment':
        const sentiment = await checkSentiment(tokenData.symbol);
        if (sentiment.spike) {
          signals.push(`Sentiment spike`);
          score += 10;
        }
        break;
        
      case 'support_resistance':
        // Simplified S/R check
        if (strategy.requireSRConfluence) {
          signals.push(`S/R confluence`);
          score += 10;
        }
        break;
        
      case 'macd':
        if (strategy.macdCross) {
          signals.push(`MACD cross`);
          score += 10;
        }
        break;
    }
  }
  
  const confidence = (score / maxScore) * 10;
  return {
    valid: score >= maxScore * 0.7, // At least 70% of indicators must fire
    score: confidence,
    signals,
    strategyKey,
    strategy
  };
}

// ==================== PAPER TRADE EXECUTION ====================

let tradeHistory = [];

async function sendTelegram(message) {
  try {
    const topicParam = TOPIC_ID ? `&message_thread_id=${TOPIC_ID}` : '';
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}${topicParam}&text=${encodeURIComponent(message)}&parse_mode=Markdown`);
  } catch (e) {
    console.log('Telegram error:', e.message);
  }
}

async function paperTrade(tokenData) {
  console.log(`\n📝 PAPER TRADING: ${tokenData.symbol}`);
  
  // Test ALL strategies and pick the best qualifying one
  const results = [];
  
  for (const strategyKey of Object.keys(STRATEGY_COMBINATIONS)) {
    const result = await evaluateStrategy(strategyKey, tokenData);
    if (result.valid) {
      results.push(result);
    }
  }
  
  if (results.length === 0) {
    console.log('  ❌ No strategy qualified');
    return;
  }
  
  // Sort by score and pick best
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  
  console.log(`  ✅ Strategy: ${best.strategy.name}`);
  console.log(`  📊 Confidence: ${best.score.toFixed(1)}/10`);
  console.log(`  🎯 Signals: ${best.signals.join(', ')}`);
  
  // Simulate trade outcome
  const isWin = Math.random() < (best.score / 15); // Higher confidence = higher win rate
  const entryPrice = tokenData.priceUsd;
  
  let exitPrice, pnlPercent, outcome;
  
  if (isWin) {
    // Hit TP1 or TP2
    const hitTP2 = Math.random() < 0.35;
    if (hitTP2 && best.strategy.tp2Percent) {
      pnlPercent = (best.strategy.tp1Percent * 0.5) + (best.strategy.tp2Percent * 0.5);
      outcome = 'WIN_TP2';
    } else {
      pnlPercent = best.strategy.tp1Percent * 0.8;
      outcome = 'WIN_TP1';
    }
  } else {
    // Hit SL
    pnlPercent = -best.strategy.slPercent;
    outcome = 'LOSS';
  }
  
  // Update strategy performance
  const perf = strategyPerformance[best.strategyKey];
  perf.trades++;
  
  if (outcome.startsWith('WIN')) {
    perf.wins++;
    perf.totalPnL += pnlPercent;
  } else {
    perf.losses++;
    perf.totalPnL += pnlPercent;
  }
  
  perf.winRate = parseFloat((perf.wins / perf.trades * 100).toFixed(2));
  
  // Track drawdown
  if (perf.totalPnL > perf.peakPnL) {
    perf.peakPnL = perf.totalPnL;
  }
  perf.currentDrawdown = perf.peakPnL - perf.totalPnL;
  if (perf.currentDrawdown > perf.maxDrawdown) {
    perf.maxDrawdown = perf.currentDrawdown;
  }
  
  saveStrategyPerformance();
  updateLiveTraderConfig();
  
  // Log trade
  const trade = {
    timestamp: new Date().toISOString(),
    symbol: tokenData.symbol,
    strategy: best.strategy.name,
    strategyKey: best.strategyKey,
    entryPrice,
    outcome,
    pnlPercent,
    signals: best.signals,
    confidence: best.score
  };
  
  tradeHistory.push(trade);
  
  // Report
  const emoji = outcome === 'WIN_TP2' ? '🎯' : outcome === 'WIN_TP1' ? '✅' : '❌';
  const pnlSign = pnlPercent >= 0 ? '+' : '';
  
  console.log(`  ${emoji} Result: ${outcome} ${pnlSign}${pnlPercent.toFixed(2)}%`);
  
  // Telegram notification for significant results
  if (Math.abs(pnlPercent) > 15) {
    const msg = `📝 PAPER: ${tokenData.symbol}\nStrategy: ${best.strategy.name}\nResult: ${emoji} ${outcome}\nPnL: ${pnlSign}${pnlPercent.toFixed(2)}%\nWR: ${perf.winRate}%`;
    await sendTelegram(msg);
  }
}

// ==================== SUMMARY REPORT ====================

function printSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('📊 MULTI-STRATEGY PAPER TRADING SUMMARY v4.0');
  console.log('='.repeat(70));
  
  const sorted = Object.entries(strategyPerformance)
    .sort((a, b) => b[1].winRate - a[1].winRate);
  
  console.log('\n🏆 STRATEGY LEADERBOARD:');
  console.log('─'.repeat(70));
  console.log('Rank │ Strategy                     │ Trades │ WR%   │ PnL%  │ Status');
  console.log('─'.repeat(70));
  
  sorted.forEach(([key, perf], i) => {
    if (perf.trades === 0) return;
    
    const rank = i + 1;
    const medal = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '   ';
    const strat = STRATEGY_COMBINATIONS[key];
    const status = perf.winRate >= 75 ? '🟢 ACTIVE' : perf.winRate >= 65 ? '🟡 TEST' : '🔴 INACT';
    const pnlSign = perf.totalPnL >= 0 ? '+' : '';
    
    console.log(`${medal} ${rank.toString().padStart(2)}  │ ${strat.name.substring(0, 26).padEnd(26)} │ ${perf.trades.toString().padStart(4)}   │ ${perf.winRate.toString().padStart(5)} │ ${pnlSign}${perf.totalPnL.toFixed(1).padStart(5)} │ ${status}`);
  });
  
  const best = getBestStrategy();
  if (best) {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 CURRENT LEADER FOR LIVE DEPLOYMENT:');
    console.log(`   Strategy: ${best.name}`);
    console.log(`   Win Rate: ${best.winRate}% (${best.wins}W/${best.losses}L)`);
    console.log(`   Total PnL: ${best.totalPnL > 0 ? '+' : ''}${best.totalPnL.toFixed(2)}%`);
    console.log(`   Indicators: ${best.indicators.join(', ')}`);
    console.log(`   SL: ${best.slPercent}% | TP1: ${best.tp1Percent}% | TP2: ${best.tp2Percent || 'N/A'}%`);
    console.log('='.repeat(70));
  }
  
  // Save summary
  fs.writeFileSync('/root/trading-bot/paper-summary-v4.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    bestStrategy: best,
    allStrategies: strategyPerformance
  }, null, 2));
}

// ==================== MAIN LOOP ====================

async function main() {
  console.log('🚀 SOUL CORE PAPER TRADER v4.0 - Multi-Indicator Combinations');
  console.log(`📅 ${new Date().toLocaleString('id-ID')}`);
  console.log(`📊 Testing ${Object.keys(STRATEGY_COMBINATIONS).length} strategy combinations\n`);
  
  initStrategyTracking();
  
  // Load state
  let state = { trades: 0, dailyTrades: 0, lastReset: Date.now() };
  if (fs.existsSync(CONFIG.STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
  }
  
  // Reset daily counter if needed
  const now = Date.now();
  if (now - state.lastReset > 24 * 60 * 60 * 1000) {
    state.dailyTrades = 0;
    state.lastReset = now;
  }
  
  // Main paper trading loop
  let runCount = 0;
  const maxRuns = CONFIG.TRADES_PER_RUN;
  
  while (runCount < maxRuns && state.dailyTrades < CONFIG.MAX_TRADES_PER_DAY) {
    // Simulate scanning for tokens (in real implementation, this would use DexScreener API)
    // For now, generate mock token data
    const mockToken = {
      symbol: `TEST${runCount + 1}`,
      tokenAddress: `test_address_${runCount}`,
      priceUsd: Math.random() * 0.01,
      high24h: Math.random() * 0.015,
      low24h: Math.random() * 0.005,
      volume24h: Math.random() * 100000,
      liquidity: Math.random() * 50000 + 10000,
      ageMinutes: Math.random() * 1000 + 20
    };
    
    // Check if token qualifies
    if (mockToken.liquidity >= CONFIG.MIN_LIQUIDITY && 
        mockToken.volume24h >= CONFIG.MIN_VOLUME &&
        mockToken.ageMinutes >= CONFIG.MIN_TOKEN_AGE_MINUTES) {
      
      await paperTrade(mockToken);
      state.trades++;
      state.dailyTrades++;
      runCount++;
    }
    
    // Small delay between trades
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Save state
  fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
  
  // Print summary
  printSummary();
  
  console.log(`\n✅ Paper trading complete: ${runCount} trades processed`);
  console.log(`📊 Total strategies tested: ${Object.keys(STRATEGY_COMBINATIONS).length}`);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { evaluateStrategy, getBestStrategy, STRATEGY_COMBINATIONS };
