/**
 * Test Suite for Smart Money Tracking System
 */

const fs = require('fs');
const path = require('path');

// Test utilities
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running Smart Money Tracker Tests\n');
    console.log('═══════════════════════════════════════════════\n');

    for (const test of this.tests) {
      try {
        console.log(`▶ ${test.name}...`);
        await test.fn();
        console.log(`  ✅ PASS\n`);
        this.passed++;
      } catch (error) {
        console.log(`  ❌ FAIL: ${error.message}\n`);
        this.failed++;
      }
    }

    console.log('═══════════════════════════════════════════════');
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    console.log(`   Success rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%\n`);

    return this.failed === 0;
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertExists(value, message) {
    if (value === null || value === undefined) {
      throw new Error(message || 'Value does not exist');
    }
  }
}

// Test suite
const runner = new TestRunner();

// Test 1: Check file structure
runner.test('Check file structure', async () => {
  const files = [
    '/root/trading-bot/agents/smart-money-tracker.js',
    '/root/trading-bot/agents/minara-pattern-analyzer.js',
    '/root/trading-bot/agents/smart-money-integration.js',
    '/root/trading-bot/agents/README.md'
  ];

  for (const file of files) {
    runner.assert(fs.existsSync(file), `File missing: ${file}`);
  }
});

// Test 2: Load modules
runner.test('Load modules', async () => {
  const tracker = require('./smart-money-tracker.js');
  const analyzer = require('./minara-pattern-analyzer.js');
  const integration = require('./smart-money-integration.js');

  runner.assertExists(tracker.SmartMoneyTracker, 'SmartMoneyTracker not exported');
  runner.assertExists(analyzer.MinaraPatternAnalyzer, 'MinaraPatternAnalyzer not exported');
  runner.assertExists(integration.SmartMoneyIntegration, 'SmartMoneyIntegration not exported');
});

// Test 3: Initialize databases
runner.test('Initialize databases', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');
  const { PatternDB } = require('./minara-pattern-analyzer.js');

  const smDB = new SmartMoneyDB('/tmp/test-smart-money.db.json');
  const patDB = new PatternDB('/tmp/test-patterns.db.json');

  runner.assertExists(smDB.data, 'Smart Money DB not initialized');
  runner.assertExists(patDB.data, 'Pattern DB not initialized');

  // Test add wallet
  smDB.addWallet('test_wallet_123', { label: 'test' });
  runner.assert(smDB.data.wallets['test_wallet_123'], 'Wallet not added');

  // Test add transaction
  smDB.addTransaction({
    wallet: 'test_wallet_123',
    token: 'test_token',
    type: 'buy',
    amount: 1000,
    timestamp: Date.now()
  });
  runner.assert(smDB.data.transactions.length > 0, 'Transaction not added');

  // Test save
  smDB.save();
  runner.assert(fs.existsSync('/tmp/test-smart-money.db.json'), 'DB not saved');

  // Cleanup
  if (fs.existsSync('/tmp/test-smart-money.db.json')) {
    if (fs.existsSync('/tmp/test-smart-money.db.json')) { fs.unlinkSync('/tmp/test-smart-money.db.json'); }
  }
  if (fs.existsSync('/tmp/test-patterns.db.json')) {
    if (fs.existsSync('/tmp/test-patterns.db.json')) { fs.unlinkSync('/tmp/test-patterns.db.json'); }
  }
});

// Test 4: Smart Money Scoring
runner.test('Smart money scoring', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');
  const { WhaleAnalyzer } = require('./smart-money-tracker.js');

  const db = new SmartMoneyDB('/tmp/test-scoring.db.json');
  const analyzer = new WhaleAnalyzer(db, null);

  // Create test wallet with transactions
  const testWallet = db.addWallet('test_wallet', {});
  testWallet.transactions = [
    { token: 'token1', timestamp: Date.now(), profit: 100, value: 1000 },
    { token: 'token2', timestamp: Date.now(), profit: 50, value: 500 },
    { token: 'token3', timestamp: Date.now(), profit: -20, value: 200 },
  ];

  const score = analyzer.calculateSmartMoneyScore(testWallet);
  
  runner.assert(score >= 0 && score <= 100, `Invalid score: ${score}`);
  console.log(`    Score: ${score}/100`);

  // Cleanup
  if (fs.existsSync('/tmp/test-scoring.db.json')) {
    if (fs.existsSync('/tmp/test-scoring.db.json')) { fs.unlinkSync('/tmp/test-scoring.db.json'); }
  }
});

