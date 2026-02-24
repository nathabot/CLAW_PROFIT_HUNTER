#!/bin/bash
# Auto-commit changes in trading-bot repo
# Runs every 15 minutes

cd /root/trading-bot

# Check for changes
if [ -n "$(git status --porcelain)" ]; then
    # Add all changes
    git add -A
    
    # Commit with timestamp
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
    git commit -m "Auto-update: $TIMESTAMP"
    
    # Push
    git push origin main 2>&1
fi
