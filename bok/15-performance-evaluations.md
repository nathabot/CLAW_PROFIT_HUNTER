# 15 - Performance Evaluations
**BOK (Book of Knowledge)**  
**Purpose:** Track trading performance, system evaluations, and automated decisions

---

## 📊 Evaluation System Overview

**Schedule:** Every 2 hours (automated cron)
**Metrics Tracked:**
- Win Rate (WR)
- Profit/Loss (SOL)
- Drawdown
- Volatility
- WR-Profit correlation

**Decision Logic:**
```
IF (WR >= 60% AND Profit >= 0.05 SOL):
    ✅ VERDICT: POSITIVE → Continue trading

IF (WR < 60% OR Profit < 0 OR Drawdown > 20%):
    ❌ VERDICT: NEGATIVE → Stop and reevaluate
```

---

## 💰 BALANCE PROTECTION SYSTEM

**Real-time Monitoring:**
- Track peak balance
- Calculate drawdown from peak
- Auto-stop at 30% drawdown
- Warning at 20% drawdown

**Trigger Conditions:**
```
IF (Drawdown >= 30%):
    🛑 EMERGENCY STOP - All trading halted
    
IF (Drawdown >= 20%):
    ⚠️ WARNING - Monitor closely
    
IF (New peak balance):
    📈 Update peak record
```

**Recovery:**
- Manual intervention required after emergency stop
- Review positions and market conditions
- Reset only after analysis complete

---

## 🎯 3-STRIKE RULE (Token Repeat Protection)

**Purpose:** Prevent repeated losses on same token

**Rule:**
```
IF (SL count >= 3 on SAME token):
    🚫 BLACKLIST token permanently
    ❌ NO MORE TRADES on this token
    📝 Record as "TOXIC TOKEN" in BOK

IF (SL count == 2):
    ⚠️ ONE LAST CHANCE only
    🎯 ONLY if setup is PERFECT (score 10/10)
    📉 Reduce position size by 50%
    ⏱️ Shorter hold time (max 10 min)

IF (SL count == 1):
    ✅ Can try again
    🧐 Analyze why SL hit (timing? setup?)
    🎯 Improve entry criteria
```

**Why Tokens Get Multiple SLs:**

1. **Token Manipulation (Rug Pull Setup)**
   - Entry pumps, immediate dump
   - Fake volume (wash trading)
   - Dev constantly selling
   - No buyer support
   → **BLACKLIST IMMEDIATELY**

2. **Wrong Timing (Market Condition)**
   - Good token but bearish market
   - Entry too late (FOMO)
   - Didn't wait for pullback
   → Wait for market improvement

3. **Strategy Mismatch**
   - Low volatility (no movement)
   - Too volatile (whipsaw)
   - Doesn't fit TP/SL settings
   → Skip, find better token

---

## 📋 Evaluation History

### Template Entry:
```markdown
### [YYYY-MM-DD HH:MM] - Evaluation #[Number]
**Win Rate:** XX%  
**Profit:** +X.XX SOL  
**Drawdown:** XX%  
**Volatility:** XX%  
**Verdict:** [POSITIVE/NEGATIVE/NEUTRAL]  
**Action Taken:** [Continue/Stop/Adjust parameters]  
**Notes:** [Any observations or issues]
```

---

## 🎯 Thresholds & Actions

| Parameter | Threshold | Action |
|-----------|-----------|--------|
| Win Rate | < 60% | ⬆️ Increase score threshold |
| Profit SOL | < 0.05 | 📉 Reduce position size |
| Drawdown | > 20% | 🛑 Stop trading immediately |
| Volatility | > 40% | ⏸️ Wait for stable conditions |
| WR-Profit | Not correlated | 🔧 Review strategy |

---

## 🔄 Automated Actions

**POSITIVE Verdict:**
- Continue trading with current parameters
- Optional: Optimize position sizing

**NEGATIVE Verdict:**
- Pause Live Trader
- Review BOK for strategy adjustments
- Test new parameters in Paper Trader first
- Resume only after validation

---

## 📱 Notifications

**Telegram Topic #24:**
- Evaluation results
- Verdict and recommendation
- Action taken (auto-pause, continue, etc.)

---

## 📝 Notes

- Evaluations run automatically every 2 hours
- Manual evaluation can be triggered anytime
- All decisions are logged with timestamp
- Correlation between WR and profit is critical metric

---

**Last Updated:** 2026-02-17

---

## 🛡️ BALANCE GUARDIAN AGENT

**Purpose:** Auto-monitor balance and emergency response

**File:** `balance-guardian.js`

**Schedule:** Every 5 minutes

**Triggers:**
```
Drop >=25% in 30 min → EMERGENCY STOP + Evaluation Mode
Drop >=15% in 30 min → ALERT
Strong down trend → Preemptive warning
```

**Auto-Actions:**
1. Stop Live Trader
2. Pause all new buys
3. Run Paper Trader optimization
4. Find strategy with WR >=70%
5. Notify for manual resume

**Manual Resume:**
```bash
rm /root/trading-bot/EMERGENCY_STOP
rm /root/trading-bot/EVALUATION_MODE
rm /root/trading-bot/PAUSE_TRADING
pm2 start live-trader-v4.2
```  
**Next Evaluation:** [Auto-scheduled]

### 2026-02-17T02:45:21.558Z - Evaluation #2