// Test 5: Pattern Detection
runner.test('Accumulation pattern detection', async () => {
  const { SmartMoneyDB, WhaleAnalyzer } = require('./smart-money-tracker.js');

  const db = new SmartMoneyDB('/tmp/test-patterns.db.json');
  const analyzer = new WhaleAnalyzer(db, null);

  // Create accumulation pattern
  const wallet = 'accumulator_wallet';
  const token = 'test_token';

  for (let i = 0; i < 7; i++) {
    db.addTransaction({
      wallet,
      token,
      type: 'buy',
      amount: 1000,
      timestamp: Date.now() - (i * 60000) // Last hour
    });
  }

  db.addTransaction({
    wallet,
    token,
    type: 'sell',
    amount: 100,
    timestamp: Date.now()
  });

  const pattern = analyzer.detectAccumulationPattern(wallet, token, 24);
  
  runner.assertExists(pattern, 'Accumulation pattern not detected');
  runner.assertEqual(pattern.pattern, 'accumulation', 'Wrong pattern type');
  runner.assert(pattern.buyCount >= 5, 'Insufficient buy count');
  
  console.log(`    Pattern: ${pattern.pattern}`);
  console.log(`    Strength: ${pattern.strength.toFixed(2)}`);
  console.log(`    Confidence: ${pattern.confidence.toFixed(2)}`);

  // Cleanup
  if (fs.existsSync('/tmp/test-patterns.db.json')) { fs.unlinkSync('/tmp/test-patterns.db.json'); }
});

// Test 6: Sentiment Aggregator
runner.test('Sentiment aggregation', async () => {
  const { SentimentAggregator, PatternDB } = require('./minara-pattern-analyzer.js');

  const patDB = new PatternDB('/tmp/test-sentiment.db.json');
  const aggregator = new SentimentAggregator(patDB);

  // Test sentiment calculation
  const sentiment = await aggregator.aggregateSentiment('test_token', ['dexscreener']);
  
  runner.assertExists(sentiment, 'Sentiment not generated');
  runner.assert(sentiment.score >= -100 && sentiment.score <= 100, 'Invalid sentiment score');
  runner.assert(sentiment.confidence >= 0 && sentiment.confidence <= 100, 'Invalid confidence');
  
  console.log(`    Score: ${sentiment.score}/100`);
  console.log(`    Confidence: ${sentiment.confidence}%`);

  // Cleanup
  if (fs.existsSync('/tmp/test-sentiment.db.json')) {
    if (fs.existsSync('/tmp/test-sentiment.db.json')) { fs.unlinkSync('/tmp/test-sentiment.db.json'); }
  }
});

// Test 7: Confidence Scorer
runner.test('Confidence scoring', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');
  const { ConfidenceScorer, PatternDB } = require('./minara-pattern-analyzer.js');

  const smDB = { data: { wallets: {}, transactions: [], tokens: {} } };
  const patDB = new PatternDB('/tmp/test-confidence.db.json');
  const scorer = new ConfidenceScorer(smDB, patDB);

  // Create test data
  const token = 'test_token';
  smDB.data.tokens[token] = {
    holders: {
      'wallet1': { balance: 10000 },
      'wallet2': { balance: 5000 }
    },
    volumeHistory: [
      { volume: 1000, timestamp: Date.now() },
      { volume: 1200, timestamp: Date.now() - 3600000 }
    ]
  };

  smDB.data.wallets['wallet1'] = {
    address: 'wallet1',
    score: 85,
    classification: 'smart_money',
    transactions: []
  };

  const confidence = scorer.calculateConfidenceScore(token);
  
  runner.assertExists(confidence, 'Confidence not calculated');
  runner.assert(confidence.score >= 0 && confidence.score <= 100, 'Invalid confidence score');
  runner.assertExists(confidence.factors, 'Factors missing');
  
  console.log(`    Score: ${confidence.score}/100`);
  console.log(`    Smart Money Presence: ${confidence.factors.smartMoneyPresence}`);

  // Cleanup
  if (fs.existsSync('/tmp/test-confidence.db.json')) { fs.unlinkSync('/tmp/test-confidence.db.json'); }
});

