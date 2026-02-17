# STRATEGY REVISION - FEB 16, 2026
## Problem: Balance dropped 47% from peak

### ROOT CAUSES:
1. Too many concurrent positions (over-trading)
2. Score 6/10 trades (25% WR) - death trap
3. Exit delays caused larger losses
4. No max drawdown protection

### NEW STRICT RULES:

#### 1. SCORE THRESHOLD
- OLD: 6/10 minimum
- NEW: 9/10 minimum (only gold standard)
- Reject: Score 6-8 (proven 25-50% WR)

#### 2. POSITION LIMITS
- OLD: Unlimited positions
- NEW: Max 2 positions at any time
- Max daily trades: 3

#### 3. DRAWDOWN PROTECTION
- NEW: Stop trading if balance drops >20% from peak
- NEW: Daily loss limit: 0.02 SOL max

#### 4. ENTRY FILTERS (Stricter)
- Score: 9/10 minimum
- Liquidity: >$50k (was $20k)
- Volume 24h: >$100k
- Token age: 1-7 days only
- No consecutive losses >2

#### 5. EXIT STRATEGY
- SL: Strict -3% (no adjustment)
- TP1: +5% (partial 50%)
- TP2: +8% (full exit)
- Max hold time: 30 minutes
- Dynamic interval: 15s (always high alert)

#### 6. VOLATILITY CHECK
- Skip if M5 change >10%
- Skip if H1 change >20%
- Only trade stable momentum

### IMPLEMENTATION:
1. Update live trader filters
2. Set max positions = 2
3. Add drawdown protection
4. Paper test 50 trades first
5. Live only if WR >70%

### TARGET:
- Conservative: 0.5% daily gain
- Monthly: 15% gain (compound)
- Risk per trade: 1% max
