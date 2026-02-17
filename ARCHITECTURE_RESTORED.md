# ARSITEKTUR TRADING SYSTEM - RESTORED
**Tanggal:** 2026-02-17
**Status:** 🟢 FULL ARCHITECTURE RESTORED

---

## 🏗️ DUAL VPS ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VPS NATHA (BRAIN) 🧠                                │
│                      72.61.214.89 (Ubuntu - Primary)                        │
│                    Claude Sonnet 4.5 (Strategic AI)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐ │
│  │  PAPER TRADER v4.0  │    │ STRATEGY INTEL      │    │ COORDINATION    │ │
│  │                     │    │ NETWORK             │    │                 │ │
│  │ • 20 Strategy Combos│◄──►│ • Twitter Scraper   │◄──►│ • Decision      │ │
│  │ • Auto-testing      │    │ • Reddit Analyzer   │    │ • Config Sync   │ │
│  │ • WR Tracking       │    │ • Smart Money Track │    │ • Monitoring    │ │
│  │ • Best Strategy Pick│    │ • News Feed         │    │ • Alert System  │ │
│  └──────────┬──────────┘    └─────────────────────┘    └─────────────────┘ │
│             │                                                               │
│             ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │              ADAPTIVE-SCORING-CONFIG.JSON (Shared)                  │   │
│  │  {                                                                   │   │
│  │    "bestStrategy": { "name": "...", "winRate": 81.25 },            │   │
│  │    "positionSizing": { "WR_85+": 0.08, ... },                       │   │
│  │    "dailyTarget": 0.4,                                              │   │
│  │    "capital": { "totalSOL": 0.1885 }                                 │   │
│  │  }                                                                   │   │
│  └──────────────────────────────────┬──────────────────────────────────┘   │
│                                     │                                       │
│                                     │  Config Sync                          │
│                                     ▼                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ SSH/SCP
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VPS PRANA (EXECUTOR) ⚡                                │
│                      72.61.124.167 (Ubuntu - Backup)                        │
│                    Groq GPT-OSS 20B (Fast Execution)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐ │
│  │   LIVE TRADER v4    │    │   EXIT MONITOR v5   │    │  SWAP EXECUTOR  │ │
│  │                     │    │                     │    │                 │ │
│  │ • Auto-sync config  │◄──►│ • Real-time monitor │◄──►│ • Jupiter API   │ │
│  │ • Signal filtering  │    │ • Auto-sell TP/SL   │    │ • SolanaTracker │ │
│  │ • Anti-double order │    │ • 5s check interval │    │ • Raydium       │ │
│  │ • Position sizing   │    │ • Partial exit 50%  │    │ • Fee optimize  │ │
│  └──────────┬──────────┘    └─────────────────────┘    └─────────────────┘ │
│             │                                                               │
│             ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      POSITIONS.JSON (State)                         │   │
│  │  [                                                                 │   │
│  │    {                                                               │   │
│  │      "symbol": "TOKEN",                                            │   │
│  │      "address": "...pump",                                         │   │
│  │      "entryPrice": 0.0001,                                         │   │
│  │      "positionSize": 0.05,                                         │   │
│  │      "sl": -5%, "tp1": 10%, "tp2": 20%,                            │   │
│  │      "exited": false                                               │   │
│  │    }                                                               │   │
│  │  ]                                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 COMPONENT DETAILS

### 1. VPS NATHA (Brain) 🧠

