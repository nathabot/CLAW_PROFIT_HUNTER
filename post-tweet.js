const { chromium } = require('playwright');
const fs = require('fs');
const cookies = JSON.parse(fs.readFileSync('./usearound-cookies-fixed.json', 'utf8'));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const ctx = await browser.newContext();
  await ctx.addCookies(cookies);
  
  const page = await ctx.newPage();
  
  await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('Page loaded:', page.url());
  
  await page.waitForTimeout(5000);
  
  // Try to find tweet input
  const el = await page.$('div[aria-label="Tweet text"]');
  if (el) {
    console.log('Found tweet input');
    await el.click();
    await page.waitForTimeout(1000);
    
    await el.type('Just set up my AI agent to run my X. It\'s actually working. 🤖', { delay: 30 });
    console.log('Typed tweet');
    
    await page.waitForTimeout(2000);
    
    const btn = await page.$('button[data-testid="tweetButton"]');
    if (btn && await btn.isEnabled()) {
      await btn.click();
      console.log('✅ TWEET POSTED!');
    }
  } else {
    console.log('Input not found');
  }
  
  await browser.close();
  process.exit(0);
})();
