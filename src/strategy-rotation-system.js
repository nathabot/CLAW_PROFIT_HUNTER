/**
 * STRATEGY ROTATION SYSTEM
 * Auto-switch strategies based on market condition and performance
 * Integrates with BOK and Market Condition Analyzer
 */

const fs = require('fs');
const fetch = require('node-fetch');
const MarketConditionAnalyzer = require('./market-condition-analyzer');

const CONFIG = {
  BOK_DIR: '/root/trading-bot/bok',
  ROTATION_STATE: '/root/trading-bot/strategy-rotation.json',
  LIVE_TRACKER: '/root/trading-bot/live-strategy-tracker.json',
  PAPER_STATE: '/root/trading-bot/paper-trader-v5-state.json',
  ROTATION_COOLDOWN: 30 * 60 * 1000, // 30 min between rotations
  MIN_LIVE_TRADES_FOR_ROTATION: 5
};

class StrategyRotationSystem {
  constructor() {
    this.state = this.loadRotationState();
    this.marketAnalyzer = new MarketConditionAnalyzer();
  }

  loadRotationState() {
    try {
      if (fs.existsSync(CONFIG.ROTATION_STATE)) {
        return JSON.parse(fs.readFileSync(CONFIG.ROTATION_STATE, 'utf8'));
      }
    } catch (e) {}
    return {
      currentStrategy: null,
      lastRotation: null,
      rotationHistory: [],
      strategyPerformance: {},
      blacklist: []
    };
  }

  saveRotationState() {
    fs.writeFileSync(CONFIG.ROTATION_STATE, JSON.stringify(this.state, null, 2));
  }

  loadLiveTracker() {
    try {
      if (fs.existsSync(CONFIG.LIVE_TRACKER)) {
        return JSON.parse(fs.readFileSync(CONFIG.LIVE_TRACKER, 'utf8'));
      }
    } catch (e) {}
    return {};
  }

  loadPaperResults() {
    try {
      if (fs.existsSync(CONFIG.PAPER_STATE)) {
        const state = JSON.parse(fs.readFileSync(CONFIG.PAPER_STATE, 'utf8'));
        return state.results || {};
      }
    } catch (e) {}
    return {};
  }

  async shouldRotate() {
    // Check cooldown
    if (this.state.lastRotation) {
      const timeSinceRotation = Date.now() - this.state.lastRotation;
      if (timeSinceRotation < CONFIG.ROTATION_COOLDOWN) {
        const minsLeft = Math.ceil((CONFIG.ROTATION_COOLDOWN - timeSinceRotation) / 60000);
        console.log(`⏳ Rotation cooldown: ${minsLeft} min remaining`);
        return false;
      }
    }

    // Check if we have enough live data
    const liveTracker = this.loadLiveTracker();
    let totalLiveTrades = 0;
    for (const sid in liveTracker) {
      totalLiveTrades += liveTracker[sid].liveTotal || 0;
    }

    if (totalLiveTrades < CONFIG.MIN_LIVE_TRADES_FOR_ROTATION) {
      console.log(`⏳ Not enough live trades (${totalLiveTrades}/${CONFIG.MIN_LIVE_TRADES_FOR_ROTATION})`);
      return false;
    }

    return true;
  }

  calculateStrategyScore(strategyId, marketCondition) {
    const liveTracker = this.loadLiveTracker();
    const paperResults = this.loadPaperResults();
    
    let score = 50; // Base score
    
    // Live performance weight: 60%
    const liveData = liveTracker[strategyId];
    if (liveData && liveData.liveTotal > 0) {
      const liveWR = liveData.liveWins / liveData.liveTotal;
      const liveScore = liveWR * 100;
      
      // Penalize consecutive losses
      if (liveData.consecutiveLosses >= 3) {
        console.log(`⚠️  ${strategyId}: 3 consecutive losses, blacklisting`);
        return -1; // Blacklist
      }
      
      score += (liveScore * 0.6);
    }
    
    // Paper performance weight: 30%
    const paperData = paperResults[strategyId];
    if (paperData && paperData.total > 0) {
      const paperWR = paperData.wins / paperData.total;
      const paperScore = paperWR * 100;
      score += (paperScore * 0.3);
    }
    
    // Market condition match weight: 10%
    const recommendations = marketCondition.recommendations;
    if (recommendations) {
      if (recommendations.primary.includes(strategyId)) {
        score += 10;
      } else if (recommendations.secondary.includes(strategyId)) {
        score += 5;
      } else if (recommendations.avoid.includes(strategyId)) {
        score -= 20;
      }
    }
    
    return score;
  }

