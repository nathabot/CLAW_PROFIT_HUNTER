#!/usr/bin/env node
/**
 * Medium Trading Strategy Analyzer
 * Extracts trading strategies and technical analysis from Medium articles
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration
const CONFIG = {
  // Medium publications and tags to monitor
  publications: [
    'towards-data-science',
    'analytics-vidhya'
  ],
  searchQueries: [
    'crypto trading strategy',
    'technical analysis cryptocurrency',
    'trading indicators tutorial',
    'backtesting trading strategy',
    'algorithmic trading crypto',
    'price action trading',
    'rsi strategy',
    'macd trading',
    'fibonacci trading',
    'support resistance strategy'
  ],
  articlesPerQuery: 10,
  userAgent: 'TradingStrategyAnalyzer/1.0 (Research Bot)',
  dataDir: path.join(__dirname, '../data'),
  minReadTime: 3 // Minimum 3 min read
};

// Ensure data directory exists
if (!fs.existsSync(CONFIG.dataDir)) {
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });
}

// Strategy extraction patterns
const STRATEGY_PATTERNS = {
  // Strategy name/title patterns
  name: [
    /strategy[:\s]+["']?([^"'\n]+)["']?/i,
    /the\s+([a-z]+\s+)?strategy/i,
    /how\s+to\s+trade\s+(.*?)(?:\n|$)/i,
    /trading\s+system[:\s]+(.*?)(?:\n|$)/i
  ],
  
  // Entry conditions
  entry: [
    /entry[:\s]+(.*?)(?:exit|stop|target|when to sell)/is,
    /buy signal[:\s]+(.*?)(?:sell|exit|close)/is,
    /long position[:\s]+(.*?)(?:short|exit)/is,
    /when to enter[:\s]+(.*?)(?:when to exit|conclusion)/is,
    /entry criteria[:\s]+(.*?)(?:exit criteria|risk)/is,
    /go long when[:\s]+(.*?)(?:go short|exit)/is
  ],
  
  // Exit conditions
  exit: [
    /exit[:\s]+(.*?)(?:entry|risk|conclusion)/is,
    /sell signal[:\s]+(.*?)(?:buy|entry|conclusion)/is,
    /take profit[:\s]+(.*?)(?:stop loss|conclusion)/is,
    /when to exit[:\s]+(.*?)(?:conclusion|summary)/is,
    /exit criteria[:\s]+(.*?)(?:entry criteria|risk)/is,
    /close position[:\s]+(.*?)(?:open|entry)/is
  ],
  
  // Risk management
  risk: [
    /risk management[:\s]+(.*?)(?:conclusion|summary)/is,
    /stop loss[:\s]+(.*?)(?:take profit|target)/is,
    /position sizing[:\s]+(.*?)(?:conclusion|risk)/is,
    /risk per trade[:\s]+(.*?)(?:position|conclusion)/is,
    /max drawdown[:\s]+(.*?)(?:conclusion)/is,
    /risk reward ratio[:\s]+(.*?)(?:conclusion)/is
  ],
  
  // Backtesting results
  backtest: [
    /backtest[:\s]+(.*?)(?:conclusion|summary)/is,
    /win rate[:\s]+(\d+(?:\.\d+)?)%/i,
    /profit factor[:\s]+(\d+(?:\.\d+)?)/i,
    /sharpe ratio[:\s]+(\d+(?:\.\d+)?)/i,
    /return[:\s]+(\d+(?:\.\d+)?)%/i,
    /accuracy[:\s]+(\d+(?:\.\d+)?)%/i
  ]
};

// Technical indicator patterns
const INDICATOR_PATTERNS = {
  indicators: /RSI|MACD|EMA|SMA|Bollinger Bands|VWAP|ATR|Stochastic|Fibonacci|Ichimoku|ADX|CCI|Williams %R/gi,
  timeframes: /1m|5m|15m|30m|1h|4h|Daily|Weekly|Monthly|timeframe|time frame/gi,
  patterns: /breakout|breakdown|trendline|support|resistance|channel|consolidation|reversal|continuation/gi,
  candlestick: /candlestick|doji|hammer|engulfing|morning star|evening star|harami|piercing line/gi
};

// Trading categories
const CATEGORY_PATTERNS = {
  scalping: /scalp|scalping|1m|5m|quick|rapid|high frequency/i,
  day_trading: /day trade|intraday|daily trading|15m|30m|1h chart/i,
  swing: /swing trading|swing trade|3-5 days|weekly|4h chart|daily chart/i,
  position: /position trading|long term|monthly|trend following|hold/i,
  algorithmic: /algorithmic|algo trading|automated|bot trading|quantitative/i
};

// Sentiment analysis
const SENTIMENT = {
  positive: /profitable|successful|winning|effective|robust|strong|excellent|outperform|gain|profit/i,
  negative: /losing|risky|dangerous|avoid|fail|unsuccessful|weak|underperform|loss/i
};

// HTTP request helper
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'text/html,application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        ...options.headers
      },
      timeout: 30000
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
}

// Fetch Medium articles via search (using RSS feeds)
async function fetchMediumArticles(query, limit = 10) {
  try {
    // Use Medium's RSS feed with search
    const encodedQuery = encodeURIComponent(query);
    const rssUrl = `https://medium.com/feed/tag/${encodedQuery.replace(/%20/g, '-')}`;
    
    const data = await httpsGet(rssUrl);
    
    // Parse RSS XML
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(data)) !== null && items.length < limit) {
      const itemXml = match[1];
      
      // Extract fields
      const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/);
      const creatorMatch = itemXml.match(/<dc:creator>(?:<!\[CDATA\[)?([^<]+)(?:\]\]>)?<\/dc:creator>/);
      const contentMatch = itemXml.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/);
      const categoryMatches = itemXml.match(/<category>(?:<!\[CDATA\[)?([^<]+)(?:\]\]>)?<\/category>/g);
      
      if (titleMatch && linkMatch) {
        // Clean HTML from content
        const content = contentMatch ? 
          contentMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
        
        // Estimate read time (200 words per minute)
        const wordCount = content.split(/\s+/).length;
        const readTime = Math.ceil(wordCount / 200);
        
        items.push({
          title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
          url: linkMatch[1].trim(),
          published: pubDateMatch ? new Date(pubDateMatch[1]) : null,
          author: creatorMatch ? creatorMatch[1].trim() : 'Unknown',
          content: content.slice(0, 5000), // Limit content size
          excerpt: content.slice(0, 300),
          wordCount,
          readTime,
          categories: categoryMatches ? 
            categoryMatches.map(c => c.replace(/<[^>]+>/g, '').trim()) : [],
          query
        });
      }
    }
    
    return items;
  } catch (err) {
    console.warn(`Error fetching Medium articles for "${query}":`, err.message);
    return [];
  }
}

// Extract strategy components from article
function extractStrategyComponents(article) {
  const text = `${article.title}\n\n${article.content}`;
  const components = {
    name: null,
    description: article.excerpt,
    entry: null,
    exit: null,
    risk: null,
    backtest: null,
    indicators: [],
    timeframes: [],
    category: null
  };
  
  // Extract strategy name
  for (const pattern of STRATEGY_PATTERNS.name) {
    const match = text.match(pattern);
    if (match) {
      components.name = match[1]?.trim() || match[0].trim();
      if (components.name.length > 100) {
        components.name = components.name.slice(0, 100);
      }
      break;
    }
  }
  
  // Use title if no name found
  if (!components.name) {
    components.name = article.title.replace(/^(How to|Trading|A Guide to)\s+/i, '').slice(0, 100);
  }
  
  // Extract entry rules
  for (const pattern of STRATEGY_PATTERNS.entry) {
    const match = text.match(pattern);
    if (match) {
      components.entry = cleanText(match[1]).slice(0, 800);
      break;
    }
  }
  
  // Extract exit rules
  for (const pattern of STRATEGY_PATTERNS.exit) {
    const match = text.match(pattern);
    if (match) {
      components.exit = cleanText(match[1]).slice(0, 800);
      break;
    }
  }
  
  // Extract risk management
  for (const pattern of STRATEGY_PATTERNS.risk) {
    const match = text.match(pattern);
    if (match) {
      components.risk = cleanText(match[1]).slice(0, 800);
      break;
    }
  }
  
  // Extract backtest metrics
  const backtestMetrics = {};
  for (const [metric, pattern] of Object.entries(STRATEGY_PATTERNS.backtest)) {
    if (metric === 'backtest') continue;
    const match = text.match(pattern);
    if (match) {
      backtestMetrics[metric] = parseFloat(match[1]);
    }
  }
  if (Object.keys(backtestMetrics).length > 0) {
    components.backtest = backtestMetrics;
  }
  
  // Detect indicators
  const indicatorMatches = text.match(INDICATOR_PATTERNS.indicators);
  if (indicatorMatches) {
    components.indicators = [...new Set(indicatorMatches.map(i => i.toUpperCase()))];
  }
  
  // Detect timeframes
  const timeframeMatches = text.match(INDICATOR_PATTERNS.timeframes);
  if (timeframeMatches) {
    components.timeframes = [...new Set(timeframeMatches)];
  }
  
  // Determine category
  for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(text)) {
      components.category = cat;
      break;
    }
  }
  
  return components;
}

// Clean extracted text
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\[\d+\]/g, '') // Remove citation markers
    .replace(/\*\*|__/g, '') // Remove markdown
    .replace(/^\s*[-•]\s*/gm, '') // Remove list markers
    .trim();
}

