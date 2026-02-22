#!/usr/bin/env node
/**
 * SYSTEM MONITOR AGENT
 * Monitor all protocols, prevent duplicates, ensure system integrity
 * Validates: Single source of truth, no double execution
 */

const fs = require('fs');
const { execSync } = require('child_process');
const fetch = require('node-fetch');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('./env-loader');

const CONFIG = {
  // Telegram
  BOT_TOKEN: TELEGRAM_BOT_TOKEN || '${TELEGRAM_BOT_TOKEN}',
  CHAT_ID: TELEGRAM_CHAT_ID || '-1003212463774',
  TOPIC_ID: 26,
  
  // Log file
  LOG_FILE: '/root/trading-bot/logs/system-monitor.log',
  STATE_FILE: '/root/trading-bot/system-state.json',
  
  // Expected single instances (PM2 processes only)
  EXPECTED_PROCESSES: {
    'live-trader': { max: 1, pattern: 'live-trader-v4', cron: true },
    'paper-trader': { max: 1, pattern: 'soul-core-paper-trader-v5' },
    'balance-guardian': { max: 1, pattern: 'balance-guardian' },
    'sl-tracker': { max: 1, pattern: 'sl-tracker', cron: true }
    // Note: 'evaluation' runs via cron (every 2 hours), not as daemon
  },
  
  // Cron jobs (should be unique)
  EXPECTED_CRONS: [
    { name: 'Paper Trader v5', pattern: 'soul-core-paper-trader-v5', schedule: '*/10', critical: true },
    { name: 'SL Tracker', pattern: 'sl-tracker', schedule: '*/5', critical: true },
    { name: 'Balance Guardian', pattern: 'balance-guardian', schedule: '*/5', critical: true },
    { name: 'Evaluation', pattern: 'evaluate-performance', schedule: '0 \\*/2', critical: true },
    { name: 'Intelligence', pattern: 'strategy-intelligence-v2', schedule: '0 \\*/4', critical: true },
    { name: 'System Monitor', pattern: 'system-monitor', schedule: '*/15', critical: true },
    { name: 'Auto-Pull', pattern: 'auto-pull-restart', schedule: '*/15', critical: true }
    // Disabled: Watchdog, GitHub Auto-Push, Performance Report, Log Cleanup (not used)
  ],
  
  // Legacy scripts to monitor (disabled - not used in new system)
  LEGACY_SCRIPTS: [
    // { name: 'Watchdog', path: '/root/trading-bot/trading-watchdog.sh' },
    // { name: 'GitHub Auto-Push', path: '/root/trading-bot/github-auto-push.sh' },
    // { name: 'Performance Monitor', path: '/root/trading-bot/performance-monitor.py' }
  ]
};

class SystemMonitor {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  log(msg, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    const line = `[${timestamp}] ${prefix} ${msg}`;
    
    console.log(line);
    
    // Append to log
    try {
      fs.appendFileSync(CONFIG.LOG_FILE, line + '\n');
    } catch (e) {}
  }

  async notify(msg, priority = 'normal') {
    try {
      const emoji = priority === 'critical' ? '🚨' : priority === 'warning' ? '⚠️' : 'ℹ️';
      await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.CHAT_ID,
          message_thread_id: CONFIG.TOPIC_ID,
          text: `${emoji} **SYSTEM MONITOR**\n\n${msg}`,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      this.log(`Notify failed: ${e.message}`, 'error');
    }
  }

