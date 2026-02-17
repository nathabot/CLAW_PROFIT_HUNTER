#!/usr/bin/env node
/**
 * Demo/Seed data generator for testing analyzers
 * Creates sample strategies to demonstrate the system
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Sample Reddit strategies
const SAMPLE_REDDIT_STRATEGIES = [
  {
    id: "reddit_demo_1",
    sourceType: "reddit",
    sourceUrl: "https://reddit.com/r/CryptoCurrency/comments/demo1",
    sourceName: "CryptoCurrency",
    externalUrl: "https://example.com/token1",
    title: "[DD] The RSI Divergence Strategy - 68% Win Rate Backtested",
    author: "CryptoTraderPro",
    content: "After backtesting 500 trades on 4H BTC charts, I've found RSI divergence to be highly reliable...",
    strategyName: "RSI Divergence Strategy",
    description: "Using RSI divergence for entry signals on 4H timeframe",
    entryRules: "Enter long when RSI shows bullish divergence (price lower low, RSI higher low) AND price touches support. Enter short on bearish divergence with resistance touch.",
    exitRules: "Take profit at 1:2 risk/reward or when opposite divergence forms. Trail stop below/above recent swing points.",
    riskRules: "Risk 1% per trade. Stop loss 2% below entry for longs, 2% above for shorts. Maximum 3 open positions.",
    tokensMentioned: ["BTC", "ETH", "SOL"],
    tokenContext: ["BTC 4H chart showing divergence", "ETH also works well"],
    sentimentScore: 0.65,
    sentimentLabel: "positive",
    confidenceScore: 0.85,
    engagementScore: 1247,
    commentCount: 89,
    upvoteRatio: 0.94,
    isDueDiligence: true,
    technicalPatterns: [
      { type: "indicators", pattern: "RSI" },
      { type: "indicators", pattern: "divergence" },
      { type: "chart_patterns", pattern: "support" },
      { type: "chart_patterns", pattern: "resistance" }
    ],
    strategyCategory: "swing",
    createdAt: "2026-02-10T15:30:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "reddit_demo_2",
    sourceType: "reddit",
    sourceUrl: "https://reddit.com/r/SatoshiStreetBets/comments/demo2",
    sourceName: "SatoshiStreetBets",
    externalUrl: "https://reddit.com/r/SatoshiStreetBets/comments/demo2",
    title: "Simple EMA Crossover + Volume Strategy for ALTS",
    author: "AltCoinKing",
    content: "Sharing my profitable scalping strategy using EMA crosses with volume confirmation...",
    strategyName: "EMA Crossover Volume Strategy",
    description: "EMA crossover with volume confirmation for altcoin scalping",
    entryRules: "Long when 9 EMA crosses above 21 EMA with volume > 150% of 20-period average. Short on opposite cross.",
    exitRules: "Exit on opposite crossover or when RSI > 70 (long) / < 30 (short).",
    riskRules: "0.5% risk per trade. Tight stops just beyond recent swing. No weekend trades.",
    tokensMentioned: ["SOL", "ADA", "MATIC", "AVAX"],
    tokenContext: ["SOL highly responsive on 15m"],
    sentimentScore: 0.42,
    sentimentLabel: "positive",
    confidenceScore: 0.72,
    engagementScore: 456,
    commentCount: 34,
    upvoteRatio: 0.88,
    isDueDiligence: false,
    technicalPatterns: [
      { type: "indicators", pattern: "EMA" },
      { type: "indicators", pattern: "volume" },
      { type: "indicators", pattern: "RSI" }
    ],
    strategyCategory: "scalping",
    createdAt: "2026-02-11T08:15:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "reddit_demo_3",
    sourceType: "reddit",
    sourceUrl: "https://reddit.com/r/CryptoMarkets/comments/demo3",
    sourceName: "CryptoMarkets",
    externalUrl: "https://reddit.com/r/CryptoMarkets/comments/demo3",
    title: "[Strategy] VWAP + Bollinger Bands Mean Reversion",
    author: "QuantTrader88",
    content: "This strategy works great in ranging markets. Looking for price to deviate from VWAP and touch Bollinger Bands...",
    strategyName: "VWAP Bollinger Mean Reversion",
    description: "Mean reversion using VWAP and Bollinger Bands",
    entryRules: "When price touches lower Bollinger Band (2 std dev) AND is below VWAP by >1%, enter long. Short on upper band touch above VWAP.",
    exitRules: "Target VWAP line or middle Bollinger Band. Stop beyond the band that was touched.",
    riskRules: "Risk 1.5% per trade. Max 2 trades per day. Avoid during high volatility events.",
    tokensMentioned: ["BTC", "ETH"],
    tokenContext: ["BTC 1H best timeframe"],
    sentimentScore: 0.38,
    sentimentLabel: "positive",
    confidenceScore: 0.78,
    engagementScore: 892,
    commentCount: 67,
    upvoteRatio: 0.91,
    isDueDiligence: false,
    technicalPatterns: [
      { type: "indicators", pattern: "VWAP" },
      { type: "indicators", pattern: "Bollinger Bands" },
      { type: "chart_patterns", pattern: "mean reversion" }
    ],
    strategyCategory: "day_trading",
    createdAt: "2026-02-09T22:45:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "reddit_demo_4",
    sourceType: "reddit",
    sourceUrl: "https://reddit.com/r/DeFi/comments/demo4",
    sourceName: "DeFi",
    externalUrl: "https://reddit.com/r/DeFi/comments/demo4",
    title: "[DD] Comprehensive Analysis: New DeFi Yield Strategy Using AAVE + Curve",
    author: "DeFiWhale",
    content: "Deep dive into my delta-neutral yield farming strategy using AAVE lending and Curve stable pools...",
    strategyName: "Delta Neutral AAVE Curve Yield",
    description: "Yield farming with minimized impermanent loss through delta neutral positioning",
    entryRules: "Deposit USDC to AAVE. Borrow 50% in ETH. Deposit borrowed ETH + equivalent USDC to Curve stETH pool. Farm CRV and AAVE rewards.",
    exitRules: "Monitor health factor > 1.5. Exit if borrowing rate > farming yield by >5% APY or if ETH volatility exceeds 15% daily.",
    riskRules: "Max 20% of portfolio. Monitor liquidation risk continuously. Use automation for health factor management.",
    tokensMentioned: ["AAVE", "CRV", "ETH", "USDC", "stETH"],
    tokenContext: ["AAVE lending rates", "CRV rewards", "stETH pool"],
    sentimentScore: 0.55,
    sentimentLabel: "positive",
    confidenceScore: 0.92,
    engagementScore: 2341,
    commentCount: 156,
    upvoteRatio: 0.96,
    isDueDiligence: true,
    technicalPatterns: [
      { type: "fundamental", pattern: "yield farming" },
      { type: "fundamental", pattern: "delta neutral" }
    ],
    strategyCategory: "position",
    createdAt: "2026-02-08T11:20:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "reddit_demo_5",
    sourceType: "reddit",
    sourceUrl: "https://reddit.com/r/Solana/comments/demo5",
    sourceName: "Solana",
    externalUrl: "https://raydium.io/",
    title: "High-Frequency Solana Memecoin Strategy - 3x in 2 weeks",
    author: "SolanaDegen",
    content: "Sharing my memecoin momentum strategy that's been printing on Solana...",
    strategyName: "Solana Memecoin Momentum",
    description: "Momentum trading for Solana memecoins using volume spikes",
    entryRules: "Buy when token shows 50%+ volume increase in 5min AND price up >10% from open. Only tokens >$100K market cap.",
    exitRules: "Sell 50% at +50% gain, let rest run with trailing stop at -20% from peak. Max hold time 4 hours.",
    riskRules: "0.25% risk per trade. Max 5 positions. Cut loss at -15% immediately. No revenge trading.",
    tokensMentioned: ["SOL", "BONK", "WIF", "POPCAT"],
    tokenContext: ["SOL ecosystem", "memecoins on Raydium"],
    sentimentScore: 0.72,
    sentimentLabel: "positive",
    confidenceScore: 0.58,
    engagementScore: 189,
    commentCount: 45,
    upvoteRatio: 0.82,
    isDueDiligence: false,
    technicalPatterns: [
      { type: "indicators", pattern: "volume" },
      { type: "indicators", pattern: "momentum" },
      { type: "price_action", pattern: "breakout" }
    ],
    strategyCategory: "scalping",
    createdAt: "2026-02-12T03:00:00Z",
    extractedAt: new Date().toISOString()
  }
];

// Sample Medium strategies
const SAMPLE_MEDIUM_STRATEGIES = [
  {
    id: "medium_demo_1",
    sourceType: "medium",
    sourceUrl: "https://medium.com/@traderjohn/macd-histogram-strategy-2026",
    sourceName: "Medium",
    title: "The MACD Histogram Reversal Strategy: A Complete Guide",
    author: "TraderJohn",
    content: "After years of testing, I've refined a MACD-based strategy with exceptional results...",
    excerpt: "A comprehensive guide to trading MACD histogram reversals with backtested results",
    strategyName: "MACD Histogram Reversal",
    description: "Trading reversals using MACD histogram divergences",
    entryRules: "Enter when MACD histogram shows divergence from price AND histogram bars start shortening in direction of trend. Confirm with price action at key level.",
    exitRules: "Exit when MACD line crosses signal line in opposite direction OR when histogram reaches extreme reading (>80th percentile).",
    riskRules: "Risk 1% per trade. Stop placed beyond recent swing high/low. Use position scaling: 50% at entry, 50% on confirmation.",
    backtestResults: {
      winRate: 62.3,
      profitFactor: 1.85,
      sharpeRatio: 1.42,
      maxDrawdown: 12.5,
      return: 45.2
    },
    indicators: ["MACD", "EMA"],
    timeframes: ["1H", "4H"],
    tokensMentioned: ["BTC", "ETH"],
    sentimentScore: 0.68,
    sentimentLabel: "positive",
    confidenceScore: 0.88,
    readTime: 8,
    wordCount: 1850,
    strategyCategory: "swing",
    categories: ["trading", "cryptocurrency", "technical-analysis"],
    searchQuery: "macd trading strategy",
    publishedAt: "2026-01-28T10:00:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "medium_demo_2",
    sourceType: "medium",
    sourceUrl: "https://medium.com/towards-data-science/algorithmic-crypto-trading",
    sourceName: "Medium",
    title: "Building an Algorithmic Crypto Trading Bot: From Idea to Live Trading",
    author: "DataSciencePro",
    content: "Walkthrough of building and deploying a fully automated trading system...",
    excerpt: "Complete guide to algorithmic crypto trading with Python",
    strategyName: "Mean Reversion Algorithmic System",
    description: "Automated mean reversion using statistical arbitrage",
    entryRules: "Calculate z-score of price relative to 50-period mean. Enter long when z-score < -2.0, short when > 2.0. Filter with ADX > 25 to avoid ranging markets.",
    exitRules: "Exit when z-score returns to 0.5 or after 10 periods whichever comes first. Hard stop at z-score +/- 3.5.",
    riskRules: "Kelly criterion position sizing. Max 2% per trade. Portfolio heat max 6%. Daily loss limit 5%.",
    backtestResults: {
      winRate: 54.8,
      profitFactor: 1.62,
      sharpeRatio: 1.18,
      maxDrawdown: 18.3,
      return: 38.7
    },
    indicators: ["Z-SCORE", "ADX", "EMA"],
    timeframes: ["15M", "1H"],
    tokensMentioned: ["BTC", "ETH", "SOL"],
    sentimentScore: 0.55,
    sentimentLabel: "positive",
    confidenceScore: 0.91,
    readTime: 12,
    wordCount: 3200,
    strategyCategory: "algorithmic",
    categories: ["algorithmic-trading", "python", "machine-learning"],
    searchQuery: "algorithmic trading crypto",
    publishedAt: "2026-01-15T14:30:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "medium_demo_3",
    sourceType: "medium",
    sourceUrl: "https://medium.com/@cryptoguru/fibonacci-trading-guide",
    sourceName: "Medium",
    title: "Mastering Fibonacci Retracements in Crypto Trading",
    author: "CryptoGuru",
    content: "The complete guide to using Fibonacci levels for precision entries and exits...",
    excerpt: "How to use Fibonacci retracements for better trade timing",
    strategyName: "Fibonacci Confluence Trading",
    description: "Using multiple Fibonacci tools for high-probability setups",
    entryRules: "Draw Fib retracement from last swing high to low. Look for confluence at 0.618 or 0.786 with prior support/resistance. Enter on bullish candlestick pattern at these levels.",
    exitRules: "Take partial profits at 0.5 and 0.618 extensions. Trail remaining position with ATR-based stop.",
    riskRules: "Risk 1-1.5% per trade. Stop below/above the Fib level that was tested. Avoid entries if price has moved >50% toward next level.",
    backtestResults: {
      winRate: 58.4,
      profitFactor: 1.73
    },
    indicators: ["FIBONACCI", "ATR"],
    timeframes: ["4H", "Daily"],
    tokensMentioned: ["BTC", "ETH", "SOL", "DOT"],
    sentimentScore: 0.45,
    sentimentLabel: "positive",
    confidenceScore: 0.76,
    readTime: 6,
    wordCount: 1400,
    strategyCategory: "swing",
    categories: ["technical-analysis", "fibonacci", "trading"],
    searchQuery: "fibonacci trading",
    publishedAt: "2026-02-01T09:00:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "medium_demo_4",
    sourceType: "medium",
    sourceUrl: "https://medium.com/@scalpmaster/crypto-scalping-2026",
    sourceName: "Medium",
    title: "The 5-Minute Crypto Scalping System That Works",
    author: "ScalpMaster",
    content: "A proven scalping strategy using order flow and volume profile...",
    excerpt: "High-frequency scalping strategy for crypto markets",
    strategyName: "Order Flow Volume Scalping",
    description: "Scalping using volume profile and order flow analysis",
    entryRules: "Mark volume profile POC (point of control) and value area highs/lows. Enter long when price tests value area low with positive delta. Short on VAH test with negative delta.",
    exitRules: "Target POC or opposite value area edge. Immediate exit if delta flips against position.",
    riskRules: "Ultra-tight stops (0.3-0.5%). Max 0.5% risk per trade. Stop after 3 consecutive losses. Only trade first 4 hours of session.",
    backtestResults: {
      winRate: 64.2,
      profitFactor: 1.45,
      return: 52.8
    },
    indicators: ["VOLUME PROFILE", "DELTA", "POC"],
    timeframes: ["5M"],
    tokensMentioned: ["BTC", "ETH"],
    sentimentScore: 0.62,
    sentimentLabel: "positive",
    confidenceScore: 0.82,
    readTime: 7,
    wordCount: 1650,
    strategyCategory: "scalping",
    categories: ["scalping", "order-flow", "bitcoin"],
    searchQuery: "crypto scalping",
    publishedAt: "2026-01-20T16:00:00Z",
    extractedAt: new Date().toISOString()
  },
  {
    id: "medium_demo_5",
    sourceType: "medium",
    sourceUrl: "https://medium.com/@swingtrader/ichimoku-cloud-strategy",
    sourceName: "Medium",
    title: "Ichimoku Cloud Trading: The Complete Strategy Guide",
    author: "SwingTrader",
    content: "Using the Ichimoku Cloud indicator for high-probability swing trades...",
    excerpt: "Complete Ichimoku Cloud strategy for crypto swing trading",
    strategyName: "Ichimoku Cloud Breakout",
    description: "Trend following using Ichimoku Cloud components",
    entryRules: "Long when price breaks above cloud, Tenkan crosses above Kijun, and Chikou span is above price. All three conditions must align.",
    exitRules: "Exit when price closes below cloud OR Tenkan crosses below Kijun. Trail stop using Kijun line.",
    riskRules: "Risk 1.5% per trade. Stop below the cloud or recent Kijun low. No trades if cloud is too thin (<2% price width).",
    backtestResults: {
      winRate: 51.3,
      profitFactor: 2.1,
      sharpeRatio: 1.35,
      maxDrawdown: 15.2,
      return: 42.5
    },
    indicators: ["ICHIMOKU"],
    timeframes: ["Daily", "4H"],
    tokensMentioned: ["BTC", "ETH", "LINK", "UNI"],
    sentimentScore: 0.48,
    sentimentLabel: "positive",
    confidenceScore: 0.85,
    readTime: 9,
    wordCount: 2100,
    strategyCategory: "swing",
    categories: ["ichimoku", "swing-trading", "crypto"],
    searchQuery: "ichimoku cloud trading",
    publishedAt: "2026-01-10T11:00:00Z",
    extractedAt: new Date().toISOString()
  }
];

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Save Reddit strategies
const redditFile = path.join(DATA_DIR, 'reddit-strategies.json');
fs.writeFileSync(redditFile, JSON.stringify(SAMPLE_REDDIT_STRATEGIES, null, 2));
console.log(`✅ Created Reddit strategies: ${redditFile}`);

// Save Medium strategies
const mediumFile = path.join(DATA_DIR, 'medium-strategies.json');
fs.writeFileSync(mediumFile, JSON.stringify(SAMPLE_MEDIUM_STRATEGIES, null, 2));
console.log(`✅ Created Medium strategies: ${mediumFile}`);

// Create combined database
const combinedStrategies = [...SAMPLE_REDDIT_STRATEGIES, ...SAMPLE_MEDIUM_STRATEGIES];
const combinedFile = path.join(DATA_DIR, 'all-strategies.json');
fs.writeFileSync(combinedFile, JSON.stringify(combinedStrategies, null, 2));
console.log(`✅ Created combined database: ${combinedFile}`);

// Export samples
const redditSamples = SAMPLE_REDDIT_STRATEGIES.map(s => ({
  title: s.title,
  source: s.sourceUrl,
  tokens: s.tokensMentioned,
  category: s.strategyCategory,
  entry: s.entryRules,
  exit: s.exitRules,
  risk: s.riskRules,
  sentiment: s.sentimentLabel,
  confidence: s.confidenceScore,
  isDD: s.isDueDiligence,
  patterns: s.technicalPatterns?.slice(0, 5) || []
}));

const mediumSamples = SAMPLE_MEDIUM_STRATEGIES.map(s => ({
  title: s.title,
  author: s.author,
  source: s.sourceUrl,
  confidence: s.confidenceScore,
  category: s.strategyCategory,
  readTime: s.readTime,
  indicators: s.indicators,
  timeframes: s.timeframes,
  entryRules: s.entryRules,
  exitRules: s.exitRules,
  riskRules: s.riskRules,
  backtestResults: s.backtestResults,
  description: s.description
}));

fs.writeFileSync(path.join(DATA_DIR, 'reddit-samples.json'), JSON.stringify(redditSamples, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'medium-samples.json'), JSON.stringify(mediumSamples, null, 2));
console.log(`✅ Created sample exports`);

// Create pattern analysis
const patterns = {
  indicators: {},
  timeframes: {},
  categories: {},
  tokens: {}
};

for (const s of combinedStrategies) {
  // Count indicators
  const indicators = s.indicators || s.technicalPatterns?.map(p => p.pattern) || [];
  for (const ind of indicators) {
    const key = typeof ind === 'string' ? ind : ind.pattern || ind;
    patterns.indicators[key] = (patterns.indicators[key] || 0) + 1;
  }
  
  // Count timeframes
  const tfs = s.timeframes || [];
  for (const tf of tfs) {
    patterns.timeframes[tf] = (patterns.timeframes[tf] || 0) + 1;
  }
  
  // Count categories
  if (s.strategyCategory) {
    patterns.categories[s.strategyCategory] = (patterns.categories[s.strategyCategory] || 0) + 1;
  }
  
  // Count tokens
  for (const token of s.tokensMentioned || []) {
    patterns.tokens[token] = (patterns.tokens[token] || 0) + 1;
  }
}

const patternsFile = path.join(DATA_DIR, 'strategy-patterns.json');
fs.writeFileSync(patternsFile, JSON.stringify(patterns, null, 2));
console.log(`✅ Created pattern analysis: ${patternsFile}`);

// Create summary report
console.log('\n' + '='.repeat(50));
console.log('📊 SAMPLE DATA SUMMARY');
console.log('='.repeat(50));
console.log(`Reddit strategies: ${SAMPLE_REDDIT_STRATEGIES.length}`);
console.log(`Medium strategies: ${SAMPLE_MEDIUM_STRATEGIES.length}`);
console.log(`Total strategies: ${combinedStrategies.length}`);
console.log(`\nMost common indicators:`, Object.entries(patterns.indicators).slice(0, 5));
console.log(`Strategy categories:`, patterns.categories);
console.log(`Most mentioned tokens:`, Object.entries(patterns.tokens).slice(0, 5));

console.log('\n✅ Demo data generated successfully!');
console.log('\nRun the analyzers with:');
console.log('  node reddit-analyzer.js patterns');
console.log('  node medium-analyzer.js patterns');
