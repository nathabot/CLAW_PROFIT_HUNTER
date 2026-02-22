#!/bin/bash
export HELIUS_API_KEY="c9926a7b-57ba-47e3-8de4-5fb46fa4b9ee"
LOCKFILE="/root/trading-bot/live-trader.lock"
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Live trader already running (PID: $PID)"
    exit 0
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
cd /root/trading-bot
node src/live-trader-v4.2.js >> /root/trading-bot/logs/live-trader-v4.2.log 2>&1
rm -f "$LOCKFILE"
