/**
 * A/B Test to Proven Tokens Integrator
 * 
 * Reads ab-test-results.json and adds winning mode tokens to proven-established.json
 * Run after A/B test completes
 */

const fs = require('fs');
const path = require('path');

const AB_TEST_FILE = '/root/trading-bot/ab-test-results.json';
const PROVEN_FILE = '/root/trading-bot/bok/proven-established.json';
const TOKENS_FILE = '/root/trading-bot/ab-test-tokens.json';

function calculateWR(wins, losses) {
  const total = wins + losses;
  return total > 0 ? (wins / total) * 100 : 0;
}

async function integrate() {
  console.log('🔄 A/B Test → Proven Tokens Integration');
  console.log('='.repeat(50));
  
  // Read A/B test results
  if (!fs.existsSync(AB_TEST_FILE)) {
    console.log('⚠️ No A/B test results found');
    return;
  }
  
  const abResults = JSON.parse(fs.readFileSync(AB_TEST_FILE, 'utf8'));
  const results = abResults.results || {};
  
  // Find winning mode
  let bestMode = null;
  let bestWR = 0;
  
  for (const [mode, data] of Object.entries(results)) {
    const wr = calculateWR(data.wins || 0, data.losses || 0);
    console.log(`  ${mode}: ${wr.toFixed(1)}% WR (${data.wins}W/${data.losses}L)`);
    
    if (wr > bestWR && data.trades >= 3) {  // Min 3 trades
      bestWR = wr;
      bestMode = mode;
    }
  }
  
  if (!bestMode) {
    console.log('⚠️ No qualifying mode found (need min 3 trades)');
    return;
  }
  
  console.log(`\n🏆 Best Mode: ${bestMode} (${bestWR.toFixed(1)}% WR)`);
  
  // Read tokens tested
  let tokens = [];
  if (fs.existsSync(TOKENS_FILE)) {
    const tokensData = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    // Handle both array and object formats
    tokens = Array.isArray(tokensData) ? tokensData : (tokensData.tokens || []);
  }
  
  // Read proven file
  let proven = {};
  if (fs.existsSync(PROVEN_FILE)) {
    proven = JSON.parse(fs.readFileSync(PROVEN_FILE, 'utf8'));
  }
  
  // Create A/B strategy entry
  const modeConfig = abResults.modes?.[bestMode];
  const strategyId = `ab_test_${bestMode.toLowerCase()}`;
  
  proven[strategyId] = {
    strategyName: `A/B Test Mode ${bestMode} (${modeConfig?.name || 'Unknown'})`,
    strategyWR: bestWR.toFixed(2),
    mode: 'ab_test',
    validatedAt: Date.now(),
    source: 'ab_test_runner',
    config: modeConfig,
    tokens: tokens.map(t => ({
      symbol: t.symbol,
      ca: t.address,
      wins: results[bestMode]?.wins || 0,
      avgPnl: (results[bestMode]?.wins || 0) * 5, // Estimate
      lastTrade: Date.now(),
      validated: true,
      validationTime: Date.now(),
      validationReason: `A/B Test Mode ${bestMode} winner`
    }))
  };
  
  // Save
  fs.writeFileSync(PROVEN_FILE, JSON.stringify(proven, null, 2));
  console.log(`\n✅ Added ${tokens.length} tokens to proven-established.json`);
  console.log(`   Strategy: ${strategyId}`);
  console.log(`   WR: ${bestWR.toFixed(1)}%`);
  
  return proven;
}

integrate().catch(console.error);