#### A. Paper Trader v4.0
```yaml
File: soul-core-paper-trader-v4.js
Status: ✅ RESTORED
Location: /root/trading-bot/
Function:
  - Test 20 strategy combinations simultaneously
  - Track Win Rate, PnL, Max Drawdown per strategy
  - Auto-select best strategy (highest WR)
  - Update shared config file

Strategies Tested:
  1. Fibonacci Variants:
     - fib_050_1272: Entry 0.5, TP 1.272
     - fib_0618_1618: Entry 0.618, TP 1.618 (Golden)
     - fib_0786_100: Entry 0.786, TP 1.0
  
  2. Technical Indicators:
     - fib_rsi_combo: Fib + RSI Oversold
     - fib_sr_combo: Fib + Support/Resistance
     - rsi_macd_combo: RSI Divergence + MACD Cross
  
  3. On-Chain Intelligence:
     - smf_volume_combo: Smart Money + Volume Spike
     - whale_fib_combo: Whale Activity + Fib Entry
     - smf_cluster_combo: Multiple Smart Wallets
  
  4. Advanced Combinations:
     - ob_funding_combo: Order Book + Funding Rate
     - sentiment_volume_combo: Social + Volume
     - full_confluence: 3+ Indicators Required
     - golden_whale: Golden Fib + Whale Cluster

Output:
  - File: adaptive-scoring-config.json
  - Updates: Every test cycle
  - Sync: Auto to VPS PRANA
```

#### B. Strategy Intelligence Network
```yaml
Files: 
  - twitter-scraper.js
  - intelligence-bridge-fix.js
  - run-intelligence.sh
Status: ✅ RESTORED
Location: /root/trading-bot/

Data Sources:
  Twitter/X:
    - CoinGecko Trending API
    - Memecoin hashtags
    - Whale wallet alerts
  
  Smart Money:
    - Helius API (wallet tracking)
    - Birdeye (token movements)
    - Whale accumulation patterns

Storage:
  - Database: strategy-intelligence.db (SQLite)
  - Files: *_intelligence_*.json
  - Auto-feed to Paper Trader
```

#### C. Book of Knowledge (BOK)
```yaml
Location: /root/trading-bot/book-of-profit-hunter-knowledge/
Files:
  - 00-PRIMARY-OBJECTIVE.md: Trading goals
  - 06-lessons-learned.md: Mistakes & insights
  - 12-strategy-registry.md: Strategy management
  - 13-indicators-library.md: All indicators (11 total)
  - 14-external-intelligence.md: Intelligence sources

Key Indicators:
  Technical: Fibonacci, RSI, MACD, S/R, Volume
  On-Chain: Smart Money Flow, Whale Tracking, Liquidity
  Market: Funding Rate, Order Book, Social Sentiment
```

---

### 2. VPS PRANA (Executor) ⚡

#### A. Live Trader v4
```yaml
File: prana-live-trader-v4-dynamic.js
Status: ✅ RESTORED
Location: /root/trading-bot/
Schedule: Continuous (24/7)

Configuration:
  Capital: 0.1885 SOL
  Daily Target: 0.4 SOL (212% daily gain)
  Fee Reserve: 0.015 SOL
  Kill Switch: 0.05 SOL (STOP if below)
  
  Position Sizing (Dynamic):
    WR ≥85%: 0.08 SOL per trade
    WR ≥80%: 0.07 SOL per trade
    WR ≥75%: 0.06 SOL per trade
    WR ≥70%: 0.05 SOL per trade
    Default: 0.04 SOL per trade
    Minimum: 0.03 SOL per trade
    Maximum: 0.10 SOL per trade
  
  Safety Filters:
    - Score Threshold: 6+ (adaptive from paper)
    - Min Token Age: 20 minutes
    - Min Liquidity: $10,000
    - Min Volume 24h: $10,000
    - Honeypot Check: Via Solana Tracker
    - Anti-Double Order: Check positions.json

Trading Flow:
  1. Sync with Paper Trader config
  2. Scan trending tokens (DexScreener)
  3. Calculate signal score (0-10)
  4. Check existing position (anti-duplicate)
  5. Run honeypot test
  6. Calculate Fibonacci targets
  7. Execute buy (if all pass)
  8. Save position to positions.json
  9. Start dedicated exit monitor
  10. Report to Telegram
```

