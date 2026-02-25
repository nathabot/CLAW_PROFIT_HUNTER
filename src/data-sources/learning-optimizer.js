/**
 * Learning Optimizer
 * Automatically tunes parameters based on performance
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '/root/trading-bot/trading-config.json';
const LEARNINGS_FILE = '/root/trading-bot/learning-engine/learnings.json';
const PATTERNS_FILE = '/root/trading-bot/learning-engine/patterns.json';

class LearningOptimizer {
  constructor() {
    this.config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    this.learnings = this.loadLearnings();
    this.patterns = this.loadPatterns();
  }
  
  loadLearnings() {
    try {
      return JSON.parse(fs.readFileSync(LEARNINGS_FILE, 'utf8'));
    } catch {
      return { opportunities: [], recommendations: [] };
    }
  }
  
  loadPatterns() {
    try {
      return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
    } catch {
      return { patterns: [], conditions: [] };
    }
  }
  
  analyze() {
    const suggestions = [];
    
    // 1. Check market conditions
    const { TRADING_MODE, SIGNAL_THRESHOLD, POSITION_SIZE } = this.config;
    
    // Dynamic threshold based on F&G
    if (this.learnings.fearGreed) {
      const fg = this.learnings.fearGreed;
      
      if (fg < 20) {
        // Extreme Fear - lower threshold for more opportunities
        suggestions.push({
          type: 'threshold',
          current: SIGNAL_THRESHOLD?.MIN_SCORE || 5,
          recommended: 4,
          reason: 'Extreme Fear - higher risk/reward opportunity'
        });
      } else if (fg > 70) {
        // Greed - raise threshold
        suggestions.push({
          type: 'threshold',
          current: SIGNAL_THRESHOLD?.MIN_SCORE || 5,
          recommended: 6,
          reason: 'Greed - higher risk of pullback'
        });
      }
    }
    
    // 2. Position sizing based on balance
    const balance = this.learnings.balance || 0.3;
    if (balance < 0.1) {
      suggestions.push({
        type: 'position_size',
        current: POSITION_SIZE?.MAX_SOL || 0.02,
        recommended: 0.005,
        reason: 'Low balance - minimize position size'
      });
    } else if (balance > 0.5) {
      suggestions.push({
        type: 'position_size',
        current: POSITION_SIZE?.MAX_SOL || 0.02,
        recommended: 0.03,
        reason: 'Healthy balance - can increase position'
      });
    }
    
    // 3. Time-based adjustments
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 8) {
      // Night time - less volume, higher threshold
      suggestions.push({
        type: 'night_mode',
        active: true,
        reason: 'Low volume hours - be more selective'
      });
    }
    
    return suggestions;
  }
  
  apply(suggestion) {
    console.log(`📝 Applying: ${suggestion.type} - ${suggestion.reason}`);
    // In production, would update config
    return suggestion;
  }
  
  async run() {
    console.log('[LearningOptimizer] Analyzing...\n');
    
    // Load latest data
    try {
      const dataSources = require('./multi-source');
      const marketData = await dataSources.getMarketData();
      this.learnings.fearGreed = marketData?.fearGreed;
      
      // Get balance
      const balanceData = JSON.parse(
        fs.readFileSync('/root/trading-bot/current-balance.json', 'utf8')
      );
      this.learnings.balance = balanceData.balance;
    } catch (e) {
      console.log('[LearningOptimizer] Data fetch error:', e.message);
    }
    
    const suggestions = this.analyze();
    
    console.log(`📊 Found ${suggestions.length} optimization suggestions:`);
    suggestions.forEach((s, i) => {
      console.log(`  ${i+1}. ${s.type}: ${s.reason}`);
    });
    
    if (suggestions.length > 0) {
      console.log('\n✅ Recommendations ready to apply');
    }
    
    return suggestions;
  }
}

module.exports = LearningOptimizer;

if (require.main === module) {
  const optimizer = new LearningOptimizer();
  optimizer.run();
}
