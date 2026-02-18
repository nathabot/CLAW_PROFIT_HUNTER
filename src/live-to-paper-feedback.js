/**
 * LIVE TO PAPER FEEDBACK SYSTEM
 * Updates Paper Trader weights based on Live Trade results
 * Creates adaptive learning loop
 */

const fs = require('fs');

const CONFIG = {
  LIVE_TRACKER: '/root/trading-bot/live-strategy-tracker.json',
  PAPER_STATE: '/root/trading-bot/paper-trader-v5-state.json',
  FEEDBACK_LOG: '/root/trading-bot/feedback-loop.json',
  WEIGHT_ADJUSTMENT: {
    WIN: 1.1,      // +10% weight on win
    LOSS: 0.85,    // -15% weight on loss
    MAX_WEIGHT: 2.0,
    MIN_WEIGHT: 0.3
  }
};

class LiveToPaperFeedback {
  constructor() {
    this.feedback = this.loadFeedback();
  }

  loadFeedback() {
    try {
      if (fs.existsSync(CONFIG.FEEDBACK_LOG)) {
        return JSON.parse(fs.readFileSync(CONFIG.FEEDBACK_LOG, 'utf8'));
      }
    } catch (e) {}
    return {
      adjustments: [],
      currentWeights: {},
      lastUpdate: null
    };
  }

  saveFeedback() {
    fs.writeFileSync(CONFIG.FEEDBACK_LOG, JSON.stringify(this.feedback, null, 2));
  }

  loadLiveResults() {
    try {
      if (fs.existsSync(CONFIG.LIVE_TRACKER)) {
        return JSON.parse(fs.readFileSync(CONFIG.LIVE_TRACKER, 'utf8'));
      }
    } catch (e) {}
    return {};
  }

  loadPaperState() {
    try {
      if (fs.existsSync(CONFIG.PAPER_STATE)) {
        return JSON.parse(fs.readFileSync(CONFIG.PAPER_STATE, 'utf8'));
      }
    } catch (e) {}
    return { results: {}, strategyWeights: {} };
  }

  calculateLiveWR(strategyId) {
    const liveData = this.loadLiveResults();
    const data = liveData[strategyId];
    
    if (!data || data.liveTotal < 3) return null; // Need at least 3 trades
    
    return {
      wr: data.liveWins / data.liveTotal,
      total: data.liveTotal,
      wins: data.liveWins,
      losses: data.liveLosses,
      consecutiveLosses: data.consecutiveLosses
    };
  }

  adjustWeight(strategyId, result) {
    const currentWeight = this.feedback.currentWeights[strategyId] || 1.0;
    let newWeight = currentWeight;
    
    if (result === 'WIN') {
      newWeight = Math.min(CONFIG.WEIGHT_ADJUSTMENT.MAX_WEIGHT, currentWeight * CONFIG.WEIGHT_ADJUSTMENT.WIN);
    } else if (result === 'LOSS') {
      newWeight = Math.max(CONFIG.WEIGHT_ADJUSTMENT.MIN_WEIGHT, currentWeight * CONFIG.WEIGHT_ADJUSTMENT.LOSS);
    }
    
    const adjustment = {
      timestamp: Date.now(),
      strategyId,
      result,
      oldWeight: currentWeight,
      newWeight,
      reason: result === 'WIN' ? 'Live trade profitable' : 'Live trade loss'
    };
    
    this.feedback.adjustments.push(adjustment);
    this.feedback.currentWeights[strategyId] = newWeight;
    
    // Keep only last 100 adjustments
    if (this.feedback.adjustments.length > 100) {
      this.feedback.adjustments = this.feedback.adjustments.slice(-100);
    }
    
    return adjustment;
  }

