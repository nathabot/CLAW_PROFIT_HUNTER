/**
 * Smart Money Integration Module
 * Combines tracker and analyzer for comprehensive analysis
 */

const { SmartMoneyTracker } = require('./smart-money-tracker.js');
const { MinaraPatternAnalyzer } = require('./minara-pattern-analyzer.js');
const fs = require('fs');

class SmartMoneyIntegration {
  constructor() {
    this.tracker = new SmartMoneyTracker();
    this.analyzer = new MinaraPatternAnalyzer();
    this.isRunning = false;
  }

  async start() {
    console.log('🚀 Starting Smart Money Integration System...\n');
    
    this.isRunning = true;

    // Start tracker in background
    this.trackerPromise = this.tracker.start().catch(e => {
      console.error('Tracker error:', e);
    });

    // Wait for initial scan
    await this.sleep(10000);

    // Analysis loop
    while (this.isRunning) {
      try {
        await this.runAnalysisCycle();
        await this.sleep(300000); // 5 minutes between full analyses
      } catch (error) {
        console.error('Analysis cycle error:', error);
        await this.sleep(60000);
      }
    }
  }

  async runAnalysisCycle() {
    console.log('\n🔄 Running analysis cycle...');

    // Get top tokens by smart money interest
    const tokens = this.getTopTokensBySmartMoneyInterest(5);
    
    for (const token of tokens) {
      try {
        const analysis = await this.analyzer.analyzeToken(token.address);
        
        // Generate alerts based on analysis
        if (analysis.recommendation?.action === 'STRONG BUY') {
          this.generateAlert({
            type: 'opportunity',
            severity: 'high',
            token: token.address,
            message: `🚀 STRONG BUY signal for ${token.address.slice(0, 8)}...`,
            analysis
          });
        } else if (analysis.recommendation?.action === 'AVOID') {
          this.generateAlert({
            type: 'warning',
            severity: 'critical',
            token: token.address,
            message: `⛔ AVOID signal for ${token.address.slice(0, 8)}...`,
            analysis
          });
        }

        await this.sleep(5000);
      } catch (e) {
        console.error(`Error analyzing ${token.address}:`, e.message);
      }
    }
  }

  getTopTokensBySmartMoneyInterest(limit = 10) {
    const tokens = Object.entries(this.tracker.db.data.tokens || {})
      .map(([address, data]) => ({
        address,
        interest: data.smartMoneyInterest || 0,
        holders: Object.keys(data.holders || {}).length
      }))
      .sort((a, b) => b.interest - a.interest)
      .slice(0, limit);

    return tokens;
  }

