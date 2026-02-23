/**
 * PUMP.FUN PRE-GRAD TRADING RULES
 * 
 * HARD RULES - CANNOT BYPASS:
 * 1. MAX price change: Don't buy if +50%+ in 24h
 * 2. MIN curve progress: Must be 10-70%
 * 3. MIN liquidity: $3k+
 * 4. MAX MC: $80k (pre-grad max)
 * 5. MIN score: 7/10
 * 6. Position size: 0.003 SOL max (smaller for pre-grad)
 * 7. Quick exit: +30% = sell 50%, +50% = sell all
 */

const RULES = {
  // Entry Rules (MUST pass)
  ENTRY: {
    MAX_PRICE_CHANGE_24H: 50,      // % - Don't buy if already pumped
    MIN_BONDING_CURVE: 10,          // % - Must have some progress
    MAX_BONDING_CURVE: 70,          // % - Not too close to graduation
    MIN_LIQUIDITY: 3000,            // $
    MAX_MC: 80000,                  // $ - Pre-grad max
    MIN_MC: 5000,                   // $
    MIN_SCORE: 7,                   // /10
    MAX_AGE_HOURS: 12,              // hours
    MAX_DEV_HOLDER_GRADUATED: 40,   // % - For graduated only
  },
  
  // Position Rules
  POSITION: {
    MAX_SIZE: 0.003,               // SOL - Smaller for pre-grad
    STOP_LOSS: 15,                 // %
    TAKE_PROFIT_1: 30,             // % - Sell 50%
    TAKE_PROFIT_2: 50,             // % - Sell all
    MAX_HOLD_MINUTES: 30,          // Exit if held too long
  },
  
  // Risk Management
  RISK: {
    MAX_POSITIONS: 2,               // Max concurrent pre-grad positions
    MAX_DAILY_TRADES: 5,           // Max trades per day
    KILL_SWITCH: 0.03,             // SOL - Stop trading if balance below
  }
};

/**
 * Validate ALL entry rules - returns {valid: bool, reasons: []}
 */
function validateEntry(token) {
  const reasons = [];
  
  // 1. Check price change - MOST IMPORTANT
  // If already +50%+, it's too late
  if (token.change24h && token.change24h >= RULES.ENTRY.MAX_PRICE_CHANGE_24H) {
    reasons.push(`ALREADY PUMPED: +${token.change24h}% in 24h (max ${RULES.ENTRY.MAX_PRICE_CHANGE_24H}%)`);
  }
  
  // 2. Check bonding curve
  if (token.curve < RULES.ENTRY.MIN_BONDING_CURVE) {
    reasons.push(`CURVE TOO LOW: ${token.curve}% (min ${RULES.ENTRY.MIN_BONDING_CURVE}%)`);
  }
  if (token.curve > RULES.ENTRY.MAX_BONDING_CURVE) {
    reasons.push(`TOO CLOSE TO GRADUATION: ${token.curve}% (max ${RULES.ENTRY.MAX_BONDING_CURVE}%)`);
  }
  
  // 3. Check MC range
  if (token.mc < RULES.ENTRY.MIN_MC) {
    reasons.push(`MC TOO LOW: $${token.mc} (min $${RULES.ENTRY.MIN_MC})`);
  }
  if (token.mc > RULES.ENTRY.MAX_MC) {
    reasons.push(`MC TOO HIGH: $${token.mc} (max $${RULES.ENTRY.MAX_MC})`);
  }
  
  // 4. Check liquidity
  if (token.liquidity < RULES.ENTRY.MIN_LIQUIDITY) {
    reasons.push(`LOW LIQUIDITY: $${token.liquidity} (min $${RULES.ENTRY.MIN_LIQUIDITY})`);
  }
  
  // 5. Check age
  if (token.age > RULES.ENTRY.MAX_AGE_HOURS) {
    reasons.push(`TOO OLD: ${token.age.toFixed(1)}h (max ${RULES.ENTRY.MAX_AGE_HOURS}h)`);
  }
  
  // 6. Check score
  if (token.score < RULES.ENTRY.MIN_SCORE) {
    reasons.push(`LOW SCORE: ${token.score}/10 (min ${RULES.ENTRY.MIN_SCORE})`);
  }
  
  // 7. For graduated tokens - check dev holder
  if (token.graduated && token.devHolder > RULES.ENTRY.MAX_DEV_HOLDER_GRADUATED) {
    reasons.push(`HIGH DEV HOLDER: ${token.devHolder}% (max ${RULES.ENTRY.MAX_DEV_HOLDER_GRADUATED}%)`);
  }
  
  return {
    valid: reasons.length === 0,
    reasons,
    blocked: reasons.some(r => r.startsWith('ALREADY PUMPED'))
  };
}

