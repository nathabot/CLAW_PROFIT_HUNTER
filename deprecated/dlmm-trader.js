#!/usr/bin/env node
// Meteora DLMM One-Sided Trader
// Strategy: 80% Bid/Ask, 20% Spot, Target 50% total return

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');

const CONFIG = {
  WALLET_PATH: '/root/trading-bot/wallet.json',
  RPC_URL: 'https://api.mainnet-beta.solana.com',
  TELEGRAM_BOT: '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  TELEGRAM_CHAT: '-1003212463774',
  TOPIC_TRADES: '24',
  
  // DLMM Config
  TARGET_PROFIT: 50,      // 50% total return (fees + price)
  ALLOCATION: {
    BID_ASK: 0.8,         // 80% ke range
    SPOT: 0.2             // 20% ke spot price
  },
  MIN_APR: 20,            // Minimum 20% APR
  CHECK_INTERVAL: 60000   // Check setiap 1 menit
};

// Load wallet
const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
const bs58 = require('bs58');
const decode = bs58.decode || bs58.default?.decode;
const keypair = Keypair.fromSecretKey(decode(walletData.privateKey));

const connection = new Connection(CONFIG.RPC_URL, 'confirmed');

// DLMM Pools state
const DLMM_STATE = {
  activePosition: null,   // { pool, token, depositAmount, entryPrice, fees, startTime }
  totalDeposited: 0,
  totalFees: 0,
  entryTime: null
};

function log(message) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${message}`);
}

async function sendTelegram(message) {
  return new Promise((resolve) => {
    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT}/sendMessage`;
    const params = new URLSearchParams({
      chat_id: CONFIG.TELEGRAM_CHAT,
      text: message,
      parse_mode: 'Markdown'
    });
    exec(`curl -s -X POST "${url}" -d "${params.toString()}"`, () => resolve());
  });
}

// Cari pool DLMM dengan APR tinggi
async function scanDLMMPools() {
  log('🔍 Scanning Meteora DLMM pools...');
  
  try {
    // Meteora API untuk DLMM pools
    const response = await axios.get('https://api.meteora.ag/pools/info', {
      timeout: 15000
    });
    
    const pools = response.data?.data || [];
    
    // Filter pool dengan SOL pair + APR tinggi
    const solPools = pools.filter(p => {
      const hasSol = p.mintA === 'So11111111111111111111111111111111111111112' ||
                     p.mintB === 'So11111111111111111111111111111111111111112';
      const highApr = (p.apr || 0) >= CONFIG.MIN_APR;
      const goodTvl = (p.tvl || 0) > 100000; // $100k TVL minimum
      return hasSol && highApr && goodTvl;
    });
    
    // Sort by APR
    solPools.sort((a, b) => (b.apr || 0) - (a.apr || 0));
    
    log(`  Found ${solPools.length} SOL pools with APR > ${CONFIG.MIN_APR}%`);
    
    if (solPools.length > 0) {
      const topPool = solPools[0];
      log(`  🏆 Best: ${topPool.name} | APR: ${topPool.apr.toFixed(2)}% | TVL: $${(topPool.tvl/1000).toFixed(1)}k`);
      return topPool;
    }
    
    return null;
    
  } catch (error) {
    log(`❌ Scan error: ${error.message}`);
    return null;
  }
}

// Deposit one-sided ke DLMM (simulation for now)
async function depositDLMM(pool, amountSol) {
  log(`💰 Depositing ${amountSol} SOL to ${pool.name}`);
  log(`   Strategy: ${CONFIG.ALLOCATION.BID_ASK*100}% Bid/Ask, ${CONFIG.ALLOCATION.SPOT*100}% Spot`);
  
  // Note: Real implementation needs Meteora SDK
  // For now, simulate deposit
  
  DLMM_STATE.activePosition = {
    pool: pool.address,
    poolName: pool.name,
    token: pool.mintA === 'So11111111111111111111111111111111111111112' ? pool.mintB : pool.mintA,
    depositAmount: amountSol,
    entryPrice: pool.price || 0,
    fees: 0,
    startTime: Date.now(),
    allocation: CONFIG.ALLOCATION
  };
  DLMM_STATE.totalDeposited = amountSol;
  DLMM_STATE.entryTime = Date.now();
  
  // Report
  const msg = `🎯 **DLMM POSITION OPENED**\n\n` +
    `Pool: **${pool.name}**\n` +
    `Deposit: ${amountSol} SOL\n` +
    `Strategy: 80% Bid/Ask, 20% Spot\n` +
    `Target: **+${CONFIG.TARGET_PROFIT}%** (fees + price)\n\n` +
    `Entry Price: $${pool.price?.toFixed(6) || 'N/A'}\n` +
    `Pool APR: ${pool.apr?.toFixed(2) || 'N/A'}%\n\n` +
    `⏰ Monitoring every ${CONFIG.CHECK_INTERVAL/1000}s`;
  
  await sendTelegram(msg);
  log(`✅ Position opened, monitoring...`);
  
  return true;
}