// Calculate confidence score
function calculateConfidence(article, components) {
  let score = 0;
  
  // Read time (0-0.2)
  if (article.readTime >= CONFIG.minReadTime) {
    score += Math.min(article.readTime / 20, 0.2);
  }
  
  // Has entry rules (0.25)
  if (components.entry) score += 0.25;
  
  // Has exit rules (0.2)
  if (components.exit) score += 0.2;
  
  // Has risk management (0.2)
  if (components.risk) score += 0.2;
  
  // Has backtest data (0.1)
  if (components.backtest) score += 0.1;
  
  // Has indicators (0.05)
  if (components.indicators.length > 0) score += 0.05;
  
  return Math.min(score, 1.0);
}

// Analyze sentiment
function analyzeSentiment(text) {
  const positiveMatches = (text.match(SENTIMENT.positive) || []).length;
  const negativeMatches = (text.match(SENTIMENT.negative) || []).length;
  const total = positiveMatches + negativeMatches;
  
  if (total === 0) return { score: 0, label: 'neutral' };
  
  const score = (positiveMatches - negativeMatches) / total;
  let label = 'neutral';
  if (score > 0.1) label = 'positive';
  if (score < -0.1) label = 'negative';
  
  return { score, label };
}

// Extract tokens mentioned
function extractTokens(text) {
  const tokens = new Set();
  const patterns = [
    /\b(BTC|ETH|SOL|ADA|DOT|AVAX|MATIC|LINK|UNI|AAVE|COMP|MKR|CRV|SNX|SUSHI|YFI)\b/g,
    /\$([A-Z]{2,8})\b/g,
    /\b(Bitcoin|Ethereum|Solana|Cardano|Polkadot|Avalanche|Polygon|Chainlink)\b/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      tokens.add(match[1] || match[0]);
    }
    pattern.lastIndex = 0;
  }
  
  return Array.from(tokens);
}

