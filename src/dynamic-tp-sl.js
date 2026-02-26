#!/usr/bin/env node
// DYNAMIC TP/SL CALCULATOR - ATR-based for per-coin volatility
const { ATR } = require('technicalindicators');

function calculateDynamicTP_SL(candles, config = {}) {
  // Default: use last 14 candles for ATR
  const period = config.atrPeriod || 14;
  const riskReward = config.riskReward || 2; // 2:1 ratio minimum
  
  if (!candles || candles.length < period + 1) {
    // Fallback to fixed if not enough data
    return {
      method: 'FIXED_FALLBACK',
      tpPct: 3,
      slPct: 1.5,
      reason: 'Insufficient candle data'
    };
  }
  
  // Bitget candles: [timestamp, open, high, low, close, volume, quoteVolume]
  const highs = candles.map(c => parseFloat(c[2])).reverse();
  const lows = candles.map(c => parseFloat(c[3])).reverse();
  const closes = candles.map(c => parseFloat(c[4])).reverse();
  
  // Calculate ATR
  const atrValues = ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: period
  });
  
  const atr = atrValues[atrValues.length - 1];
  const currentPrice = closes[closes.length - 1];
  
  // ATR as percentage of price
  const atrPct = (atr / currentPrice) * 100;
  
  // Dynamic TP/SL based on ATR
  // SL = 1 ATR (1x risk)
  // TP = 2 ATR (2x reward = 2:1 ratio)
  const slPct = Math.max(atrPct * 1, 1); // Min 1% SL
  const tpPct = Math.max(atrPct * 2, 2); // Min 2% TP
  
  // Cap at reasonable levels (don't let it get too wide)
  const maxSlPct = 5;
  const maxTpPct = 10;
  
  const finalSl = Math.min(slPct, maxSlPct);
  const finalTp = Math.min(tpPct, maxTpPct);
  
  // Volatility classification
  let volatility = 'NORMAL';
  if (atrPct > 3) volatility = 'HIGH';
  else if (atrPct < 1) volatility = 'LOW';
  
  return {
    method: 'ATR_BASED',
    atr: atr.toFixed(6),
    atrPct: atrPct.toFixed(2),
    currentPrice: currentPrice.toFixed(6),
    tpPct: parseFloat(finalTp.toFixed(1)),
    slPct: parseFloat(finalSl.toFixed(1)),
    riskReward: riskReward,
    volatility,
    // Entry zone: wait for price to pull back to EMA or support
    entryZone: {
      type: 'PULLBACK',
      target: 'EMA20 or -0.5% from current',
      avoid: ' momentum peak'
    }
  };
}

// Test with sample data
const sampleCandles = Array(30).fill(0).map((_, i) => [
  Date.now() - i * 900000, // 15min intervals
  100 + Math.random() * 2,
  102 + Math.random() * 2,
  98 + Math.random() * 2,
  100 + (Math.random() - 0.5) * 4,
  1000000,
  100000000
]);

const result = calculateDynamicTP_SL(sampleCandles);
console.log('Dynamic TP/SL Result:');
console.log(JSON.stringify(result, null, 2));

module.exports = { calculateDynamicTP_SL };
