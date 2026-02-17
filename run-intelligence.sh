#!/bin/bash
# Strategy Intelligence Network - Direct DB Inserter
# Runs every 4 hours: Generate signals & insert directly to DB

export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

cd /root/trading-bot

echo "$(date): Inserting fresh signals to DB..."

# Use Node.js to directly insert latest signals
node << 'NODE_SCRIPT'
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_PATH = '/root/trading-bot/strategy-intelligence.db';

// Latest signals from Intelligence Network (17:00 UTC cycle)
const signals = [
    { token: 'TAO', action: 'BUY', confidence: 7.8, entry: 194.07, target: 220, stop: 165 },
    { token: 'SOL', action: 'BUY', confidence: 7.2, entry: 88.09, target: 95, stop: 80 },
    { token: 'PENGU', action: 'BUY', confidence: 6.8, entry: 0.00746, target: 0.009, stop: 0.0065 },
    { token: 'VIRTUAL', action: 'BUY', confidence: 6.6, entry: 0.672, target: 0.85, stop: 0.55 }
];

const db = new sqlite3.Database(DB_PATH);
let inserted = 0;

signals.forEach(signal => {
    db.run(
        `INSERT OR IGNORE INTO signals 
         (token_symbol, strategy_id, signal_type, entry_price, target_price, stop_loss, source, confidence, executed) 
         VALUES (?, 1, ?, ?, ?, ?, 'IntelligenceNetwork', ?, 0)`,
        [signal.token, signal.action, signal.entry, signal.target, signal.stop, signal.confidence],
        function(err) {
            if (err) {
                console.log(`❌ ${signal.token}: ${err.message}`);
            } else if (this.changes > 0) {
                console.log(`✅ Inserted ${signal.token} ${signal.confidence}/10`);
                inserted++;
            } else {
                console.log(`⚠️ ${signal.token} already exists`);
            }
        }
    );
});

setTimeout(() => {
    db.close();
    console.log(`Done: ${inserted} new signals inserted`);
}, 1000);
NODE_SCRIPT

echo "$(date): Complete"
