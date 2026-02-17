# 🚀 Quick Start Guide - Smart Money Tracker

## ⚡ Installation (Already Done)

```bash
cd /root/trading-bot
npm install axios
```

## ✅ Verification

Run the test suite to verify everything works:

```bash
cd /root/trading-bot/agents
node test-smart-money.js
```

You should see: `📊 Results: 15 passed, 0 failed`

## 🎯 Usage Examples

### 1. Start Full Tracking System

```bash
cd /root/trading-bot/agents
node smart-money-integration.js start
```

This will:
- Start tracking smart money wallets
- Monitor large transactions (>1000 SOL)
- Detect accumulation/distribution patterns
- Run continuous analysis every 5 minutes
- Generate alerts for significant events

Press `Ctrl+C` to stop and see final report.

### 2. Analyze a Specific Token

```bash
node smart-money-integration.js analyze EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Replace with any Solana token address to get:
- Sentiment analysis (multi-source)
- Confidence score
- Risk assessment
- Smart money holder analysis
- Buy/Sell recommendation

### 3. Generate Market Report

```bash
node smart-money-integration.js report
```

Shows:
- Total wallets tracked
- Smart money & whale counts
- Top tokens by smart money interest
- Recent large transactions
- Active alerts

### 4. Find Top Opportunities

```bash
node smart-money-integration.js opportunities 5
```

Analyzes all tracked tokens and returns top 5 by:
- High confidence (>60)
- Low risk (<60)
- Positive sentiment
- Smart money interest

### 5. Get Market Overview

```bash
node smart-money-integration.js overview
```

Returns JSON with:
- Token statistics
- Smart money statistics
- Recent alerts
- Active patterns

### 6. Export All Data

```bash
node smart-money-integration.js export /tmp/smart-money-export.json
```

Exports complete database for backup or analysis.

## 📊 Example Output

### Token Analysis

```
═══════════════════════════════════════════════
📊 ANALYSIS SUMMARY: EPjFWdd5AufqS...
═══════════════════════════════════════════════

💭 SENTIMENT:
   Score: +65/100
   Confidence: 78%
   Sources: 4

🎯 CONFIDENCE:
   Score: 82/100
   Smart Money: 85
   Holder Quality: 78
   Accumulation: 90

⚖️ RISK:
   Level: Low Risk
   Score: 35/100
   Holder Concentration: 40
   Liquidity: 25

🎬 RECOMMENDATION:
   Action: STRONG BUY
   Score: 85/100
   Reason: High confidence, Positive sentiment, Acceptable risk

═══════════════════════════════════════════════
```

### Market Report

```
═══════════════════════════════════════════════
📊 SMART MONEY TRACKER - REPORT
═══════════════════════════════════════════════
Generated: 2026-02-13T13:03:45.123Z

📈 SUMMARY:
   Total Wallets: 47
   Smart Money: 8
   Whales: 12
   Tracked Tokens: 4
   Total Transactions: 342
   Active Alerts (24h): 5

🔥 TOP TOKENS (by smart money interest):
   1. EPjFWdd5Auf... (interest: 8.5, holders: 50)
   2. DezXAZ8z7Pn... (interest: 6.0, holders: 35)
   3. EKpQGSJtjMF... (interest: 4.5, holders: 28)

⚡ RECENT LARGE TRANSACTIONS (>1000 SOL):
   wallet_abc buy 5000.00 SOL of token_xyz at 2026-02-13T13:02:15Z

🚨 RECENT ALERTS:
   [high] 🐋 Smart Money entering token_abc... with 5000 SOL
   [medium] 📈 Whale accumulating token_xyz... (7 buys, 15000 SOL)

═══════════════════════════════════════════════
```

## 🔧 Configuration

### Add More Tokens to Track

Edit `/root/trading-bot/agents/smart-money-tracker.js`:

```javascript
trackTokens: [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC
  'So11111111111111111111111111111111111111112',   // SOL
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  // BONK
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  // WIF
  // Add more here
],
```

### Adjust Detection Thresholds

```javascript
const CONFIG = {
  minTransactionSOL: 1000,        // Minimum to track (default: 1000)
  accumulationThreshold: 5,       // Buys to trigger alert (default: 5)
  distributionThreshold: 5,       // Sells to trigger alert (default: 5)
  clusteringThreshold: 0.85,      // Wallet similarity (default: 0.85)
};
```

### Enable Webhook Alerts

Set environment variable:

```bash
export ALERT_WEBHOOK="https://your-webhook-url.com/alerts"
node smart-money-integration.js start
```

## 🔍 Database Locations

- **Smart Money DB**: `/root/trading-bot/database/smart-money.db.json`
  - Wallets, transactions, tokens, clusters, alerts

- **Patterns DB**: `/root/trading-bot/database/patterns.db.json`
  - Patterns, entities, sentiment, confidence, risk assessments

### View Database

```bash
# View recent alerts
cat /root/trading-bot/database/smart-money.db.json | jq '.alerts[0:5]'

