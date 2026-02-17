#!/usr/bin/env node
// EXIT MANAGER - MONAJUICE
const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const bs58 = require('bs58');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304';
const connection = new Connection(RPC);

const POSITION = {
  symbol: 'MONAJUICE',
  ca: '6cj25n9mCL5UNVtDNyVyNkto9aYEmvFPhVtxPKkjpump',
  entryPrice: 0.00008224,
  stopPrice: 0.00007977,
  targetPrice: 0.00008717,
  position: 0.015
};

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';

async function notify(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {}
}

async function getPrice() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${POSITION.ca}`);
    const data = await res.json();
    return data.pairs?.[0] ? parseFloat(data.pairs[0].priceUsd) : null;
  } catch (e) { return null; }
}

async function sell() {
  try {
    const walletData = JSON.parse(fs.readFileSync('/root/trading-bot/wallet.json', 'utf8'));
    const decode = bs58.decode || bs58.default?.decode;
    const wallet = Keypair.fromSecretKey(decode(walletData.privateKey));
    
    const accounts = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    
    for (const acc of accounts.value) {
      if (acc.account.data.parsed.info.mint === POSITION.ca) {
        const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = acc.account.data.parsed.info.tokenAmount.decimals;
        const raw = BigInt(Math.floor(amount * Math.pow(10, decimals)));
        
        const quoteRes = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${POSITION.ca}&outputMint=So11111111111111111111111111111111111111112&amount=${raw.toString()}&slippageBps=1000`);
        const quote = await quoteRes.json();
        
        const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.publicKey.toString(), wrapAndUnwrapSol: true })
        });
        
        const swapData = await swapRes.json();
        const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
        tx.sign([wallet]);
        
        return await connection.sendTransaction(tx, { maxRetries: 3 });
      }
    }
  } catch (e) { console.error(e); return null; }
}

async function monitor() {
  console.log(`Monitoring MONAJUICE - Entry: $${POSITION.entryPrice}, Stop: $${POSITION.stopPrice}, Target: $${POSITION.targetPrice}`);
  notify(`⏳ **MONITORING MONAJUICE**\n\nEntry: $${POSITION.entryPrice}\nStop: -3% | Target: +6%\n\nAuto-exit active...`);
  
  while (true) {
    const price = await getPrice();
    if (!price) { await new Promise(r => setTimeout(r, 10000)); continue; }
    
    const pnl = ((price / POSITION.entryPrice) - 1) * 100;
    const time = new Date().toLocaleTimeString();
    console.log(`${time} | MONAJUICE: $${price.toFixed(10)} | PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`);
    
    if (price >= POSITION.targetPrice) {
      console.log('🎯 TAKE PROFIT!');
      notify(`🎯 **MONAJUICE TAKE PROFIT!**\n\nPrice: $${price}\nPnL: +${pnl.toFixed(2)}%\n\nExecuting sell...`);
      const tx = await sell();
      if (tx) {
        notify(`✅ **SOLD!** TX: \`${tx}\``);
        process.exit(0);
      }
    }
    
    if (price <= POSITION.stopPrice) {
      console.log('🛑 STOP LOSS!');
      notify(`🛑 **MONAJUICE STOP LOSS**\n\nPrice: $${price}\nPnL: ${pnl.toFixed(2)}%\n\nExecuting sell...`);
      const tx = await sell();
      if (tx) {
        notify(`✅ **SOLD!** TX: \`${tx}\``);
        process.exit(0);
      }
    }
    
    await new Promise(r => setTimeout(r, 15000));
  }
}

monitor();
