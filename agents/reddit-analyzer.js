#!/usr/bin/env node
/**
 * Reddit Trading Strategy Analyzer
 * Extracts trading strategies and token mentions from crypto subreddits
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration
const CONFIG = {
  subreddits: [
    'SatoshiStreetBets',
    'CryptoMoonShots',
    'CryptoCurrency',
    'Solana',
    'DeFi',
    'altcoin',
    'CryptoMarkets'
  ],
  postsPerSubreddit: 25,
  minUpvotes: 5,
  userAgent: 'TradingStrategyAnalyzer/1.0 (Research Bot)',
  dbPath: path.join(__dirname, '../database/strategies.db'),
  dataDir: path.join(__dirname, '../data')
};

// Ensure data directory exists
if (!fs.existsSync(CONFIG.dataDir)) {
  fs.mkdirSync(CONFIG.dataDir, { recursive: true });
}

// Token patterns for extraction
const TOKEN_PATTERNS = {
  // Common token symbols (uppercase 2-5 chars with context)
  symbol: /\b([A-Z]{2,5})\b/g,
  // Ticker mentions with $ prefix
  ticker: /\$([A-Za-z]{2,8})\b/g,
  // Explicit mentions
  explicit: /\b(?:token|coin|crypto)\s+(?:is|called|named)?\s*[:\-]?\s*([A-Z][a-zA-Z]*)/gi,
  // Contract addresses (Solana/Ethereum)
  contract: /\b([A-Za-z0-9]{32,44})\b/g
};

// Strategy pattern detection
const STRATEGY_PATTERNS = {
  // Entry patterns
  entry: [
    /entry[:\s]+(.*?)(?:exit|stop|target|$)/is,
    /buy[:\s]+(.*?)(?:sell|stop|$)/is,
    /long[:\s]+(.*?)(?:short|close|$)/is,
    /enter[:\s]+(.*?)(?:exit|when|$)/is,
    /position[:\s]+(.*?)(?:close|target|$)/is
  ],
  // Exit patterns  
  exit: [
    /exit[:\s]+(.*?)(?:entry|stop|$)/is,
    /sell[:\s]+(.*?)(?:buy|target|$)/is,
    /take profit[:\s]+(.*?)(?:stop|entry|$)/is,
    /tp[:\s]+(.*?)(?:sl|entry|$)/is,
    /close[:\s]+(.*?)(?:open|entry|$)/is
  ],
  // Risk management
  risk: [
    /stop loss[:\s]+(.*?)(?:target|entry|$)/is,
    /sl[:\s]+(.*?)(?:tp|target|$)/is,
    /risk[:\s]+(.*?)(?:reward|ratio|$)/is,
    /position size[:\s]+(.*?)(?:risk|$)/is,
    /max loss[:\s]+(.*?)(?:profit|$)/is
  ],
  // Strategy categories
  category: {
    scalping: /scalp|scalping|1m|5m|quick trade/i,
    day_trading: /day trade|intraday|daily|15m|30m|1h/i,
    swing: /swing|3day|weekly|4h|daily chart/i,
    position: /position|long.?term|hold|monthly|weekly trend/i
  }
};

// TA Pattern detection
const TA_PATTERNS = {
  chart_patterns: /head and shoulders|double top|double bottom|triangle|wedge|flag|pennant|cup and handle/i,
  indicators: /rsi|macd|ema|sma|bollinger|fibonacci|support|resistance|volume|vwap/i,
  candlestick: /doji|hammer|engulfing|morning star|evening star|harami/i,
  trend: /breakout|breakdown|uptrend|downtrend|consolidation|ranging|accumulation|distribution/i
};

// Sentiment keywords
const SENTIMENT = {
  positive: /bullish|moon|pump|gain|profit|rocket|gem|undervalued|buy|long|support|breakout/i,
  negative: /bearish|dump|crash|loss|rug|scam|overvalued|sell|short|resistance|breakdown/i
};

// Utility: HTTP GET with promises
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/json',
        ...options.headers
      },
      timeout: 30000
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
}

// Fetch posts from subreddit
async function fetchSubredditPosts(subreddit, sort = 'hot', limit = 25) {
  try {
    // Use Reddit's JSON API (no auth required for public posts)
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;
    const data = await httpsGet(url);
    
    if (!data || !data.data || !data.data.children) {
      console.warn(`No data for r/${subreddit}`);
      return [];
    }
    
    return data.data.children.map(child => ({
      id: child.data.id,
      title: child.data.title,
      selftext: child.data.selftext || '',
      author: child.data.author,
      subreddit: child.data.subreddit,
      upvotes: child.data.ups,
      downvotes: child.data.downs,
      score: child.data.score,
      numComments: child.data.num_comments,
      upvoteRatio: child.data.upvote_ratio,
      url: `https://reddit.com${child.data.permalink}`,
      externalUrl: child.data.url,
      created: new Date(child.data.created_utc * 1000),
      isSelf: child.data.is_self,
      linkFlair: child.data.link_flair_text,
      awards: child.data.total_awards_received || 0
    }));
  } catch (err) {
    console.error(`Error fetching r/${subreddit}:`, err.message);
    return [];
  }
}

// Extract tokens from text
function extractTokens(text) {
  const tokens = new Set();
  const context = [];
  
  // Common false positives to filter
  const falsePositives = new Set([
    'USD', 'USDT', 'BTC', 'ETH', 'THE', 'FOR', 'AND', 'ARE', 'BUT', 'NOT', 
    'YOU', 'ALL', 'CAN', 'HAD', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY',
    'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'MAN', 'NEW', 'NOW', 'OLD', 'SEE',
    'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE',
    'TOO', 'USE', 'DAD', 'MOM', 'ANN', 'AMA', 'FAQ', 'EDIT', 'LOL', 'WTF',
    'IMO', 'IMHO', 'TLDR', 'TL;DR', 'FUD', 'FOMO', 'ATH', 'ATL', 'DCA',
    'KYC', 'AML', 'NFT', 'DEFI', 'DAO', 'APY', 'APR', 'TVL', 'DEX', 'CEX'
  ]);
  
  // Symbol extraction
  let match;
  while ((match = TOKEN_PATTERNS.symbol.exec(text)) !== null) {
    const symbol = match[1];
    if (!falsePositives.has(symbol) && symbol.length >= 2) {
      tokens.add(symbol);
      // Get context (30 chars before and after)
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + symbol.length + 30);
      context.push(text.slice(start, end).replace(/\s+/g, ' '));
    }
  }
  TOKEN_PATTERNS.symbol.lastIndex = 0;
  
  // Ticker extraction ($XXX)
  while ((match = TOKEN_PATTERNS.ticker.exec(text)) !== null) {
    const ticker = match[1].toUpperCase();
    if (!falsePositives.has(ticker)) {
      tokens.add(ticker);
    }
  }
  TOKEN_PATTERNS.ticker.lastIndex = 0;
  
  return { tokens: Array.from(tokens), context };
}

// Analyze sentiment
function analyzeSentiment(text) {
  const positiveMatches = (text.match(SENTIMENT.positive) || []).length;
  const negativeMatches = (text.match(SENTIMENT.negative) || []).length;
  const total = positiveMatches + negativeMatches;
  
  if (total === 0) return { score: 0, label: 'neutral' };
  
  const score = (positiveMatches - negativeMatches) / total;
  let label = 'neutral';
  if (score > 0.2) label = 'positive';
  if (score < -0.2) label = 'negative';
  
  return { score, label, positiveMatches, negativeMatches };
}

// Extract strategy components
function extractStrategy(text) {
  const strategy = {
    name: null,
    description: null,
    entry: null,
    exit: null,
    risk: null,
    category: null,
    taPatterns: []
  };
  
  // Detect category
  for (const [cat, pattern] of Object.entries(STRATEGY_PATTERNS.category)) {
    if (pattern.test(text)) {
      strategy.category = cat;
      break;
    }
  }
  
  // Extract entry rules
  for (const pattern of STRATEGY_PATTERNS.entry) {
    const match = text.match(pattern);
    if (match) {
      strategy.entry = match[1].trim().slice(0, 500);
      break;
    }
  }
  
  // Extract exit rules
  for (const pattern of STRATEGY_PATTERNS.exit) {
    const match = text.match(pattern);
    if (match) {
      strategy.exit = match[1].trim().slice(0, 500);
      break;
    }
  }
  
  // Extract risk rules
  for (const pattern of STRATEGY_PATTERNS.risk) {
    const match = text.match(pattern);
    if (match) {
      strategy.risk = match[1].trim().slice(0, 500);
      break;
    }
  }
  
  // Detect TA patterns
  for (const [type, pattern] of Object.entries(TA_PATTERNS)) {
    const matches = text.match(pattern);
    if (matches) {
      strategy.taPatterns.push(...matches.map(m => ({ type, pattern: m })));
    }
  }
  
  // Generate strategy name from content
  if (strategy.entry || strategy.exit) {
    const lines = text.split('\n').filter(l => l.length > 20 && l.length < 200);
    if (lines.length > 0) {
      strategy.name = lines[0].replace(/^#+\s*/, '').slice(0, 100);
    }
  }
  
  return strategy;
}

