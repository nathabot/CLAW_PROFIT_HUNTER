#!/usr/bin/env node
/**
 * SIMPLE WATCHDOG - Reports to Telegram
 */

const fs = require('fs');
const { execSync } = require('child_process');

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';

const LOGS = {
    LIVE: '/root/trading-bot/logs/live-trader-v4.2.log',
    PAPER: '/root/trading-bot/logs/paper-v5.log',
    GUARDIAN: '/root/trading-bot/logs/guardian.log',
    MONITOR: '/root/trading-bot/logs/system-monitor.log'
};

function sendTelegram(msg) {
    try {
        const https = require('https');
        const data = JSON.stringify({ chat_id: CHAT_ID, text: msg });
        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(options);
        req.write(data);
        req.end();
    } catch(e) {}
}

function checkLogs() {
    const issues = [];
    const now = Date.now();
    
    for (const [name, path] of Object.entries(LOGS)) {
        try {
            const stat = fs.statSync(path);
            const age = (now - stat.mtimeMs) / 1000 / 60; // minutes
            
            if (age > 60) {
                issues.push(`⚠️ ${name}: Last update ${Math.round(age)} min ago`);
            }
        } catch(e) {
            issues.push(`❌ ${name}: File not found`);
        }
    }
    
    return issues;
}

console.log('🐕 Simple Watchdog running...');
const issues = checkLogs();

if (issues.length > 0) {
    const msg = '🚨 WATCHDOG REPORT\n\n' + issues.join('\n');
    console.log(msg);
    sendTelegram(msg);
} else {
    console.log('✅ All systems OK');
}
