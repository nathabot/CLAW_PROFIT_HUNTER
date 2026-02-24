/**
 * DLMM Tracker - COMPLETE with ALL 10 Indicators
 * 
 * Tracks all critical DLMM metrics:
 * 1. Pair Age
 * 2. Base Fee (%)
 * 3. Bin Creation Cost
 * 4. 24H Volume
 * 5. Fee/Volume Ratio
 * 6. Strategy (Spot/Curve/Bid-Ask)
 * 7. One-Way vs Two-Way
 * 8. Position Allocation
 * 9. Exit Strategy
 * 10. Additional (Liquidity distribution, bin count, etc)
 */

const fs = require('fs');

const DATA_FILE = '/root/trading-bot/learning-engine/dlmm-data.json';

class DLLMTracker {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      }
    } catch (e) {}
    return { positions: [], history: [], insights: [] };
  }

  save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
  }

  // Add position with ALL indicators
  addPosition(config) {
    const position = {
      id: Date.now(),
      // Basic Info
      name: config.name,
      poolAddress: config.poolAddress,
      tokenA: config.tokenA,
      tokenB: config.tokenB,
      
      // Indicator 1: Pair Age (in days)
      pairAge: config.pairAge || 0,
      
      // Indicator 2: Base Fee (%)
      baseFee: config.baseFee || 0.0025,
      
      // Indicator 3: Bin Creation Cost (SOL)
      binCreationCost: config.binCreationCost || 0.1,
      
      // Indicator 4: 24H Volume (USD)
      volume24h: config.volume24h || 0,
      
      // Indicator 5: Fee/Volume Ratio (calculated)
      feeToVolumeRatio: 0, // Will calculate
      
      // Indicator 6: Strategy Type
      strategy: config.strategy || 'spot', // spot, curve, bid-ask
      
      // Indicator 7: One-Way or Two-Way
      lpType: config.lpType || 'two-way', // one-way, two-way
      
      // Indicator 8: Position Allocation
      allocation: config.allocation || {
        spot: 100,
        curve: 0,
        bidAsk: 0
      },
      
      // Indicator 9: Exit Strategy
      exitStrategy: config.exitStrategy || 'two-way', // two-way, zap-out
      
      // Indicator 10: Additional
      liquidityDistribution: config.liquidity || 'uniform',
      activeBinCount: config.binCount || 0,
      volumeLiquidityRatio: 0,
      
      // Financials
      amountA: config.amountA || 0,
      amountB: config.amountB || 0,
      totalValueUSD: config.totalValueUSD || 0,
      
      // Tracking
      addedAt: new Date().toISOString(),
      status: 'active',
      totalFeesEarned: 0,
      totalTrades: 0,
      ilEstimate: 0
    };

    // Calculate derived metrics
    if (position.volume24h > 0 && position.totalValueUSD > 0) {
      position.feeToVolumeRatio = (position.baseFee * position.volume24h * 100) / position.totalValueUSD;
      position.volumeLiquidityRatio = position.volume24h / position.totalValueUSD;
    }

    this.data.positions.push(position);
    this.save();
    
    console.log(`[DLMM] Position added: ${position.name}`);
    console.log(`[DLMM] Strategy: ${position.lpType} | ${position.strategy}`);
    console.log(`[DLMM] Fee: ${(position.baseFee * 100).toFixed(2)}% | Volume 24h: $${position.volume24h.toLocaleString()}`);
    
    return position;
  }

  // Report earnings
  reportEarnings(positionId, feesUSD, tradeCount = 1) {
    const pos = this.data.positions.find(p => p.id === positionId);
    if (!pos) return;
    
    pos.totalFeesEarned += feesUSD;
    pos.totalTrades += tradeCount;
    this.save();
    
    // Add to history
    this.data.history.push({
      positionId,
      fees: feesUSD,
      trades: tradeCount,
      timestamp: new Date().toISOString()
    });
    
    this.generateInsights();
    
    console.log(`[DLMM] Earnings: +$${feesUSD.toFixed(2)} for ${pos.name}`);
    console.log(`[DLMM] Total: $${pos.totalFeesEarned.toFixed(2)} (${pos.totalTrades} trades)`);
  }

  // Generate insights based on all positions
  generateInsights() {
    const active = this.data.positions.filter(p => p.status === 'active');
    
    if (active.length === 0) return;
    
    // Find best strategy
    const byStrategy = {};
    active.forEach(p => {
      if (!byStrategy[p.strategy]) byStrategy[p.strategy] = [];
      byStrategy[p.strategy].push(p);
    });
    
    // Calculate average performance by strategy
    const strategyPerf = {};
    for (const [strat, positions] of Object.entries(byStrategy)) {
      const avgFees = positions.reduce((s, p) => s + p.totalFeesEarned, 0) / positions.length;
      strategyPerf[strat] = avgFees;
    }
    
    // Best performer
    const best = active.reduce((a, b) => 
      (a.totalFeesEarned / a.totalValueUSD) > (b.totalFeesEarned / b.totalValueUSD) ? a : b
    );
    
    // Volume/Liquidity health
    const healthyPools = active.filter(p => p.volumeLiquidityRatio > 0.1).length;
    const deadPools = active.filter(p => p.volumeLiquidityRatio < 0.01).length;
    
    this.data.insights = {
      bestStrategy: Object.entries(strategyPerf).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
      bestPerformer: best.name,
      avgFeesPerPosition: active.reduce((s, p) => s + p.totalFeesEarned, 0) / active.length,
      healthyPools,
      deadPools,
      updatedAt: new Date().toISOString()
    };
    
    this.save();
  }

  // Get full status
  getStatus() {
    const active = this.data.positions.filter(p => p.status === 'active');
    
    return {
      totalPositions: this.data.positions.length,
      activePositions: active.length,
      totalFeesEarned: active.reduce((s, p) => s + p.totalFeesEarned, 0),
      
      // Breakdown by strategy
      byStrategy: this.groupBy('strategy'),
      byLPType: this.groupBy('lpType'),
      
      // Health
      healthyPools: active.filter(p => p.volumeLiquidityRatio > 0.1).length,
      deadPools: active.filter(p => p.volumeLiquidityRatio < 0.01).length,
      
      // Insights
      insights: this.data.insights,
      
      // Positions detail
      positions: active.map(p => ({
        name: p.name,
        strategy: `${p.lpType} | ${p.strategy}`,
        fee: `${(p.baseFee * 100).toFixed(2)}%`,
        volume24h: `$${p.volume24h.toLocaleString()}`,
        feesEarned: `$${p.totalFeesEarned.toFixed(2)}`,
        volumeLiqRatio: p.volumeLiquidityRatio.toFixed(3)
      }))
    };
  }

  groupBy(field) {
    const groups = {};
    this.data.positions.filter(p => p.status === 'active').forEach(p => {
      const key = p[field] || 'unknown';
      if (!groups[key]) groups[key] = 0;
      groups[key]++;
    });
    return groups;
  }

  // Calculator: Estimate APY
  calculateAPY(volume24h, feeTier, liquidity) {
    if (!liquidity || !volume24h) return 0;
    const dailyFees = volume24h * feeTier;
    return (dailyFees * 365 / liquidity) * 100;
  }

  // Calculator: Bin creation cost
  calculateBinCost(numBins, costPerBin = 0.1) {
    return numBins * costPerBin;
  }
}

module.exports = { DLLMTracker };

// CLI
if (require.main === module) {
  const tracker = new DLLMTracker();
  const args = process.argv.slice(2);
  
  if (args[0] === 'add') {
    // node dllm-tracker.js add "SOL-USDC" "0x123..." SOL USDC 30 0.25 50000 spot two-way 100,0,0 two-way 100000
    tracker.addPosition({
      name: args[1],
      poolAddress: args[2],
      tokenA: args[3],
      tokenB: args[4],
      pairAge: parseInt(args[5] || 0),
      baseFee: parseFloat(args[6] || 0.0025),
      binCreationCost: parseFloat(args[7] || 0.1),
      volume24h: parseFloat(args[8] || 0),
      strategy: args[9] || 'spot',
      lpType: args[10] || 'two-way',
      allocation: { spot: 100, curve: 0, bidAsk: 0 },
      exitStrategy: args[11] || 'two-way',
      totalValueUSD: parseFloat(args[12] || 0)
    });
  } else if (args[0] === 'profit') {
    tracker.reportEarnings(parseInt(args[1]), parseFloat(args[2]));
  } else {
    console.log('=== DLMM Complete Tracker ===');
    console.log(JSON.stringify(tracker.getStatus(), null, 2));
  }
}
