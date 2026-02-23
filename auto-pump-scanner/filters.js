/**
 * PRE-GRAD SCANNER v1.0
 * Focus: Find tokens SEBELUM pump, di bonding curve
 * 
 * Strategy:
 * 1. Monitor NEW tokens (not graduated)
 * 2. Apply ALL filters
 * 3. Score and rank
 * 4. Alert if qualifies
 */

const FILTER = {
  // Hard blocks - MUST pass all
  TOP_HOLDER_MAX: 50,        // Dev must hold < 50%
  MIN_LIQUIDITY: 3000,       // $3k minimum
  MIN_CURVE: 3,              // 3% minimum curve
  MAX_AGE_HOURS: 12,         // Less than 12h old
  
  // Soft targets (for scoring)
  TARGET_MC: 15000,         // Sweet spot $10k-$30k
  MIN_MC: 5000,
  MAX_MC: 90000,            // Pre-grad max
  
  // For profit taking
  TARGET_GAIN: 30,          // % - sell half
  TARGET_GAIN_2: 50,        // % - sell all
  STOP_LOSS: 15,            // %
};

const SCORING = {
  curveProgress: 15,        // Higher curve = more real
  holderDist: 20,           // Lower dev % = better
  liquidity: 15,            // More liquidity = safer
  mcSweetSpot: 20,         // $15k = perfect
  ageNew: 15,              // Newer = more potential
  buyPressure: 15,         // Has buys happening
};

function calculateScore(token) {
  let score = 0;
  
  // 1. Curve progress (0-15)
  score += Math.min(15, (token.curve / 100) * 15);
  
  // 2. Holder distribution (0-20) - lower dev % = higher score
  score += Math.max(0, 20 - (token.devPercent * 0.4));
  
  // 3. Liquidity (0-15)
  score += Math.min(15, (token.liquidity / 20000) * 15);
  
  // 4. MC sweet spot (0-20) - $15k is perfect
  const mcDiff = Math.abs(token.mc - FILTER.TARGET_MC);
  const mcScore = Math.max(0, 20 - (mcDiff / 2000));
  score += mcScore;
  
  // 5. Age (0-15) - newer = better
  score += Math.max(0, 15 - token.ageHours);
  
  // 6. Buy pressure (0-15)
  if (token.buyCount && token.buyCount > 5) {
    score += Math.min(15, token.buyCount);
  }
  
  return Math.min(100, score);
}

function applyFilters(token) {
  const fails = [];
  
  if (token.graduated) fails.push('Already graduated');
  if (token.devPercent >= FILTER.TOP_HOLDER_MAX) fails.push(`Dev holds ${token.devPercent}%`);
  if (token.liquidity < FILTER.MIN_LIQUIDITY) fails.push(`Liquidity $${token.liquidity}`);
  if (token.curve < FILTER.MIN_CURVE) fails.push(`Curve ${token.curve}%`);
  if (token.ageHours > FILTER.MAX_AGE_HOURS) fails.push(`Age ${token.ageHours}h`);
  if (token.mc < FILTER.MIN_MC) fails.push(`MC $${token.mc}`);
  if (token.mc > FILTER.MAX_MC) fails.push(`MC $${token.mc} (graduated)`);
  
  return { pass: fails.length === 0, fails };
}

console.log('🎯 PRE-GRAD SCANNER READY');
console.log('   Target: Tokens on bonding curve');
console.log('   Max dev holder: <50%');
console.log('   Max MC: <$90k');
console.log('   Max age: <12h');
console.log('   Min curve: 3%');
console.log('   Min liquidity: $3k');

module.exports = { FILTER, SCORING, calculateScore, applyFilters };
