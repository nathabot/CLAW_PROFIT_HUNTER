# 🎯 CLAW PROFIT HUNTER

Advanced Automated Trading System for Solana

## 🏗️ 4-Layer Architecture

```
Intelligence → Paper Trader → BOK → Live Trader
    (4 jam)       (10 min)     (Auto)   (Real-time)
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

## 📚 Dokumentasi

- [Quick Start](QUICK_START.md) - Setup 5 menit
- [Dokumentasi Lengkap](docs/COMPLETE_DOCUMENTATION.md) - Semua fitur

## 🛡️ Safety Features

- 3-Strike Blacklist
- Balance Protection (25% drop = stop)
- Daily Trade Limit (max 10)
- FOMO Protection
- Emergency Stop

## 📊 System Components

| Layer | File | Status |
|-------|------|--------|
| Intelligence | strategy-intelligence-v2.js | Auto 4 jam |
| Paper Trader | soul-core-paper-trader-v5.js | Auto 10 menit |
| Live Trader | live-trader-v4.2.js | Manual start |
| Guardian | balance-guardian.js | Auto 5 menit |

## ⚠️ Disclaimer

Educational purposes only. Trading involves significant risk.

See [LICENSE](LICENSE) for details.