**Metrics:**
- Total Trades: 4
- Win Rate: 0.00%
- Profit: NaN SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** STOP_AND_REEVALUATE
**Consecutive Negative:** 1

---

### 2026-02-17T03:00:02.654Z - Evaluation #3

**Metrics:**
- Total Trades: 4
- Win Rate: 0.00%
- Profit: NaN SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** STOP_AND_REEVALUATE
**Consecutive Negative:** 2

---

### 2026-02-17T08:36:01.491Z - Evaluation #2

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T08:39:30.680Z - Evaluation #2

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T08:41:32.435Z - Evaluation #3

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T08:41:58.486Z - Evaluation #4

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T09:00:02.014Z - Evaluation #5

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T11:00:01.618Z - Evaluation #6

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T13:00:01.492Z - Evaluation #7

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T15:00:01.783Z - Evaluation #8

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T17:00:01.526Z - Evaluation #9

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T19:00:01.828Z - Evaluation #10

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T21:00:02.121Z - Evaluation #11

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-17T23:00:01.326Z - Evaluation #12

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T01:00:01.261Z - Evaluation #13

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T03:00:02.931Z - Evaluation #14

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T05:00:01.398Z - Evaluation #15

**Metrics:**
- Total Trades: 0
- Win Rate: 0.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T05:49:20.486Z - Evaluation #16

**Metrics:**
- Total Trades: 1
- Win Rate: 100.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ✅
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T07:00:02.334Z - Evaluation #17

**Metrics:**
- Total Trades: 1
- Win Rate: 100.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ✅
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T09:00:02.024Z - Evaluation #18

**Metrics:**
- Total Trades: 1
- Win Rate: 100.00%
- Profit: 0.0000 SOL
- Drawdown: 0.00%
- Volatility: 0.00%

**Checks:**
- Win Rate ≥ 60%: ✅
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ✅
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T11:00:01.745Z - Evaluation #19

**Metrics:**
- Total Trades: 5
- Win Rate: 20.00%
- Profit: -0.0015 SOL
- Drawdown: 70537.72%
- Volatility: 8.18%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T13:00:02.269Z - Evaluation #20

**Metrics:**
- Total Trades: 8
- Win Rate: 12.50%
- Profit: -0.0098 SOL
- Drawdown: 448338.36%
- Volatility: 29.01%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T15:00:02.306Z - Evaluation #21

**Metrics:**
- Total Trades: 8
- Win Rate: 12.50%
- Profit: -0.0098 SOL
- Drawdown: 448338.36%
- Volatility: 29.01%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEUTRAL
**Action:** CONTINUE
**Consecutive Negative:** 0

---

### 2026-02-18T17:00:03.559Z - Evaluation #22

**Metrics:**
- Total Trades: 12
- Win Rate: 25.00%
- Profit: -0.0099 SOL
- Drawdown: 453939.76%
- Volatility: 26.23%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** STOP_AND_REEVALUATE
**Consecutive Negative:** 1

---

### 2026-02-18T19:00:03.816Z - Evaluation #23

**Metrics:**
- Total Trades: 12
- Win Rate: 25.00%
- Profit: -0.0099 SOL
- Drawdown: 453939.76%
- Volatility: 26.23%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** STOP_AND_REEVALUATE
**Consecutive Negative:** 2

---

### 2026-02-18T21:00:04.141Z - Evaluation #24

**Metrics:**
- Total Trades: 12
- Win Rate: 25.00%
- Profit: -0.0099 SOL
- Drawdown: 453939.76%
- Volatility: 26.23%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** EMERGENCY_STOP
**Consecutive Negative:** 3

---

### 2026-02-18T23:00:03.598Z - Evaluation #25

**Metrics:**
- Total Trades: 12
- Win Rate: 25.00%
- Profit: -0.0099 SOL
- Drawdown: 453939.76%
- Volatility: 26.23%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** EMERGENCY_STOP
**Consecutive Negative:** 4

---

### 2026-02-19T01:00:03.091Z - Evaluation #27

**Metrics:**
- Total Trades: 17
- Win Rate: 17.65%
- Profit: -0.0101 SOL
- Drawdown: 466152.53%
- Volatility: 23.13%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** STOP_AND_REEVALUATE
**Consecutive Negative:** 1

---

### 2026-02-19T03:00:02.966Z - Evaluation #28

**Metrics:**
- Total Trades: 17
- Win Rate: 17.65%
- Profit: -0.0101 SOL
- Drawdown: 466152.53%
- Volatility: 23.13%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** STOP_AND_REEVALUATE
**Consecutive Negative:** 2

---

### 2026-02-19T05:00:04.989Z - Evaluation #29

**Metrics:**
- Total Trades: 17
- Win Rate: 17.65%
- Profit: -0.0101 SOL
- Drawdown: 466152.53%
- Volatility: 23.13%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** EMERGENCY_STOP
**Consecutive Negative:** 3

---

### 2026-02-19T07:00:03.118Z - Evaluation #30

**Metrics:**
- Total Trades: 17
- Win Rate: 17.65%
- Profit: -0.0101 SOL
- Drawdown: 466152.53%
- Volatility: 23.13%

**Checks:**
- Win Rate ≥ 60%: ❌
- Profit ≥ 0.05 SOL: ❌
- Drawdown ≤ 20%: ❌
- Volatility ≤ 40%: ✅

**Verdict:** NEGATIVE
**Action:** EMERGENCY_STOP
**Consecutive Negative:** 4

---
