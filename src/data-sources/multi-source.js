/**
 * Multi-Source Data Aggregator v2
 * Combines: CoinGlass, Jupiter, Solana Programs
 */

const axios = require('axios');

const SOURCES = {
  coingecko: 'https://api.coingecko.com/api/v3',
  jupiter: 'https://token.jup.ag',
  coinglass: 'https://fapi.coinglass.com/api',
  birdeye: 'https://api.birdeye.so/public'
};

// Cache
let cache = {
  fearGreed: null,
  liquidations: null,
  trending: null,
  timestamp: null
};

const CACHE_TTL = 60000;

async function getFearGreed() {
  if (cache.fearGreed && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL)) {
    return cache.fearGreed;
  }
  
  try {
    const response = await axios.get(`${SOURCES.coinglass}/fng`, {
      params: { type: '4h' },
      timeout: 5000
    });
    cache.fearGreed = response.data.data?.fng?.value || 50;
    cache.timestamp = Date.now();
    return cache.fearGreed;
  } catch (e) {
    try {
      const alt = await axios.get('https://api.alternative.me/fng/', { timeout: 5000 });
      cache.fearGreed = parseInt(alt.data?.data?.[0]?.value || 50);
      cache.timestamp = Date.now();
      return cache.fearGreed;
    } catch (e2) {
      return cache.fearGreed || 50;
    }
  }
}

async function getLiquidations() {
  try {
    const response = await axios.get(`${SOURCES.coinglass}/futures/liquidation`, {
      params: { interval: '1h' },
      timeout: 5000
    });
    return response.data.data || [];
  } catch (e) {
    return [];
  }
}

async function getTrendingTokens(limit = 10) {
  try {
    // Try Birdeye (free tier)
    const response = await axios.get(`${SOURCES.birdeye}/trending`, {
      params: { type: 'volume', chain: 'solana', limit },
      headers: { 'x-birdeye-api-key': 'demo' },
      timeout: 5000
    });
    
    if (response.data?.data?.tokens) {
      return response.data.data.tokens.map(t => ({
        symbol: t.symbol || t.address?.slice(0, 8),
        address: t.address,
        price: t.price,
        priceChange: t.price_change_24h,
        volume: t.volume_24h,
        liquidity: t.liquidity,
        rank: t.rank
      }));
    }
  } catch (e) {
    // Fallback: Use known pump.fun tokens
    console.log('[DataSources] Birdeye failed, using fallback...');
  }
  
  // Fallback: Return hardcoded popular tokens
  return [
    { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', priceChange: 0, volume: 0 },
    { symbol: 'BONK', address: 'DezXAZ8z7PnrnzjzKi24rVJpJ7vZ9sYwtC2ggYh5v2a', priceChange: 0, volume: 0 },
    { symbol: 'WIF', address: '85VBFQZC9TZkfaptBWqv14ALD9fJNUKtWA41kh69teRP', priceChange: 0, volume: 0 },
    { symbol: 'POPCAT', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', priceChange: 0, volume: 0 }
  ];
}

async function getTokenData(address) {
  try {
    const response = await axios.get(`${SOURCES.jupiter}/price`, {
      params: { ids: address },
      timeout: 5000
    });
    return response.data?.data || {};
  } catch (e) {
    return {};
  }
}

async function getMarketData() {
  try {
    const [fg, liq, trending] = await Promise.all([
      getFearGreed(),
      getLiquidations(),
      getTrendingTokens()
    ]);
    
    return {
      fearGreed: fg,
      liquidations: liq,
      trending,
      timestamp: Date.now()
    };
  } catch (e) {
    console.error('[DataSources] Error:', e.message);
    return null;
  }
}

module.exports = {
  getFearGreed,
  getLiquidations,
  getTrendingTokens,
  getTokenData,
  getMarketData
};

if (require.main === module) {
  (async () => {
    console.log('🔄 Testing data sources v2...\n');
    const data = await getMarketData();
    console.log('📊 Fear & Greed:', data.fearGreed);
    console.log('📈 Trending:', data.trending.length, 'tokens');
  })();
}
