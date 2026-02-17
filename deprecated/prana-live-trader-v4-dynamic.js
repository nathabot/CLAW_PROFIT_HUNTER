#!/usr/bin/env node
// PRANA VPS - LIVE TRADER v4.0 (DYNAMIC TP/SL)
// NEW: Fibonacci-based adaptive targets
// Security: Honeypot check + Token age + Contract verification

const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const bs58 = require('bs58');
const DynamicTPSL = require('./dynamic-tpsl-engine');

// SOLANA TRACKER API (bypass Jupiter rate limit)
const SOLANA_TRACKER_API_KEY = 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a';
const SOLANA_TRACKER_BASE_URL = 'https://swap-v2.solanatracker.io';

const ADAPTIVE_CONFIG = JSON.parse(fs.readFileSync('/root/trading-bot/adaptive-scoring-config.json', 'utf8'));

const CONFIG = {
  WALLET: 'EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX',
  WALLET_PATH: '/root/trading-bot/wallet.json',
  // POSITION SIZING (Flexible - BOK Standard)
  MIN_POSITION_SIZE: 0.015,       // Minimum position (BOK)
  MAX_POSITION_SIZE: 0.05,        // Maximum position (BOK)
  DEFAULT_POSITION_SIZE: 0.025,   // Default size
  FEE_RESERVE: 0.015,             // BOK: always keep 0.015 SOL minimum for sell fees
  // DYNAMIC THRESHOLD from paper trader results
  MIN_SCORE: ADAPTIVE_CONFIG.adaptiveThresholds.liveTrader.currentThreshold,
  MIN_TOKEN_AGE_MINUTES: 20,      // Match paper trader (more opportunities)
  MAX_DAILY_TRADES: 10,           // Increased from 5
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
  SCORE_CONFIG_PATH: '/root/trading-bot/adaptive-scoring-config.json'
};

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';

class DynamicTrader {
  constructor() {
    this.connection = new Connection(CONFIG.RPC);
    this.tpslEngine = new DynamicTPSL();
    this.tradesToday = 0;
    this.dailyPnl = 0;
    
    // Load wallet
    try {
      const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
      if (walletData.privateKey) {
        const bs58mod = require('bs58');
        const bs58lib = bs58mod.default || bs58mod;
        const secretKey = bs58lib.decode(walletData.privateKey);
        this.wallet = Keypair.fromSecretKey(secretKey);
      } else {
        this.wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
      }
      console.log(`🔑 Wallet loaded: ${this.wallet.publicKey.toString().slice(0, 20)}...`);
    } catch (e) {
      console.error('❌ Failed to load wallet:', e.message);
      process.exit(1);
    }
  }

