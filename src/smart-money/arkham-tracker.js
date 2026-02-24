/**
 * SMART MONEY TRACKER
 * Uses Arkham API to track whale wallets
 * 
 * API: https://api.arkhamintelligence.com
 * Free tier: 100 requests/day
 */

const fetch = require('node-fetch');

// Arkham public API (no auth needed for basic data)
const ARKHAM_API = 'https://api.arkhamintelligence.com';

class ArkhamTracker {
  constructor() {
    this.whaleWallets = new Map();
    this.lastUpdate = null;
  }
  
  // Get token flow for a specific token
  async getTokenFlow(tokenCA) {
    try {
      const res = await fetch(`${ARKHAM_API}/token/${tokenCA}/flow`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      return this.parseFlow(data);
    } catch (e) {
      console.log('Arkham API error:', e.message);
      return null;
    }
  }
  
  // Get top holders for a token
  async getTopHolders(tokenCA, limit = 10) {
    try {
      const res = await fetch(`${ARKHAM_API}/token/${tokenCA}/holders?limit=${limit}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      return data.holders || [];
    } catch (e) {
      return [];
    }
  }
  
  // Get recent large transactions
  async getLargeTransactions(tokenCA, minValue = 1000) {
    try {
      const res = await fetch(`${ARKHAM_API}/token/${tokenCA}/transactions?minValue=${minValue}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      return data.transactions || [];
    } catch (e) {
      return [];
    }
  }
  
  // Check if token has smart money activity
  async analyzeSmartMoney(tokenCA) {
    const [holders, transactions] = await Promise.all([
      this.getTopHolders(tokenCA),
      this.getLargeTransactions(tokenCA, 500) // $500+ transactions
    ]);
    
    if (holders.length === 0) {
      return { hasData: false };
    }
    
    // Calculate holder distribution
    const top10Percent = holders.slice(0, 10).reduce((sum, h) => sum + (h.percent || 0), 0);
    const hasWhales = top10Percent < 50; // Top 10 holds < 50% = healthy distribution
    
    // Calculate buy/sell pressure from transactions
    const buys = transactions.filter(t => t.from === 'buy');
    const sells = transactions.filter(t => t.from === 'sell');
    const buyPressure = buys.length / (buys.length + sells.length) || 0.5;
    
    return {
      hasData: true,
      top10Percent: top10Percent.toFixed(1),
      hasWhales,
      buyPressure: (buyPressure * 100).toFixed(1),
      largeTxCount: transactions.length,
      isHealthy: hasWhales && buyPressure > 0.4
    };
  }
  
  // Parse flow data
  parseFlow(data) {
    if (!data) return null;
    
    return {
      inflow: data.inflow || 0,
      outflow: data.outflow || 0,
      net: (data.inflow || 0) - (data.outflow || 0),
      timestamp: data.timestamp
    };
  }
  
  // Get famous whale wallets (manual list)
  getKnownWhales() {
    return [
      { address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', label: 'Arkham Whale 1' },
      { address: 'Gaiy7d2Lw7RQyX4a4C7y3z4vN9jX2kP6mH8oE5rTqW3s', label: 'Sample Whale' }
    ];
  }
}

module.exports = ArkhamTracker;
