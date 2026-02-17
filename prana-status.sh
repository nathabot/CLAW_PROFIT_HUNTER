#!/bin/bash
# PRANA SYSTEM STATUS CHECKER
# Run this to check overall system health

echo "═══════════════════════════════════════════════════════════"
echo "   🤖 PRANA SYSTEM STATUS CHECK"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check Node processes
echo "📊 Node Processes:"
ps aux | grep node | grep -v grep | wc -l | xargs echo "   Running:"
ps aux | grep node | grep -v grep | awk '{print "   - " $11 " (PID: " $2 ")"}'
echo ""

# Check cron
echo "⏰ Cron Jobs:"
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | wc -l | xargs echo "   Active:"
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | head -5 | sed 's/^/   /'
echo ""

# Check disk space
echo "💾 Disk Usage:"
df -h / | tail -1 | awk '{print "   Used: " $3 "/" $2 " (" $5 ")"}'
echo ""

# Check memory
echo "🧠 Memory:"
free -h | grep Mem | awk '{print "   Used: " $3 "/" $2}'
echo ""

# Check balance
echo "💰 Wallet Balance:"
node -e "
const {Connection, PublicKey} = require('@solana/web3.js');
const c = new Connection('https://rpc-mainnet.solanatracker.io/?api_key=56584027-12fe-47f3-9ba2-6ef1620ed84b');
c.getBalance(new PublicKey('EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX')).then(b => {
  console.log('   ' + (b/1e9).toFixed(4) + ' SOL');
}).catch(() => console.log('   Error checking'));
" 2>/dev/null || echo "   Check manually"
echo ""

# Check recent logs
echo "📝 Recent Activity:"
ls -lt /root/trading-bot/*.log 2>/dev/null | head -3 | awk '{print "   " $9 " (" $5 " bytes)"}'
echo ""

# Check blacklist
echo "🚫 Blacklist Status:"
cat /root/trading-bot/blacklist.json 2>/dev/null | jq '. | length' 2>/dev/null || echo "0"
echo "   tokens blacklisted"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "   Status: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"
