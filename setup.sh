#!/bin/bash
# Setup script - Run this after cloning the repo
# Creates .env from template and validates setup

echo "========================================"
echo "🔧 CLAW PROFIT HUNTER - Setup"
echo "========================================"

# Check if .env exists
if [ -f ".env" ]; then
    echo "✅ .env already exists"
else
    echo "❌ .env not found!"
    echo "Please create .env file with your credentials:"
    echo ""
    echo "Example:"
    echo "QUICKNODE_RPC=https://your-rpc-url"
    echo "QUICKNODE_API_KEY=your-api-key"
    echo "TELEGRAM_BOT_TOKEN=your-bot-token"
    exit 1
fi

# Load env vars
export $(cat .env | grep -v '^#' | xargs)

# Validate required vars
MISSING=""
[ -z "$QUICKNODE_RPC" ] && MISSING="$MISSING QUICKNODE_RPC"
[ -z "$QUICKNODE_API_KEY" ] && MISSING="$MISSING QUICKNODE_API_KEY"

if [ -n "$MISSING" ]; then
    echo "❌ Missing required env vars:$MISSING"
    exit 1
fi

echo "✅ All required credentials present"
echo ""
echo "📝 Next steps:"
echo "1. Review config.example.json"
echo "2. Your local config will not be overwritten by git"
echo "3. Run: pm2 start all"
echo ""
echo "✅ Setup complete!"
