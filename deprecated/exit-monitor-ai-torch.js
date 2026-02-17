#!/usr/bin/env node
// EXIT MANAGER - AI + torch
const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const bs58 = require('bs58');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304';
const connection = new Connection(RPC);

const POSITIONS = [
  {
    symbol: 'AI',
    ca: 'C7V47ci5u2Ak3VYb62a1obLTY74BLFxLB7d2NLKRpump',
    entryPrice: 0.000144, // Estimated
    stopPrice: 0.000140,
    targetPrice: 0.000153
  },
  {
    symbol: 'torch',
    ca: 'Rfe9sg18cPCPzpxBj6VzTomANPpDeUDc5w7RdSXpump',
    entryPrice: 0.000493, // From TX
    stopPrice: 0.000478,
    targetPrice: 0.000523
  }
];

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';

async function notify(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {}
}

async function getPrice(ca) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    const data = await res.json();
    return data.pairs?.[0] ? parseFloat(data.pairs[0].priceUsd) : null;
  } catch (e) { return null; }
}

async function sell(ca) {
  try {
    const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
    const decode = bs58.decode || bs58.default?.decode;
    const wallet = Keypair.fromSecretKey(decode(walletData.privateKey));
    
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    });
    
    for (const acc of accounts.value) {
      if (acc.account.data.parsed.info.mint === ca) {
        const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = acc.account.data.parsed.info.tokenAmount.decimals;
        const raw = BigInt(Math.floor(amount * Math.pow(10, decimals)));
        
        const quoteRes = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${ca}&outputMint=So11111111111111111111111111111111111111112&amount=${raw.toString()}&slippageBps=2000`);
        const quote = await quoteRes.json();
        if (quote.error) return null;
        
        const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.publicKey.toString(), wrapAndUnwrapSol: true })
        });
        
        const swapData = await swapRes.json();
        if (!swapData.swapTransaction) return null;
        
        const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
        tx.sign([wallet]);
        return await connection.sendTransaction(tx, { maxRetries: 3 });
      }
    }
  } catch (e) { console.error(e); return null; }
}

async function monitor() {
  console.log('Monitoring AI + torch...');
  notify('⏳ **MONITORING 2 POSITIONS**\n\nAI & torch - Auto-exit active');
  
  while (true) {
    for (const pos of POSITIONS) {
      const price = await getPrice(pos.ca);
      if (!price) continue;
      
      const pnl = ((price / pos.entryPrice) - 1) * 100;
      const time = new Date().toLocaleTimeString();
      
      console.log(`${time} | ${pos.symbol}: $${price.toFixed(8)} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}%`);
      
      // Kill switch at -90%
      if (pnl <= -90) {
        console.log(`💀 ${pos.symbol} KILL SWITCH (-90%)`);
        notify(`💀 **${pos.symbol} KILL SWITCH**\n\nPnL: ${pnl.toFixed(1)}%\n\nToken likely rugged. Manual exit required.`);
        continue;
      }
      
      if (price >= pos.targetPrice) {
        console.log(`🎯 ${pos.symbol} TAKE PROFIT!`);
        notify(`🎯 **${pos.symbol} TP HIT**\n\nPnL: +${pnl.toFixed(1)}%`);
        const tx = await sell(pos.ca);
        if (tx) notify(`✅ SOLD! TX: \`${tx}\``);
      }
      
      if (price <= pos.stopPrice) {
        console.log(`🛑 ${pos.symbol} STOP LOSS!`);
        notify(`🛑 **${pos.symbol} SL HIT**\n\nPnL: ${pnl.toFixed(1)}%`);
        const tx = await sell(pos.ca);
        if (tx) notify(`✅ SOLD! TX: \`${tx}\``);
      }
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

monitor();
