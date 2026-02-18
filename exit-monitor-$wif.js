
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304';
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
  symbol: '$WIF',
  ca: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  entry: 0.2323,
  stop: 0.22858320000000001,
  tp1: 0.2406628,
  tp2: 0.2448442,
  partialExit: 0.5,
  strategyId: 'fib_786_1000',
  strategyName: 'Fib 0.786 Deep'
};

// DYNAMIC STATE
let dynamicSL = POS.stop;
let dynamicTP1 = POS.tp1;
let dynamicTP2 = POS.tp2;
let highestPrice = POS.entry;
let trailingActivated = false;

// BOK Feedback - Track live trade results
async function recordTradeResult(isWin, pnlPercent) {
  try {
    const fs = require('fs');
    const trackerFile = '/root/trading-bot/live-strategy-tracker.json';
    let tracker = {};
    
    if (fs.existsSync(trackerFile)) {
      tracker = JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
    }
    
    const sid = POS.strategyId;
    if (!tracker[sid]) {
      tracker[sid] = { id: sid, name: POS.strategyName, liveWins: 0, liveLosses: 0, liveTotal: 0, consecutiveLosses: 0 };
    }
    
    tracker[sid].liveTotal++;
    if (isWin) {
      tracker[sid].liveWins++;
      tracker[sid].consecutiveLosses = 0;
    } else {
      tracker[sid].liveLosses++;
      tracker[sid].consecutiveLosses++;
    }
    tracker[sid].lastUpdated = Date.now();
    
    fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2));
    console.log(`📊 Strategy Tracker: ${POS.strategyName} | ${isWin ? 'WIN' : 'LOSS'} | Streak: ${tracker[sid].consecutiveLosses}`);
    
    // If 3 consecutive losses, notify to move to negative
    if (tracker[sid].consecutiveLosses >= 3) {
      console.log(`⚠️  STRATEGY ALERT: ${POS.strategyName} hit 3 losses - should move to NEGATIVE`);
    }
  } catch (e) { console.error('Tracker error:', e.message); }
}

// Mark position as exited in positions.json
function markPositionExited(exitPrice, pnlPercent, exitType, txHash) {
  try {
    const fs = require('fs');
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

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
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

let partialExited = false;

const startTime = Date.now();
const MAX_HOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

async function getMarketData() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + POS.ca);
    const data = await res.json();
    const pair = data.pairs?.[0];
    if (!pair) return null;
    
    return {
      price: parseFloat(pair.priceUsd),
      volume24h: pair.volume?.h24 || 0,
      volumeChange: pair.volume?.change24h || 0,
      buyPressure: pair.txns?.h24?.buys || 0,
      sellPressure: pair.txns?.h24?.sells || 0,
      priceChange5m: pair.priceChange?.m5 || 0,
      priceChange1h: pair.priceChange?.h1 || 0
    };
  } catch (e) { return null; }
}

