const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304';
const connection = new Connection(RPC);

// Load wallet
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
let wallet;
if (walletData.secretKey) {
  wallet = Keypair.fromSecretKey(new Uint8Array(Buffer.from(walletData.secretKey, 'base64')));
} else if (walletData.privateKey) {
  const bs58 = require('bs58').default || require('bs58');
  wallet = Keypair.fromSecretKey(bs58.decode(walletData.privateKey));
}
console.log('Wallet loaded:', wallet.publicKey.toString().slice(0, 10));

const ATLAS_CA = 'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const ATLAS_DECIMALS = 8;

// Solana Tracker API (more reliable than public Jupiter)
const SOLANA_TRACKER_API_KEY = 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a';
const SOLANA_TRACKER_BASE_URL = 'https://swap-v2.solanatracker.io';

// All 4 ATLAS positions
const POSITIONS = [
  { idx: 1, entry: 0.000202, size: 0.015, stop: 0.00019148, tp1: 0.00020925, tp2: 0.00021657, tokens: 6015.45 },
  { idx: 2, entry: 0.000192, size: 0.015, stop: 0.00018144, tp1: 0.00019968, tp2: 0.00020618, tokens: 6250 },
  { idx: 3, entry: 0.000195, size: 0.015, stop: 0.00018495, tp1: 0.00020242, tp2: 0.00020910, tokens: 6150 },
  { idx: 4, entry: 0.000198, size: 0.015, stop: 0.00018791, tp1: 0.00020516, tp2: 0.00021186, tokens: 6060 }
];

// Confirmation windows to prevent false alerts
let tp1Detected = [false, false, false, false];  // First detection
let tp1Confirmed = [false, false, false, false]; // Second detection = confirmed
let slDetected = [false, false, false, false];

function toRaw(uiAmount) {
  return Math.floor(uiAmount * Math.pow(10, ATLAS_DECIMALS));
}

async function getPrice() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + ATLAS_CA);
    const data = await res.json();
    return parseFloat(data.pairs[0].priceUsd);
  } catch (e) {
    console.log('Price fetch error:', e.message);
    return null;
  }
}

async function executeSell(pos, percent, isStopLoss = false, retryCount = 0) {
  const maxRetries = 3;
  const slippage = isStopLoss ? 50 : 30;
  
  try {
    const uiAmount = pos.tokens * percent;
    
    console.log(`   Attempting to sell ${uiAmount} ATLAS (${percent * 100}%, slippage: ${slippage}%)`);
    
    // Use Solana Tracker API (more reliable)
    const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${ATLAS_CA}&to=${SOL_MINT}&fromAmount=${encodeURIComponent(percent)}&slippage=${slippage}&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
    
    console.log(`   📋 Getting swap from Solana Tracker...`);
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SOLANA_TRACKER_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    
    if (data.error) {
      console.log(`   ❌ Solana Tracker error: ${data.error}`);
      if (retryCount < maxRetries) {
        console.log(`   🔄 Retrying (${retryCount + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 3000));
        return executeSell(pos, percent, isStopLoss, retryCount + 1);
      }
      return { success: false, error: data.error };
    }
    
    // Execute transaction
    const { blockhash } = await connection.getLatestBlockhash();
    const txBuf = Buffer.from(data.txn, 'base64');
    const { VersionedTransaction } = require('@solana/web3.js');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.message.recentBlockhash = blockhash;
    
    transaction.sign([wallet]);
    
    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 3,
      skipPreflight: false
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`   ✅ SOLD! Tx: ${signature.slice(0, 10)}...`);
    return { success: true, signature };
    
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    if (retryCount < maxRetries) {
      console.log(`   🔄 Retrying (${retryCount + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, 3000));
      return executeSell(pos, percent, isStopLoss, retryCount + 1);
    }
    return { success: false, error: e.message };
  }
}

async function notify(msg) {
  const TELEGRAM_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
  const CHAT_ID = '428798235';
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
    });
  } catch (e) {
    console.log('Telegram notify error:', e.message);
  }
}

async function monitor() {
  console.log('🟢 ATLAS Multi-Position Monitor v5 - WITH CONFIRMATION WINDOW');
  
  while (true) {
    const price = await getPrice();
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    for (let i = 0; i < POSITIONS.length; i++) {
      const pos = POSITIONS[i];
      const pnl = ((price / pos.entry) - 1) * 100;
      const time = new Date().toLocaleTimeString();
      
      console.log(`${time} | ATLAS-${pos.idx}: $${price} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`);
      
      // Stop loss - use higher slippage (30%)
      if (price <= pos.stop && pnl < 0 && !tp1Confirmed[i]) {
        console.log(`🛑 ATLAS-${pos.idx} STOP LOSS triggered (30% slippage)`);
        const result = await executeSell(pos, 1.0, true);
        if (result.success) {
          await notify(`🛑 **SL EXIT** ATLAS-${pos.idx}: $${price} (PnL: ${pnl.toFixed(2)}%)\nTx: ${result.signature}`);
          tp1Confirmed[i] = true; // Mark as exited
        } else {
          await notify(`🛑 **SL FAILED** ATLAS-${pos.idx}: ${result.error}\nPrice: $${price}`);
        }
      }
      
      // TP1 with confirmation window (2 checks)
      if (!tp1Confirmed[i] && price >= pos.tp1) {
        if (!tp1Detected[i]) {
          tp1Detected[i] = true;
          console.log(`   ⚠️ ATLAS-${pos.idx} TP1 detected - waiting confirmation (15s)...`);
        } else if (!tp1Confirmed[i]) {
          // Second detection - CONFIRM
          console.log(`   ✅ ATLAS-${pos.idx} TP1 CONFIRMED - executing...`);
          tp1Confirmed[i] = true;
          const result = await executeSell(pos, 0.5, false);
          if (result.success) {
            await notify(`🎯 **TP1** ATLAS-${pos.idx}: $${price} (+${pnl.toFixed(2)}%)\nTx: ${result.signature}`);
          } else {
            await notify(`⚠️ **TP1 FAILED** ATLAS-${pos.idx}: ${result.error}`);
            tp1Confirmed[i] = false; // Reset on failure
            tp1Detected[i] = false;
          }
        }
      } else {
        // Price dropped below TP1 - reset detection
        if (tp1Detected[i] && !tp1Confirmed[i]) {
          console.log(`   ❌ ATLAS-${pos.idx} TP1 detection reset - price dropped`);
          tp1Detected[i] = false;
        }
      }
      
      // TP2
      if (price >= pos.tp2) {
        console.log(`🎯 ATLAS-${pos.idx} TP2 HIT`);
        const result = await executeSell(pos, 1.0, false);
        if (result.success) {
          await notify(`🎯 **TP2 FINAL** ATLAS-${pos.idx}: $${price} (+${pnl.toFixed(2)}%)\nTx: ${result.signature}`);
        } else {
          await notify(`⚠️ **TP2 FAILED** ATLAS-${pos.idx}: ${result.error}`);
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 15000));
  }
}

monitor().catch(console.error);
