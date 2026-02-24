/**
 * @daiarticle Browser Auto-Poster
 * Uses Playwright automation with cookies
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = '/root/twitter-bot/cookies.json';
const LOG_FILE = '/root/twitter-bot/post-log.json';

class BrowserPoster {
  constructor() {
    this.cookiesFile = COOKIES_FILE;
    this.logFile = LOG_FILE;
  }
  
  loadCookies() {
    const raw = fs.readFileSync(this.cookiesFile, 'utf8');
    let cookies = JSON.parse(raw);
    
    // Fix sameSite
    cookies = cookies.map(c => {
      if (!c.sameSite || c.sameSite === 'unspecified') c.sameSite = 'Lax';
      if (c.sameSite === 'no_restriction') c.sameSite = 'None';
      if (c.sameSite) c.sameSite = c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase();
      if (!['Strict', 'Lax', 'None'].includes(c.sameSite)) c.sameSite = 'Lax';
      return c;
    });
    
    return cookies;
  }
  
  loadPostLog() {
    try {
      return JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
    } catch {
      return { posts: [], lastMentionId: null };
    }
  }
  
  savePostLog(log) {
    fs.writeFileSync(this.logFile, JSON.stringify(log, null, 2));
  }
  
  async post(text) {
    console.log('🚀 Starting browser posting...');
    
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox']
    });
    
    try {
      const context = await browser.newContext();
      const cookies = this.loadCookies();
      await context.addCookies(cookies);
      
      const page = await context.newPage();
      
      // Go to home
      await page.goto('https://x.com/home', { 
        timeout: 40000, 
        waitUntil: 'domcontentloaded' 
      });
      await page.waitForTimeout(8000);
      
      // Open compose
      await page.keyboard.press('KeyN');
      await page.waitForTimeout(8000);
      
      // Type message
      const editor = page.locator('[data-testid="tweetTextarea_0"]').first();
      await editor.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(text, { delay: 10 });
      await page.waitForTimeout(3000);
      
      // Click post
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="tweetButton"]');
        if (btn) btn.click();
      });
      
      // Wait for post
      await page.waitForTimeout(15000);
      
      const finalUrl = page.url();
      console.log('📝 Posted! Final URL:', finalUrl);
      
      // Log the post
      const log = this.loadPostLog();
      log.posts.push({
        text,
        timestamp: new Date().toISOString(),
        url: finalUrl
      });
      this.savePostLog(log);
      
      await browser.close();
      return { success: true, url: finalUrl };
      
    } catch (e) {
      console.error('❌ Error:', e.message);
      await browser.close();
      return { success: false, error: e.message };
    }
  }
}

// CLI usage
const args = process.argv.slice(2);
const poster = new BrowserPoster();

if (args.length > 0) {
  const text = args.join(' ');
  poster.post(text).then(result => {
    console.log('Result:', result);
    process.exit(result.success ? 0 : 1);
  });
} else {
  console.log('Usage: node browser-poster.js "Your tweet text here"');
}
