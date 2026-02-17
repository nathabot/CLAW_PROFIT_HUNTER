# PRANA KNOWLEDGE BASE
## Complete Knowledge Transfer from Natha to Prana
### Version: 2026.02.16 | Status: ACTIVE

---

## 🎯 CORE IDENTITY

**Name:** Prana  
**Role:** AI Trading Bot Engineer & System Architect  
**Primary:** Solana Trading Systems, Web3 Infrastructure, Network Operations  
**Secondary:** Full-stack Development, DevOps, System Security  

**Mission:** Maintain, optimize, and evolve autonomous trading systems with zero human intervention for routine operations.

---

## 📚 KNOWLEDGE DOMAINS

### 1. SOLANA TRADING SYSTEMS (Master Level)

#### A. Swap Protocols & Execution
- **Jupiter Aggregator v6**: Primary routing engine
  - API endpoint: `https://quote-api.jup.ag/v6`
  - Quote → Swap → Execute flow
  - Slippage management (default 10-50 bps)
  - Dynamic compute budget for priority fees
  
- **Raydium AMM**: Direct pool integration
  - AMM v4 pools
  - Concentrated liquidity (Orca-style)
  - Farm/staking integration

- **Orca Whirlpools**: CLMM (Concentrated Liquidity Market Maker)
  - Tick-based pricing
  - Position management
  - Fee tier optimization

- **Pump.fun**: Memecoin launchpad
  - Bonding curve mechanics
  - Graduation criteria ($69k market cap)
  - Migration to Raydium

#### B. Token Analysis & Filtering
```javascript
// STRICT FILTER CRITERIA
const TOKEN_CRITERIA = {
  MIN_LIQUIDITY: 50000,        // $50k
  MIN_VOLUME_24H: 100000,      // $100k
  MAX_TOKEN_AGE_HOURS: 168,    // 7 days max
  MIN_BUY_PRESSURE: 55,        // 55% buys
  MAX_TOP10_HOLDERS: 50,       // <50% supply
  MIN_HOLDERS: 50,
  AVOID_PATTERNS: [
    'honeypot',
    'mint_authority_enabled',
    'freeze_authority_enabled',
    'lp_not_burned',
    'single_wallet_dominant'
  ]
};
```

#### C. Data Sources & APIs
1. **DexScreener**: Real-time price, volume, liquidity
   - API: `https://api.dexscreener.com/latest/dex/tokens/{ca}`
   - Rate limit: 300 req/min
   - Response: pairs[0] for best liquidity

2. **SolanaTracker**: Transaction execution
   - RPC: `https://rpc-mainnet.solanatracker.io`
   - Quote API: `/v1/quote`
   - Execute API: `/v1/execute`

3. **Birdeye**: Token metadata, price history
   - API: `https://public-api.birdeye.so`
   - Price endpoint: `/public/price?address={ca}`

4. **Jupiter**: Swap routing
   - Quote: `/v6/quote`
   - Swap: `/v6/swap`
   - Price: `/v6/price`

#### D. Wallet & Key Management
```javascript
// Wallet structure
const WALLET = {
  // NEVER expose privateKey in logs
  privateKey: bs58.encode(keypair.secretKey),
  publicKey: keypair.publicKey.toString(),
  
  // Use for all signing
  signer: keypair
};

// Security rules:
// 1. NEVER log privateKey
// 2. NEVER commit wallet.json to git
// 3. ALWAYS use environment variables for sensitive data
// 4. ALWAYS backup encrypted, never plaintext
```

---

### 2. TRADING STRATEGIES & RISK MANAGEMENT

#### A. Entry Strategies

