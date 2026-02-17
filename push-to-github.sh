#!/bin/bash
# CLAW PROFIT HUNTER - GitHub Push Script
# Push all system files to GitHub repository

set -e

echo "=========================================="
echo "CLAW PROFIT HUNTER - GitHub Push Script"
echo "=========================================="
echo ""

# Configuration
REPO_URL="https://github.com/YOUR_USERNAME/CLAW_PROFIT_HUNTER.git"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd /root/trading-bot

echo "📁 Current directory: $(pwd)"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git not found. Installing..."
    apt-get update && apt-get install -y git
fi

# Init git if not already
if [ ! -d .git ]; then
    echo "🔧 Initializing git repository..."
    git init
    git branch -m main
fi

# Add remote
echo "🔗 Adding remote repository..."
git remote add origin $REPO_URL 2>/dev/null || git remote set-url origin $REPO_URL

# Create directory structure
echo "📂 Creating directory structure..."
mkdir -p src
mkdir -p config
mkdir -p bok
mkdir -p sandbox/experiments
mkdir -p sandbox/strategies
mkdir -p docs
mkdir -p .github/workflows
mkdir -p logs
mkdir -p archive
mkdir -p book-of-profit-hunter-knowledge

echo "✅ Directory structure created"
echo ""

# Copy core system files
echo "📋 Copying core system files..."

# Main trading systems
cp live-trader-v4.2.js src/ 2>/dev/null || echo "⚠️ live-trader-v4.2.js not found"
cp soul-core-paper-trader-v5.js src/ 2>/dev/null || echo "⚠️ soul-core-paper-trader-v5.js not found"
cp strategy-intelligence-v2.js src/ 2>/dev/null || echo "⚠️ strategy-intelligence-v2.js not found"

# Supporting agents
cp balance-guardian.js src/ 2>/dev/null || echo "⚠️ balance-guardian.js not found"
cp sl-tracker.js src/ 2>/dev/null || echo "⚠️ sl-tracker.js not found"
cp evaluate-performance.js src/ 2>/dev/null || echo "⚠️ evaluate-performance.js not found"
cp system-monitor.js src/ 2>/dev/null || echo "⚠️ system-monitor.js not found"

# Core engine
cp dynamic-tpsl-engine.js src/ 2>/dev/null || echo "⚠️ dynamic-tpsl-engine.js not found"

# Wrapper scripts
cp live-trader-wrapper.sh src/ 2>/dev/null || echo "⚠️ live-trader-wrapper.sh not found"

# Config files
cp adaptive-scoring-config.json config/ 2>/dev/null || echo "⚠️ adaptive-scoring-config.json not found"
if [ -f package.json ]; then cp package.json config/; fi

# BOK files
echo "📚 Copying BOK (Book of Knowledge)..."
if [ -d book-of-profit-hunter-knowledge ]; then
    cp book-of-profit-hunter-knowledge/*.md bok/ 2>/dev/null || true
fi

# GitHub workflows
echo "🔧 Copying GitHub Actions..."
if [ -d .github/workflows ]; then
    cp .github/workflows/*.yml .github/workflows/ 2>/dev/null || true
fi

# Documentation
echo "📚 Copying documentation..."
if [ -d docs ]; then
    cp docs/*.md docs/ 2>/dev/null || true
fi

echo "✅ All files copied"
echo ""

# Create .gitkeep files
touch logs/.gitkeep
touch archive/.gitkeep

# Git add and commit
echo "📤 Preparing for push..."
git add .

echo "📝 Checking status..."
git status

echo ""
echo "📝 Committing files..."
git commit -m "Initial: CLAW PROFIT HUNTER v1.0

Complete automated trading system with:
- 4-Layer Architecture (Intelligence → Paper → BOK → Live)
- Strategy Intelligence v2 with dynamic signal generation
- Paper Trader v5 with simulation engine
- Live Trader v4.2 with full strategy sync
- 4 Supporting Agents (Guardian, SL Tracker, Evaluation, Monitor)
- Dynamic TP/SL Engine
- Complete BOK documentation
- GitHub Actions for CI/CD

Timestamp: $TIMESTAMP" || echo "⚠️ Nothing to commit or commit failed"

# Push
echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin main || echo "❌ Push failed. Check your GitHub credentials."

echo ""
echo "=========================================="
echo "✅ CLAW PROFIT HUNTER GitHub Push Complete"
echo "=========================================="
echo ""
echo "Repository: $REPO_URL"
echo "Timestamp: $TIMESTAMP"
echo ""
echo "Next steps:"
echo "1. Check your GitHub repository"
echo "2. Update README with your details"
echo "3. Set up GitHub Secrets for auto-deploy"
echo ""
