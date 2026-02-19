const fs = require('fs');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

const WALLET_FILE = '/root/trading-bot/wallet.json';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

const positions = JSON.parse(fs.readFileSync('./positions.json', 'utf8'));
const openPositions = positions.filter(p => !p.exited);

// Unique CAs to exit
const uniqueTokens = [...new Set(openPositions.map(p => p.ca))];
console.log('Force exiting:', uniqueTokens.length, 'unique tokens');

async function getWallet() {
  const walletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
  return { publicKey: new PublicKey(walletData.address) };
}

async function getTokenBalance(mint) {
  const { publicKey } = await getWallet();
  const conn = new Connection(RPC_URL);
  
  try {
    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(publicKey, { mint: new PublicKey(mint) });
    if (tokenAccounts.value.length > 0) {
      return tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    }
  } catch (e) {
    console.log('Error getting balance:', e.message);
  }
  return 0;
}

async function jupiterSwap(inputMint, outputMint, amount) {
  try {
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippage=50`;
    const quoteRes = await axios.get(quoteUrl, { timeout: 10000 });
    const quote = quoteRes.data;
    
    if (!quote || !quote.routePlan) {
      console.log('No route found for', inputMint);
      return null;
    }
    
    console.log('Found route for', inputMint);
    return quote;
  } catch (e) {
    console.log('Swap error:', e.message);
    return null;
  }
}

async function main() {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  
  for (const ca of uniqueTokens) {
    const balance = await getTokenBalance(ca);
    if (balance > 0) {
      console.log('\n--- Exiting ' + ca + ' (Balance: ' + balance + ') ---');
      const quote = await jupiterSwap(ca, SOL_MINT, Math.floor(balance * 1000000));
      if (quote) {
        console.log('✅ Quote found');
      }
    } else {
      console.log('\n--- ' + ca + ': No balance (already sold?) ---');
    }
  }
}

main();