  async selectBestStrategy() {
    console.log('🔄 Selecting best strategy for current conditions...\n');

    // Get current market condition
    const marketCondition = await this.marketAnalyzer.analyze();
    if (!marketCondition) {
      console.log('❌ Failed to analyze market condition');
      return null;
    }

    // Get all available strategies from BOK
    const positiveStrategies = this.loadPositiveStrategies();
    
    if (positiveStrategies.length === 0) {
      console.log('⚠️  No positive strategies available');
      return null;
    }

    // Score each strategy
    const scored = [];
    for (const strategy of positiveStrategies) {
      const score = this.calculateStrategyScore(strategy.id, marketCondition);
      
      if (score < 0) {
        // Blacklist this strategy
        if (!this.state.blacklist.includes(strategy.id)) {
          this.state.blacklist.push(strategy.id);
          console.log(`🚫 Blacklisted: ${strategy.name}`);
        }
        continue;
      }
      
      scored.push({ ...strategy, score });
      console.log(`📊 ${strategy.name}: Score ${score.toFixed(1)}`);
    }

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      console.log('❌ All strategies blacklisted or unavailable');
      return null;
    }

    const best = scored[0];
    console.log(`\n🏆 Selected: ${best.name} (Score: ${best.score.toFixed(1)})`);
    console.log(`   WR: ${best.winRate}% | Trades: ${best.trades}`);

    return best;
  }

  loadPositiveStrategies() {
    try {
      const bokFile = `${CONFIG.BOK_DIR}/16-positive-strategies.md`;
      if (!fs.existsSync(bokFile)) return [];
      
      const content = fs.readFileSync(bokFile, 'utf8');
      const strategies = [];
      
      // Parse strategy blocks
      const strategyBlocks = content.match(/### Strategy: ([^\n]+)([\s\S]*?)(?=### Strategy:|---)/g);
      
      if (strategyBlocks) {
        for (const block of strategyBlocks) {
          const idMatch = block.match(/Strategy: ([^\n]+)/);
          const nameMatch = block.match(/Name: ([^\n]+)/);
          const wrMatch = block.match(/Win Rate: ([\d.]+)%/);
          const tradesMatch = block.match(/\((\d+) trades?\)/);
          
          if (idMatch && nameMatch) {
            strategies.push({
              id: idMatch[1].trim(),
              name: nameMatch[1].trim(),
              winRate: parseFloat(wrMatch?.[1] || 0),
              trades: parseInt(tradesMatch?.[1] || 0)
            });
          }
        }
      }
      
      return strategies;
    } catch (e) {
      console.error('Error loading strategies:', e.message);
      return [];
    }
  }

  async rotate() {
    console.log('='.repeat(60));
    console.log('🔄 STRATEGY ROTATION SYSTEM');
    console.log('='.repeat(60));

    // Check if rotation is allowed
    const canRotate = await this.shouldRotate();
    if (!canRotate) {
      console.log('⏳ Rotation not allowed at this time');
      return null;
    }

    // Select best strategy
    const bestStrategy = await this.selectBestStrategy();
    if (!bestStrategy) {
      console.log('❌ Failed to select strategy');
      return null;
    }

    // Check if different from current
    if (this.state.currentStrategy?.id === bestStrategy.id) {
      console.log(`✅ Current strategy (${bestStrategy.name}) still optimal`);
      return bestStrategy;
    }

    // Perform rotation
    const previousStrategy = this.state.currentStrategy;
    this.state.currentStrategy = bestStrategy;
    this.state.lastRotation = Date.now();
    
    this.state.rotationHistory.push({
      timestamp: Date.now(),
      from: previousStrategy?.id || null,
      to: bestStrategy.id,
      reason: `Market: ${this.marketAnalyzer.getCurrentCondition().regime}, Score: ${bestStrategy.score.toFixed(1)}`
    });

    this.saveRotationState();

    // Notify
    console.log('\n✅ Strategy Rotated Successfully!');
    if (previousStrategy) {
      console.log(`   From: ${previousStrategy.name}`);
    }
    console.log(`   To: ${bestStrategy.name}`);
    console.log(`   Market: ${this.marketAnalyzer.getCurrentCondition().regime}`);

    return bestStrategy;
  }

  getCurrentStrategy() {
    return this.state.currentStrategy;
  }

  getRotationHistory() {
    return this.state.rotationHistory;
  }

  getBlacklistedStrategies() {
    return this.state.blacklist;
  }
}

module.exports = StrategyRotationSystem;

// Run if called directly
if (require.main === module) {
  const rotator = new StrategyRotationSystem();
  rotator.rotate().catch(console.error);
}
