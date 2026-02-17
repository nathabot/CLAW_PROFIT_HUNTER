#!/bin/bash
# EMERGENCY STOP - KILL ALL TRADING

echo "🚨 EMERGENCY STOP INITIATED"
echo "Stopping all trading processes..."

# Kill all node processes except watchdog
killall -9 node 2>/dev/null
pkill -9 -f trader 2>/dev/null
pkill -9 -f scalper 2>/dev/null
pkill -9 -f live 2>/dev/null

# Clear cron
crontab -r 2>/dev/null

# Verify
echo ""
echo "Verification:"
ps aux | grep node | grep -v grep | wc -l | xargs echo "  Node processes:"
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" | wc -l | xargs echo "  Cron jobs:"

echo ""
echo "✅ ALL TRADING STOPPED"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"

# Send notification
node -e "
const fetch = require('node-fetch');
fetch('https://api.telegram.org/bot8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU/sendMessage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: '-1003212463774',
    message_thread_id: 24,
    text: '🚨 *EMERGENCY STOP*\n\nAll trading halted.\nTime: $(date '+%H:%M:%S')',
    parse_mode: 'Markdown'
  })
}).catch(() => {});
" 2>/dev/null

echo "Notification sent to Telegram"
