/**
 * AUTO PUMP SCANNER v1.0
 * Full autonomous pre-grad scanner dengan STRICT filters
 * 
 * Filter requirements:
 * - Holder distribution: top holder < 50%
 * - Liquidity: > $5k
 * - Bonding curve: > 5%
 * - Token age: < 24 hours
 * - Price change: > 5% (momentum)
 * - MC: $5k - $500k
 * 
 * Entry rules:
 * - Score >= 7/10
 * - Position size: 0.005 SOL max
 * - TP: +30% / +50%
 * - SL: -15%
 */

const CONFIG = {
  // Risk Management
  MAX_POSITION_SIZE: 0.005,      // SOL
  TAKE_PROFIT_1: 30,              // % - sell 50%
  TAKE_PROFIT_2: 50,              // % - sell all
  STOP_LOSS: 15,                  // %
  
  // Filter Thresholds
  MIN_HOLDER_PERCENT: 50,         // Max % for top holder
  MIN_LIQUIDITY: 5000,            // $ minimum
  MIN_BONDING_CURVE: 5,           // % minimum
  MAX_TOKEN_AGE_HOURS: 24,        // Hours
  MIN_PRICE_CHANGE: 5,            // % minimum
  MIN_MC: 5000,                   // $
  MAX_MC: 500000,                 // $
  
  // Scoring (1-10)
  MIN_SCORE_TO_TRADE: 7,
  
  // Execution
  SLIPPAGE: 15,
  
  // Monitoring
  CHECK_INTERVAL: 60000,          // 1 minute
};

const SCORING = {
  holderDistribution: { weight: 2, maxPoints: 20 },
  liquidity: { weight: 1.5, maxPoints: 15 },
  bondingCurve: { weight: 1.5, maxPoints: 15 },
  priceMomentum: { weight: 2, maxPoints: 20 },
  volume: { weight: 1, maxPoints: 10 },
  mcRange: { weight: 1, maxPoints: 10 },
  age: { weight: 1, maxPoints: 10 },
};

class AutoPumpScanner {
  constructor() {
    this.wallet = null;
    this.positions = new Map();
    this.lastScan = null;
    this.browserTab = null;
  }
  
  async init(walletPath, browserTabId) {
    // Load wallet
    const fs = require('fs');
    const { Keypair } = require('@solana/web3.js');
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const secretKey = Buffer.from(walletData.secretKey, 'base64');
    this.wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
    
    this.browserTabId = browserTabId;
    
    console.log('🤖 AutoPump Scanner initialized');
    console.log(`   Wallet: ${this.wallet.publicKey.toString().slice(0,8)}...`);
    console.log(`   Max position: ${CONFIG.MAX_POSITION_SIZE} SOL`);
    console.log(`   Min score to trade: ${CONFIG.MIN_SCORE_TO_TRADE}/10`);
  }
  
  /**
   * MAIN SCAN FUNCTION
   * Scrape pump.fun, apply filters, score tokens
   */
  async scanTokens() {
    console.log('\n🔍 SCANNING PUMP.FUN...');
    
    try {
      // Navigate to pump.fun
      await this.navigateTo('https://pump.fun');
      await this.wait(3000);
      
      // Get page content
      const tokens = await this.extractTokens();
      
      if (tokens.length === 0) {
        console.log('⚠️ No tokens found');
        return [];
      }
      
      console.log(`📋 Found ${tokens.length} tokens`);
      
      // Apply filters
      const filtered = tokens.filter(t => this.applyFilters(t));
      console.log(`✅ ${filtered.length} tokens passed filters`);
      
      // Score filtered tokens
      const scored = filtered.map(t => ({
        ...t,
        score: this.calculateScore(t)
      })).sort((a, b) => b.score - a.score);
      
      // Show top 5
      console.log('\n📊 TOP CANDIDATES:');
      scored.slice(0, 5).forEach((t, i) => {
        console.log(`   ${i+1}. ${t.symbol || t.name.slice(0,20)} | Score: ${t.score.toFixed(1)}/10 | MC: $${t.mc} | Change: ${t.change24h}%`);
      });
      
      this.lastScan = {
        time: new Date(),
        total: tokens.length,
        filtered: filtered.length,
        topScore: scored[0]?.score || 0
      };
      
      return scored;
      
    } catch (e) {
      console.error('❌ Scan error:', e.message);
      return [];
    }
  }
  
