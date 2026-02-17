# PAPER TRADER v5.0 - DYNAMIC STRATEGY ENGINE
**Complete Documentation**

---

## 🎯 OVERVIEW

Paper Trader v5 adalah sistem simulasi trading yang:
- Menguji 8 strategi dasar dengan variasi kategori
- Validasi entry berdasarkan candle & order book
- SL/TP dinamis berdasarkan kondisi market
- Auto-kategorikan strategi (Positive/Negative) di BOK
- Reset setelah 50 simulasi
- Estimasi profit berdasarkan saldo real

---

## 🔄 ALUR KERJA

```
1. FETCH MARKET DATA
   └─ Ambil 20 token trending dari DexScreener
   
2. VALIDASI ENTRY (CANDLE ANALYSIS)
   ├─ ❌ SKIP kalau pump >8% (FOMO)
   ├─ ❌ SKIP kalau dump >5% (falling knife)
   ├─ ✅ PULLBACK: Up 1h, down 5m (Score 9)
   ├─ ✅ CONSOLIDATION: Sideways + volume (Score 7)
   └─ ⚠️ ACCEPTABLE: Movement <2% (Score 6)

3. ANALISIS ORDER BOOK
   ├─ STRONG: Buy/Sell > 1.5 (tahan lebih lama)
   ├─ MODERATE: Buy/Sell 1.0-1.5
   └─ WEAK: Buy/Sell < 1.0 (tighten SL)

4. SIMULASI 8 STRATEGI
   ├─ Fast Trade: 2-5 min, SL 1.5%, TP 3%/5%
   ├─ Scalping: 5-15 min, SL 2%, TP 4%/6%
   ├─ Sniper: Perfect setup, SL 3%, TP 8%/15%
   └─ Swing: Hours hold, SL 5%, TP 12%/25%

5. HITUNG DYNAMIC SL/TP
   ├─ Base on volatility
   ├─ Adjust by order book strength
   └─ Adjust by candle momentum

6. RECORD RESULTS
   ├─ Win/Loss per strategi
   ├─ Total profit/loss
   └─ Win rate calculation

7. UPDATE BOK
   ├─ WR >=70% → 16-positive-strategies.md
   └─ WR <70% → 17-negative-strategies.md

8. SYNC KE LIVE TRADER
   └─ Best strategy + position sizing rules

9. ESTIMASI PROFIT
   └─ Bandingkan dengan target harian 0.4 SOL

10. CHECK RESET
    └─ Kalau 50 simulasi tercapai → Reset semua
```

---

## 📋 8 STRATEGI DASAR

| ID | Name | Entry | TP | Category |
|----|------|-------|-----|----------|
| fib_382_1618 | Fib 0.382 | 0.382 | 1.618 | SCALPING |
| fib_500_1272 | Fib 0.500 | 0.500 | 1.272 | SCALPING |
| fib_618_1618 | Fib 0.618 Golden | 0.618 | 1.618 | SNIPER |
| fib_786_1000 | Fib 0.786 Deep | 0.786 | 1.000 | SWING |
| fib_rsi_combo | Fib + RSI | 0.618 | 1.618 | SCALPING |
| fib_volume_combo | Fib + Volume | 0.618 | 1.618 | FAST_TRADE |
| smart_fib_combo | Smart Money + Fib | 0.618 | 1.618 | SNIPER |
| whale_volume_combo | Whale + Volume | - | - | SNIPER |

---

## 🎚️ DYNAMIC SL/TP CALCULATION

### Base (Volatility)
- **High (>30%)**: SL 5%, TP1 15%, TP2 30%
- **Medium (15-30%)**: SL 3%, TP1 8%, TP2 15%
- **Low (<15%)**: SL 2%, TP1 5%, TP2 10%

### Adjustment (Order Book)
- **Strong**: TP1/TP2 × 1.2 (hold longer)
- **Moderate**: No change
- **Weak**: SL × 0.8 (tighter stop)

### Adjustment (Momentum)
- **Strong**: SL × 1.1 (wider SL to avoid shakeout)
- **Neutral/Weak**: No change

---

## 📁 FILE OUTPUT

### State File
`paper-trader-v5-state.json`
```json
{
  "simulationCount": 25,
  "results": { ... },
  "lastReset": 1708201234567
}
```

### BOK Files
- `16-positive-strategies.md` - WR >=70%
- `17-negative-strategies.md` - WR <70%

### Config Sync
`adaptive-scoring-config.json`
```json
{
  "bestStrategy": { "id": "...", "winRate": "75.5" },
  "positionSizing": { "strategy_id": "0.05" }
}
```

---

## ⏰ CRON SCHEDULE

```bash
*/10 * * * * cd /root/trading-bot && node soul-core-paper-trader-v5.js
```

Jalan tiap 10 menit, tapi hanya increment simulasi kalau ada data baru.

---

## 🔄 RESET LOGIC

**Trigger:** simulationCount >= 50

**Action:**
1. Archive results ke `/root/trading-bot/archive/`
2. Reset simulationCount = 0
3. Reset results = {}
4. Mulai cycle baru

**Why Reset?**
- Hindari overfitting ke kondisi market lama
- Selalu adapt dengan market baru
- Fresh start setiap 50 simulasi

---

## 💰 PROFIT ESTIMATION

**Formula:**
```
Tradeable Balance = 0.1885 - 0.015 = 0.1735 SOL
Base Position Size = 0.1735 × 15% = 0.026 SOL

Daily Estimate:
- 5 trades dengan WR 70%
- 3.5 wins × avg profit
- 1.5 losses × avg loss
- Total = Estimated Daily Profit
```

**Target:** 0.4 SOL/day (230% dari balance)

---

## 🎯 KEUNTUNGAN v5

1. **No FOMO Entry** - Candle validation mencegah beli pucuk
2. **Dynamic SL/TP** - Sesuai kondisi market real-time
3. **BOK Integration** - Data tersimpan rapi di sistem knowledge
4. **Auto-Categorize** - Positive/Negative otomatis
5. **Reset Mechanism** - Selalu fresh, tidak overfitting
6. **Profit Estimation** - Realistic target based on actual balance

---

## 🚀 START

```bash
cd /root/trading-bot
node soul-core-paper-trader-v5.js
```

**Status:** Ready to run
