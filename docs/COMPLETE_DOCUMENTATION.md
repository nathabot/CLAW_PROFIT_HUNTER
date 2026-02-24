# 📚 CLAW PROFIT HUNTER - Complete Documentation

## 🎯 Overview

**CLAW PROFIT HUNTER** is an automated trading system for Solana blockchain with a 4-layer integrated architecture. This system combines strategy intelligence, paper trading simulation, and real-time execution with strict risk management.

---

## 🏗️ System Architecture

### 4-LAYER ARCHITECTURE

```
Layer 1: Strategy Intelligence (every 4 hours)
Layer 2: Paper Trader (every 10 minutes)  
Layer 3: Book of Knowledge (BOK)
Layer 4: Live Trader (real-time execution)
```

---

## 🎛️ Trading Mode Selector (v1.0)

Dual-mode trading system for different market conditions:

| Mode | Liquidity | Token Age | Max Hold | Risk | Best For |
|------|-----------|-----------|----------|------|----------|
| **Established** | >$10k | >24h | 3 hours | LOW | Stable market |
| **Degen** | >$5k | >6h | 10 minutes | HIGH | Volatile/Trending |

### Configuration
```json
{
  "TRADING_MODE": {
    "VERSION": "1.0",
    "MODE": "auto",
    "ACTIVE": "established",
    "DEGEN_ENABLED": false
  }
}
```

### Rollback
```bash
sed -i 's/"MODE": "auto"/"MODE": "manual"/' trading-config.json
```

---

## 🧠 Intelligence Enhancements (v2.0+)

### 1. Market Condition Analyzer
- Real-time market sentiment analysis
- Input: Fear & Greed Index, BTC Dominance, Whale Activity
- Output: Market sentiment score (0-100)

### 2. Strategy Rotation System
- Rotate strategies based on WR performance
- WR >= 61% → Strategy POSITIVE → Auto-sync to Live Trader
- WR < 61% → Strategy NEGATIVE → Test in Paper Trader

### 3. Live to Paper Feedback Loop
- Transfer learning from live trades to paper trading
- Winning patterns → BOK Intelligence
- Loss patterns → Paper Trader improvement

---

## 🛡️ Supporting Agents

| Agent | Function | Schedule |
|-------|----------|----------|
| Balance Guardian | Monitor balance, emergency stop | Every 5 min |
| SL Tracker | 3-strike blacklist system | Every 5 min |
| Evaluation System | Auto-pause if WR < 60% | Every 2 hours |
| System Monitor | Monitor duplicates, integrity | Every 15 min |
| Self-Healing Watchdog | Auto-restart crashed processes | Continuously |

---

## 🔧 Key Features

### Candle Analysis (5-Step)
1. Price History (10 min window)
2. Find Recent High
3. Check >1% below high? → If not, SKIP
4. Check red candle recently? → If yes, WAIT 2 min
5. Check green candle forming? → If yes, ENTRY!

### Dynamic TP/SL Engine
| Category | SL | TP1 | TP2 | Max Hold |
|----------|-----|-----|-----|----------|
| FAST_TRADE | 1.5% | 3% | 5% | 5 min |
| SCALPING | 2% | 4% | 6% | 15 min |
| SNIPER | 3% | 8% | 15% | 30 min |
| SWING_TRADE | 5% | 12% | 25% | 120 min |

### System Protection
- Balance Drop >25% in 30 min → Emergency Stop
- Drawdown >30% from peak → Stop Trading
- Daily Limit 10 trades → Pause
- 3-Strike (3x SL on same token) → Blacklist

---

## 🚀 Quick Start

```bash
# Install
npm install

# Start all systems
npm run start:all

# Monitor
pm2 status
```

---

## 📁 File Structure

```
CLAW_PROFIT_HUNTER/
├── src/
│   ├── live-trader-v4.2.js       # Live execution
│   ├── soul-core-paper-trader-v5.js  # Paper simulation
│   ├── strategy-intelligence-v2.js   # Signal generation
│   └── dynamic-tpsl-engine.js      # TP/SL calculation
├── config/
│   ├── adaptive-scoring-config.json
│   └── trading-config.json
├── bok/                           # Book of Knowledge
│   ├── positive-strategies.md
│   └── negative-strategies.md
└── docs/
```

---

## ⚙️ Configuration

### Environment Variables
```bash
SOLANA_RPC_URL=https://mainnet.helius-rpc.com
HELIUS_API_KEY=your_api_key
TELEGRAM_BOT_TOKEN=your_bot_token
```

---

## 🔍 Troubleshooting

### Common Issues
| Issue | Solution |
|-------|----------|
| Live Trader not running | Check EMERGENCY_STOP file |
| No signals | Wait for next 4-hour cycle |
| Balance dropping | Check drawdown limits |

### Emergency Commands
```bash
# Stop all trading
pkill -f live-trader
echo $(date +%s) > EMERGENCY_STOP

# Reset
rm -f EMERGENCY_STOP PAUSE_TRADING
pm2 restart all
```

---

## ⚠️ Disclaimer

- This system is for EDUCATIONAL PURPOSES
- Trading cryptocurrency involves HIGH RISK
- Always test in paper trading first before live
- Never invest more than you can afford to lose

**The creators are not responsible for any financial losses.**

---

## 📄 License

MIT License - See LICENSE file

---

**Last Updated:** 2026-02-24  
**Version:** 2.1.0  
**Status:** Production Ready ✅
