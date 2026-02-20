# 📚 CLAW PROFIT HUNTER - Dokumentasi Lengkap

## 🎯 Overview

**CLAW PROFIT HUNTER** adalah sistem trading otomatis untuk Solana blockchain dengan arsitektur 4-layer yang terintegrasi. Sistem ini menggabungkan strategi intelligence, simulasi paper trading, dan eksekusi real-time dengan manajemen risiko yang ketat.

---

## 🏗️ Arsitektur Sistem

### 4-LAYER ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1: STRATEGY INTELLIGENCE                                         │
│  ├─ File: strategy-intelligence-v2.js                                   │
│  ├─ Jadwal: Tiap 4 jam                                                  │
│  ├─ Fungsi: Scan market, generate signals, confidence scoring           │
│  └─ Output: strategy-intelligence.db                                    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: PAPER TRADER (Testing Ground)                                 │
│  ├─ File: soul-core-paper-trader-v5.js                                  │
│  ├─ Jadwal: Tiap 10 menit                                               │
│  ├─ Fungsi: Simulasi semua signals, hitung WR, validasi strategi        │
│  └─ Output: BOK Positive/Negative, adaptive-scoring-config.json         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3: BOOK OF KNOWLEDGE (BOK)                                       │
│  ├─ File: 16-positive-strategies.md, 17-negative-strategies.md          │
│  ├─ Update: Auto oleh Paper Trader                                      │
│  └─ Kriteria: WR >= 70% masuk Positive, WR < 70% masuk Negative         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: LIVE TRADER (Execution)                                       │
│  ├─ File: live-trader-v4.2.js                                           │
│  ├─ Status: Manual start (pm2)                                          │
│  ├─ Fungsi: Eksekusi real trading, sync strategy dari BOK               │
│  └─ Integrasi: Dynamic TP/SL Engine, Candle Analysis, Balance Protection│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎛️ Trading Mode Selector (v1.0)

Sistem dual-mode trading untuk kondisi market berbeda:

### Mode Overview

| Mode | Liquidity | Token Age | Max Hold | Risk | Best For |
|------|-----------|-----------|----------|------|----------|
| **Established** | >$10k | >24h | 3 jam | LOW | Stable market |
| **Degen** | >$5k | >6h | 10 menit | HIGH | Volatile/Trending |

### Konfigurasi (`trading-config.json`)

```json
{
  "TRADING_MODE": {
    "VERSION": "1.0",
    "MODE": "auto",
    "ACTIVE": "established",
    "DEGEN_ENABLED": false,
    "AUTO_TYPE": "performance"
  }
}
```

### Auto Switch Logic
- **Performance-based**: Switch ke mode dengan WR lebih tinggi
- **Time-based**: Optional schedule

### Proven Tokens
- `bok/proven-established.json` - Tokens dari Established mode
- `bok/proven-degen.json` - Tokens dari Degen mode

### Statistics Tracking
File: `mode-stats.json` - Track WR per mode

### Rollback
```bash
sed -i 's/"MODE": "auto"/"MODE": "manual"/' trading-config.json
```

---

## 🧠 INTELLIGENCE ENHANCEMENTS (v2.0+)

### 1. Market Condition Analyzer
- **File:** `market-condition-analyzer.js`
- **Fungsi:** Analisis kondisi market real-time
- **Input:** Fear & Greed Index, BTC Dominance, Whale Activity
- **Output:** Market sentiment score (0-100)
- **Penggunaan:** dynamic-threshold adjustment

### 2. Strategy Rotation System
- **File:** `strategy-rotation-system.js`
- **Fungsi:** Rotasi strategi berdasarkan WR performance
- **Logic:**
  - WR ≥ 61% → Strategy POSITIVE → Auto-sync ke Live Trader
  - WR < 61% → Strategy NEGATIVE → Test di Paper Trader
- **Threshold:** 61% (dari sebelumnya 70%)

### 3. Live to Paper Feedback Loop
- **File:** `live-to-paper-feedback.js`
- **Fungsi:** Transfer learning dari live trades ke paper trading
- **Data:** Winning patterns → BOK Intelligence
- **Analysis:** Loss patterns → Paper Trader improvement

