/**
 * Multi-Factor Risk & Position Sizing Module
 * Features:
 * 1. Dynamic Position Sizing based on strategy WR/confidence
 * 2. Portfolio-level risk (VaR calculation)
 * 3. Multi-factor scoring (volume, momentum, volatility)
 */

const fs = require('fs');

// ==================== CONFIG ====================
const CONFIG = {
  // Position sizing
  MIN_POSITION: 0.005,    // 0.005 SOL minimum
  MAX_POSITION: 0.02,     // 0.02 SOL maximum
  DEFAULT_POSITION: 0.015, // 0.015 SOL default
  
  // Risk parameters
  MAX_PORTFOLIO_RISK: 0.30, // Max 30% portfolio at risk
  VAR_CONFIDENCE: 0.95,    // 95% VaR
  MAX_CONCURRENT_POSITIONS: 10,
  
  // Factor weights
  FACTOR_WEIGHTS: {
    momentum: 0.30,    // Price momentum
    volatility: 0.20,  // Low volatility preferred
    volume: 0.25,      // Trading volume
    liquidity: 0.15,   // Pool liquidity
    buyPressure: 0.10   // Buy/sell ratio
  }
};

// ==================== MULTI-FACTOR SCORING ====================
function calculateMultiFactorScore(pair) {
  const factors = {};
  
  // 1. Momentum Factor (30%)
  const priceChange = parseFloat(pair.priceChange?.h1 || pair.priceChange?.h24 || 0);
  factors.momentum = Math.min(10, Math.max(1, 5 + (priceChange / 5)));
  
  // 2. Volatility Factor (20%) - Lower is better
  const volatility = Math.abs(parseFloat(pair.priceChange?.h24 || 0));
  factors.volatility = Math.min(10, Math.max(1, 10 - (volatility / 5)));
  
  // 3. Volume Factor (25%)
  const volume24h = parseFloat(pair.volume?.h24 || 0);
  if (volume24h > 100000) factors.volume = 10;
  else if (volume24h > 50000) factors.volume = 8;
  else if (volume24h > 20000) factors.volume = 6;
  else if (volume24h > 10000) factors.volume = 4;
  else factors.volume = 2;
  
  // 4. Liquidity Factor (15%)
  const liquidity = parseFloat(pair.liquidity?.usd || 0);
  if (liquidity > 100000) factors.liquidity = 10;
  else if (liquidity > 50000) factors.liquidity = 8;
  else if (liquidity > 20000) factors.liquidity = 6;
  else if (liquidity > 10000) factors.liquidity = 4;
  else factors.liquidity = 2;
  
  // 5. Buy Pressure Factor (10%)
  const buys = pair.txns?.h1?.buys || 0;
  const sells = pair.txns?.h1?.sells || 1;
  const buyPressure = buys / (buys + sells);
  factors.buyPressure = Math.min(10, Math.max(1, buyPressure * 10));
  
  // Calculate weighted score
  const weights = CONFIG.FACTOR_WEIGHTS;
  const totalScore = 
    (factors.momentum * weights.momentum) +
    (factors.volatility * weights.volatility) +
    (factors.volume * weights.volume) +
    (factors.liquidity * weights.liquidity) +
    (factors.buyPressure * weights.buyPressure);
  
  return {
    total: Math.round(totalScore * 10) / 10,
    factors,
    confidence: totalScore >= 7 ? 'HIGH' : totalScore >= 5 ? 'MEDIUM' : 'LOW'
  };
}

// ==================== DYNAMIC POSITION SIZING ====================
function calculatePositionSize(strategyWR, confidence, balance) {
  const baseSize = CONFIG.DEFAULT_POSITION;
  
  // Scale based on strategy WR (50-60% range)
  let wrMultiplier = 1;
  if (strategyWR >= 55) wrMultiplier = 1.3;      // High WR = bigger position
  else if (strategyWR >= 52) wrMultiplier = 1.1;
  else if (strategyWR >= 50) wrMultiplier = 1.0;
  else wrMultiplier = 0.8;                      // Lower WR = smaller position
  
  // Scale based on confidence
  let confMultiplier = 1;
  if (confidence === 'HIGH') confMultiplier = 1.2;
  else if (confidence === 'MEDIUM') confMultiplier = 1.0;
  else confMultiplier = 0.7;
  
  // Calculate size
  let size = baseSize * wrMultiplier * confMultiplier;
  
  // Apply limits
  size = Math.max(CONFIG.MIN_POSITION, Math.min(CONFIG.MAX_POSITION, size));
  
  // Round to 3 decimal places
  size = Math.round(size * 1000) / 1000;
  
  return {
    size,
    wrMultiplier,
    confMultiplier,
    reasoning: `WR ${strategyWR}% × ${confidence} confidence`
  };
}

