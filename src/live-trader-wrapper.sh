#!/bin/bash
# Auto-restart wrapper for Live Trader v4.2
# Restart if crash, max 5 restarts per hour
# Platform: VPS Natha

LOG_FILE="/root/trading-bot/live-trades.log"
SCRIPT="/root/trading-bot/live-trader-v4.2.js"
RESTART_COUNT=0
MAX_RESTARTS=5

# Log restart
log_restart() {
    echo "[$(date)] Live trader restarted (count: $RESTART_COUNT)" >> "$LOG_FILE"
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d "chat_id=-1003212463774" \
        -d "message_thread_id=26" \
        -d "text=⚠️ Live trader crashed and restarted (attempt $RESTART_COUNT/$MAX_RESTARTS)" 2>/dev/null
}

# Main loop
while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
    echo "[$(date)] Starting live trader (attempt $((RESTART_COUNT+1))/$MAX_RESTARTS)" >> "$LOG_FILE"
    
    # Run the trader
    cd /root/trading-bot && node live-trader-v4.2.js >> "$LOG_FILE" 2>&1
    EXIT_CODE=$?
    
    # Check exit code
    if [ $EXIT_CODE -eq 0 ]; then
        # Normal exit
        echo "[$(date)] Live trader exited normally" >> "$LOG_FILE"
        break
    else
        # Crash
        RESTART_COUNT=$((RESTART_COUNT+1))
        log_restart
        
        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            echo "[$(date)] Max restarts reached, giving up" >> "$LOG_FILE"
            curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                -d "chat_id=-1003212463774" \
                -d "message_thread_id=26" \
                -d "text=🛑 Live trader failed $MAX_RESTARTS times. Manual intervention required." 2>/dev/null
            exit 1
        fi
        
        # Wait before restart
        sleep 30
    fi
done
