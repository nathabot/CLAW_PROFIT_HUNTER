/**
 * ADVANCED LEARNING AGENT v2
 * Extracts trending, analyzes viral patterns, auto-updates strategy
 */
const { chromium } = require('playwright');
const fs = require('fs');

const SESSION_FILE = '/root/trading-bot/src/twitter/session.json';
const LEARNINGS_FILE = '/root/trading-bot/twitter-bot/learning/learnings.json';
const OBSERVATIONS_FILE = '/root/trading-bot/twitter-bot/learning/observations.json';
const CONTENT_FILE = '/root/trading-bot/twitter-bot/content.json';

// Viral accounts to study
const TARGET_ACCOUNTS = [
  'JamesClear', 'TimFerriss', 'SimonSinek', 'melaniheylen', 'lewishowes',
  'sama', 'anthropicai', 'AndrewYNg', 'fchollet', 'ylecun',
  'tom_doerr', 'levelsio', 'swyx', 'addyoswani', 'raaa'
];

class AdvancedLearningAgent {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.learnings = this.loadLearnings();
    this.observations = this.loadObservations();
  }
  
  loadLearnings() {
    try {
      return JSON.parse(fs.readFileSync(LEARNINGS_FILE, 'utf8'));
    } catch {
      return { 
        timestamp: null,
        patterns: [],
        recommendations: { content_length: '<150 chars', timing: '7-9am, 12-1pm, 7-9pm', themes: ['tips', 'questions', 'code'] }
      };
    }
  }
  
  loadObservations() {
    try {
      return JSON.parse(fs.readFileSync(OBSERVATIONS_FILE, 'utf8'));
    } catch {
      return { viral_tweets: [], hashtags: [], topics: [], last_updated: null };
    }
  }
  
  async init() {
    let sessionCookie = null;
    if (fs.existsSync(SESSION_FILE)) {
      sessionCookie = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      sessionCookie = sessionCookie.map(c => {
        if (c.sameSite && typeof c.sameSite === 'string') {
          if (c.sameSite.toLowerCase() === 'lax') c.sameSite = 'Lax';
          if (c.sameSite.toLowerCase() === 'none') c.sameSite = 'None';
          if (c.sameSite.toLowerCase() === 'unspecified') c.sameSite = 'Lax';
        }
        delete c.hostOnly;
        delete c.storeId;
        delete c.id;
        return c;
      });
    }
    
    this.browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    if (sessionCookie) await this.context.addCookies(sessionCookie);
    this.page = await this.context.newPage();
    return this;
  }
  
  async close() {
    if (this.browser) await this.browser.close();
  }
  
  // Extract hashtags from tweet text
  extractHashtags(text) {
    const matches = text.match(/#[a-zA-Z0-9_]+/g);
    return matches ? [...new Set(matches)] : [];
  }
  
  // Analyze a single tweet
  async analyzeTweet(tweet) {
    try {
      const text = await tweet.$eval('[data-testid="tweetText"]', el => el.innerText);
      const metrics = await tweet.evaluate(async (el) => {
        const replies = await el.$eval('[data-testid="reply"]', e => e.innerText).catch(() => '0');
        const retweets = await el.$eval('[data-testid="retweet"]', e => e.innerText).catch(() => '0');
        const likes = await el.$eval('[data-testid="like"]', e => e.innerText).catch(() => '0');
        return { replies, retweets, likes };
      });
      
      return {
        text: text.substring(0, 200),
        hashtags: this.extractHashtags(text),
        engagement: this.parseMetric(metrics.likes),
        retweets: this.parseMetric(metrics.retweets),
        replies: this.parseMetric(metrics.replies)
      };
    } catch {
      return null;
    }
  }
  
  parseMetric(str) {
    if (!str) return 0;
    str = str.replace(/[,.]/g, '');
    if (str.includes('K')) return parseFloat(str) * 1000;
    if (str.includes('M')) return parseFloat(str) * 1000000;
    return parseInt(str) || 0;
  }
  
  // Study an account's recent tweets
  async studyAccount(username) {
    console.log(`📚 Studying @${username}...`);
    
    await this.page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);
    
    const tweets = await this.page.$$('[data-testid="tweet"]');
    const analyzed = [];
    
    for (let i = 0; i < Math.min(5, tweets.length); i++) {
      const data = await this.analyzeTweet(tweets[i]);
      if (data) analyzed.push(data);
    }
    
    return analyzed;
  }
  
  // Get trending topics
  async getTrending() {
    console.log('📈 Getting trending topics...');
    
    await this.page.goto('https://x.com/explore', { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);
    
    const trends = await this.page.$$eval('[data-testid="trend"]', els => 
      els.slice(0, 10).map(e => e.innerText.split('\n')[0])
    ).catch(() => []);
    
    return trends;
  }
  
  // Analyze and update learnings
  analyzeResults(allTweets) {
    // Filter viral (high engagement)
    const viral = allTweets.filter(t => t.engagement > 100);
    
    // Extract common patterns
    const hashtags = allTweets.flatMap(t => t.hashtags);
    const hashtagCounts = {};
    hashtags.forEach(h => hashtagCounts[h] = (hashtagCounts[h] || 0) + 1);
    
    const topHashtags = Object.entries(hashtagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([h]) => h);
    
    // Analyze tweet length vs engagement
    const shortTweets = allTweets.filter(t => t.text.length < 150);
    const longTweets = allTweets.filter(t => t.text.length >= 150);
    const shortAvg = shortTweets.reduce((a, b) => a + b.engagement, 0) / (shortTweets.length || 1);
    const longAvg = longTweets.reduce((a, b) => a + b.engagement, 0) / (longTweets.length || 1);
    
    // Content type patterns
    const patterns = {
      short_better: shortAvg > longAvg,
      avg_short_length: Math.round(allTweets.reduce((a, b) => a + b.text.length, 0) / allTweets.length),
      top_hashtags: topHashtags,
      viral_count: viral.length,
      sample_size: allTweets.length
    };
    
    // Update recommendations
    const recommendations = {
      content_length: patterns.short_better ? '<120 chars' : '<180 chars',
      timing: '7-9am, 12-1pm, 7-9pm, 9-11pm',
      themes: this.deriveThemes(allTweets),
      use_hashtags: topHashtags.slice(0, 3),
      engagement_tip: patterns.short_better ? 'Short & punchy works best' : 'Medium length ok too'
    };
    
    return { patterns, recommendations, viral };
  }
  
  deriveThemes(tweets) {
    const themes = { tips: 0, ai: 0, code: 0, motivation: 0, question: 0 };
    tweets.forEach(t => {
      const text = t.text.toLowerCase();
      if (text.includes('tip') || text.includes('hack')) themes.tips++;
      if (text.includes('ai') || text.includes('gpt') || text.includes('claude')) themes.ai++;
      if (text.includes('code') || text.includes('github') || text.includes('dev')) themes.code++;
      if (text.includes('?') || text.includes('who')) themes.question++;
      if (text.includes('great') || text.includes('awesome') || text.includes('💪')) themes.motivation++;
    });
    
    return Object.entries(themes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t);
  }
  
  async run() {
    console.log('🧠 Advanced Learning Agent v2 starting...');
    await this.init();
    
    const allTweets = [];
    
    // Study target accounts
    for (const username of TARGET_ACCOUNTS.slice(0, 5)) {
      const tweets = await this.studyAccount(username);
      allTweets.push(...tweets);
      await this.page.waitForTimeout(2000);
    }
    
    // Get trending
    const trending = await this.getTrending();
    
    // Analyze
    const { patterns, recommendations, viral } = this.analyzeResults(allTweets);
    
    // Update learnings
    this.learnings = {
      timestamp: new Date().toISOString(),
      patterns,
      recommendations,
      viral_sample: viral.slice(0, 5).map(t => t.text.substring(0, 100))
    };
    
    this.observations.viral_tweets = [...viral.slice(0, 10), ...this.observations.viral_tweets].slice(0, 50);
    this.observations.hashtags = [...patterns.top_hashtags, ...this.observations.hashtags].slice(0, 30);
    this.observations.topics = [...recommendations.themes, ...this.observations.topics].slice(0, 20);
    this.observations.last_updated = new Date().toISOString();
    
    // Save
    fs.writeFileSync(LEARNINGS_FILE, JSON.stringify(this.learnings, null, 2));
    fs.writeFileSync(OBSERVATIONS_FILE, JSON.stringify(this.observations, null, 2));
    
    console.log('\n📊 Learning Results:');
    console.log('  - Sample size:', patterns.sample_size);
    console.log('  - Short better:', patterns.short_better);
    console.log('  - Top hashtags:', patterns.top_hashtags.slice(0, 3).join(', '));
    console.log('  - Recommended length:', recommendations.content_length);
    console.log('  - Themes:', recommendations.themes.join(', '));
    console.log('  - Trending:', trending.slice(0, 5).join(', '));
    
    console.log('\n✅ Learning complete!');
    await this.close();
  }
}

if (require.main === module) {
  const agent = new AdvancedLearningAgent();
  agent.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = AdvancedLearningAgent;