### 4. BOK Intelligence Layer
- **File:** `bok-intelligence-layer.js`
- **Fungsi:** Strategi ranking dan proven tokens tracking
- **Database:** `proven-tokens.json`
- **Features:**
  - Track token per strategy
  - Win pattern detection
  - Signal network analysis

---

## 🔄 Adaptive System Orchestrator

Sistem utama yang mengkoordinasikan semua komponen:

### File: `adaptive-system-orchestrator.js`

```
┌─────────────────────────────────────────────────────────┐
│            ADAPTIVE SYSTEM ORCHESTRATOR                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ Market       │    │ Strategy     │                  │
│  │ Condition    │───▶│ Rotation     │                  │
│  │ Analyzer     │    │ System       │                  │
│  └──────────────┘    └──────┬───────┘                  │
│                             │                           │
│                             ▼                           │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ Live → Paper │    │ BOK          │                  │
│  │ Feedback     │───▶│ Intelligence │                  │
│  └──────────────┘    └──────────────┘                  │
│                             │                           │
│                             ▼                           │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ Live Trader  │◀───│ Paper Trader │                  │
│  │ (v4.2)       │    │ (v5)         │                  │
│  └──────────────┘    └──────────────┘                  │
│                             │                           │
│                             ▼                           │
│  ┌──────────────────────────────────┐                  │
│  │ Self-Healing Watchdog v3.0       │                  │
│  │ (auto-restart, duplicate killer) │                  │
│  └──────────────────────────────────┘                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Adaptive State: `adaptive-system-state.json`

```json
{
  "currentStrategy": "Fib 0.786 Deep",
  "strategyWR": 61.5,
  "marketCondition": "FEAR",
  "threshold": 6,
  "activePositions": 3,
  "dailyProfit": 0.15,
  "drawdown": 15.2
}
```

---

## 🛡️ Supporting Agents

| Agent | File | Fungsi | Jadwal |
|-------|------|--------|--------|
| **Balance Guardian** | balance-guardian.js | Monitor saldo, emergency stop kalau drop 25% | Tiap 5 menit |
| **SL Tracker** | sl-tracker.js | 3-strike blacklist system | Tiap 5 menit |
| **Evaluation System** | evaluate-performance.js | Evaluasi 2 jam, auto-pause kalau WR < 60% | Tiap 2 jam |
| **System Monitor** | system-monitor.js | Pantau duplikat, integritas sistem | Tiap 15 menit |
| **Self-Healing Watchdog** | self-healing-watchdog.js | Auto-restart crashed processes, kill duplicates | Continuously |
| **Target Tracker** | target-tracker.js | Monitor daily profit vs target | Tiap jam |
| **Paper Trader Monitor** | paper-trader-monitor.js | Monitor paper trader cycles | Tiap cycle |

---

## 📋 Alur Kerja Lengkap

### 1. Signal Generation (Strategy Intelligence)

```bash
Setiap 4 jam:
├── Fetch trending tokens dari DexScreener
├── Analisis: Volume, Momentum, Buy/Sell Ratio, Liquidity
├── Calculate confidence score (0-10)
├── Filter: Confidence >= 6.0, Liquidity >= $10k
└── Simpan ke database (strategy-intelligence.db)
```

### 2. Paper Trading Simulation

```bash
Setiap 10 menit:
├── Load signals dari Intelligence DB
├── Simulasi setiap signal dengan win probability
├── Simulasi 8 base strategies
├── Record hasil: Win/Loss, PnL, WR
└── Update BOK (Positive/Negative)
```

### 3. Strategy Validation (BOK)

| Kriteria | Hasil | File BOK |
|----------|-------|----------|
| WR >= 70%, 5+ trades | ✅ Positive | 16-positive-strategies.md |
| WR < 70% | ❌ Negative | 17-negative-strategies.md |
| 3x SL di token sama | 🚫 Toxic | 06-toxic-tokens.md |

### 4. Live Trading Execution

```bash
Realtime:
├── Sync best strategy dari BOK/Config
├── Candle analysis (5-step validation)
├── Check: Blacklist, Balance Protection, Daily Limit
├── Calculate dynamic TP/SL
├── Execute buy via Solana Tracker
└── Start exit monitor
```

---

## 🔧 Fitur Utama

### 🎯 Candle Analysis (5-Step)

1. **Price History (10 min window)**
2. **Find Recent High**
3. **Check >1% below high?** → Kalau tidak, SKIP (avoid top)
4. **Check red candle recently?** → Kalau ya, WAIT 2 min
5. **Check green candle forming?** → Kalau ya, ENTRY!

### 📊 Dynamic TP/SL Engine

| Kategori | SL | TP1 | TP2 | Max Hold |
|----------|-----|-----|-----|----------|
| FAST_TRADE | 1.5% | 3% | 5% | 5 min |
| SCALPING | 2% | 4% | 6% | 15 min |
| SNIPER | 3% | 8% | 15% | 30 min |
| SWING_TRADE | 5% | 12% | 25% | 120 min |

### 🛡️ Proteksi Sistem

| Proteksi | Threshold | Action |
|----------|-----------|--------|
| Balance Drop | 25% dalam 30 menit | Emergency Stop |
| Drawdown | 30% dari peak | Stop Trading |
| Daily Limit | 10 trades/hari | Pause |
| 3-Strike | 3x SL di token sama | Blacklist |
| FOMO | Pump >10% dalam 5 min | Skip |
| Falling Knife | Dump >5% dalam 5 min | Skip |

---

## 🚀 Cara Pakai

### Setup Awal

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/CLAW_PROFIT_HUNTER.git
cd CLAW_PROFIT_HUNTER

# 2. Install dependencies
npm install

# 3. Setup wallet
cp config/wallet.example.json config/wallet.json
# Edit wallet.json dengan private key (BS58 format)

# 4. Setup database
npm run init-db
```