// Calculate confidence score based on engagement
function calculateConfidence(post) {
  let score = 0;
  
  // Upvote ratio (0-0.3)
  if (post.upvoteRatio) {
    score += post.upvoteRatio * 0.3;
  }
  
  // Comment engagement (0-0.25)
  const commentRatio = Math.min(post.numComments / 100, 1);
  score += commentRatio * 0.25;
  
  // Upvotes (0-0.25)
  const upvoteScore = Math.min(post.upvotes / 1000, 1);
  score += upvoteScore * 0.25;
  
  // DD flair bonus (0.1)
  if (post.linkFlair && /DD|Due Diligence|Analysis|Research/i.test(post.linkFlair)) {
    score += 0.1;
  }
  
  // Awards (0-0.1)
  const awardScore = Math.min(post.awards / 5, 0.1);
  score += awardScore;
  
  return Math.min(score, 1.0);
}

// Check if post is Due Diligence
function isDueDiligence(post) {
  const text = `${post.title} ${post.selftext}`;
  
  // Check flair
  if (post.linkFlair && /DD|Due Diligence|Research|Analysis|Fundamental/i.test(post.linkFlair)) {
    return true;
  }
  
  // Check title patterns
  if (/\[DD\]|\[Due Diligence\]|Deep Dive|Fundamental Analysis/i.test(post.title)) {
    return true;
  }
  
  // Check content length and structure
  if (post.selftext.length > 1500) {
    const ddIndicators = [
      /tokenomics/i,
      /market.?cap/i,
      /circulating.?supply/i,
      /team/i,
      /roadmap/i,
      /whitepaper/i,
      /use.?case/i,
      /competitor/i,
      /risk/i
    ];
    const matches = ddIndicators.filter(p => p.test(text)).length;
    if (matches >= 3) return true;
  }
  
  return false;
}

