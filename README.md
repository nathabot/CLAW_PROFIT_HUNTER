# 🎯 CLAW PROFIT HUNTER

Advanced Automated Trading System for Solana

## 🏗️ 4-Layer Architecture

```
Intelligence → Paper Trader → BOK → Live Trader
    (4 hrs)       (10 min)     (Auto)   (Real-time)
```

## 🎛️ Trading Mode Selector (v1.0)

Dual-mode trading system for different market conditions:

| Mode | Filters | Risk | Best For |
|------|---------|------|----------|
| **Established** | Liq >$10k, Age >24h, Max hold 3h | LOW | Stable market |
| **Degen** | Liq >$5k, Age >6h, Max hold 10min | HIGH | Volatile/Trending |

### Config (trading-config.json)
```json
{
  "TRADING_MODE": {
    "VERSION": "1.0",
    "MODE": "auto",        // "auto" or "manual"
    "ACTIVE": "established", // "established" or "degen"
    "DEGEN_ENABLED": false,
    "AUTO_TYPE": "performance"
  }
}
```

### Auto Switch Logic
- **Performance-based**: Switch to mode with higher WR
- **Time-based**: Optional schedule

### Proven Tokens
- `bok/proven-established.json` - Tokens from Established mode
- `bok/proven-degen.json` - Tokens from Degen mode

### Rollback
```bash
sed -i 's/"MODE": "auto"/"MODE": "manual"/' trading-config.json
```

## 🚀 Quick Start

```bash
# Setup
npm install

# Start all systems
npm run start:all

# Monitor
npm run monitor
```

## 📚 Documentation

- [Quick Start](QUICK_START.md) - 5 minute setup
- [Complete Documentation](docs/COMPLETE_DOCUMENTATION.md) - All features

## 📊 System Components

| Layer | File | Status |
|-------|------|--------|
| Intelligence | strategy-intelligence-v2.js | Auto 4 hrs |
| Paper Trader | soul-core-paper-trader-v5.js | Auto 10 min |
| Live Trader | live-trader-v4.2.js | Cron 5 min |
| Guardian | balance-guardian.js | Auto |
| Exit Monitor | exit-monitor-*.js | Per-position |
| Dashboard | src/dashboard-server.js | Running |

## 🛡️ Safety Features

- **Token Tracking**: Max 3 trades/token, 60-min cooldown
- **Confirmation Window**: 2 checks (15s) to prevent false TP
- **Slippage Protection**: 50% SL, 35% TP
- **Balance Guardian**: Stop trading if balance < 0.03 SOL
- **Max Positions**: 2-3 concurrent

## ⚠️ Disclaimer

Educational purposes only. Trading involves significant risk.

See [LICENSE](LICENSE) for details.