### Start Sistem

```bash
# Start cron jobs (semua agents)
npm run start-crons

# Atau manual tiap agent:
# Paper Trader
pm2 start src/soul-core-paper-trader-v5.js --name paper-trader

# Intelligence (kalau mau jalan manual)
node src/strategy-intelligence-v2.js

# Live Trading (manual start)
pm2 start src/live-trader-v4.2.js --name live-trader
```

### Monitoring

```bash
# Status semua proses
pm2 status

# Log live trader
pm2 logs live-trader

# Log paper trader
pm2 logs paper-trader

# System report
node src/system-monitor.js
```

### Stop Sistem

```bash
# Stop live trader
pm2 stop live-trader

# Stop all
pm2 stop all

# Emergency stop (buat flag)
echo $(date +%s) > EMERGENCY_STOP
```

---

## 📁 Struktur File (v2.0)

```
CLAW_PROFIT_HUNTER/
├── src/                           # Source code
│   ├── live-trader-v4.2.js       # Live execution
│   ├── soul-core-paper-trader-v5.js  # Paper simulation
│   ├── strategy-intelligence-v2.js   # Signal generation
│   ├── dynamic-tpsl-engine.js      # TP/SL calculation
│   │
│   ├── INTELLIGENCE LAYER (v2.0)  # NEW
│   │   ├── adaptive-system-orchestrator.js   # Main coordinator
│   │   ├── market-condition-analyzer.js       # Market sentiment
│   │   ├── strategy-rotation-system.js        # Strategy rotation
│   │   ├── live-to-paper-feedback.js         # Feedback loop
│   │   └── bok-intelligence-layer.js         # BOK intelligence
│   │
│   ├── SUPPORTING AGENTS          # NEW & ORIGINAL
│   │   ├── balance-guardian.js         # Balance protection
│   │   ├── sl-tracker.js               # Blacklist system
│   │   ├── evaluate-performance.js      # Evaluation
│   │   ├── system-monitor.js           # Integrity monitor
│   │   ├── self-healing-watchdog.js    # Auto-healing (NEW)
│   │   ├── target-tracker.js           # Daily target (NEW)
│   │   └── paper-trader-monitor.js     # Paper monitor (NEW)
│   │
│   └── EXIT MONITORS              # Per-position
│       ├── exit-monitor-wif.js
│       ├── exit-monitor-$wif.js
│       ├── exit-monitor-bonk.js
│       └── exit-monitor-{TOKEN}.js
│
├── config/                        # Configuration
│   ├── adaptive-scoring-config.json
│   ├── adaptive-system-state.json  # NEW
│   ├── market-condition.json       # NEW
│   └── wallet.json (encrypted)
│
├── bok/                           # Book of Knowledge
│   ├── 00-PRIMARY-OBJECTIVE.md
│   ├── 06-toxic-tokens.md
│   ├── 06-lessons-learned.md
│   ├── 12-strategy-registry.md
│   ├── 13-indicators-library.md
│   ├── 14-external-intelligence.md
│   ├── 15-performance-evaluations.md
│   ├── 16-positive-strategies.md
│   ├── 17-negative-strategies.md
│   ├── proven-tokens.json         # NEW
│   └── 20-intelligence-analytics.md  # NEW
│
├── dashboard/                      # Web Dashboard
│   └── dashboard-server.js        # Port 8080
│
├── docs/                          # Dokumentasi
├── logs/                          # Logs (gitignored)
└── archive/                       # Backups (gitignored)
```

