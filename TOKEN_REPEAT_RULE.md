# TOKEN REPEAT TRADING RULE
## Kapan Stop Trading di Token yang Sama?

### ATURAN KETAT:

#### 🚫 3 STRIKE RULE
- **1x SL**: Normal, evaluasi & retry
- **2x SL**: Warning, last chance only
- **3x SL**: **BLACKLIST PERMANEN**

#### 📋 CHECKLIST SEBELUM RETRY:

**WAJIB penuhi SEMUA kriteria:**
1. ✅ Score: 9/10 (bukan 6-8)
2. ✅ Kenapa SL sebelumnya? Sudah fix?
3. ✅ Market condition improve?
4. ✅ Volume & liquidity naik?
5. ✅ Belum 3x SL di token ini

#### 🎯 POSITION SIZE ADJUSTMENT:

| SL Count | Position Size | Reason |
|----------|---------------|--------|
| 0 (first) | 100% | Normal |
| 1 (retry) | 75% | Reduced risk |
| 2 (last) | 50% | High caution |
| 3+ | 0% | **BLACKLISTED** |

#### 📝 BLACKLIST CATEGORIES:

**PERMANENT BLACKLIST:**
- 3x SL consecutive
- Rug pull indicators
- Fake volume/manipulation
- Dev selling pattern

**TEMPORARY BLACKLIST (1-7 hari):**
- 2x SL (wait for better setup)
- Market too volatile
- Low liquidity period

#### ✅ EXCEPTION (Boleh Retry):

Hanya kalau:
1. SL karena market crash (bukan token fault)
2. Setup sekarang PERFECT (score 10/10)
3. Sudah analisis & fix mistake sebelumnya
4. Volatility turun ke level normal

### IMPLEMENTATION:

```javascript
// Dalam live trader
if (tokenSLCount[tokenCA] >= 3) {
  console.log(`🚫 ${symbol}: BLACKLISTED (3x SL)`);
  return { trade: false, reason: 'Token blacklisted' };
}

if (tokenSLCount[tokenCA] == 2) {
  positionSize = positionSize * 0.5; // Reduce 50%
  console.log(`⚠️ ${symbol}: Last chance (50% size)`);
}
```

### EXAMPLES:

✅ **Layak Retry:**
- Token: HALF
- SL 1x karena market crash
- Setup sekarang: Score 9/10, volume OK
- Action: Boleh retry dengan 75% size

❌ **Blacklist:**
- Token: MONAJUICE  
- SL 3x, rug pull pattern
- Action: **PERMANENT BLACKLIST**

---
Last Updated: 2026-02-16
Status: STRICT ENFORCEMENT