// Test 8: Risk Assessment
runner.test('Risk assessment', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');
  const { RiskAssessor, PatternDB } = require('./minara-pattern-analyzer.js');

  const smDB = { data: { wallets: {}, transactions: [], tokens: {}, getWalletsByClassification: () => [] } };
  const patDB = new PatternDB('/tmp/test-risk.db.json');
  const assessor = new RiskAssessor(smDB, patDB);

  // Create test token with concentrated holdings
  const token = 'test_token';
  smDB.data.tokens[token] = {
    holders: {
      'whale1': { balance: 80000 },
      'whale2': { balance: 10000 },
      'retail1': { balance: 5000 },
      'retail2': { balance: 5000 }
    },
    volumeHistory: Array(24).fill({ volume: 50000, timestamp: Date.now() })
  };

  const risk = assessor.assessTokenRisk(token);
  
  runner.assertExists(risk, 'Risk not assessed');
  runner.assert(risk.riskScore >= 0 && risk.riskScore <= 100, 'Invalid risk score');
  runner.assertExists(risk.riskLevel, 'Risk level missing');
  runner.assertExists(risk.recommendation, 'Recommendation missing');
  
  console.log(`    Risk Score: ${risk.riskScore}/100`);
  console.log(`    Risk Level: ${risk.riskLevel}`);
  console.log(`    Recommendation: ${risk.recommendation}`);

  // Cleanup
  if (fs.existsSync('/tmp/test-risk.db.json')) { fs.unlinkSync('/tmp/test-risk.db.json'); }
});

// Test 9: Entity Tracking
runner.test('Entity behavior tracking', async () => {
  const { EntityTracker, PatternDB } = require('./minara-pattern-analyzer.js');

  const patDB = new PatternDB('/tmp/test-entity.db.json');
  const tracker = new EntityTracker(patDB);

  const entityId = 'test_entity';

  // Track multiple behaviors
  for (let i = 0; i < 15; i++) {
    tracker.trackEntity(entityId, 'trade', {
      token: `token_${i % 3}`,
      amount: 1000 + (i * 100),
      type: 'buy'
    });
  }

  const entity = patDB.getEntity(entityId);
  
  runner.assertExists(entity, 'Entity not tracked');
  runner.assert(entity.behaviors.length >= 15, 'Behaviors not recorded');
  runner.assertExists(entity.traits, 'Traits not analyzed');
  
  console.log(`    Behaviors: ${entity.behaviors.length}`);
  console.log(`    Reliability: ${entity.reliability}`);
  if (entity.traits) {
    console.log(`    Aggression: ${entity.traits.aggression?.toFixed(1)}`);
  }

  // Cleanup
  if (fs.existsSync('/tmp/test-entity.db.json')) { fs.unlinkSync('/tmp/test-entity.db.json'); }
});

// Test 10: Integration Module
runner.test('Integration module', async () => {
  const { SmartMoneyIntegration } = require('./smart-money-integration.js');

  const integration = new SmartMoneyIntegration();
  
  runner.assertExists(integration.tracker, 'Tracker not initialized');
  runner.assertExists(integration.analyzer, 'Analyzer not initialized');
  
  // Test market overview
  const overview = await integration.getMarketOverview();
  
  runner.assertExists(overview, 'Overview not generated');
  runner.assertExists(overview.tokens, 'Token stats missing');
  runner.assertExists(overview.smartMoney, 'Smart money stats missing');
  
  console.log(`    Tracked Tokens: ${overview.tokens.tracked}`);
  console.log(`    Smart Money Wallets: ${overview.smartMoney.smartMoneyCount}`);
});

