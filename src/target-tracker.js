#!/usr/bin/env node
/**
 * TARGET TRACKER with Multiplier System
 * Tracks daily target achievement and applies x2 multiplier
 */

const fs = require('fs');
const TARGET_FILE = '/root/trading-bot/target-config.json';
const HISTORY_FILE = '/root/trading-bot/target-history.json';

class TargetTracker {
  constructor() {
    this.config = this.loadConfig();
    this.history = this.loadHistory();
  }

  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(TARGET_FILE, 'utf8'));
    } catch (e) {
      return {
        dailyTarget: { current: 0.2, base: 0.2, multiplier: 2, max: 5.0 },
        positionSizing: { balance: 0.1, maxPerTrade: 0.015 }
      };
    }
  }

  loadHistory() {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      return { achievements: [], currentStreak: 0 };
    }
  }

  saveConfig() {
    fs.writeFileSync(TARGET_FILE, JSON.stringify(this.config, null, 2));
  }

  saveHistory() {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
  }

  // Check if daily target achieved
  checkTarget(currentProfit) {
    const target = this.config.dailyTarget.current;
    
    if (currentProfit >= target) {
      console.log(`🎯 TARGET ACHIEVED: ${currentProfit.toFixed(4)} SOL / ${target.toFixed(4)} SOL`);
      
      // Record achievement
      this.history.achievements.push({
        date: new Date().toISOString(),
        target: target,
        achieved: currentProfit,
        multiplier: this.config.dailyTarget.multiplier
      });
      
      // Apply multiplier
      this.increaseTarget();
      this.saveHistory();
      
      return true;
    }
    
    return false;
  }

  // Increase target by multiplier
  increaseTarget() {
    const current = this.config.dailyTarget.current;
    const multiplier = this.config.dailyTarget.multiplier;
    const max = this.config.dailyTarget.max;
    
    let newTarget = current * multiplier;
    
    // Cap at max
    if (newTarget > max) {
      newTarget = max;
      console.log(`⚠️ Target capped at MAX: ${max} SOL`);
    }
    
    this.config.dailyTarget.current = newTarget;
    this.saveConfig();
    
    console.log(`🚀 TARGET INCREASED: ${current.toFixed(4)} → ${newTarget.toFixed(4)} SOL (x${multiplier})`);
    
    // Send notification
    this.notifyTargetIncrease(current, newTarget);
  }

  // Reset target to base (on major drawdown)
  resetTarget() {
    const base = this.config.dailyTarget.base;
    const current = this.config.dailyTarget.current;
    
    if (current > base) {
      console.log(`🔄 TARGET RESET: ${current.toFixed(4)} → ${base.toFixed(4)} SOL`);
      this.config.dailyTarget.current = base;
      this.saveConfig();
    }
  }

  // Get current target
  getCurrentTarget() {
    return this.config.dailyTarget.current;
  }

  // Send Telegram notification
  notifyTargetIncrease(oldTarget, newTarget) {
    try {
      const fetch = require('node-fetch');
      const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');
      
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          message_thread_id: 24,
          text: `🎯 *TARGET INCREASED!*\n\nPrevious: ${oldTarget.toFixed(4)} SOL ✅\nNew Target: ${newTarget.toFixed(4)} SOL 🚀\nMultiplier: x2\n\nNext: ${(newTarget * 2).toFixed(4)} SOL`,
          parse_mode: 'Markdown'
        })
      }).catch(() => {});
    } catch (e) {}
  }

  // Display status
  status() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 TARGET TRACKER STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Current Target: ${this.config.dailyTarget.current.toFixed(4)} SOL`);
    console.log(`Base Target: ${this.config.dailyTarget.base.toFixed(4)} SOL`);
    console.log(`Multiplier: x${this.config.dailyTarget.multiplier}`);
    console.log(`Max Target: ${this.config.dailyTarget.max.toFixed(4)} SOL`);
    console.log(`Achievements: ${this.history.achievements.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

// Run if called directly
if (require.main === module) {
  const tracker = new TargetTracker();
  
  const command = process.argv[2];
  
  if (command === 'status') {
    tracker.status();
  } else if (command === 'reset') {
    tracker.resetTarget();
    console.log('✅ Target reset to base');
  } else if (command === 'check') {
    const profit = parseFloat(process.argv[3]) || 0;
    tracker.checkTarget(profit);
  } else {
    tracker.status();
  }
}

module.exports = TargetTracker;
