/**
 * MONTE CARLO SIMULATOR
 * 
 * Simulate thousands of trade sequences to validate strategy
 * 
 * Key insight: One backtest path is insufficient
 * Monte Carlo shows range of possible outcomes
 */

class MonteCarloSimulator {
  constructor(trades, numSimulations = 10000) {
    this.trades = trades; // Array of trade returns (e.g., [0.1, -0.05, 0.15])
    this.numSimulations = numSimulations;
  }
  
  // Run Monte Carlo simulation
  simulate() {
    const results = [];
    
    for (let i = 0; i < this.numSimulations; i++) {
      const result = this.simulateSequence();
      results.push(result);
    }
    
    return this.analyzeResults(results);
  }
  
  // Simulate one random sequence of trades
  simulateSequence() {
    let balance = 1.0; // Start at 1.0 (normalized)
    const sequence = [];
    
    // Shuffle trades randomly
    const shuffled = [...this.trades].sort(() => Math.random() - 0.5);
    
    for (const tradeReturn of shuffled) {
      balance *= (1 + tradeReturn);
      sequence.push(balance);
    }
    
    return {
      finalBalance: balance,
      maxDrawdown: this.calculateMaxDrawdown(sequence),
      trades: shuffled.length
    };
  }
  
  // Calculate maximum drawdown from sequence
  calculateMaxDrawdown(sequence) {
    let maxBalance = sequence[0];
    let maxDrawdown = 0;
    
    for (const balance of sequence) {
      if (balance > maxBalance) {
        maxBalance = balance;
      }
      
      const drawdown = (maxBalance - balance) / maxBalance;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }
  
  // Analyze simulation results
  analyzeResults(results) {
    const finalBalances = results.map(r => r.finalBalance).sort((a, b) => a - b);
    const maxDrawdowns = results.map(r => r.maxDrawdown).sort((a, b) => a - b);
    
    return {
      // Final balance statistics
      medianReturn: this.percentile(finalBalances, 50),
      worstCase: this.percentile(finalBalances, 5), // 5th percentile
      bestCase: this.percentile(finalBalances, 95), // 95th percentile
      
      // Drawdown statistics
      medianDrawdown: this.percentile(maxDrawdowns, 50),
      worstDrawdown: this.percentile(maxDrawdowns, 95), // 95th percentile
      
      // Probability calculations
      probabilityOfProfit: results.filter(r => r.finalBalance > 1).length / results.length,
      probabilityOf50Loss: results.filter(r => r.finalBalance < 0.5).length / results.length,
      
      // Summary
      isValid: this.percentile(finalBalances, 5) > 0.8, // Worst case still profitable
      recommended: this.percentile(maxDrawdowns, 95) < 0.3 // Max DD < 30%
    };
  }
  
  // Calculate percentile
  percentile(arr, p) {
    const index = Math.floor((p / 100) * arr.length);
    return arr[Math.min(index, arr.length - 1)];
  }
  
  // Quick validation check
  validateStrategy(minTrades = 15) {
    if (this.trades.length < minTrades) {
      return {
        valid: false,
        reason: `Insufficient trades: ${this.trades.length} < ${minTrades}`,
        confidence: 'LOW'
      };
    }
    
    const results = this.simulate();
    
    if (!results.isValid) {
      return {
        valid: false,
        reason: 'Strategy fails in worst case scenarios',
        confidence: 'LOW'
      };
    }
    
    return {
      valid: results.recommended,
      stats: results,
      confidence: this.trades.length >= 50 ? 'HIGH' : 'MEDIUM'
    };
  }
}

module.exports = MonteCarloSimulator;
