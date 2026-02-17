/**
 * Smart Money & Whale Tracker
 * Arkham-style analysis for Solana
 * Tracks large wallets, accumulation/distribution patterns
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Solscan API (Free tier)
const SOLSCAN_API_BASE = 'https://public-api.solscan.io';
const HELIUS_API_BASE = 'https://api.helius.xyz/v0';

// Configuration
const CONFIG = {
  minTransactionSOL: 1000,  // Minimum SOL to be considered whale
  accumulationThreshold: 5,  // Buys in last 24h
  distributionThreshold: 5,  // Sells in last 24h
  clusteringThreshold: 0.85,  // Similarity threshold for wallet clustering
  trackTokens: [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // USDC
    'So11111111111111111111111111111111111111112',   // SOL
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  // BONK
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  // WIF
  ],
  dbPath: '/root/trading-bot/database/smart-money.db.json',
  alertWebhook: process.env.ALERT_WEBHOOK || null,
};

// Smart Money Database
class SmartMoneyDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      }
    } catch (e) {
      console.error('Error loading DB:', e.message);
    }
    return {
      wallets: {},
      transactions: [],
      patterns: {},
      tokens: {},
      clusters: [],
      alerts: [],
      lastUpdate: Date.now()
    };
  }

  save() {
    this.data.lastUpdate = Date.now();
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  // Wallet operations
  addWallet(address, metadata = {}) {
    if (!this.data.wallets[address]) {
      this.data.wallets[address] = {
        address,
        firstSeen: Date.now(),
        transactions: [],
        labels: [],
        score: 0,
        classification: 'unknown',
        ...metadata
      };
    }
    return this.data.wallets[address];
  }

  updateWalletScore(address, score) {
    if (this.data.wallets[address]) {
      this.data.wallets[address].score = score;
      
      // Classify based on score
      if (score >= 90) this.data.wallets[address].classification = 'smart_money';
      else if (score >= 70) this.data.wallets[address].classification = 'whale';
      else if (score >= 50) this.data.wallets[address].classification = 'sophisticated';
      else if (score >= 30) this.data.wallets[address].classification = 'active_trader';
      else this.data.wallets[address].classification = 'retail';
    }
  }

  addTransaction(tx) {
    this.data.transactions.unshift(tx);
    // Keep last 10000 transactions
    if (this.data.transactions.length > 10000) {
      this.data.transactions = this.data.transactions.slice(0, 10000);
    }

    // Add to wallet history
    if (this.data.wallets[tx.wallet]) {
      this.data.wallets[tx.wallet].transactions.unshift(tx);
      if (this.data.wallets[tx.wallet].transactions.length > 1000) {
        this.data.wallets[tx.wallet].transactions = this.data.wallets[tx.wallet].transactions.slice(0, 1000);
      }
    }
  }

  addAlert(alert) {
    alert.timestamp = Date.now();
    this.data.alerts.unshift(alert);
    if (this.data.alerts.length > 500) {
      this.data.alerts = this.data.alerts.slice(0, 500);
    }
  }

  getWalletsByClassification(classification) {
    return Object.values(this.data.wallets)
      .filter(w => w.classification === classification)
      .sort((a, b) => b.score - a.score);
  }

  getTokenAnalysis(tokenAddress) {
    return this.data.tokens[tokenAddress] || null;
  }
}

// Solscan API Client
class SolscanClient {
  constructor() {
    this.baseURL = SOLSCAN_API_BASE;
    this.rateLimitDelay = 200; // ms between requests (free tier)
    this.lastRequest = 0;
  }

  async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.rateLimitDelay) {
      await new Promise(r => setTimeout(r, this.rateLimitDelay - elapsed));
    }
    this.lastRequest = Date.now();
  }

  async request(endpoint, params = {}) {
    await this.rateLimit();
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = `${this.baseURL}${endpoint}${queryString ? '?' + queryString : ''}`;
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    } catch (error) {
      console.error(`Solscan API error: ${endpoint}`, error.message);
      return null;
    }
  }

  // Get account transactions
  async getAccountTransactions(address, limit = 50) {
    return this.request(`/account/transactions`, { address, limit });
  }

  // Get token accounts
  async getTokenAccounts(address) {
    return this.request(`/account/tokens`, { address });
  }

  // Get token holders
  async getTokenHolders(tokenAddress, limit = 20) {
    return this.request(`/token/holders`, { tokenAddress, limit });
  }

  // Get token metadata
  async getTokenMeta(tokenAddress) {
    return this.request(`/token/meta`, { tokenAddress });
  }

  // Get transaction details
  async getTransactionDetails(signature) {
    return this.request(`/transaction/${signature}`);
  }

  // Get account balance
  async getAccountBalance(address) {
    return this.request(`/account/${address}`);
  }
}

// Whale & Smart Money Analyzer
class WhaleAnalyzer {
  constructor(db, solscan) {
    this.db = db;
    this.solscan = solscan;
    this.pendingAlerts = [];
  }

  /**
   * Calculate wallet smart money score
   * Factors:
   * - Historical profitability (40%)
   * - Transaction frequency/consistency (20%)
   * - Portfolio diversification (15%)
   * - Timing accuracy (25%)
   */
  calculateSmartMoneyScore(wallet) {
    let score = 0;
    const txs = wallet.transactions || [];
    
    if (txs.length === 0) return 0;

    // Historical performance (simulated - would need price data)
    const profitableTxs = txs.filter(tx => tx.profit && tx.profit > 0).length;
    const performanceScore = txs.length > 0 ? (profitableTxs / txs.length) * 40 : 0;
    score += performanceScore;

    // Transaction frequency (consistency)
    const uniqueDays = new Set(txs.map(tx => 
      new Date(tx.timestamp).toDateString()
    )).size;
    const frequencyScore = Math.min(uniqueDays / 30, 1) * 20;
    score += frequencyScore;

    // Portfolio diversity
    const uniqueTokens = new Set(txs.map(tx => tx.token)).size;
    const diversityScore = Math.min(uniqueTokens / 10, 1) * 15;
    score += diversityScore;

    // Volume/scale
    const totalVolume = txs.reduce((sum, tx) => sum + (tx.value || 0), 0);
    const volumeScore = Math.min(totalVolume / 100000, 1) * 25;
    score += volumeScore;

    return Math.min(Math.round(score), 100);
  }

  // Detect accumulation pattern
  detectAccumulationPattern(walletAddress, tokenAddress, lookbackHours = 24) {
    const cutoff = Date.now() - (lookbackHours * 60 * 60 * 1000);
    const txs = this.db.data.transactions.filter(tx => 
      tx.wallet === walletAddress &&
      tx.token === tokenAddress &&
      tx.timestamp > cutoff
    );

    const buys = txs.filter(tx => tx.type === 'buy').length;
    const sells = txs.filter(tx => tx.type === 'sell').length;
    const buyVolume = txs.filter(tx => tx.type === 'buy').reduce((sum, tx) => sum + tx.amount, 0);
    const sellVolume = txs.filter(tx => tx.type === 'sell').reduce((sum, tx) => sum + tx.amount, 0);

    if (buys >= CONFIG.accumulationThreshold && buyVolume > sellVolume * 2) {
      return {
        pattern: 'accumulation',
        strength: buys / CONFIG.accumulationThreshold,
        buyCount: buys,
        sellCount: sells,
        netVolume: buyVolume - sellVolume,
        confidence: Math.min(buys / 10, 1)
      };
    }

    return null;
  }

  // Detect distribution pattern
  detectDistributionPattern(walletAddress, tokenAddress, lookbackHours = 24) {
    const cutoff = Date.now() - (lookbackHours * 60 * 60 * 1000);
    const txs = this.db.data.transactions.filter(tx => 
      tx.wallet === walletAddress &&
      tx.token === tokenAddress &&
      tx.timestamp > cutoff
    );

    const buys = txs.filter(tx => tx.type === 'buy').length;
    const sells = txs.filter(tx => tx.type === 'sell').length;
    const buyVolume = txs.filter(tx => tx.type === 'buy').reduce((sum, tx) => sum + tx.amount, 0);
    const sellVolume = txs.filter(tx => tx.type === 'sell').reduce((sum, tx) => sum + tx.amount, 0);

    if (sells >= CONFIG.distributionThreshold && sellVolume > buyVolume * 2) {
      return {
        pattern: 'distribution',
        strength: sells / CONFIG.distributionThreshold,
        buyCount: buys,
        sellCount: sells,
        netVolume: sellVolume - buyVolume,
        confidence: Math.min(sells / 10, 1)
      };
    }

    return null;
  }

  // Cluster wallets by behavior similarity
  async clusterWallets() {
    const wallets = Object.values(this.db.data.wallets);
    const clusters = [];
    const clustered = new Set();

    for (const wallet of wallets) {
      if (clustered.has(wallet.address)) continue;

      const cluster = [wallet];
      clustered.add(wallet.address);

      // Find similar wallets
      for (const other of wallets) {
        if (clustered.has(other.address)) continue;
        
        const similarity = this.calculateWalletSimilarity(wallet, other);
        if (similarity >= CONFIG.clusteringThreshold) {
          cluster.push(other);
          clustered.add(other.address);
        }
      }

      if (cluster.length >= 2) {
        clusters.push({
          id: `cluster_${Date.now()}_${cluster[0].address.slice(0, 8)}`,
          wallets: cluster.map(w => w.address),
          size: cluster.length,
          averageScore: cluster.reduce((sum, w) => sum + w.score, 0) / cluster.length,
          commonTokens: this.findCommonTokens(cluster),
          formedAt: Date.now()
        });
      }
    }

    this.db.data.clusters = clusters;
    return clusters;
  }

  // Calculate similarity between two wallets
  calculateWalletSimilarity(w1, w2) {
    const tokens1 = new Set(w1.transactions?.map(tx => tx.token) || []);
    const tokens2 = new Set(w2.transactions?.map(tx => tx.token) || []);
    
    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    const jaccard = intersection.size / union.size;

    // Time-based similarity (similar transaction timing)
    const times1 = (w1.transactions || []).map(tx => tx.timestamp);
    const times2 = (w2.transactions || []).map(tx => tx.timestamp);
    
    let timeMatches = 0;
    for (const t1 of times1.slice(0, 10)) {
      for (const t2 of times2.slice(0, 10)) {
        if (Math.abs(t1 - t2) < 3600000) { // Within 1 hour
          timeMatches++;
        }
      }
    }
    const timeSimilarity = Math.min(timeMatches / 5, 1);

    return (jaccard * 0.7) + (timeSimilarity * 0.3);
  }

  findCommonTokens(wallets) {
    const tokenCounts = {};
    wallets.forEach(w => {
      const tokens = new Set(w.transactions?.map(tx => tx.token) || []);
      tokens.forEach(t => {
        tokenCounts[t] = (tokenCounts[t] || 0) + 1;
      });
    });

    return Object.entries(tokenCounts)
      .filter(([_, count]) => count >= wallets.length * 0.5)
      .map(([token]) => token);
  }

  // Check for new smart money entering a token
  checkNewSmartMoneyEntry(tokenAddress, recentTxs) {
    const alerts = [];
    const smartMoneyWallets = this.db.getWalletsByClassification('smart_money');
    const whaleWallets = this.db.getWalletsByClassification('whale');
    const sophisticatedWallets = this.db.getWalletsByClassification('sophisticated');
    
    const trackedWallets = new Set([
      ...smartMoneyWallets.map(w => w.address),
      ...whaleWallets.map(w => w.address),
      ...sophisticatedWallets.map(w => w.address)
    ]);

    // Check for new positions
    const existingPositions = new Set(
      this.db.data.transactions
        .filter(tx => tx.token === tokenAddress && trackedWallets.has(tx.wallet))
        .map(tx => tx.wallet)
    );

    for (const tx of recentTxs) {
      if (trackedWallets.has(tx.wallet) && !existingPositions.has(tx.wallet) && tx.type === 'buy') {
        const wallet = this.db.data.wallets[tx.wallet];
        alerts.push({
          type: 'new_smart_money_entry',
          severity: wallet?.classification === 'smart_money' ? 'high' : 'medium',
          token: tokenAddress,
          wallet: tx.wallet,
          amount: tx.amount,
          walletScore: wallet?.score || 0,
          classification: wallet?.classification,
          message: `🐋 ${wallet?.classification?.toUpperCase()} entering ${tokenAddress.slice(0, 8)}... with ${tx.amount.toFixed(2)} SOL`
        });
      }
    }

    return alerts;
  }

  // Check whale accumulation patterns
  checkWhaleAccumulation(tokenAddress, recentTxs) {
    const alerts = [];
    const whaleAddresses = new Set(
      this.db.getWalletsByClassification('whale').map(w => w.address)
    );
    
    const smartMoneyAddresses = new Set(
      this.db.getWalletsByClassification('smart_money').map(w => w.address)
    );

    // Group by wallet
    const walletActivity = {};
    for (const tx of recentTxs) {
      if (!walletActivity[tx.wallet]) {
        walletActivity[tx.wallet] = { buys: 0, sells: 0, volume: 0 };
      }
      if (tx.type === 'buy') {
        walletActivity[tx.wallet].buys++;
        walletActivity[tx.wallet].volume += tx.amount;
      } else {
        walletActivity[tx.wallet].sells++;
      }
    }

    // Check for accumulation
    for (const [wallet, activity] of Object.entries(walletActivity)) {
      const isWhale = whaleAddresses.has(wallet);
      const isSmartMoney = smartMoneyAddresses.has(wallet);
      
      if ((isWhale || isSmartMoney) && activity.buys >= 3 && activity.volume > 100) {
        const walletData = this.db.data.wallets[wallet];
        alerts.push({
          type: 'whale_accumulation',
          severity: isSmartMoney ? 'high' : 'medium',
          token: tokenAddress,
          wallet,
          buyCount: activity.buys,
          volume: activity.volume,
          walletScore: walletData?.score || 0,
          message: `📈 ${isSmartMoney ? 'Smart Money' : 'Whale'} accumulating ${tokenAddress.slice(0, 8)}... (${activity.buys} buys, ${activity.volume.toFixed(2)} SOL)`
        });
      }
    }

    return alerts;
  }

  // Detect unusual volume with smart money correlation
  checkUnusualVolumeSmartMoney(tokenAddress, recentTxs, historicalAvgVolume) {
    const currentVolume = recentTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const volumeRatio = historicalAvgVolume > 0 ? currentVolume / historicalAvgVolume : 0;

    if (volumeRatio < 2) return []; // Not unusual enough

    // Check smart money participation
    const smartMoneyAddresses = new Set([
      ...this.db.getWalletsByClassification('smart_money').map(w => w.address),
      ...this.db.getWalletsByClassification('whale').map(w => w.address)
    ]);

    const smartMoneyVolume = recentTxs
      .filter(tx => smartMoneyAddresses.has(tx.wallet))
      .reduce((sum, tx) => sum + tx.amount, 0);

    const smartMoneyRatio = currentVolume > 0 ? smartMoneyVolume / currentVolume : 0;

    if (smartMoneyRatio > 0.3) { // >30% smart money participation
      return [{
        type: 'unusual_volume_smart_money',
        severity: smartMoneyRatio > 0.5 ? 'critical' : 'high',
        token: tokenAddress,
        volumeRatio,
        smartMoneyRatio,
        totalVolume: currentVolume,
        smartMoneyVolume,
        message: `🚨 UNUSUAL VOLUME on ${tokenAddress.slice(0, 8)}... (${volumeRatio.toFixed(1)}x avg) with ${(smartMoneyRatio * 100).toFixed(1)}% smart money!`
      }];
    }

    return [];
  }
}