  // ==================== CHECK PROCESSES ====================
  checkProcesses() {
    this.log('\n🔍 CHECKING PROCESSES...\n');
    
    try {
      const psOutput = execSync('ps aux | grep -E "node|pm2" | grep -v grep', { encoding: 'utf8' });
      const lines = psOutput.trim().split('\n');
      
      const processCounts = {};
      
      // Count each process type
      for (const line of lines) {
        for (const [name, config] of Object.entries(CONFIG.EXPECTED_PROCESSES)) {
          if (line.includes(config.pattern)) {
            processCounts[name] = (processCounts[name] || 0) + 1;
          }
        }
      }
      
      // Validate counts
      for (const [name, config] of Object.entries(CONFIG.EXPECTED_PROCESSES)) {
        const count = processCounts[name] || 0;
        
        if (count === 0) {
          this.issues.push({
            type: 'process',
            name,
            issue: 'NOT RUNNING',
            severity: 'critical'
          });
          this.log(`${name}: ❌ NOT RUNNING`, 'error');
        } else if (count > config.max) {
          this.issues.push({
            type: 'process',
            name,
            issue: `DUPLICATE (${count} instances)`,
            severity: 'critical',
            count
          });
          this.log(`${name}: ❌ DUPLICATE (${count} instances)`, 'error');
        } else {
          this.log(`${name}: ✅ OK (1 instance)`, 'success');
        }
      }
      
      // Check PM2 processes
      this.checkPM2();
      
    } catch (e) {
      this.log(`Process check failed: ${e.message}`, 'error');
    }
  }

  checkPM2() {
    try {
      const pm2Output = execSync('pm2 list 2>/dev/null || echo "PM2 not running"', { encoding: 'utf8' });
      
      if (pm2Output.includes('live-trader')) {
        const matches = pm2Output.match(/live-trader[^\n]+online/gi);
        const count = matches ? matches.length : 0;
        
        if (count > 1) {
          this.issues.push({
            type: 'pm2',
            name: 'live-trader',
            issue: `PM2 DUPLICATES (${count} online)`,
            severity: 'critical'
          });
          this.log(`PM2 live-trader: ❌ ${count} instances online`, 'error');
        } else if (count === 1) {
          this.log(`PM2 live-trader: ✅ 1 instance online`, 'success');
        }
      }
    } catch (e) {
      this.log('PM2 check skipped', 'info');
    }
  }

  // ==================== CHECK CRON JOBS ====================
  checkCrons() {
    this.log('\n🔍 CHECKING CRON JOBS...\n');
    
    try {
      const cronOutput = execSync('crontab -l 2>/dev/null || echo ""', { encoding: 'utf8' });
      const lines = cronOutput.trim().split('\n');
      
      const cronCounts = {};
      
      for (const line of lines) {
        for (const expected of CONFIG.EXPECTED_CRONS) {
          if (line.includes(expected.pattern)) {
            cronCounts[expected.name] = (cronCounts[expected.name] || 0) + 1;
          }
        }
      }
      
      // Validate crons
      for (const expected of CONFIG.EXPECTED_CRONS) {
        const count = cronCounts[expected.name] || 0;
        
        if (count === 0) {
          this.issues.push({
            type: 'cron',
            name: expected.name,
            issue: 'MISSING',
            severity: 'warning'
          });
          this.log(`Cron ${expected.name}: ⚠️ MISSING`, 'warning');
        } else if (count > 1) {
          this.issues.push({
            type: 'cron',
            name: expected.name,
            issue: `DUPLICATE (${count} entries)`,
            severity: 'critical',
            count
          });
          this.log(`Cron ${expected.name}: ❌ DUPLICATE (${count} entries)`, 'error');
        } else {
          this.log(`Cron ${expected.name}: ✅ OK`, 'success');
        }
      }
      
    } catch (e) {
      this.log(`Cron check failed: ${e.message}`, 'error');
    }
  }

  // ==================== CHECK LEGACY SCRIPTS ====================
  checkLegacyScripts() {
    this.log('\n🔍 CHECKING LEGACY SCRIPTS...\n');
    
    for (const script of CONFIG.LEGACY_SCRIPTS) {
      if (fs.existsSync(script.path)) {
        // Check if executable
        try {
          fs.accessSync(script.path, fs.constants.X_OK);
          this.log(`${script.name}: ✅ Exists & Executable`, 'success');
        } catch (e) {
          this.log(`${script.name}: ⚠️ Exists but not executable`, 'warning');
          this.issues.push({
            type: 'legacy',
            name: script.name,
            issue: 'NOT EXECUTABLE',
            severity: 'warning'
          });
        }
      } else {
        this.log(`${script.name}: ⚠️ Not found (${script.path})`, 'warning');
        this.issues.push({
          type: 'legacy',
          name: script.name,
          issue: 'MISSING',
          severity: 'warning'
        });
      }
    }
  }