// ==================== EDGE-STYLE POSITION SIZING ====================
// Uses token-specific win rate from historical proven tokens data

const TRADING_BOT_DIR = process.env.TRADING_BOT_DIR || '/root/trading-bot';

function readJSON(file, fallback = null) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function getTokenWinRate(tokenCA) {
  // Look up token in proven tokens
  const provenFiles = ['proven-established.json', 'proven-degen.json'];
  
  for (const file of provenFiles) {
    const provenPath = `${TRADING_BOT_DIR}/bok/${file}`;
    const provenData = readJSON(provenPath, {});
    
    for (const [strategyId, strategyData] of Object.entries(provenData)) {
      const tokens = strategyData.tokens || [];
      const token = tokens.find(t => t.ca === tokenCA);
      
      if (token && token.wins && token.totalTrades) {
        return {
          wins: token.wins,
          totalTrades: token.totalTrades,
          winRate: (token.wins / token.totalTrades) * 100,
          avgPnl: token.avgPnl || 0
        };
      }
    }
  }
  
  return null; // Token not in proven list
}

function calculateEdgePositionSize(tokenCA, strategyWR, confidence, balance) {
  const baseSize = CONFIG.DEFAULT_POSITION;
  
  // Get token-specific WR from proven tokens
  const tokenData = getTokenWinRate(tokenCA);
  let tokenWR = strategyWR; // Default to strategy WR
  let tokenMultiplier = 1;
  let tokenSource = 'strategy';
  
  if (tokenData) {
    tokenWR = tokenData.winRate;
    tokenSource = 'token';
    
    // Edge-style sizing based on token WR
    // More trades = more confidence in the data
    const tradeConfidence = tokenData.totalTrades >= 50 ? 'HIGH' 
                          : tokenData.totalTrades >= 20 ? 'MEDIUM' 
                          : 'LOW';
    
    if (tokenWR >= 55 && tradeConfidence !== 'LOW') {
      tokenMultiplier = 1.4;  // Proven high-WR token = bigger position
    } else if (tokenWR >= 50 && tradeConfidence !== 'LOW') {
      tokenMultiplier = 1.2;
    } else if (tokenWR >= 45) {
      tokenMultiplier = 1.0;
    } else if (tokenWR >= 40) {
      tokenMultiplier = 0.8;  // Lower WR = smaller
    } else {
      tokenMultiplier = 0.5;  // Bad WR = minimal position
    }
  }
  
  // Confidence multiplier (from signal analysis)
  let confMultiplier = 1;
  if (confidence === 'HIGH') confMultiplier = 1.2;
  else if (confidence === 'MEDIUM') confMultiplier = 1.0;
  else confMultiplier = 0.7;
  
  // Calculate final size
  let size = baseSize * tokenMultiplier * confMultiplier;
  
  // Apply limits
  size = Math.max(CONFIG.MIN_POSITION, Math.min(CONFIG.MAX_POSITION, size));
  size = Math.round(size * 1000) / 1000;
  
  return {
    size,
    tokenWR: tokenWR.toFixed(1),
    tokenMultiplier,
    confMultiplier,
    source: tokenSource,
    reasoning: `${tokenSource.toUpperCase()} WR ${tokenWR.toFixed(1)}% × ${confidence} confidence`,
    tokenStats: tokenData ? {
      wins: tokenData.wins,
      totalTrades: tokenData.totalTrades,
      avgPnl: tokenData.avgPnl.toFixed(1)
    } : null
  };
}