// Main Tracker Class
class SmartMoneyTracker {
  constructor() {
    this.db = new SmartMoneyDB(CONFIG.dbPath);
    this.solscan = new SolscanClient();
    this.analyzer = new WhaleAnalyzer(this.db, this.solscan);
    this.isRunning = false;
  }

  async start() {
    console.log('🚀 Smart Money Tracker Starting...');
    this.isRunning = true;

    // Initial scan
    await this.performFullScan();

    // Continuous monitoring
    while (this.isRunning) {
      try {
        await this.monitorCycle();
        await this.sleep(30000); // 30 second intervals
      } catch (error) {
        console.error('Monitor cycle error:', error);
        await this.sleep(60000);
      }
    }
  }

  async performFullScan() {
    console.log('🔍 Performing full scan...');

    for (const token of CONFIG.trackTokens) {
      try {
        await this.analyzeToken(token);
        await this.sleep(1000);
      } catch (e) {
        console.error(`Error analyzing token ${token}:`, e.message);
      }
    }

    // Update wallet scores
    for (const [address, wallet] of Object.entries(this.db.data.wallets)) {
      const score = this.analyzer.calculateSmartMoneyScore(wallet);
      this.db.updateWalletScore(address, score);
    }

    // Cluster wallets
    await this.analyzer.clusterWallets();

    this.db.save();
    console.log('✅ Full scan complete');
  }

