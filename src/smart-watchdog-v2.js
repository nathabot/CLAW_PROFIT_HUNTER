#!/usr/bin/env node
/**
 * WATCHDOG v2 - Auto-report & Fix
 * Writes issues to file, checked during heartbeat
 */

const fs = require('fs');
const path = require('path');

const ISSUES_FILE = '/root/trading-bot/watchdog-issues.json';
const LOGS = {
    LIVE: '/root/trading-bot/logs/live-trader-v4.2.log',
    PAPER: '/root/trading-bot/logs/paper-v5.log',
    GUARDIAN: '/root/trading-bot/logs/guardian.log',
    MONITOR: '/root/trading-bot/logs/system-monitor.log',
    SL: '/root/trading-bot/logs/sl-tracker.log'
};

function checkLogs() {
    const issues = [];
    const now = Date.now();
    
    // Check log ages
    for (const [name, filePath] of Object.entries(LOGS)) {
        try {
            const stat = fs.statSync(filePath);
            const age = (now - stat.mtimeMs) / 1000 / 60;
            
            if (age > 90) {
                issues.push({ type: 'critical', name, issue: `Log not updated in ${Math.round(age)} min`, age });
            }
        } catch(e) {
            issues.push({ type: 'error', name, issue: 'File not found' });
        }
    }
    
    // Check emergency stop
    try {
        if (fs.existsSync('/root/trading-bot/EMERGENCY_STOP')) {
            const content = fs.readFileSync('/root/trading-bot/EMERGENCY_STOP', 'utf8');
            issues.push({ type: 'warning', name: 'Emergency', issue: 'Trading halted', detail: content.substring(0, 100) });
        }
    } catch(e) {}
    
    return issues;
}

console.log('🐕 Watchdog checking...');
const issues = checkLogs();

if (issues.length > 0) {
    fs.writeFileSync(ISSUES_FILE, JSON.stringify({ issues, timestamp: Date.now() }, null, 2));
    console.log('⚠️ Issues found:', issues.length);
    issues.forEach(i => console.log(`  ${i.type}: ${i.name} - ${i.issue}`));
} else {
    // Clear issues file if all OK
    if (fs.existsSync(ISSUES_FILE)) {
        fs.unlinkSync(ISSUES_FILE);
    }
    console.log('✅ All systems OK');
}