**1. Candle-Aware Entry (v2.1+)**
```javascript
const ENTRY_LOGIC = {
  // Wait for pullback from recent high
  MIN_PULLBACK_PERCENT: 0.5,    // 0.5% off high
  MAX_ENTRY_FROM_HIGH: 1.0,     // Max 1% from high
  
  // Candle confirmation
  MIN_GREEN_CANDLE: 0.3,        // +0.3% current candle
  WAIT_AFTER_RED: 2,            // 2 min after red candle
  
  // Buy pressure
  MIN_BUY_PRESSURE: 55,         // 55% buy transactions
  
  // Trend filter
  AVOID_DOWNTREND: true,        // Skip if -2% in 5min
};
```

**2. 3-Strike Blacklist Rule**
```javascript
const BLACKLIST_SYSTEM = {
  // Track SL per token
  recordSL: (ca, symbol) => {
    const count = getSLCount(ca) + 1;
    saveSLCount(ca, symbol, count);
    
    if (count >= 3) {
      addToBlacklist(ca, symbol);
      notify(`🚫 ${symbol} BLACKLISTED - 3x SL`);
    }
    return count;
  },
  
  // Check before EVERY trade
  checkBlacklist: (ca) => {
    const blacklist = loadBlacklist();
    const slCount = getSLCount(ca);
    
    if (blacklist.includes(ca)) return false; // BLOCKED
    if (slCount >= 3) {
      addToBlacklist(ca);
      return false;
    }
    return true; // OK to trade
  },
  
  // Reset after 24h
  COOLDOWN_HOURS: 24
};
```

**3. Position Sizing & Exit**
```javascript
const RISK_PARAMS = {
  // Conservative sizing
  POSITION_SIZE: 0.01,          // 0.01 SOL per trade
  MAX_POSITIONS: 1,             // 1 at a time (strict)
  MAX_DAILY_TRADES: 5,          // Max 5/day
  
  // Exit targets
  SL_PERCENT: -1.5,             // Tight -1.5%
  TP1_PERCENT: 2,               // +2% partial
  TP2_PERCENT: 4,               // +4% full
  MAX_HOLD_MINUTES: 15,         // 15 min max
  
  // Daily limits
  MAX_DAILY_LOSS: 0.03,         // Stop if -0.03 SOL/day
  MAX_DRAWDOWN_PERCENT: 20      // Stop if -20% from peak
};
```

#### B. Established Token Only Strategy
```javascript
const ESTABLISHED_TOKENS = [
  { ca: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', age: '6+ months' },
  { ca: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', age: '6+ months' },
  { ca: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'POPCAT', age: '6+ months' },
  { ca: '6D7NaB2xsLd7cauWu1wKk6oQsWxcHw3fGmV1UNtnqQvt', symbol: 'MYRO', age: '6+ months' },
  { ca: '5rc4nZ2f7bvgqqRjhcYmWWtM9qG1KuvggW7qBqBC9EJK', symbol: 'GIGA', age: '6+ months' }
];

// STRICT: Only trade these 5
// NO new coins, NO memecoins <30 days
```

---

### 3. SYSTEM ARCHITECTURE & INFRASTRUCTURE

#### A. VPS Infrastructure
```yaml
VPS_NATHA:
  ip: 72.61.214.89
  role: PRIMARY - All trading systems
  location: /root/trading-bot/
  
  components:
    - smart-scalper-v21.js    # Main trading bot
    - exit-monitor-v7.js      # Position monitoring
    - watchdog-agent.js       # System health
    - wallet.json             # Trading wallet
    - blacklist.json          # Blocked tokens
    - token-sl-count.json     # SL tracking

VPS_PRANA:
  ip: 72.61.124.167
  role: ARCHIVE/BACKUP ONLY
  status: STOPPED
  note: All systems migrated to VPS_NATHA
```

#### B. Process Management
```bash
# Check running processes
ps aux | grep node | grep -v grep

# Kill specific bot
pkill -9 -f 'smart-scalper'

# Kill all node processes
killall -9 node

# Monitor logs
tail -f /root/trading-bot/smart-scalp.log
```

#### C. Cron Management
```bash
# List all cron jobs
crontab -l

# Edit cron
crontab -e

# Remove all cron
crontab -r

# Safe cron (monitoring only)
*/5 * * * * /root/trading-bot/trading-watchdog.sh
0 2 * * * /root/trading-bot/github-auto-push.sh
```

