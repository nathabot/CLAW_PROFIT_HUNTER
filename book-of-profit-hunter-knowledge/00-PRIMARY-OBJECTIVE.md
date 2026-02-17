# BOOK OF KNOWLEDGE (BOK) - TRADING SYSTEM SETTINGS
**Version:** 1.0  
**Date:** 2026-02-16  
**Status:** ACTIVE

---

## STANDARD SETTINGS (BOK COMPLIANT)

These settings are the **Single Source of Truth** for both Paper Trader and Live Trader.

### Liquidity & Volume Filters
```yaml
MIN_LIQUIDITY: 5000        # $5,000 USD minimum
MIN_VOLUME: 5000           # $5,000 USD minimum
Reason: "Balance between liquidity for exits and trading opportunities"
```

### Fee Management
```yaml
FEE_RESERVE: 0.015         # Always keep 0.015 SOL minimum
Reason: "Ensure sufficient funds for sell transaction fees"
```

### Position Sizing (Flexible)
```yaml
MIN_POSITION_SIZE: 0.015   # Minimum SOL per trade (BOK)
DEFAULT_POSITION_SIZE: 0.025  # Default size
MAX_POSITION_SIZE: 0.05    # Maximum SOL per trade
MAX_DAILY_TRADES: 10       # Maximum trades per day
DAILY_TARGET: 0.2          # SOL profit target ($50)

Position Size Rules (based on Strategy WR):
  WR >= 85%: 0.04 SOL (high confidence)
  WR >= 80%: 0.035 SOL (good confidence)
  WR >= 75%: 0.03 SOL (moderate confidence)
  WR >= 70%: 0.025 SOL (default)
  WR >= 65%: 0.02 SOL (lower confidence)
  WR < 65%: 0.015 SOL (minimum)
```

### Token Age
```yaml
MIN_TOKEN_AGE_MINUTES: 20  # Minimum token age
Reason: "Avoid brand new tokens (rug risk) while keeping opportunities"
```

### Scoring Threshold
```yaml
SILENCE_THRESHOLD: 5       # Score 5+/10 for entry
Reason: "Validated 70%+ win rate at this threshold"
```

---

## FIBONACCI STRATEGY SETTINGS

### Standard Fibonacci Levels (BOK)
```yaml
fib_0618_1618:             # Golden Ratio (BEST - 82.5% WR)
  entryFib: 0.618
  tp1Fib: 1.0
  tp2Fib: 1.618
  slFib: 0.5
  partialExit: 50% at TP1
  
fib_0786_100:              # Alternative (82.5% WR)
  entryFib: 0.786
  tp1Fib: 1.0
  tp2Fib: 1.272
  slFib: 0.618
  
fib_dynamic:               # Volatility-based (75% WR)
  entryFib: dynamic
  tp1Fib: 1.0
  tp2Fib: 1.618
```

### 🏆 Current Best Strategy (VERIFIED)
**fib_0618_1618 (Golden Ratio)**
- **Win Rate: 82.69%** ⭐ HIGHEST
- Total Trades: 52
- Wins: 43 | Losses: 9
- PnL: +1,056.8%
- Status: ACTIVE in Live Trader

### Strategy Ranking (All Tested)
| Rank | Strategy | Win Rate | PnL | Status |
|------|----------|----------|-----|--------|
| 🥇 | fib_0618_1618 | 82.69% | +1,056% | ✅ ACTIVE |
| 🥈 | fib_0786_100 | 80.00% | +892% | Candidate |
| 🥉 | fib_dynamic | 75.00% | +724% | Testing |
| 4 | fib_050_1272 | 60.84% | +520% | Monitor |

---

## RISK MANAGEMENT RULES

### Kill Switch Conditions
1. Balance < 0.03 SOL → HALT all trading
2. Balance < FEE_RESERVE (0.015) → HALT new positions
3. 3 consecutive losses → Reduce position size 50%
4. Daily drawdown > 20% → PAUSE for review

### Stop Loss Rules
```yaml
SL_PERCENT: 3              # -3% strict stop loss
SL_FIB: 0.5                # Stop below 0.5 Fibonacci
Execution: IMMEDIATE       # No exceptions
```

### Take Profit Rules
```yaml
TP1_PERCENT: 6             # +6% first target
TP2_FIB: 1.618             # Fibonacci extension
Partial Exit: 50% at TP1   # Lock in profits
Final Exit: 50% at TP2     # Let winners run
```

---

## AUTO-SYNC CONFIGURATION

### Paper Trader → Live Trader Sync
```yaml
Sync Interval: Every scan (5 minutes)
Synced Parameters:
  - MIN_SCORE (threshold)
  - Best Fibonacci strategy
  - Liquidity settings
  - Volume settings
  - Token age
  
Auto-Adjust: YES
Manual Override: Yusron only
```

### Strategy Selection (Auto-Sync)

**Rule: Prana Live ALWAYS uses strategy with HIGHEST WR% from Paper Trader**

