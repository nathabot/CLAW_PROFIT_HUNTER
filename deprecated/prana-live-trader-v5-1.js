#!/usr/bin/env node
/**
 * PRANA LIVE TRADER v5.1 - STABLE BUILD
 * Architecture: Single-file, no external dependencies, robust error handling
 * 
 * CHANGES FROM v5.0:
 * - Removed all external config dependencies
 * - Added retry logic for RPC failures
 * - Simplified architecture (no systemd, no skill agent)
 * - Direct Telegram notifications
 * - Emergency exit flag support
 */

const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

// HARDCODED CONFIG - No external files
const CONFIG = {
  WALLET_ADDRESS: 'EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX',
  WALLET_PATH: '/root/trading-bot/wallet.json',
  POSITION_SIZE: 0.01,
  FEE_RESERVE: 0.015,
  MIN_SCORE: 6,
  RPC_URLS: [
    'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
    'https://api.mainnet-beta.solana.com', // Fallback
  ],
  TRACKER_API_KEY: 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a',
  TELEGRAM_BOT: '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  TELEGRAM_CHAT: '-1003212463774',
  TOPIC_ALERTS: '22',
  TOPIC_POSITIONS: '24',
  // EXIT LEVELS
  TP1: 30,
  TP2: 50,
  SL: -15,
};

// LOGGER
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync('/root/trading-bot/live-trader.log', line + '\n');
}

// TELEGRAM NOTIFY
async function notify(msg, topic = CONFIG.TOPIC_ALERTS) {
  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT,
        message_thread_id: topic,
        text: msg,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}

// GET CONNECTION (with fallback)
function getConnection() {
  for (const url of CONFIG.RPC_URLS) {
    try {
      return new Connection(url);
    } catch (e) {
      continue;
    }
  }
  throw new Error('No RPC available');
}

// LOAD WALLET
function loadWallet() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
    let secret;
    if (data.privateKey) {
      const bs58 = require('bs58');
      const decode = bs58.decode || (bs58.default && bs58.default.decode);
      secret = decode(data.privateKey);
    } else {
      secret = new Uint8Array(data);
    }
    return Keypair.fromSecretKey(secret);
  } catch (e) {
    log('FATAL: Wallet load failed: ' + e.message);
    process.exit(1);
  }
}

