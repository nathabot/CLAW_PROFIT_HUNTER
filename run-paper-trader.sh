#!/bin/bash
export HELIUS_API_KEY="${HELIUS_API_KEY}"
LOCKFILE="/root/trading-bot/paper-trader.lock"
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Paper trader already running (PID: $PID)"
    exit 0
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
cd /root/trading-bot
node src/soul-core-paper-trader-v5.js >> /root/trading-bot/logs/paper-v5.log 2>&1
rm -f "$LOCKFILE"
