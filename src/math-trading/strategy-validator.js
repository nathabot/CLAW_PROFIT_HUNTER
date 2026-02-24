/**
 * STRATEGY VALIDATOR
 * 
 * Validates trading strategy before going live
 * Based on: Sample size, Monte Carlo, Statistical tests
 * 
 * CRITICAL: Don't judge strategy until sufficient data
 */

const MonteCarloSimulator = require('./monte-carlo-simulator');

class StrategyValidator {
  constructor() {
    this.minSampleSize = 15; // Minimum trades before judgment
    this.recommendedSampleSize = 50;
    
    // Performance thresholds
    this.minWinRate = 0.40; // 40%
    this.minExpectancy = 0.02; // 2%
    this.maxDrawdown = 0.30; // 30%
  }
  
  // Validate from trade history
  validateFromHistory(tradeHistory) {
    const trades = tradeHistory.map(t => t.pnlPercent / 100); // Convert to decimal
    
    // Check sample size
    if (trades.length < this.minSampleSize) {
      return {
        valid: false,
        status: 'INSUFFICIENT_DATA',
        message: `Need ${this.minSampleSize} trades, have ${trades.length}`,
        tradesRequired: this.minSampleSize - trades.length,
        confidence: 'NONE'
      };
    }
    
    // Calculate statistics
    const stats = this.calculateStatistics(trades);
    
    // Run Monte Carlo
    const mc = new MonteCarloSimulator(trades, 5000);
    const mcResults = mc.simulate();
    
    // Determine validity
    const isValid = 
      stats.winRate >= this.minWinRate &&
      stats.expectancy >= this.minExpectancy &&
      mcResults.worstCase > 0.5 && // Don't lose more than 50% in worst case
      mcResults.worstDrawdown < this.maxDrawdown;
    
    return {
      valid: isValid,
      status: isValid ? 'VALIDATED' : 'NOT_VALIDATED',
      statistics: stats,
      monteCarlo: mcResults,
      confidence: trades.length >= this.recommendedSampleSize ? 'HIGH' : 'MEDIUM',
      recommendation: this.getRecommendation(isValid, stats, mcResults)
    };
  }
  
  // Calculate basic statistics
  calculateStatistics(trades) {
    const wins = trades.filter(t => t > 0);
    const losses = trades.filter(t => t < 0);
    
    const winRate = wins.length / trades.length;
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
    
    const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
    
    // Calculate standard deviation
    const mean = trades.reduce((a, b) => a + b, 0) / trades.length;
    const variance = trades.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / trades.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      totalTrades: trades.length,
      winRate: winRate,
      avgWin: avgWin,
      avgLoss: avgLoss,
      expectancy: expectancy,
      stdDev: stdDev,
      sharpe: stdDev > 0 ? (expectancy / stdDev) : 0
    };
  }
  
  // Get recommendation
  getRecommendation(isValid, stats, mcResults) {
    if (!isValid) {
      return {
        action: 'DO_NOT_TRADE',
        reason: 'Strategy fails validation criteria',
        details: this.getFailureReason(stats, mcResults)
      };
    }
    
    if (mcResults.probabilityOfProfit < 0.7) {
      return {
        action: 'CAUTION',
        reason: 'Less than 70% probability of profit',
        details: mcResults
      };
    }
    
    return {
      action: 'TRADE',
      reason: 'Strategy validated successfully',
      details: mcResults
    };
  }
  
  // Get failure reason
  getFailureReason(stats, mcResults) {
    const reasons = [];
    
    if (stats.winRate < this.minWinRate) {
      reasons.push(`Win rate ${(stats.winRate*100).toFixed(1)}% < ${this.minWinRate*100}%`);
    }
    
    if (stats.expectancy < this.minExpectancy) {
      reasons.push(`Expectancy ${(stats.expectancy*100).toFixed(1)}% < ${this.minExpectancy*100}%`);
    }
    
    if (mcResults.worstCase < 0.5) {
      reasons.push(`Worst case return ${(mcResults.worstCase*100).toFixed(1)}% < 50%`);
    }
    
    return reasons;
  }
}

module.exports = StrategyValidator;
