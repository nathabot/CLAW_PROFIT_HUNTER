#!/usr/bin/env node
/**
 * SELF-HEALING WATCHDOG v3.0
 * Autonomous system repair and recovery
 */

const fs = require('fs');
const { exec, execSync } = require('child_process');
const fetch = require('node-fetch');

const CONFIG = {
  CHECK_INTERVAL: 60 * 1000, // 1 minute
  STATE_FILE: '/root/trading-bot/self-healing-state.json',
  LOG_FILE: '/root/trading-bot/logs/self-healing.log',
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  CHAT_ID: '-1003212463774',
  SERVICES: [
    {
      name: 'exit-monitor-wif',
      type: 'daemon',
      check: 'exit-monitor-wif.js',
      restart: 'cd /root/trading-bot && nohup node exit-monitor-wif.js > wif-exit.log 2>&1 &',
      critical: true
    },
    {
      name: 'dashboard-server',
      type: 'daemon',
      check: 'dashboard-server.js',
      restart: 'cd /root/trading-bot && nohup node src/dashboard-server.js > /dev/null 2>&1 &',
      critical: false
    },
    {
      name: 'live-trader',
      type: 'cron',
      check: 'live-trader-v4.2.log',
      maxAge: 10 * 60 * 1000, // 10 minutes
      critical: true
    },
    {
      name: 'paper-trader',
      type: 'cron',
      check: 'paper-v5.log',
      maxAge: 15 * 60 * 1000, // 15 minutes
      critical: true
    },
    {
      name: 'balance-guardian',
      type: 'cron',
      check: 'guardian.log',
      maxAge: 10 * 60 * 1000,
      critical: true
    },
    {
      name: 'sl-tracker',
      type: 'cron',
      check: 'sl-tracker.log',
      maxAge: 10 * 60 * 1000,
      critical: false
    }
  ]
};

class SelfHealingWatchdog {
  constructor() {
    this.state = this.loadState();
    this.healingLog = [];
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (e) {}
    return {
      lastCheck: null,
      healCount: 0,
      serviceStatus: {}
    };
  }

  saveState() {
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}`;
    console.log(entry);
    fs.appendFileSync(CONFIG.LOG_FILE, entry + '\n');
  }

  async notify(msg) {
    try {
      await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.CHAT_ID,
          text: msg,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {}
  }

  checkProcess(name, pattern) {
    try {
      const output = execSync(`ps aux | grep "${pattern}" | grep -v grep | wc -l`, { encoding: 'utf8' });
      const count = parseInt(output.trim());
      return count;
    } catch (e) {
      return 0;
    }
  }

  checkLogFile(logFile, maxAge) {
    try {
      const logPath = `/root/trading-bot/logs/${logFile}`;
      if (!fs.existsSync(logPath)) return { exists: false, recent: false };
      
      const stats = fs.statSync(logPath);
      const age = Date.now() - stats.mtime.getTime();
      
      return {
        exists: true,
        recent: age < maxAge,
        age: Math.floor(age / 60000) // minutes
      };
    } catch (e) {
      return { exists: false, recent: false };
    }
  }

  killDuplicate(pattern) {
    try {
      this.log(`🔪 Killing duplicate processes: ${pattern}`);
      execSync(`pkill -f "${pattern}"`);
      this.log(`✅ Killed all ${pattern} processes`);
      return true;
    } catch (e) {
      this.log(`⚠️  Kill failed: ${e.message}`);
      return false;
    }
  }

  restartService(service) {
    return new Promise((resolve) => {
      this.log(`🔄 Restarting ${service.name}...`);
      
      exec(service.restart, (error, stdout, stderr) => {
        if (error) {
          this.log(`❌ Restart failed: ${error.message}`);
          resolve(false);
        } else {
          this.log(`✅ ${service.name} restarted`);
          resolve(true);
        }
      });
    });
  }

  async healService(service) {
    this.log(`\n🔧 HEALING: ${service.name}`);
    
    let healed = false;
    let action = '';

    if (service.type === 'daemon') {
      const count = this.checkProcess(service.name, service.check);
      
      if (count === 0) {
        // Not running - restart
        action = 'RESTART (not running)';
        healed = await this.restartService(service);
      } else if (count > 1) {
        // Duplicate - kill all and restart
        action = 'KILL_DUPLICATE + RESTART';
        this.killDuplicate(service.check);
        await new Promise(r => setTimeout(r, 2000));
        healed = await this.restartService(service);
      }
    } else if (service.type === 'cron') {
      const logStatus = this.checkLogFile(service.check, service.maxAge);
      
      if (!logStatus.exists) {
        action = 'LOG_MISSING';
        this.log(`⚠️  ${service.name} log file missing`);
        // Cron will auto-restart, just notify
        healed = true;
      } else if (!logStatus.recent) {
        action = `STALL (last update ${logStatus.age}m ago)`;
        this.log(`⚠️  ${service.name} stalled`);
        // Kill any hanging processes
        this.killDuplicate(service.name);
        healed = true;
      } else {
        healed = true; // Running normally
      }
    }

    if (action) {
      this.healingLog.push({
        timestamp: Date.now(),
        service: service.name,
        action,
        healed
      });
      
      if (service.critical && !healed) {
        await this.notify(`🚨 **CRITICAL: ${service.name} heal failed**\n\nAction: ${action}\nManual intervention required!`);
      }
    }

    return healed;
  }

  async runCheck() {
    this.log('\n' + '='.repeat(60));
    this.log('🛡️  SELF-HEALING WATCHDOG CHECK');
    this.log('='.repeat(60));
    
    let healedCount = 0;
    let issuesFound = 0;

    for (const service of CONFIG.SERVICES) {
      const status = await this.healService(service);
      this.state.serviceStatus[service.name] = {
        lastCheck: Date.now(),
        healthy: status
      };
      
      if (!status) issuesFound++;
      if (status && this.healingLog.find(h => h.service === service.name && h.timestamp > Date.now() - 60000)) {
        healedCount++;
      }
    }

    this.state.lastCheck = Date.now();
    this.saveState();

    // Summary
    this.log('\n📊 CHECK SUMMARY');
    this.log(`   Issues found: ${issuesFound}`);
    this.log(`   Services healed: ${healedCount}`);
    this.log(`   Next check: 1 minute`);

    if (healedCount > 0) {
      await this.notify(`✅ **Self-Healing Complete**\n\n${healedCount} services healed automatically\nIssues remaining: ${issuesFound}`);
    }
  }

  start() {
    this.log('🚀 Self-Healing Watchdog v3.0 STARTED');
    this.log('   Check interval: 1 minute');
    this.log('   Auto-repair: ENABLED');
    
    // Initial check
    this.runCheck();
    
    // Schedule checks
    setInterval(() => this.runCheck(), CONFIG.CHECK_INTERVAL);
  }
}

// Run
const watchdog = new SelfHealingWatchdog();
watchdog.start();
