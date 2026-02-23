#!/bin/bash
# PRE-GRAD TOKEN HUNTER
# Runs every 5 minutes to find pre-grad tokens

echo "========================================="
echo "🎯 PRE-GRAD TOKEN HUNTER"
echo "   $(date)"
echo "========================================="

# Navigate to pump.fun
cd /root/.openclaw/workspace

# Use existing browser (already running)
# Get token list from current page

# Check if pump.fun is loaded
echo "📡 Checking pump.fun..."

# If not on pump.fun, navigate there
node -e "
const fs = require('fs');

// Read the CDP config
const config = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
console.log('Browser config:', JSON.stringify(config, null, 2));
"