```yaml
Selection Method: Auto-sync every 5 minutes
Criteria: Highest WR% (minimum 10 trades for validation)
Current Winner: fib_0618_1618 (82.69% WR)

Sync Process:
  1. Paper Trader tests ALL strategies continuously
  2. Every 5 min: Calculate WR% for each strategy
  3. Identify: Strategy with highest WR%
  4. Sync: Auto-update Prana Live to use best strategy
  5. Execute: Prana Live trades with winner strategy

Example Flow:
  • Paper tests fib_0618_1618 = 82.69% WR (current best)
  • Paper tests fib_NEW = 85% WR (new best!)
  • Auto-sync: Prana Live switches to fib_NEW
  • Result: Always using strategy with highest WR%

Note: Paper Trader keeps testing all strategies + new ones
      to find even better settings for 80%+ target
```

---

## PERFORMANCE TARGETS

### Daily
- Trades: 8-10
- Win Rate: 80%+
- PnL: +0.2 SOL ($50)

### Weekly
- Trades: 60+
- Cumulative WR: 75%+
- PnL: +1.4 SOL ($350)

### Monthly
- Trades: 240+
- Consistent WR: 80%+
- PnL: +6 SOL ($1,500)

---

## STRATEGY OPTIMIZATION

### Testing Protocol
1. Paper Trader tests ALL strategies
2. Minimum 20 trades for validation
3. Track: WR%, PnL, drawdown, slippage
4. Promote best strategy to Live

### Current Testing
```yaml
Active Strategies: 4
Test Duration: Until 80%+ WR confirmed
Promotion Criteria: ≥80% WR, 20+ trades
Archive Criteria: <65% WR after 20 trades
```

### Free to Adjust (Until 80% WR)
- Entry Fibonacci levels
- TP/SL percentages
- Partial exit ratios
- Scoring weights
- Scan frequency

### Fixed (Do Not Change)
- Liquidity: $5K minimum
- Fee Reserve: 0.015 SOL
- Kill Switch: 0.03 SOL
- SL: -3% strict
- Sync: Paper → Live

---

## DOCUMENTATION

### When to Update BOK
1. New validated strategy (≥80% WR)
2. Changed market conditions
3. New risk rules
4. Yusron approval

### Update Process
1. Test in Paper Trader first
2. Validate 100+ trades
3. Update this file
4. Sync to Live Trader
5. Git commit
6. Telegram notification

---

## CURRENT STATUS

```yaml
Last Updated: 2026-02-16
Paper Trader: 540 trades, 74.3% WR
Best Strategy: fib_0618_1618 (82.5% WR)
Live Trader: 3 positions open
Balance: 0.0063 SOL (NEED DEPOSIT)
Status: HALTED (balance < 0.015 FEE_RESERVE)
```

---

## TRANSACTION VERIFICATION

### Transaction Verifier Bot
Dedicated bot for monitoring and verifying all transactions.

```yaml
Service: tx-verifier-bot.service
Location: /root/trading-bot/tx-verifier-bot.js
Schedule: Every 2 minutes
Report: Telegram Topic #24 + hourly summary
```

### What It Monitors:
- ✅ All BUY transactions (Solana Tracker)
- ✅ All SELL transactions (Auto-exit)
- ✅ Tx hash verification on blockchain
- ✅ Solscan confirmation
- ✅ Success/failure reporting

### Verification Process:
1. Scan live-trades.log for "SWAP SUCCESS"
2. Extract transaction hash
3. Check blockchain confirmation (RPC)
4. Check Solscan status
5. Report result with tx hash link

### Notifications:
- **Success**: ✅ Transaction verified + tx hash
- **Failure**: 🚨 Transaction failed + error details
- **Hourly Report**: Summary stats (success rate)

---

## ERROR ESCALATION SYSTEM

### Error Escalation Bot
Dedicated bot for detecting and escalating errors to Natha (Main Agent).

```yaml
Service: error-escalation-bot.service
Location: /root/trading-bot/error-escalation-bot.js
Schedule: Every 30 seconds
Target: Natha (Main Agent) - Immediate alert
```

### What It Monitors:
- ❌ All FAILED messages
- ❌ All ERROR messages
- ❌ CRITICAL exceptions
- ❌ Connection failures
- ❌ Timeout errors
- ❌ Service crashes

### Monitored Logs:
- live-trades.log
- paper-trades.log
- watchdog.log
- natha-prana-skill.log
- natha-prana-alerts.log
- tx-verifier-bot.log

### Escalation Process:
1. Scan all log files (every 30 sec)
2. Detect ERROR/FAILED keywords
3. Check for duplicates (5-min cooldown)
4. Send immediate alert to Natha
5. Log to error-escalations.log

### Alert Format:
```
🚨 ERROR ESCALATION #X
Severity: CRITICAL/HIGH/MEDIUM
Time: [timestamp]
Source: [log file]
Error: [details]
Action: Natha fix immediately!
```

### Response Time:
- Detection: < 30 seconds
- Alert: Immediate
- Cooldown: 5 minutes (prevent spam)

---

**BOK is the Single Source of Truth. All bots must follow these settings.**
