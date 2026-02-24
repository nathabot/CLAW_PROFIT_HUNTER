/**
 * MULTI-SOURCE SENTIMENT ANALYZER
 * Aggregates sentiment from multiple sources
 * 
 * Sources:
 * - CoinGlass Fear & Greed
 * - DexScreener trending
 * - Global market data
 */

const fetch = require('node-fetch');

class MultiSourceSentiment {
  constructor() {
    this.sources = {
      fearGreed: null,
      marketCap: null,
      trending: null
    };
  }
  
  async analyze() {
    await Promise.all([
      this.getFearGreed(),
      this.getMarketData(),
      this.getTrending()
    ]);
    
    return this.calculateComposite();
  }
  
  async getFearGreed() {
    try {
      const res = await fetch('https://api.coinglass.com/api/v1/indicator/fear-greed?interval=1');
      const data = await res.json();
      
      if (data.data && data.data.length > 0) {
        this.sources.fearGreed = {
          value: data.data[0].value,
          label: data.data[0].classification,
          timestamp: data.data[0].timestamp
        };
      }
    } catch (e) {
      this.sources.fearGreed = { value: 50, label: 'Neutral' };
    }
  }
  
  async getMarketData() {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/global');
      const data = await res.json();
      
      if (data.data) {
        this.sources.marketCap = {
          change24h: data.data.market_cap_change_percentage_24h_usd || 0,
          btcDominance: data.data.market_cap_change_percentage_24h_usd || 0
        };
      }
    } catch (e) {
      this.sources.marketCap = { change24h: 0 };
    }
  }
  
  async getTrending() {
    try {
      const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/pump');
      const data = await res.json();
      
      if (data.pairs) {
        const pairs = data.pairs.slice(0, 20);
        const gains = pairs.filter(p => parseFloat(p.priceChange.h24) > 0).length;
        this.sources.trending = {
          total: pairs.length,
          gaining: gains,
          ratio: (gains / pairs.length * 100).toFixed(1)
        };
      }
    } catch (e) {
      this.sources.trending = null;
    }
  }
  
  calculateComposite() {
    let score = 50; // Base
    
    // Fear & Greed (weight: 40%)
    if (this.sources.fearGreed) {
      const fg = this.sources.fearGreed.value;
      if (fg < 25) score -= 20; // Extreme fear
      else if (fg < 35) score -= 10;
      else if (fg > 75) score += 20; // Extreme greed
      else if (fg > 65) score += 10;
    }
    
    // Market trend (weight: 30%)
    if (this.sources.marketCap) {
      const change = this.sources.marketCap.change24h;
      if (change > 5) score += 15;
      else if (change > 2) score += 5;
      else if (change < -5) score -= 15;
      else if (change < -2) score -= 5;
    }
    
    // Trending (weight: 30%)
    if (this.sources.trending) {
      const ratio = parseFloat(this.sources.trending.ratio);
      if (ratio > 70) score += 15;
      else if (ratio > 50) score += 5;
      else if (ratio < 30) score -= 15;
      else if (ratio < 50) score -= 5;
    }
    
    // Clamp
    score = Math.max(0, Math.min(100, score));
    
    let label;
    if (score >= 70) label = 'BULLISH';
    else if (score >= 55) label = 'POSITIVE';
    else if (score >= 45) label = 'NEUTRAL';
    else if (score >= 30) label = 'BEARISH';
    else label = 'VERY_BEARISH';
    
    return {
      score,
      label,
      sources: this.sources,
      recommendation: this.getRecommendation(score)
    };
  }
  
  getRecommendation(score) {
    if (score >= 70) {
      return { action: 'AGGRESSIVE', desc: 'Good conditions for momentum trades' };
    } else if (score >= 55) {
      return { action: 'MODERATE', desc: 'Normal trading, stick to filters' };
    } else if (score >= 45) {
      return { action: 'CAUTION', desc: 'Reduce position sizes' };
    } else {
      return { action: 'AVOID', desc: 'Poor conditions, consider pausing' };
    }
  }
}

module.exports = MultiSourceSentiment;