# View smart money wallets
cat /root/trading-bot/database/smart-money.db.json | jq '.wallets | to_entries | map(select(.value.classification == "smart_money"))'

# View tracked tokens
cat /root/trading-bot/database/smart-money.db.json | jq '.tokens | keys'

# View recent patterns
cat /root/trading-bot/database/patterns.db.json | jq '.patterns[0:5]'
```

## 🚨 Alert Types

### 1. New Smart Money Entry
High-confidence wallets entering a token for the first time.
```
🐋 SMART_MONEY entering token_abc... with 5000 SOL
```

### 2. Whale Accumulation
Large wallets making multiple buy transactions.
```
📈 Whale accumulating token_xyz... (7 buys, 15000 SOL)
```

### 3. Unusual Volume + Smart Money
Significant volume spike with smart money participation.
```
🚨 UNUSUAL VOLUME on token_abc... (5.2x avg) with 45.0% smart money!
```

## 🔄 Running Continuously

### Option 1: Screen Session
```bash
screen -S smart-money
cd /root/trading-bot/agents
node smart-money-integration.js start
# Press Ctrl+A then D to detach
# screen -r smart-money to reattach
```

### Option 2: PM2 (Recommended)
```bash
pm2 start smart-money-integration.js --name "smart-money" --cwd /root/trading-bot/agents
pm2 logs smart-money
pm2 stop smart-money
```

### Option 3: Systemd Service
Create `/etc/systemd/system/smart-money.service`:

```ini
[Unit]
Description=Smart Money Tracker
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/trading-bot/agents
ExecStart=/usr/bin/node smart-money-integration.js start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
systemctl daemon-reload
systemctl enable smart-money
systemctl start smart-money
systemctl status smart-money
```

## 📈 Use in Your Trading Bot

### Import Module

```javascript
const { SmartMoneyIntegration } = require('./agents/smart-money-integration.js');

const tracker = new SmartMoneyIntegration();

// Analyze token before trading
async function shouldTrade(tokenAddress) {
  const analysis = await tracker.analyzeSingleToken(tokenAddress);
  
  if (analysis.analysis.recommendation.action === 'STRONG BUY' &&
      analysis.analysis.risk.riskScore < 50) {
    return true;
  }
  
  return false;
}

// Get market overview
const overview = await tracker.getMarketOverview();
console.log(`Tracking ${overview.tokens.tracked} tokens`);
console.log(`${overview.smartMoney.smartMoneyCount} smart money wallets`);

// Find opportunities
const opportunities = await tracker.getTopOpportunities(5);
for (const opp of opportunities) {
  console.log(`${opp.token}: ${opp.action} (score: ${opp.score})`);
}
```

### Check Alerts

```javascript
const { SmartMoneyTracker } = require('./agents/smart-money-tracker.js');

const tracker = new SmartMoneyTracker();
const alerts = tracker.getRecentAlerts(10);

for (const alert of alerts) {
  if (alert.severity === 'high' || alert.severity === 'critical') {
    console.log(`🚨 ${alert.message}`);
    // Take action
  }
}
```

## 🎯 Next Steps

1. **Start tracking**: `node smart-money-integration.js start`
2. **Let it run for 1-2 hours** to collect data
3. **Generate report**: Press Ctrl+C or run `node smart-money-integration.js report`
4. **Find opportunities**: `node smart-money-integration.js opportunities 10`
5. **Integrate with your bot** using the module examples above

## 📚 Documentation

- **Full README**: `/root/trading-bot/agents/README.md`
- **Test Suite**: `node test-smart-money.js`
- **Architecture**: See README.md

## 🐛 Troubleshooting

### No data collected
- Check Solscan API is accessible: `curl https://public-api.solscan.io`
- Verify token addresses are valid Solana addresses
- Wait 5-10 minutes for initial scan

### Low confidence scores
- Normal for first run (no historical data)
- Scores improve as data accumulates
- Takes 24-48h for accurate patterns

### High memory usage
- Reduce `trackTokens` list
- Lower transaction history limits in config
- Restart tracker periodically

## 💡 Tips

1. **Start with major tokens** (SOL, USDC, BONK) to see immediate activity
2. **Run for at least 24h** before making trading decisions
3. **Combine with other indicators** - this is one tool, not the only tool
4. **Monitor alerts** - they're the most actionable signals
5. **Review weekly** - some patterns take days to emerge

---

**Need help?** Check README.md or review test-smart-money.js for examples.
