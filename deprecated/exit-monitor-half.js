#!/usr/bin/env node
// EXIT MANAGER - Auto TP/SL for HALF position

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');

const CONFIG = {
  WALLET: 'EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX',
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
  CHECK_INTERVAL: 30000 // 30 seconds
};

// HALF Position
const POSITION = {
  symbol: 'HALF',
  ca: 'AK6r5GzVq155toFcwNj6HqwLTdUBQB9i3Ld3zsnZpump',
  entryPrice: 0.00008072,
  stopPrice: 0.0000782984,
  targetPrice: 0.0000855632,
  position: 0.015,
  status: 'ACTIVE'
};

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';

async function notify(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {}
}

async function getCurrentPrice(ca) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    const data = await res.json();
    if (data.pairs && data.pairs[0]) {
      return parseFloat(data.pairs[0].priceUsd);
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function executeExit(type, currentPrice) {
  console.log(`\n🚨 EXIT SIGNAL: ${type}`);
  console.log(`Price: $${currentPrice}`);
  console.log(`Executing sell...`);

  notify(`🚨 **EXIT SIGNAL: ${type}**

Token: ${POSITION.symbol}
Entry: $${POSITION.entryPrice}
Current: $${currentPrice}
PnL: ${((currentPrice/POSITION.entryPrice - 1) * 100).toFixed(2)}%

⏳ Executing sell...`);

  // Execute sell via tracker-swap
  const { exec } = require('child_process');
  const swapCmd = `node tracker-swap.js sell ${POSITION.ca} 100`; // Sell 100%

  exec(swapCmd, { timeout: 120000, cwd: '/root/trading-bot' }, (error, stdout, stderr) => {
    if (error) {
      console.log('❌ Sell failed:', error.message);
      notify(`❌ **SELL FAILED**

Error: ${error.message}

⚠️ MANUAL EXIT REQUIRED!`);
      return;
    }

    const pnlPercent = ((currentPrice / POSITION.entryPrice) - 1) * 100;
    const pnlSol = POSITION.position * (pnlPercent / 100);

    console.log('✅ SELL EXECUTED!');
    console.log(stdout);

    notify(`✅ **POSITION CLOSED: ${type}**

Token: ${POSITION.symbol}
Exit Price: $${currentPrice}
PnL: ${pnlPercent.toFixed(2)}% (${pnlSol > 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL)

${type === 'TAKE PROFIT' ? '🎯 Target hit!' : '🛑 Stop loss hit'}

Trade complete.`);

    // Exit process
    process.exit(0);
  });
}

async function monitor() {
  console.log('═══════════════════════════════════════════════════');
  console.log(`  EXIT MANAGER - ${POSITION.symbol}`);
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`Entry: $${POSITION.entryPrice}`);
  console.log(`Stop: $${POSITION.stopPrice} (-3%)`);
  console.log(`Target: $${POSITION.targetPrice} (+6%)`);
  console.log(`Check interval: ${CONFIG.CHECK_INTERVAL/1000}s\n`);

  while (POSITION.status === 'ACTIVE') {
    const currentPrice = await getCurrentPrice(POSITION.ca);

    if (!currentPrice) {
      console.log('⚠️ Could not fetch price, retrying...');
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    const pnlPercent = ((currentPrice / POSITION.entryPrice) - 1) * 100;
    const pnlSol = POSITION.position * (pnlPercent / 100);
    const progressToTarget = ((currentPrice - POSITION.entryPrice) / (POSITION.targetPrice - POSITION.entryPrice)) * 100;
    const progressToStop = ((currentPrice - POSITION.entryPrice) / (POSITION.stopPrice - POSITION.entryPrice)) * 100;

    const timestamp = new Date().toLocaleTimeString();
    const emoji = pnlPercent >= 0 ? '📈' : '📉';

    console.log(`${timestamp} | ${emoji} $${currentPrice.toFixed(10)} | PnL: ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (${pnlSol > 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL)`);

    // Check TP
    if (currentPrice >= POSITION.targetPrice) {
      await executeExit('TAKE PROFIT', currentPrice);
      return;
    }

    // Check SL
    if (currentPrice <= POSITION.stopPrice) {
      await executeExit('STOP LOSS', currentPrice);
      return;
    }

    // Partial progress alerts
    if (progressToTarget >= 50 && progressToTarget < 60) {
      console.log('🎯 50% to target!');
    }
    if (progressToTarget >= 80 && progressToTarget < 90) {
      console.log('🎯 80% to target!');
    }
    if (progressToStop >= 50 && progressToStop < 60) {
      console.log('⚠️ 50% to stop loss!');
    }

    await new Promise(r => setTimeout(r, CONFIG.CHECK_INTERVAL));
  }
}

monitor().catch(console.error);