#### D. File Organization
```
/root/trading-bot/
├── active/              # Currently active bots
├── deprecated/          # Old versions (archived)
├── logs/                # All log files
├── data/                # JSON data files
├── config/              # Configuration files
├── prana-import/        # Migrated from VPS Prana
├── wallet.json          # Trading wallet
├── blacklist.json       # Token blacklist
├── token-sl-count.json  # SL counter
└── MIGRATION_*.md       # Migration docs
```

---

### 4. DEBUGGING & TROUBLESHOOTING

#### A. Common Issues & Solutions

**1. SSH Connection Failed**
```bash
# Check if VPS is up
ping 72.61.124.167

# Check SSH service
ssh root@72.61.124.167 "systemctl status sshd"

# Alternative: reboot via provider panel
```

**2. Bot Process Zombie**
```bash
# Find zombie processes
ps aux | grep node | grep -v grep

# Kill by pattern
pkill -9 -f 'paper-trader'

# Verify killed
ps aux | grep node | wc -l
```

**3. Cron Not Working**
```bash
# Check cron service
systemctl status cron

# Check crontab syntax
crontab -l | crontab -

# Test script manually
cd /root/trading-bot && node bot.js
```

**4. Swap Failed**
```javascript
// Check common causes:
// 1. Insufficient balance
// 2. Token has no liquidity
// 3. Slippage too low
// 4. Compute budget insufficient

// Debug log:
console.log('Quote:', quote);
console.log('Swap:', swapResult);
console.log('Error:', error.message);
```

#### B. Performance Monitoring
```bash
# CPU/Memory usage
top -p $(pgrep -d',' node)

# Disk usage
df -h
du -sh /root/trading-bot/

# Network connections
netstat -tulpn | grep node
```

---

### 5. NETWORKING & SECURITY

#### A. SSH Security
```bash
# Disable password auth (use key only)
# Edit /etc/ssh/sshd_config:
PasswordAuthentication no
PubkeyAuthentication yes

# Change default port
Port 2222

# Restart SSH
systemctl restart sshd
```

#### B. Firewall (UFW)
```bash
# Enable firewall
ufw enable

# Allow SSH
ufw allow 22/tcp

# Allow OpenClaw gateway
ufw allow 18789/tcp

# Check status
ufw status
```

#### C. API Key Security
```javascript
// NEVER hardcode keys
const API_KEYS = {
  // Use environment variables
  SOLANA_TRACKER: process.env.SOLANA_TRACKER_API_KEY,
  BIRDEYE: process.env.BIRDEYE_API_KEY,
  
  // Or load from secure config
  ...require('./config/secure-keys.json')
};

// In .bashrc or systemd service:
// export SOLANA_TRACKER_API_KEY="..."
```

---

### 6. CODING STANDARDS & BEST PRACTICES

#### A. JavaScript/Node.js Patterns
```javascript
// Async/await over callbacks
const data = await fetchData();

// Error handling
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('Operation failed:', error.message);
  await notify(`Error: ${error.message}`);
}

// Logging
console.log(`[${new Date().toISOString()}] Action: ${result}`);

// State persistence
fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
```

#### B. Solana Web3.js Patterns
```javascript
// Connection singleton
const connection = new Connection(RPC_URL, 'confirmed');

// Transaction lifecycle
const transaction = new Transaction();
transaction.add(instruction);
transaction.feePayer = wallet.publicKey;
transaction.recentBlockhash = blockhash;

// Sign and send
transaction.sign(wallet);
const signature = await connection.sendRawTransaction(
  transaction.serialize()
);

// Confirm
await connection.confirmTransaction(signature, 'confirmed');
```

#### C. Testing Strategy
```javascript
// Unit tests for pure functions
function testCalculatePositionSize() {
  assert(calculatePositionSize(0.1, 0.01) === 0.01);
}

// Integration tests (testnet)
async function testSwapExecution() {
  const result = await executeSwap(TEST_TOKEN, 0.001);
  assert(result.success === true);
}
```

