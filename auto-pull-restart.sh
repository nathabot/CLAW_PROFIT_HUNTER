#!/bin/bash
# Auto-pull and restart script for CLAW PROFIT HUNTER
# Runs every 15 minutes via cron

cd /root/trading-bot

echo "========================================"
echo "🔄 Auto-Pull Check: $(date)"
echo "========================================"

# Fetch latest changes
git fetch origin main

# Check if there are new changes
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "📥 New changes detected!"
    echo "Local: $LOCAL"
    echo "Remote: $REMOTE"
    
    # Pull changes
    echo "📥 Pulling updates..."
    git pull origin main
    
    # Install dependencies if package.json changed
    if git diff --name-only HEAD@{1} HEAD | grep -q "package.json"; then
        echo "📦 package.json changed, installing dependencies..."
        npm install
    fi
    
    # Restart PM2 processes
    echo "🔄 Restarting PM2 processes..."
    pm2 restart all
    
    echo "✅ Update complete at $(date)"
    
    # Optional: Send notification
    echo "📤 Sistem diupdate dan restart otomatis"
else
    echo "✅ No new changes. System up-to-date."
fi

echo "========================================"
