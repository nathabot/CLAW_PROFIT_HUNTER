#!/bin/bash
# Keep-alive for live-trader
cd /root/trading-bot
while true; do
    echo "[$(date)] Starting live-trader..."
    node src/live-trader-v4.2.js >> logs/live-trader-v4.2.log 2>&1
    echo "[$(date)] Exit, restart in 30s..."
    sleep 30
done