  generateAlert(alert) {
    alert.timestamp = Date.now();
    console.log(`\n🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
    
    // Store in tracker DB
    this.tracker.db.addAlert(alert);
    this.tracker.db.save();

    // Could send to webhook, Telegram, etc.
    return alert;
  }

  async analyzeSingleToken(tokenAddress) {
    console.log(`\n🔍 Deep dive analysis: ${tokenAddress}\n`);

    // First ensure tracker has data
    await this.tracker.analyzeToken(tokenAddress);

    // Then run full analysis
    const analysis = await this.analyzer.analyzeToken(tokenAddress);

    // Get smart money holders
    const smartMoneyAnalysis = this.tracker.getTokenSmartMoneyAnalysis(tokenAddress);

    return {
      token: tokenAddress,
      analysis,
      smartMoneyHolders: smartMoneyAnalysis?.smartMoneyHolders || 0,
      topHolders: smartMoneyAnalysis?.topHolders || [],
      recentAlerts: this.tracker.getRecentAlerts(10).filter(a => a.token === tokenAddress)
    };
  }

  async getMarketOverview() {
    const overview = {
      timestamp: Date.now(),
      tokens: {},
      smartMoney: {},
      alerts: []
    };

    // Token stats
    const tokens = Object.keys(this.tracker.db.data.tokens || {});
    overview.tokens.tracked = tokens.length;
    overview.tokens.withSmartMoney = tokens.filter(t => {
      const data = this.tracker.db.data.tokens[t];
      return data.smartMoneyInterest > 0;
    }).length;

    // Smart money stats
    overview.smartMoney.wallets = Object.keys(this.tracker.db.data.wallets || {}).length;
    overview.smartMoney.smartMoneyCount = this.tracker.getSmartMoneyWallets().length;
    overview.smartMoney.whaleCount = this.tracker.getWhaleWallets().length;
    overview.smartMoney.clusters = (this.tracker.db.data.clusters || []).length;

    // Recent alerts
    overview.alerts = this.tracker.getRecentAlerts(20);

    return overview;
  }

  async getTopOpportunities(limit = 5) {
    const tokens = Object.keys(this.tracker.db.data.tokens || {});
    const opportunities = [];

    for (const token of tokens) {
      try {
        const analysis = await this.analyzer.analyzeToken(token);
        
        if (analysis.recommendation?.score >= 60 && analysis.risk?.riskScore < 60) {
          opportunities.push({
            token,
            score: analysis.recommendation.score,
            action: analysis.recommendation.action,
            confidence: analysis.confidence?.score || 0,
            risk: analysis.risk?.riskScore || 50,
            sentiment: analysis.sentiment?.score || 0
          });
        }

        await this.sleep(2000);
      } catch (e) {
        // Skip tokens with errors
      }
    }

    return opportunities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    console.log('\n🛑 Stopping Smart Money Integration...');
    this.isRunning = false;
    this.tracker.stop();
  }

  // Export current state
  exportData(filepath) {
    const data = {
      smartMoney: this.tracker.db.data,
      patterns: this.analyzer.patternDB.data,
      exportedAt: Date.now()
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`✅ Data exported to ${filepath}`);
    return filepath;
  }

  // Generate report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {},
      topTokens: [],
      recentActivity: [],
      alerts: []
    };

    // Summary
    const wallets = Object.values(this.tracker.db.data.wallets || {});
    report.summary.totalWallets = wallets.length;
    report.summary.smartMoneyWallets = wallets.filter(w => w.classification === 'smart_money').length;
    report.summary.whaleWallets = wallets.filter(w => w.classification === 'whale').length;
    report.summary.trackedTokens = Object.keys(this.tracker.db.data.tokens || {}).length;
    report.summary.totalTransactions = (this.tracker.db.data.transactions || []).length;
    report.summary.activeAlerts = (this.tracker.db.data.alerts || []).filter(a => 
      Date.now() - a.timestamp < 86400000
    ).length;

    // Top tokens by smart money interest
    report.topTokens = Object.entries(this.tracker.db.data.tokens || {})
      .map(([address, data]) => ({
        address,
        smartMoneyInterest: data.smartMoneyInterest || 0,
        holders: Object.keys(data.holders || {}).length,
        recentVolume: (data.volumeHistory || []).slice(0, 6).reduce((sum, v) => sum + v.volume, 0) / 6
      }))
      .sort((a, b) => b.smartMoneyInterest - a.smartMoneyInterest)
      .slice(0, 10);

    // Recent significant activity
    report.recentActivity = (this.tracker.db.data.transactions || [])
      .filter(tx => Date.now() - tx.timestamp < 3600000) // Last hour
      .filter(tx => tx.amount >= 1000) // Large transactions
      .slice(0, 20)
      .map(tx => ({
        wallet: tx.wallet.slice(0, 8) + '...',
        token: tx.token.slice(0, 8) + '...',
        type: tx.type,
        amount: tx.amount.toFixed(2),
        timestamp: new Date(tx.timestamp).toISOString()
      }));

    // Recent alerts
    report.alerts = (this.tracker.db.data.alerts || [])
      .filter(a => Date.now() - a.timestamp < 86400000)
      .slice(0, 20)
      .map(a => ({
        type: a.type,
        severity: a.severity,
        message: a.message,
        timestamp: new Date(a.timestamp).toISOString()
      }));

    return report;
  }

  printReport() {
    const report = this.generateReport();
    
    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 SMART MONEY TRACKER - REPORT');
    console.log('═══════════════════════════════════════════════');
    console.log(`Generated: ${report.timestamp}`);
    
    console.log('\n📈 SUMMARY:');
    console.log(`   Total Wallets: ${report.summary.totalWallets}`);
    console.log(`   Smart Money: ${report.summary.smartMoneyWallets}`);
    console.log(`   Whales: ${report.summary.whaleWallets}`);
    console.log(`   Tracked Tokens: ${report.summary.trackedTokens}`);
    console.log(`   Total Transactions: ${report.summary.totalTransactions}`);
    console.log(`   Active Alerts (24h): ${report.summary.activeAlerts}`);

    console.log('\n🔥 TOP TOKENS (by smart money interest):');
    report.topTokens.slice(0, 5).forEach((token, i) => {
      console.log(`   ${i + 1}. ${token.address.slice(0, 16)}... (interest: ${token.smartMoneyInterest.toFixed(1)}, holders: ${token.holders})`);
    });

    console.log('\n⚡ RECENT LARGE TRANSACTIONS (>1000 SOL):');
    report.recentActivity.slice(0, 5).forEach(tx => {
      console.log(`   ${tx.wallet} ${tx.type} ${tx.amount} SOL of ${tx.token} at ${tx.timestamp}`);
    });

    console.log('\n🚨 RECENT ALERTS:');
    report.alerts.slice(0, 5).forEach(alert => {
      console.log(`   [${alert.severity}] ${alert.message}`);
    });

    console.log('\n═══════════════════════════════════════════════\n');

    return report;
  }
}

// Export
module.exports = { SmartMoneyIntegration };

// CLI execution
if (require.main === module) {
  const integration = new SmartMoneyIntegration();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    integration.stop();
    
    // Generate final report
    setTimeout(() => {
      integration.printReport();
      process.exit(0);
    }, 2000);
  });

  process.on('SIGTERM', () => {
    integration.stop();
    setTimeout(() => process.exit(0), 2000);
  });

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    switch (command) {
      case 'analyze':
        const token = args[1];
        if (!token) {
          console.error('Usage: node smart-money-integration.js analyze <token_address>');
          process.exit(1);
        }
        const result = await integration.analyzeSingleToken(token);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
        break;

      case 'report':
        integration.printReport();
        process.exit(0);
        break;

      case 'overview':
        const overview = await integration.getMarketOverview();
        console.log(JSON.stringify(overview, null, 2));
        process.exit(0);
        break;

      case 'opportunities':
        const limit = parseInt(args[1]) || 5;
        console.log(`\n🎯 Finding top ${limit} opportunities...\n`);
        const opportunities = await integration.getTopOpportunities(limit);
        console.log(JSON.stringify(opportunities, null, 2));
        process.exit(0);
        break;

      case 'export':
        const filepath = args[1] || '/root/trading-bot/database/export.json';
        integration.exportData(filepath);
        process.exit(0);
        break;

      case 'start':
      default:
        await integration.start();
        break;
    }
  })().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