  // ==================== CHECK FILE INTEGRITY ====================
  checkFiles() {
    this.log('\n🔍 CHECKING FILE INTEGRITY...\n');
    
    const criticalFiles = [
      '/root/trading-bot/src/live-trader-v4.2.js',
      '/root/trading-bot/src/soul-core-paper-trader-v5.js',
      '/root/trading-bot/src/balance-guardian.js',
      '/root/trading-bot/src/sl-tracker.js',
      '/root/trading-bot/src/evaluate-performance.js',
      '/root/trading-bot/src/strategy-intelligence-v2.js',
      '/root/trading-bot/src/system-monitor.js',
      '/root/trading-bot/adaptive-scoring-config.json'
    ];
    
    for (const file of criticalFiles) {
      if (fs.existsSync(file)) {
        this.log(`${file.split('/').pop()}: ✅ Exists`, 'success');
      } else {
        this.issues.push({
          type: 'file',
          name: file,
          issue: 'MISSING',
          severity: 'critical'
        });
        this.log(`${file}: ❌ MISSING`, 'error');
      }
    }
    
    // Check for duplicate versions
    this.checkDuplicateVersions();
  }

  checkDuplicateVersions() {
    const deprecatedFiles = [
      'paper-trader-active.js',
      'soul-core-paper-trader-v4.js',
      'prana-live-trader-v4-dynamic.js',
      'smart-scalper-v21.js'
    ];
    
    this.log('\n📁 CHECKING DEPRECATED FOLDER...\n');
    
    for (const file of deprecatedFiles) {
      const mainPath = `/root/trading-bot/${file}`;
      const deprecatedPath = `/root/trading-bot/deprecated/${file}`;
      
      if (fs.existsSync(mainPath)) {
        this.issues.push({
          type: 'duplicate',
          name: file,
          issue: 'OLD VERSION IN MAIN FOLDER',
          severity: 'warning',
          action: `mv ${mainPath} /root/trading-bot/deprecated/`
        });
        this.log(`${file}: ⚠️ Old version in main folder`, 'warning');
      } else if (fs.existsSync(deprecatedPath)) {
        this.log(`${file}: ✅ Archived in deprecated/`, 'success');
      } else {
        this.log(`${file}: ℹ️ Not found (may be deleted)`, 'info');
      }
    }
  }

  // ==================== CHECK FLAGS ====================
  checkFlags() {
    this.log('\n🔍 CHECKING SYSTEM FLAGS...\n');
    
    const flags = [
      { file: '/root/trading-bot/EMERGENCY_STOP', name: 'Emergency Stop' },
      { file: '/root/trading-bot/PAUSE_TRADING', name: 'Pause Trading' },
      { file: '/root/trading-bot/EVALUATION_MODE', name: 'Evaluation Mode' }
    ];
    
    let activeFlags = 0;
    
    for (const flag of flags) {
      if (fs.existsSync(flag.file)) {
        activeFlags++;
        this.log(`${flag.name}: 🚫 ACTIVE`, 'warning');
      } else {
        this.log(`${flag.name}: ✅ Inactive`, 'success');
      }
    }
    
    if (activeFlags > 0) {
      this.issues.push({
        type: 'flags',
        name: 'System Flags',
        issue: `${activeFlags} flags active`,
        severity: 'warning'
      });
    }
  }

