#!/usr/bin/env node
// RELIABLE SELL SYSTEM - Using Jupiter API Key
const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const bs58 = require('bs58');

const CONFIG = {
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
  JUPITER_API_KEY: '538d3ebe-8bcb-40bf-813c-b058a98bc986',
  WALLET_PATH: '/root/trading-bot/wallet.json'
};

const connection = new Connection(CONFIG.RPC);

// Load wallet
const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
const decode = bs58.decode || bs58.default?.decode;
const wallet = Keypair.fromSecretKey(decode(walletData.privateKey));

async function getTokenBalance(tokenMint) {
  const accounts = await connection.getParsedTokenAccountsByOwner(
    wallet.publicKey,
    { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
  );
  
  for (const acc of accounts.value) {
    if (acc.account.data.parsed.info.mint === tokenMint) {
      return {
        amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: acc.account.data.parsed.info.tokenAmount.decimals,
        account: acc.pubkey
      };
    }
  }
  return null;
}

async function sellToken(tokenMint, symbol = 'UNKNOWN') {
  console.log(`\n🔥 SELLING ${symbol}...`);
  console.log(`Token: ${tokenMint}`);
  
  // Get balance
  const balance = await getTokenBalance(tokenMint);
  if (!balance || balance.amount === 0) {
    console.log('❌ No balance found');
    return { success: false, error: 'No balance' };
  }
  
  console.log(`Balance: ${balance.amount} tokens`);
  
  // Calculate raw amount
  const rawAmount = BigInt(Math.floor(balance.amount * Math.pow(10, balance.decimals)));
  console.log(`Raw amount: ${rawAmount.toString()}`);
  
  // Get quote with API key
  const quoteUrl = `https://api.jup.ag/v6/quote?inputMint=${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=${rawAmount.toString()}&slippageBps=2000`;
  
  console.log('Getting quote...');
  const quoteRes = await fetch(quoteUrl, {
    headers: {
      'Authorization': `Bearer ${CONFIG.JUPITER_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!quoteRes.ok) {
    const error = await quoteRes.text();
    console.log('❌ Quote failed:', error);
    return { success: false, error };
  }
  
  const quote = await quoteRes.json();
  console.log(`Expected SOL: ${(quote.outAmount / 1e9).toFixed(6)}`);
  
  // Get swap transaction
  console.log('Getting swap tx...');
  const swapRes = await fetch('https://api.jup.ag/v6/swap', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.JUPITER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: 100000 // 0.0001 SOL priority fee
    })
  });
  
  if (!swapRes.ok) {
    const error = await swapRes.text();
    console.log('❌ Swap failed:', error);
    return { success: false, error };
  }
  
  const swapData = await swapRes.json();
  
  if (!swapData.swapTransaction) {
    console.log('❌ No swap transaction');
    return { success: false, error: 'No swap tx' };
  }
  
  // Sign and send
  console.log('Signing transaction...');
  const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
  tx.sign([wallet]);
  
  console.log('Sending transaction...');
  const signature = await connection.sendTransaction(tx, {
    maxRetries: 5,
    skipPreflight: false,
    preflightCommitment: 'confirmed'
  });
  
  console.log('✅ SUCCESS!');
  console.log(`TX: ${signature}`);
  console.log(`Explorer: https://solscan.io/tx/${signature}`);
  
  return { success: true, signature, amount: quote.outAmount / 1e9 };
}

// Main
const tokenMint = process.argv[2];
const symbol = process.argv[3] || 'TOKEN';

if (!tokenMint) {
  console.log('Usage: node sell-reliable.js <TOKEN_MINT> [SYMBOL]');
  console.log('Example: node sell-reliable.js C7V47ci5u2Ak3VYb62a1obLTY74BLFxLB7d2NLKRpump AI');
  process.exit(1);
}

sellToken(tokenMint, symbol).then(result => {
  if (result.success) {
    console.log(`\n🎉 Sold ${symbol} for ${result.amount.toFixed(6)} SOL`);
    process.exit(0);
  } else {
    console.log(`\n❌ Failed to sell ${symbol}`);
    process.exit(1);
  }
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