// Check position performance
async function checkPosition() {
  if (!DLMM_STATE.activePosition) {
    log('📭 No active DLMM position');
    return;
  }
  
  const pos = DLMM_STATE.activePosition;
  const elapsed = (Date.now() - pos.startTime) / 1000 / 60; // minutes
  
  log(`\n📊 Checking ${pos.poolName}`);
  log(`   Time: ${elapsed.toFixed(1)} minutes`);
  log(`   Entry: ${pos.depositAmount} SOL @ $${pos.entryPrice.toFixed(6)}`);
  
  // Get current price (simulate for now)
  // Real: query Meteora pool state
  const priceChange = 0; // Placeholder
  const fees = 0; // Placeholder
  
  const priceReturn = priceChange;
  const feeReturn = fees;
  const totalReturn = priceReturn + feeReturn;
  
  log(`   Price: ${priceReturn > 0 ? '+' : ''}${priceReturn.toFixed(2)}%`);
  log(`   Fees: ${feeReturn > 0 ? '+' : ''}${feeReturn.toFixed(2)}%`);
  log(`   Total: ${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
  
  // Check target
  if (totalReturn >= CONFIG.TARGET_PROFIT) {
    log(`🎯 TARGET HIT! Closing position...`);
    await closePosition(totalReturn);
  }
}

// Close position dan withdraw
async function closePosition(totalReturn) {
  const pos = DLMM_STATE.activePosition;
  
  log(`💸 Closing ${pos.poolName} with +${totalReturn.toFixed(2)}% return`);
  
  // Calculate final amount
  const profit = pos.depositAmount * (totalReturn / 100);
  const finalAmount = pos.depositAmount + profit;
  
  // Withdraw (simulation)
  DLMM_STATE.activePosition = null;
  DLMM_STATE.totalDeposited = 0;
  
  // Report
  const msg = `✅ **DLMM POSITION CLOSED**\n\n` +
    `Pool: **${pos.poolName}**\n` +
    `Total Return: **+${totalReturn.toFixed(2)}%**\n` +
    `Profit: ${profit.toFixed(4)} SOL\n` +
    `Final: ${finalAmount.toFixed(4)} SOL\n\n` +
    `🎯 Target ${CONFIG.TARGET_PROFIT}% achieved!`;
  
  await sendTelegram(msg);
  log(`✅ Position closed!`);
}

// Main loop
async function main() {
  log('═══════════════════════════════════════════');
  log('  METEORA DLMM ONE-SIDED TRADER');
  log('  Strategy: 80/20, Target: 50%');
  log('═══════════════════════════════════════════');
  
  // Check if we have active position
  if (!DLMM_STATE.activePosition) {
    // Find pool and open position
    const pool = await scanDLMMPools();
    
    if (pool) {
      const walletBalance = await connection.getBalance(keypair.publicKey);
      const availableSol = (walletBalance / 1e9) - 0.015; // Reserve 0.015
      
      if (availableSol >= 0.2) {
        const depositAmount = 0.2; // Start with 0.2 SOL
        await depositDLMM(pool, depositAmount);
      } else {
        log(`⚠️ Insufficient balance: ${availableSol.toFixed(3)} SOL (need 0.2)`);
        await sendTelegram(`⚠️ DLMM: Balance too low (${availableSol.toFixed(3)} SOL). Need 0.2 SOL minimum.`);
      }
    }
  } else {
    // Monitor existing position
    await checkPosition();
  }
  
  log(`\n⏰ Next check in ${CONFIG.CHECK_INTERVAL/1000}s\n`);
}

// Run immediately
main().then(() => {
  // Keep running
  setInterval(main, CONFIG.CHECK_INTERVAL);
}).catch(err => {
  log(`❌ Error: ${err.message}`);
});
