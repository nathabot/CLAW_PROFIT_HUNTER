#!/usr/bin/env node
// LIVE TRADER v4.2 (DYNAMIC TP/SL)
// Platform: VPS Natha (Single VPS Architecture)
// Features: Fibonacci-based adaptive targets, Honeypot check, Token age, Contract verification
// Updated: 2026-02-17

const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const bs58 = require('bs58');
const DynamicTPSL = require('./dynamic-tpsl-engine');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

// SOLANA TRACKER API (bypass Jupiter rate limit)
const SOLANA_TRACKER_API_KEY = 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a';
const SOLANA_TRACKER_BASE_URL = 'https://swap-v2.solanatracker.io';

let ADAPTIVE_CONFIG = {};
try {
  ADAPTIVE_CONFIG = JSON.parse(fs.readFileSync('/root/trading-bot/adaptive-scoring-config.json', 'utf8'));
} catch (e) {
  console.log('⚠️  Could not load adaptive config, using defaults');
}

const CONFIG = {
  WALLET: 'EpG25pVadjQ9M9NHJMXZSc6SsB3Mshj4Kk9uzDVB8kum',
  WALLET_PATH: '/root/trading-bot/wallet.json',
  // POSITION SIZING (Flexible - BOK Standard)
  MIN_POSITION_SIZE: 0.005,      // SUPER CONSERVATIVE: 0.005 SOL       // Minimum position (BOK)
  MAX_POSITION_SIZE: 0.01,       // Max 0.01 SOL        // Maximum position (BOK)
  DEFAULT_POSITION_SIZE: 0.005,   // 0.005 SOL max   // Default size
  FEE_RESERVE: 0.015,             // BOK: always keep 0.015 SOL minimum for sell fees
  // DYNAMIC THRESHOLD from paper trader results
  MIN_SCORE: ADAPTIVE_CONFIG?.adaptiveThresholds?.liveTrader?.currentThreshold || 6.0,
  MIN_TOKEN_AGE_MINUTES: 360,     // 6 hours minimum (was 24h)
  MIN_LIQUIDITY_USD: 10000,       // $10k minimum (was $25k)
  MAX_DAILY_TRADES: 5,          // Max 5 trades/day           // Maximum trades per day
  DAILY_TARGET: 0.2,
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
  // FIBONACCI STRATEGY (from paper testing - 82.5% WR)
  // Best: Entry 0.618, TP 1.618 (Golden) - 82.50% WR (33W/7L)
  // Alternative: Entry 0.786, TP 1.0 - 82.50% WR (33W/7L)
  FIB_ENTRY: 0.618,              // Golden ratio entry
  FIB_TP1: 1.0,                  // First target
  FIB_TP2: 1.618,                // Golden ratio target
  PARTIAL_EXIT: true,            // 50% at TP1, 50% at TP2
  SL_FIB: 0.5,                   // Stop below 0.5 fib
  // Adaptive scoring
  ADAPTIVE_MODE: true,
  SCORE_CONFIG_PATH: '/root/trading-bot/adaptive-scoring-config.json',
  // BLACKLIST & STRIKE SYSTEM
  BLACKLIST_FILE: '/root/trading-bot/blacklist.json',
  STRIKE_COUNT_FILE: '/root/trading-bot/token-strike-count.json',
  MAX_STRIKES: 3,                // 3-strike rule
  STRIKE_COOLDOWN_HOURS: 24,     // Reset strikes after 24h
  // CANDLE ANALYSIS
  MIN_PULLBACK_PERCENT: 0.5,     // Minimum pullback from recent high
  MAX_ENTRY_FROM_HIGH: 1.0,      // Max % above recent high for entry
  MIN_GREEN_CANDLE: 0.3,         // Min % green candle
  WAIT_AFTER_RED_CANDLES: 2,     // Wait N candles after red
  AVOID_PUMP_PERCENT: 10,        // Avoid if pumped >10% in 5min
  // BALANCE PROTECTION
  STARTING_BALANCE: 0.1,      // Starting SOL balance (updated for new wallet)
  MAX_DRAWDOWN_PERCENT: 30,      // Max 30% drawdown from peak
  PEAK_BALANCE_FILE: '/root/trading-bot/peak-balance.json',
  EMERGENCY_STOP_FILE: '/root/trading-bot/EMERGENCY_STOP'
};

const BOT_TOKEN = TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = TELEGRAM_CHAT_ID || '-1003212463774';
const TOPIC_ID = 24; // Topic #24: Active Positions

class DynamicTrader {
  constructor() {
    this.connection = new Connection(CONFIG.RPC);
    this.tpslEngine = new DynamicTPSL();
    this.tradesToday = 0;
    this.lastTradeDate = new Date().toDateString();
    this.dailyPnl = 0;
    this.peakBalance = this.loadPeakBalance();
    this.priceHistory = {}; // Track price history per token
    this.redCandleWait = {}; // Track red candle wait state
    
    // Load wallet (supports both bs58 and base64 formats)
    try {
      const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
      let secretKey;
      
      if (walletData.secretKey) {
        // New format: base64 encoded secretKey
        secretKey = new Uint8Array(Buffer.from(walletData.secretKey, 'base64'));
        this.wallet = Keypair.fromSecretKey(secretKey);
      } else if (walletData.privateKey) {
        // Old format: bs58 encoded privateKey
        const bs58mod = require('bs58');
        const bs58lib = bs58mod.default || bs58mod;
        secretKey = bs58lib.decode(walletData.privateKey);
        this.wallet = Keypair.fromSecretKey(secretKey);
      } else {
        // Direct array format
        this.wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
      }
      console.log(`🔑 Wallet loaded: ${this.wallet.publicKey.toString().slice(0, 20)}...`);
    } catch (e) {
      console.error('❌ Failed to load wallet:', e.message);
      process.exit(1);
    }
  }
  
  // Record price for history tracking
  recordPrice(ca, price) {
    if (!this.priceHistory[ca]) {
      this.priceHistory[ca] = [];
    }
    
    this.priceHistory[ca].push({
      timestamp: Date.now(),
      price: price
    });
    
    // Keep only last 10 minutes
    const cutoff = Date.now() - (10 * 60 * 1000);
    this.priceHistory[ca] = this.priceHistory[ca].filter(p => p.timestamp > cutoff);
  }
  
  // Find recent high in 10 min window
  findRecentHigh(ca) {
    if (!this.priceHistory[ca] || this.priceHistory[ca].length === 0) {
      return null;
    }
    return Math.max(...this.priceHistory[ca].map(p => p.price));
  }
  
  // Check if red candle recently (last 2 min)
  hasRedCandleRecently(ca, currentPrice) {
    if (!this.priceHistory[ca] || this.priceHistory[ca].length < 2) {
      return false;
    }
    
    const twoMinAgo = Date.now() - (2 * 60 * 1000);
    const recentPrices = this.priceHistory[ca].filter(p => p.timestamp > twoMinAgo);
    
    if (recentPrices.length < 2) return false;
    
    // Check for any decline (red candle)
    for (let i = 1; i < recentPrices.length; i++) {
      if (recentPrices[i].price < recentPrices[i-1].price) {
        return true;
      }
    }
    return false;
  }
  
  // Check if green candle forming (current > last)
  isGreenCandleForming(ca, currentPrice) {
    if (!this.priceHistory[ca] || this.priceHistory[ca].length === 0) {
      return false;
    }
    
    const sorted = [...this.priceHistory[ca]].sort((a, b) => b.timestamp - a.timestamp);
    const lastPrice = sorted[0]?.price;
    
    return currentPrice > lastPrice;
  }

  // ==================== BOK FEEDBACK SYSTEM ====================
  // Track live trade results and update strategy classification
  
  loadLiveStrategyTracker() {
    const trackerFile = '/root/trading-bot/live-strategy-tracker.json';
    try {
      if (fs.existsSync(trackerFile)) {
        return JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
      }
    } catch (e) {}
    return {};
  }
  
