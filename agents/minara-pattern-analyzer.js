/**
 * Minara AI-Style Pattern Analyzer
 * Multi-source sentiment aggregation & smart money confidence scoring
 * Entity behavior tracking & risk assessment
 */

const fs = require('fs');
const axios = require('axios');

// Configuration
const CONFIG = {
  dbPath: '/root/trading-bot/database/smart-money.db.json',
  patternsPath: '/root/trading-bot/database/patterns.db.json',
  sentimentSources: ['twitter', 'telegram', 'dexscreener', 'birdeye'],
  confidenceThreshold: 70,
  riskLevels: {
    veryLow: { min: 0, max: 20, label: 'Very Low Risk' },
    low: { min: 20, max: 40, label: 'Low Risk' },
    moderate: { min: 40, max: 60, label: 'Moderate Risk' },
    high: { min: 60, max: 80, label: 'High Risk' },
    veryHigh: { min: 80, max: 100, label: 'Very High Risk' }
  }
};

// Pattern Database
class PatternDB {
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
      console.error('Error loading patterns DB:', e.message);
    }
    return {
      patterns: [],
      entities: {},
      correlations: {},
      sentimentHistory: [],
      confidenceScores: {},
      riskAssessments: {},
      lastUpdate: Date.now()
    };
  }

  save() {
    this.data.lastUpdate = Date.now();
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  addPattern(pattern) {
    pattern.id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    pattern.timestamp = Date.now();
    this.data.patterns.unshift(pattern);
    
    if (this.data.patterns.length > 5000) {
      this.data.patterns = this.data.patterns.slice(0, 5000);
    }
    return pattern;
  }

  updateEntityBehavior(entityId, behavior) {
    if (!this.data.entities[entityId]) {
      this.data.entities[entityId] = {
        id: entityId,
        firstSeen: Date.now(),
        behaviors: [],
        traits: {},
        reliability: 50
      };
    }

    this.data.entities[entityId].behaviors.unshift(behavior);
    if (this.data.entities[entityId].behaviors.length > 100) {
      this.data.entities[entityId].behaviors = this.data.entities[entityId].behaviors.slice(0, 100);
    }

    // Update reliability based on behavior accuracy
    if (behavior.outcome) {
      const current = this.data.entities[entityId].reliability;
      const adjustment = behavior.outcome === 'success' ? 2 : -1;
      this.data.entities[entityId].reliability = Math.max(0, Math.min(100, current + adjustment));
    }
  }

  getEntity(entityId) {
    return this.data.entities[entityId] || null;
  }

  getPatterns(filters = {}) {
    let patterns = this.data.patterns;

    if (filters.type) {
      patterns = patterns.filter(p => p.type === filters.type);
    }
    if (filters.token) {
      patterns = patterns.filter(p => p.token === filters.token);
    }
    if (filters.minConfidence) {
      patterns = patterns.filter(p => p.confidence >= filters.minConfidence);
    }
    if (filters.since) {
      patterns = patterns.filter(p => p.timestamp >= filters.since);
    }

    return patterns;
  }

  addSentiment(sentiment) {
    this.data.sentimentHistory.unshift(sentiment);
    if (this.data.sentimentHistory.length > 10000) {
      this.data.sentimentHistory = this.data.sentimentHistory.slice(0, 10000);
    }
  }

  setConfidenceScore(token, score, factors) {
    this.data.confidenceScores[token] = {
      score,
      factors,
      timestamp: Date.now()
    };
  }

  setRiskAssessment(token, assessment) {
    this.data.riskAssessments[token] = {
      ...assessment,
      timestamp: Date.now()
    };
  }
}

