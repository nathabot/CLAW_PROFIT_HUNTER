#!/bin/bash
# Auto-pull script for CLAW PROFIT HUNTER
# Fetches and applies updates from GitHub without overwriting local secrets
# Safe for public repo: won't overwrite wallet.json, trading-config.json, .env

cd /root/trading-bot

LOG_FILE="/root/trading-bot/auto-pull.log"

echo "========================================" | tee -a $LOG_FILE
echo "🔄 Auto-Pull Check: $(date)" | tee -a $LOG_FILE
echo "========================================" | tee -a $LOG_FILE

# Fetch latest changes
git fetch origin main

# Check if there are new changes
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "📥 New changes detected!" | tee -a $LOG_FILE
    echo "Local:  $LOCAL" | tee -a $LOG_FILE
    echo "Remote: $REMOTE" | tee -a $LOG_FILE
    
    # STASH local changes (wallet.json, config, etc.)
    echo "💾 Stashing local changes..." | tee -a $LOG_FILE
    git stash push -m "Auto-stash before pull $(date)" --include-untracked
    
    # Pull changes
    echo "📥 Pulling updates..." | tee -a $LOG_FILE
    git pull origin main
    
    # RESTORE stashed changes (wallet.json, config stays local)
    echo "💾 Restoring local changes..." | tee -a $LOG_FILE
    git stash pop
    
    # Install dependencies if package.json changed
    if git diff --name-only HEAD@{1} HEAD | grep -q "package.json"; then
        echo "📦 package.json changed, installing dependencies..." | tee -a $LOG_FILE
        npm install
    fi
    
    # Restart PM2 processes
    echo "🔄 Restarting trading bots..." | tee -a $LOG_FILE
    pm2 restart all
    
    echo "✅ Update complete at $(date)" | tee -a $LOG_FILE
else
    echo "✅ No new changes. System up-to-date." | tee -a $LOG_FILE
fi

echo "========================================" | tee -a $LOG_FILE
