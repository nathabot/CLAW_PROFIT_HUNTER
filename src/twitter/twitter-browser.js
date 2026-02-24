/**
 * TWITTER/X BROWSER - Two-step typing
 */
const { chromium } = require('playwright');
const fs = require('fs');

const SESSION_FILE = '/root/trading-bot/src/twitter/session.json';

class TwitterBrowser {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
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
    
    if (sessionCookie) {
      await this.context.addCookies(sessionCookie);
    }
    
    this.page = await this.context.newPage();
    return this;
  }
  
  async close() {
    if (this.browser) await this.browser.close();
  }
  
  async postTweet(text) {
    try {
      await this.page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForTimeout(5000);
      
      // Find editor
      const editor = await this.page.$('.public-DraftEditor-content');
      await editor.click();
      await this.page.waitForTimeout(500);
      
      // Split text and URL
      const parts = text.split(' ');
      for (const part of parts) {
        await this.page.keyboard.type(part, { delay: 20 });
        await this.page.keyboard.press('Space');
        await this.page.waitForTimeout(100);
      }
      
      await this.page.waitForTimeout(2000);
      await this.page.click('button[data-testid="tweetButton"]');
      await this.page.waitForTimeout(5000);
      
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = TwitterBrowser;
