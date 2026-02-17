const fetch = require('node-fetch');

async function debug() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=solana');
    const data = await res.json();
    
    console.log('Total pairs:', data.pairs?.length || 0);
    
    if (data.pairs && data.pairs.length > 0) {
      const first = data.pairs[0];
      console.log('First pair:', first.baseToken?.symbol);
      console.log('Price change 5m:', first.priceChange?.m5);
      console.log('Volume:', first.volume?.h24);
      console.log('Liquidity:', first.liquidity?.usd);
      
      // Count passing filter
      const passing = data.pairs.filter(p => {
        const change = p.priceChange?.m5 || 0;
        const vol = p.volume?.h24 || 0;
        const liq = p.liquidity?.usd || 0;
        return vol >= 20000 && liq >= 5000 && change > 1;
      });
      console.log('Passing filter:', passing.length);
      
      // Show all pairs
      console.log('\nAll pairs:');
      data.pairs.slice(0, 10).forEach(p => {
        console.log(`- ${p.baseToken?.symbol}: ${p.priceChange?.m5}% (vol: ${p.volume?.h24})`);
      });
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
}

debug();