// GET TOKEN PRICE
async function getPrice(tokenCA, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`);
      const data = await res.json();
      if (data.pairs && data.pairs[0]) {
        return parseFloat(data.pairs[0].priceUsd);
      }
    } catch (e) {
      if (i === retries - 1) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// EXECUTE SWAP (Solana Tracker)
async function executeSwap(from, to, amount, wallet, retries = 3) {
  const url = `https://swap-v2.solanatracker.io/swap?from=${from}&to=${to}&fromAmount=${encodeURIComponent(amount)}&slippage=20&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
  
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 
          'Authorization': `Bearer ${CONFIG.TRACKER_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.txn) throw new Error('No txn data');
      
      const tx = VersionedTransaction.deserialize(Buffer.from(data.txn, 'base64'));
      tx.sign([wallet]);
      
      const conn = getConnection();
      const sig = await conn.sendTransaction(tx, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      await conn.confirmTransaction(sig, 'confirmed');
      return { success: true, signature: sig };
      
    } catch (e) {
      if (i === retries - 1) return { success: false, error: e.message };
      log(`  Retry ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// POSITIONS
function loadPositions() {
  try {
    const path = '/root/trading-bot/positions.json';
    if (!fs.existsSync(path)) return [];
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) { return []; }
}

function savePositions(positions) {
  fs.writeFileSync('/root/trading-bot/positions.json', JSON.stringify(positions, null, 2));
}

// MONITOR & EXIT
async function checkExits(wallet) {
  const positions = loadPositions();
  const open = positions.filter(p => !p.exited);
  
  if (open.length === 0) {
    log('No positions to monitor');
    return;
  }
  
  log(`Monitoring ${open.length} position(s)...`);
  
  for (const pos of open) {
    const price = await getPrice(pos.address);
    if (!price) {
      log(`⚠️ ${pos.symbol}: Cannot get price`);
      continue;
    }
    
    const pnl = ((price / pos.entryPrice) - 1) * 100;
    log(`${pos.symbol}: $${price.toFixed(10)} | PnL: ${pnl.toFixed(2)}%`);
    
    // STOP LOSS
    if (pnl <= CONFIG.SL) {
      log(`🛑 STOP LOSS: ${pos.symbol} at ${pnl.toFixed(2)}%`);
      await notify(`🛑 **STOP LOSS**\n\n${pos.symbol}: ${pnl.toFixed(2)}%`, CONFIG.TOPIC_POSITIONS);
      
      const result = await executeSwap(pos.address, 'So11111111111111111111111111111111111111112', '100%', wallet);
      
      if (result.success) {
        pos.exited = true;
        pos.exitTxid = result.signature;
        pos.exitTime = Date.now();
        log(`✅ Exit success: ${result.signature.slice(0, 20)}...`);
      } else {
        log(`❌ Exit failed: ${result.error}`);
        await notify(`❌ **EXIT FAILED**\n${pos.symbol}\n${result.error}`, CONFIG.TOPIC_ALERTS);
      }
    }
    // TP2
    else if (pnl >= CONFIG.TP2) {
      log(`🎯 TP2: ${pos.symbol} at ${pnl.toFixed(2)}%`);
      await notify(`🎯 **TP2 FINAL**\n\n${pos.symbol}: ${pnl.toFixed(2)}%`, CONFIG.TOPIC_POSITIONS);
      
      const result = await executeSwap(pos.address, 'So11111111111111111111111111111111111111112', '100%', wallet);
      
      if (result.success) {
        pos.exited = true;
        pos.exitTxid = result.signature;
        pos.exitTime = Date.now();
        log(`✅ Exit success`);
      }
    }
    // TP1 (notification only)
    else if (pnl >= CONFIG.TP1 && !pos.tp1Notified) {
      log(`🎯 TP1: ${pos.symbol} at ${pnl.toFixed(2)}%`);
      await notify(`🎯 **TP1 REACHED**\n\n${pos.symbol}: ${pnl.toFixed(2)}%`, CONFIG.TOPIC_POSITIONS);
      pos.tp1Notified = true;
    }
  }
  
  savePositions(positions);
}

// EMERGENCY EXIT
async function emergencyExit(wallet) {
  log('🚨 EMERGENCY EXIT ALL');
  const positions = loadPositions();
  
  for (const pos of positions) {
    if (pos.exited) continue;
    
    log(`Exiting ${pos.symbol}...`);
    const result = await executeSwap(pos.address, 'So11111111111111111111111111111111111111112', '100%', wallet);
    
    if (result.success) {
      pos.exited = true;
      pos.exitTxid = result.signature;
      pos.exitTime = Date.now();
      log(`✅ ${pos.symbol} exited`);
    } else {
      log(`❌ ${pos.symbol} exit failed: ${result.error}`);
    }
  }
  
  savePositions(positions);
}

// SCAN FOR ENTRIES
async function scanEntry(wallet) {
  try {
    const conn = getConnection();
    const balance = await conn.getBalance(new PublicKey(CONFIG.WALLET_ADDRESS)) / 1e9;
    log(`Balance: ${balance.toFixed(4)} SOL`);
    
    if (balance < CONFIG.POSITION_SIZE + CONFIG.FEE_RESERVE) {
      log('Insufficient balance for entry');
      return;
    }
    
    log('Scanning DexScreener...');
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await res.json();
    
    let best = null;
    for (const profile of profiles.slice(0, 15)) {
      if (!profile.tokenAddress) continue;
      
      const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
      const data = await pairRes.json();
      
      if (!data.pairs || !data.pairs[0]) continue;
      const pair = data.pairs[0];
      
      const age = (Date.now() - pair.pairCreatedAt) / (1000 * 60); // minutes
      const liq = parseFloat(pair.liquidity?.usd || 0);
      
      if (liq < 10000 || age < 20 || age > 10080) continue;
      
      const score = Math.min(10, Math.floor(liq / 50000));
      if (score >= CONFIG.MIN_SCORE) {
        if (!best || score > best.score) {
          best = {
            symbol: pair.baseToken.symbol,
            address: profile.tokenAddress,
            price: parseFloat(pair.priceUsd),
            score,
            liq
          };
        }
      }
    }
    
    if (best) {
      log(`🎯 ENTRY: ${best.symbol} | Score: ${best.score} | Liq: $${best.liq.toFixed(0)}`);
      
      const result = await executeSwap(
        'So11111111111111111111111111111111111111112',
        best.address,
        CONFIG.POSITION_SIZE,
        wallet
      );
      
      if (result.success) {
        log(`✅ Entry success: ${result.signature.slice(0, 20)}...`);
        
        const positions = loadPositions();
        positions.push({
          symbol: best.symbol,
          address: best.address,
          entryPrice: best.price,
          entryTime: Date.now(),
          size: CONFIG.POSITION_SIZE,
          txid: result.signature,
          score: best.score,
          tp1Notified: false,
          exited: false
        });
        savePositions(positions);
        
        await notify(`🎯 **NEW POSITION**\n\n${best.symbol}\nEntry: $${best.price.toFixed(10)}\nSize: ${CONFIG.POSITION_SIZE} SOL`, CONFIG.TOPIC_POSITIONS);
      } else {
        log(`❌ Entry failed: ${result.error}`);
      }
    } else {
      log('No entries found');
    }
    
  } catch (e) {
    log(`Scan error: ${e.message}`);
  }
}

// MAIN
async function main() {
  log('\n========================================');
  log('🚀 PRANA LIVE TRADER v5.1 - STABLE');
  log('========================================');
  
  const wallet = loadWallet();
  
  // Emergency exit flag
  if (fs.existsSync('/root/trading-bot/.emergency-exit')) {
    await emergencyExit(wallet);
    fs.unlinkSync('/root/trading-bot/.emergency-exit');
    return;
  }
  
  // Check exits first
  await checkExits(wallet);
  
  // Then scan for entries
  await scanEntry(wallet);
  
  log('✅ Cycle complete\n');
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