  async analyzeToken(tokenAddress) {
    console.log(`Analyzing token: ${tokenAddress.slice(0, 16)}...`);

    // Get top holders
    const holders = await this.solscan.getTokenHolders(tokenAddress, 50);
    if (!holders || !holders.data) return;

    // Initialize token data
    if (!this.db.data.tokens[tokenAddress]) {
      this.db.data.tokens[tokenAddress] = {
        address: tokenAddress,
        firstSeen: Date.now(),
        holders: {},
        volumeHistory: [],
        smartMoneyInterest: 0
      };
    }

    const tokenData = this.db.data.tokens[tokenAddress];
    const recentTxs = [];

    // Analyze each holder
    for (const holder of holders.data) {
      const address = holder.owner;
      const balance = parseFloat(holder.amount) / Math.pow(10, holder.decimals || 6);

      // Track large holders as potential whales
      if (balance > CONFIG.minTransactionSOL) {
        this.db.addWallet(address, {
          balance,
          token: tokenAddress,
          labels: ['large_holder']
        });

        // Get recent transactions
        const txs = await this.solscan.getAccountTransactions(address, 20);
        if (txs && Array.isArray(txs)) {
          for (const tx of txs) {
            const txData = this.parseTransaction(tx, address, tokenAddress);
            if (txData && txData.amount >= CONFIG.minTransactionSOL) {
              this.db.addTransaction(txData);
              recentTxs.push(txData);
            }
          }
        }
      }

      tokenData.holders[address] = {
        balance,
        lastUpdate: Date.now()
      };
    }

    // Check for alerts
    await this.checkAlerts(tokenAddress, recentTxs);

    // Update volume history
    const totalVolume = recentTxs.reduce((sum, tx) => sum + tx.amount, 0);
    tokenData.volumeHistory.push({
      timestamp: Date.now(),
      volume: totalVolume,
      txCount: recentTxs.length
    });

    // Keep last 168 entries (1 week at hourly)
    if (tokenData.volumeHistory.length > 168) {
      tokenData.volumeHistory = tokenData.volumeHistory.slice(-168);
    }

    // Calculate smart money interest
    const smartMoneyWallets = this.db.getWalletsByClassification('smart_money');
    const whaleWallets = this.db.getWalletsByClassification('whale');
    tokenData.smartMoneyInterest = smartMoneyWallets.length + (whaleWallets.length * 0.5);
  }