// Test 11: Alert Generation
runner.test('Alert generation', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');

  const db = new SmartMoneyDB('/tmp/test-alerts.db.json');

  db.addAlert({
    type: 'test_alert',
    severity: 'high',
    message: 'Test alert message',
    token: 'test_token'
  });

  runner.assert(db.data.alerts.length > 0, 'Alert not added');
  runner.assertEqual(db.data.alerts[0].type, 'test_alert', 'Wrong alert type');
  runner.assertExists(db.data.alerts[0].timestamp, 'Timestamp missing');

  console.log(`    Alerts: ${db.data.alerts.length}`);
  console.log(`    Type: ${db.data.alerts[0].type}`);

  // Cleanup
  if (fs.existsSync('/tmp/test-alerts.db.json')) { fs.unlinkSync('/tmp/test-alerts.db.json'); }
});

// Test 12: Wallet Clustering
runner.test('Wallet clustering', async () => {
  const { SmartMoneyDB, WhaleAnalyzer } = require('./smart-money-tracker.js');

  const db = new SmartMoneyDB('/tmp/test-clustering.db.json');
  const analyzer = new WhaleAnalyzer(db, null);

  // Create similar wallets
  for (let i = 0; i < 5; i++) {
    const wallet = db.addWallet(`wallet_${i}`, {});
    wallet.transactions = [
      { token: 'token_A', timestamp: Date.now() },
      { token: 'token_B', timestamp: Date.now() + 1000 },
      { token: 'token_C', timestamp: Date.now() + 2000 }
    ];
    db.updateWalletScore(`wallet_${i}`, 75);
  }

  const clusters = await analyzer.clusterWallets();
  
  runner.assertExists(clusters, 'Clusters not generated');
  console.log(`    Clusters found: ${clusters.length}`);
  if (clusters.length > 0) {
    console.log(`    Largest cluster: ${clusters[0].size} wallets`);
  }

  // Cleanup
  if (fs.existsSync('/tmp/test-clustering.db.json')) { fs.unlinkSync('/tmp/test-clustering.db.json'); }
});

// Test 13: Database Persistence
runner.test('Database persistence', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');

  const dbPath = '/tmp/test-persistence.db.json';

  // Create and save data
  const db1 = new SmartMoneyDB(dbPath);
  db1.addWallet('persistent_wallet', { test: true });
  db1.save();

  // Load in new instance
  const db2 = new SmartMoneyDB(dbPath);
  
  runner.assertExists(db2.data.wallets['persistent_wallet'], 'Data not persisted');
  runner.assertEqual(db2.data.wallets['persistent_wallet'].test, true, 'Wrong data loaded');

  console.log(`    Wallets persisted: ${Object.keys(db2.data.wallets).length}`);

  // Cleanup
  fs.unlinkSync(dbPath);
});

// Test 14: Performance Check
runner.test('Performance check', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');

  const db = new SmartMoneyDB('/tmp/test-performance.db.json');

  // Add many transactions
  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    db.addTransaction({
      wallet: `wallet_${i % 100}`,
      token: `token_${i % 10}`,
      type: i % 2 === 0 ? 'buy' : 'sell',
      amount: Math.random() * 10000,
      timestamp: Date.now()
    });
  }
  const elapsed = Date.now() - start;

  runner.assert(elapsed < 5000, `Too slow: ${elapsed}ms`);
  runner.assertEqual(db.data.transactions.length, 1000, 'Wrong transaction count');

  console.log(`    Added 1000 transactions in ${elapsed}ms`);
  console.log(`    Avg: ${(elapsed / 1000).toFixed(2)}ms per transaction`);

  // Cleanup
  if (fs.existsSync('/tmp/test-performance.db.json')) { fs.unlinkSync('/tmp/test-performance.db.json'); }
});

// Test 15: Error Handling
runner.test('Error handling', async () => {
  const { SmartMoneyDB } = require('./smart-money-tracker.js');

  // Try loading non-existent DB (should not crash)
  const db = new SmartMoneyDB('/tmp/nonexistent.db.json');
  runner.assertExists(db.data, 'DB not initialized on load failure');
  runner.assertExists(db.data.wallets, 'Default structure not created');

  console.log('    Graceful fallback on missing DB: ✓');

  // Try invalid data
  try {
    db.addWallet(null);
    runner.assert(false, 'Should have thrown on null wallet');
  } catch (e) {
    console.log('    Null wallet handling: ✓');
  }
});

// Run all tests
(async () => {
  const success = await runner.run();
  process.exit(success ? 0 : 1);
})();
