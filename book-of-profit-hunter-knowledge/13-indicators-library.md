# 13 - INDICATORS & SIGNALS LIBRARY
**Created:** 2026-02-16
**Version:** 1.0
**Status:** ACTIVE
**Purpose:** Complete indicator library for strategy combination

---

## Overview
Kumpulan semua indikator teknikal dan on-chain yang tersedia untuk dikombinasikan dalam strategi trading. Setiap indikator bisa dipakai standalone atau dikombin dengan indikator lain.

---

## 📊 TECHNICAL INDICATORS

### 1. FIBONACCI RETRACEMENT (Fib)
**Status:** ✅ Active in BOK-11
**Source:** Price action
**Signals:**
- `FIB_618_BOUNCE` - Bounce dari 0.618 golden ratio
- `FIB_382_SUPPORT` - Support di 0.382
- `FIB_786_STRONG` - Strong support di 0.786
- `FIB_BREAK_382` - Break above 0.382 (bullish)
- `FIB_BREAK_618` - Break above 0.618 (very bullish)

**Parameters:**
```json
{
  "swingHigh": "last 24h high",
  "swingLow": "last 24h low",
  "levels": [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
  "tolerance": 0.02
}
```

**Usage:** Entry confirmation, TP/SL placement

---

### 2. RSI (Relative Strength Index)
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Price momentum
**Timeframe:** 14-period default, 4H for swing, 1H for scalping
**Signals:**
- `RSI_OVERSOLD` - RSI < 30 (potential bounce)
- `RSI_OVERBOUGHT` - RSI > 70 (potential reversal)
- `RSI_BULLISH_DIVERGENCE` - Price lower low, RSI higher low
- `RSI_BEARISH_DIVERGENCE` - Price higher high, RSI lower high
- `RSI_MIDLINE_BOUNCE` - Bounce from 50 level
- `RSI_BREAKOUT` - Break above 70 with volume

**Parameters:**
```json
{
  "period": 14,
  "overbought": 70,
  "oversold": 30,
  "divergenceLookback": 10
}
```

**Usage:** Mean reversion entries, trend confirmation

---

### 3. MACD (Moving Average Convergence Divergence)
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Trend momentum
**Timeframe:** 12,26,9 default
**Signals:**
- `MACD_BULLISH_CROSS` - MACD crosses above signal
- `MACD_BEARISH_CROSS` - MACD crosses below signal
- `MACD_ZERO_CROSS_UP` - Cross above zero line
- `MACD_ZERO_CROSS_DOWN` - Cross below zero line
- `MACD_BULLISH_DIVERGENCE` - Price down, MACD up
- `MACD_BEARISH_DIVERGENCE` - Price up, MACD down
- `MACD_HISTOGRAM_EXPANDING` - Momentum increasing
- `MACD_HISTOGRAM_CONTRACTING` - Momentum decreasing

**Parameters:**
```json
{
  "fastPeriod": 12,
  "slowPeriod": 26,
  "signalPeriod": 9,
  "divergenceLookback": 15
}
```

**Usage:** Trend direction, momentum confirmation

---

### 4. SUPPORT & RESISTANCE LEVELS (S/R)
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Price action
**Timeframe:** Multi-timeframe (4H, 1H, 15M)
**Signals:**
- `SR_TOUCH_SUPPORT` - Price touches support
- `SR_BREAK_SUPPORT` - Break below support (bearish)
- `SR_TOUCH_RESISTANCE` - Price touches resistance
- `SR_BREAK_RESISTANCE` - Break above resistance (bullish)
- `SR_BOUNCE_SUPPORT` - Confirmed bounce from support
- `SR_REJECT_RESISTANCE` - Confirmed rejection at resistance
- `SR_CONFLUENCE` - Multiple levels align

**Parameters:**
```json
{
  "lookbackPeriods": 20,
  "minTouches": 2,
  "tolerance": 0.015,
  "timeframes": ["4H", "1H", "15M"]
}
```

**Usage:** Entry zones, invalidation levels

---

### 5. VOLUME ANALYSIS
**Status:** ✅ Already in use (24h volume)
**Source:** On-chain + exchange data
**Signals:**
- `VOLUME_SPIKE` - Volume > 2.5x average
- `VOLUME_CLIMax` - Extreme volume (potential reversal)
- `VOLUME_INCREASING` - Volume trending up (3 periods)
- `VOLUME_DRY_UP` - Volume declining (consolidation)
- `VOLUME_PROFILE POC` - Point of Control (high volume node)
- `VOLUME_IMBALANCE` - Buy/sell volume ratio > 2:1

