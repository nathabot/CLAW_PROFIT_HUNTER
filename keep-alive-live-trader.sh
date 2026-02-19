#!/bin/bash
# Keep-alive wrapper for live-trader
cd /root/trading-bot

while true; do
    echo "[$(date)] Starting live-trader-v4.2.js..."
    node src/live-trader-v4.2.js >> logs/live-trader.log 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Live-trader exited with code $EXIT_CODE. Restarting in 5s..."
    sleep 5
done
