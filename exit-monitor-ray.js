const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC);

const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
let wallet;
if (walletData.secretKey) {
  wallet = Keypair.fromSecretKey(new Uint8Array(Buffer.from(walletData.secretKey, 'base64')));
} else if (walletData.privateKey) {
  const bs58 = require('bs58');
  wallet = Keypair.fromSecretKey(bs58.decode(walletData.privateKey));
}
console.log('Wallet loaded: ' + wallet.publicKey.toString().slice(0, 20) + '...');

const POS = {
  symbol: 'RAY',
  ca: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  entry: 0.6258,
  stop: 0.588,
  tp1: 0.643,
  tp2: 0.665,
  partialExit: 0.5
};

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
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
  // Try QuickNode first
  try {
    const inputMint = POS.ca;
    const outputMint = 'So11111111111111111111111111111111111111112';
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey(POS.ca) });
    if (!tokenAccounts.value || tokenAccounts.value.length === 0) return { success: false, error: 'No balance' };
    const tokenBalance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
    const sellAmount = Math.floor(parseInt(tokenBalance) * (percent === '50' ? 0.5 : 0.95));
    const quoteUrl = `https://public.jupiterapi.com/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${sellAmount}&slippage=30`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) throw new Error('Quote failed');
    const quoteData = await quoteRes.json();
    if (!quoteData.swapTransaction) throw new Error('No tx');
    const swapRes = await fetch('https://public.jupiterapi.com/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swapTransaction: quoteData.swapTransaction, wallet: wallet.publicKey.toString(), prioritizationFeeLamports: 'auto' })
    });
    if (!swapRes.ok) throw new Error('Swap failed');
    const swapData = await swapRes.json();
    const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const { VersionedTransaction } = require('@solana/web3.js');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([wallet]);
    const signature = await connection.sendTransaction(transaction, { maxRetries: 3, preflightCommitment: 'confirmed' });
    await connection.confirmTransaction(signature, 'confirmed');
    console.log('✅ QuickNode sell SUCCESS');
    return { success: true, signature };
  } catch (e) {
    console.log('⚠️ QuickNode failed:', e.message);
    // Fallback to SolanaTracker
    try {
      const wsol = 'So11111111111111111111111111111111111111112';
      const url = `https://swap-v2.solanatracker.io/swap?from=${POS.ca}&to=${wsol}&fromAmount=${encodeURIComponent(percent)}&slippage=30&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a', 'Accept': 'application/json' } });
      const data = await res.json();
      if (data.error) return { success: false, error: data.error };
      const txBuf = Buffer.from(data.txn, 'base64');
      const { VersionedTransaction } = require('@solana/web3.js');
      const transaction = VersionedTransaction.deserialize(txBuf);
      transaction.sign([wallet]);
      const signature = await connection.sendTransaction(transaction, { maxRetries: 3, preflightCommitment: 'confirmed' });
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('✅ SolanaTracker sell SUCCESS (fallback)');
      return { success: true, signature };
    } catch (e2) { return { success: false, error: e2.message }; }
  }
}

let partialExited = false;
const startTime = Date.now();
const MAX_HOLD_MS = 180 * 60 * 1000; // 3 HOURS

async function monitor() {
  console.log('📊 Monitoring RAY (DYNAMIC TP/SL)...');
  console.log('  SL: $' + POS.stop.toFixed(8));
  console.log('  TP1: $' + POS.tp1.toFixed(8) + ' (50% exit)');
  console.log('  TP2: $' + POS.tp2.toFixed(8) + ' (final exit)');
  console.log('  Max Hold: 180 min (3 hours)');
  
  while (true) {
    const price = await getPrice();
    const elapsedMs = Date.now() - startTime;
    
    // MAX HOLD - 3 HOURS
    if (elapsedMs > MAX_HOLD_MS && price) {
      const pnl = ((price / POS.entry) - 1) * 100;
      console.log('⏰ MAX HOLD 3H REACHED - Force exit...');
      const sellResult = await executeSell('95');
      if (sellResult.success) {
        await notify('⏰ **MAX HOLD EXIT (3H)**\n\nRAY: $' + price.toFixed(8) + '\nPnL: ' + pnl.toFixed(2) + '%\n\n🔗 Tx: https://solscan.io/tx/' + sellResult.signature);
      }
      process.exit(0);
    }
    
    if (!price) { await new Promise(r => setTimeout(r, 5000)); continue; }
    
    const pnl = ((price / POS.entry) - 1) * 100;
    const time = new Date().toLocaleTimeString();
    const minutesLeft = Math.floor((MAX_HOLD_MS - elapsedMs) / 60000);
    console.log(time + ' | RAY: $' + price.toFixed(8) + ' | PnL: ' + (pnl > 0 ? '+' : '') + pnl.toFixed(2) + '% | Hold: ' + minutesLeft + 'm left');
    
    // Kill switch
    if (pnl <= -90) { 
      console.log('💀 HONEYPOT DETECTED');
      process.exit(0);
    }
    
    // Stop loss
    if (price <= POS.stop) {
      console.log('🛑 STOP LOSS HIT');
      const sellResult = await executeSell('95');
      if (sellResult.success) await notify('🛑 **SL EXIT**\n\nRAY: $' + price.toFixed(8) + '\nPnL: ' + pnl.toFixed(2) + '%\n\n🔗 Tx: https://solscan.io/tx/' + sellResult.signature);
      process.exit(0);
    }
    
    // TP1 - Partial Exit
    if (price >= POS.tp1 && !partialExited) {
      console.log('🎯 TP1 HIT - Partial Exit 50%...');
      partialExited = true;
      const sellResult = await executeSell('50');
      if (sellResult.success) await notify('🎯 **TP1 - PARTIAL EXIT 50%**\n\nRAY: $' + price.toFixed(8) + '\nPnL: +' + pnl.toFixed(2) + '%\n\n🔗 Tx: https://solscan.io/tx/' + sellResult.signature);
    }
    
    // TP2 - Final Exit
    if (price >= POS.tp2) {
      console.log('🎯 TP2 HIT - FINAL EXIT');
      const sellResult = await executeSell('95');
      if (sellResult.success) await notify('🎯 **TP2 FINAL EXIT**\n\nRAY: $' + price.toFixed(8) + '\nPnL: +' + pnl.toFixed(2) + '%\n\n🔗 Tx: https://solscan.io/tx/' + sellResult.signature);
      process.exit(0);
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
}

monitor();
