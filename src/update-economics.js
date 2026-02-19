// Trading Economics & API Cost Tracker
// Usage: 
//   - After trade: require('./update-economics.js').trade(pnlPercent, isWin)
//   - After scan: require('./update-economics.js').scan()

const fs = require('fs');

// Cost estimates (in USD per 1M tokens or per call)
const COST_ESTIMATES = {
  groq: { perCall: 0.0001, per1M: 0.4 },      // ~$0.40/1M tokens, ~$0.0001 per call
  dexscreener: { perCall: 0.00005 },           // Free tier, estimate $0.00005
  helius: { perCall: 0.00025 },                // ~$0.00025 per RPC call
  solanatracker: { perCall: 0.0001 }           // Swap API estimate
};

// API Cost Tracker
function trackApiCall(api, tokens = 0) {
  const costFile = '/root/trading-bot/api-costs.json';
  let costs = {
    period: new Date().toISOString().split('T')[0],
    groq: { calls: 0, estimatedCost: 0 },
    dexscreener: { calls: 0, estimatedCost: 0 },
    helius: { calls: 0, estimatedCost: 0 },
    solanatracker: { calls: 0, estimatedCost: 0 },
    totalCost: 0,
    tradesCount: 0
  };
  
  if (fs.existsSync(costFile)) {
    try { costs = JSON.parse(fs.readFileSync(costFile, 'utf8')); } catch(e) {}
  }
  
  const estimate = COST_ESTIMATES[api];
  if (!estimate) return;
  
  costs[api].calls++;
  const callCost = estimate.perCall + (tokens / 1000000 * (estimate.per1M || 0));
  costs[api].estimatedCost += callCost;
  costs.totalCost += callCost;
  
  fs.writeFileSync(costFile, JSON.stringify(costs, null, 2));
}

// Trade Economics Tracker
function trade(pnlPercent, isWin) {
  const ecoFile = '/root/trading-bot/trading-economics.json';
  let eco = { 
    started: "2026-02-10T00:00:00Z", 
    totalTrades: 0, 
    winningTrades: 0, 
    losingTrades: 0, 
    totalProfit: 0, 
    totalLoss: 0, 
    netProfit: 0, 
    bestTrade: 0, 
    worstTrade: 0,
    totalCost: 0,
    netProfitAfterCost: 0,
    lastTradeTime: null,
    daysAlive: 0,
    survivalRate: 0
  };
  
  if (fs.existsSync(ecoFile)) {
    try { eco = JSON.parse(fs.readFileSync(ecoFile, 'utf8')); } catch(e) {}
  }
  
  eco.totalTrades++;
  if (pnlPercent > 0) {
    eco.winningTrades++;
    eco.totalProfit += pnlPercent;
    if (pnlPercent > eco.bestTrade) eco.bestTrade = pnlPercent;
  } else {
    eco.losingTrades++;
    eco.totalLoss += Math.abs(pnlPercent);
    if (eco.worstTrade === 0 || pnlPercent < eco.worstTrade) eco.worstTrade = pnlPercent;
  }
  eco.netProfit = eco.totalProfit - eco.totalLoss;
  
  // Get API costs
  const costFile = '/root/trading-bot/api-costs.json';
  if (fs.existsSync(costFile)) {
    try { 
      const costs = JSON.parse(fs.readFileSync(costFile, 'utf8'));
      eco.totalCost = costs.totalCost;
      eco.netProfitAfterCost = eco.netProfit - (costs.totalCost * 10); // Convert to SOL equivalent (assume 1 API $ ≈ 10 SOL value)
    } catch(e) {}
  }
  
  eco.lastTradeTime = Date.now();
  const daysAlive = Math.floor((Date.now() - new Date(eco.started).getTime()) / (1000*60*60*24));
  eco.daysAlive = daysAlive;
  eco.survivalRate = ((eco.winningTrades / eco.totalTrades) * 100).toFixed(1);
  
  fs.writeFileSync(ecoFile, JSON.stringify(eco, null, 2));
  console.log(`💰 ECONOMICS: Day ${daysAlive} | Trades: ${eco.totalTrades} | WR: ${eco.survivalRate}% | Net: ${eco.netProfit.toFixed(2)}% | Best: +${eco.bestTrade.toFixed(1)}% | Worst: ${eco.worstTrade.toFixed(1)}%`);
}

// Scan tracker (track API usage per scan)
function scan() {
  trackApiCall('dexscreener', 5000);  // ~5K tokens per scan
  trackApiCall('helius', 2000);        // ~2K tokens RPC
}

module.exports = { trade, scan, trackApiCall };