  // ==================== AUTO-FIX ====================
  async autoFix() {
    if (this.issues.length === 0) {
      this.log('\n✅ NO ISSUES FOUND - System is healthy!\n', 'success');
      return;
    }
    
    this.log(`\n🔧 ATTEMPTING AUTO-FIX (${this.issues.length} issues)...\n`);
    
    const criticalIssues = this.issues.filter(i => i.severity === 'critical');
    
    if (criticalIssues.length === 0) {
      this.log('No critical issues to fix automatically.', 'info');
      return;
    }
    
    for (const issue of criticalIssues) {
      switch (issue.type) {
        case 'process':
          if (issue.issue.includes('DUPLICATE')) {
            this.log(`Fixing: Killing all ${issue.name} processes...`);
            try {
              execSync(`pkill -f "${CONFIG.EXPECTED_PROCESSES[issue.name].pattern}" 2>/dev/null || true`);
              this.fixes.push(`Killed duplicate ${issue.name}`);
            } catch (e) {}
          }
          break;
          
        case 'cron':
          if (issue.issue.includes('DUPLICATE')) {
            this.log(`Fixing: Removing duplicate cron for ${issue.name}...`);
            try {
              const pattern = CONFIG.EXPECTED_CRONS.find(c => c.name === issue.name)?.pattern;
              if (pattern) {
                execSync(`(crontab -l 2>/dev/null | grep -v "${pattern}" ; echo "$(crontab -l 2>/dev/null | grep '${pattern}' | head -1)") | crontab -`);
                this.fixes.push(`Fixed duplicate cron for ${issue.name}`);
              }
            } catch (e) {}
          }
          break;
          
        case 'duplicate':
          if (issue.action) {
            this.log(`Fixing: Moving ${issue.name} to deprecated...`);
            try {
              execSync(issue.action);
              this.fixes.push(`Moved ${issue.name} to deprecated/`);
            } catch (e) {}
          }
          break;
      }
    }
    
    this.log(`\n✅ AUTO-FIX COMPLETE (${this.fixes.length} fixes applied)\n`, 'success');
  }

  // ==================== SUMMARY ====================
  async generateSummary() {
    const timestamp = new Date().toISOString();
    
    let summary = `📊 **SYSTEM MONITOR REPORT**\n\n`;
    summary += `Time: ${timestamp}\n\n`;
    
    if (this.issues.length === 0) {
      summary += `✅ **ALL SYSTEMS HEALTHY**\n\n`;
      summary += `No issues detected.\n`;
      summary += `All protocols running as expected.\n`;
    } else {
      const critical = this.issues.filter(i => i.severity === 'critical').length;
      const warnings = this.issues.filter(i => i.severity === 'warning').length;
      
      summary += `⚠️ **ISSUES FOUND**\n\n`;
      summary += `Critical: ${critical}\n`;
      summary += `Warnings: ${warnings}\n\n`;
      
      summary += `**Critical Issues:**\n`;
      for (const issue of this.issues.filter(i => i.severity === 'critical')) {
        summary += `- ${issue.name}: ${issue.issue}\n`;
      }
      
      if (this.fixes.length > 0) {
        summary += `\n**Auto-Fixes Applied:**\n`;
        for (const fix of this.fixes) {
          summary += `- ✅ ${fix}\n`;
        }
      }
    }
    
    summary += `\n📋 **Active Protocols:**\n`;
    summary += `**Core Trading:**\n`;
    summary += `- Live Trader v4.2\n`;
    summary += `- Paper Trader v5\n`;
    summary += `- Strategy Intelligence v2\n`;
    summary += `\n**Monitoring:**\n`;
    summary += `- Balance Guardian\n`;
    summary += `- SL Tracker\n`;
    summary += `- Evaluation System\n`;
    summary += `- System Monitor\n`;
    summary += `\n**Legacy Support:**\n`;
    summary += `- Watchdog\n`;
    summary += `- GitHub Auto-Push\n`;
    summary += `- Performance Monitor\n`;
    
    await this.notify(summary, this.issues.length > 0 ? 'warning' : 'normal');
  }

  // ==================== MAIN RUN ====================
  async run() {
    console.log('\n' + '='.repeat(70));
    console.log('🛡️  SYSTEM MONITOR AGENT');
    console.log('   Preventing Duplicates | Ensuring Integrity');
    console.log('='.repeat(70));
    
    this.checkProcesses();
    this.checkCrons();
    this.checkFiles();
    this.checkLegacyScripts();
    this.checkFlags();
    
    await this.autoFix();
    await this.generateSummary();
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ System Monitor Complete\n');
  }
}

// Run
const monitor = new SystemMonitor();
monitor.run().catch(console.error);