/**
 * Score calculation for pre-grad tokens
 */
function calculateScore(token) {
  let score = 0;
  
  // Price change - LOWER is better for entry (not pumped yet)
  // If change is 0-10%: perfect entry
  // If change is 10-30%: okay entry  
  // If change is 30-50%: late entry
  // If change >50%: SKIP
  if (token.change24h <= 10) score += 30;
  else if (token.change24h <= 30) score += 20;
  else if (token.change24h <= 50) score += 10;
  else score += 0;
  
  // Bonding curve - sweet spot 20-50%
  if (token.curve >= 20 && token.curve <= 50) score += 25;
  else if (token.curve >= 10 && token.curve <= 70) score += 15;
  else score += 5;
  
  // MC - sweet spot $10k-$30k
  if (token.mc >= 10000 && token.mc <= 30000) score += 25;
  else if (token.mc >= 5000 && token.mc <= 50000) score += 15;
  else score += 5;
  
  // Age - newer is better
  if (token.age <= 0.25) score += 10; // <15 min
  else if (token.age <= 1) score += 8;
  else if (token.age <= 3) score += 5;
  else score += 2;
  
  // Liquidity
  if (token.liquidity >= 5000) score += 10;
  else if (token.liquidity >= 2000) score += 5;
  
  return Math.min(100, score);
}

/**
 * Decision: BUY, SKIP, or WAIT
 */
function makeDecision(token) {
  const validation = validateEntry(token);
  
  if (!validation.valid) {
    return {
      action: 'SKIP',
      reason: validation.reasons.join('; '),
      blocked: validation.blocked
    };
  }
  
  const score = calculateScore(token);
  
  if (score >= 70) {
    return {
      action: 'BUY',
      score,
      confidence: 'HIGH',
      positionSize: RULES.POSITION.MAX_SIZE,
      tp1: RULES.POSITION.TAKE_PROFIT_1,
      tp2: RULES.POSITION.TAKE_PROFIT_2,
      sl: RULES.POSITION.STOP_LOSS
    };
  } else if (score >= 50) {
    return {
      action: 'WAIT',
      score,
      reason: 'Score 50-70: monitor for better entry'
    };
  } else {
    return {
      action: 'SKIP',
      reason: `Score ${score} < 50`,
      score
    };
  }
}

// Test with known tokens
function testWithKnownTokens() {
  console.log('🧪 TESTING WITH CURRENT PUMP.FUN TOKENS\n');
  
  const testTokens = [
    {
      symbol: 'TOILET',
      change24h: 73.23,
      curve: 55,
      mc: 15000,
      liquidity: 8250,
      age: 0.07,
      graduated: false,
      devHolder: 100
    },
    {
      symbol: 'KREME',
      change24h: 151.39,
      curve: 62,
      mc: 7400,
      liquidity: 3900,
      age: 0.23,
      graduated: false,
      devHolder: 100
    },
    {
      symbol: 'YOU',
      change24h: 19.28,
      curve: 75,
      mc: 18400,
      liquidity: 13800,
      age: 3,
      graduated: false,
      devHolder: 100
    }
  ];
  
  console.log('| Token | Change | Curve | MC | Score | Decision | Reason |');
  console.log('|-------|--------|-------|-----|-------|----------|--------|');
  
  for (const token of testTokens) {
    token.score = calculateScore(token) / 10;
    const decision = makeDecision(token);
    
    console.log(`| ${token.symbol} | +${token.change24h}% | ${token.curve}% | $${token.mc} | ${token.score.toFixed(1)}/10 | ${decision.action} | ${decision.reason || decision.reasons?.join('; ') || ''} |`);
  }
  
  console.log('\n');
}

module.exports = {
  RULES,
  validateEntry,
  calculateScore,
  makeDecision,
  testWithKnownTokens
};
