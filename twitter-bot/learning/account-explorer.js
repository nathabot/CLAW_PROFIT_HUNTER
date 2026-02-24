/**
 * ACCOUNT EXPLORER - Continuously discover and learn from new accounts
 */
const { chromium } = require('playwright');
const fs = require('fs');

const SESSION_FILE = '/root/trading-bot/src/twitter/session.json';
const EXPLORE_LIST_FILE = '/root/trading-bot/twitter-bot/learning/explore-list.json';
const OBSERVATIONS_FILE = '/root/trading-bot/twitter-bot/learning/observations.json';

// Accounts to explore (will auto-expand)
const DEFAULT_ACCOUNTS = [
  // Tech/AI influencers
  'KobeissiLetter', 'TommiPedruzzi', 'Bhavani_00007',
  'sama', 'elonmusk', 'AndrewYNg', 'fchollet', 'ylecun',
  'levelsio', 'swyx', 'mdudas', 'sruthi_ab',
  // Crypto
  'solana', 'CryptoDad', 'MinaProtocol',
  // Productivity
  'JamesClear', 'TimFerriss', 'SimonSinek',
  // Code/Dev
  'addyoswani', 'raaa', 'kelseyhightower',
  // Recent viral
  'TechTwitterCEO', 'davidgfnet', 'jwz', 'mnix'
];

class AccountExplorer {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.exploreList = this.loadExploreList();
  }
  
  loadExploreList() {
    try {
      return JSON.parse(fs.readFileSync(EXPLORE_LIST_FILE, 'utf8'));
    } catch {
      return { accounts: DEFAULT_ACCOUNTS, explored: [], lastRun: null };
    }
  }
  
  saveExploreList() {
    fs.writeFileSync(EXPLORE_LIST_FILE, JSON.stringify(this.exploreList, null, 2));
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
  
  async exploreAccount(username) {
    console.log(`\n🔍 Exploring @${username}...`);
    
    await this.page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);
    
    const tweets = await this.page.$$('[data-testid="tweet"]');
    const analyzed = [];
    
    for (let i = 0; i < Math.min(5, tweets.length); i++) {
      try {
        const text = await tweets[i].$eval('[data-testid="tweetText"]', el => el.innerText);
        analyzed.push(text.substring(0, 200));
      } catch {}
    }
    
    // Find new accounts to follow from this profile's suggestions
    // (simplified - just mark as explored)
    if (!this.exploreList.explored.includes(username)) {
      this.exploreList.explored.push(username);
    }
    
    return { username, tweets: analyzed };
  }
  
  async run() {
    console.log('🚀 Account Explorer starting...');
    console.log(`Accounts to explore: ${this.exploreList.accounts.length}`);
    await this.init();
    
    // Explore 3 new accounts each run
    const toExplore = this.exploreList.accounts
      .filter(a => !this.exploreList.explored.includes(a))
      .slice(0, 3);
    
    console.log(`Exploring: ${toExplore.join(', ')}`);
    
    for (const username of toExplore) {
      await this.exploreAccount(username);
      await this.page.waitForTimeout(2000);
    }
    
    this.exploreList.lastRun = new Date().toISOString();
    this.saveExploreList();
    
    console.log('\n✅ Exploration complete!');
    await this.close();
  }
}

if (require.main === module) {
  const explorer = new AccountExplorer();
  explorer.run().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = AccountExplorer;