// Save to database
function saveToDatabase(strategies) {
  const dbFile = path.join(CONFIG.dataDir, 'medium-strategies.json');
  let existing = [];
  
  if (fs.existsSync(dbFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {
      console.warn('Could not read existing database');
    }
  }
  
  // Merge and deduplicate
  const urlMap = new Map(existing.map(s => [s.sourceUrl, s]));
  for (const strategy of strategies) {
    urlMap.set(strategy.sourceUrl, strategy);
  }
  
  const merged = Array.from(urlMap.values());
  merged.sort((a, b) => new Date(b.extractedAt) - new Date(a.extractedAt));
  
  fs.writeFileSync(dbFile, JSON.stringify(merged, null, 2));
  console.log(`\n💾 Saved ${strategies.length} strategies (${merged.length} total in database)`);
  
  return merged;
}

// Main analysis function
async function analyzeMedium() {
  console.log('🚀 Medium Trading Strategy Analyzer\n');
  console.log(`📊 Searching ${CONFIG.searchQueries.length} queries\n`);
  
  const allStrategies = [];
  const stats = {
    totalArticles: 0,
    strategiesFound: 0,
    withBacktest: 0,
    indicators: new Set()
  };
  
  for (const query of CONFIG.searchQueries) {
    console.log(`🔍 Searching: "${query}"...`);
    
    try {
      const articles = await fetchMediumArticles(query, CONFIG.articlesPerQuery);
      stats.totalArticles += articles.length;
      
      let queryStrategies = 0;
      
      for (const article of articles) {
        // Skip short articles
        if (article.readTime < CONFIG.minReadTime) continue;
        
        const components = extractStrategyComponents(article);
        const confidence = calculateConfidence(article, components);
        const sentiment = analyzeSentiment(article.content);
        const tokens = extractTokens(article.content);
        
        // Only save if it has some strategy components
        if (confidence > 0.3 || components.indicators.length > 0) {
          const strategy = {
            id: `medium_${Buffer.from(article.url).toString('base64').slice(0, 12)}`,
            sourceType: 'medium',
            sourceUrl: article.url,
            sourceName: 'Medium',
            title: article.title,
            author: article.author,
            content: article.content.slice(0, 1500),
            excerpt: article.excerpt,
            strategyName: components.name,
            description: components.description,
            entryRules: components.entry,
            exitRules: components.exit,
            riskRules: components.risk,
            backtestResults: components.backtest,
            indicators: components.indicators,
            timeframes: components.timeframes,
            tokensMentioned: tokens,
            sentimentScore: sentiment.score,
            sentimentLabel: sentiment.label,
            confidenceScore: confidence,
            readTime: article.readTime,
            wordCount: article.wordCount,
            strategyCategory: components.category,
            categories: article.categories,
            searchQuery: query,
            publishedAt: article.published?.toISOString(),
            extractedAt: new Date().toISOString()
          };
          
          allStrategies.push(strategy);
          queryStrategies++;
          
          // Update stats
          components.indicators.forEach(i => stats.indicators.add(i));
          if (components.backtest) stats.withBacktest++;
          
          // Log high-quality strategies
          if (confidence > 0.6 || components.backtest) {
            console.log(`  ✅ ${article.title.slice(0, 55)}...`);
            console.log(`     Confidence: ${(confidence * 100).toFixed(0)}% | Read time: ${article.readTime}min`);
            if (components.backtest) {
              const metrics = Object.entries(components.backtest)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
              console.log(`     Backtest: ${metrics}`);
            }
          }
        }
      }
      
      stats.strategiesFound += queryStrategies;
      console.log(`   Found ${queryStrategies} strategies\n`);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (err) {
      console.error(`   Error: ${err.message}\n`);
    }
  }
  
  // Save results
  saveToDatabase(allStrategies);
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 ANALYSIS SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total articles scanned: ${stats.totalArticles}`);
  console.log(`Strategies extracted: ${stats.strategiesFound}`);
  console.log(`With backtest data: ${stats.withBacktest}`);
  console.log(`Unique indicators: ${stats.indicators.size}`);
  console.log(`Indicators: ${Array.from(stats.indicators).slice(0, 15).join(', ')}`);
  
  // Top strategies
  console.log('\n🏆 TOP STRATEGIES BY CONFIDENCE:');
  const topStrategies = allStrategies
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 5);
  
  for (const s of topStrategies) {
    console.log(`  ${(s.confidenceScore * 100).toFixed(0)}% - ${s.title.slice(0, 50)}...`);
    if (s.indicators.length > 0) {
      console.log(`      Indicators: ${s.indicators.join(', ')}`);
    }
    if (s.backtestResults) {
      const results = Object.entries(s.backtestResults)
        .map(([k, v]) => `${k}: ${v}%`)
        .join(', ');
      console.log(`      Backtest: ${results}`);
    }
  }
  
  return allStrategies;
}

// Identify patterns across strategies
function identifyPatterns(strategies) {
  console.log('\n🔍 Identifying strategy patterns...\n');
  
  const patterns = {
    indicators: {},
    timeframes: {},
    categories: {},
    entryPhrases: {},
    exitPhrases: {}
  };
  
  for (const s of strategies) {
    // Indicator combinations
    for (const ind of s.indicators || []) {
      patterns.indicators[ind] = (patterns.indicators[ind] || 0) + 1;
    }
    
    // Timeframes
    for (const tf of s.timeframes || []) {
      patterns.timeframes[tf] = (patterns.timeframes[tf] || 0) + 1;
    }
    
    // Categories
    if (s.strategyCategory) {
      patterns.categories[s.strategyCategory] = (patterns.categories[s.strategyCategory] || 0) + 1;
    }
  }
  
  console.log('📊 PATTERN ANALYSIS:');
  
  // Most common indicators
  const topIndicators = Object.entries(patterns.indicators)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (topIndicators.length > 0) {
    console.log('\n  Most Used Indicators:');
    for (const [ind, count] of topIndicators) {
      console.log(`    ${ind}: ${count} strategies`);
    }
  }
  
  // Timeframe distribution
  const topTimeframes = Object.entries(patterns.timeframes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  if (topTimeframes.length > 0) {
    console.log('\n  Common Timeframes:');
    for (const [tf, count] of topTimeframes) {
      console.log(`    ${tf}: ${count} mentions`);
    }
  }
  
  // Categories
  if (Object.keys(patterns.categories).length > 0) {
    console.log('\n  Strategy Categories:');
    for (const [cat, count] of Object.entries(patterns.categories)) {
      console.log(`    ${cat}: ${count} strategies`);
    }
  }
  
  return patterns;
}

// Export sample strategies with full details
function exportSampleStrategies(strategies) {
  const sampleFile = path.join(CONFIG.dataDir, 'medium-samples.json');
  
  const samples = strategies
    .filter(s => s.confidenceScore > 0.5 || s.backtestResults)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 10)
    .map(s => ({
      title: s.title,
      author: s.author,
      source: s.sourceUrl,
      confidence: s.confidenceScore,
      category: s.strategyCategory,
      readTime: s.readTime,
      indicators: s.indicators,
      timeframes: s.timeframes,
      entryRules: s.entryRules,
      exitRules: s.exitRules,
      riskRules: s.riskRules,
      backtestResults: s.backtestResults,
      description: s.description
    }));
  
  fs.writeFileSync(sampleFile, JSON.stringify(samples, null, 2));
  console.log(`\n📝 Exported ${samples.length} sample strategies to ${sampleFile}`);
  
  return samples;
}

// Generate strategy report
function generateReport(strategies) {
  const reportFile = path.join(CONFIG.dataDir, 'medium-report.md');
  
  // Group by category
  const byCategory = {};
  for (const s of strategies) {
    const cat = s.strategyCategory || 'uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  }
  
  let report = `# Medium Trading Strategy Analysis Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- Total Strategies: ${strategies.length}\n`;
  report += `- With Backtest Data: ${strategies.filter(s => s.backtestResults).length}\n`;
  report += `- High Confidence (>70%): ${strategies.filter(s => s.confidenceScore > 0.7).length}\n\n`;
  
  report += `## Strategies by Category\n\n`;
  for (const [cat, items] of Object.entries(byCategory)) {
    report += `### ${cat.replace('_', ' ').toUpperCase()} (${items.length})\n\n`;
    for (const s of items.slice(0, 5)) {
      report += `#### ${s.title}\n`;
      report += `- **Author:** ${s.author}\n`;
      report += `- **Confidence:** ${(s.confidenceScore * 100).toFixed(0)}%\n`;
      report += `- **Indicators:** ${s.indicators.join(', ') || 'N/A'}\n`;
      if (s.backtestResults) {
        report += `- **Backtest:** ${JSON.stringify(s.backtestResults)}\n`;
      }
      report += `- **Link:** ${s.sourceUrl}\n\n`;
    }
  }
  
  fs.writeFileSync(reportFile, report);
  console.log(`\n📄 Generated report: ${reportFile}`);
  
  return report;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  
  switch (command) {
    case 'analyze':
      const strategies = await analyzeMedium();
      identifyPatterns(strategies);
      exportSampleStrategies(strategies);
      generateReport(strategies);
      break;
      
    case 'patterns':
      const dbFile = path.join(CONFIG.dataDir, 'medium-strategies.json');
      if (fs.existsSync(dbFile)) {
        const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        identifyPatterns(data);
      }
      break;
      
    case 'report':
      const reportDb = path.join(CONFIG.dataDir, 'medium-strategies.json');
      if (fs.existsSync(reportDb)) {
        const data = JSON.parse(fs.readFileSync(reportDb, 'utf8'));
        generateReport(data);
      }
      break;
      
    case 'export':
      const exportDb = path.join(CONFIG.dataDir, 'medium-strategies.json');
      if (fs.existsSync(exportDb)) {
        const data = JSON.parse(fs.readFileSync(exportDb, 'utf8'));
        exportSampleStrategies(data);
      }
      break;
      
    case 'backtested':
      const btDb = path.join(CONFIG.dataDir, 'medium-strategies.json');
      if (fs.existsSync(btDb)) {
        const data = JSON.parse(fs.readFileSync(btDb, 'utf8'));
        const withBacktest = data.filter(s => s.backtestResults);
        console.log(`\n📊 Strategies with backtest data: ${withBacktest.length}\n`);
        for (const s of withBacktest.slice(0, 10)) {
          console.log(`- ${s.title}`);
          console.log(`  ${JSON.stringify(s.backtestResults)}`);
          console.log(`  ${s.sourceUrl}\n`);
        }
      }
      break;
      
    default:
      console.log('Medium Trading Strategy Analyzer\n');
      console.log('Commands:');
      console.log('  analyze   - Fetch and analyze Medium articles (default)');
      console.log('  patterns  - Show recurring patterns');
      console.log('  report    - Generate markdown report');
      console.log('  export    - Export sample strategies');
      console.log('  backtested- List strategies with backtest data');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  analyzeMedium,
  extractStrategyComponents,
  calculateConfidence,
  fetchMediumArticles
};
