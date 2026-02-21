#!/bin/bash
LOCKFILE="/root/trading-bot/balance-guardian.lock"
if [ -f "$LOCKFILE" ]; then
  PID=$(cat "$LOCKFILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Balance guardian already running (PID: $PID)"
    exit 0
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
cd /root/trading-bot
node src/balance-guardian.js >> /root/trading-bot/logs/guardian.log 2>&1
rm -f "$LOCKFILE"