module.exports = {
  calculateMultiFactorScore,
  calculatePositionSize,
  calculateEdgePositionSize,  // NEW: Edge-style sizing
  calculatePortfolioRisk
};

// ==================== PORTFOLIO RISK (VaR) ====================
function calculatePortfolioRisk(positions, currentPrices) {
  if (!positions || positions.length === 0) {
    return { 
      var: 0, 
      varPercent: 0,
      maxRisk: 0, 
      maxRiskPercent: 0,
      totalValue: 0,
      riskRatio: 0,
      status: 'SAFE',
      positionCount: 0,
      maxPositions: CONFIG.MAX_CONCURRENT_POSITIONS,
      positions: []
    };
  }
  
  // Calculate position values and P&L
  let totalValue = 0;
  let totalRisk = 0;
  const positionRisks = [];
  
  for (const pos of positions) {
    const currentPrice = currentPrices[pos.symbol] || pos.entryPrice;
    const positionValue = pos.positionSize * currentPrice;
    const entryValue = pos.positionSize * pos.entryPrice;
    const pnl = positionValue - entryValue;
    const pnlPercent = (pnl / entryValue) * 100;
    
    // Risk is the downside from entry
    const riskPercent = Math.max(0, -pos.slPercent || -15); // Default 15% SL
    
    positionRisks.push({
      symbol: pos.symbol,
      value: positionValue,
      pnlPercent,
      riskPercent,
      riskValue: positionValue * (riskPercent / 100)
    });
    
    totalValue += positionValue;
    totalRisk += positionValue * (riskPercent / 100);
  }
  
  // Simple VaR calculation (95% confidence)
  // Using historical volatility assumption
  const returns = positionRisks.map(p => p.pnlPercent / 100);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  
  // VaR at 95% confidence (1.645 * stdDev)
  const varPercent = Math.abs(avgReturn - 1.645 * stdDev) * 100;
  const varValue = totalValue * (varPercent / 100);
  
  // Max potential loss
  const maxRiskPercent = Math.max(...positionRisks.map(p => p.riskPercent));
  const maxRiskValue = totalValue * (maxRiskPercent / 100);
  
  // Status
  const riskRatio = totalRisk / totalValue;
  let status = 'SAFE';
  if (riskRatio > 0.25) status = 'DANGER';
  else if (riskRatio > 0.15) status = 'WARNING';
  
  return {
    var: Math.round(varValue * 10000) / 10000,
    varPercent: Math.round(varPercent * 10) / 10,
    maxRisk: Math.round(maxRiskValue * 10000) / 10000,
    maxRiskPercent: Math.round(maxRiskPercent * 10) / 10,
    totalValue: Math.round(totalValue * 10000) / 10000,
    riskRatio: Math.round(riskRatio * 1000) / 1000,
    status,
    positionCount: positions.length,
    maxPositions: CONFIG.MAX_CONCURRENT_POSITIONS,
    positions: positionRisks
  };
}

// ==================== EXPORT ====================
module.exports = {
  CONFIG,
  calculateMultiFactorScore,
  calculatePositionSize,
  calculatePortfolioRisk
};

// CLI test
if (require.main === module) {
  // Test with sample data
  const samplePair = {
    priceChange: { h1: 2.5, h24: 15 },
    volume: { h24: 75000 },
    liquidity: { usd: 50000 },
    txns: { h1: { buys: 25, sells: 15 } }
  };
  
  console.log('=== Multi-Factor Score ===');
  console.log(calculateMultiFactorScore(samplePair));
  
  console.log('\n=== Position Sizing ===');
  console.log(calculatePositionSize(53, 'HIGH', 0.5));
  
  console.log('\n=== Portfolio Risk ===');
  const samplePositions = [
    { symbol: 'BONK', positionSize: 0.015, entryPrice: 0.0000064, currentPrice: 0.0000065, slPercent: -6 },
    { symbol: 'ATLAS', positionSize: 0.015, entryPrice: 0.0002, currentPrice: 0.000205, slPercent: -6 }
  ];
  const prices = { BONK: 0.0000065, ATLAS: 0.000205 };
  console.log(calculatePortfolioRisk(samplePositions, prices));
}