async function monitor() {
  console.log('📊 Monitoring ' + POS.symbol + ' (DYNAMIC TP/SL v2 - 5s interval)...');
  console.log(`  Entry: $${POS.entry.toFixed(8)}`);
  console.log(`  Initial SL: $${POS.stop.toFixed(8)}`);
  console.log(`  Initial TP1: $${POS.tp1.toFixed(8)}`);
  console.log(`  Initial TP2: $${POS.tp2.toFixed(8)}`);
  console.log(`  Max Hold: 15 min (0.3 hours)`);
  console.log(`  Trailing: ENABLED (activates at +5%)`);
  
  let lastPrice = POS.entry;
  let momentum = 'neutral';
  
  while (true) {
    const market = await getMarketData();
    if (!market) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    const price = market.price;
    const elapsedMs = Date.now() - startTime;
    const pnl = ((price / POS.entry) - 1) * 100;
    
    // Update highest price for trailing
    if (price > highestPrice) {
      highestPrice = price;
    }
    
    // === DYNAMIC SL/TP CALCULATION ===
    const buyRatio = market.buyPressure / (market.sellPressure + 1);
    const isHighMomentum = buyRatio > 2 && market.priceChange5m > 5;
    const isDumping = buyRatio < 0.5 || market.priceChange5m < -10;
    
    // TRAILING STOP (activates at +5% profit)
    if (pnl >= 5 && !trailingActivated) {
      trailingActivated = true;
      console.log('🎯 Trailing stop ACTIVATED at +5%');
    }
    
    if (trailingActivated) {
      // Move SL up to lock profits (never down)
      const newSL = highestPrice * 0.95; // 5% below highest
      if (newSL > dynamicSL) {
        dynamicSL = newSL;
        console.log(`🔄 Trailing SL raised to: $${dynamicSL.toFixed(8)}`);
      }
      
      // Adjust TP based on momentum
      if (isHighMomentum && !partialExited) {
        dynamicTP1 = Math.max(dynamicTP1, price * 1.02); // Extend TP1
        dynamicTP2 = Math.max(dynamicTP2, price * 1.05); // Extend TP2
        momentum = 'bullish 🚀';
      } else if (isDumping) {
        dynamicTP1 = Math.min(dynamicTP1, price * 1.01); // Lower TP1
        momentum = 'bearish 📉';
      } else {
        momentum = 'neutral 😐';
      }
    }
    
    // Display status
    const time = new Date().toLocaleTimeString();
    const minutesLeft = Math.floor((MAX_HOLD_MS - elapsedMs) / 60000);
    console.log(`${time} | ${POS.symbol}: $${price.toFixed(8)} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}% | Momentum: ${momentum} | SL: $${dynamicSL.toFixed(6)}`);
    
    // Check max hold time
    if (elapsedMs > MAX_HOLD_MS) {
      console.log('⏰ MAX HOLD TIME REACHED - Force exit...');
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        markPositionExited(price, pnl, 'MAX_HOLD', sellResult.signature);
        await notify(`⏰ **MAX HOLD EXIT**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n\nMax hold 15 min (0h) reached\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        await recordTradeResult(pnl > 0, pnl);
      }
      process.exit(0);
    }
    
    // Kill switch
    if (pnl <= -90) { 
      console.log('💀 HONEYPOT DETECTED');
      await notify(`💀 **HONEYPOT**\n\n${POS.symbol}: PnL -${Math.abs(pnl).toFixed(2)}%`);
      process.exit(0);
    }
    
    // DYNAMIC STOP LOSS (trailing or initial)
    if (price <= dynamicSL) {
      console.log(`🛑 SL HIT (${trailingActivated ? 'Trailing' : 'Initial'}) - Executing sell...`);
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        markPositionExited(price, pnl, trailingActivated ? 'TRAILING_STOP' : 'STOP_LOSS', sellResult.signature);
        await notify(`🛑 **${trailingActivated ? 'TRAILING' : 'STOP LOSS'} EXECUTED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: ${pnl.toFixed(2)}%\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        await recordTradeResult(pnl > 0, pnl);
      }
      process.exit(0);
    }
    
    // DYNAMIC TP1
    if (!partialExited && price >= dynamicTP1) {
      console.log(`🎯 TP1 HIT (Dynamic: $${dynamicTP1.toFixed(8)}) - Exiting 50%...`);
      const sellResult = await executeSell('50%');
      partialExited = true;
      if (sellResult.success) {
        // Mark partial exit in positions.json
        try {
          const fs = require('fs');
          const positionsFile = '/root/trading-bot/positions.json';
          if (fs.existsSync(positionsFile)) {
            const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
            const posIndex = positions.findIndex(p => p.ca === POS.ca && !p.exited);
            if (posIndex >= 0) {
              positions[posIndex].partialExited = true;
              positions[posIndex].partialExitPrice = price;
              positions[posIndex].partialExitPnl = pnl;
              positions[posIndex].partialExitTx = sellResult.signature;
              fs.writeFileSync(positionsFile, JSON.stringify(positions, null, 2));
            }
          }
        } catch (e) {}
        await notify(`🎯 **TP1 EXECUTED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n\nExited 50%\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        // Lower TP2 after partial exit (lock profits)
        dynamicTP2 = Math.max(dynamicTP2, price * 1.02);
      }
    }
    
    // DYNAMIC TP2
    if (price >= dynamicTP2) {
      console.log(`🎯 TP2 HIT (Dynamic: $${dynamicTP2.toFixed(8)}) - FINAL EXIT...`);
      const sellResult = await executeSell('95%');
      if (sellResult.success) {
        markPositionExited(price, pnl, 'TAKE_PROFIT_2', sellResult.signature);
        await notify(`🎯 **TP2 EXECUTED**\n\n${POS.symbol}: $${price.toFixed(8)}\nPnL: +${pnl.toFixed(2)}%\n✅ Trade complete!\n🔗 **Tx:** https://solscan.io/tx/${sellResult.signature}`);
        await recordTradeResult(true, pnl);
      }
      process.exit(0);
    }
    
    await new Promise(r => setTimeout(r, 5000)); // 5 second interval
  }
}

monitor();