  updatePaperTraderWeights() {
    console.log('🔄 Updating Paper Trader weights from Live results...\n');
    
    const liveData = this.loadLiveResults();
    const paperState = this.loadPaperState();
    
    let updated = 0;
    
    for (const strategyId in liveData) {
      const live = liveData[strategyId];
      
      // Need at least 3 live trades for reliable feedback
      if (live.liveTotal < 3) continue;
      
      const liveWR = live.liveWins / live.liveTotal;
      const paperResult = paperState.results?.[strategyId];
      
      if (!paperResult) continue;
      
      const paperWR = paperResult.wins / paperResult.total;
      
      console.log(`📊 ${live.name || strategyId}:`);
      console.log(`   Live WR: ${(liveWR * 100).toFixed(1)}% (${live.liveWins}/${live.liveTotal})`);
      console.log(`   Paper WR: ${(paperWR * 100).toFixed(1)}%`);
      
      // Significant divergence detection
      const divergence = Math.abs(liveWR - paperWR);
      
      if (divergence > 0.15) { // >15% difference
        console.log(`   ⚠️  Divergence detected: ${(divergence * 100).toFixed(1)}%`);
        
        if (liveWR < paperWR) {
          // Live underperforming - reduce weight
          const adj = this.adjustWeight(strategyId, 'LOSS');
          console.log(`   🔻 Weight: ${adj.oldWeight.toFixed(2)} → ${adj.newWeight.toFixed(2)}`);
        } else {
          // Live outperforming - increase weight
          const adj = this.adjustWeight(strategyId, 'WIN');
          console.log(`   🔺 Weight: ${adj.oldWeight.toFixed(2)} → ${adj.newWeight.toFixed(2)}`);
        }
        updated++;
      } else if (live.consecutiveLosses >= 2) {
        // Warning: consecutive losses
        console.log(`   ⚠️  ${live.consecutiveLosses} consecutive losses`);
        const adj = this.adjustWeight(strategyId, 'LOSS');
        console.log(`   🔻 Weight: ${adj.oldWeight.toFixed(2)} → ${adj.newWeight.toFixed(2)}`);
        updated++;
      } else {
        console.log(`   ✅ Aligned (${(divergence * 100).toFixed(1)}% diff)`);
      }
    }
    
    this.feedback.lastUpdate = new Date().toISOString();
    this.saveFeedback();
    
    console.log(`\n✅ Updated ${updated} strategy weights`);
    return updated;
  }

  getStrategyPriority(strategyId) {
    const weight = this.feedback.currentWeights[strategyId] || 1.0;
    
    if (weight >= 1.5) return 'HIGH';
    if (weight >= 0.8) return 'NORMAL';
    if (weight >= 0.5) return 'LOW';
    return 'AVOID';
  }

  applyToPaperTrader() {
    console.log('\n📝 Applying weights to Paper Trader state...\n');
    
    const paperState = this.loadPaperState();
    
    // Add strategyWeights if not exists
    if (!paperState.strategyWeights) {
      paperState.strategyWeights = {};
    }
    
    // Apply current weights
    for (const strategyId in this.feedback.currentWeights) {
      const weight = this.feedback.currentWeights[strategyId];
      const priority = this.getStrategyPriority(strategyId);
      
      paperState.strategyWeights[strategyId] = {
        weight,
        priority,
        lastUpdated: Date.now()
      };
      
      console.log(`   ${strategyId}: ${weight.toFixed(2)} (${priority})`);
    }
    
    // Save updated state
    fs.writeFileSync(CONFIG.PAPER_STATE, JSON.stringify(paperState, null, 2));
    console.log('\n✅ Paper Trader state updated');
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 LIVE → PAPER FEEDBACK REPORT');
    console.log('='.repeat(60));
    
    console.log('\n🎯 Current Strategy Weights:');
    const sorted = Object.entries(this.feedback.currentWeights)
      .sort((a, b) => b[1] - a[1]);
    
    for (const [strategyId, weight] of sorted) {
      const priority = this.getStrategyPriority(strategyId);
      const indicator = weight >= 1.0 ? '🔺' : weight >= 0.8 ? '➡️' : '🔻';
      console.log(`   ${indicator} ${strategyId}: ${weight.toFixed(2)} [${priority}]`);
    }
    
    console.log(`\n📈 Total Adjustments: ${this.feedback.adjustments.length}`);
    console.log(`🕐 Last Update: ${this.feedback.lastUpdate || 'Never'}`);
    
    // Recent adjustments
    if (this.feedback.adjustments.length > 0) {
      console.log('\n📝 Recent Adjustments:');
      this.feedback.adjustments.slice(-5).forEach(adj => {
        const date = new Date(adj.timestamp).toLocaleString();
        const arrow = adj.result === 'WIN' ? '🔺' : '🔻';
        console.log(`   ${arrow} ${adj.strategyId}: ${adj.oldWeight.toFixed(2)} → ${adj.newWeight.toFixed(2)} (${adj.result})`);
      });
    }
  }

  async run() {
    console.log('='.repeat(60));
    console.log('🔄 LIVE → PAPER FEEDBACK LOOP');
    console.log('='.repeat(60) + '\n');
    
    const updated = this.updatePaperTraderWeights();
    
    if (updated > 0) {
      this.applyToPaperTrader();
    }
    
    this.generateReport();
    
    console.log('\n✅ Feedback loop complete');
  }
}

module.exports = LiveToPaperFeedback;

// Run if called directly
if (require.main === module) {
  const feedback = new LiveToPaperFeedback();
  feedback.run().catch(console.error);
}
