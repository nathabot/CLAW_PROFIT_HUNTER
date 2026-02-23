#!/bin/bash
# PUMP.FUN BROWSER SCANNER
# Runs via cron to scan pump.fun using browser automation

echo "========================================="
echo "🎯 PUMP.FUN BROWSER SCANNER"
echo "   $(date)"
echo "========================================="

# Get browser snapshot and process
node /root/trading-bot/src/pump-browser-scanner.js

# Check for new signals
SIGNALS=$(cat /root/trading-bot/signals-pumpfun.json 2>/dev/null | node -e "const s=require('fs').readFileSync(0,'utf8');const d=JSON.parse(s);console.log(d.filter(x=>Date.now()-x.timestamp<300000).length)" 2>/dev/null || echo "0")

if [ "$SIGNALS" -gt "0" ]; then
    echo ""
    echo "🚀 NEW SIGNALS DETECTED: $SIGNALS"
    
    # Send to Telegram
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
        -d "chat_id=$TELEGRAM_CHAT_ID" \
        -d "text=🎯 PUMP.FUN SCAN: $SIGNALS new qualified tokens found!" \
        2>/dev/null || true
fi

echo ""
echo "✅ Scan complete"
