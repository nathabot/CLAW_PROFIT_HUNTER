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
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4zEGGZ9safSp32';

// All 4 ATLAS positions
const POSITIONS = [
  { idx: 1, entry: 0.000202, size: 0.015, stop: 0.00019148, tp1: 0.00020925, tp2: 0.00021657, tokens: 6015.45 },
  { idx: 2, entry: 0.000192, size: 0.015, stop: 0.00018144, tp1: 0.00019968, tp2: 0.00020618, tokens: 6250 },
  { idx: 3, entry: 0.000195, size: 0.015, stop: 0.00018495, tp1: 0.00020242, tp2: 0.00020910, tokens: 6150 },
  { idx: 4, entry: 0.000198, size: 0.015, stop: 0.00018791, tp1: 0.00020516, tp2: 0.00021186, tokens: 6060 }
];

let partialExited = [false, false, false, false];

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

async function executeSell(pos, percent, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    const amountToSell = Math.floor(pos.tokens * percent);
    console.log(`   Attempting to sell ${amountToSell} ATLAS (${percent * 100}%)`);
    
    // Try Jupiter first
    let quoteUrl = `https://public.jupiterapi.com/quote?inputMint=${ATLAS_CA}&outputMint=${SOL_MINT}&amount=${amountToSell}&slippage=15`;
    let quoteRes = await fetch(quoteUrl);
    let quote = await quoteRes.json();
    
    // If no route, try with larger amount (batch if needed)
    if (!quote.routePlan && amountToSell < 10000000) {
      console.log(`   ⚠️ Low amount, trying batch with 10M minimum...`);
      quoteUrl = `https://public.jupiterapi.com/quote?inputMint=${ATLAS_CA}&outputMint=${SOL_MINT}&amount=10000000&slippage=20`;
      quoteRes = await fetch(quoteUrl);
      quote = await quoteRes.json();
    }
    
    if (!quote.routePlan) {
      console.log(`   ❌ NO ROUTE - cannot sell ${amountToSell} ATLAS`);
      // Try USDC intermediate
      console.log(`   🔄 Trying ATLAS -> USDC -> SOL route...`);
      const usdcQuoteUrl = `https://public.jupiterapi.com/quote?inputMint=${ATLAS_CA}&outputMint=${USDC_MINT}&amount=${amountToSell}&slippage=15`;
      const usdcRes = await fetch(usdcQuoteUrl);
      const usdcQuote = await usdcRes.json();
      
      if (usdcQuote.routePlan) {
        console.log(`   ✅ Found USDC route, proceeding...`);
        // Would need 2-step swap here
        return { success: false, error: 'USDC route found but not implemented' };
      }
      
      return { success: false, error: `No route for ${amountToSell} ATLAS (min: 10M)` };
    }
    
    console.log(`   📋 Got quote: ${quote.outAmount} SOL`);
    
    // Execute swap
    const swapRes = await fetch('https://public.jupiterapi.com/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toString(),
        prioritizationFeeLamports: 5000
      })
    });
    
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) {
      return { success: false, error: 'No swap transaction returned' };
    }
    
    const { VersionedTransaction } = require('@solana/web3.js');
    const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
    tx.sign([wallet]);
    
    const sig = await connection.sendTransaction(tx, { maxRetries: 3 });
    await connection.confirmTransaction(sig, 'confirmed');
    
    console.log(`   ✅ SOLD! Tx: ${sig.slice(0, 10)}...`);
    return { success: true, signature: sig };
    
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
    if (retryCount < maxRetries) {
      console.log(`   🔄 Retrying (${retryCount + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, 2000));
      return executeSell(pos, percent, retryCount + 1);
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
  console.log('🟢 ATLAS Multi-Position Monitor Started (v2 - with error handling)');
  
  while (true) {
    const price = await getPrice();
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    for (let i = 0; i < POSITIONS.length; i++) {
      const pos = POSITIONS[i];
      const pnl = ((price / pos.entry) - 1) * 100;
      const time = new Date().toLocaleTimeString();
      
      console.log(`${time} | ATLAS-${pos.idx}: $${price} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`);
      
      // Stop loss
      if (price <= pos.stop && pnl < 0 && !partialExited[i]) {
        console.log(`🛑 ATLAS-${pos.idx} STOP LOSS triggered`);
        const result = await executeSell(pos, 0.95);
        if (result.success) {
          await notify(`🛑 **SL EXIT** ATLAS-${pos.idx}: $${price} (PnL: ${pnl.toFixed(2)}%)\nTx: ${result.signature}`);
        } else {
          await notify(`🛑 **SL FAILED** ATLAS-${pos.idx}: ${result.error}`);
        }
      }
      
      // TP1 (partial exit)
      if (!partialExited[i] && price >= pos.tp1) {
        console.log(`🎯 ATLAS-${pos.idx} TP1 HIT - attempting 50% sell`);
        partialExited[i] = true;
        const result = await executeSell(pos, 0.5);
        if (result.success) {
          await notify(`🎯 **TP1** ATLAS-${pos.idx}: $${price} (+${pnl.toFixed(2)}%)\nTx: ${result.signature}`);
        } else {
          await notify(`⚠️ **TP1 FAILED** ATLAS-${pos.idx}: ${result.error}\nPrice: $${price} | Target: $${pos.tp1}`);
          partialExited[i] = false; // Reset to retry
        }
      }
      
      // TP2 (final exit) 
      if (price >= pos.tp2) {
        console.log(`🎯 ATLAS-${pos.idx} TP2 HIT - final exit`);
        const result = await executeSell(pos, 0.95);
        if (result.success) {
          await notify(`🎯 **TP2 FINAL** ATLAS-${pos.idx}: $${price} (+${pnl.toFixed(2)}%)\nTx: ${result.signature}`);
        } else {
          await notify(`⚠️ **TP2 FAILED** ATLAS-${pos.idx}: ${result.error}`);
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 15000)); // 15s check
  }
}

monitor().catch(console.error);
