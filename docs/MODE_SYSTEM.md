# Trading Mode System Documentation

## Overview

The trading system uses **two complementary mode systems**:

1. **TRADING_MODE** - WHAT to trade (token selection strategy)
2. **MODE_CONTROLLER** - HOW to trade (risk parameters)

---

## 1. TRADING_MODE

**Purpose:** Select which type of tokens to trade

### Modes

| Mode | Description | Token Age | Max Hold | Liquidity |
|------|-------------|-----------|----------|-----------|
| `established` | Mature tokens, lower risk | 24h+ | 180 min | $10k+ |
| `degen` | New tokens, higher risk/pump | 1h+ | 10 min | $10k+ |

### Configuration

```json
{
  "TRADING_MODE": {
    "VERSION": "1.0",
    "MODE": "auto",
    "ACTIVE": "established",
    "DEGEN_ENABLED": false,
    "AUTO_TYPE": "performance",
    "TIME_INTERVAL_HOURS": 6,
    "AUTO_CONFIG": {
      "PERFORMANCE_THRESHOLD": 10,
      "MIN_SAMPLE_SIZE": 10
    }
  }
}
```

### AUTO Switching Types

- **`performance`**: Switch based on win rate (if degen WR > established WR + threshold, switch to degen)
- **`time`**: Switch every X hours (configurable via `TIME_INTERVAL_HOURS`)

### Manual Override

```bash
# Switch to established
sed -i 's/"ACTIVE": "degen"/"ACTIVE": "established"/' trading-config.json

# Switch to degen
sed -i 's/"ACTIVE": "established"/"ACTIVE": "degen"/' trading-config.json
```

---

## 2. MODE_CONTROLLER

**Purpose:** Control risk appetite and trading parameters

### Modes

| Mode | minScore | Liquidity | Position | Max Positions | minWR |
|------|----------|-----------|----------|---------------|-------|
| `conservative` | 7 | $50k | 0.01 SOL | 2 | 55% |
| `balanced` | 6 | $25k | 0.015 SOL | 3 | 50% |
| `aggressive` | 5 | $10k | 0.02 SOL | 4 | 45% |

### Configuration

```json
{
  "MODE_CONTROLLER": {
    "mode": "balanced",
    "modes": {
      "conservative": {
        "minScore": 7,
        "minLiquidity": 50000,
        "maxPosition": 0.01,
        "maxPositions": 2,
        "minWR": 55
      },
      "balanced": {
        "minScore": 6,
        "minLiquidity": 25000,
        "maxPosition": 0.015,
        "maxPositions": 3,
        "minWR": 50
      },
      "aggressive": {
        "minScore": 5,
        "minLiquidity": 10000,
        "maxPosition": 0.02,
        "maxPositions": 4,
        "minWR": 45
      }
    }
  }
}
```

### Switching Modes

```bash
# Switch to conservative
sed -i 's/"mode": "balanced"/"mode": "conservative"/' trading-config.json

# Switch to aggressive
sed -i 's/"mode": "balanced"/"mode": "aggressive"/' trading-config.json
```

---

## Mode Combinations

Both systems work together:

| TRADING_MODE | MODE_CONTROLLER | Risk Level | Best For |
|--------------|-----------------|------------|----------|
| established | conservative | 🔒 Low | Survival, slow & steady |
| established | balanced | 🟡 Medium | Normal operations |
| degen | balanced | 🟠 Medium-High | Quick gains |
| degen | aggressive | 🔥 High | Maximum gains |

---

## Files

| File | Purpose |
|------|---------|
| `trading-config.json` | Main configuration |
| `src/threshold-config.js` | Read mode settings |
| `src/reconciliation.js` | 15-min position check |

---

## Monitoring

### Check Current Modes
```bash
# Check TRADING_MODE
cat trading-config.json | jq '.TRADING_MODE'

# Check MODE_CONTROLLER
cat trading-config.json | jq '.MODE_CONTROLLER'
```

### Reconciliation Logs
```bash
# View reconciliation logs
cat reconcile-logs/2026-02-21.json
```

---

## Reconciliation (Auto-running)

Runs every 15 minutes via cron:

- Checks all active positions
- Verifies SL/TP triggers
- Checks max hold timeout (3 hours)
- Alerts at 5% deviation
- Force closes at 20% deviation or -15% loss
