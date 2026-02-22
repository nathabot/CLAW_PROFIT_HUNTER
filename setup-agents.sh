#!/bin/bash
# Setup Background Agents Cron Jobs
# Run this script to install agent cron jobs

TRADING_BOT_DIR="/root/trading-bot"

echo "Setting up Background Agents cron jobs..."

# Remove existing agent crons first
crontab -l 2>/dev/null | grep -v "background-agents" > /tmp/current-cron
crontab /tmp/current-cron

# Add agents
# Balance Guardian - every 15 minutes
(crontab -l 2>/dev/null; echo "*/15 * * * * cd $TRADING_BOT_DIR && node src/background-agents.js balance-guardian >> logs/agents.log 2>&1") | crontab -

# Position Health Check - every 30 minutes
(crontab -l 2>/dev/null; echo "*/30 * * * * cd $TRADING_BOT_DIR && node src/background-agents.js position-health >> logs/agents.log 2>&1") | crontab -

# Morning Market Check - 7 AM
(crontab -l 2>/dev/null; echo "0 7 * * * cd $TRADING_BOT_DIR && node src/background-agents.js morning-check >> logs/agents.log 2>&1") | crontab -

# Daily P/L Summary - 8 AM
(crontab -l 2>/dev/null; echo "0 8 * * * cd $TRADING_BOT_DIR && node src/background-agents.js daily-summary >> logs/agents.log 2>&1") | crontab -

# Evening Market Check - 6 PM
(crontab -l 2>/dev/null; echo "0 18 * * * cd $TRADING_BOT_DIR && node src/background-agents.js evening-check >> logs/agents.log 2>&1") | crontab -

# Weekly Auto-Review - Sunday 9 AM
(crontab -l 2>/dev/null; echo "0 9 * * 0 cd $TRADING_BOT_DIR && node src/background-agents.js auto-review >> logs/agents.log 2>&1") | crontab -

echo "✅ Background Agents installed!"
echo ""
echo "Current cron jobs:"
crontab -l | grep background-agents
