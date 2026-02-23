// Live Trader v4.2 - FIXED with CoinGecko fallback

const axios = require('axios');
const fs = require('fs');

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens/solana';

async function getTokens() {
  // Try Dexscreener first
  try {
    const res = await axios.get(DEXSCREENER_API, { timeout: 10000 });
    if (res.data?.pairs && res.data.pairs.length > 0) {
      console.log(`✅ Dexscreener: ${res.data.pairs.length} tokens`);
      return res.data.pairs.map(p => ({
        symbol: p.baseToken.symbol,
        address: p.baseToken.address,
        price: p.price.usd,
        liquidity: p.liquidity?.usd || 0,
        volume: p.volume?.h24 || 0,
        marketCap: p.marketCap || 0,
        change: p.priceChange?.h24 || 0
      }));
    }
  } catch (e) {
    console.log(`⚠️ Dexscreener failed: ${e.message}`);
  }
  
  // Fallback to CoinGecko
  console.log('🔄 Using CoinGecko fallback...');
  try {
    const res = await axios.get(`${COINGECKO_API}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'volume_desc',
        per_page: 50,
        page: 1,
        sparkline: false,
        platform: 'solana'
      },
      timeout: 15000
    });
    
    if (res.data && res.data.length > 0) {
      console.log(`✅ CoinGecko: ${res.data.length} tokens`);
      return res.data.map(c => ({
        symbol: c.symbol.toUpperCase(),
        address: c.id, // CoinGecko uses different IDs
        price: c.current_price,
        liquidity: 0, // Not available
        volume: c.total_volume,
        marketCap: c.market_cap,
        change: c.price_change_percentage_24h || 0
      }));
    }
  } catch (e) {
    console.log(`⚠️ CoinGecko failed: ${e.message}`);
  }
  
  return [];
}

async function scan() {
  console.log('🔍 Scanning tokens...');
  const tokens = await getTokens();
  
  if (tokens.length === 0) {
    console.log('❌ No tokens found!');
    return;
  }
  
  // Score tokens
  const scored = tokens.map(t => {
    let score = 0;
    if (t.volume > 10000) score += 2;
    if (t.marketCap > 50000) score += 2;
    if (t.change > 5) score += 3;
    if (t.liquidity > 5000) score += 2;
    if (t.change < -10) score -= 2; // Avoid dumpers
    
    return { ...t, score };
  });
  
  // Sort by score
  scored.sort((a, b) => b.score - a.score);
  
  console.log('\n🎯 Top 5 Opportunities:');
  scored.slice(0, 5).forEach((t, i) => {
    console.log(`  ${i+1}. ${t.symbol}: Score ${t.score}/10 | Vol: $${(t.volume/1000).toFixed(0)}k | 24h: ${t.change.toFixed(1)}%`);
  });
  
  return scored;
}

// Run
scan();
