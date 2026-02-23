#!/bin/bash
# PUMP.FUN EARLY DETECTION MONITOR
# Refresh every 2 minutes, find NEW tokens before they pump

echo "🎯 EARLY DETECTION MONITOR STARTED"
echo "   $(date)"
echo "   Interval: 2 minutes"
echo ""

# Keep track of last known tokens
TOKEN_FILE="/root/trading-bot/pump-tokens-current.json"
ALERT_FILE="/root/trading-bot/pump-alerts.json"

# Function to check for new tokens
check_new_tokens() {
    # This will be called by cron every 2 minutes
    # For now, just do a quick refresh
    
    cd /root/trading-bot
    node src/pump-early-detector.js
}

# Run check
check_new_tokens

echo ""
echo "✅ Check complete - $(date)"
