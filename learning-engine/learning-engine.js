/**
 * LEARNING ENGINE v1.0 - Self-Improving Trading System
 * 
 * Core Loop:
 * 1. SCAN   → Find opportunities
 * 2. TRY    → Execute with small risk
 * 3. LEARN  → Record outcomes
 * 4. IMPROVE→ Adjust strategy based on results
 * 5. REPEAT → Continuous loop
 * 
 * Income Sources to Explore:
 * - Trading (existing)
 * - Twitter engagement (existing)
 * - New: Arbitrage, NFT flips, SaaS, etc.
 */

const fs = require('fs');
const path = require('path');

const LEARNING_DB = '/root/trading-bot/learning-engine/learnings.json';
const PATTERNS_DB = '/root/trading-bot/learning-engine/patterns.json';
const OPPORTUNITIES_LOG = '/root/trading-bot/learning-engine/opportunities.json';

class LearningEngine {
  constructor() {
    this.learnings = this.loadJson(LEARNING_DB, []);
    this.patterns = this.loadJson(PATTERNS_DB, {});
    this.opportunities = this.loadJson(OPPORTUNITIES_LOG, []);
  }

  loadJson(file, defaultValue) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (e) {
      console.error(`Error loading ${file}:`, e.message);
    }
    return defaultValue;
  }

  saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  // ═══════════════════════════════════════════════════════════
  // CORE LOOP - Think, Try, Learn, Improve, Repeat
  // ═══════════════════════════════════════════════════════════

  async think() {
    console.log('[LEARNING] 🧠 Scanning for new opportunities...');
    
    // Scan multiple channels for opportunities
    const opportunities = await Promise.allSettled([
      this.scanPumpFun(),        // New token launches
      this.scanWhaleMovements(), // Whale wallet movements
      this.scanArbitrage(),      // Cross-exchange opportunities
      this.scanNewsEvents(),     // Breaking news
      this.scanSocialTrends()    // Social media trends
    ]);

    // Filter successful scans
    const found = opportunities
      .filter(o => o.status === 'fulfilled' && o.value)
      .map(o => o.value)
      .flat();

    console.log(`[LEARNING] Found ${found.length} potential opportunities`);
    return found;
  }

  async tryOpportunity(opp, maxRisk = 0.001) {
    console.log(`[LEARNING] 🎯 Trying: ${opp.type} - ${opp.name}`);
    
    const attempt = {
      id: Date.now(),
      opportunity: opp,
      timestamp: new Date().toISOString(),
      risk: maxRisk,
      status: 'attempting'
    };

    try {
      // Execute based on type
      const result = await this.execute(opp, maxRisk);
      
      attempt.result = result;
      attempt.status = result.profit > 0 ? 'success' : 'failed';
      attempt.profit = result.profit;
      
      console.log(`[LEARNING] Result: ${attempt.status} (${result.profit > 0 ? '+' : ''}${result.profit}%)`);
      
    } catch (e) {
      attempt.result = { error: e.message };
      attempt.status = 'error';
      console.log(`[LEARNING] Error: ${e.message}`);
    }

    // Record the attempt
    this.record(attempt);
    return attempt;
  }

  async execute(opp, risk) {
    // Placeholder - integrate with actual trading system
    // For now, simulate
    return {
      success: Math.random() > 0.5,
      profit: (Math.random() - 0.3) * 10, // -3% to +7%
      details: `Executed ${opp.type} for ${opp.name}`
    };
  }

  record(attempt) {
    // Add to learnings
    this.learnings.push({
      ...attempt,
      recordedAt: new Date().toISOString()
    });

    // Keep only last 1000 learnings
    if (this.learnings.length > 1000) {
      this.learnings = this.learnings.slice(-1000);
    }

    // Update patterns
    this.updatePattern(attempt);
    
    this.saveJson(LEARNING_DB, this.learnings);
  }

  updatePattern(attempt) {
    const type = attempt.opportunity.type;
    
    if (!this.patterns[type]) {
      this.patterns[type] = {
        attempts: 0,
        successes: 0,
        totalProfit: 0,
        avgProfit: 0,
        successRate: 0,
        lastAttempt: null,
        trend: 'neutral' // improving, declining, neutral
      };
    }

    const p = this.patterns[type];
    p.attempts++;
    p.lastAttempt = attempt.timestamp;
    
    if (attempt.status === 'success') {
      p.successes++;
      p.totalProfit += attempt.profit || 0;
    } else if (attempt.profit) {
      p.totalProfit += attempt.profit;
    }

    p.successRate = p.successes / p.attempts;
    p.avgProfit = p.totalProfit / p.attempts;

    // Calculate trend
    const recent = this.learnings
      .filter(l => l.opportunity.type === type)
      .slice(-10);
    
    if (recent.length >= 5) {
      const recentSuccess = recent.filter(r => r.status === 'success').length;
      const oldSuccess = this.patterns[type].successRate;
      
      if (recentSuccess / recent.length > oldSuccess + 0.1) {
        p.trend = 'improving';
      } else if (recentSuccess / recent.length < oldSuccess - 0.1) {
        p.trend = 'declining';
      } else {
        p.trend = 'neutral';
      }
    }

    this.saveJson(PATTERNS_DB, this.patterns);
  }

  improve() {
    console.log('[LEARNING] 🔧 Analyzing patterns for improvements...');
    
    const recommendations = [];
    
    for (const [type, data] of Object.entries(this.patterns)) {
      if (data.trend === 'declining') {
        recommendations.push({
          action: 'reduce',
          type,
          reason: `Success rate dropped to ${(data.successRate * 100).toFixed(1)}%`,
          suggestion: 'Reduce allocation or stop this strategy'
        });
      } else if (data.trend === 'improving' && data.successRate > 0.6) {
        recommendations.push({
          action: 'increase',
          type,
          reason: `Success rate at ${(data.successRate * 100).toFixed(1)}%`,
          suggestion: 'Increase allocation to this strategy'
        });
      }
    }

    console.log(`[LEARNING] 📊 ${recommendations.length} improvements found`);
    return recommendations;
  }

  // ═══════════════════════════════════════════════════════════
  // SCANNERS - Find opportunities
  // ═══════════════════════════════════════════════════════════

  async scanPumpFun() {
    // Scan pump.fun for new token launches
    // Returns array of opportunities
    try {
      const response = await fetch('https://api.pump.fun/recent');
      const data = await response.json();
      
      return data.slice(0, 5).map(token => ({
        type: 'pump_fun',
        name: token.name,
        address: token.address,
        marketCap: token.market_cap,
        age: token.age_minutes,
        score: this.scorePumpFun(token)
      })).filter(o => o.score > 0.7);
    } catch (e) {
      return [];
    }
  }

  scorePumpFun(token) {
    // Simple scoring: new + low market cap + good liquidity
    let score = 0;
    if (token.market_cap < 50000) score += 0.3;
    if (token.age_minutes < 60) score += 0.3;
    if (token.usd_volume > 1000) score += 0.2;
    if (token.buy_count > token.sell_count) score += 0.2;
    return score;
  }

  async scanWhaleMovements() {
    // Scan for whale wallet movements (via Arkham)
    // Placeholder - integrate with actual API
    return [];
  }

  async scanArbitrage() {
    // Cross-exchange price differences
    // Placeholder
    return [];
  }

  async scanNewsEvents() {
    // Breaking news that might affect markets
    // Placeholder
    return [];
  }

  async scanSocialTrends() {
    // Trending topics on social media
    // Placeholder
    return [];
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS & REPORTING
  // ═══════════════════════════════════════════════════════════

  getStatus() {
    return {
      totalLearnings: this.learnings.length,
      patterns: this.patterns,
      lastUpdate: this.learnings.length > 0 
        ? this.learnings[this.learnings.length - 1].recordedAt 
        : null
    };
  }

  getTopPerformers() {
    return Object.entries(this.patterns)
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);
  }
}

// Export for use
module.exports = { LearningEngine };

// CLI mode
if (require.main === module) {
  const engine = new LearningEngine();
  
  (async () => {
    const args = process.argv.slice(2);
    const command = args[0] || 'status';
    
    switch (command) {
      case 'scan':
        const opportunities = await engine.think();
        console.log('Opportunities found:', opportunities.length);
        break;
        
      case 'improve':
        const recs = engine.improve();
        console.log('Recommendations:', recs);
        break;
        
      case 'status':
      default:
        console.log('=== LEARNING ENGINE STATUS ===');
        console.log(JSON.stringify(engine.getStatus(), null, 2));
        console.log('\nTop Performers:');
        console.log(JSON.stringify(engine.getTopPerformers(), null, 2));
    }
  })();
}
