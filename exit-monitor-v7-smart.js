#!/usr/bin/env node
/**
 * EXIT MONITOR v7.0 - DYNAMIC INTERVAL
 * Adjusts check frequency based on token volatility
 * HIGH (>15%): 15s | MEDIUM (8-15%): 30s | LOW (<8%): 60s
 */

const fs = require('fs');
const fetch = require('node-fetch');
const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');

// DYNAMIC INTERVAL CONFIG
const INTERVALS = {
  HIGH: { threshold: 15, ms: 15000, name: 'HIGH' },    // >15% = 15s
  MEDIUM: { threshold: 8, ms: 30000, name: 'MEDIUM' }, // 8-15% = 30s
  LOW: { threshold: 0, ms: 60000, name: 'LOW' }        // <8% = 60s
};

// Load position
const POS_FILE = process.argv[2];
if (!POS_FILE) {
  console.log('Usage: node exit-monitor-v7-smart.js <position-file>');
  process.exit(1);
}

const POS = JSON.parse(fs.readFileSync(POS_FILE));
const SYMBOL = POS.symbol;

console.log(`🚀 EXIT MONITOR v7-DYNAMIC for ${SYMBOL}`);
console.log(`Entry: $${POS.entry} | SL: $${POS.stop} | TP1: $${POS.tp1} | TP2: $${POS.tp2}`);
console.log('Volatility: HIGH(>15%)=15s | MEDIUM(8-15%)=30s | LOW(<8%)=60s\n');

// Load wallet
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json'));
const bs58lib = bs58.default || bs58;
const wallet = Keypair.fromSecretKey(bs58lib.decode(walletData.privateKey));
console.log(`Wallet: ${wallet.publicKey.toString().slice(0, 15)}...\n`);

// State
let currentInterval = INTERVALS.LOW.ms;
let monitorTimer = null;
let lastVolCategory = 'LOW';
let priceHistory = [];
let lastPrice = POS.entry;

// Calculate volatility category
function getVolatilityCategory(drops) {
  const maxVol = Math.max(Math.abs(drops.m5 || 0), Math.abs(drops.h1 || 0));
  if (maxVol > INTERVALS.HIGH.threshold) return INTERVALS.HIGH;
  if (maxVol > INTERVALS.MEDIUM.threshold) return INTERVALS.MEDIUM;
  return INTERVALS.LOW;
}

// Telegram notify
async function notify(text) {
  try {
    await fetch('https://api.telegram.org/bot8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '-1003212463774',
        message_thread_id: 24,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}

// Get price
async function getPrice() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${POS.ca}`, { timeout: 10000 });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.pairs || !data.pairs[0]) return null;
    return {
      price: parseFloat(data.pairs[0].priceUsd),
      priceChange: data.pairs[0].priceChange || {}
    };
  } catch (e) {
    return null;
  }
}

// Execute sell
async function executeSell(percent) {
  try {
    console.log(`   🔄 Selling ${percent}%...`);
    // Sell implementation here
    return { success: false }; // Placeholder
  } catch (e) {
    console.error(`   ❌ Sell error: ${e.message}`);
    return { success: false };
  }
}

// Main monitor
async function monitor() {
  try {
    const data = await getPrice();
    if (!data) {
      console.log(`   ⏭️ API error, retry in ${currentInterval/1000}s`);
      return;
    }
    
    const { price, priceChange } = data;
    const pnl = ((price - POS.entry) / POS.entry) * 100;
    
    // Track price history for volatility
    priceHistory.push({ price, time: Date.now() });
    if (priceHistory.length > 10) priceHistory.shift();
    
    // Calculate volatility
    const drops = {
      m5: priceChange?.m5 || 0,
      h1: priceChange?.h1 || 0
    };
    
    const volCat = getVolatilityCategory(drops);
    
    // Adjust interval if changed
    if (volCat.name !== lastVolCategory) {
      console.log(`\n⚡ VOLATILITY: ${lastVolCategory} → ${volCat.name}`);
      console.log(`   Interval: ${currentInterval/1000}s → ${volCat.ms/1000}s`);
      console.log(`   M5: ${drops.m5?.toFixed(2)}% | H1: ${drops.h1?.toFixed(2)}%`);
      
      currentInterval = volCat.ms;
      lastVolCategory = volCat.name;
      
      // Restart timer
      if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = setInterval(monitor, currentInterval);
      }
      
      await notify(`⚡ *${SYMBOL}: ${volCat.name}*\nInterval: ${volCat.ms/1000}s\nM5: ${drops.m5?.toFixed(1)}%`);
    }
    
    console.log(`${new Date().toLocaleTimeString()} | ${SYMBOL} [${volCat.name}]`);
    console.log(`   Price: $${price.toFixed(8)} | PnL: ${pnl.toFixed(2)}%`);
    console.log(`   Next: ${currentInterval/1000}s | Vol: M5=${drops.m5?.toFixed(1)}% H1=${drops.h1?.toFixed(1)}%`);
    
    // Check SL/TP
    if (price <= POS.stop) {
      console.log('   🚨 SL HIT!');
      const result = await executeSell(95);
      if (result.success) {
        await notify(`🛑 *SL: ${SYMBOL}*\nPnL: ${pnl.toFixed(2)}%`);
        process.exit(0);
      }
    }
    
    if (price >= POS.tp2) {
      console.log('   ✅ TP2 HIT!');
      const result = await executeSell(95);
      if (result.success) {
        await notify(`🎉 *TP2: ${SYMBOL}*\nPnL: ${pnl.toFixed(2)}%`);
        process.exit(0);
      }
    }
    
    if (price >= POS.tp1) {
      console.log('   ✅ TP1 HIT! (50%)');
      // Partial sell logic
    }
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
}

// Start
console.log('🚀 Starting dynamic monitor...\n');
notify(`🧠 *Dynamic Monitor: ${SYMBOL}*\nAuto-adjust: 15s/30s/60s based on volatility`);

monitor();
monitorTimer = setInterval(monitor, currentInterval);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping...');
  if (monitorTimer) clearInterval(monitorTimer);
  process.exit(0);
});