#### B. Exit Monitor v5
```yaml
File: exit-monitor-v5.js (template)
Status: ✅ RESTORED
Location: /root/trading-bot/exit-monitor-{token}.js
Schedule: Continuous per position

Function:
  - Monitor active position every 5 seconds
  - Check current price vs entry
  - Auto-execute sell at targets
  - Report all exits to Telegram

Exit Logic:
  TP1 Hit (e.g., +10%):
    - Sell 50% of position
    - Keep 50% for TP2
    - Update partialExitDone: true
    - Continue monitoring
  
  TP2 Hit (e.g., +20%):
    - Sell remaining 50% (or 100% if no partial)
    - Mark position as exited
    - Send profit notification
    - Clean up monitor file
  
  SL Hit (e.g., -5%):
    - Sell 100% immediately
    - Mark position as exited
    - Send loss notification
    - Clean up monitor file
```

---

## 🔄 DATA FLOW & SYNC

### Real-time Synchronization

```
┌────────────────────────────────────────────────────────────────┐
│  PAPER TRADER (NATHA)                                          │
│  ├─ Test 20 strategies                                         │
│  ├─ Calculate Win Rates                                        │
│  └─ Pick Best Strategy (highest WR)                           │
│                      │                                         │
│                      ▼                                         │
│  ┌─────────────────────────────────────┐                       │
│  │  adaptive-scoring-config.json       │                       │
│  │  {                                  │                       │
│  │    "bestStrategy": {                │                       │
│  │      "name": "ob_funding_combo",    │                       │
│  │      "winRate": 81.25,              │                       │
│  │      "indicators": [...]            │                       │
│  │    },                               │                       │
│  │    "positionSizing": {...},         │                       │
│  │    "dailyTarget": 0.4               │                       │
│  │  }                                  │                       │
│  └──────────┬──────────────────────────┘                       │
│             │                                                   │
│             │  File Sync (SCP/Shared)                          │
│             ▼                                                   │
└────────────────────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────┐
│  LIVE TRADER (PRANA)                                           │
│  ├─ Read config on startup                                     │
│  ├─ Watch for config changes                                   │
│  ├─ Deploy best strategy                                       │
│  └─ Use position sizing from config                           │
│                      │                                         │
│                      ▼                                         │
│  ├─ Scan market → Find setup → Execute Buy                    │
│  ├─ Save to positions.json                                     │
│  └─ Start Exit Monitor                                         │
│                      │                                         │
│                      ▼                                         │
│  EXIT MONITOR        │                                         │
│  ├─ Check price every 5s                                      │
│  ├─ Hit TP/SL → Execute Sell                                  │
│  ├─ Update positions.json (exited: true)                      │
│  └─ Report to Telegram                                         │
└────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ SAFETY SYSTEMS

### 1. Anti-Double Order Protection
### 2. Kill Switch
### 3. Honeypot Detection
### 4. Fee Reserve

(All documented in COMPLETE_SYSTEM_ARCHITECTURE_v5.md)

---

## 📱 TELEGRAM INTEGRATION

### Bot: @YPMacAirBot (TuanBot)
**Group:** Natha's Corp (-1003212463774)

### Topic Structure:
- Topic 22: Scanner Alerts
- Topic 24: Active Positions
- Topic 25: Trade Evaluations
- Topic 26: Performance Tracking

---

## 🚀 DEPLOYMENT STATUS

| Component | VPS | Status | File |
|-----------|-----|--------|------|
| Paper Trader v4.0 | NATHA | ✅ RESTORED | soul-core-paper-trader-v4.js |
| Strategy Intel | NATHA | ✅ RESTORED | twitter-scraper.js, etc |
| Live Trader v4 | PRANA | ✅ RESTORED | prana-live-trader-v4-dynamic.js |
| Exit Monitor v5 | PRANA | ✅ RESTORED | exit-monitor-v5.js |
| BOK | NATHA | ✅ RESTORED | book-of-profit-hunter-knowledge/ |
| Config Sync | BOTH | ✅ RESTORED | adaptive-scoring-config.json |

---

**Status:** 🟢 FULL ARCHITECTURE RESTORED
**Date:** 2026-02-17
**Next:** Re-enable cron jobs and start testing

*Generated by Natha - Trading Bot Leader*
