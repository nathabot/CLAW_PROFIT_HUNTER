const fetch = require("node-fetch");

async function scan() {
  console.log("=== SCAN #2 ===");
  console.log("Time:", new Date().toISOString());
  
  const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
  const profiles = await res.json();
  
  let found = 0;
  for (const profile of profiles.slice(0, 20)) {
    if (profile.chainId !== "solana") continue;
    
    try {
      const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
      const data = await pairRes.json();
      
      if (!data.pairs || !data.pairs[0]) continue;
      const pair = data.pairs[0];
      
      const symbol = pair.baseToken?.symbol;
      const price = parseFloat(pair.priceUsd);
      const change1h = pair.priceChange?.h1 || 0;
      const change5m = pair.priceChange?.m5 || 0;
      const volume = pair.volume?.h24 || 0;
      
      if (["SOL", "USDC", "USDT"].includes(symbol?.toUpperCase())) continue;
      
      // STRICT pullback criteria
      if (change1h > 25 && change5m < -5 && change5m > -15 && volume > 25000) {
        found++;
        console.log(`\n🎯 SETUP #${found}: ${symbol}`);
        console.log(`   Price: $${price.toFixed(8)}`);
        console.log(`   1h: +${change1h}% | 5m: ${change5m}%`);
        console.log(`   Entry: $${price.toFixed(8)}`);
        console.log(`   Stop: $${(price*0.95).toFixed(8)}`);
        console.log(`   Target: $${(price*1.10).toFixed(8)}`);
      }
    } catch (e) {}
  }
  
  console.log(`\n✅ Found ${found} new setups`);
}

scan();
