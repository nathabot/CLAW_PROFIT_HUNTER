const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}';
const connection = new Connection(RPC);

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
  symbol: 'WIF',
  ca: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  entry: 0.2296,
  stop: 0.2259264,
  tp1: 0.2378656,
  tp2: 0.2419984,
  partialExit: 0.5,
  strategyId: 'fib_500_1272',
  strategyName: 'Fib 0.500 Entry'
};

let dynamicSL = POS.stop;
let dynamicTP1 = POS.tp1;
let dynamicTP2 = POS.tp2;
let highestPrice = POS.entry;
let trailingActivated = false;

const BOT_TOKEN = '${TELEGRAM_BOT_TOKEN}';
const CHAT_ID = '-1003212463774';
const TOPIC_ID = 24;

async function notify(msg) {
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
  // Timeout after 30 seconds
  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => {
      console.log('  ⚠️ SELL TIMEOUT - Retry with fallback...');
      resolve({ success: false, error: 'Timeout' });
    }, 30000);
    
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
      clearTimeout(timeout);
    } catch (e) {
      clearTimeout(timeout);
      resolve({ success: false, error: e.message });
    }
  });
}

function markPositionExited(exitPrice, pnlPercent, exitType, txHash) {
  try {
    const positionsFile = '/root/trading-bot/positions.json';
    if (!fs.existsSync(positionsFile)) return;
    
    const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
    const posIndex = positions.findIndex(p => p.ca === POS.ca && !p.exited);
    
    if (posIndex >= 0) {
      positions[posIndex].exited = true;
      positions[posIndex].exitPrice = exitPrice;
      positions[posIndex].exitTime = Date.now();
      positions[posIndex].pnlPercent = pnlPercent;
      positions[posIndex].exitType = exitType;
      positions[posIndex].exitTxHash = txHash;
      fs.writeFileSync(positionsFile, JSON.stringify(positions, null, 2));
      console.log(`💾 Position marked as exited: ${exitType}`);
    }
  } catch (e) { console.error('Mark exited error:', e.message); }
}

let partialExited = false;
const startTime = Date.now();
const MAX_HOLD_MS = 360 * 60 * 1000; // 6 HOURS

async function monitor() {
  console.log('📊 Monitoring WIF (6 HOURS MAX HOLD)...');
  console.log(`  Entry: $${POS.entry.toFixed(8)}`);
  console.log(`  SL: $${POS.stop.toFixed(8)}`);
  console.log(`  TP1: $${POS.tp1.toFixed(8)}`);
  console.log(`  TP2: $${POS.tp2.toFixed(8)}`);
  console.log(`  Max Hold: 6 HOURS`);
  
  while (true) {
    const price = await getPrice();
    
    const elapsedMs = Date.now() - startTime;
    const pnl = ((price / POS.entry) - 1) * 100;
    
    if (price > highestPrice) highestPrice = price;
    
    // TRAILING STOP
    if (pnl >= 5 && !trailingActivated) {
      trailingActivated = true;
      console.log('🎯 Trailing stop ACTIVATED at +5%');
    }
    
    if (trailingActivated) {
      const newSL = highestPrice * 0.95;
      if (newSL > dynamicSL) {
        dynamicSL = newSL;
        console.log(`🔄 Trailing SL raised to: $${dynamicSL.toFixed(8)}`);
      }
    }
    
    const time = new Date().toLocaleTimeString();
    const hoursLeft = Math.floor((MAX_HOLD_MS - elapsedMs) / 3600000);
    const minsLeft = Math.floor(((MAX_HOLD_MS - elapsedMs) % 3600000) / 60000);
    console.log(`${time} | WIF: $${price.toFixed(8)} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Hold: ${hoursLeft}h ${minsLeft}m left`);
    
    // MAX HOLD 6 HOURS
    if (elapsedMs > MAX_HOLD_MS) {
      console.log('⏰ MAX HOLD 6 HOURS REACHED - Force exit...');
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        markPositionExited(price, pnl, 'MAX_HOLD_6H', sellResult.signature);
        await notify(`⏰ **MAX HOLD 6H EXIT**\n\nWIF: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n\nMax hold 6 hours reached\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
      }
      process.exit(0);
    }
    
    // STOP LOSS
    if (price <= dynamicSL) {
      console.log(`🛑 SL HIT - Executing sell...`);
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        markPositionExited(price, pnl, trailingActivated ? 'TRAILING_STOP' : 'STOP_LOSS', sellResult.signature);
        await notify(`🛑 **${trailingActivated ? 'TRAILING' : 'STOP LOSS'} EXECUTED**\n\nWIF: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
      }
      process.exit(0);
    }
    
    // TP1
    if (!partialExited && price >= dynamicTP1) {
      console.log(`🎯 TP1 HIT - Exiting 50%...`);
      const sellResult = await executeSell('50%');
      partialExited = true;
      if (sellResult.success) {
        await notify(`🎯 **TP1 EXECUTED**\n\nWIF: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        dynamicTP2 = Math.max(dynamicTP2, price * 1.02);
      }
    }
    
    // TP2
    if (price >= dynamicTP2) {
      console.log(`🎯 TP2 HIT - FINAL EXIT...`);
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        markPositionExited(price, pnl, 'TAKE_PROFIT_2', sellResult.signature);
        await notify(`🎯 **TP2 EXECUTED**\n\nWIF: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n✅ Trade complete!\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
      }
      process.exit(0);
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
}

monitor();