---

## ⚙️ Konfigurasi

### adaptive-scoring-config.json

```json
{
  "bestStrategy": {
    "id": "fib_618_1618",
    "name": "Fib 0.618 Golden",
    "category": "SNIPER",
    "winRate": 75.5,
    "params": {
      "slPercent": 3,
      "tp1Percent": 8,
      "tp2Percent": 15
    }
  },
  "positionSizing": {
    "WR_85+": 0.05,
    "WR_70+": 0.04,
    "WR_60+": 0.03
  }
}
```

### Environment Variables

```bash
# .env file
SOLANA_RPC_URL=https://mainnet.helius-rpc.com
HELIUS_API_KEY=your_api_key
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## 🔍 Troubleshooting

### Masalah Umum

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| Live Trader gak jalan | EMERGENCY_STOP aktif | `rm EMERGENCY_STOP` |
| Saldo drop cepat | Drawdown limit tercapai | Tunggu market stabilize |
| Duplikat cron | Multiple install | Jalankan `pkill` + bersihin crontab |
| Signal gak generate | API limit | Tunggu 4 jam cycle berikutnya |

### Emergency Commands

```bash
# Stop semua trading
pkill -f live-trader
pkill -f paper-trader
echo $(date +%s) > EMERGENCY_STOP
echo $(date +%s) > PAUSE_TRADING

# Reset sistem
rm -f EMERGENCY_STOP PAUSE_TRADING EVALUATION_MODE
pm2 restart all

# Check status
node src/system-monitor.js
```

---

## 📊 Performance Metrics

### Target Sistem

| Metric | Target | Keterangan |
|--------|--------|------------|
| Win Rate | >= 70% | Minimum untuk live trading |
| Daily Profit | 0.4 SOL | Target harian |
| Max Drawdown | 30% | Dari peak balance |
| Daily Trades | Max 10 | Limit proteksi |

### Evaluasi Berkala

```bash
# Setiap 2 jam otomatis
# Kalau WR < 60% atau Profit < 0.05 SOL:
#   → Trading PAUSED
#   → Review strategi
#   → Paper Trader cari strategi baru
```

---

## 🤝 Workflow Development

### 1. Sandbox Development

```bash
# Buat fitur baru di sandbox
cd sandbox/experiments
nano my-new-strategy.js

# Test di Paper Trader
npm run test:sandbox
```

### 2. Testing

```bash
# Simulasi 50x trades
npm run test:paper

# Cek hasil
# WR >= 70%? → Lanjut ke production
# WR < 70%? → Back to sandbox
```

### 3. Production Deploy

```bash
# Merge ke main
git add src/my-new-strategy.js
git commit -m "Add: New strategy XYZ"
git push origin main

