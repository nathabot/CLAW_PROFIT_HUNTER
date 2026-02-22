
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=c9926a7b-57ba-47e3-8de4-5fb46fa4b9ee';
const connection = new Connection(RPC);

// Load wallet (supports both bs58 and base64 formats)
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
let wallet, secretKey;
if (walletData.secretKey) {
  secretKey = new Uint8Array(Buffer.from(walletData.secretKey, 'base64'));
  wallet = Keypair.fromSecretKey(secretKey);
} else if (walletData.privateKey) {
  const bs58mod = require('bs58');
  const bs58 = bs58mod.default || bs58mod;
  secretKey = bs58.decode(walletData.privateKey);
  wallet = Keypair.fromSecretKey(secretKey);
}
console.log('Wallet loaded: ' + wallet.publicKey.toString().slice(0, 20) + '...');

const POS = {
  symbol: 'DEADLUCKY',
  ca: 'FfyJFZN6agWSsPkXw9QNTPVHt2NY3B7rmfxr9s5wpump',
  entry: 0.0002443,
  stop: 0.00023941399999999997,
  tp1: 0.000254072,
  tp2: 0.000258958,
  partialExit: 0.5
};

const BOT_TOKEN = '${TELEGRAM_BOT_TOKEN}';
const CHAT_ID = '-1003212463774';
const TOPIC_ID = 24;

async function notify(msg) {
  if (process.env.LIVE_TRADER_NOTIFY === 'false') return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, message_thread_id: TOPIC_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {}
}

async function getPrice() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + POS.ca);
    const data = await res.json();
    return data.pairs?.[0] ? parseFloat(data.pairs[0].priceUsd) : null;
  } catch (e) { return null; }
}

async function executeSell(percent = '100%') {
  try {
    const wsol = 'So11111111111111111111111111111111111111112';
    const url = `https://swap-v2.solanatracker.io/swap?from=${POS.ca}&to=${wsol}&fromAmount=${encodeURIComponent(percent)}&slippage=30&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
    
    console.log(`  🔄 Executing sell (${percent})...`);
    
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a',
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    
    const txBuf = Buffer.from(data.txn, 'base64');
    const { VersionedTransaction } = require('@solana/web3.js');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([wallet]);
    
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 3,
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    return { success: true, signature, outputAmount: data.rate?.amountOut || 0 };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

let partialExited = false;

const startTime = Date.now();
const MAX_HOLD_MS = 15 * 60 * 1000;

// Function to mark position as exited in positions.json
function markPositionExited(symbol, exitPrice, pnlPercent, exitType, exitTx) {
  try {
    const positionsFile = '/root/trading-bot/positions.json';
    if (!fs.existsSync(positionsFile)) return;
    
    const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
    const pos = positions.find(p => p.symbol === symbol && !p.exited);
    
    if (pos) {
      pos.exited = true;
      pos.exitTime = Date.now();
      pos.exitPrice = exitPrice;
      pos.pnlPercent = pnlPercent;
      pos.exitType = exitType;
      pos.exitTxHash = exitTx;
      fs.writeFileSync(positionsFile, JSON.stringify(positions, null, 2));
      console.log('✅ Position marked as exited in positions.json');
    }
  } catch (e) {
    console.log('Error updating position:', e.message);
  }
}

async function monitor() {
  console.log('📊 Monitoring ' + POS.symbol + ' (DYNAMIC TP/SL)...');
  console.log(`  SL: $${POS.stop.toFixed(8)}`);
  console.log(`  TP1: $${POS.tp1.toFixed(8)} (${(POS.partialExit*100).toFixed(0)}% exit)`);
  console.log(`  TP2: $${POS.tp2.toFixed(8)} (final exit)`);
  console.log(`  Max Hold: 15 min`);
  
  while (true) {
    const price = await getPrice();
    
    // Check max hold time
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > MAX_HOLD_MS && price) {
      const pnl = ((price / POS.entry) - 1) * 100;
      console.log('⏰ MAX HOLD TIME REACHED - Force exit...');
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        await notify(`⏰ **MAX HOLD EXIT**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n\nMax hold 15 min reached\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        markPositionExited(POS.symbol, price, pnl, 'MAX_HOLD', sellResult.signature);
      }
      process.exit(0);
    }
    
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    const pnl = ((price / POS.entry) - 1) * 100;
    const time = new Date().toLocaleTimeString();
    const minutesLeft = Math.floor((MAX_HOLD_MS - elapsedMs) / 60000);
    console.log(`${time} | ${POS.symbol}: $${price.toFixed(8)} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Hold: ${minutesLeft}m left`);
    
    // Kill switch (honeypot detected)
    if (pnl <= -90) { 
      console.log('💀 HONEYPOT DETECTED - KILL SWITCH');
      await notify(`💀 **HONEYPOT DETECTED**\n\n${POS.symbol}: PnL -${Math.abs(pnl).toFixed(2)}%\n\nPosition abandoned.`);
      markPositionExited(POS.symbol, price, pnl, 'HONEYPOT', 'none');
      process.exit(0);
    }
    
    // Stop loss - EXECUTE SELL
    if (price <= POS.stop) {
      console.log('🛑 STOP LOSS HIT - Executing sell...');
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        await notify(`🛑 **STOP LOSS EXECUTED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        markPositionExited(POS.symbol, price, pnl, 'STOP_LOSS', sellResult.signature);
      } else {
        await notify(`🛑 **STOP LOSS HIT**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n\n❌ Sell failed: ${sellResult.error}\n⚠️ Manual exit required!`);
      }
      process.exit(0);
    }
    
    // Take profit 1 (partial exit) - EXECUTE SELL
    if (!partialExited && price >= POS.tp1) {
      console.log(`🎯 TP1 HIT - Exiting ${(POS.partialExit*100).toFixed(0)}%...`);
      const sellResult = await executeSell('50%');
      partialExited = true;
      if (sellResult.success) {
        await notify(`🎯 **TP1 EXECUTED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n\nExited 50%\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}\n\nHolding 50% for TP2...`);
      } else {
        await notify(`🎯 **TP1 REACHED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n\n❌ Sell failed: ${sellResult.error}\n⚠️ Manual exit required!`);
      }
    }
    
    // Take profit 2 (final exit) - EXECUTE SELL
    if (price >= POS.tp2) {
      console.log('🎯 TP2 HIT - FINAL EXIT - Executing sell...');
      const sellResult = await executeSell(partialExited ? '95%' : '95%');
      if (sellResult.success) {
        await notify(`🎯 **TP2 EXECUTED - FINAL EXIT**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n\n✅ Trade complete!\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        markPositionExited(POS.symbol, price, pnl, 'TAKE_PROFIT', sellResult.signature);
      } else {
        await notify(`🎯 **TP2 REACHED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n\n❌ Sell failed: ${sellResult.error}\n⚠️ Manual exit required!`);
      }
      process.exit(0);
    }
    
    await new Promise(r => setTimeout(r, 5000)); // 5s check
  }
}

monitor();
