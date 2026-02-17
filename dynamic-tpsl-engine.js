/**
 * DYNAMIC TP/SL ENGINE
 * Fibonacci-based adaptive targets based on market regime
 */

const fetch = require('node-fetch');

class DynamicTPSL {
  constructor() {
    this.cache = {
      fearGreed: null,
      volatility: null,
      lastUpdate: 0
    };
  }

  /**
   * Get Fear & Greed Index
   */
  async getFearGreed() {
    try {
      const res = await fetch('https://api.alternative.me/fng/');
      const data = await res.json();
      return parseInt(data.data[0].value);
    } catch (e) {
      console.error('Fear & Greed fetch error:', e.message);
      return 50; // Default neutral
    }
  }

  /**
   * Calculate 24h volatility from DexScreener
   */
  async getVolatility(tokenCA) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`);
      const data = await res.json();
      const pair = data.pairs?.[0];
      
      if (!pair) return 0.10; // Default 10%
      
      const priceChange24h = Math.abs(pair.priceChange?.h24 || 0);
      return priceChange24h / 100; // Convert to decimal
    } catch (e) {
      console.error('Volatility fetch error:', e.message);
      return 0.10;
    }
  }

  /**
   * Detect market regime
   */
  detectRegime(fearGreed, volatility) {
    // EXTREME FEAR + LOW VOLATILITY = BEAR/FLAT
    if (fearGreed < 20 && volatility < 0.15) {
      return 'BEAR';
    }
    
    // GREED + HIGH VOLATILITY = BULL
    if (fearGreed > 60 && volatility > 0.20) {
      return 'BULL';
    }
    
    // FEAR + HIGH VOLATILITY = VOLATILE_BEAR (choppy)
    if (fearGreed < 40 && volatility > 0.25) {
      return 'VOLATILE_BEAR';
    }
    
    // GREED + LOW VOLATILITY = RANGING_BULL (accumulation)
    if (fearGreed > 50 && volatility < 0.15) {
      return 'RANGING_BULL';
    }
    
    // Everything else
    return 'NEUTRAL';
  }

  /**
   * Get Fibonacci levels based on regime
   */
  getFibonacciLevels(regime) {
    const levels = {
      BEAR: {
        name: 'Bearish/Flat - Tight Scalp',
        timeframe: '5m',
        sl: 0.03,     // -3% (tight SL)
        tp1: 0.06,    // +6% (quick exit)
        tp2: 0.10,    // +10% (extended if momentum)
        partial: 0.50  // Exit 50% at TP1
      },
      
      VOLATILE_BEAR: {
        name: 'Volatile Bear - Ultra Tight',
        timeframe: '5m',
        sl: 0.025,    // -2.5% (very tight)
        tp1: 0.04,    // +4% (quick scalp)
        tp2: 0.06,    // +6% (don\'t be greedy)
        partial: 0.60  // Exit 60% at TP1 (secure more)
      },
      
      NEUTRAL: {
        name: 'Neutral - Balanced',
        timeframe: '15m',
        sl: 0.05,     // -5%
        tp1: 0.12,    // +12% (Fib 0.618)
        tp2: 0.20,    // +20% (Fib 1.0)
        partial: 0.50
      },
      
      RANGING_BULL: {
        name: 'Ranging Bull - Swing Entry',
        timeframe: '15m',
        sl: 0.06,     // -6% (wider room)
        tp1: 0.15,    // +15%
        tp2: 0.25,    // +25%
        partial: 0.40  // Keep more for runner
      },
      
      BULL: {
        name: 'Bull Market - Let it Run',
        timeframe: '1h',
        sl: 0.08,     // -8% (much wider)
        tp1: 0.25,    // +25% (Fib 1.0)
        tp2: 0.40,    // +40% (Fib 1.618 golden)
        partial: 0.30  // Keep 70% for runner
      }
    };
    
    return levels[regime] || levels.NEUTRAL;
  }

  /**
   * Calculate TP/SL prices
   */
  calculateTargets(entryPrice, tokenCA = null) {
    // Use cache if recent (< 5 min)
    const now = Date.now();
    const useCache = (now - this.cache.lastUpdate) < 5 * 60 * 1000;
    
    if (!useCache || !this.cache.fearGreed) {
      // Will update async, use defaults for now
      this.updateCache(tokenCA);
    }
    
    const fearGreed = this.cache.fearGreed || 50;
    const volatility = this.cache.volatility || 0.10;
    
    const regime = this.detectRegime(fearGreed, volatility);
    const fib = this.getFibonacciLevels(regime);
    
    const targets = {
      regime: regime,
      regimeName: fib.name,
      timeframe: fib.timeframe,
      entryPrice: entryPrice,
      stopLoss: entryPrice * (1 - fib.sl),
      takeProfit1: entryPrice * (1 + fib.tp1),
      takeProfit2: entryPrice * (1 + fib.tp2),
      partialExitPercent: fib.partial * 100,
      slPercent: -fib.sl * 100,
      tp1Percent: fib.tp1 * 100,
      tp2Percent: fib.tp2 * 100,
      fearGreed: fearGreed,
      volatility24h: (volatility * 100).toFixed(2) + '%'
    };
    
    return targets;
  }

  /**
   * Update cache async (non-blocking)
   */
  async updateCache(tokenCA = null) {
    try {
      const [fg, vol] = await Promise.all([
        this.getFearGreed(),
        tokenCA ? this.getVolatility(tokenCA) : Promise.resolve(0.10)
      ]);
      
      this.cache.fearGreed = fg;
      this.cache.volatility = vol;
      this.cache.lastUpdate = Date.now();
      
      console.log(`📊 Market cache updated: F&G ${fg}, Vol ${(vol*100).toFixed(2)}%`);
    } catch (e) {
      console.error('Cache update error:', e.message);
    }
  }

  /**
   * Format targets for display
   */
  formatTargets(targets) {
    return `
📊 **DYNAMIC TP/SL TARGETS**

**Market Regime:** ${targets.regimeName}
**Timeframe:** ${targets.timeframe}
**Fear & Greed:** ${targets.fearGreed}/100
**24h Volatility:** ${targets.volatility24h}

**Entry:** $${targets.entryPrice.toFixed(8)}

**Stop Loss:** $${targets.stopLoss.toFixed(8)} (${targets.slPercent.toFixed(2)}%)
**Take Profit 1:** $${targets.takeProfit1.toFixed(8)} (+${targets.tp1Percent.toFixed(2)}%)
**Take Profit 2:** $${targets.takeProfit2.toFixed(8)} (+${targets.tp2Percent.toFixed(2)}%)

**Exit Strategy:** 
- ${targets.partialExitPercent.toFixed(0)}% at TP1
- ${(100 - targets.partialExitPercent).toFixed(0)}% at TP2
    `.trim();
  }
}

module.exports = DynamicTPSL;

// Test if run directly
if (require.main === module) {
  const engine = new DynamicTPSL();
  
  (async () => {
    console.log('🧪 Testing Dynamic TP/SL Engine...\n');
    
    // Test entry price
    const entryPrice = 0.00012345;
    
    // Update cache first
    await engine.updateCache();
    
    // Calculate targets
    const targets = engine.calculateTargets(entryPrice);
    
    console.log(engine.formatTargets(targets));
    
    console.log('\n✅ Test complete!');
  })();
}
