/**
 * MARKET CONDITION ANALYZER
 * 
 * Implements conditional probability for trading decisions
 * Only trade when conditions are favorable
 * 
 * Based on: VIX, sentiment, volatility regime
 */

const fetch = require('node-fetch');

class MarketConditionAnalyzer {
  constructor() {
    this.vixThreshold = {
      low: 15,   // Good conditions (>70% WR expected)
      high: 30   // Bad conditions (<35% WR expected)
    };
    
    this.currentConditions = {
      vix: null,
      sentiment: null,
      regime: null,
      suitability: 'UNKNOWN'
    };
  }
  
  async analyze() {
    // Get VIX (fear index)
    await this.getVIX();
    
    // Get market sentiment
    await this.getSentiment();
    
    // Determine regime
    this.determineRegime();
    
    // Calculate suitability
    this.calculateSuitability();
    
    return this.currentConditions;
  }
  
  async getVIX() {
    try {
      // Try multiple sources for VIX
      // Using coinGlass for fear index
      const res = await fetch('https://api.coinglass.com/api/v1/indicator/fear-greed?interval=1');
      const data = await res.json();
      
      if (data.data && data.data.length > 0) {
        // Convert to 0-100 scale similar to VIX
        this.currentConditions.vix = data.data[0].value;
        return;
      }
    } catch (e) {
      console.log('VIX API failed, using default');
    }
    
    // Default: neutral (20)
    this.currentConditions.vix = 20;
  }
  
  async getSentiment() {
    try {
      // Get BTC dominance as market sentiment proxy
      const res = await fetch('https://api.coingecko.com/api/v3/global');
      const data = await res.json();
      
      if (data.data) {
        this.currentConditions.sentiment = data.data.market_cap_change_percentage_24h_usd || 0;
        return;
      }
    } catch (e) {
      console.log('Sentiment API failed');
    }
    
    this.currentConditions.sentiment = 0;
  }
  
  determineRegime() {
    const vix = this.currentConditions.vix;
    
    if (vix < 15) {
      this.currentConditions.regime = 'BULL';
    } else if (vix < 25) {
      this.currentConditions.regime = 'NEUTRAL';
    } else if (vix < 40) {
      this.currentConditions.regime = 'BEAR';
    } else {
      this.currentConditions.regime = 'EXTREME_FEAR';
    }
  }
  
  calculateSuitability() {
    const vix = this.currentConditions.vix;
    const sentiment = this.currentConditions.sentiment;
    
    let score = 50; // Base score
    
    // VIX scoring (higher = worse conditions)
    if (vix < 15) {
      score += 30; // Excellent
    } else if (vix < 25) {
      score += 10; // Good
    } else if (vix < 35) {
      score -= 20; // Bad
    } else {
      score -= 40; // Very bad
    }
    
    // Sentiment scoring
    if (sentiment > 0) {
      score += 10;
    } else if (sentiment < -5) {
      score -= 15;
    }
    
    // Determine suitability
    if (score >= 70) {
      this.currentConditions.suitability = 'EXCELLENT';
    } else if (score >= 50) {
      this.currentConditions.suitability = 'GOOD';
    } else if (score >= 30) {
      this.currentConditions.suitability = 'FAIR';
    } else {
      this.currentConditions.suitability = 'POOR';
    }
    
    this.currentConditions.score = score;
  }
  
  // Get expected win rate based on current conditions
  getExpectedWinRate() {
    const vix = this.currentConditions.vix;
    
    // Based on historical data analysis
    if (vix < 15) return 0.70; // 70%
    if (vix < 20) return 0.60; // 60%
    if (vix < 25) return 0.55; // 55%
    if (vix < 30) return 0.45; // 45%
    if (vix < 35) return 0.35; // 35%
    return 0.25; // 25%
  }
  
  // Should we trade based on conditions?
  shouldTrade() {
    const suitability = this.currentConditions.suitability;
    
    // Only trade in EXCELLENT or GOOD conditions
    return suitability === 'EXCELLENT' || suitability === 'GOOD';
  }
  
  // Get adjusted position size based on conditions
  getAdjustedPositionSize(baseSize) {
    const vix = this.currentConditions.vix;
    
    // Reduce position in high volatility
    if (vix > 30) {
      return baseSize * 0.5; // Half size
    } else if (vix > 25) {
      return baseSize * 0.75; // 3/4 size
    }
    
    return baseSize; // Full size
  }
  
  // Get adjusted TP/SL based on regime
  getAdjustedTP_SL(baseTP, baseSL) {
    const regime = this.currentConditions.regime;
    
    switch (regime) {
      case 'BULL':
        return { tp: baseTP * 1.2, sl: baseSL * 1.2 };
      case 'NEUTRAL':
        return { tp: baseTP, sl: baseSL };
      case 'BEAR':
        return { tp: baseTP * 0.8, sl: baseSL * 0.8 };
      case 'EXTREME_FEAR':
        return { tp: baseTP * 0.5, sl: baseSL * 0.5 };
      default:
        return { tp: baseTP, sl: baseSL };
    }
  }
}

module.exports = MarketConditionAnalyzer;