  parseTransaction(tx, wallet, token) {
    try {
      const lamports = tx.lamport || tx.amount || 0;
      const solAmount = lamports / 1e9;

      if (solAmount < CONFIG.minTransactionSOL) return null;

      // Determine buy/sell based on balance change (simplified)
      // In reality, would need to parse token transfers
      const type = tx.status === 'Success' ? 'transfer' : 'unknown';

      return {
        signature: tx.txHash || tx.signature,
        wallet,
        token,
        type: type === 'transfer' ? 'buy' : 'unknown', // Simplified
        amount: solAmount,
        value: solAmount * 100, // Approximate USD
        timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
        fee: (tx.fee || 0) / 1e9,
        status: tx.status || 'unknown'
      };
    } catch (e) {
      return null;
    }
  }

  async checkAlerts(tokenAddress, recentTxs) {
    const alerts = [];

    // Check for new smart money entry
    const newEntryAlerts = this.analyzer.checkNewSmartMoneyEntry(tokenAddress, recentTxs);
    alerts.push(...newEntryAlerts);

    // Check whale accumulation
    const accumulationAlerts = this.analyzer.checkWhaleAccumulation(tokenAddress, recentTxs);
    alerts.push(...accumulationAlerts);

    // Check unusual volume
    const tokenData = this.db.data.tokens[tokenAddress];
    const avgVolume = tokenData?.volumeHistory?.length > 0
      ? tokenData.volumeHistory.reduce((sum, v) => sum + v.volume, 0) / tokenData.volumeHistory.length
      : 0;
    const volumeAlerts = this.analyzer.checkUnusualVolumeSmartMoney(tokenAddress, recentTxs, avgVolume);
    alerts.push(...volumeAlerts);

    // Save and emit alerts
    for (const alert of alerts) {
      this.db.addAlert(alert);
      console.log(`🚨 ALERT: ${alert.message}`);
      
      if (CONFIG.alertWebhook) {
        this.sendWebhookAlert(alert);
      }
    }

    if (alerts.length > 0) {
      this.db.save();
    }
  }

