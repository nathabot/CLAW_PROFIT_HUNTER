#!/usr/bin/env node
/**
 * ADAPTIVE SYSTEM ORCHESTRATOR
 * Master controller for all 4 intelligent systems:
 * 1. Market Condition Analyzer
 * 2. Strategy Rotation System
 * 3. Live to Paper Feedback
 * 4. BOK Intelligence Layer
 */

const fs = require('fs');
const MarketConditionAnalyzer = require('./src/market-condition-analyzer');
const StrategyRotationSystem = require('./src/strategy-rotation-system');
const LiveToPaperFeedback = require('./src/live-to-paper-feedback');
const BOKIntelligenceLayer = require('./src/bok-intelligence-layer');

const CONFIG = {
  LOG_FILE: '/root/trading-bot/logs/adaptive-system.log',
  STATE_FILE: '/root/trading-bot/adaptive-system-state.json',
  RUN_INTERVAL: 30 * 60 * 1000 // 30 minutes
};

class AdaptiveSystemOrchestrator {
  constructor() {
    this.systems = {
      marketAnalyzer: new MarketConditionAnalyzer(),
      strategyRotation: new StrategyRotationSystem(),
      feedback: new LiveToPaperFeedback(),
      intelligence: new BOKIntelligenceLayer()
    };
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      lastRun: null,
      totalRuns: 0,
      systemStatus: {}
    };
  }

  saveState() {
    this.state.lastRun = Date.now();
    this.state.totalRuns++;
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(CONFIG.LOG_FILE, logEntry);
  }

  async runAll() {
    console.log('='.repeat(70));
    console.log('🧠 ADAPTIVE SYSTEM ORCHESTRATOR');
    console.log('🔄 Running all 4 intelligent systems...');
    console.log('='.repeat(70) + '\n');

    const results = {};

    // 1. Market Condition Analysis
    try {
      console.log('📊 [1/4] Market Condition Analyzer');
      console.log('-'.repeat(50));
      results.marketCondition = await this.systems.marketAnalyzer.analyze();
      this.state.systemStatus.marketAnalyzer = 'OK';
      console.log('✅ Market analysis complete\n');
    } catch (e) {
      console.error('❌ Market analyzer failed:', e.message);
      this.state.systemStatus.marketAnalyzer = 'ERROR';
      results.marketCondition = null;
    }

    // 2. Strategy Rotation
    try {
      console.log('🔄 [2/4] Strategy Rotation System');
      console.log('-'.repeat(50));
      results.rotation = await this.systems.strategyRotation.rotate();
      this.state.systemStatus.strategyRotation = 'OK';
      console.log('✅ Strategy rotation complete\n');
    } catch (e) {
      console.error('❌ Strategy rotation failed:', e.message);
      this.state.systemStatus.strategyRotation = 'ERROR';
      results.rotation = null;
    }

    // 3. Live to Paper Feedback
    try {
      console.log('📈 [3/4] Live to Paper Feedback');
      console.log('-'.repeat(50));
      await this.systems.feedback.run();
      this.state.systemStatus.feedback = 'OK';
      console.log('✅ Feedback loop complete\n');
    } catch (e) {
      console.error('❌ Feedback system failed:', e.message);
      this.state.systemStatus.feedback = 'ERROR';
    }

    // 4. BOK Intelligence Layer
    try {
      console.log('🧠 [4/4] BOK Intelligence Layer');
      console.log('-'.repeat(50));
      this.systems.intelligence.run();
      this.state.systemStatus.intelligence = 'OK';
      console.log('✅ Intelligence layer complete\n');
    } catch (e) {
      console.error('❌ Intelligence layer failed:', e.message);
      this.state.systemStatus.intelligence = 'ERROR';
    }

    // Summary
    this.printSummary(results);
    this.saveState();

    console.log('='.repeat(70));
    console.log('✅ All systems completed');
    console.log(`🕐 Next run: ${new Date(Date.now() + CONFIG.RUN_INTERVAL).toLocaleString()}`);
    console.log('='.repeat(70));

    return results;
  }

  printSummary(results) {
    console.log('\n' + '='.repeat(70));
    console.log('📋 EXECUTION SUMMARY');
    console.log('='.repeat(70) + '\n');

    // Market Condition
    if (results.marketCondition) {
      const mc = results.marketCondition;
      console.log('📊 Market Condition:');
      console.log(`   Regime: ${mc.regime}`);
      console.log(`   Confidence: ${mc.confidence}%`);
      console.log(`   SOL Price: $${mc.indicators?.solPrice?.toFixed(2) || 'N/A'}`);
      console.log();
    }

    // Strategy Rotation
    if (results.rotation) {
      console.log('🎯 Active Strategy:');
      console.log(`   Name: ${results.rotation.name}`);
      console.log(`   WR: ${results.rotation.winRate}%`);
      console.log(`   Score: ${results.rotation.score?.toFixed(1) || 'N/A'}`);
      console.log();
    }

    // System Status
    console.log('🔧 System Status:');
    for (const [name, status] of Object.entries(this.state.systemStatus)) {
      const icon = status === 'OK' ? '✅' : '❌';
      console.log(`   ${icon} ${name}: ${status}`);
    }
    console.log();
  }

  // Quick status check
  getStatus() {
    return {
      lastRun: this.state.lastRun,
      totalRuns: this.state.totalRuns,
      systems: this.state.systemStatus,
      marketCondition: this.systems.marketAnalyzer.getCurrentCondition(),
      currentStrategy: this.systems.strategyRotation.getCurrentStrategy()
    };
  }
}

// Run if called directly
if (require.main === module) {
  const orchestrator = new AdaptiveSystemOrchestrator();
  
  // Check if quick status requested
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify(orchestrator.getStatus(), null, 2));
    process.exit(0);
  }
  
  orchestrator.runAll().catch(console.error);
}

module.exports = AdaptiveSystemOrchestrator;
