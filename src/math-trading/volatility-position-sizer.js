/**
 * VOLATILITY-BASED POSITION SIZER
 * 
 * Position sizing using Standard Deviation
 * 
 * Key insight: Fixed position sizing is suboptimal
 * Adjust based on recent volatility
 */

class VolatilityPositionSizer {
  constructor(config = {}) {
    this.maxPosition = config.maxPosition || 0.02; // SOL
    this.minPosition = config.minPosition || 0.002; // SOL
    this.targetRisk = config.targetRisk || 0.02; // 2% risk per trade
    
    // Lookback period for volatility calculation
    this.lookback = config.lookback || 20; // 20 data points
  }
  
  // Calculate volatility (standard deviation) of returns
  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    
    // Calculate returns
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    // Calculate mean
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    // Calculate variance
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    // Standard deviation
    return Math.sqrt(variance);
  }
  
  // Calculate position size based on volatility
  calculatePositionSize(accountBalance, volatility, targetRisk = this.targetRisk) {
    // If no volatility data, use default
    if (volatility === 0 || !volatility) {
      return this.maxPosition * 0.5;
    }
    
    // Kelly-style sizing (simplified)
    // Size = (Target Risk) / (Volatility * 2)
    // Multiply by 2 for more conservative sizing
    const rawSize = (targetRisk / volatility) * accountBalance;
    
    // Clamp to min/max
    return Math.max(this.minPosition, Math.min(this.maxPosition, rawSize));
  }
  
  // Get volatility regime
  getVolatilityRegime(currentVol, historicalVol) {
    const ratio = currentVol / historicalVol;
    
    if (ratio > 2) return 'EXTREME'; // Very volatile
    if (ratio > 1.5) return 'HIGH';
    if (ratio > 0.7) return 'NORMAL';
    return 'LOW';
  }
  
  // Adjust TP/SL based on volatility
  adjustForVolatility(baseTP, baseSL, volatility, normalVol) {
    const ratio = volatility / normalVol;
    
    // In high volatility, widen stops, reduce targets
    if (ratio > 1.5) {
      return {
        tp: baseTP * 1.3, // Wider TP
        sl: baseSL * 1.3  // Wider SL
      };
    } else if (ratio < 0.7) {
      return {
        tp: baseTP * 0.8, // Tighter TP
        sl: baseSL * 0.8  // Tighter SL
      };
    }
    
    return { tp: baseTP, sl: baseSL };
  }
  
  // Main method: calculate everything
  calculate(accountBalance, priceHistory) {
    const volatility = this.calculateVolatility(priceHistory);
    const position = this.calculatePositionSize(accountBalance, volatility);
    
    return {
      positionSize: position,
      volatility: volatility,
      risk: position * volatility * 2 // Approximate risk
    };
  }
}

module.exports = VolatilityPositionSizer;
