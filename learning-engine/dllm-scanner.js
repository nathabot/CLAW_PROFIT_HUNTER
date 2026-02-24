/**
 * DLMM Scanner - Find best Meteora DLMM opportunities
 * 
 * Scans for:
 * - High yield pairs
 * - Stable pairs (SOL/USDC)
 * - Active trading volume
 * - Good fee tiers
 */

const axios = require('axios');

const METEORA_API = 'https://api.meteora.ag';

class DLLMScanner {
  constructor() {
    this.pools = [];
  }

  async scanPools() {
    try {
      const response = await axios.get(`${METEORA_API}/pools`, {
        timeout: 10000
      });
      
      this.pools = response.data;
      return this.analyzePools();
    } catch (e) {
      console.log('[DLMM] Error scanning pools:', e.message);
      return [];
    }
  }

  analyzePools() {
    // Filter for good opportunities
    const opportunities = this.pools
      .filter(p => {
        // Filter criteria
        const hasVolume = p.volume_24h > 100000;
        const hasLiquidity = p.liquidity > 50000;
        const isStable = this.isStablePair(p);
        
        return (hasVolume || hasLiquidity) && !isStable;
      })
      .map(p => ({
        type: 'dlmm',
        name: `${p.token_a_symbol}/${p.token_b_symbol}`,
        address: p.address,
        fee_tier: p.fee_tier,
        liquidity: p.liquidity,
        volume_24h: p.volume_24h,
        apy: this.calculateAPY(p),
        pair_type: this.isStablePair(p) ? 'stable' : 'volatile',
        score: this.scorePool(p)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return opportunities;
  }

  isStablePair(pool) {
    const stableTokens = ['USDC', 'USDT', 'DAI', 'USDH'];
    return stableTokens.includes(pool.token_a_symbol) || 
           stableTokens.includes(pool.token_b_symbol);
  }

  calculateAPY(pool) {
    // Rough APY calculation based on volume and fee tier
    const dailyVolume = pool.volume_24h || 0;
    const feeTier = pool.fee_tier || 0.0025;
    const liquidity = pool.liquidity || 1;
    
    const dailyFees = dailyVolume * feeTier;
    const apy = (dailyFees * 365 / liquidity) * 100;
    
    return Math.min(apy, 1000); // Cap at 1000%
  }

  scorePool(pool) {
    let score = 0;
    
    // Volume score (0-40)
    const volume = pool.volume_24h || 0;
    if (volume > 1000000) score += 40;
    else if (volume > 500000) score += 30;
    else if (volume > 100000) score += 20;
    else score += 10;
    
    // Liquidity score (0-30)
    const liq = pool.liquidity || 0;
    if (liq > 1000000) score += 30;
    else if (liq > 500000) score += 20;
    else if (liq > 100000) score += 10;
    
    // Fee tier score (0-20)
    const fee = pool.fee_tier || 0.0025;
    if (fee > 0.01) score += 20;
    else if (fee > 0.005) score += 15;
    else score += 10;
    
    // Stable pair bonus (0-10)
    if (this.isStablePair(pool)) score += 10;
    
    return score;
  }

  async getPositionRecommendation(poolAddress) {
    // Get current price and suggest range
    try {
      const pool = this.pools.find(p => p.address === poolAddress);
      if (!pool) return null;
      
      const currentPrice = pool.price;
      const volatility = pool.volume_24h / pool.liquidity;
      
      // Suggest range based on volatility
      const rangePercent = Math.min(volatility * 100, 20);
      
      return {
        pool: pool.name,
        currentPrice,
        suggestedLower: currentPrice * (1 - rangePercent/100),
        suggestedUpper: currentPrice * (1 + rangePercent/100),
        estimatedAPY: this.calculateAPY(pool)
      };
    } catch (e) {
      return null;
    }
  }
}

module.exports = { DLLMScanner };

// CLI mode
if (require.main === module) {
  const scanner = new DLLMScanner();
  
  (async () => {
    console.log('=== Scanning DLMM Pools ===');
    const pools = await scanner.scanPools();
    console.log(`Found ${pools.length} opportunities:\n`);
    
    pools.forEach((p, i) => {
      console.log(`${i+1}. ${p.name}`);
      console.log(`   APY: ${p.apy.toFixed(1)}% | Liquidity: $${p.liquidity.toFixed(0)}`);
      console.log(`   Volume 24h: $${p.volume_24h.toFixed(0)} | Score: ${p.score}/100`);
      console.log('');
    });
  })();
}