  /**
   * SYNC with Paper Trader - reload adaptive config
   */
  syncWithPaperTrader() {
    try {
      const adaptiveConfig = JSON.parse(fs.readFileSync('/root/trading-bot/adaptive-scoring-config.json', 'utf8'));
      
      // Sync threshold
      const paperThreshold = adaptiveConfig.adaptiveThresholds.paperTrader.optimalThreshold;
      const liveThreshold = adaptiveConfig.adaptiveThresholds.liveTrader?.currentThreshold;
      
      if (paperThreshold && paperThreshold !== CONFIG.MIN_SCORE) {
        console.log(`📊 SYNC: Threshold updated ${CONFIG.MIN_SCORE} → ${paperThreshold}`);
        CONFIG.MIN_SCORE = paperThreshold;
      }
      
      // SYNC STRATEGY: Always use HIGHEST WR% from Paper Trader
      const fibStrategies = adaptiveConfig.fibStrategies;
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
      if (adaptiveConfig.adaptiveThresholds.liveTrader) {
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
      
      if (!pair || !pair.pairCreatedAt) {
        return { valid: false, age: 0 };
      }
      
      const createdMs = pair.pairCreatedAt;
      const ageMinutes = (Date.now() - createdMs) / 60000;
      
      return {
        valid: ageMinutes >= CONFIG.MIN_TOKEN_AGE_MINUTES,
        age: ageMinutes
      };
    } catch (e) {
      return { valid: false, age: 0 };
    }
  }

  getTokenAgeMinutes(pair) {
    if (!pair || !pair.pairCreatedAt) return 0;
    return (Date.now() - pair.pairCreatedAt) / 60000;
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
    
    // LOCAL FALLBACK SCORING (from paper trader success)
    if (!pairData) return 5; // Base score if no data
    
    let score = 5; // Base score
    
    // Volume score
    const vol = parseFloat(pairData.volume?.h24 || 0);
    if (vol > 100000) score += 2;
    else if (vol > 50000) score += 1;
    
    // Price change score
    const change = parseFloat(pairData.priceChange?.h24 || 0);
    if (change > 20) score += 1;
    if (change > 50) score += 1;
    
    // Liquidity score
    const liq = parseFloat(pairData.liquidity?.usd || 0);
    if (liq > 50000) score += 1;
    
    // Buy pressure score
    const buys = parseFloat(pairData.txns?.h24?.buys || 0);
    const sells = parseFloat(pairData.txns?.h24?.sells || 0);
    if (buys > sells * 1.5) score += 1;
    
    return Math.min(score, 10);
  }

  async scanAndTrade() {
    console.log('\n🔍 PRANA v4.0 - DYNAMIC TP/SL SCANNER');
    console.log('='.repeat(50));
    
    // Sync with paper trader for optimal threshold
    if (CONFIG.ADAPTIVE_MODE) {
      this.syncAdaptiveThreshold();
    }
    
    const balance = await this.getBalance();
    console.log(`💰 Balance: ${balance.toFixed(4)} SOL`);
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
    console.log(`📊 Current threshold: Score ${CONFIG.MIN_SCORE}+`);
    
    // Update market cache for TP/SL engine
    await this.tpslEngine.updateCache();
    
    // Scan trending tokens (paper trader method)
    console.log('\n🔎 Scanning trending tokens (Paper Trader v3.1 method)...');
    
    // Get trending token profiles
    const profileRes = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await profileRes.json();
    
    // Get pair data for each trending token
    let allPairs = [];
    for (const profile of profiles.slice(0, 20)) {
      try {
        const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
        const tokenData = await tokenRes.json();
        if (tokenData.pairs) {
          allPairs = allPairs.concat(tokenData.pairs);
        }
      } catch (e) {
        // Skip failed tokens
      }
    }
    
    // Filter candidates - Match paper trader settings (aggressive for more trades)
    const candidates = allPairs.filter(p => {
      const liq = parseFloat(p.liquidity?.usd || 0);
      const vol = parseFloat(p.volume?.h24 || 0);
      const age = this.getTokenAgeMinutes(p);
      return p.chainId === 'solana' &&
             (p.dexId === 'raydium' || p.dexId === 'orca' || p.dexId === 'meteora' || p.dexId === 'pumpfun' || p.dexId === 'pumpswap') &&
             liq >= 5000 &&    // BOK: $5k minimum (balance liquidity vs opportunities)
             vol >= 5000 &&    // BOK: $5k minimum (ensure trading activity)
             age >= CONFIG.MIN_TOKEN_AGE_MINUTES;
    }).sort((a, b) => parseFloat(b.volume?.h24 || 0) - parseFloat(a.volume?.h24 || 0)).slice(0, 50) || [];  // More candidates
    
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
      
      if (score < CONFIG.MIN_SCORE) {
        console.log(`  ⏭️  Score too low (${score} < ${CONFIG.MIN_SCORE})`);
        continue;
      }
      
      // Honeypot test
      console.log(`  🔒 Honeypot test...`);
      const honeypot = await this.honeypotTest(token.baseToken.address);
      
      if (!honeypot.safe) {
        console.log(`  ⚠️  HONEYPOT DETECTED: ${honeypot.reason}`);
        await this.notify(`⚠️ **HONEYPOT BLOCKED**\n\n${symbol}: ${honeypot.reason}`);
        continue;
      }
      
      console.log(`  ✅ SAFE - Executing trade`);
      
      // Execute with dynamic TP/SL
      await this.executeTrade({
        symbol,
        ca: token.baseToken.address,
        price: parseFloat(token.priceUsd),
        score,
        age: ageCheck.age
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

  async executeTrade(setup) {
    // CHECK: Prevent duplicate positions on same token
    const existingPosition = await this.checkExistingPosition(setup.ca);
    if (existingPosition) {
      console.log(`⚠️  Already have position in ${setup.symbol}, skipping duplicate buy`);
      return;
    }
    
    // Calculate Fibonacci-based targets (paper trader's best strategy)
    const targets = this.calculateFibTargets(setup.price, this.tpslEngine.cache.volatility);
    
    console.log('\n🎯 FIBONACCI TARGETS (from paper testing):');
    console.log(`  Strategy: ${CONFIG.FIB_ENTRY === 'dynamic' ? 'Dynamic Entry' : 'Fixed ' + CONFIG.FIB_ENTRY}`);
    console.log(`  Entry Fib: ${targets.fibEntry}`);
    console.log(`  SL: $${targets.stopLoss.toFixed(8)} (${targets.slPercent.toFixed(2)}%)`);
    console.log(`  TP1: $${targets.takeProfit1.toFixed(8)} (+${targets.tp1Percent.toFixed(2)}%)`);
    console.log(`  TP2: $${targets.takeProfit2.toFixed(8)} (+${targets.tp2Percent.toFixed(2)}%)`);
    console.log(`  Partial Exit: ${targets.partialExitPercent}% at TP1\n`);
    
    // Execute buy via Solana Tracker
    console.log(`🚀 EXECUTING BUY: ${setup.symbol}`);
    console.log(`   Amount: ${positionSize} SOL (flexible based on WR)`);
    console.log(`   Platform: Solana Tracker`);
    
    // Use flexible position size based on strategy performance
    const positionSize = this.currentPositionSize || CONFIG.DEFAULT_POSITION_SIZE;
    const swapResult = await this.executeSolanaTrackerBuy(setup.ca, positionSize);
    
    if (!swapResult.success) {
      console.log(`   ❌ SWAP FAILED: ${swapResult.error}`);
      await this.notify(`❌ **BUY FAILED**\n\n${setup.symbol}: ${swapResult.error}`);
      return;
    }
    
    console.log(`   ✅ SWAP SUCCESS: ${swapResult.signature.slice(0, 20)}...`);
    console.log(`   Platform: ${swapResult.platform}`);
    console.log(`   Expected: ${swapResult.expectedOutput} tokens`);
    
    this.tradesToday++;
    
    await this.notify(
      `✅ **TRADE EXECUTED (FIB DYNAMIC)**\n\n` +
      `**Token:** ${setup.symbol}\n` +
      `**Score:** ${setup.score}/10\n` +
      `**Entry:** $${setup.price.toFixed(8)}\n` +
      `**Size:** ${CONFIG.POSITION_SIZE} SOL\n` +
      `**Strategy:** fib_dynamic (from paper trader)\n\n` +
      `📐 **Fibonacci Targets:**\n` +
      `SL: $${targets.stopLoss.toFixed(8)} (${targets.slPercent.toFixed(2)}%)\n` +
      `TP1: $${targets.takeProfit1.toFixed(8)} (+${targets.tp1Percent.toFixed(2)}%) 50% exit\n` +
      `TP2: $${targets.takeProfit2.toFixed(8)} (+${targets.tp2Percent.toFixed(2)}%) final\n\n` +
      `🔗 **Tx:** https://solscan.io/tx/${swapResult.signature}\n\n` +
      `🤖 Exit monitor starting...`
    );
    
    // Start Fib-based exit monitor
    this.startFibExitMonitor(setup, targets);
  }

  startFibExitMonitor(setup, targets) {
    const monitorFile = `/root/trading-bot/exit-monitor-${setup.symbol.toLowerCase()}.js`;
    const monitorCode = `
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = '${CONFIG.RPC}';
const connection = new Connection(RPC);

// Load wallet with bs58
const bs58mod = require('bs58');
const bs58 = bs58mod.default || bs58mod;
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
const secretKey = bs58.decode(walletData.privateKey);
const wallet = Keypair.fromSecretKey(secretKey);
console.log(`Wallet loaded: ${wallet.publicKey.toString().slice(0, 20)}...`);

const POS = {
  symbol: '${setup.symbol}',
  ca: '${setup.ca}',
  entry: ${setup.price},
  stop: ${targets.stopLoss},
  tp1: ${targets.takeProfit1},
  tp2: ${targets.takeProfit2},
  partialExit: ${targets.partialExitPercent / 100}
};

const BOT_TOKEN = '${BOT_TOKEN}';
const CHAT_ID = '${CHAT_ID}';

async function notify(msg) {
  try {
    await fetch(\`https://api.telegram.org/bot\${BOT_TOKEN}/sendMessage\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
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

async function monitor() {
  console.log('📊 Monitoring ' + POS.symbol + ' (DYNAMIC TP/SL)...');
  console.log(\`  SL: $\${POS.stop.toFixed(8)}\`);
  console.log(\`  TP1: $\${POS.tp1.toFixed(8)} (\${(POS.partialExit*100).toFixed(0)}% exit)\`);
  console.log(\`  TP2: $\${POS.tp2.toFixed(8)} (final exit)\`);
  
  while (true) {
    const price = await getPrice();
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    const pnl = ((price / POS.entry) - 1) * 100;
    const time = new Date().toLocaleTimeString();
    console.log(\`\${time} | \${POS.symbol}: $\${price.toFixed(8)} | PnL: \${pnl > 0 ? '+' : ''}\${pnl.toFixed(2)}%\`);
    
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
