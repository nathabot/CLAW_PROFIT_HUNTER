/**
 * EXIT MONITOR - LIEPARD
 * Monitors position and exits at TP/SL
 */

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const fetch = require('node-fetch');

// Config
const TOKEN_CA = '9H6bJZEngC8wqdaYCbPB8JiTPXXQ45cAjBbRweXwpump';
const TOKEN_SYMBOL = 'LIEPARD';
const BUY_AMOUNT_SOL = 0.003;
const BUY_TOKENS = 106216;
const TP1 = 0.30;
const TP2 = 0.50;
const SL = -0.15;
const CHECK_INTERVAL_MS = 30000;

// Load wallet
const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
const secretBuffer = Buffer.from(walletData.secretKey, 'base64');
const wallet = Keypair.fromSecretKey(secretBuffer);
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const SOLANA_TRACKER_API_KEY = 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a';

let positionOpen = true;
let soldHalf = false;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function getTokenPrice() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_CA}`);
    const data = await res.json();
    if (data.pairs && data.pairs[0]) {
      return parseFloat(data.pairs[0].priceUsd);
    }
  } catch (e) {
    log('Price API error:', e.message);
  }
  return null;
}

async function getTokenBalance() {
  try {
    const tokenMint = new PublicKey(TOKEN_CA);
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: tokenMint });
    if (accounts.value.length > 0) {
      return parseFloat(accounts.value[0].account.data.parsed.info.tokenAmount.amount) / 1e6;
    }
  } catch (e) {
    log('Balance error:', e.message);
  }
  return 0;
}

async function executeSell(percent) {
  try {
    const balance = await getTokenBalance();
    if (balance === 0) {
      log('No balance!');
      return { success: false };
    }
    
    const sellAmount = percent === '100%' ? balance : Math.floor(balance * 0.5 * 1e6) / 1e6;
    
    log(`Selling ${sellAmount.toFixed(2)} ${TOKEN_SYMBOL} (${percent})...`);
    
    const url = `https://swap-v2.solanatracker.io/swap?from=${TOKEN_CA}&to=So11111111111111111111111111111111111111112&fromAmount=${sellAmount}&slippage=30&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SOLANA_TRACKER_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    if (data.error) {
      log('Swap error:', data.error);
      return { success: false };
    }
    
    const txBuf = Buffer.from(data.txn, 'base64');
    const { VersionedTransaction } = require('@solana/web3.js');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([wallet]);
    
    const sig = await connection.sendTransaction(transaction);
    log(`SOLD! TX: https://solscan.io/tx/${sig}`);
    
    return { success: true, signature: sig };
  } catch (e) {
    log('Sell error:', e.message);
    return { success: false };
  }
}

async function monitor() {
  log(`=== MONITORING ${TOKEN_SYMBOL} ===`);
  log(`Buy: ${BUY_AMOUNT_SOL} SOL → ${BUY_TOKENS} tokens`);
  log(`TP1: +${TP1*100}% | TP2: +${TP2*100}% | SL: ${SL*100}%`);
  
  while (positionOpen) {
    try {
      const price = await getTokenPrice();
      if (!price) {
        log('Waiting for price...');
        await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
        continue;
      }
      
      const currentValueSol = price * BUY_TOKENS;
      const pnl = (currentValueSol - BUY_AMOUNT_SOL) / BUY_AMOUNT_SOL;
      const pnlPercent = (pnl * 100).toFixed(2);
      
      log(`Price: $${price.toFixed(6)} | Value: ${currentValueSol.toFixed(6)} SOL | PnL: ${pnlPercent}%`);
      
      if (!soldHalf && pnl >= TP1) {
        log(`🎯 TP1 HIT +${TP1*100}%! Selling 50%...`);
        await executeSell('50%');
        soldHalf = true;
      }
      
      if (pnl >= TP2) {
        log(`🎯 TP2 HIT +${TP2*100}%! Selling all...`);
        await executeSell('100%');
        positionOpen = false;
        log('💰 CLOSED - PROFIT!');
        break;
      }
      
      if (pnl <= SL) {
        log(`🛑 SL HIT ${SL*100}%! Selling all...`);
        await executeSell('100%');
        positionOpen = false;
        log('❌ CLOSED - STOP LOSS');
        break;
      }
      
    } catch (e) {
      log('Error:', e.message);
    }
    
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
  }
}

monitor();