**Parameters:**
```json
{
  "spikeThreshold": 2.5,
  "lookbackAverage": 20,
  "minVolume24h": 30000
}
```

---

### 6. ORDER BOOK IMBALANCE
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Real-time order book
**Timeframe:** 1-5 minute snapshots
**Signals:**
- `OB_BULLISH_IMBALANCE` - Buy wall > Sell wall (2:1)
- `OB_BEARISH_IMBALANCE` - Sell wall > Buy wall (2:1)
- `OB_LARGE_BID` - Bid > 5% of market cap
- `OB_LARGE_ASK` - Ask > 5% of market cap
- `OB_WALL_BREAK` - Large order executed/removed
- `OB_SPREAD_TIGHT` - Spread < 0.5%
- `OB_SPREAD_WIDE` - Spread > 2% (low liquidity warning)

**Parameters:**
```json
{
  "depth": 10,
  "imbalanceRatio": 2.0,
  "largeOrderThreshold": 0.05,
  "tightSpread": 0.005,
  "wideSpread": 0.02
}
```

**Usage:** Short-term entry timing, liquidity assessment

---

## 🐋 ON-CHAIN INDICATORS

### 7. SMART MONEY FLOW (SMF)
**Status:** ✅ Active - DexScreener/Helius
**Source:** Wallet analysis
**Signals:**
- `SMF_ACCUMULATION` - Smart wallets buying
- `SMF_DISTRIBUTION` - Smart wallets selling
- `SMF_NEUTRAL` - No clear direction
- `SMF_WHALE_ENTRY` - Whale wallet bought >$10K
- `SMF_WHALE_EXIT` - Whale wallet sold >$10K
- `SMF_CLUSTER_BUY` - Multiple smart wallets buying

**Parameters:**
```json
{
  "whaleThreshold": 10000,
  "smartWalletMinAge": 30,
  "clusterMinWallets": 3,
  "timeWindow": "1h"
}
```

---

### 8. WHALE WALLET TRACKING
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Helius API / Arkham
**Timeframe:** Real-time + historical
**Signals:**
- `WHALE_NEW_POSITION` - Whale starts new position
- `WHALE_ADDING` - Whale adding to existing position
- `WHALE_REDUCING` - Whale reducing position
- `WHALE_FULL_EXIT` - Whale fully exited
- `WHALE_ACCUMULATION_ZONE` - Multiple whales accumulating
- `WHALE_DISTRIBUTION_ZONE` - Multiple whales distributing
- `WHALE_CONCENTRATION` - High concentration risk (>40%)

**Parameters:**
```json
{
  "whaleMinHoldings": 50000,
  "significantTx": 10000,
  "accumulationPeriod": "7d",
  "concentrationThreshold": 0.40
}
```

**Usage:** Confirm entries, early exit signals

---

### 9. FUNDING RATE (Perpetuals)
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Exchange data
**Timeframe:** 8H funding intervals
**Signals:**
- `FUNDING_NEGATIVE_EXTREME` - < -0.1% (shorts pay longs)
- `FUNDING_POSITIVE_EXTREME` - > 0.1% (longs pay shorts)
- `FUNDING_FLIP_NEGATIVE` - Rate turns negative
- `FUNDING_FLIP_POSITIVE` - Rate turns positive
- `FUNDING_OI_SPIKE` - Open Interest + Funding extreme

**Parameters:**
```json
{
  "extremeNegative": -0.001,
  "extremePositive": 0.001,
  "checkInterval": "8h"
}
```

**Usage:** Contrarian signals, short squeeze potential

---

### 10. LIQUIDITY ANALYSIS
**Status:** ✅ Active - Min $10K required
**Source:** DEX liquidity pools
**Signals:**
- `LIQ_SUFFICIENT` - >$50K (safe)
- `LIQ_MINIMAL` - $10K-$50K (caution)
- `LIQ_DANGER` - <$10K (avoid)
- `LIQ_INCREASING` - Growing liquidity
- `LIQ_DECREASING` - Shrinking liquidity (warning)
- `LIQ_DEPTH_GOOD` - Can handle 0.01 SOL without >2% impact

**Parameters:**
```json
{
  "sufficient": 50000,
  "minimal": 10000,
  "danger": 10000,
  "maxSlippage": 0.02
}
```

---

## 📡 SOCIAL & SENTIMENT

