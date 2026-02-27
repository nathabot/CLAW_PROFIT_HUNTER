#!/bin/bash
# Watchdog for bitget-futures-v4
# Cron: */2 * * * * /root/trading-bot/watchdog-v4.sh >> /root/trading-bot/logs/watchdog-v4.log 2>&1

BOT_SCRIPT="/root/trading-bot/src/bitget-futures-v4.js"
LOG_FILE="/root/trading-bot/logs/bitget-futures-v4.log"
PID_CHECK=$(pgrep -f "bitget-futures-v4" | head -1)
TS=$(date '+%H:%M:%S')

if [ -z "$PID_CHECK" ]; then
  echo "[$TS] ⚠️  Bot not running — restarting..."
  cd /root/trading-bot
  nohup node "$BOT_SCRIPT" >> "$LOG_FILE" 2>&1 &
  sleep 3
  NEW_PID=$(pgrep -f "bitget-futures-v4" | head -1)
  if [ -n "$NEW_PID" ]; then
    echo "[$TS] ✅ Bot restarted (PID: $NEW_PID)"
  else
    echo "[$TS] ❌ Restart FAILED"
  fi
else
  echo "[$TS] ✅ Bot running (PID: $PID_CHECK)"
fi