  saveLiveStrategyTracker(tracker) {
    const trackerFile = '/root/trading-bot/live-strategy-tracker.json';
    fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2));
  }
  
  recordLiveTradeResult(strategyId, strategyName, isWin, pnlPercent) {
    const tracker = this.loadLiveStrategyTracker();
    
    if (!tracker[strategyId]) {
      tracker[strategyId] = {
        id: strategyId,
        name: strategyName,
        liveWins: 0,
        liveLosses: 0,
        liveTotal: 0,
        consecutiveLosses: 0,
        lastUpdated: Date.now()
      };
    }
    
    const strat = tracker[strategyId];
    strat.liveTotal++;
    
    if (isWin) {
      strat.liveWins++;
      strat.consecutiveLosses = 0; // Reset on win
    } else {
      strat.liveLosses++;
      strat.consecutiveLosses++;
    }
    
    strat.lastUpdated = Date.now();
    this.saveLiveStrategyTracker(tracker);
    
    console.log(`📊 Live Trade Recorded: ${strategyName} | ${isWin ? 'WIN' : 'LOSS'} | Consecutive Losses: ${strat.consecutiveLosses}`);
    
    // Check if strategy should be moved to negative (3 consecutive losses)
    if (strat.consecutiveLosses >= 3) {
      console.log(`⚠️  Strategy ${strategyName} hit 3 consecutive losses - moving to NEGATIVE`);
      this.moveStrategyToNegative(strategyId, strategyName, strat);
    }
    
    // If profitable trade on positive strategy, confirm it stays positive
    if (isWin && strat.liveWins >= 1) {
      this.confirmPositiveStrategy(strategyId, strategyName, strat);
    }
    
    return strat;
  }
  
  moveStrategyToNegative(strategyId, strategyName, tracker) {
    const timestamp = new Date().toISOString();
    const negativeFile = '/root/trading-bot/bok/17-negative-strategies.md';
    
    let content = '';
    try {
      content = fs.readFileSync(negativeFile, 'utf8');
    } catch (e) {
      content = '# 17 - Negative Strategies (WR <70% or 3+ Live Losses)\n\n**Auto-generated by Live Trader + Paper Trader**\n\n';
    }
    
    // Check if already in negative
    if (content.includes(`| ${strategyId} |`)) {
      console.log(`   ℹ️  Strategy ${strategyId} already in negative`);
      return;
    }
    
    // Add to negative
    const entry = `| ${strategyId} | ${strategyName} | 3 Live Losses | Live Trading | ${timestamp} |\n`;
    
    // Find the table and append
    if (content.includes('## Strategies')) {
      content = content.replace(/(## Strategies\n\n.*?\n)(\|[-:]+\|[-:]+\|[-:]+\|[-:]+\|[-:]+\|)/, `$1$2\n${entry}`);
    } else {
      content += `\n## Strategies\n\n| ID | Name | Reason | Source | Date |\n|----|------|--------|--------|------|\n${entry}`;
    }
    
    fs.writeFileSync(negativeFile, content);
    console.log(`   ✅ Added ${strategyName} to NEGATIVE strategies`);
    
    // Remove from positive if exists
    this.removeFromPositive(strategyId);
  }
  
  confirmPositiveStrategy(strategyId, strategyName, tracker) {
    const timestamp = new Date().toISOString();
    const positiveFile = '/root/trading-bot/bok/16-positive-strategies.md';
    
    let content = '';
    try {
      content = fs.readFileSync(positiveFile, 'utf8');
    } catch (e) {
      content = '# 16 - Positive Strategies (WR >=70%)\n\n**Auto-generated by Paper Trader v5**\n\n';
    }
    
    // Check if already in positive
    if (content.includes(`| ${strategyId} |`)) {
      return; // Already positive, no action needed
    }
    
    // Add to positive
    const wr = ((tracker.liveWins / tracker.liveTotal) * 100).toFixed(1);
    const entry = `| ${strategyId} | ${strategyName} | ${wr}% | Live Trading | ${tracker.liveTotal} | ${timestamp} |\n`;
    
    if (content.includes('## High-Performing Strategies')) {
      content = content.replace(/(## High-Performing Strategies\n\n.*?\n)(\|[-:]+\|[-:]+\|[-:]+\|[-:]+\|[-:]+\|[-:]+\|)/, `$1$2\n${entry}`);
    } else {
      content += `\n## High-Performing Strategies\n\n| ID | Name | Win Rate | Source | Trades | Date |\n|----|------|----------|--------|--------|------|\n${entry}`;
    }
    
    // Update the "no strategies" text if present
    content = content.replace('*No strategies currently meet the 70% WR threshold*', '');
    
    fs.writeFileSync(positiveFile, content);
    console.log(`   ✅ Confirmed ${strategyName} in POSITIVE strategies (${wr}% WR)`);
  }
  
  removeFromPositive(strategyId) {
    const positiveFile = '/root/trading-bot/bok/16-positive-strategies.md';
    try {
      let content = fs.readFileSync(positiveFile, 'utf8');
      const lines = content.split('\n');
      const newLines = lines.filter(line => !line.includes(`| ${strategyId} |`));
      fs.writeFileSync(positiveFile, newLines.join('\n'));
      console.log(`   🗑️  Removed ${strategyId} from POSITIVE`);
    } catch (e) {}
  }

  // ==================== MARKET DATA FETCH ====================
  async fetchMarketData() {
    try {
      const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await res.json();
      
      const tokens = [];
      for (const profile of profiles.slice(0, 100)) {
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

  // ==================== BOK POSITIVE STRATEGY EXECUTION ====================
  // If BOK has positive strategies, execute directly without scanning
  
  loadPositiveStrategiesFromBOK() {
    try {
      const positiveFile = '/root/trading-bot/bok/16-positive-strategies.md';
      if (!fs.existsSync(positiveFile)) return [];

      const content = fs.readFileSync(positiveFile, 'utf8');
      const strategies = [];

      // Parse header format (### Strategy: id)
      const strategyBlocks = content.split('### Strategy:');
      
      for (let i = 1; i < strategyBlocks.length; i++) {
        const block = strategyBlocks[i];
        const lines = block.split('\n');
        
        // First line is the strategy ID
        const id = lines[0].trim();
        
        // Parse bullet points
        let name = '', winRate = '', trades = '';
        
        for (const line of lines) {
          if (line.includes('- **Name:**')) {
            name = line.split('**Name:**')[1].trim();
          }
          if (line.includes('- **Win Rate:**')) {
            const wrMatch = line.match(/(\d+\.?\d*)%/);
            if (wrMatch) winRate = wrMatch[1] + '%';
            const tradeMatch = line.match(/\((\d+) trades?\)/);
            if (tradeMatch) trades = tradeMatch[1];
          }
        }
        
        if (id && name) {
          strategies.push({
            id: id,
            name: name,
            winRate: winRate,
            source: 'Paper Trader',
            trades: trades
          });
        }
      }

      console.log(`📚 Loaded ${strategies.length} positive strategies from BOK`);
      return strategies;
    } catch (e) {
      console.log('⚠️  Could not load positive strategies:', e.message);
      return [];
    }
  }

  loadProvenTokens() {
    try {
      const provenFile = '/root/trading-bot/bok/proven-tokens.json';
      if (!fs.existsSync(provenFile)) return {};

      return JSON.parse(fs.readFileSync(provenFile, 'utf8'));
    } catch (e) {
      console.log('⚠️  Could not load proven tokens:', e.message);
      return {};
    }
  }
  
  hasPositiveStrategies() {
    const strategies = this.loadPositiveStrategiesFromBOK();
    return strategies.length > 0;
  }
  
  async executeWithPositiveStrategy() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 BOK POSITIVE STRATEGY MODE');
    console.log('Using proven strategies + PROVEN TOKENS from Paper Trade');
    console.log('='.repeat(60));

    const positiveStrategies = this.loadPositiveStrategiesFromBOK();
    const provenTokens = this.loadProvenTokens();

    if (positiveStrategies.length === 0) {
      console.log('⚠️  No positive strategies in BOK, falling back to scan mode');
      return false;
    }

    console.log(`\n📚 Found ${positiveStrategies.length} positive strategy(s):`);
    for (const s of positiveStrategies) {
      console.log(`   • ${s.name}: ${s.winRate} (${s.trades} trades)`);
    }

    // Use best strategy
    const bestStrategy = positiveStrategies[0];
    console.log(`\n🎯 Using best strategy: ${bestStrategy.name}`);

    // Set current strategy
    this.currentStrategy = {
      id: bestStrategy.id,
      name: bestStrategy.name,
      category: 'SCALPING'
    };

    // Apply strategy params
    this.applyStrategyParams(this.currentStrategy, null);

    // CHECK: Ada proven tokens untuk strategy ini?
    const strategyProvenTokens = provenTokens[bestStrategy.id]?.tokens || [];

    if (strategyProvenTokens.length > 0) {
      console.log(`\n💎 FOUND ${strategyProvenTokens.length} PROVEN TOKEN(S):`);
      strategyProvenTokens.slice(0, 5).forEach(t => {
        console.log(`   • ${t.symbol}: ${t.wins} wins, +${t.avgPnl.toFixed(1)}% avg`);
      });
      console.log('\n🔄 Checking current prices of proven tokens...');

      // Check each proven token
      for (const proven of strategyProvenTokens.slice(0, 10)) {
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${proven.ca}`);
          const data = await res.json();
          const pair = data.pairs?.[0];

          if (!pair) {
            console.log(`   ⏭️  ${proven.symbol}: No data`);
            continue;
          }

          const symbol = pair.baseToken?.symbol || proven.symbol;
          const ca = proven.ca;
          const price = parseFloat(pair.priceUsd);
          const liq = parseFloat(pair.liquidity?.usd || 0);

          console.log(`\n🔍 Checking PROVEN: ${symbol}`);
          console.log(`   Price: $${price.toFixed(8)} | Liq: $${liq.toFixed(0)}`);

          // Filters
          if (liq < CONFIG.MIN_LIQUIDITY_USD) {
            console.log(`   ⏭️  Low liquidity`);
            continue;
          }

          // Check existing
          const existing = await this.checkExistingPosition(ca);
          if (existing) {
            console.log(`   ⏭️  Already have position`);
            continue;
          }

          // Validate entry
          const candleCheck = await this.validateCandleEntry(ca, price);
          if (!candleCheck.valid) {
            console.log(`   ⏭️  ${candleCheck.reason}`);
            continue;
          }

          // Honeypot
          const knownBluechips = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'JTO', 'WIF', 'RAY', 'ORCA'];
          const isBluechip = knownBluechips.includes(symbol.toUpperCase());

          if (!isBluechip) {
            console.log(`   🔒 Honeypot test...`);
            const honeypot = await this.honeypotTest(ca);
            if (!honeypot.safe) {
              console.log(`   ⚠️  HONEYPOT`);
              continue;
            }
          }

          // EXECUTE PROVEN TOKEN!
          console.log(`\n🚀🚀🚀 EXECUTING PROVEN TOKEN: ${symbol} 🚀🚀🚀`);
          console.log(`   Strategy: ${bestStrategy.name}`);
          console.log(`   History: ${proven.wins} wins with this strategy!`);
          const setup = {
            symbol,
            ca,
            price,
            score: 9, // Higher score for proven
            provenToken: true
          };
          await this.executeTrade(setup);
          return true;

        } catch (e) {
          console.log(`   ⚠️  Error checking ${proven.symbol}: ${e.message}`);
        }
      }

      console.log('\n⚠️  No proven tokens available for entry, falling back to trending...');
    } else {
      console.log('\n⚠️  No proven tokens recorded, using trending tokens...');
    }

    // FALLBACK: Cari di trending tokens
    console.log('\n🔍 Fetching trending tokens for execution...');
    const tokens = await this.fetchMarketData();

    if (tokens.length === 0) {
      console.log('❌ No tokens available');
      return false;
    }

    // Check trending tokens
    for (const token of tokens.slice(0, 20)) {
      const symbol = token.baseToken?.symbol || 'UNKNOWN';
      const ca = token.baseToken?.address;

      if (!ca) continue;

      console.log(`\n🔍 Checking: ${symbol}`);

      const liq = parseFloat(token.liquidity?.usd || 0);
      const age = this.getTokenAgeMinutes(token);

      if (liq < CONFIG.MIN_LIQUIDITY_USD) {
        console.log(`  ⏭️  Low liquidity`);
        continue;
      }

      if (age < CONFIG.MIN_TOKEN_AGE_MINUTES) {
        console.log(`  ⏭️  Too young`);
        continue;
      }

      const existing = await this.checkExistingPosition(ca);
      if (existing) {
        console.log(`  ⏭️  Already have position`);
        continue;
      }

      const candleCheck = await this.validateCandleEntry(ca, parseFloat(token.priceUsd));
      if (!candleCheck.valid) {
        console.log(`  ⏭️  ${candleCheck.reason}`);
        continue;
      }

      const knownBluechips = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'JTO', 'WIF', 'RAY', 'ORCA'];
      const isBluechip = knownBluechips.includes(symbol.toUpperCase());

      if (!isBluechip) {
        console.log(`  🔒 Honeypot test...`);
        const honeypot = await this.honeypotTest(ca);
        if (!honeypot.safe) {
          console.log(`  ⚠️  HONEYPOT`);
          continue;
        }
      }

      console.log(`\n🚀 EXECUTING (trending): ${symbol}`);
      const setup = {
        symbol,
        ca,
        price: parseFloat(token.priceUsd),
        score: 8
      };
      await this.executeTrade(setup);
      return true;
    }

    console.log('\n⏭️  No suitable tokens found');
    return false;
  }

  /**
   * SYNC with Paper Trader - reload adaptive config
   */
  syncWithPaperTrader() {
    try {
      const adaptiveConfig = JSON.parse(fs.readFileSync('/root/trading-bot/adaptive-scoring-config.json', 'utf8'));
      
      // Check if adaptiveThresholds exists (old format compatibility)
      if (!adaptiveConfig.adaptiveThresholds) {
        console.log('⚠️  Sync: adaptiveThresholds not found, using defaults');
        return false;
      }
      
      // Sync threshold
      const paperThreshold = adaptiveConfig.adaptiveThresholds?.paperTrader?.optimalThreshold;
      const liveThreshold = adaptiveConfig.adaptiveThresholds?.liveTrader?.currentThreshold;
      
      if (paperThreshold && paperThreshold !== CONFIG.MIN_SCORE) {
        console.log(`📊 SYNC: Threshold updated ${CONFIG.MIN_SCORE} → ${paperThreshold}`);
        CONFIG.MIN_SCORE = paperThreshold;
      }
      
      // SYNC STRATEGY: Always use HIGHEST WR% from Paper Trader
      const fibStrategies = adaptiveConfig.fibStrategies || {};
      let bestStrategy = null;
      let bestWR = 0;
      let bestTrades = 0;
      
      // Find strategy with highest WR (minimum 10 trades for validation)
      for (const [key, strat] of Object.entries(fibStrategies)) {
        const wr = parseFloat(strat.winRate);
        const trades = strat.trades || 0;
        if (trades >= 10 && wr > bestWR) {
          bestWR = wr;
          bestStrategy = key;
          bestTrades = trades;
        }
      }
      
      // Update if changed or first run
      if (bestStrategy) {
        if (bestStrategy !== this.currentStrategy) {
          console.log(`📊 SYNC: Strategy CHANGED to ${bestStrategy} (${bestWR}% WR, ${bestTrades} trades)`);
          this.currentStrategy = bestStrategy;
        } else {
          console.log(`📊 SYNC: Strategy maintained ${bestStrategy} (${bestWR}% WR) - still best`);
        }
      }
      
      // Calculate position size based on strategy performance
      this.currentPositionSize = this.calculatePositionSize(fibStrategies);
      console.log(`📊 SYNC: Position size ${this.currentPositionSize} SOL (based on strategy performance)`);
      
      // Update liveTrader section
      if (adaptiveConfig.adaptiveThresholds?.liveTrader) {
        adaptiveConfig.adaptiveThresholds.liveTrader.currentThreshold = CONFIG.MIN_SCORE;
        adaptiveConfig.adaptiveThresholds.liveTrader.lastSync = new Date().toISOString();
        fs.writeFileSync('/root/trading-bot/adaptive-scoring-config.json', JSON.stringify(adaptiveConfig, null, 2));
      }
      
      return true;
    } catch (e) {
      console.log('⚠️  Sync failed:', e.message);
      return false;
    }
  }

  /**
   * Execute buy via Solana Tracker
   */
  /**
   * Calculate position size based on strategy performance
   * Higher WR = larger position, Lower WR = smaller position
   */
  calculatePositionSize(fibStrategies) {
    let bestWR = 0;
    let bestStrategy = null;
    
    for (const [key, strat] of Object.entries(fibStrategies)) {
      const wr = parseFloat(strat.winRate);
      if (wr > bestWR && strat.trades >= 10) {
        bestWR = wr;
        bestStrategy = key;
      }
    }
    
    // Position sizing based on WR
    if (bestWR >= 85) {
      return 0.04; // High confidence
    } else if (bestWR >= 80) {
      return 0.035; // Good confidence
    } else if (bestWR >= 75) {
      return 0.03; // Moderate confidence
    } else if (bestWR >= 70) {
      return 0.025; // Default
    } else if (bestWR >= 65) {
      return 0.02; // Lower confidence
    } else {
      return CONFIG.MIN_POSITION_SIZE; // Minimum (0.015)
    }
  }
  
  /**
   * FULL STRATEGY SYNC - Paper Trader v5 Integration
   */
  syncStrategyFromPaperTrader() {
    try {
      const config = JSON.parse(fs.readFileSync('/root/trading-bot/adaptive-scoring-config.json', 'utf8'));
      
      // Get best strategy
      const bestStrategy = config.bestStrategy;
      if (!bestStrategy) return false;
      
      // Check if strategy changed
      if (this.currentStrategy?.id !== bestStrategy.id) {
        console.log(`\n🎯 STRATEGY UPDATE: ${bestStrategy.name}`);
        console.log(`   Category: ${bestStrategy.category}`);
        console.log(`   WR: ${bestStrategy.winRate}% (${bestStrategy.trades} trades)`);
        
        this.currentStrategy = bestStrategy;
        this.applyStrategyParams(bestStrategy, config.strategyCategories);
        return true;
      }
      
      return false;
    } catch (e) {
      console.log('⚠️  Strategy sync failed:', e.message);
      return false;
    }
  }
  
  /**
   * Apply strategy parameters (TP/SL based on category)
   */
  applyStrategyParams(strategy, categories) {
    const category = strategy.category || 'SCALPING';
    const catParams = categories?.[category] || { sl: 2, tp1: 4, tp2: 6 };
    const stratParams = strategy.params || {};
    
    this.strategyConfig = {
      category: category,
      slPercent: stratParams.slPercent || catParams.sl,
      tp1Percent: stratParams.tp1Percent || catParams.tp1,
      tp2Percent: stratParams.tp2Percent || catParams.tp2,
      entryFib: stratParams.entryFib || 0.618,
      tpFib: stratParams.tpFib || 1.618,
      indicators: strategy.indicators || ['fibonacci'],
      maxHoldMinutes: catParams.maxHold || 15
    };
    
    console.log(`   TP/SL: ${this.strategyConfig.slPercent}% / ${this.strategyConfig.tp1Percent}% / ${this.strategyConfig.tp2Percent}%`);
    console.log(`   Max Hold: ${this.strategyConfig.maxHoldMinutes} min`);
  }
  
  /**
   * Check strategy-specific indicators
   */
  async validateStrategyIndicators(token) {
    if (!this.currentStrategy?.indicators) return { passed: true, score: 0 };
    
    const indicators = this.currentStrategy.indicators;
    const results = { passed: true, score: 0, checks: [] };
    
    for (const indicator of indicators) {
      switch (indicator) {
        case 'rsi':
          const change24h = parseFloat(token.priceChange?.h24 || 0);
          if (change24h < -15) {
            results.score += 2;
            results.checks.push('✅ RSI: Oversold');
          } else if (change24h > 25) {
            results.passed = false;
            results.checks.push('❌ RSI: Overbought');
          }
          break;
          
        case 'volume':
          const vol = parseFloat(token.volume?.h24 || 0);
          const liq = parseFloat(token.liquidity?.usd || 0);
          if (vol > liq * 0.3) {
            results.score += 2;
            results.checks.push('✅ Volume: High activity');
          }
          break;
          
        case 'whale':
        case 'smart_money':
          const buys = parseFloat(token.txns?.h24?.buys || 0);
          const sells = parseFloat(token.txns?.h24?.sells || 0);
          if (buys > sells * 1.4) {
            results.score += 2;
            results.checks.push('✅ Smart Money: Accumulation');
          }
          break;
      }
    }
    
    return results;
  }

  async executeSolanaTrackerBuy(tokenCA, amountSol) {
    try {
      const wsol = 'So11111111111111111111111111111111111111112';
      const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${wsol}&to=${tokenCA}&fromAmount=${amountSol}&slippage=10&payer=${this.wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
      
      console.log('  🔄 Getting quote from Solana Tracker...');
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${SOLANA_TRACKER_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const data = await res.json();
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
      // Execute transaction
      const txBuf = Buffer.from(data.txn, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);
      
      transaction.sign([this.wallet]);
      
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        success: true,
        signature,
        expectedOutput: data.rate?.amountOut || 0,
        platform: 'SolanaTracker'
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Execute sell via Solana Tracker
   */
  async executeSolanaTrackerSell(tokenCA, percent = '95%') {
    try {
      const wsol = 'So11111111111111111111111111111111111111112';
      const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${tokenCA}&to=${wsol}&fromAmount=${encodeURIComponent(percent)}&slippage=30&payer=${this.wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
      
      console.log(`  🔄 Getting sell quote (${percent})...`);
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${SOLANA_TRACKER_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const data = await res.json();
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
      // Execute transaction
      const txBuf = Buffer.from(data.txn, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuf);
      
      transaction.sign([this.wallet]);
      
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      return {
        success: true,
        signature,
        outputAmount: data.rate?.amountOut || 0
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Honeypot check via Solana Tracker
   */
  async honeypotTest(ca) {
    try {
      const wsol = 'So11111111111111111111111111111111111111112';
      const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${ca}&to=${wsol}&fromAmount=1&slippage=50&payer=${this.wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${SOLANA_TRACKER_API_KEY}` }
      });
      
      const data = await res.json();
      
      if (data.error) {
        return { safe: false, reason: data.error };
      }
      
      return { safe: true, reason: 'Solana Tracker quote OK' };
    } catch (e) {
      return { safe: false, reason: e.message };
    }
  }

  async notify(msg, retries = 3) {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: CHAT_ID,
            message_thread_id: TOPIC_ID,
            text: msg, 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (res.ok) return; // Success
        
        // If rate limited, wait and retry
        if (res.status === 429) {
          const data = await res.json();
          const waitMs = (data.parameters?.retry_after || 5) * 1000;
          console.log(`  ⏳ Telegram rate limit, waiting ${waitMs/1000}s...`);
          await delay(waitMs);
          continue;
        }
        
        // Other error, retry with backoff
        if (i < retries - 1) {
          const backoff = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          console.log(`  ⚠️ Telegram send failed (${res.status}), retry ${i+1}/${retries} in ${backoff}ms...`);
          await delay(backoff);
        }
      } catch (e) {
        if (i < retries - 1) {
          const backoff = Math.pow(2, i) * 1000;
          console.log(`  ⚠️ Telegram network error, retry ${i+1}/${retries} in ${backoff}ms...`);
          await delay(backoff);
        } else {
          console.log(`  ❌ Telegram send failed after ${retries} retries:`, e.message);
        }
      }
    }
  }

  async getBalance() {
    try {
      const balance = await this.connection.getBalance(new PublicKey(CONFIG.WALLET));
      return balance / 1e9;
    } catch (e) { return 0; }
  }

  /**
   * SYNC with paper trader - get optimal threshold
   */
  syncAdaptiveThreshold() {
    try {
      const adaptiveConfig = JSON.parse(fs.readFileSync(CONFIG.SCORE_CONFIG_PATH, 'utf8'));
      const paperStats = adaptiveConfig.adaptiveThresholds.paperTrader;
      
      // If paper trader has 50+ trades and WR > 70%, use its optimal threshold
      if (paperStats.totalTrades >= 50 && paperStats.winRate >= 70) {
        const recommendedThreshold = paperStats.optimalThreshold;
        
        if (recommendedThreshold !== CONFIG.MIN_SCORE) {
          console.log(`📊 ADAPTIVE SYNC: Threshold updated ${CONFIG.MIN_SCORE} → ${recommendedThreshold}`);
          console.log(`   Based on paper trader: ${paperStats.totalTrades} trades, ${paperStats.winRate}% WR`);
          
          // Update runtime config
          CONFIG.MIN_SCORE = recommendedThreshold;
          
          // Notify
          this.notify(`📊 *ADAPTIVE SCORING SYNC*\n\nThreshold updated: *${recommendedThreshold}*\nBased on paper trader data:\n• ${paperStats.totalTrades} trades tested\n• ${paperStats.winRate}% win rate\n• Best range: ${paperStats.bestScoreRange}`);
        }
        
        return recommendedThreshold;
      }
      
      return CONFIG.MIN_SCORE;
    } catch (e) {
      console.log('⚠️  Adaptive sync failed:', e.message);
      return CONFIG.MIN_SCORE;
    }
  }

  async checkTokenAge(ca) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
      const data = await res.json();
      const pair = data.pairs?.[0];
      
      // Try pairCreatedAt first, fallback to other methods
      let ageMinutes = 0;
      
      if (pair?.pairCreatedAt) {
        ageMinutes = (Date.now() - pair.pairCreatedAt) / 60000;
      } else if (pair?.baseToken?.firstTradeDate) {
        // Fallback to token first trade date if available
        ageMinutes = (Date.now() - new Date(pair.baseToken.firstTradeDate).getTime()) / 60000;
      } else {
        // If no age data, check if it's a known bluechip by symbol
        const knownBluechips = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'JTO', 'WIF', 'RAY', 'ORCA'];
        if (pair?.baseToken?.symbol && knownBluechips.includes(pair.baseToken.symbol.toUpperCase())) {
          console.log(`  🏛️ Bluechip detected: ${pair.baseToken.symbol}, skipping age check`);
          return { valid: true, age: 999999 }; // Treat as very old
        }
        return { valid: false, age: 0 };
      }
      
      return {
        valid: ageMinutes >= CONFIG.MIN_TOKEN_AGE_MINUTES,
        age: ageMinutes
      };
    } catch (e) {
      return { valid: false, age: 0 };
    }
  }

  getTokenAgeMinutes(pair) {
    if (!pair) return 0;
    if (pair.pairCreatedAt) {
      return (Date.now() - pair.pairCreatedAt) / 60000;
    }
    // Fallback for known bluechips
    const knownBluechips = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'JTO', 'WIF', 'RAY', 'ORCA'];
    if (pair.baseToken?.symbol && knownBluechips.includes(pair.baseToken.symbol.toUpperCase())) {
      return 999999; // Treat as very old
    }
    return 0;
  }

  /**
   * Check if already have an active position in this token
   */
  async checkExistingPosition(tokenCA) {
    try {
      const fs = require('fs');
      
      // Check positions.json for active positions
      const positionsFile = '/root/trading-bot/positions.json';
      if (fs.existsSync(positionsFile)) {
        const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
        for (const pos of positions) {
          if (pos.address === tokenCA) {
            console.log(`⚠️  Position already exists in positions.json: ${pos.symbol}`);
            return true;
          }
        }
      }
      
      // Also check state file for recent trades on this token
      const stateFile = '/root/trading-bot/monitor-state.json';
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        // Check both 'positions' and 'trades' arrays
        const entries = state.positions || state.trades || [];
        for (const item of entries) {
          const pos = item.pos || item; // Handle both {pos: {...}} and direct {...} formats
          if ((pos.ca === tokenCA || pos.address === tokenCA) && !pos.exited) {
            console.log(`⚠️  Active position found in monitor-state: ${pos.symbol || pos.ca}`);
            return true;
          }
        }
      }
      
      // Check for any exit monitor files matching this CA
      const { exec } = require('child_process');
      const result = await new Promise((resolve) => {
        exec(`ls /root/trading-bot/exit-monitor-*.js 2>/dev/null | grep -i "${tokenCA.slice(0, 8)}"`, (error, stdout) => {
          resolve(stdout.trim());
        });
      });
      
      return result.length > 0;
    } catch (e) {
      return false; // Assume no position if check fails
    }
  }

  async getSignalScore(symbol, pairData = null) {
    // Try external API first
    try {
      const res = await fetch('https://signal-analyzer.vercel.app/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      const data = await res.json();
      const apiScore = parseFloat(data.score) || 0;
      if (apiScore > 0) return apiScore;
    } catch (e) {
      // Fallback to local calculation
    }
    
    // LOCAL FALLBACK SCORING (Enhanced for bluechips)
    if (!pairData) return 5; // Base score if no data
    
    const tokenSymbol = pairData.baseToken?.symbol || symbol; // Fallback to param if no pairData
    const knownBluechips = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'JTO', 'WIF', 'RAY', 'ORCA', 'MSOL', 'BSOL'];
    const isBluechip = knownBluechips.includes(tokenSymbol.toUpperCase());
    
    let score = isBluechip ? 6 : 5; // Bluechips start with 6, others with 5
    
    // Volume score (relaxed for bluechips)
    const vol = parseFloat(pairData.volume?.h24 || 0);
    if (vol > 100000) score += 2;
    else if (vol > 50000) score += 1;
    else if (isBluechip && vol > 25000) score += 1; // Bluechips get bonus at lower volume
    
    // Price change score (relaxed - stable is OK)
    const change = parseFloat(pairData.priceChange?.h24 || 0);
    if (Math.abs(change) > 20) score += 1;  // Any significant movement (up or down)
    if (change > 50) score += 1;
    if (isBluechip && Math.abs(change) < 15) score += 1; // Stable bluechips get bonus
    
    // Liquidity score (enhanced)
    const liq = parseFloat(pairData.liquidity?.usd || 0);
    if (liq > 100000) score += 2;  // $100k+ = +2
    else if (liq > 50000) score += 1;  // $50k+ = +1
    else if (liq > 25000) score += 0.5; // $25k+ = +0.5
    
    // Buy pressure score
    const buys = parseFloat(pairData.txns?.h24?.buys || 0);
    const sells = parseFloat(pairData.txns?.h24?.sells || 0);
    if (buys > sells * 1.5) score += 1;
    else if (buys > sells) score += 0.5; // Any buy pressure
    
    // Bluechip bonus for high liquidity
    if (isBluechip && liq > 50000) score += 1;
    
    return Math.min(Math.floor(score), 10);
  }

  async scanAndTrade() {
    console.log('\n🔍 LIVE TRADER v4.2 - DYNAMIC TP/SL SCANNER');
    console.log('='.repeat(50));

    // CHECK: Pause/Stop flags from evaluation system
    try {
      if (fs.existsSync('/root/trading-bot/EMERGENCY_STOP')) {
        console.log('🛑 EMERGENCY STOP ACTIVE - Trading halted by evaluation system');
        await this.notify('🛑 **TRADING HALTED**\n\nEmergency stop flag detected.\nManual intervention required.');
        process.exit(0);
      }
      if (fs.existsSync('/root/trading-bot/PAUSE_TRADING')) {
        const pauseTime = fs.readFileSync('/root/trading-bot/PAUSE_TRADING', 'utf8');
        const hoursPaused = (Date.now() - parseInt(pauseTime)) / (1000 * 60 * 60);
        console.log(`⏸️  TRADING PAUSED (${hoursPaused.toFixed(1)}h ago by evaluation system)`);
        return;
      }
    } catch (e) {}

    // Sync with paper trader for optimal threshold
    if (CONFIG.ADAPTIVE_MODE) {
      this.syncAdaptiveThreshold();
    }

    const balance = await this.getBalance();

    // CHECK: Balance Protection (Drawdown limit)
    const canContinue = await this.checkBalanceProtection(balance);
    if (!canContinue) {
      console.log('🛑 Trading halted due to drawdown limit');
      process.exit(0);
    }

    console.log(`📊 Min Score Threshold: ${CONFIG.MIN_SCORE} (adaptive)`);

    if (balance < CONFIG.POSITION_SIZE + CONFIG.FEE_RESERVE) {
      console.log('❌ Insufficient balance');
      return;
    }

    if (this.tradesToday >= CONFIG.MAX_DAILY_TRADES) {
      console.log(`⏸️  Daily limit reached (${this.tradesToday}/${CONFIG.MAX_DAILY_TRADES})`);
      return;
    }

    // SYNC with Paper Trader before each scan
    console.log('\n🔄 Syncing with Paper Trader...');
    this.syncWithPaperTrader();

    // CHECK: If BOK has positive strategies, use them directly!
    if (this.hasPositiveStrategies()) {
      console.log('\n✅ BOK has positive strategies - entering DIRECT EXECUTION mode');
      const executed = await this.executeWithPositiveStrategy();
      if (executed) {
        console.log('\n✅ Trade executed using BOK positive strategy');
        return;
      }
      console.log('\n⚠️  No suitable tokens for positive strategy, falling back to scan mode');
    }
    console.log(`📊 Current threshold: Score ${CONFIG.MIN_SCORE}+`);
    
    // Update market cache for TP/SL engine
    await this.tpslEngine.updateCache();
    
    // Scan trending tokens (paper trader method)
    console.log('\n🔎 Scanning trending tokens (Paper Trader v3.1 method)...');
    
    // Get trending token profiles with retry logic
    let profiles = [];
    let retries = 3;
    while (retries > 0) {
      try {
        const profileRes = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
        if (!profileRes.ok) throw new Error(`HTTP ${profileRes.status}`);
        const contentType = profileRes.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid content type: ' + contentType);
        }
        profiles = await profileRes.json();
        break; // Success, exit retry loop
      } catch (e) {
        retries--;
        console.log(`   ⚠️ DexScreener API error (${e.message}), retries left: ${retries}`);
        if (retries === 0) {
          console.log('   ❌ Failed to fetch trending tokens, using cached market data');
          profiles = []; // Will use alternative scan method
        } else {
          await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
        }
      }
    }
    
    // Get pair data for each trending token
    let allPairs = [];
    for (const profile of profiles.slice(0, 20)) {
      try {
        const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
        if (!tokenRes.ok) continue;
        const tokenData = await tokenRes.json();
        if (tokenData.pairs) {
          allPairs = allPairs.concat(tokenData.pairs);
        }
      } catch (e) {
        // Skip failed tokens
      }
    }
    
    // EXPANDED DEX WHITELIST - Include major Solana DEXes
    const ALLOWED_DEXES = ['raydium', 'orca', 'meteora', 'pumpfun', 'pumpswap', 
                           'lifinity', 'phoenix', 'saros', 'cropper', 'goosefx',
                           'raydium-cl', 'whirlpool', 'invariant', 'sanctum'];
    
    // Filter candidates - Match paper trader settings (aggressive for more trades)
    const candidates = allPairs.filter(p => {
      const liq = parseFloat(p.liquidity?.usd || 0);
      const vol = parseFloat(p.volume?.h24 || 0);
      const age = this.getTokenAgeMinutes(p);
      return p.chainId === 'solana' &&
             ALLOWED_DEXES.includes(p.dexId) &&
             liq >= CONFIG.MIN_LIQUIDITY_USD &&  // $25k minimum liquidity
             vol >= 10000 &&   // $10k minimum volume
             age >= CONFIG.MIN_TOKEN_AGE_MINUTES;
    }).slice(0, 100) || [];  // Keep DexScreener hot/trending order, take top 100
    
    console.log(`📊 Found ${candidates.length} candidates`);
    
    for (const pair of candidates) {
      const symbol = pair.baseToken.symbol;
      console.log(`\n🔍 Checking: ${symbol}`);
      
      // Get profile
      const profileRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pair.baseToken.address}`);
      const profile = await profileRes.json();
      const token = profile.pairs?.[0];
      
      if (!token) continue;
      
      // Token age check
      const ageCheck = await this.checkTokenAge(token.baseToken.address);
      if (!ageCheck.valid) {
        console.log(`  ⏭️  Too young: ${ageCheck.age.toFixed(0)} min (need ${CONFIG.MIN_TOKEN_AGE_MINUTES})`);
        continue;
      }
      
      // Signal score (use pair data for local fallback)
      const score = await this.getSignalScore(symbol, pair);
      console.log(`  📊 Score: ${score}/10 | Age: ${ageCheck.age.toFixed(0)}m`);
      
      // Score check (relaxed for bluechips)
      const minScore = isBluechip ? Math.max(5, CONFIG.MIN_SCORE - 1) : CONFIG.MIN_SCORE;
      if (score < minScore) {
        console.log(`  ⏭️  Score too low (${score} < ${minScore})`);
        continue;
      }
      
      // Honeypot test (SKIP for established tokens)
      const knownBluechips = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'JTO', 'WIF', 'RAY', 'ORCA', 'MSOL', 'BSOL'];
      const isBluechip = knownBluechips.includes(symbol.toUpperCase());
      const ageHours = ageCheck.age / 60;
      const liq = parseFloat(pair.liquidity?.usd || 0);
      const isEstablished = isBluechip || (ageHours > 168 && liq > 100000); // 7 days + $100k liq
      
      if (isEstablished) {
        console.log(`  🏛️ Established token - skipping honeypot test`);
      } else {
        console.log(`  🔒 Honeypot test...`);
        const honeypot = await this.honeypotTest(token.baseToken.address);
        
        if (!honeypot.safe) {
          console.log(`  ⚠️  HONEYPOT DETECTED: ${honeypot.reason}`);
          await this.notify(`⚠️ **HONEYPOT BLOCKED**\n\n${symbol}: ${honeypot.reason}`);
          continue;
        }
        console.log(`  ✅ SAFE - Honeypot test passed`);
      }
      
      // SYNC Strategy from Paper Trader
      this.syncStrategyFromPaperTrader();
      
      // CHECK: Strategy-specific indicators
      if (this.currentStrategy?.indicators) {
        console.log(`  🎯 Strategy: ${this.currentStrategy.name}`);
        console.log(`     Indicators: ${this.currentStrategy.indicators.join(', ')}`);
        
        const indicatorCheck = await this.validateStrategyIndicators(token);
        console.log(`     Checks: ${indicatorCheck.checks.join(' | ') || 'Standard fibonacci'}`);
        console.log(`     Score: +${indicatorCheck.score}`);
        
        if (!indicatorCheck.passed) {
          console.log(`  ⏭️  Strategy indicators not met`);
          continue;
        }
      }
      
      // Execute with dynamic TP/SL
      await this.executeTrade({
        symbol,
        ca: token.baseToken.address,
        price: parseFloat(token.priceUsd),
        score,
        age: ageCheck.age,
        token: token // Pass full token for strategy use
      });
      
      break; // One trade per scan
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Scan complete\n');
  }

  /**
   * Calculate Fibonacci-based targets (from paper trader - 100% WR strategy)
   */
  calculateFibTargets(entryPrice, volatility = 0.10) {
    // Determine entry Fib level based on volatility (dynamic strategy)
    let entryFib = 0.618; // Default golden ratio
    if (CONFIG.FIB_ENTRY === 'dynamic') {
      if (volatility > 0.30) entryFib = 0.50;      // High vol = shallow entry
      else if (volatility > 0.15) entryFib = 0.618; // Med vol = standard
      else entryFib = 0.786;                        // Low vol = deep entry
    } else {
      entryFib = CONFIG.FIB_ENTRY;
    }
    
    // Calculate Fib extension targets
    const range = entryPrice * 0.10; // 10% price range estimate
    
    // Entry adjustment (wait for pullback to Fib level)
    const adjustedEntry = entryPrice * (1 - (entryFib * 0.05)); // 5% max pullback
    
    // TP targets (Fib extensions)
    const tp1 = adjustedEntry * (1 + (CONFIG.FIB_TP1 * 0.06));  // ~6% base
    const tp2 = adjustedEntry * (1 + (CONFIG.FIB_TP2 * 0.06));  // ~9.7% base
    
    // SL below support
    const sl = adjustedEntry * 0.97; // 3% below entry
    
    return {
      entryPrice: adjustedEntry,
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      slPercent: ((sl / adjustedEntry) - 1) * 100,
      tp1Percent: ((tp1 / adjustedEntry) - 1) * 100,
      tp2Percent: ((tp2 / adjustedEntry) - 1) * 100,
      partialExitPercent: 50,
      fibEntry: entryFib,
      strategy: 'fib_dynamic'
    };
  }
  
  /**
   * Calculate targets based on strategy config from Paper Trader
   */
  calculateStrategyTargets(entryPrice, volatility = 0.10) {
    const cfg = this.strategyConfig;
    if (!cfg) return this.calculateFibTargets(entryPrice, volatility);
    
    // Get base params from strategy config
    let slPercent = cfg.slPercent || 2;
    let tp1Percent = cfg.tp1Percent || 4;
    let tp2Percent = cfg.tp2Percent || 6;
    
    // Adjust based on volatility
    if (volatility > 0.30) {
      // High volatility - widen SL, increase TP
      slPercent *= 1.3;
      tp1Percent *= 1.2;
      tp2Percent *= 1.2;
    } else if (volatility < 0.10) {
      // Low volatility - tighten SL, reduce TP
      slPercent *= 0.8;
      tp1Percent *= 0.9;
      tp2Percent *= 0.9;
    }
    
    const sl = entryPrice * (1 - slPercent / 100);
    const tp1 = entryPrice * (1 + tp1Percent / 100);
    const tp2 = entryPrice * (1 + tp2Percent / 100);
    
    return {
      entryPrice: entryPrice,
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      slPercent: -slPercent,
      tp1Percent: tp1Percent,
      tp2Percent: tp2Percent,
      partialExitPercent: 50,
      strategy: cfg.category
    };
  }

  // ==================== BLACKLIST & STRIKE SYSTEM ====================
  
  loadBlacklist() {
    try {
      if (fs.existsSync(CONFIG.BLACKLIST_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.BLACKLIST_FILE, 'utf8'));
      }
    } catch (e) {}
    return [];
  }
  
  loadStrikeCounts() {
    try {
      if (fs.existsSync(CONFIG.STRIKE_COUNT_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STRIKE_COUNT_FILE, 'utf8'));
      }
    } catch (e) {}
    return {};
  }
  
  saveStrikeCounts(counts) {
    fs.writeFileSync(CONFIG.STRIKE_COUNT_FILE, JSON.stringify(counts, null, 2));
  }
  
  addToBlacklist(ca, symbol) {
    const blacklist = this.loadBlacklist();
    if (!blacklist.includes(ca)) {
      blacklist.push(ca);
      fs.writeFileSync(CONFIG.BLACKLIST_FILE, JSON.stringify(blacklist, null, 2));
      console.log(`🚫 BLACKLISTED: ${symbol} - 3x SL hit`);
      this.notify(`🚫 **TOKEN BLACKLISTED**\n\n${symbol}\nCA: ${ca.slice(0, 15)}...\nReason: 3x SL hit\n\n🚫 NEVER TRADING THIS AGAIN`);
    }
  }
  
  checkBlacklist(ca, symbol) {
    // Check blacklist
    const blacklist = this.loadBlacklist();
    if (blacklist.includes(ca)) {
      console.log(`   ${symbol}: 🚫 BLACKLISTED`);
      return { canTrade: false, reason: 'BLACKLISTED' };
    }
    
    // Check strike count
    const strikeCounts = this.loadStrikeCounts();
    const tokenData = strikeCounts[ca];
    
    if (tokenData) {
      const hoursSinceFirst = (Date.now() - tokenData.firstStrike) / (1000 * 60 * 60);
      
      if (hoursSinceFirst >= CONFIG.STRIKE_COOLDOWN_HOURS) {
        // Reset after 24h
        delete strikeCounts[ca];
        this.saveStrikeCounts(strikeCounts);
        console.log(`   ${symbol}: Strike count reset (24h passed)`);
      } else if (tokenData.count >= CONFIG.MAX_STRIKES) {
        // 3 strikes - blacklist
        this.addToBlacklist(ca, symbol);
        return { canTrade: false, reason: '3_STRIKES' };
      } else {
        console.log(`   ${symbol}: ⚠️ ${tokenData.count}/3 strikes`);
      }
    }
    
    return { canTrade: true };
  }
  
  recordStrike(ca, symbol) {
    const strikeCounts = this.loadStrikeCounts();
    
    if (!strikeCounts[ca]) {
      strikeCounts[ca] = {
        symbol,
        count: 1,
        firstStrike: Date.now(),
        lastStrike: Date.now()
      };
    } else {
      strikeCounts[ca].count++;
      strikeCounts[ca].lastStrike = Date.now();
    }
    
    this.saveStrikeCounts(strikeCounts);
    
    // Check if should blacklist
    if (strikeCounts[ca].count >= CONFIG.MAX_STRIKES) {
      this.addToBlacklist(ca, symbol);
    }
    
    return strikeCounts[ca].count;
  }
  
  // ==================== BALANCE PROTECTION ====================
  
  loadPeakBalance() {
    try {
      if (fs.existsSync(CONFIG.PEAK_BALANCE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.PEAK_BALANCE_FILE, 'utf8'));
        return data.peak || CONFIG.STARTING_BALANCE;
      }
    } catch (e) {}
    return CONFIG.STARTING_BALANCE;
  }
  
  savePeakBalance(balance) {
    fs.writeFileSync(CONFIG.PEAK_BALANCE_FILE, JSON.stringify({ 
      peak: balance, 
      updated: Date.now() 
    }, null, 2));
  }
  
  async checkBalanceProtection(currentBalance) {
    // Update peak if new high
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
      this.savePeakBalance(currentBalance);
      console.log(`📈 New peak balance: ${currentBalance.toFixed(4)} SOL`);
    }
    
    // Calculate drawdown
    const drawdownPercent = ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
    
    console.log(`📊 Balance: ${currentBalance.toFixed(4)} SOL | Peak: ${this.peakBalance.toFixed(4)} SOL | Drawdown: ${drawdownPercent.toFixed(1)}%`);
    
    // Check if drawdown exceeds limit
    if (drawdownPercent >= CONFIG.MAX_DRAWDOWN_PERCENT) {
      console.log(`🚨 EMERGENCY: Drawdown ${drawdownPercent.toFixed(1)}% exceeds ${CONFIG.MAX_DRAWDOWN_PERCENT}% limit!`);
      console.log(`🛑 STOPPING ALL TRADING`);
      
      // Create emergency stop file
      fs.writeFileSync(CONFIG.EMERGENCY_STOP_FILE, JSON.stringify({
        reason: 'MAX_DRAWDOWN',
        drawdown: drawdownPercent,
        peak: this.peakBalance,
        current: currentBalance,
        time: Date.now()
      }, null, 2));
      
      await this.notify(
        `🚨 **EMERGENCY STOP - MAX DRAWDOWN**\n\n` +
        `Drawdown: ${drawdownPercent.toFixed(1)}%\n` +
        `Peak: ${this.peakBalance.toFixed(4)} SOL\n` +
        `Current: ${currentBalance.toFixed(4)} SOL\n\n` +
        `All trading HALTED.\nManual intervention required.`
      );
      
      return false;
    }
    
    // Warning at 20% drawdown
    if (drawdownPercent >= 20) {
      console.log(`⚠️  WARNING: Drawdown ${drawdownPercent.toFixed(1)}% - approaching limit`);
      await this.notify(
        `⚠️ **DRAWDOWN WARNING**\n\n` +
        `Current drawdown: ${drawdownPercent.toFixed(1)}%\n` +
        `Peak: ${this.peakBalance.toFixed(4)} SOL\n` +
        `Current: ${currentBalance.toFixed(4)} SOL\n\n` +
        `Monitor closely - will stop at ${CONFIG.MAX_DRAWDOWN_PERCENT}%`
      );
    }
    
    return true;
  }
  
  // ==================== CANDLE ANALYSIS ====================
  
  async analyzeCandle(token) {
    try {
      const ca = token.baseToken?.address;
      const currentPrice = parseFloat(token.priceUsd);
      const symbol = token.baseToken?.symbol || 'UNKNOWN';
      
      // Record current price for history
      this.recordPrice(ca, currentPrice);
      
      // STEP 1: Find Recent High (10 min window)
      const recentHigh = this.findRecentHigh(ca);
      
      if (!recentHigh) {
        return {
          valid: false,
          reason: `INSUFFICIENT DATA: Need price history`,
          wait: 1
        };
      }
      
      // STEP 2: Check if >1% below high
      const percentBelowHigh = ((recentHigh - currentPrice) / recentHigh) * 100;
      
      if (percentBelowHigh <= 1) {
        return {
          valid: false,
          reason: `AVOID TOP: Only ${percentBelowHigh.toFixed(1)}% below recent high ($${recentHigh.toFixed(8)})`,
          wait: 2
        };
      }
      
      console.log(`   📊 ${symbol}: ${percentBelowHigh.toFixed(1)}% below high ($${recentHigh.toFixed(8)}) ✅`);
      
      // STEP 3: Check Red Candle Recently
      if (this.hasRedCandleRecently(ca, currentPrice)) {
        // Check if already waiting
        if (this.redCandleWait[ca] && (Date.now() - this.redCandleWait[ca]) < 120000) {
          const waited = ((Date.now() - this.redCandleWait[ca]) / 1000).toFixed(0);
          return {
            valid: false,
            reason: `WAITING: Red candle detected, waited ${waited}s/120s`,
            wait: 1
          };
        }
        
        // Start waiting
        this.redCandleWait[ca] = Date.now();
        return {
          valid: false,
          reason: `RED CANDLE: Recent decline detected, waiting 2 min`,
          wait: 2
        };
      }
      
      // STEP 4: Check Green Candle Forming
      if (!this.isGreenCandleForming(ca, currentPrice)) {
        return {
          valid: false,
          reason: `NO MOMENTUM: Green candle not forming`,
          wait: 1
        };
      }
      
      // STEP 5: ENTRY!
      const priceChange5m = parseFloat(token.priceChange?.m5 || 0);
      
      return {
        valid: true,
        reason: `✅ ENTRY CONFIRMED: ${percentBelowHigh.toFixed(1)}% below high, green candle forming (+${priceChange5m.toFixed(1)}%)`,
        belowHighPercent: percentBelowHigh,
        recentHigh: recentHigh
      };
      
    } catch (e) {
      console.error('Candle analysis error:', e.message);
      return { valid: false, reason: 'Analysis error', wait: 1 };
    }
  }
  
  // ==================== DAILY TRADE LIMIT ====================
  
  checkDailyLimit() {
    // Reset counter if new day
    const today = new Date().toDateString();
    if (this.lastTradeDate !== today) {
      this.tradesToday = 0;
      this.lastTradeDate = today;
    }
    
    if (this.tradesToday >= CONFIG.MAX_DAILY_TRADES) {
      console.log(`⚠️ Daily trade limit reached: ${this.tradesToday}/${CONFIG.MAX_DAILY_TRADES}`);
      return false;
    }
    
    return true;
  }
  
  recordTrade() {
    this.tradesToday++;
    this.lastTradeDate = new Date().toDateString();
    console.log(`📊 Trade recorded: ${this.tradesToday}/${CONFIG.MAX_DAILY_TRADES} today`);
  }

  async executeTrade(setup) {
    // CHECK 1: Daily trade limit
    if (!this.checkDailyLimit()) {
      console.log(`⚠️ Daily limit reached, skipping trade`);
      return;
    }
    
    // CHECK 2: Blacklist & Strike system
    const blacklistCheck = this.checkBlacklist(setup.ca, setup.symbol);
    if (!blacklistCheck.canTrade) {
      console.log(`⚠️  ${setup.symbol}: ${blacklistCheck.reason}, skipping`);
      return;
    }
    
    // CHECK 3: Prevent duplicate positions
    const existingPosition = await this.checkExistingPosition(setup.ca);
    if (existingPosition) {
      console.log(`⚠️  Already have position in ${setup.symbol}, skipping duplicate buy`);
      return;
    }
    
    // Calculate targets based on strategy config (from Paper Trader)
    let targets;
    if (this.strategyConfig) {
      // Use dynamic strategy params
      targets = this.calculateStrategyTargets(setup.price, this.tpslEngine.cache.volatility);
      console.log('\n🎯 STRATEGY TARGETS (from Paper Trader):');
      console.log(`  Strategy: ${this.currentStrategy?.name || 'Default'}`);
      console.log(`  Category: ${this.strategyConfig.category}`);
    } else {
      // Fallback to fibonacci
      targets = this.calculateFibTargets(setup.price, this.tpslEngine.cache.volatility);
      console.log('\n🎯 FIBONACCI TARGETS (default):');
    }
    
    console.log(`  SL: $${targets.stopLoss.toFixed(8)} (${targets.slPercent.toFixed(2)}%)`);
    console.log(`  TP1: $${targets.takeProfit1.toFixed(8)} (+${targets.tp1Percent.toFixed(2)}%)`);
    console.log(`  TP2: $${targets.takeProfit2.toFixed(8)} (+${targets.tp2Percent.toFixed(2)}%)`);
    console.log(`  Partial Exit: ${targets.partialExitPercent}% at TP1`);
    console.log(`  Max Hold: ${this.strategyConfig?.maxHoldMinutes || 15} min\n`);
    
    // Use flexible position size based on strategy performance
    const positionSize = this.currentPositionSize || CONFIG.DEFAULT_POSITION_SIZE;
    
    // Execute buy via Solana Tracker
    console.log(`🚀 EXECUTING BUY: ${setup.symbol}`);
    console.log(`   Amount: ${positionSize} SOL (flexible based on WR)`);
    console.log(`   Platform: Solana Tracker`);
    const swapResult = await this.executeSolanaTrackerBuy(setup.ca, positionSize);
    
    if (!swapResult.success) {
      console.log(`   ❌ SWAP FAILED: ${swapResult.error}`);
      await this.notify(`❌ **BUY FAILED**\n\n${setup.symbol}: ${swapResult.error}`);
      return;
    }
    
    console.log(`   ✅ SWAP SUCCESS: ${swapResult.signature.slice(0, 20)}...`);
    console.log(`   Platform: ${swapResult.platform}`);
    console.log(`   Expected: ${swapResult.expectedOutput} tokens`);
    
    // Record trade for daily limit tracking
    this.recordTrade();
    
    await this.notify(
      `✅ **TRADE EXECUTED (FIB DYNAMIC)**\n\n` +
      `**Token:** ${setup.symbol}\n` +
      `**Score:** ${setup.score}/10\n` +
      `**Entry:** $${setup.price.toFixed(8)}\n` +
      `**Size:** ${positionSize} SOL\n` +
      `**Strategy:** fib_dynamic (from paper trader)\n\n` +
      `📐 **Fibonacci Targets:**\n` +
      `SL: $${targets.stopLoss.toFixed(8)} (${targets.slPercent.toFixed(2)}%)\n` +
      `TP1: $${targets.takeProfit1.toFixed(8)} (+${targets.tp1Percent.toFixed(2)}%) 50% exit\n` +
      `TP2: $${targets.takeProfit2.toFixed(8)} (+${targets.tp2Percent.toFixed(2)}%) final\n\n` +
      `🔗 **Tx:** https://solscan.io/tx/${swapResult.signature}\n\n` +
      `🤖 Exit monitor starting...`
    );
    
    // Start exit monitor with strategy config
    const maxHoldMinutes = this.strategyConfig?.maxHoldMinutes || 15;
    this.startFibExitMonitor(setup, targets, maxHoldMinutes);
  }

  startFibExitMonitor(setup, targets, maxHoldMinutes = 15) {
    const monitorFile = `/root/trading-bot/exit-monitor-${setup.symbol.toLowerCase()}.js`;
    const monitorCode = `
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = '${CONFIG.RPC}';
const connection = new Connection(RPC);

// Load wallet (supports both bs58 and base64 formats)
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
let wallet, secretKey;
if (walletData.secretKey) {
  secretKey = new Uint8Array(Buffer.from(walletData.secretKey, 'base64'));
  wallet = Keypair.fromSecretKey(secretKey);
} else if (walletData.privateKey) {
  const bs58mod = require('bs58');
  const bs58 = bs58mod.default || bs58mod;
  secretKey = bs58.decode(walletData.privateKey);
  wallet = Keypair.fromSecretKey(secretKey);
}
console.log('Wallet loaded: ' + wallet.publicKey.toString().slice(0, 20) + '...');

const POS = {
  symbol: '${setup.symbol}',
  ca: '${setup.ca}',
  entry: ${setup.price},
  stop: ${targets.stopLoss},
  tp1: ${targets.takeProfit1},
  tp2: ${targets.takeProfit2},
  partialExit: ${targets.partialExitPercent / 100},
  strategyId: '${this.currentStrategy?.id || 'fib_618_1618'}',
  strategyName: '${this.currentStrategy?.name || 'Fib 0.618 Golden'}'
};

// BOK Feedback - Track live trade results
async function recordTradeResult(isWin, pnlPercent) {
  try {
    const fs = require('fs');
    const trackerFile = '/root/trading-bot/live-strategy-tracker.json';
    let tracker = {};
    
    if (fs.existsSync(trackerFile)) {
      tracker = JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
    }
    
    const sid = POS.strategyId;
    if (!tracker[sid]) {
      tracker[sid] = { id: sid, name: POS.strategyName, liveWins: 0, liveLosses: 0, liveTotal: 0, consecutiveLosses: 0 };
    }
    
    tracker[sid].liveTotal++;
    if (isWin) {
      tracker[sid].liveWins++;
      tracker[sid].consecutiveLosses = 0;
    } else {
      tracker[sid].liveLosses++;
      tracker[sid].consecutiveLosses++;
    }
    tracker[sid].lastUpdated = Date.now();
    
    fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2));
    console.log(\`📊 Strategy Tracker: \${POS.strategyName} | \${isWin ? 'WIN' : 'LOSS'} | Streak: \${tracker[sid].consecutiveLosses}\`);
    
    // If 3 consecutive losses, notify to move to negative
    if (tracker[sid].consecutiveLosses >= 3) {
      console.log(\`⚠️  STRATEGY ALERT: \${POS.strategyName} hit 3 losses - should move to NEGATIVE\`);
    }
  } catch (e) { console.error('Tracker error:', e.message); }
}

const BOT_TOKEN = '${BOT_TOKEN}';
const CHAT_ID = '${CHAT_ID}';
const TOPIC_ID = 24;

async function notify(msg) {
  if (process.env.LIVE_TRADER_NOTIFY === 'false') return;
  try {
    await fetch(\`https://api.telegram.org/bot\${BOT_TOKEN}/sendMessage\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, message_thread_id: TOPIC_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {}
}

async function getPrice() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + POS.ca);
    const data = await res.json();
    return data.pairs?.[0] ? parseFloat(data.pairs[0].priceUsd) : null;
  } catch (e) { return null; }
}

async function executeSell(percent = '100%') {
  try {
    const wsol = 'So11111111111111111111111111111111111111112';
    const url = \`https://swap-v2.solanatracker.io/swap?from=\${POS.ca}&to=\${wsol}&fromAmount=\${encodeURIComponent(percent)}&slippage=30&payer=\${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0\`;
    
    console.log(\`  🔄 Executing sell (\${percent})...\`);
    
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a',
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    
    const txBuf = Buffer.from(data.txn, 'base64');
    const { VersionedTransaction } = require('@solana/web3.js');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([wallet]);
    
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 3,
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    return { success: true, signature, outputAmount: data.rate?.amountOut || 0 };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

let partialExited = false;

const startTime = Date.now();
const MAX_HOLD_MS = ${maxHoldMinutes} * 60 * 1000;

async function monitor() {
  console.log('📊 Monitoring ' + POS.symbol + ' (DYNAMIC TP/SL)...');
  console.log(\`  SL: $\${POS.stop.toFixed(8)}\`);
  console.log(\`  TP1: $\${POS.tp1.toFixed(8)} (\${(POS.partialExit*100).toFixed(0)}% exit)\`);
  console.log(\`  TP2: $\${POS.tp2.toFixed(8)} (final exit)\`);
  console.log(\`  Max Hold: ${maxHoldMinutes} min\`);
  
  while (true) {
    const price = await getPrice();
    
    // Check max hold time
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > MAX_HOLD_MS && price) {
      const pnl = ((price / POS.entry) - 1) * 100;
      console.log('⏰ MAX HOLD TIME REACHED - Force exit...');
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        await notify(\`⏰ **MAX HOLD EXIT**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: \${pnl.toFixed(2)}%\\n\\nMax hold ${maxHoldMinutes} min reached\\n🔗 **Tx:** https://solscan.io/tx/\${sellResult.signature}\`);
        await recordTradeResult(pnl > 0, pnl);
      }
      process.exit(0);
    }
    
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    const pnl = ((price / POS.entry) - 1) * 100;
    const time = new Date().toLocaleTimeString();
    const minutesLeft = Math.floor((MAX_HOLD_MS - elapsedMs) / 60000);
    console.log(\`\${time} | \${POS.symbol}: $\${price.toFixed(8)} | PnL: \${pnl > 0 ? '+' : ''}\${pnl.toFixed(2)}% | Hold: \${minutesLeft}m left\`);
    
    // Kill switch (honeypot detected)
    if (pnl <= -90) { 
      console.log('💀 HONEYPOT DETECTED - KILL SWITCH');
      await notify(\`💀 **HONEYPOT DETECTED**\\n\\n\${POS.symbol}: PnL -\${Math.abs(pnl).toFixed(2)}%\\n\\nPosition abandoned.\`);
      process.exit(0);
    }
    
    // Stop loss - EXECUTE SELL
    if (price <= POS.stop) {
      console.log('🛑 STOP LOSS HIT - Executing sell...');
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        await notify(\`🛑 **STOP LOSS EXECUTED**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: \${pnl.toFixed(2)}%\\n\\n🔗 **Tx:** https://solscan.io/tx/\${sellResult.signature}\`);
        await recordTradeResult(false, pnl); // LOSS
      } else {
        await notify(\`🛑 **STOP LOSS HIT**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: \${pnl.toFixed(2)}%\\n\\n❌ Sell failed: \${sellResult.error}\\n⚠️ Manual exit required!\`);
      }
      process.exit(0);
    }
    
    // Take profit 1 (partial exit) - EXECUTE SELL
    if (!partialExited && price >= POS.tp1) {
      console.log(\`🎯 TP1 HIT - Exiting \${(POS.partialExit*100).toFixed(0)}%...\`);
      const sellResult = await executeSell('50%');
      partialExited = true;
      if (sellResult.success) {
        await notify(\`🎯 **TP1 EXECUTED**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: +\${pnl.toFixed(2)}%\\n\\nExited 50%\\n🔗 **Tx:** https://solscan.io/tx/\${sellResult.signature}\\n\\nHolding 50% for TP2...\`);
      } else {
        await notify(\`🎯 **TP1 REACHED**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: +\${pnl.toFixed(2)}%\\n\\n❌ Sell failed: \${sellResult.error}\\n⚠️ Manual exit required!\`);
      }
    }
    
    // Take profit 2 (final exit) - EXECUTE SELL
    if (price >= POS.tp2) {
      console.log('🎯 TP2 HIT - FINAL EXIT - Executing sell...');
      const sellResult = await executeSell(partialExited ? '95%' : '95%');
      if (sellResult.success) {
        await notify(\`🎯 **TP2 EXECUTED - FINAL EXIT**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: +\${pnl.toFixed(2)}%\\n\\n✅ Trade complete!\\n🔗 **Tx:** https://solscan.io/tx/\${sellResult.signature}\`);
        await recordTradeResult(true, pnl); // WIN
      } else {
        await notify(\`🎯 **TP2 REACHED**\\n\\n\${POS.symbol}: $\${price.toFixed(8)}\\nPnL: +\${pnl.toFixed(2)}%\\n\\n❌ Sell failed: \${sellResult.error}\\n⚠️ Manual exit required!\`);
      }
      process.exit(0);
    }
    
    await new Promise(r => setTimeout(r, 5000)); // 5s check
  }
}

monitor();
`;
    
    fs.writeFileSync(monitorFile, monitorCode);
    
    const { exec } = require('child_process');
    exec(`nohup node ${monitorFile} > ${setup.symbol.toLowerCase()}-exit.log 2>&1 &`, { cwd: '/root/trading-bot' });
    
    console.log(`✅ Dynamic exit monitor started for ${setup.symbol}`);
  }
}

const trader = new DynamicTrader();
trader.scanAndTrade().catch(console.error);
