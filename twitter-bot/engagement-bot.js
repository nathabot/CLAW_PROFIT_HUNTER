/**
 * ENGAGEMENT BOT v2 - With Auto-Learning
 * Gains followers through strategic interactions + learns from top accounts
 */
const { chromium } = require('playwright');
const fs = require('fs');

const SESSION_FILE = '/root/trading-bot/src/twitter/session.json';
const STATE_FILE = '/root/trading-bot/twitter-bot/engagement-state.json';
const LEARNINGS_FILE = '/root/trading-bot/twitter-bot/learning/influencers.json';

// Extended target accounts - auto-learned
const DEFAULT_TARGETS = {
  ai_ml: ['sama', 'anthropicai', 'AndrewYNg', 'fchollet', 'ylecun', 'JeffDean', 'mdudas', 'swyx', 'sruthi_ab', 'dynamicwebpaige'],
  crypto: ['solana', 'jup_io', 'RaydiumProtocol', 'MeteoraAG', 'CryptoDad', 'MinaProtocol', '星火0619', '0xtesting', 'jumper_exchange'],
  tech: ['elonmusk', 'levelsio', 'jacobrosenthal', 'mbxtiger', 'LunaRani0x', '0xfoobar', 'rogerkver', 'bgme'],
  productivity: ['JamesClear', 'TimFerriss', 'SimonSinek', 'melaniheylen', 'lewishowes', 'tom_doerr'],
  dev: ['addyoswani', 'raaa', 'davidgfnet', 'kelseyhightower', 'rwampler']
};

const REPLY_TEMPLATES = [
  "Great point! 👍", "Exactly! 🎯", "This! 💯", "Well said 👏", 
  "Facts 💪", "Love this! ✨", "So true! 🔥"
];

class EngagementBot {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.state = this.loadState();
    this.targets = this.loadTargets();
  }
  
  loadState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      return { followed: [], liked: [], replied: [], lastRun: null, totalEngagements: 0 };
    }
  }
  
  loadTargets() {
    try {
      return JSON.parse(fs.readFileSync(LEARNINGS_FILE, 'utf8'));
    } catch {
      return DEFAULT_TARGETS;
    }
  }
  
  saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
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
  
  // Get all targets as flat array
  getAllTargets() {
    const all = [];
    for (const category of Object.values(this.targets)) {
      all.push(...category);
    }
    return [...new Set(all)]; // dedupe
  }
  
  // Learn new accounts from a category
  async learnFromCategory(category, count = 3) {
    console.log(`📚 Learning from ${category}...`);
    
    // Search for trending in category
    await this.page.goto(`https://x.com/explore/tabs/${category}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);
    
    // Get top accounts from search
    const accounts = await this.page.$$('[data-testid="UserCell"]');
    const newAccounts = [];
    
    for (let i = 0; i < Math.min(count, accounts.length); i++) {
      try {
        const handle = await accounts[i].$eval('a', a => a.href.split('/').pop());
        if (handle && !handle.includes('?')) {
          newAccounts.push(handle);
        }
      } catch {}
    }
    
    if (newAccounts.length > 0 && !this.targets[category]) {
      this.targets[category] = [];
    }
    if (newAccounts.length > 0) {
      this.targets[category] = [...new Set([...this.targets[category], ...newAccounts])];
      fs.writeFileSync(LEARNINGS_FILE, JSON.stringify(this.targets, null, 2));
      console.log(`✅ Learned ${newAccounts.length} new accounts in ${category}`);
    }
  }
  
  async followUser(username) {
    if (this.state.followed.includes(username)) return false;
    
    try {
      await this.page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000);
      
      const followBtn = await this.page.$('button[data-testid="followButton"]');
      if (followBtn) {
        await followBtn.click();
        await this.page.waitForTimeout(500);
        this.state.followed.push(username);
        this.state.totalEngagements++;
        console.log(`✅ Followed: @${username}`);
        return true;
      }
    } catch (e) {
      console.log(`❌ Failed follow: ${username}`);
    }
    return false;
  }
  
  async likeTweet(tweet) {
    try {
      const likeBtn = await tweet.$('button[data-testid="unlike"]');
      if (!likeBtn) {
        const unlikeBtn = await tweet.$('button[data-testid="like"]');
        if (unlikeBtn) {
          await unlikeBtn.click();
          this.state.totalEngagements++;
          return true;
        }
      }
    } catch {}
    return false;
  }
  
  async engageWithAccount(username) {
    if (this.state.totalEngagements >= 20) {
      console.log('⚠️ Daily limit reached');
      return;
    }
    
    console.log(`\n📱 Engaging with @${username}...`);
    
    await this.page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000);
    
    // Follow
    await this.followUser(username);
    await this.page.waitForTimeout(500);
    
    // Like recent tweets
    const tweets = await this.page.$$('[data-testid="tweet"]');
    const toLike = Math.min(2, tweets.length);
    for (let i = 0; i < toLike; i++) {
      await this.likeTweet(tweets[i]);
      await this.page.waitForTimeout(300);
    }
  }
  
  async run() {
    console.log('🚀 Starting Engagement Bot v2...');
    await this.init();
    
    // Get all targets and shuffle
    const allTargets = this.getAllTargets();
    const shuffled = allTargets.sort(() => Math.random() - 0.5);
    
    // Engage with first 5
    const toEngage = shuffled.slice(0, 5);
    for (const username of toEngage) {
      await this.engageWithAccount(username);
      await this.page.waitForTimeout(1000);
    }
    
    this.state.lastRun = new Date().toISOString();
    this.saveState();
    
    console.log(`\n✅ Engagement complete! Total: ${this.state.totalEngagements} today`);
    await this.close();
  }
}

if (require.main === module) {
  const bot = new EngagementBot();
  bot.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = EngagementBot;
