# 12 - STRATEGY REGISTRY SYSTEM
**Created:** 2026-02-15
**Version:** 1.0
**Location:** `nathabot/nathabot-memory/strategies/`
**Purpose:** Centralized strategy management with auto-rotation

---

## Overview
Sistem manajemen strategi trading dengan **kode penomoran** (`pt_strat_XXX`) yang memudahkan tracing, testing, dan auto-rotation berdasarkan performance.

**Masalah yang Dipecahkan:**
- Strategi tercampur aduk, tidak tahu mana yang aktif
- Tidak ada tracking performance per strategi
- Strategi jelek tetap dipakai, strategi bagus tidak terdeteksi
- Tidak ada sistem re-aktivasi strategi yang sempat jelek tapi cocok di market lain

**Solusi:**
- Semua strategi punya ID unik (`pt_strat_001`, `pt_strat_002`, ...)
- Auto-tracking performance (WR%, trades, PnL)
- Auto-rotation: active ↔ inactive berdasarkan threshold
- Re-activation: Strategi inactive bisa kembali active kalau market cocok

## Folder Structure
```
strategies/
├── active/ # 🟢 Currently deployed
│ ├── pt_strat_001_scalping_tight.js
│ └── pt_strat_002_fib_0618_golden.js
│
├── inactive/ # 🟡 Underperforming / wrong regime
│ ├── pt_strat_003_breakout_momentum.js
│ └── pt_strat_004_mean_reversion.js
├── archive/ # Retired (history preserved)
│ └── (old versions)
├── registry/
│ └── strategy-master-registry.json # Central database
└── strategy-manager.js # ️ Management CLI

## ️ Strategy ID Format
pt_strat_XXX_name_description
│ │ │ │ │
│ │ │ │ └── Brief description
│ │ │ └───────── Short name
│ │ └───────────── 3-digit number (001, 002, ...)
│ └─────────────────── Strategy
└──────────────────────── Paper Trade

**Examples:**
- `pt_strat_001_scalping_tight` - Tight scalping for bear market
- `pt_strat_002_fib_0618_golden` - Fibonacci golden ratio entry
- `pt_strat_003_breakout_momentum` - Volume breakout strategy
- `pt_strat_004_mean_reversion` - Counter-trend bounce

## Registry Format
**File:** `registry/strategy-master-registry.json`

```json
{
 "id": "pt_strat_001_scalping_tight",
 "name": "Tight Scalping v1",
 "status": "active",
 "folder": "active",
 "file": "strategies/active/pt_strat_001_scalping_tight.js",

 "performance": {
 "totalTrades": 45,
 "wins": 35,
 "losses": 10,
 "winRate": 77.8,
 "totalPnl": 224.4
 },

 "marketConditions": {
 "bestRegime": "BEAR",
 "fearGreedRange": [0, 25],
 "recommended": true

 "history": [
 {"date": "2026-02-15", "status": "active", "wr": 77.8}
 ]
}

## Auto-Rotation Rules

### Thresholds:
**TARGET_WIN_RATE**, Value=80%, Description=Ultimate goal
**ACTIVE_THRESHOLD**, Value=75%, Description=Minimum to stay active
**INACTIVE_THRESHOLD**, Value=65%, Description=Below = move to inactive
**REACTIVATION_THRESHOLD**, Value=75%, Description=To move back to active
**MIN_TRADES**, Value=30, Description=Minimum for evaluation

### Flow:
NEW STRATEGY
 ↓
 TESTING (≥30 trades)
 WR ≥ 75% ────────────► ACTIVE (deploy to live)
 WR drops < 65% ──────► INACTIVE (pause)
 Market regime change
 Re-test INACTIVE
 WR recovers ≥ 75% ───► REACTIVATE (back to active)
 Consistently bad ────► ARCHIVE (retire)

## ️ Strategy Manager CLI

### List All Strategies
```bash
cd /root/.openclaw/workspace/strategies
node strategy-manager.js list

**Output:**
 STRATEGY REGISTRY
================================================================================

 ACTIVE (2):
--------------------------------------------------------------------------------
 pt_strat_001_scalping_tight WR: 77.8% (35W/10L) PnL: 224.4 Best: BEAR
️ pt_strat_002_fib_0618_golden WR: 0.0% (0W/0L) PnL: 0.0 Best: ALL

 INACTIVE (2):
️ pt_strat_003_breakout_momentum WR: 56.3% (18W/14L) PnL: 166.2 Best: BULL
️ pt_strat_004_mean_reversion WR: 53.6% (15W/13L) PnL: 86.5 Best: RANGING

### Register New Strategy
node strategy-manager.js register \
 pt_strat_005 \
 "New Strategy Name" \
 "Strategy description"

### Update Performance
node strategy-manager.js update \
 pt_strat_001 \
 50 \ # total trades
 40 \ # wins
 10 \ # losses
 285.5 # total PnL

### Generate Report
node strategy-manager.js report

## Current Strategies

### ACTIVE (Deploy to Live)
| pt_strat_001 | Tight Scalping v1 | 77.8% | 45 | Active |
| pt_strat_002 | Fibonacci 0.618 Golden | 0% | 0 | Testing |

### INACTIVE (Paused)
| ID | Name | WR | Trades | Reason |
| pt_strat_003 | Breakout Momentum | 56.3% | 32 | Wrong regime (bear) |
| pt_strat_004 | Mean Reversion | 53.6% | 28 | Underperforming |

**Notes:**
- pt_strat_003 works best in BULL → Will reactivate when Fear > 60

## Integration

### With Paper Trader
```javascript
// Load all active strategies
const strategies = loadActiveStrategies();

// Test each on qualifying setup
for (const strat of strategies) {
 const result = strat.analyze(tokenData);
 if (result.valid) {
 simulateTrade(result);
 updateStrategyPerformance(strat.id, outcome);

// Auto-rotation happens after each batch
strategyManager.evaluateAll();

### With Live Bot (Prana)
// Get best strategy for current regime
const bestStrategy = strategyManager.getBestStrategyForRegime(
 currentRegime, // 'BEAR', 'BULL', etc
 fearGreedIndex // 8, 50, 75, etc
);

// Deploy to live
if (bestStrategy.performance.winRate >= 80) {
 deployToLiveBot(bestStrategy);

## Best Practices

### 1. Always Register
Don't: Just create `my_strategy.js`
 Do: `node strategy-manager.js register pt_strat_XXX "Name" "Desc"`

### 2. Update After Every Batch
Don't: Let registry become stale
 Do: Update after every 10 trades

### 3. Don't Delete, Move
Don't: Delete underperforming strategies
 Do: Move to `inactive/` - they might work later!

### 4. Test Inactive Periodically
Don't: Forget about inactive strategies
 Do: Re-test when market regime changes

### 5. Archive, Don't Delete
Don't: Delete retired strategies
 Do: Move to `archive/` - preserve history

## Strategy Lifecycle Example

### pt_strat_003_breakout_momentum
2026-02-10: Created, registered as TESTING
2026-02-12: 30 trades, WR 62.5% → Moved to ACTIVE
2026-02-13: Bear market detected (Fear 8)
 WR drops to 56.3% → Moved to INACTIVE
 Note: "Works best in BULL"

[Waiting for bull market...]

2026-03-01: Fear reaches 65 (BULL regime)
 Re-test pt_strat_003
 10 trades, WR 82% → REACTIVATED to ACTIVE
 Deployed to live bot

2026-03-15: Consistent 80%+ WR maintained
 Becomes primary strategy

## Future Enhancements
- [ ] ML-based strategy selection
- [ ] Multi-strategy portfolio (combine 2-3 strategies)
- [ ] Real-time regime detection with strategy switch
- [ ] Backtest all strategies on historical data
- [ ] Strategy evolution (genetic algorithm optimization)

## Related Files
- `strategies/strategy-manager.js` - Management CLI
- `strategies/registry/strategy-master-registry.json` - Database
- `strategies/README.md` - Quick reference
- `07-current-setup.md` - Integration details

**Total Strategies:** 4
**Active:** 2
**Inactive:** 2
**Target:** 80% Win Rate
**Status:** OPERATIONAL

**Last Updated:** 2026-02-15 17:55 WIB