---

### 7. CLAWHUB SKILLS REFERENCE

#### Available Skills (Relevant):
```yaml
solana-dev:
  path: /root/.openclaw/skills/solana-dev/
  use: Solana development, transactions, programs

healthcheck:
  path: /usr/lib/node_modules/openclaw/skills/healthcheck/
  use: System hardening, security audits

skill-creator:
  path: /usr/lib/node_modules/openclaw/skills/skill-creator/
  use: Create new agent skills

tmux:
  path: /usr/lib/node_modules/openclaw/skills/tmux/
  use: Remote session management
```

#### How to Use Skills:
```bash
# Search skills
clawhub search "solana trading"

# Install skill
clawhub install solana-dev

# Update skill
clawhub update solana-dev

# List installed
clawhub list
```

---

### 8. TELEGRAM INTEGRATION

#### Bot API Usage
```javascript
// Send message
async function notify(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_thread_id: TOPIC_ID,
      text,
      parse_mode: 'Markdown'
    })
  });
}

// Formatting
// Bold: *text*
// Italic: _text_
// Code: `text`
```

---

### 9. MONITORING & ALERTING

#### Health Checks
```javascript
// System health
async function healthCheck() {
  const checks = {
    balance: await getBalance(),
    positions: countOpenPositions(),
    diskSpace: checkDiskSpace(),
    lastTrade: getLastTradeTime()
  };
  
  if (checks.balance < MIN_BALANCE) {
    await notify('🚨 Balance critical!');
  }
}
```

#### Performance Metrics
```javascript
// Track WR, profit, drawdown
const METRICS = {
  totalTrades: 0,
  wins: 0,
  losses: 0,
  winRate: () => (wins / totalTrades * 100).toFixed(2),
  totalPnL: 0,
  maxDrawdown: 0,
  peakBalance: 0
};
```

---

### 10. DISASTER RECOVERY

#### Backup Strategy
```bash
# Daily backup
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf /backup/trading-bot-$DATE.tar.gz /root/trading-bot/
# Upload to cloud storage
```

#### Recovery Steps
```bash
# 1. Restore from backup
tar -xzf trading-bot-20260216.tar.gz -C /

# 2. Verify wallet
node -e "console.log(require('./wallet.json').publicKey)"

# 3. Test connection
node test-connection.js

# 4. Start bot
node smart-scalper-v21.js
```

---

## 🎓 CONTINUOUS LEARNING

### Resources to Monitor:
1. **Jupiter Discord**: Protocol updates
2. **Solana Tech Twitter**: Network upgrades
3. **DexScreener API Docs**: New endpoints
4. **Birdeye Changelog**: New features

### Monthly Tasks:
- [ ] Review win rate & strategy performance
- [ ] Update dependencies (`npm update`)
- [ ] Rotate API keys
- [ ] Review and update blacklist
- [ ] Backup wallet and config

---

## 🚨 EMERGENCY PROCEDURES

### Code Red (Major Loss Detected)
```bash
# 1. STOP ALL TRADING IMMEDIATELY
killall -9 node

# 2. Assess damage
tail -100 /root/trading-bot/smart-scalp.log

# 3. Notify
echo "🚨 EMERGENCY STOP - MAJOR LOSS" | telegram-notify

# 4. Preserve state
cp /root/trading-bot/*.json /backup/emergency-$(date +%Y%m%d-%H%M%S)/

# 5. Do NOT restart until root cause analyzed
```

### When to Escalate to Human:
- Drawdown >30%
- Bot behaving unexpectedly
- Unknown error patterns
- Suspicious transactions

---

**Document Version:** 2026.02.16  
**Maintained by:** Prana (AI Trading Bot)  
**Last Updated:** 2026-02-16 21:50 WIB

**STATUS: ✅ KNOWLEDGE BASE ACTIVE**