  /**
   * Apply ALL filters - MUST pass all
   */
  applyFilters(token) {
    const issues = [];
    
    // 1. Holder distribution
    if (token.topHolderPercent && token.topHolderPercent >= CONFIG.MIN_HOLDER_PERCENT) {
      issues.push(`Top holder ${token.topHolderPercent}% >= ${CONFIG.MIN_HOLDER_PERCENT}%`);
    }
    
    // 2. Liquidity
    if (token.liquidity && token.liquidity < CONFIG.MIN_LIQUIDITY) {
      issues.push(`Liquidity $${token.liquidity} < $${CONFIG.MIN_LIQUIDITY}`);
    }
    
    // 3. Bonding curve
    if (token.bondingCurve !== undefined && token.bondingCurve < CONFIG.MIN_BONDING_CURVE) {
      issues.push(`Bonding curve ${token.bondingCurve}% < ${CONFIG.MIN_BONDING_CURVE}%`);
    }
    
    // 4. Token age
    if (token.ageHours && token.ageHours > CONFIG.MAX_TOKEN_AGE_HOURS) {
      issues.push(`Age ${token.ageHours}h > ${CONFIG.MAX_TOKEN_AGE_HOURS}h`);
    }
    
    // 5. Price momentum
    if (token.change24h !== undefined && token.change24h < CONFIG.MIN_PRICE_CHANGE) {
      issues.push(`Change ${token.change24h}% < ${CONFIG.MIN_PRICE_CHANGE}%`);
    }
    
    // 6. MC range
    if (token.mc < CONFIG.MIN_MC || token.mc > CONFIG.MAX_MC) {
      issues.push(`MC $${token.mc} outside range ${CONFIG.MIN_MC}-${CONFIG.MAX_MC}`);
    }
    
    if (issues.length > 0) {
      console.log(`   ❌ ${token.symbol || token.name}: ${issues.join(', ')}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Calculate score (1-10)
   */
  calculateScore(token) {
    let totalPoints = 0;
    let maxPoints = 0;
    
    // 1. Holder distribution (lower = better)
    if (token.topHolderPercent !== undefined) {
      const points = Math.max(0, SCORING.holderDistribution.maxPoints - (token.topHolderPercent / 100 * SCORING.holderDistribution.maxPoints));
      totalPoints += points * SCORING.holderDistribution.weight;
      maxPoints += SCORING.holderDistribution.maxPoints * SCORING.holderDistribution.weight;
    }
    
    // 2. Liquidity (higher = better)
    if (token.liquidity) {
      const points = Math.min(SCORING.liquidity.maxPoints, (token.liquidity / 50000) * SCORING.liquidity.maxPoints);
      totalPoints += points * SCORING.liquidity.weight;
      maxPoints += SCORING.liquidity.maxPoints * SCORING.liquidity.weight;
    }
    
    // 3. Bonding curve (higher = better)
    if (token.bondingCurve !== undefined) {
      const points = (token.bondingCurve / 100) * SCORING.bondingCurve.maxPoints;
      totalPoints += points * SCORING.bondingCurve.weight;
      maxPoints += SCORING.bondingCurve.maxPoints * SCORING.bondingCurve.weight;
    }
    
    // 4. Price momentum (higher = better)
    if (token.change24h !== undefined) {
      const points = Math.min(SCORING.priceMomentum.maxPoints, (token.change24h / 100) * SCORING.priceMomentum.maxPoints * 2);
      totalPoints += points * SCORING.priceMomentum.weight;
      maxPoints += SCORING.priceMomentum.maxPoints * SCORING.priceMomentum.weight;
    }
    
    // 5. Volume (higher = better)
    if (token.volume24h) {
      const points = Math.min(SCORING.volume.maxPoints, (token.volume24h / 100000) * SCORING.volume.maxPoints);
      totalPoints += points * SCORING.volume.weight;
      maxPoints += SCORING.volume.maxPoints * SCORING.volume.weight;
    }
    
    // 6. MC range (sweet spot $20k-$100k = better)
    if (token.mc) {
      let points = 0;
      if (token.mc >= 20000 && token.mc <= 100000) points = SCORING.mcRange.maxPoints;
      else if (token.mc >= 10000 && token.mc <= 200000) points = SCORING.mcRange.maxPoints * 0.7;
      else points = SCORING.mcRange.maxPoints * 0.4;
      
      totalPoints += points * SCORING.mcRange.weight;
      maxPoints += SCORING.mcRange.maxPoints * SCORING.mcRange.weight;
    }
    
    // 7. Age (newer = better for pump potential)
    if (token.ageHours !== undefined) {
      const points = Math.max(0, SCORING.age.maxPoints - (token.ageHours / 24 * SCORING.age.maxPoints));
      totalPoints += points * SCORING.age.weight;
      maxPoints += SCORING.age.maxPoints * SCORING.age.weight;
    }
    
    // Normalize to 1-10
    const score = maxPoints > 0 ? (totalPoints / maxPoints) * 10 : 0;
    return Math.min(10, Math.max(1, score));
  }
  
  /**
   * Extract tokens from page
   * Need to click on each token to get detailed info
   */
  async extractTokens() {
    // This is simplified - in real implementation would need to scrape properly
    // For now, return structure
    return [];
  }
  
  /**
   * Get detailed token info by clicking
   */
  async getTokenDetails(ca) {
    // Navigate to token page
    await this.navigateTo(`https://pump.fun/coin/${ca}`);
    await this.wait(3000);
    
    // Extract holder %, bonding curve, etc
    // Would need proper scraping here
    return {};
  }
  
  /**
   * Execute buy
   */
  async executeBuy(token, amount) {
    console.log(`\n🚀 EXECUTING BUY: ${token.symbol} | ${amount} SOL`);
    
    // Check balance
    const balance = await this.getBalance();
    if (balance < amount) {
      console.log(`❌ Insufficient balance: ${balance} SOL`);
      return null;
    }
    
    // Get swap quote
    const quote = await this.getSwapQuote(token.ca, amount);
    if (!quote) {
      console.log('❌ No quote available');
      return null;
    }
    
    // Execute swap
    const tx = await this.executeSwap(quote);
    if (tx) {
      console.log(`✅ BUY SUCCESS!`);
      console.log(`   TX: https://solscan.io/tx/${tx}`);
      console.log(`   Got: ${quote.amountOut} ${token.symbol}`);
      
      // Record position
      this.positions.set(token.ca, {
        token,
        amount: quote.amountOut,
        entryValue: amount,
        entryTime: Date.now(),
        tp1: amount * (1 + CONFIG.TAKE_PROFIT_1/100),
        tp2: amount * (1 + CONFIG.TAKE_PROFIT_2/100),
        sl: amount * (1 - CONFIG.STOP_LOSS/100),
      });
      
      return tx;
    }
    
    return null;
  }
  
  async getBalance() {
    // Would query RPC for balance
    return 0.36;
  }
  
  async getSwapQuote(tokenCA, amountIn) {
    // Use SolanaTracker API
    return null;
  }
  
  async executeSwap(quote) {
    // Sign and send transaction
    return null;
  }
  
  /**
   * Monitor positions
   */
  async monitorPositions() {
    for (const [ca, pos] of this.positions) {
      const currentValue = await this.getTokenValue(ca, pos.amount);
      const pnl = ((currentValue - pos.entryValue) / pos.entryValue) * 100;
      
      console.log(`\n📊 ${pos.token.symbol}: $${currentValue.toFixed(6)} (${pnl.toFixed(2)}%)`);
      
      // Check TP1
      if (!pos.tp1Executed && currentValue >= pos.tp1) {
        console.log('🎯 TP1 REACHED! Selling 50%...');
        await this.executeSell(ca, pos.amount * 0.5);
        pos.tp1Executed = true;
      }
      
      // Check TP2
      if (!pos.tp2Executed && currentValue >= pos.tp2) {
        console.log('🎯 TP2 REACHED! Selling all...');
        await this.executeSell(ca, pos.amount);
        pos.tp2Executed = true;
        this.positions.delete(ca);
      }
      
      // Check SL
      if (currentValue <= pos.sl) {
        console.log('🛡️ SL HIT! Selling all...');
        await this.executeSell(ca, pos.amount);
        this.positions.delete(ca);
      }
    }
  }
  
  async getTokenValue(ca, amount) {
    // Get current price and calculate value
    return 0;
  }
  
  async executeSell(ca, amount) {
    console.log(`💰 Selling ${amount} of ${ca}`);
  }
  
  async navigateTo(url) {
    // Would use browser automation
  }
  
  async wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
  
  /**
   * Start full autonomous loop
   */
  async start() {
    console.log('\n🤖 AUTO PUMP SCANNER v1.0 STARTED');
    console.log(`   Scan interval: ${CONFIG.CHECK_INTERVAL/1000}s`);
    console.log(`   Min score: ${CONFIG.MIN_SCORE_TO_TRADE}/10`);
    
    // Initial scan
    const candidates = await this.scanTokens();
    
    // Check for tradeable opportunities
    const best = candidates.find(c => c.score >= CONFIG.MIN_SCORE_TO_TRADE);
    
    if (best) {
      console.log(`\n🎯 BEST CANDIDATE: ${best.symbol} (${best.score.toFixed(1)}/10)`);
      
      // Would auto-execute here if enabled
      // await this.executeBuy(best, CONFIG.MAX_POSITION_SIZE);
    }
    
    // Set interval
    setInterval(async () => {
      await this.scanTokens();
      await this.monitorPositions();
    }, CONFIG.CHECK_INTERVAL);
  }
}

// Export for use
module.exports = { AutoPumpScanner, CONFIG };
