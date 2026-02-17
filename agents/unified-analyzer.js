#!/usr/bin/env node
/**
 * Unified Strategy Analyzer
 * Combines Reddit and Medium data for comprehensive analysis
 * Identifies recurring patterns and generates trading insights
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Load all strategies
function loadStrategies() {
  const strategies = [];
  
  // Load Reddit strategies
  const redditFile = path.join(DATA_DIR, 'reddit-strategies.json');
  if (fs.existsSync(redditFile)) {
    const reddit = JSON.parse(fs.readFileSync(redditFile, 'utf8'));
    strategies.push(...reddit);
    console.log(`📥 Loaded ${reddit.length} Reddit strategies`);
  }
  
  // Load Medium strategies
  const mediumFile = path.join(DATA_DIR, 'medium-strategies.json');
  if (fs.existsSync(mediumFile)) {
    const medium = JSON.parse(fs.readFileSync(mediumFile, 'utf8'));
    strategies.push(...medium);
    console.log(`📥 Loaded ${medium.length} Medium strategies`);
  }
  
  return strategies;
}

// Identify recurring patterns
function identifyPatterns(strategies) {
  const patterns = {
    indicators: {},
    indicatorCombinations: [],
    timeframes: {},
    categories: {},
    tokens: {},
    entryPhrases: {},
    exitPhrases: {},
    riskPhrases: {},
    sentiment: { positive: 0, negative: 0, neutral: 0 }
  };
  
  for (const s of strategies) {
    // Indicators
    const indicators = s.indicators || s.technicalPatterns?.map(p => 
      typeof p === 'string' ? p : p.pattern
    ) || [];
    
    for (const ind of indicators) {
      const key = ind.toString().toUpperCase();
      patterns.indicators[key] = (patterns.indicators[key] || 0) + 1;
    }
    
    // Track indicator combinations
    if (indicators.length >= 2) {
      const combo = indicators.map(i => i.toString().toUpperCase()).sort().join(' + ');
      const existing = patterns.indicatorCombinations.find(c => c.combo === combo);
      if (existing) {
        existing.count++;
      } else {
        patterns.indicatorCombinations.push({ combo, count: 1 });
      }
    }
    
    // Timeframes
    for (const tf of (s.timeframes || [])) {
      patterns.timeframes[tf] = (patterns.timeframes[tf] || 0) + 1;
    }
    
    // Categories
    if (s.strategyCategory) {
      patterns.categories[s.strategyCategory] = (patterns.categories[s.strategyCategory] || 0) + 1;
    }
    
    // Tokens
    for (const token of (s.tokensMentioned || [])) {
      patterns.tokens[token] = (patterns.tokens[token] || 0) + 1;
    }
    
    // Sentiment
    if (s.sentimentLabel) {
      patterns.sentiment[s.sentimentLabel]++;
    }
    
    // Extract key phrases from rules
    if (s.entryRules) {
      extractKeyPhrases(s.entryRules, patterns.entryPhrases);
    }
    if (s.exitRules) {
      extractKeyPhrases(s.exitRules, patterns.exitPhrases);
    }
    if (s.riskRules) {
      extractKeyPhrases(s.riskRules, patterns.riskPhrases);
    }
  }
  
  // Sort combinations by frequency
  patterns.indicatorCombinations.sort((a, b) => b.count - a.count);
  
  return patterns;
}

function extractKeyPhrases(text, target) {
  const phrases = [
    /(?:when|if)\s+(.{10,50})/gi,
    /(\w+\s+(?:cross|divergence|breakout|support|resistance).{0,30})/gi,
    /(\d+%\s+(?:risk|stop|target|profit))/gi
  ];
  
  for (const pattern of phrases) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const phrase = match[1].trim().toLowerCase();
      if (phrase.length > 10 && phrase.length < 60) {
        target[phrase] = (target[phrase] || 0) + 1;
      }
    }
    pattern.lastIndex = 0;
  }
}

// Calculate aggregate confidence by category
function analyzeConfidenceByCategory(strategies) {
  const byCategory = {};
  
  for (const s of strategies) {
    const cat = s.strategyCategory || 'uncategorized';
    if (!byCategory[cat]) {
      byCategory[cat] = { strategies: [], total: 0, avgConfidence: 0 };
    }
    byCategory[cat].strategies.push(s);
    byCategory[cat].total++;
  }
  
  for (const cat in byCategory) {
    const avg = byCategory[cat].strategies.reduce((sum, s) => sum + s.confidenceScore, 0) / byCategory[cat].total;
    byCategory[cat].avgConfidence = avg;
  }
  
  return byCategory;
}

// Find high-confidence strategies with backtests
function findValidatedStrategies(strategies) {
  return strategies
    .filter(s => s.confidenceScore >= 0.7 && (s.backtestResults || s.isDueDiligence))
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
}

// Token sentiment analysis
function analyzeTokenSentiment(strategies) {
  const tokens = {};
  
  for (const s of strategies) {
    for (const token of (s.tokensMentioned || [])) {
      if (!tokens[token]) {
        tokens[token] = { mentions: 0, sentiment: 0, sources: new Set() };
      }
      tokens[token].mentions++;
      tokens[token].sentiment += s.sentimentScore || 0;
      tokens[token].sources.add(s.sourceType);
    }
  }
  
  // Calculate averages and format
  const results = Object.entries(tokens).map(([symbol, data]) => ({
    symbol,
    mentions: data.mentions,
    avgSentiment: data.sentiment / data.mentions,
    sentimentLabel: data.sentiment / data.mentions > 0.2 ? '🟢 Bullish' : 
                    data.sentiment / data.mentions < -0.2 ? '🔴 Bearish' : '⚪ Neutral',
    sources: Array.from(data.sources)
  }));
  
  return results.sort((a, b) => b.mentions - a.mentions);
}

// Generate strategy recommendations
function generateRecommendations(strategies, patterns) {
  const recommendations = [];
  
  // Find most reliable indicator combinations
  const reliableCombos = patterns.indicatorCombinations.filter(c => c.count >= 2);
  if (reliableCombos.length > 0) {
    recommendations.push({
      type: 'indicator_combination',
      title: 'Most Reliable Indicator Combinations',
      data: reliableCombos.slice(0, 3)
    });
  }
  
  // Find best timeframe
  const topTimeframe = Object.entries(patterns.timeframes)
    .sort((a, b) => b[1] - a[1])[0];
  if (topTimeframe) {
    recommendations.push({
      type: 'timeframe',
      title: 'Most Popular Timeframe',
      data: topTimeframe
    });
  }
  
  // High confidence strategies
  const highConfidence = strategies.filter(s => s.confidenceScore >= 0.8);
  if (highConfidence.length > 0) {
    recommendations.push({
      type: 'high_confidence',
      title: 'Highest Confidence Strategies',
      data: highConfidence.slice(0, 3).map(s => ({
        name: s.strategyName || s.title,
        confidence: s.confidenceScore,
        source: s.sourceType
      }))
    });
  }
  
  return recommendations;
}

// Create comprehensive report
function generateReport(strategies, patterns) {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalStrategies: strategies.length,
      redditCount: strategies.filter(s => s.sourceType === 'reddit').length,
      mediumCount: strategies.filter(s => s.sourceType === 'medium').length,
      avgConfidence: strategies.reduce((sum, s) => sum + s.confidenceScore, 0) / strategies.length,
      withBacktest: strategies.filter(s => s.backtestResults).length,
      dueDiligence: strategies.filter(s => s.isDueDiligence).length
    },
    patterns,
    confidenceByCategory: analyzeConfidenceByCategory(strategies),
    validatedStrategies: findValidatedStrategies(strategies).map(s => ({
      name: s.strategyName || s.title,
      source: s.sourceType,
      confidence: s.confidenceScore,
      category: s.strategyCategory,
      backtest: s.backtestResults,
      url: s.sourceUrl
    })),
    tokenSentiment: analyzeTokenSentiment(strategies),
    recommendations: generateRecommendations(strategies, patterns)
  };
  
  // Save JSON report
  const reportFile = path.join(DATA_DIR, 'unified-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  return report;
}

// Print formatted report
function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 UNIFIED STRATEGY ANALYSIS REPORT');
  console.log('='.repeat(60));
  console.log(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  
  console.log('\n📈 SUMMARY');
  console.log(`  Total Strategies: ${report.summary.totalStrategies}`);
  console.log(`  Reddit Sources: ${report.summary.redditCount}`);
  console.log(`  Medium Sources: ${report.summary.mediumCount}`);
  console.log(`  Average Confidence: ${(report.summary.avgConfidence * 100).toFixed(1)}%`);
  console.log(`  With Backtest Data: ${report.summary.withBacktest}`);
  console.log(`  Due Diligence Posts: ${report.summary.dueDiligence}`);
  
  console.log('\n📊 PATTERN ANALYSIS');
  
  // Top indicators
  console.log('\n  Most Used Indicators:');
  const topIndicators = Object.entries(report.patterns.indicators)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [ind, count] of topIndicators) {
    console.log(`    • ${ind}: ${count} strategies`);
  }
  
  // Indicator combinations
  if (report.patterns.indicatorCombinations.length > 0) {
    console.log('\n  Indicator Combinations:');
    for (const combo of report.patterns.indicatorCombinations.slice(0, 5)) {
      console.log(`    • ${combo.combo}: ${combo.count}x`);
    }
  }
  
  // Categories
  console.log('\n  Strategy Categories:');
  for (const [cat, count] of Object.entries(report.patterns.categories)) {
    const avgConf = report.confidenceByCategory[cat]?.avgConfidence || 0;
    console.log(`    • ${cat.replace('_', ' ')}: ${count} (avg confidence: ${(avgConf * 100).toFixed(0)}%)`);
  }
  
  // Timeframes
  if (Object.keys(report.patterns.timeframes).length > 0) {
    console.log('\n  Timeframes:');
    for (const [tf, count] of Object.entries(report.patterns.timeframes)) {
      console.log(`    • ${tf}: ${count} mentions`);
    }
  }
  
  // Token sentiment
  console.log('\n🪙 TOKEN SENTIMENT');
  for (const token of report.tokenSentiment.slice(0, 10)) {
    console.log(`  ${token.sentimentLabel} ${token.symbol}: ${token.mentions} mentions (${token.avgSentiment.toFixed(2)})`);
  }
  
  // Validated strategies
  if (report.validatedStrategies.length > 0) {
    console.log('\n✅ VALIDATED STRATEGIES (High Confidence + Backtest/DD)');
    for (const s of report.validatedStrategies) {
      console.log(`\n  🎯 ${s.name}`);
      console.log(`     Confidence: ${(s.confidence * 100).toFixed(0)}% | Category: ${s.category}`);
      if (s.backtest) {
        const metrics = Object.entries(s.backtest)
          .map(([k, v]) => `${k}: ${v}${k.includes('Rate') || k.includes('return') || k.includes('Drawdown') ? '%' : ''}`)
          .join(' | ');
        console.log(`     Backtest: ${metrics}`);
      }
      console.log(`     Source: ${s.source}`);
    }
  }
  
  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS');
    for (const rec of report.recommendations) {
      console.log(`\n  ${rec.title}:`);
      if (Array.isArray(rec.data)) {
        for (const item of rec.data) {
          if (item.combo) {
            console.log(`    → ${item.combo} (${item.count} strategies use this)`);
          } else if (item.name) {
            console.log(`    → ${item.name} (${(item.confidence * 100).toFixed(0)}% confidence)`);
          }
        }
      } else if (rec.data[0]) {
        console.log(`    → ${rec.data[0]} (${rec.data[1]} mentions)`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`📄 Full report saved to: ${path.join(DATA_DIR, 'unified-report.json')}`);
}

// Export top strategies for bot integration
function exportTopStrategies(strategies) {
  const topStrategies = strategies
    .filter(s => s.confidenceScore >= 0.7)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 10)
    .map(s => ({
      id: s.id,
      name: s.strategyName || s.title,
      source: s.sourceType,
      sourceUrl: s.sourceUrl,
      category: s.strategyCategory,
      confidence: s.confidenceScore,
      entry: s.entryRules,
      exit: s.exitRules,
      risk: s.riskRules,
      indicators: s.indicators || s.technicalPatterns?.map(p => p.pattern),
      backtest: s.backtestResults,
      tokens: s.tokensMentioned,
      sentiment: s.sentimentScore
    }));
  
  const exportFile = path.join(DATA_DIR, 'top-strategies-export.json');
  fs.writeFileSync(exportFile, JSON.stringify(topStrategies, null, 2));
  console.log(`\n📤 Exported top ${topStrategies.length} strategies to: ${exportFile}`);
  
  return topStrategies;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  
  switch (command) {
    case 'analyze':
      console.log('🚀 Unified Strategy Analyzer\n');
      const strategies = loadStrategies();
      
      if (strategies.length === 0) {
        console.log('⚠️ No strategies found. Run generate-demo-data.js first.');
        return;
      }
      
      console.log(`\n🔍 Analyzing ${strategies.length} strategies...\n`);
      const patterns = identifyPatterns(strategies);
      const report = generateReport(strategies, patterns);
      printReport(report);
      exportTopStrategies(strategies);
      break;
      
    case 'tokens':
      const allStrategies = loadStrategies();
      const sentiment = analyzeTokenSentiment(allStrategies);
      console.log('\n🪙 TOKEN SENTIMENT ANALYSIS\n');
      for (const t of sentiment) {
        console.log(`${t.sentimentLabel} ${t.symbol}: ${t.mentions} mentions (${t.avgSentiment.toFixed(2)}) [${t.sources.join(', ')}]`);
      }
      break;
      
    case 'export':
      const data = loadStrategies();
      exportTopStrategies(data);
      break;
      
    case 'patterns':
      const s = loadStrategies();
      const p = identifyPatterns(s);
      console.log('\n📊 RECURRING PATTERNS\n');
      console.log('Indicator Combinations:');
      for (const combo of p.indicatorCombinations.slice(0, 5)) {
        console.log(`  ${combo.combo}: ${combo.count}x`);
      }
      break;
      
    default:
      console.log('Unified Strategy Analyzer\n');
      console.log('Commands:');
      console.log('  analyze  - Full analysis (default)');
      console.log('  tokens   - Token sentiment analysis');
      console.log('  export   - Export top strategies');
      console.log('  patterns - Show recurring patterns');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  loadStrategies,
  identifyPatterns,
  analyzeTokenSentiment,
  generateReport
};