  async sendWebhookAlert(alert) {
    try {
      await axios.post(CONFIG.alertWebhook, {
        ...alert,
        timestamp: new Date().toISOString()
      }, { timeout: 5000 });
    } catch (e) {
      // Silent fail for webhook
    }
  }

  async monitorCycle() {
    // Quick scan of tracked tokens
    for (const token of CONFIG.trackTokens) {
      try {
        await this.analyzeToken(token);
        await this.sleep(500);
      } catch (e) {
        // Continue to next token
      }
    }
    this.db.save();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
    this.db.save();
  }

  // API Methods for external access
  getSmartMoneyWallets() {
    return this.db.getWalletsByClassification('smart_money');
  }

  getWhaleWallets() {
    return this.db.getWalletsByClassification('whale');
  }

  getRecentAlerts(limit = 20) {
    return this.db.data.alerts.slice(0, limit);
  }

  getTokenSmartMoneyAnalysis(tokenAddress) {
    const token = this.db.data.tokens[tokenAddress];
    if (!token) return null;

    const holders = Object.entries(token.holders)
      .map(([address, data]) => ({
        address,
        ...data,
        wallet: this.db.data.wallets[address]
      }))
      .filter(h => h.wallet && (h.wallet.classification === 'smart_money' || h.wallet.classification === 'whale'))
      .sort((a, b) => b.balance - a.balance);

    return {
      token: tokenAddress,
      smartMoneyHolders: holders.length,
      totalSmartMoneyHeld: holders.reduce((sum, h) => sum + h.balance, 0),
      topHolders: holders.slice(0, 10),
      recentTransactions: this.db.data.transactions
        .filter(tx => tx.token === tokenAddress)
        .slice(0, 20)
    };
  }
}

// Export for use as module
module.exports = { SmartMoneyTracker, SmartMoneyDB, WhaleAnalyzer, SolscanClient };

// Run if executed directly
if (require.main === module) {
  const tracker = new SmartMoneyTracker();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Smart Money Tracker...');
    tracker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    tracker.stop();
    process.exit(0);
  });

  tracker.start().catch(console.error);
}
