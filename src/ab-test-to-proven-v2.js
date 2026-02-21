/**
 * A/B Test to Proven Tokens Integrator v3
 * Uses centralized threshold configuration
 */

const fs = require('fs');
const { getThresholds } = require('./threshold-config');

const AB_TEST_FILE = '/root/trading-bot/ab-test-results.json';
const PROVEN_FILE = '/root/trading-bot/bok/proven-established.json';
const TOKENS_FILE = '/root/trading-bot/ab-test-tokens.json';

// Get centralized threshold
const THRESHOLDS = getThresholds();
const WR_THRESHOLD = THRESHOLDS.WR_THRESHOLD;

function calculateWR(wins, losses) {
  const total = wins + losses;
  return total > 0 ? (wins / total) * 100 : 0;
}

async function integrate() {
  console.log('🔄 A/B Test → Proven Tokens Integration v3');
  console.log('='.repeat(50));
  console.log(`📊 Threshold Source: ${THRESHOLDS.SOURCE}`);
  console.log(`   WR Threshold: ${WR_THRESHOLD}% (from trading-config.json)`);
  
  if (!fs.existsSync(AB_TEST_FILE)) {
    console.log('⚠️ No A/B test results found');
    return;
  }
  
  const abResults = JSON.parse(fs.readFileSync(AB_TEST_FILE, 'utf8'));
  const results = abResults.results || {};
  const modes = abResults.modes || {};
  
  // Find best mode with Paper Trader-style strategy
  let bestMode = null;
  let bestWR = 0;
  let bestData = null;
  
  for (const [mode, data] of Object.entries(results)) {
    const wr = calculateWR(data.wins || 0, data.losses || 0);
    const cfg = modes[mode] || {};
    console.log(`  ${mode}: ${wr.toFixed(1)}% WR (${data.wins}W/${data.losses}L) - ${cfg.name || 'Unknown'}`);
    
    if (wr > bestWR && wr >= WR_THRESHOLD && data.trades >= 3) {
      bestWR = wr;
      bestMode = mode;
      bestData = data;
    }
  }
  
  if (!bestMode || bestWR < WR_THRESHOLD) {
    console.log(`⚠️ No qualifying mode - WR must be >= ${WR_THRESHOLD}%`);
    console.log(`   Best mode: ${bestMode || 'none'} (${bestWR.toFixed(1)}% WR)`);
    return;
  }
  
  console.log(`\n🏆 Best Mode: ${bestMode} (${bestWR.toFixed(1)}% WR)`);
  
  // Get tokens
  let tokens = [];
  if (fs.existsSync(TOKENS_FILE)) {
    const tokensData = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    tokens = Array.isArray(tokensData) ? tokensData : (tokensData.tokens || []);
  }
  
  // Get proven file
  let proven = {};
  if (fs.existsSync(PROVEN_FILE)) {
    proven = JSON.parse(fs.readFileSync(PROVEN_FILE, 'utf8'));
  }
  
  const modeConfig = modes[bestMode];
  
  // Create Paper Trader-style strategy ID
  const fibEntry = modeConfig?.entryFib || 0.5;
  const fibTp = modeConfig?.tpFib || 1.0;
  const strategyId = `ab_fib_${String(fibEntry).replace('.','')}_${String(fibTp).replace('.','')}`;
  
  // Calculate avg PnL from wins
  const avgPnl = bestData?.wins ? (bestData.wins * modeConfig?.tp2 || 10) / bestData.trades : 5;
  
  proven[strategyId] = {
    strategyName: `A/B Test ${modeConfig?.name || 'Unknown'} (Fib ${fibEntry}-${fibTp})`,
    strategyWR: bestWR.toFixed(2),
    mode: 'ab_test',
    validatedAt: Date.now(),
    source: 'ab_test_runner',
    methodology: 'paper_trader_fibonacci',
    config: {
      entryFib: fibEntry,
      tpFib: fibTp,
      sl: modeConfig?.sl || 15,
      tp1: modeConfig?.tp1 || 30,
      tp2: modeConfig?.tp2 || 50,
      minScore: modeConfig?.minScore || 6,
      minLiquidity: modeConfig?.minLiquidity || 10000
    },
    tokens: tokens.map(t => ({
      symbol: t.symbol,
      ca: t.address,
      wins: bestData?.wins || 0,
      avgPnl: avgPnl,
      totalTrades: bestData?.trades || 0,
      lastTrade: Date.now(),
      validated: true,
      validationTime: Date.now(),
      validationReason: `A/B Test Mode ${bestMode} winner (Fib ${fibEntry}-${fibTp})`
    }))
  };
  
  fs.writeFileSync(PROVEN_FILE, JSON.stringify(proven, null, 2));
  console.log(`\n✅ Added ${tokens.length} tokens to proven-established.json`);
  console.log(`   Strategy: ${strategyId}`);
  console.log(`   WR: ${bestWR.toFixed(1)}%`);
  console.log(`   Methodology: Paper Trader Fibonacci`);
  
  return proven;
}

integrate().catch(console.error);
