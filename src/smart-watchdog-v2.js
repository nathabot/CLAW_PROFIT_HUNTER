#!/usr/bin/env node
/**
 * SMART WATCHDOG AGENT v2.0
 * 
 * Fungsi:
 * 1. Monitor semua log sistem (Live Trader, Paper Trader, Balance Guardian, dll)
 * 2. Analisis masalah otomatis
 * 3. Kirim laporan ke @pranatha_bot (VPS Bot)
 * 4. Siapkan rekomendasi perbaikan
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

const CONFIG = {
  // Telegram untuk laporan
  BOT_TOKEN: TELEGRAM_BOT_TOKEN,
  VPS_BOT_CHAT: '428798235', // @pranatha_bot chat ID
  TOPIC_ID: 26, // Performance Tracking
  
  // Log files yang dimonitor
  LOGS: {
    LIVE_TRADER: '/root/.pm2/logs/live-trader-v4.2-out.log',
    LIVE_TRADER_ERROR: '/root/.pm2/logs/live-trader-v4.2-error.log',
    PAPER_TRADER: '/root/trading-bot/logs/paper-v5.log',
    BALANCE_GUARDIAN: '/root/trading-bot/logs/guardian.log',
    SYSTEM_MONITOR: '/root/trading-bot/logs/system-monitor.log',
    EVALUATION: '/root/trading-bot/logs/evaluation.log',
    AUTO_PULL: '/root/trading-bot/logs/auto-pull.log'
  },
  
  // State file
  STATE_FILE: '/root/trading-bot/watchdog-state.json',
  
  // Check interval (5 menit)
  CHECK_INTERVAL: 5 * 60 * 1000
};

class SmartWatchdog {
  constructor() {
    this.state = this.loadState();
    this.issues = [];
    this.recommendations = [];
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      lastCheck: Date.now(),
      issueCount: 0,
      lastReport: null
    };
  }

  saveState() {
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  async notifyVPSBot(msg, priority = 'normal') {
    try {
      const emoji = priority === 'critical' ? '🚨' : priority === 'warning' ? '⚠️' : 'ℹ️';
      await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.VPS_BOT_CHAT,
          text: `${emoji} **WATCHDOG REPORT**\n\n${msg}`,
          parse_mode: 'Markdown'
        })
      });
      console.log('✅ Report sent to VPS Bot');
    } catch (e) {
      console.error('❌ Failed to notify:', e.message);
    }
  }

  // ==================== CHECK FUNCTIONS ====================
  
  checkLiveTrader() {
    const issues = [];
    
    try {
      const log = fs.readFileSync(CONFIG.LOGS.LIVE_TRADER, 'utf8');
      const lines = log.split('\n').slice(-100);
      
      // Check for crashes/restarts
      const restartCount = (log.match(/LIVE TRADER v4\.2 - DYNAMIC TP\/SL SCANNER/g) || []).length;
      // if (restartCount > 5) {
        // issues.push({
          severity: 'critical',
          component: 'Live Trader',
          issue: `Too many restarts (${restartCount})`,
          cause: 'Likely crash loop',
          // fix: 'Check error logs: tail -50 /root/.pm2/logs/live-trader-v4.2-error.log'
        });
      }
      
      // Check for DexScreener errors
      const dexErrors = (log.match(/DexScreener|invalid json/g) || []).length;
      // if (dexErrors > 3) {
        // issues.push({
          severity: 'warning',
          component: 'Live Trader',
          issue: `DexScreener API errors (${dexErrors})`,
          cause: 'Rate limit or API down',
          // fix: 'Check retry logic in live-trader-v4.2.js'
        });
      }
      
      // Check for adaptive sync failures
      const syncFailures = (log.match(/Adaptive sync failed/g) || []).length;
      if (syncFailures > 5) {
        // issues.push({
          severity: 'warning',
          component: 'Live Trader',
          issue: `Paper Trader sync failing (${syncFailures}x)`,
          cause: 'BOK or Paper Trader data missing',
          // fix: 'Check BOK files and Paper Trader state'
        });
      }
      
      // Check if no trades executed recently
      const lastBuy = log.lastIndexOf('EXECUTING BUY');
      const lastTradeTime = lastBuy > 0 ? Date.now() - (lines.length - log.substring(0, lastBuy).split('\n').length) * 1000 : null;
      
    } catch (e) {
      // issues.push({
        severity: 'error',
        component: 'Watchdog',
        issue: 'Cannot read Live Trader log',
        cause: e.message,
        // fix: 'Check file permissions'
      });
    }
    
    return issues;
  }

  checkPaperTrader() {
    const issues = [];
    
    try {
      const log = fs.readFileSync(CONFIG.LOGS.PAPER_TRADER, 'utf8');
      
      // Check for NaN in BOK
      if (log.includes('NaN%')) {
        // issues.push({
          severity: 'critical',
          component: 'Paper Trader',
          issue: 'NaN% detected in BOK files',
          cause: 'Bug in WR calculation',
          // fix: 'Fix typo: result.result -> result.total in updateBOKStrategyFiles()'
        });
      }
      
      // Check for empty BOK Positive
      const bokPositive = fs.readFileSync('/root/trading-bot/bok/16-positive-strategies.md', 'utf8');
      if (bokPositive.includes('No strategies currently meet')) {
        const simCount = this.getSimulationCount();
        if (simCount > 20) {
          // issues.push({
            severity: 'warning',
            component: 'Paper Trader',
            issue: `BOK Positive empty after ${simCount} simulations`,
            cause: 'No strategy reaching 70% WR',
            // fix: 'Check if WR calculation working; Review strategy parameters'
          });
        }
      }
      
    } catch (e) {
      // issues.push({
        severity: 'error',
        component: 'Paper Trader',
        issue: 'Cannot read Paper Trader data',
        cause: e.message,
        // fix: 'Check file paths and permissions'
      });
    }
    
    return issues;
  }

  checkBalanceGuardian() {
    const issues = [];
    
    try {
      const log = fs.readFileSync(CONFIG.LOGS.BALANCE_GUARDIAN, 'utf8');
      
      // Check for false emergency stops
      if (log.includes('EMERGENCY STOP') && log.includes('0.0000 SOL')) {
        // issues.push({
          severity: 'critical',
          component: 'Balance Guardian',
          issue: 'False emergency stop triggered',
          cause: 'RPC error showing 0 balance',
          // fix: 'Verify RPC error handling in getBalance() function'
        });
      }
      
      // Check for RPC errors
      if (log.includes('RPC Error')) {
        const rpcErrors = (log.match(/RPC Error/g) || []).length;
        if (rpcErrors > 3) {
          // issues.push({
            severity: 'warning',
            component: 'Balance Guardian',
            issue: `Multiple RPC errors (${rpcErrors})`,
            cause: 'Helius API issues',
            // fix: 'Check API key; Consider fallback RPC endpoints'
          });
        }
      }
      
    } catch (e) {
      // Log file might not exist yet
    }
    
    return issues;
  }

  checkSystemIntegrity() {
    const issues = [];
    
    // DISABLED - Using cron now, not PM2
    // Check cron-based processes instead
    try {
      // const pm2Status = execSync('pm2 list', { encoding: 'utf8' });
      
      // if (!pm2Status.includes('live-trader-v4.2')) {
        // issues.push({
          severity: 'critical',
          component: 'System',
          issue: 'Live Trader not running in PM2',
          cause: 'Process stopped or crashed',
          // fix: 'pm2 restart live-trader-v4.2'
        });
      }
      
      // if (!pm2Status.includes('online')) {
        // issues.push({
          severity: 'critical',
          component: 'System',
          issue: 'PM2 processes not online',
          cause: 'Multiple process failures',
          // fix: 'pm2 restart all'
        });
      }
      
    } catch (e) {
      // issues.push({
        severity: 'error',
        component: 'System',
        issue: 'Cannot check PM2 status',
        cause: e.message,
        // fix: 'Check PM2 installation'
      });
    }
    
    // Check disk space
    try {
      const df = execSync('df -h /root', { encoding: 'utf8' });
      const match = df.match(/(\d+)%/);
      if (match && parseInt(match[1]) > 90) {
        // issues.push({
          severity: 'warning',
          component: 'System',
          issue: `Disk space critical (${match[1]}% used)`,
          cause: 'Logs consuming space',
          // fix: 'Run log cleanup: find /root/trading-bot/logs -name "*.log" -mtime +7 -delete'
        });
      }
    } catch (e) {}
    
    return issues;
  }

  getSimulationCount() {
    try {
      const state = JSON.parse(fs.readFileSync('/root/trading-bot/paper-trader-v5-state.json', 'utf8'));
      return state.simulationCount || 0;
    } catch (e) {
      return 0;
    }
  }

  // ==================== MAIN FUNCTIONS ====================

  analyzeIssues() {
    this.issues = [
      ...this.checkLiveTrader(),
      ...this.checkPaperTrader(),
      ...this.checkBalanceGuardian(),
      ...this.checkSystemIntegrity()
    ];
    
    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, error: 2, info: 3 };
    this.issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  generateRecommendations() {
    this.recommendations = this.issues.map(issue => ({
      ...issue,
      autoFix: this.canAutoFix(issue),
      command: this.getFixCommand(issue)
    }));
  }

  canAutoFix(issue) {
    // Determine if issue can be auto-fixed
    const autoFixable = [
      'Process stopped',
      'PM2 processes not online',
      'False emergency stop'
    ];
    
    return autoFixable.some(keyword => issue.issue.includes(keyword));
  }

  getFixCommand(issue) {
    const commands = {
      'Live Trader not running': 'pm2 restart live-trader-v4.2',
      'PM2 processes not online': 'pm2 restart all',
      'False emergency stop': 'rm -f /root/trading-bot/EMERGENCY_STOP && pm2 restart live-trader-v4.2',
      'Disk space critical': 'find /root/trading-bot/logs -name "*.log" -mtime +7 -delete'
    };
    
    for (const [key, cmd] of Object.entries(commands)) {
      if (issue.issue.includes(key)) return cmd;
    }
    return null;
  }

  async generateReport() {
    if (this.issues.length === 0) {
      // Only report if no issues for 3 consecutive checks
      this.state.cleanChecks = (this.state.cleanChecks || 0) + 1;
      if (this.state.cleanChecks >= 3) {
        console.log('✅ All systems healthy (3 consecutive clean checks)');
        this.state.cleanChecks = 0;
      }
      return;
    }
    
    this.state.cleanChecks = 0;
    
    let msg = `🐕 **SMART WATCHDOG ALERT**\n\n`;
    msg += `⏰ ${new Date().toLocaleString('id-ID')}\n`;
    msg += `📊 Simulations: ${this.getSimulationCount()}/50\n\n`;
    
    // Critical issues first
    const critical = this.issues.filter(i => i.severity === 'critical');
    const warnings = this.issues.filter(i => i.severity === 'warning');
    const errors = this.issues.filter(i => i.severity === 'error');
    
    if (critical.length > 0) {
      msg += `🚨 **CRITICAL ISSUES (${critical.length})**\n\n`;
      critical.forEach((issue, idx) => {
        msg += `${idx + 1}. **${issue.component}**\n`;
        msg += `   Issue: ${issue.issue}\n`;
        msg += `   Cause: ${issue.cause}\n`;
        msg += `   Fix: \`${issue.fix}\`\n`;
        if (issue.autoFix) {
          msg += `   ⚡ Auto-fix available: \`${issue.command}\`\n`;
        }
        msg += `\n`;
      });
    }
    
    if (warnings.length > 0) {
      msg += `⚠️ **WARNINGS (${warnings.length})**\n\n`;
      warnings.forEach((issue, idx) => {
        msg += `${idx + 1}. **${issue.component}**: ${issue.issue}\n`;
      });
      msg += `\n`;
    }
    
    // Summary
    msg += `---\n\n`;
    msg += `📋 **SUMMARY**\n`;
    msg += `• Total Issues: ${this.issues.length}\n`;
    msg += `• Critical: ${critical.length}\n`;
    msg += `• Warnings: ${warnings.length}\n`;
    msg += `• Auto-fixable: ${this.recommendations.filter(r => r.autoFix).length}\n\n`;
    
    msg += `🔧 **QUICK FIXES**\n`;
    this.recommendations.filter(r => r.autoFix).forEach(r => {
      msg += `\`\`\`\n${r.command}\n\`\`\`\n`;
    });
    
    await this.notifyVPSBot(msg, critical.length > 0 ? 'critical' : 'warning');
    
    this.state.issueCount += this.issues.length;
    this.state.lastReport = Date.now();
  }

  async run() {
    console.log('🐕 Smart Watchdog starting...\n');
    
    this.analyzeIssues();
    this.generateRecommendations();
    
    // Only report if CRITICAL issues found (not warnings)
    const criticalIssues = this.issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      await this.generateReport();
      console.log(`\n🚨 Report sent. Found ${criticalIssues.length} CRITICAL issues.`);
    } else {
      console.log(`\n✅ No critical issues. ${this.issues.length} warnings (not reported).`);
    }
    
    this.saveState();
    
    console.log('✅ Watchdog complete.');
  }
}

// Run once (cron handles scheduling)
const watchdog = new SmartWatchdog();
watchdog.run().catch(console.error);

console.log('🐕 Smart Watchdog Agent v2.0 - Started');
console.log(`📅 ${new Date().toLocaleString('id-ID')}`);
console.log('⏱️  Running via cron (30 min)\n');