// Multi-Source Sentiment Aggregator
class SentimentAggregator {
  constructor(patternDB) {
    this.patternDB = patternDB;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Aggregate sentiment from multiple sources
   * Returns normalized score -100 to +100
   */
  async aggregateSentiment(token, sources = CONFIG.sentimentSources) {
    const sentiments = [];
    const weights = {
      twitter: 0.25,
      telegram: 0.20,
      dexscreener: 0.30,
      birdeye: 0.25
    };

    for (const source of sources) {
      try {
        const sentiment = await this.getSentimentFromSource(source, token);
        if (sentiment !== null) {
          sentiments.push({
            source,
            score: sentiment,
            weight: weights[source] || 0.25,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        console.error(`Sentiment error [${source}]:`, e.message);
      }
    }

    if (sentiments.length === 0) {
      return { score: 0, confidence: 0, sources: [] };
    }

    // Weighted average
    const totalWeight = sentiments.reduce((sum, s) => sum + s.weight, 0);
    const weightedScore = sentiments.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight;

    // Confidence based on source agreement
    const variance = this.calculateVariance(sentiments.map(s => s.score));
    const confidence = Math.max(0, 100 - (variance * 2)); // Lower variance = higher confidence

    const result = {
      score: Math.round(weightedScore),
      confidence: Math.round(confidence),
      sources: sentiments,
      timestamp: Date.now()
    };

    // Store in database
    this.patternDB.addSentiment({
      token,
      ...result
    });

    return result;
  }

  async getSentimentFromSource(source, token) {
    const cacheKey = `${source}:${token}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    let sentiment = null;

    switch (source) {
      case 'twitter':
        sentiment = await this.getTwitterSentiment(token);
        break;
      case 'telegram':
        sentiment = await this.getTelegramSentiment(token);
        break;
      case 'dexscreener':
        sentiment = await this.getDexScreenerSentiment(token);
        break;
      case 'birdeye':
        sentiment = await this.getBirdeyeSentiment(token);
        break;
      default:
        sentiment = this.simulateSentiment(); // Fallback
    }

    this.cache.set(cacheKey, { value: sentiment, timestamp: Date.now() });
    return sentiment;
  }

  async getTwitterSentiment(token) {
    // Simulated - would integrate with Twitter API or scraping
    // Returns -100 to +100
    return this.simulateSentiment();
  }

  async getTelegramSentiment(token) {
    // Simulated - would integrate with Telegram channels monitoring
    return this.simulateSentiment();
  }

  async getDexScreenerSentiment(token) {
    try {
      // DexScreener API for Solana token metrics
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
        timeout: 5000
      });

      if (response.data && response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        
        // Analyze metrics for sentiment
        let score = 0;
        
        // Price change sentiment
        const priceChange24h = parseFloat(pair.priceChange?.h24 || 0);
        score += Math.max(-30, Math.min(30, priceChange24h / 2));

        // Volume sentiment
        const volume24h = parseFloat(pair.volume?.h24 || 0);
        if (volume24h > 100000) score += 20;
        else if (volume24h > 50000) score += 10;
        else if (volume24h > 10000) score += 5;

        // Liquidity sentiment
        const liquidity = parseFloat(pair.liquidity?.usd || 0);
        if (liquidity > 500000) score += 20;
        else if (liquidity > 100000) score += 10;
        else if (liquidity > 50000) score += 5;

        // Transaction count
        const txns24h = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
        if (txns24h > 1000) score += 10;
        else if (txns24h > 500) score += 5;

        // Buy/sell ratio
        const buys = pair.txns?.h24?.buys || 0;
        const sells = pair.txns?.h24?.sells || 0;
        if (buys + sells > 0) {
          const buyRatio = buys / (buys + sells);
          if (buyRatio > 0.6) score += 15;
          else if (buyRatio > 0.5) score += 5;
          else if (buyRatio < 0.4) score -= 15;
        }

        return Math.max(-100, Math.min(100, score));
      }
    } catch (e) {
      console.error('DexScreener sentiment error:', e.message);
    }
    return this.simulateSentiment();
  }

  async getBirdeyeSentiment(token) {
    // Simulated - would integrate with Birdeye API
    // Birdeye provides holder trends, smart wallet tracking
    return this.simulateSentiment();
  }

  simulateSentiment() {
    // Weighted random sentiment for testing
    const base = (Math.random() - 0.5) * 200; // -100 to +100
    return Math.round(Math.max(-100, Math.min(100, base)));
  }

  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
  }
}

// Smart Money Confidence Scorer
class ConfidenceScorer {
  constructor(smartMoneyDB, patternDB) {
    this.smartMoneyDB = smartMoneyDB;
    this.patternDB = patternDB;
  }

  /**
   * Calculate confidence score for a token based on smart money activity
   * Returns 0-100 score with breakdown
   */
  calculateConfidenceScore(token) {
    const factors = {
      smartMoneyPresence: 0,
      holderQuality: 0,
      accumulationStrength: 0,
      historicalAccuracy: 0,
      volumeTrend: 0
    };

    let totalWeight = 0;
    let weightedScore = 0;

    // Factor 1: Smart Money Presence (weight: 30%)
    const smartMoneyPresence = this.analyzeSmartMoneyPresence(token);
    factors.smartMoneyPresence = smartMoneyPresence.score;
    weightedScore += smartMoneyPresence.score * 0.30;
    totalWeight += 0.30;

    // Factor 2: Holder Quality (weight: 25%)
    const holderQuality = this.analyzeHolderQuality(token);
    factors.holderQuality = holderQuality.score;
    weightedScore += holderQuality.score * 0.25;
    totalWeight += 0.25;

    // Factor 3: Accumulation Strength (weight: 20%)
    const accumulationStrength = this.analyzeAccumulationStrength(token);
    factors.accumulationStrength = accumulationStrength.score;
    weightedScore += accumulationStrength.score * 0.20;
    totalWeight += 0.20;

    // Factor 4: Historical Accuracy (weight: 15%)
    const historicalAccuracy = this.analyzeHistoricalAccuracy(token);
    factors.historicalAccuracy = historicalAccuracy.score;
    weightedScore += historicalAccuracy.score * 0.15;
    totalWeight += 0.15;

    // Factor 5: Volume Trend (weight: 10%)
    const volumeTrend = this.analyzeVolumeTrend(token);
    factors.volumeTrend = volumeTrend.score;
    weightedScore += volumeTrend.score * 0.10;
    totalWeight += 0.10;

    const finalScore = Math.round(weightedScore / totalWeight);

    const result = {
      token,
      score: finalScore,
      factors,
      details: {
        smartMoneyPresence,
        holderQuality,
        accumulationStrength,
        historicalAccuracy,
        volumeTrend
      },
      timestamp: Date.now()
    };

    // Store in database
    this.patternDB.setConfidenceScore(token, finalScore, factors);

    return result;
  }

  analyzeSmartMoneyPresence(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData) {
      return { score: 0, reason: 'No token data' };
    }

    const holders = Object.keys(tokenData.holders || {});
    const smartMoneyCount = holders.filter(h => {
      const wallet = this.smartMoneyDB.data.wallets?.[h];
      return wallet && (wallet.classification === 'smart_money' || wallet.classification === 'whale');
    }).length;

    const smartMoneyRatio = holders.length > 0 ? smartMoneyCount / holders.length : 0;
    
    let score = 0;
    if (smartMoneyCount >= 10) score = 100;
    else if (smartMoneyCount >= 5) score = 80;
    else if (smartMoneyCount >= 3) score = 60;
    else if (smartMoneyCount >= 1) score = 40;

    // Boost for high ratio
    if (smartMoneyRatio > 0.2) score = Math.min(100, score + 20);

    return {
      score,
      smartMoneyCount,
      totalHolders: holders.length,
      ratio: smartMoneyRatio,
      reason: `${smartMoneyCount} smart money wallets (${(smartMoneyRatio * 100).toFixed(1)}%)`
    };
  }

  analyzeHolderQuality(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData) {
      return { score: 0, reason: 'No token data' };
    }

    const holders = Object.keys(tokenData.holders || {});
    if (holders.length === 0) {
      return { score: 0, reason: 'No holders' };
    }

    let totalScore = 0;
    let scoredHolders = 0;

    for (const holder of holders) {
      const wallet = this.smartMoneyDB.data.wallets?.[holder];
      if (wallet && wallet.score) {
        totalScore += wallet.score;
        scoredHolders++;
      }
    }

    const avgScore = scoredHolders > 0 ? totalScore / scoredHolders : 0;

    return {
      score: Math.round(avgScore),
      averageWalletScore: avgScore,
      scoredHolders,
      totalHolders: holders.length,
      reason: `Average wallet score: ${avgScore.toFixed(1)}`
    };
  }

  analyzeAccumulationStrength(token) {
    const recentTxs = this.smartMoneyDB.data?.transactions?.filter(tx => 
      tx.token === token && 
      Date.now() - tx.timestamp < 86400000 // Last 24h
    ) || [];

    if (recentTxs.length === 0) {
      return { score: 0, reason: 'No recent transactions' };
    }

    const buys = recentTxs.filter(tx => tx.type === 'buy');
    const sells = recentTxs.filter(tx => tx.type === 'sell');
    
    const buyVolume = buys.reduce((sum, tx) => sum + tx.amount, 0);
    const sellVolume = sells.reduce((sum, tx) => sum + tx.amount, 0);
    
    const netVolume = buyVolume - sellVolume;
    const netRatio = buyVolume + sellVolume > 0 ? netVolume / (buyVolume + sellVolume) : 0;

    let score = 50; // Neutral base

    // Accumulation scoring
    if (netRatio > 0.5) score = 90;
    else if (netRatio > 0.3) score = 75;
    else if (netRatio > 0.1) score = 60;
    else if (netRatio < -0.3) score = 20;
    else if (netRatio < -0.1) score = 35;

    return {
      score,
      buys: buys.length,
      sells: sells.length,
      buyVolume,
      sellVolume,
      netRatio,
      reason: netRatio > 0 ? `Accumulating (${(netRatio * 100).toFixed(1)}% net buy)` : `Distributing (${(Math.abs(netRatio) * 100).toFixed(1)}% net sell)`
    };
  }

  analyzeHistoricalAccuracy(token) {
    // Analyze past patterns and their outcomes
    const patterns = this.patternDB.getPatterns({ token, since: Date.now() - 2592000000 }); // 30 days
    
    if (patterns.length === 0) {
      return { score: 50, reason: 'No historical data' };
    }

    const completedPatterns = patterns.filter(p => p.outcome);
    if (completedPatterns.length === 0) {
      return { score: 50, reason: 'No completed patterns' };
    }

    const successfulPatterns = completedPatterns.filter(p => p.outcome === 'success').length;
    const accuracy = successfulPatterns / completedPatterns.length;

    const score = Math.round(accuracy * 100);

    return {
      score,
      accuracy,
      successful: successfulPatterns,
      total: completedPatterns.length,
      reason: `${successfulPatterns}/${completedPatterns.length} patterns successful`
    };
  }

  analyzeVolumeTrend(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData || !tokenData.volumeHistory || tokenData.volumeHistory.length < 2) {
      return { score: 50, reason: 'Insufficient volume history' };
    }

    const history = tokenData.volumeHistory.slice(0, 24); // Last 24 entries
    if (history.length < 2) {
      return { score: 50, reason: 'Insufficient volume history' };
    }

    // Calculate trend
    const recentAvg = history.slice(0, 6).reduce((sum, v) => sum + v.volume, 0) / 6;
    const olderAvg = history.slice(6, 12).reduce((sum, v) => sum + v.volume, 0) / 6;

    if (olderAvg === 0) {
      return { score: 50, reason: 'No baseline volume' };
    }

    const trend = (recentAvg - olderAvg) / olderAvg;

    let score = 50;
    if (trend > 1.0) score = 100; // 100%+ increase
    else if (trend > 0.5) score = 85;
    else if (trend > 0.2) score = 70;
    else if (trend > 0) score = 60;
    else if (trend < -0.3) score = 20;
    else if (trend < -0.1) score = 35;

    return {
      score,
      trend,
      recentAvg,
      olderAvg,
      reason: trend > 0 ? `Volume increasing ${(trend * 100).toFixed(1)}%` : `Volume decreasing ${(Math.abs(trend) * 100).toFixed(1)}%`
    };
  }
}

// Entity Behavior Tracker
class EntityTracker {
  constructor(patternDB) {
    this.patternDB = patternDB;
  }

  /**
   * Track and analyze entity behavior patterns
   * Entities can be wallets, clusters, or known traders
   */
  trackEntity(entityId, action, metadata = {}) {
    const behavior = {
      action,
      metadata,
      timestamp: Date.now(),
      outcome: null // Will be updated later
    };

    this.patternDB.updateEntityBehavior(entityId, behavior);

    // Analyze behavior patterns
    const entity = this.patternDB.getEntity(entityId);
    if (entity && entity.behaviors.length >= 10) {
      this.analyzeEntityTraits(entity);
    }

    return behavior;
  }

  analyzeEntityTraits(entity) {
    const behaviors = entity.behaviors.slice(0, 50); // Last 50 actions
    
    const traits = {
      aggression: 0,      // How quickly they act
      patience: 0,        // Time between actions
      diversification: 0, // Token variety
      successRate: 0,     // Historical success
      followsSmartMoney: 0, // Correlation with smart money
      timing: 0           // Entry/exit timing quality
    };

    // Calculate aggression (frequency of large trades)
    const largeTrades = behaviors.filter(b => 
      b.metadata.amount && b.metadata.amount > 1000
    ).length;
    traits.aggression = Math.min(100, (largeTrades / behaviors.length) * 150);

    // Calculate patience (average time between actions)
    const timeGaps = [];
    for (let i = 0; i < behaviors.length - 1; i++) {
      timeGaps.push(behaviors[i].timestamp - behaviors[i + 1].timestamp);
    }
    const avgGap = timeGaps.length > 0 ? timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length : 0;
    traits.patience = Math.min(100, (avgGap / 3600000) * 10); // Hours to score

    // Calculate diversification
    const uniqueTokens = new Set(behaviors.map(b => b.metadata.token).filter(Boolean));
    traits.diversification = Math.min(100, (uniqueTokens.size / 10) * 100);

    // Calculate success rate
    const completedActions = behaviors.filter(b => b.outcome);
    const successful = completedActions.filter(b => b.outcome === 'success').length;
    traits.successRate = completedActions.length > 0 
      ? (successful / completedActions.length) * 100 
      : 50;

    // Update entity traits
    entity.traits = traits;
    entity.lastAnalyzed = Date.now();

    return traits;
  }

  getEntityRiskProfile(entityId) {
    const entity = this.patternDB.getEntity(entityId);
    if (!entity) {
      return { risk: 'unknown', score: 50 };
    }

    const traits = entity.traits || {};
    const reliability = entity.reliability || 50;

    // Calculate risk based on traits and reliability
    let riskScore = 50;

    // High reliability reduces risk
    riskScore -= (reliability - 50) * 0.3;

    // High aggression increases risk
    riskScore += (traits.aggression || 0) * 0.2;

    // Low patience increases risk
    riskScore += (100 - (traits.patience || 50)) * 0.1;

    // Low diversification increases risk
    riskScore += (100 - (traits.diversification || 50)) * 0.15;

    // High success rate reduces risk
    riskScore -= (traits.successRate || 50) * 0.2;

    riskScore = Math.max(0, Math.min(100, riskScore));

    let riskLevel = 'moderate';
    for (const [level, range] of Object.entries(CONFIG.riskLevels)) {
      if (riskScore >= range.min && riskScore < range.max) {
        riskLevel = level;
        break;
      }
    }

    return {
      entityId,
      risk: riskLevel,
      score: Math.round(riskScore),
      reliability,
      traits,
      label: CONFIG.riskLevels[riskLevel]?.label || 'Unknown'
    };
  }
}

// Risk Assessor
class RiskAssessor {
  constructor(smartMoneyDB, patternDB) {
    this.smartMoneyDB = smartMoneyDB;
    this.patternDB = patternDB;
  }

  /**
   * Comprehensive risk assessment for a token
   * Based on holder concentration, liquidity, smart money activity
   */
  assessTokenRisk(token) {
    const factors = {
      holderConcentration: 0,
      liquidityRisk: 0,
      volatilityRisk: 0,
      smartMoneyDivergence: 0,
      marketManipulationRisk: 0
    };

    let totalRisk = 0;
    let factorCount = 0;

    // Factor 1: Holder Concentration (30%)
    const concentrationRisk = this.assessHolderConcentration(token);
    factors.holderConcentration = concentrationRisk.score;
    totalRisk += concentrationRisk.score * 0.30;
    factorCount += 0.30;

    // Factor 2: Liquidity Risk (25%)
    const liquidityRisk = this.assessLiquidityRisk(token);
    factors.liquidityRisk = liquidityRisk.score;
    totalRisk += liquidityRisk.score * 0.25;
    factorCount += 0.25;

    // Factor 3: Volatility Risk (20%)
    const volatilityRisk = this.assessVolatilityRisk(token);
    factors.volatilityRisk = volatilityRisk.score;
    totalRisk += volatilityRisk.score * 0.20;
    factorCount += 0.20;

    // Factor 4: Smart Money Divergence (15%)
    const divergenceRisk = this.assessSmartMoneyDivergence(token);
    factors.smartMoneyDivergence = divergenceRisk.score;
    totalRisk += divergenceRisk.score * 0.15;
    factorCount += 0.15;

    // Factor 5: Market Manipulation Risk (10%)
    const manipulationRisk = this.assessManipulationRisk(token);
    factors.marketManipulationRisk = manipulationRisk.score;
    totalRisk += manipulationRisk.score * 0.10;
    factorCount += 0.10;

    const finalScore = Math.round(totalRisk / factorCount);

    let riskLevel = 'moderate';
    for (const [level, range] of Object.entries(CONFIG.riskLevels)) {
      if (finalScore >= range.min && finalScore < range.max) {
        riskLevel = level;
        break;
      }
    }

    const assessment = {
      token,
      riskScore: finalScore,
      riskLevel,
      riskLabel: CONFIG.riskLevels[riskLevel]?.label || 'Unknown',
      factors,
      details: {
        holderConcentration: concentrationRisk,
        liquidityRisk,
        volatilityRisk,
        smartMoneyDivergence: divergenceRisk,
        marketManipulationRisk: manipulationRisk
      },
      recommendation: this.generateRecommendation(finalScore, factors),
      timestamp: Date.now()
    };

    // Store in database
    this.patternDB.setRiskAssessment(token, assessment);

    return assessment;
  }

  assessHolderConcentration(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData || !tokenData.holders) {
      return { score: 75, reason: 'Unknown concentration' };
    }

    const holders = Object.values(tokenData.holders);
    const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);

    if (totalSupply === 0) {
      return { score: 100, reason: 'No supply data' };
    }

    // Calculate top 10 holder concentration
    const sortedHolders = holders.sort((a, b) => b.balance - a.balance);
    const top10Balance = sortedHolders.slice(0, 10).reduce((sum, h) => sum + h.balance, 0);
    const concentration = top10Balance / totalSupply;

    let score = 50;
    if (concentration > 0.8) score = 95; // Very high risk
    else if (concentration > 0.6) score = 80;
    else if (concentration > 0.4) score = 60;
    else if (concentration > 0.2) score = 40;
    else score = 20; // Well distributed

    return {
      score,
      concentration,
      top10Holders: top10Balance,
      totalSupply,
      holderCount: holders.length,
      reason: `Top 10 hold ${(concentration * 100).toFixed(1)}%`
    };
  }

  assessLiquidityRisk(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData || !tokenData.volumeHistory || tokenData.volumeHistory.length === 0) {
      return { score: 70, reason: 'No liquidity data' };
    }

    // Use recent volume as proxy for liquidity
    const recentVolume = tokenData.volumeHistory.slice(0, 6).reduce((sum, v) => sum + v.volume, 0) / 6;

    let score = 50;
    if (recentVolume < 10000) score = 90; // Very low liquidity = high risk
    else if (recentVolume < 50000) score = 70;
    else if (recentVolume < 100000) score = 50;
    else if (recentVolume < 500000) score = 30;
    else score = 15; // High liquidity = low risk

    return {
      score,
      averageVolume: recentVolume,
      reason: `Average volume: $${recentVolume.toFixed(0)}`
    };
  }

  assessVolatilityRisk(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData || !tokenData.volumeHistory || tokenData.volumeHistory.length < 10) {
      return { score: 60, reason: 'Insufficient volatility data' };
    }

    const volumes = tokenData.volumeHistory.slice(0, 24).map(v => v.volume);
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const variance = volumes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

    let score = 50;
    if (coefficientOfVariation > 2.0) score = 90; // Extreme volatility
    else if (coefficientOfVariation > 1.0) score = 75;
    else if (coefficientOfVariation > 0.5) score = 55;
    else if (coefficientOfVariation > 0.3) score = 35;
    else score = 20; // Stable

    return {
      score,
      volatility: coefficientOfVariation,
      stdDev,
      mean,
      reason: `Volatility: ${coefficientOfVariation.toFixed(2)} CV`
    };
  }

  assessSmartMoneyDivergence(token) {
    const recentTxs = this.smartMoneyDB.data?.transactions?.filter(tx => 
      tx.token === token && 
      Date.now() - tx.timestamp < 86400000
    ) || [];

    if (recentTxs.length === 0) {
      return { score: 50, reason: 'No recent activity' };
    }

    // Separate smart money from retail
    const smartMoneyWallets = new Set([
      ...this.smartMoneyDB.getWalletsByClassification('smart_money').map(w => w.address),
      ...this.smartMoneyDB.getWalletsByClassification('whale').map(w => w.address)
    ]);

    const smartMoneyTxs = recentTxs.filter(tx => smartMoneyWallets.has(tx.wallet));
    const retailTxs = recentTxs.filter(tx => !smartMoneyWallets.has(tx.wallet));

    // Calculate smart money vs retail direction
    const smartBuys = smartMoneyTxs.filter(tx => tx.type === 'buy').length;
    const smartSells = smartMoneyTxs.filter(tx => tx.type === 'sell').length;
    const retailBuys = retailTxs.filter(tx => tx.type === 'buy').length;
    const retailSells = retailTxs.filter(tx => tx.type === 'sell').length;

    const smartDirection = smartBuys + smartSells > 0 ? (smartBuys - smartSells) / (smartBuys + smartSells) : 0;
    const retailDirection = retailBuys + retailSells > 0 ? (retailBuys - retailSells) / (retailBuys + retailSells) : 0;

    const divergence = Math.abs(smartDirection - retailDirection);

    let score = 50;
    
    // Divergence where smart money sells and retail buys = high risk
    if (smartDirection < -0.3 && retailDirection > 0.3) score = 95;
    else if (smartDirection < 0 && retailDirection > 0.5) score = 80;
    else if (divergence > 0.5) score = 65;
    else if (divergence > 0.3) score = 45;
    else score = 25; // Aligned behavior = lower risk

    return {
      score,
      smartDirection,
      retailDirection,
      divergence,
      smartMoneyTxs: smartMoneyTxs.length,
      retailTxs: retailTxs.length,
      reason: score > 70 ? 'Smart money diverging from retail' : 'Aligned activity'
    };
  }

  assessManipulationRisk(token) {
    const tokenData = this.smartMoneyDB.data?.tokens?.[token];
    if (!tokenData) {
      return { score: 50, reason: 'No token data' };
    }

    const recentTxs = this.smartMoneyDB.data?.transactions?.filter(tx => 
      tx.token === token && 
      Date.now() - tx.timestamp < 3600000 // Last hour
    ) || [];

    let suspiciousPatterns = 0;

    // Pattern 1: Wash trading (same wallet buying and selling rapidly)
    const walletActivity = {};
    recentTxs.forEach(tx => {
      if (!walletActivity[tx.wallet]) {
        walletActivity[tx.wallet] = { buys: 0, sells: 0 };
      }
      if (tx.type === 'buy') walletActivity[tx.wallet].buys++;
      else walletActivity[tx.wallet].sells++;
    });

    for (const activity of Object.values(walletActivity)) {
      if (activity.buys >= 3 && activity.sells >= 3) suspiciousPatterns++;
    }

    // Pattern 2: Coordinated buying (multiple wallets buying at same time)
    const buyTimes = recentTxs.filter(tx => tx.type === 'buy').map(tx => tx.timestamp);
    const clusteredBuys = this.findTimeClusters(buyTimes, 60000); // Within 1 minute
    if (clusteredBuys.some(cluster => cluster.length >= 5)) suspiciousPatterns += 2;

    // Pattern 3: Large holder dumping in small chunks
    const holders = Object.entries(tokenData.holders || {})
      .filter(([_, data]) => data.balance > 10000)
      .map(([address]) => address);
    
    for (const holder of holders) {
      const holderSells = recentTxs.filter(tx => tx.wallet === holder && tx.type === 'sell');
      if (holderSells.length >= 5) suspiciousPatterns++;
    }

    let score = Math.min(100, 20 + (suspiciousPatterns * 20));

    return {
      score,
      suspiciousPatterns,
      reason: suspiciousPatterns > 2 ? 'Multiple manipulation signals detected' : 'No obvious manipulation'
    };
  }

  findTimeClusters(timestamps, windowMs) {
    if (timestamps.length === 0) return [];
    
    const sorted = [...timestamps].sort((a, b) => a - b);
    const clusters = [];
    let currentCluster = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - currentCluster[currentCluster.length - 1] <= windowMs) {
        currentCluster.push(sorted[i]);
      } else {
        if (currentCluster.length >= 2) clusters.push(currentCluster);
        currentCluster = [sorted[i]];
      }
    }

    if (currentCluster.length >= 2) clusters.push(currentCluster);
    return clusters;
  }

  generateRecommendation(riskScore, factors) {
    if (riskScore >= 80) {
      return '⛔ AVOID - Very high risk. Multiple red flags detected.';
    } else if (riskScore >= 60) {
      return '⚠️ CAUTION - High risk. Only for experienced traders with strict stop losses.';
    } else if (riskScore >= 40) {
      return '⚡ MODERATE - Medium risk. Standard position sizing recommended.';
    } else if (riskScore >= 20) {
      return '✅ ACCEPTABLE - Low risk. Favorable risk/reward profile.';
    } else {
      return '💚 FAVORABLE - Very low risk. Strong fundamentals detected.';
    }
  }
}

// Main Pattern Analyzer
class MinaraPatternAnalyzer {
  constructor() {
    this.smartMoneyDB = this.loadSmartMoneyDB();
    this.patternDB = new PatternDB(CONFIG.patternsPath);
    this.sentimentAggregator = new SentimentAggregator(this.patternDB);
    this.confidenceScorer = new ConfidenceScorer(this.smartMoneyDB, this.patternDB);
    this.entityTracker = new EntityTracker(this.patternDB);
    this.riskAssessor = new RiskAssessor(this.smartMoneyDB, this.patternDB);
  }

  loadSmartMoneyDB() {
    try {
      if (fs.existsSync(CONFIG.dbPath)) {
        return JSON.parse(fs.readFileSync(CONFIG.dbPath, 'utf8'));
      }
    } catch (e) {
      console.error('Error loading smart money DB:', e.message);
    }
    return { data: { wallets: {}, transactions: [], tokens: {} } };
  }

  /**
   * Comprehensive analysis of a token
   */
  async analyzeToken(tokenAddress) {
    console.log(`\n🔬 Analyzing ${tokenAddress}...`);

    const analysis = {
      token: tokenAddress,
      timestamp: Date.now()
    };

    try {
      // 1. Multi-source sentiment
      console.log('📊 Aggregating sentiment...');
      analysis.sentiment = await this.sentimentAggregator.aggregateSentiment(tokenAddress);

      // 2. Smart money confidence score
      console.log('🎯 Calculating confidence...');
      analysis.confidence = this.confidenceScorer.calculateConfidenceScore(tokenAddress);

      // 3. Risk assessment
      console.log('⚖️ Assessing risk...');
      analysis.risk = this.riskAssessor.assessTokenRisk(tokenAddress);

      // 4. Overall recommendation
      analysis.recommendation = this.generateOverallRecommendation(analysis);

      // 5. Save pattern
      this.patternDB.addPattern({
        type: 'comprehensive_analysis',
        token: tokenAddress,
        sentiment: analysis.sentiment.score,
        confidence: analysis.confidence.score,
        risk: analysis.risk.riskScore,
        recommendation: analysis.recommendation.action
      });

      this.patternDB.save();

      console.log('✅ Analysis complete\n');
      this.printAnalysisSummary(analysis);

      return analysis;

    } catch (error) {
      console.error('Analysis error:', error);
      return { error: error.message, token: tokenAddress };
    }
  }

  generateOverallRecommendation(analysis) {
    const sentiment = analysis.sentiment?.score || 0;
    const confidence = analysis.confidence?.score || 0;
    const risk = analysis.risk?.riskScore || 50;

    // Weighted scoring
    const sentimentWeight = 0.25;
    const confidenceWeight = 0.50;
    const riskWeight = 0.25;

    const score = (
      ((sentiment + 100) / 2) * sentimentWeight +  // Normalize -100/+100 to 0-100
      confidence * confidenceWeight +
      (100 - risk) * riskWeight  // Invert risk (lower risk = higher score)
    );

    let action = 'HOLD';
    let reasoning = [];

    if (score >= 75) {
      action = 'STRONG BUY';
      reasoning.push('High confidence');
      reasoning.push('Positive sentiment');
      reasoning.push('Acceptable risk');
    } else if (score >= 60) {
      action = 'BUY';
      reasoning.push('Good confidence');
      if (sentiment > 0) reasoning.push('Positive sentiment');
    } else if (score >= 45) {
      action = 'HOLD';
      reasoning.push('Moderate signals');
    } else if (score >= 30) {
      action = 'SELL';
      reasoning.push('Weak confidence');
      if (risk > 60) reasoning.push('High risk');
    } else {
      action = 'STRONG SELL';
      reasoning.push('Very weak signals');
      reasoning.push('High risk');
    }

    // Override for extreme cases
    if (risk >= 85) {
      action = 'AVOID';
      reasoning = ['Extreme risk detected'];
    }

    if (confidence >= 85 && sentiment > 50 && risk < 40) {
      action = 'STRONG BUY';
      reasoning = ['Exceptional opportunity detected'];
    }

    return {
      action,
      score: Math.round(score),
      reasoning: reasoning.join(', '),
      components: {
        sentiment,
        confidence,
        risk: 100 - risk
      }
    };
  }

  printAnalysisSummary(analysis) {
    console.log('═══════════════════════════════════════════════');
    console.log(`📊 ANALYSIS SUMMARY: ${analysis.token.slice(0, 16)}...`);
    console.log('═══════════════════════════════════════════════');
    
    console.log('\n💭 SENTIMENT:');
    console.log(`   Score: ${analysis.sentiment.score > 0 ? '+' : ''}${analysis.sentiment.score}/100`);
    console.log(`   Confidence: ${analysis.sentiment.confidence}%`);
    console.log(`   Sources: ${analysis.sentiment.sources.length}`);

    console.log('\n🎯 CONFIDENCE:');
    console.log(`   Score: ${analysis.confidence.score}/100`);
    console.log(`   Smart Money: ${analysis.confidence.factors.smartMoneyPresence}`);
    console.log(`   Holder Quality: ${analysis.confidence.factors.holderQuality}`);
    console.log(`   Accumulation: ${analysis.confidence.factors.accumulationStrength}`);

    console.log('\n⚖️ RISK:');
    console.log(`   Level: ${analysis.risk.riskLabel}`);
    console.log(`   Score: ${analysis.risk.riskScore}/100`);
    console.log(`   Holder Concentration: ${analysis.risk.factors.holderConcentration}`);
    console.log(`   Liquidity: ${analysis.risk.factors.liquidityRisk}`);

    console.log('\n🎬 RECOMMENDATION:');
    console.log(`   Action: ${analysis.recommendation.action}`);
    console.log(`   Score: ${analysis.recommendation.score}/100`);
    console.log(`   Reason: ${analysis.recommendation.reasoning}`);

    console.log('\n═══════════════════════════════════════════════\n');
  }

  // Export API
  async analyzeMultipleTokens(tokens) {
    const results = [];
    for (const token of tokens) {
      const analysis = await this.analyzeToken(token);
      results.push(analysis);
      await new Promise(r => setTimeout(r, 2000)); // Rate limit
    }
    return results;
  }

  getPatternHistory(options = {}) {
    return this.patternDB.getPatterns(options);
  }

  trackWalletBehavior(walletAddress, action, metadata) {
    return this.entityTracker.trackEntity(walletAddress, action, metadata);
  }

  getEntityProfile(entityId) {
    return this.entityTracker.getEntityRiskProfile(entityId);
  }
}

// Export
module.exports = { 
  MinaraPatternAnalyzer, 
  SentimentAggregator, 
  ConfidenceScorer, 
  EntityTracker, 
  RiskAssessor,
  PatternDB 
};

// CLI execution
if (require.main === module) {
  const analyzer = new MinaraPatternAnalyzer();
  
  const testTokens = [
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  ];

  (async () => {
    console.log('🚀 Minara Pattern Analyzer Starting...\n');
    
    for (const token of testTokens) {
      await analyzer.analyzeToken(token);
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log('\n✅ Analysis complete. Check database for results.');
    process.exit(0);
  })();
}