### 11. SOCIAL SENTIMENT SPIKE
**Status:** ➕ NEW - Added 2026-02-16
**Source:** Twitter/X, Telegram, Discord
**Timeframe:** 1H rolling window
**Signals:**
- `SENTIMENT_EXPLOSIVE` - Mentions >5x average
- `SENTIMENT_HIGH` - Mentions >2x average
- `SENTIMENT_GROWING` - Increasing trend (3 periods)
- `SENTIMENT_FADING` - Decreasing trend
- `SENTIMENT_BOT_DETECTION` - Suspected bot activity

**Parameters:**
```json
{
  "explosiveThreshold": 5.0,
  "highThreshold": 2.0,
  "lookbackAverage": 24,
  "botThreshold": 0.7
}
```

**Usage:** Early entry on virality, exit before fade

---

## 🔄 INDICATOR COMBINATION RULES

### Strength Levels:
```
WEAK:     1-2 indicators align
MODERATE: 3 indicators align  
STRONG:   4+ indicators align
MAXIMUM:  5+ indicators + confluence
```

### Recommended Combinations:

**For SCALPING (Quick Flip):**
```
Required: Volume Spike + Order Book Imbalance
Optional: RSI oversold/overbought
Exit: Small TP (8-12%), Tight SL (3-5%)
```

**For SWING (High Conviction):**
```
Required: Fibonacci + S/R Level + Smart Money
Optional: MACD divergence + Whale activity
Exit: Medium TP (25-40%), Medium SL (8-12%)
```

**For BREAKOUT:**
```
Required: Volume Spike + S/R Break + Order Book
Optional: Social sentiment + Funding flip
Exit: Extended TP (50%+), Tighter SL (5-8%)
```

**For MEAN REVERSION:**
```
Required: RSI extreme + S/R touch + Volume dry up
Optional: Funding extreme + Smart money buying
Exit: Quick TP (10-20%), Tight SL (4-6%)
```

---

## 📝 STRATEGY COMBINATION EXAMPLES

### Combo A: "Fibonacci Bounce"
```yaml
Indicators: [FIB_618_BOUNCE, SR_TOUCH_SUPPORT, RSI_OVERSOLD]
MinStrength: MODERATE
Entry: FIB 0.618 + Support confluence
SL: Below support (-5%)
TP1: 0.382 level (+15%)
TP2: 0.236 level (+25%)
```

### Combo B: "Whale Follow"
```yaml
Indicators: [WHALE_NEW_POSITION, SMF_ACCUMULATION, VOLUME_SPIKE]
MinStrength: STRONG
Entry: Confirmed whale entry + volume
SL: -8% or whale exit signal
TP1: +30%
TP2: +50%
```

### Combo C: "Momentum Burst"
```yaml
Indicators: [MACD_BULLISH_CROSS, VOLUME_SPIKE, OB_BULLISH_IMBALANCE]
MinStrength: STRONG
Entry: MACD cross + volume confirmation
SL: -6%
TP1: +20%
TP2: +35%
```

### Combo D: "Extreme Fear Accumulation"
```yaml
Indicators: [RSI_OVERSOLD, FUNDING_NEGATIVE_EXTREME, SMF_ACCUMULATION]
MinStrength: MAXIMUM
Entry: Multiple extremes + smart money buying
SL: -10%
TP1: +25%
TP2: +40%
TP3: +60%
```

---

## 🎯 PAPER TRADING INTEGRATION

All indicators feed into paper trading system with auto-combination:

```javascript
// Auto-combination engine
const indicators = {
  fib: analyzeFibonacci(token),
  rsi: analyzeRSI(token),
  macd: analyzeMACD(token),
  sr: analyzeSupportResistance(token),
  volume: analyzeVolume(token),
  ob: analyzeOrderBook(token),
  smf: analyzeSmartMoney(token),
  whale: analyzeWhaleWallets(token),
  funding: analyzeFunding(token),
  sentiment: analyzeSentiment(token)
};

// Generate all valid combinations
const strategies = generateCombinations(indicators);

// Test each in paper trading
strategies.forEach(strat => {
  paperTrader.testStrategy(strat, token);
});

// Track performance and pick best
```

---

## Related Files
- `11-fibonacci-trading-system.md` - Fibonacci details
- `12-strategy-registry.md` - Strategy management
- `paper-multi-strategy.js` - Auto-combination engine
- `indicators/` - Implementation folder (to be created)

**Total Indicators:** 11
**Active:** 4 (Fib, Volume, SMF, Liquidity)
**NEW:** 7 (RSI, MACD, S/R, OB, Whale, Funding, Sentiment)

**Last Updated:** 2026-02-16 04:20 WIB