// Simple JSON-based storage (SQLite would require better-sqlite3 package)
function saveToDatabase(strategies) {
  const dbFile = path.join(CONFIG.dataDir, 'reddit-strategies.json');
  let existing = [];
  
  if (fs.existsSync(dbFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {
      console.warn('Could not read existing database');
    }
  }
  
  // Merge and deduplicate by URL
  const urlMap = new Map(existing.map(s => [s.sourceUrl, s]));
  for (const strategy of strategies) {
    urlMap.set(strategy.sourceUrl, strategy);
  }
  
  const merged = Array.from(urlMap.values());
  merged.sort((a, b) => new Date(b.extractedAt) - new Date(a.extractedAt));
  
  fs.writeFileSync(dbFile, JSON.stringify(merged, null, 2));
  console.log(`\n💾 Saved ${strategies.length} strategies to database (${merged.length} total)`);
  
  return merged;
}

// Analyze a single post
function analyzePost(post) {
  const fullText = `${post.title}\n\n${post.selftext}`;
  
  // Extract components
  const tokens = extractTokens(fullText);
  const sentiment = analyzeSentiment(fullText);
  const strategy = extractStrategy(fullText);
  const confidence = calculateConfidence(post);
  const isDD = isDueDiligence(post);
  
  // Only return if we found something valuable
  if (tokens.tokens.length === 0 && !strategy.entry && !strategy.exit && !isDD) {
    return null;
  }
  
  return {
    id: `reddit_${post.id}`,
    sourceType: 'reddit',
    sourceUrl: post.url,
    sourceName: post.subreddit,
    externalUrl: post.externalUrl,
    title: post.title,
    content: post.selftext.slice(0, 2000),
    author: post.author,
    strategyName: strategy.name,
    description: strategy.name,
    entryRules: strategy.entry,
    exitRules: strategy.exit,
    riskRules: strategy.risk,
    tokensMentioned: tokens.tokens,
    tokenContext: tokens.context,
    sentimentScore: sentiment.score,
    sentimentLabel: sentiment.label,
    confidenceScore: confidence,
    engagementScore: post.upvotes,
    commentCount: post.numComments,
    upvoteRatio: post.upvoteRatio,
    isDueDiligence: isDD,
    technicalPatterns: strategy.taPatterns,
    strategyCategory: strategy.category,
    createdAt: post.created.toISOString(),
    extractedAt: new Date().toISOString()
  };
}

// Main analysis function
async function analyzeSubreddits() {
  console.log('🚀 Reddit Trading Strategy Analyzer\n');
  console.log(`📊 Monitoring ${CONFIG.subreddits.length} subreddits\n`);
  
  const allStrategies = [];
  const stats = {
    totalPosts: 0,
    strategiesFound: 0,
    tokensFound: new Set(),
    ddPosts: 0
  };
  
  for (const subreddit of CONFIG.subreddits) {
    console.log(`🔍 Fetching r/${subreddit}...`);
    
    try {
      const posts = await fetchSubredditPosts(subreddit, 'hot', CONFIG.postsPerSubreddit);
      stats.totalPosts += posts.length;
      
      let subredditStrategies = 0;
      
      for (const post of posts) {
        // Skip low engagement posts
        if (post.upvotes < CONFIG.minUpvotes) continue;
        
        const analysis = analyzePost(post);
        if (analysis) {
          allStrategies.push(analysis);
          subredditStrategies++;
          
          // Update stats
          analysis.tokensMentioned.forEach(t => stats.tokensFound.add(t));
          if (analysis.isDueDiligence) stats.ddPosts++;
          
          // Log high-quality findings
          if (analysis.confidenceScore > 0.5 || analysis.isDueDiligence) {
            console.log(`  ✅ ${analysis.isDueDiligence ? '[DD] ' : ''}${post.title.slice(0, 60)}...`);
            console.log(`     Confidence: ${(analysis.confidenceScore * 100).toFixed(1)}% | Tokens: ${analysis.tokensMentioned.join(', ') || 'none'}`);
            if (analysis.strategyCategory) {
              console.log(`     Category: ${analysis.strategyCategory}`);
            }
          }
        }
      }
      
      stats.strategiesFound += subredditStrategies;
      console.log(`   Found ${subredditStrategies} strategies\n`);
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
      
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
  console.log(`Total posts scanned: ${stats.totalPosts}`);
  console.log(`Strategies extracted: ${stats.strategiesFound}`);
  console.log(`Due Diligence posts: ${stats.ddPosts}`);
  console.log(`Unique tokens found: ${stats.tokensFound.size}`);
  console.log(`Tokens: ${Array.from(stats.tokensFound).slice(0, 15).join(', ')}${stats.tokensFound.size > 15 ? '...' : ''}`);
  
  // Top strategies by confidence
  console.log('\n🏆 TOP STRATEGIES BY CONFIDENCE:');
  const topStrategies = allStrategies
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 5);
  
  for (const s of topStrategies) {
    console.log(`  ${(s.confidenceScore * 100).toFixed(0)}% - ${s.title.slice(0, 50)}...`);
    console.log(`      ${s.sourceName} | ${s.tokensMentioned.slice(0, 3).join(', ') || 'no tokens'}`);
  }
  
  return allStrategies;
}

// Pattern recognition for recurring strategies
function identifyPatterns(strategies) {
  console.log('\n🔍 Identifying recurring patterns...\n');
  
  const patterns = {
    indicatorCombos: {},
    entryPhrases: {},
    riskPhrases: {},
    tokenMentions: {}
  };
  
  for (const s of strategies) {
    // Count TA pattern combinations
    if (s.technicalPatterns) {
      for (const p of s.technicalPatterns) {
        const key = `${p.type}:${p.pattern.toLowerCase()}`;
        patterns.indicatorCombos[key] = (patterns.indicatorCombos[key] || 0) + 1;
      }
    }
    
    // Token frequency
    for (const token of s.tokensMentioned) {
      patterns.tokenMentions[token] = (patterns.tokenMentions[token] || 0) + 1;
    }
  }
  
  // Display patterns with 2+ occurrences
  console.log('📊 RECURRING PATTERNS:');
  
  const frequentPatterns = Object.entries(patterns.indicatorCombos)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (frequentPatterns.length > 0) {
    console.log('\n  Technical Analysis Patterns:');
    for (const [pattern, count] of frequentPatterns) {
      console.log(`    ${pattern}: ${count} occurrences`);
    }
  }
  
  const frequentTokens = Object.entries(patterns.tokenMentions)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (frequentTokens.length > 0) {
    console.log('\n  Most Mentioned Tokens:');
    for (const [token, count] of frequentTokens) {
      console.log(`    ${token}: ${count} mentions`);
    }
  }
  
  return patterns;
}

// Export sample strategies
function exportSampleStrategies(strategies) {
  const sampleFile = path.join(CONFIG.dataDir, 'reddit-samples.json');
  
  // Get top strategies with complete data
  const samples = strategies
    .filter(s => s.entryRules || s.exitRules || s.isDueDiligence)
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 10)
    .map(s => ({
      title: s.title,
      source: s.sourceUrl,
      tokens: s.tokensMentioned,
      category: s.strategyCategory,
      entry: s.entryRules,
      exit: s.exitRules,
      risk: s.riskRules,
      sentiment: s.sentimentLabel,
      confidence: s.confidenceScore,
      isDD: s.isDueDiligence,
      patterns: s.technicalPatterns?.slice(0, 5) || []
    }));
  
  fs.writeFileSync(sampleFile, JSON.stringify(samples, null, 2));
  console.log(`\n📝 Exported ${samples.length} sample strategies to ${sampleFile}`);
  
  return samples;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  
  switch (command) {
    case 'analyze':
      const strategies = await analyzeSubreddits();
      identifyPatterns(strategies);
      exportSampleStrategies(strategies);
      break;
      
    case 'patterns':
      const dbFile = path.join(CONFIG.dataDir, 'reddit-strategies.json');
      if (fs.existsSync(dbFile)) {
        const existing = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        identifyPatterns(existing);
      } else {
        console.log('No database found. Run analyze first.');
      }
      break;
      
    case 'tokens':
      const db = path.join(CONFIG.dataDir, 'reddit-strategies.json');
      if (fs.existsSync(db)) {
        const data = JSON.parse(fs.readFileSync(db, 'utf8'));
        const tokens = {};
        for (const s of data) {
          for (const t of s.tokensMentioned) {
            if (!tokens[t]) tokens[t] = { count: 0, sentiment: 0, sources: [] };
            tokens[t].count++;
            tokens[t].sentiment += s.sentimentScore;
            tokens[t].sources.push(s.sourceName);
          }
        }
        
        console.log('\n📈 TOKEN ANALYSIS:\n');
        const sorted = Object.entries(tokens)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 20);
        
        for (const [token, data] of sorted) {
          const avgSentiment = data.sentiment / data.count;
          const sentimentLabel = avgSentiment > 0.1 ? '🟢' : avgSentiment < -0.1 ? '🔴' : '⚪';
          console.log(`  ${sentimentLabel} ${token}: ${data.count} mentions (sentiment: ${avgSentiment.toFixed(2)})`);
        }
      }
      break;
      
    case 'export':
      const exportDb = path.join(CONFIG.dataDir, 'reddit-strategies.json');
      if (fs.existsSync(exportDb)) {
        const data = JSON.parse(fs.readFileSync(exportDb, 'utf8'));
        exportSampleStrategies(data);
      }
      break;
      
    default:
      console.log('Reddit Trading Strategy Analyzer\n');
      console.log('Commands:');
      console.log('  analyze  - Fetch and analyze subreddits (default)');
      console.log('  patterns - Show recurring patterns in saved data');
      console.log('  tokens   - Analyze token mentions and sentiment');
      console.log('  export   - Export sample strategies');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  analyzeSubreddits,
  extractTokens,
  analyzeSentiment,
  extractStrategy,
  calculateConfidence
};