# Auto-deploy via GitHub Actions
# Atau manual:
pm2 restart live-trader
```

---

## ⚠️ Disclaimer

**PENTING:**

- Sistem ini untuk **educational purposes**
- Trading cryptocurrency punya **risiko tinggi**
- Selalu **test di paper trading** dulu sebelum live
- Jangan invest lebih dari yang bisa kamu afford to lose
- Pastikan mengerti semua fitur sebelum live trading

**The creators are not responsible for any financial losses.**

---

## 📞 Support

- **Telegram:** @nathabot_vps_bot
- **GitHub Issues:** [CLAW_PROFIT_HUNTER/issues](https://github.com/YOUR_USERNAME/CLAW_PROFIT_HUNTER/issues)
- **Documentation:** Lihat folder `docs/`

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

**Last Updated:** 2026-02-19  
**Version:** 2.0.0  
**Status:** Production Ready ✅  
**Enhancements:** Intelligence Layer v2.0, Self-Healing, Strategy Rotation

---

## 💰 Trading Economics & Cost Tracking (2026-02-19)

Sistem tracking profitabilitas dan API costs.

### Files

| File | Deskripsi |
|------|-----------|
| `trading-economics.json` | Trading metrics (days alive, WR, profit) |
| `api-costs.json` | API usage tracking |

### Trading Economics Metrics

```json
{
  "started": "2026-02-10T00:00:00Z",
  "totalTrades": 0,
  "winningTrades": 0,
  "losingTrades": 0,
  "totalProfit": 0,
  "totalLoss": 0,
  "netProfit": 0,
  "bestTrade": 0,
  "worstTrade": 0,
  "totalCost": 0,
  "netProfitAfterCost": 0,
  "lastTradeTime": null,
  "daysAlive": 0,
  "survivalRate": "0"
}
```

### API Cost Tracking

| API | Est. Cost per Call |
|-----|-------------------|
| DexScreener | $0.00005 |
| Helius (RPC) | $0.00025 |
| SolanaTracker | $0.00010 |
| Groq | $0.0001 + $0.40/1M tokens |

### Module

**File:** `src/update-economics.js`

```javascript
// Usage
const { trade, scan, trackApiCall } = require('./update-economics.js');

// After each scan
scan();

// After each trade exit
trade(pnlPercent, isWin);  // e.g., trade(5.5, true)

// Track specific API
trackApiCall('groq', 5000);  // with 5000 tokens
```

---

**Last Updated:** 2026-02-19  
**Version:** 2.1.0  
**New Features:** Trading Economics, API Cost Tracking

---

## 🚨 Exit Monitor System (v5)

Sistem monitoring exit untuk setiap posisi:

### Features
- **Confirmation Window**: 2 checks (15s apart) - prevents false TP
- **Slippage Protection**: 
  - Stop Loss: 50% slippage
  - Take Profit: 35% slippage
- **Retry Logic**: 3x retry pada failure
- **Auto-notification**: Telegram alert setiap exit

### File
- `exit-monitor-atlas-all.js` - Multi-position ATLAS monitor
- `exit-monitor-bonk.js`, `exit-monitor-samo.js`, etc - Per-token monitors

### Error Handling
Error `0x1788` = Insufficient output - handled dengan higher slippage + retry

---

## 🎛️ Trading Mode Selector (v1.0)

Sistem dual-mode trading untuk kondisi market berbeda:

| Mode | Liquidity | Token Age | Max Hold | Risk |
|------|-----------|-----------|----------|------|
| **Established** | >$10k | >24h | 3 jam | LOW |
| **Degen** | >$5k | >6h | 10 menit | HIGH |

### Konfigurasi
```json
{
  "TRADING_MODE": {
    "VERSION": "1.0",
    "MODE": "auto",
    "ACTIVE": "established"
  }
}
```

### Rollback
```bash
sed -i 's/"MODE": "auto"/"MODE": "manual"/' trading-config.json
```
