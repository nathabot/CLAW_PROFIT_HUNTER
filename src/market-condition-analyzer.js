/**
 * MARKET CONDITION ANALYZER
 * Detects market regime: Bull, Bear, Sideways, High Volatility
 * Used for adaptive strategy selection
 */

const fetch = require('node-fetch');
const fs = require('fs');

const CONFIG = {
  STATE_FILE: '/root/trading-bot/market-condition.json',
  HISTORY_FILE: '/root/trading-bot/market-history.json',
  SOLANA_RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304'
};

class MarketConditionAnalyzer {
  constructor() {
    this.condition = this.loadState();
    this.history = this.loadHistory();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      regime: 'UNKNOWN',
      confidence: 0,
      lastUpdate: null,
      indicators: {}
    };
  }

  loadHistory() {
    try {
      if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
      }
    } catch (e) {}
    return { conditions: [] };
  }

  saveState() {
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.condition, null, 2));
  }

  saveHistory() {
    // Keep last 168 hours (1 week)
    if (this.history.conditions.length > 168) {
      this.history.conditions = this.history.conditions.slice(-168);
    }
    fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(this.history, null, 2));
  }

  async fetchMarketData() {
    try {
      // Get SOL price data from DexScreener
      const solRes = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
      const solData = await solRes.json();
      const solPair = solData.pairs?.find(p => p.chainId === 'solana' && p.quoteToken?.symbol === 'USDC');
      
      if (!solPair) return null;

      // Get Fear & Greed from alternative source (CryptoCompare or CoinGecko)
      const fgRes = await fetch('https://api.coingecko.com/api/v3/search/trending');
      const fgData = await fgRes.json();
      
      // Calculate market indicators
      const priceChange24h = solPair.priceChange?.h24 || 0;
      const priceChange1h = solPair.priceChange?.h1 || 0;
      const volume24h = solPair.volume?.h24 || 0;
      const volatility = Math.abs(priceChange1h) + (Math.abs(priceChange24h) / 24);
      
      // Get top movers to gauge market sentiment
      const trendingRes = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const trending = await trendingRes.json();
      let bullishCount = 0;
      let bearishCount = 0;
      
      for (const token of trending.slice(0, 10)) {
        try {
          const tokenRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`);
          const tokenData = await tokenRes.json();
          const pair = tokenData.pairs?.[0];
          if (pair) {
            const change = pair.priceChange?.h24 || 0;
            if (change > 10) bullishCount++;
            if (change < -10) bearishCount++;
          }
        } catch (e) {}
      }

      return {
        solPrice: parseFloat(solPair.priceUsd),
        priceChange24h,
        priceChange1h,
        volume24h,
        volatility,
        bullishTokens: bullishCount,
        bearishTokens: bearishCount,
        timestamp: Date.now()
      };
    } catch (e) {
      console.error('Error fetching market data:', e.message);
      return null;
    }
  }

  detectRegime(data) {
    let regime = 'SIDEWAYS';
    let confidence = 50;
    const reasons = [];

    // Price momentum analysis
    if (data.priceChange24h > 5) {
      regime = 'BULL';
      confidence = Math.min(90, 60 + Math.abs(data.priceChange24h));
      reasons.push(`SOL +${data.priceChange24h.toFixed(1)}% in 24h`);
    } else if (data.priceChange24h < -5) {
      regime = 'BEAR';
      confidence = Math.min(90, 60 + Math.abs(data.priceChange24h));
      reasons.push(`SOL ${data.priceChange24h.toFixed(1)}% in 24h`);
    }

    // Volatility check
    if (data.volatility > 15) {
      if (regime === 'BULL') {
        regime = 'BULL_VOLATILE';
        reasons.push('High volatility detected');
      } else if (regime === 'BEAR') {
        regime = 'BEAR_VOLATILE';
        reasons.push('High volatility detected');
      } else {
        regime = 'VOLATILE';
        confidence = 70;
        reasons.push(`High volatility: ${data.volatility.toFixed(1)}%`);
      }
    }

    // Market breadth (token sentiment)
    const totalExtreme = data.bullishTokens + data.bearishTokens;
    if (totalExtreme > 0) {
      const breadth = data.bullishTokens / totalExtreme;
      if (breadth > 0.7) {
        if (regime !== 'BULL' && regime !== 'BULL_VOLATILE') {
          regime = 'BULL';
          confidence = Math.max(confidence, 65);
        }
        reasons.push(`${data.bullishTokens}/10 tokens pumping`);
      } else if (breadth < 0.3) {
        if (regime !== 'BEAR' && regime !== 'BEAR_VOLATILE') {
          regime = 'BEAR';
          confidence = Math.max(confidence, 65);
        }
        reasons.push(`${data.bearishTokens}/10 tokens dumping`);
      }
    }

    // Volume confirmation
    if (data.volume24h > 1000000000) { // > $1B volume
      confidence += 10;
      reasons.push('High volume confirmation');
    }

    return { regime, confidence: Math.min(100, confidence), reasons };
  }

  getRecommendedStrategies(regime) {
    // Strategy recommendations based on market regime
    const recommendations = {
      'BULL': {
        primary: ['fib_500_1272', 'momentum_squeeze_1782', 'sr_breakout_3109'],
        secondary: ['fib_382_0881', 'smart_money_fib_4701'],
        avoid: ['dip_buying_4817', 'mean_reversion_9904'],
        positionSize: 1.0,
        slMultiplier: 1.0,
        tpMultiplier: 1.2
      },
      'BULL_VOLATILE': {
        primary: ['scalping_quick_5291', 'fib_786_deep_5998'],
        secondary: ['momentum_squeeze_1782'],
        avoid: ['swing_trade_8213', 'orderbook_funding_2044'],
        positionSize: 0.7,
        slMultiplier: 1.3,
        tpMultiplier: 1.0
      },
      'BEAR': {
        primary: ['dip_buying_4817', 'mean_reversion_9904'],
        secondary: ['fib_786_deep_5998'],
        avoid: ['momentum_squeeze_1782', 'breakout_4449'],
        positionSize: 0.5,
        slMultiplier: 1.0,
        tpMultiplier: 0.8
      },
      'BEAR_VOLATILE': {
        primary: ['sniper_exact_8923'],
        secondary: ['dip_buying_4817'],
        avoid: ['fib_500_1272', 'momentum_squeeze_1782', 'breakout_4449'],
        positionSize: 0.3,
        slMultiplier: 1.5,
        tpMultiplier: 0.6
      },
      'SIDEWAYS': {
        primary: ['range_bound_7321', 'mean_reversion_9904'],
        secondary: ['fib_500_1272', 'orderbook_funding_2044'],
        avoid: ['breakout_4449', 'momentum_squeeze_1782'],
        positionSize: 0.7,
        slMultiplier: 0.8,
        tpMultiplier: 0.9
      },
      'VOLATILE': {
        primary: ['scalping_quick_5291'],
        secondary: ['sniper_exact_8923'],
        avoid: ['swing_trade_8213', 'fib_500_1272'],
        positionSize: 0.5,
        slMultiplier: 1.5,
        tpMultiplier: 0.8
      },
      'UNKNOWN': {
        primary: ['fib_500_1272'],
        secondary: [],
        avoid: [],
        positionSize: 0.5,
        slMultiplier: 1.0,
        tpMultiplier: 1.0
      }
    };

    return recommendations[regime] || recommendations['UNKNOWN'];
  }

  async analyze() {
    console.log('🔍 Analyzing Market Condition...\n');

    const data = await this.fetchMarketData();
    if (!data) {
      console.log('❌ Failed to fetch market data');
      return null;
    }

    const { regime, confidence, reasons } = this.detectRegime(data);
    const recommendations = this.getRecommendedStrategies(regime);

    // Update condition
    this.condition = {
      regime,
      confidence,
      reasons,
      indicators: data,
      recommendations,
      lastUpdate: new Date().toISOString()
    };

    // Add to history
    this.history.conditions.push({
      timestamp: Date.now(),
      regime,
      confidence,
      solPrice: data.solPrice
    });

    this.saveState();
    this.saveHistory();

    // Output
    console.log(`📊 Market Regime: ${regime}`);
    console.log(`🎯 Confidence: ${confidence}%`);
    console.log(`📈 SOL Price: $${data.solPrice.toFixed(2)} (${data.priceChange24h > 0 ? '+' : ''}${data.priceChange24h.toFixed(2)}%)`);
    console.log(`⚡ Volatility: ${data.volatility.toFixed(2)}%`);
    console.log(`🟢 Bullish: ${data.bullishTokens} | 🔴 Bearish: ${data.bearishTokens}`);
    console.log(`\n📝 Reasons:`);
    reasons.forEach(r => console.log(`   • ${r}`));
    console.log(`\n🎯 Recommended Strategies:`);
    console.log(`   Primary: ${recommendations.primary.join(', ')}`);
    console.log(`   Position Size: ${(recommendations.positionSize * 100).toFixed(0)}%`);
    console.log(`   SL: ${recommendations.slMultiplier}x | TP: ${recommendations.tpMultiplier}x`);

    return this.condition;
  }

  getCurrentCondition() {
    return this.condition;
  }

  // Get regime persistence (how long current regime has lasted)
  getRegimeDuration() {
    const recent = this.history.conditions.slice(-24); // Last 24 hours
    if (recent.length === 0) return 0;

    const currentRegime = this.condition.regime;
    let duration = 0;

    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].regime === currentRegime) {
        duration++;
      } else {
        break;
      }
    }

    return duration;
  }
}

module.exports = MarketConditionAnalyzer;

// Run if called directly
if (require.main === module) {
  const analyzer = new MarketConditionAnalyzer();
  analyzer.analyze().catch(console.error);
}
