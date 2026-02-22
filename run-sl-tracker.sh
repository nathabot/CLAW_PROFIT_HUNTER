#!/bin/bash
export HELIUS_API_KEY="c9926a7b-57ba-47e3-8de4-5fb46fa4b9ee"
LOCKFILE="/root/trading-bot/sl-tracker.lock"
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "SL tracker already running (PID: $PID)"
    exit 0
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
cd /root/trading-bot
node src/sl-tracker.js >> /root/trading-bot/logs/sl-tracker.log 2>&1
rm -f "$LOCKFILE"
