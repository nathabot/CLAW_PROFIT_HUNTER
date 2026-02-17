const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const fetch = require('node-fetch');

const WALLET = new PublicKey('EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX');
const TOKEN_CA = 'C7V47ci5u2Ak3VYb62a1obLTY74BLFxLB7d2NLKRpump';

async function emergencySell() {
  console.log('🚨 EMERGENCY SELL AI TOKEN');
  console.log('Token:', TOKEN_CA);
  console.log('Wallet:', WALLET.toString());
  
  try {
    // Get Jupiter quote for selling token to SOL
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${TOKEN_CA}&outputMint=So11111111111111111111111111111111111111112&amount=1000000000&slippageBps=200`;
    
    console.log('Getting Jupiter quote...');
    const response = await fetch(quoteUrl);
    const quote = await response.json();
    
    if (quote.error) {
      console.log('❌ Quote error:', quote.error);
      return;
    }
    
    console.log('Quote received:', JSON.stringify(quote, null, 2).substring(0, 500));
    console.log('⚠️ Manual action required: Execute swap via Jupiter UI');
    console.log('URL: https://jup.ag/swap/' + TOKEN_CA + '-SOL');
    
  } catch (e) {
    console.log('❌ Error:', e.message);
    console.log('Manual sell: https://jup.ag/swap/' + TOKEN_CA + '-SOL');
  }
}

emergencySell();
