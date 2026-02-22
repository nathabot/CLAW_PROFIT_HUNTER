const fetch = require('node-fetch');
const fs = require('fs');

const RPC = 'https://mainnet.helius-rpc.com/?api-key=c9926a7b-57ba-47e3-8de4-5fb46fa4b9ee';

async function fetchTokenData() {
  console.log('Fetching established tokens from DexScreener...');
  
  // Use multiple sources
  const sources = [
    'https://api.dexscreener.com/token-list/solana/tokens?minLiquidity=25000',
  ];
  
  let allTokens = [];
  
  try {
    const res = await fetch(sources[0], { 
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });
    const data = await res.json();
    
    if (data.tokens) {
      console.log('Found ' + data.tokens.length + ' tokens');
      
      // Filter: liquidity >= $25k, age >= 24h
      const now = Date.now();
      const filtered = data.tokens.filter(t => {
        const liq = t.liquidityUsd || 0;
        const ageMs = now - (t.pairCreatedAt || 0);
        const ageHours = ageMs / (1000 * 60 * 60);
        return liq >= 25000 && ageHours >= 24;
      });
      
      console.log('Filtered: ' + filtered.length + ' tokens with $25k+ liq & 24h+ age');
      
      // Save
      fs.writeFileSync('established-tokens.json', JSON.stringify(filtered, null, 2));
      console.log('Saved to established-tokens.json');
      
      return filtered;
    }
  } catch(e) {
    console.error('Error: ' + e.message);
  }
  
  return [];
}

fetchTokenData();
