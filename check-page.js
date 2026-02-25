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
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('URL:', page.url());
  
  // Wait for content
  await page.waitForTimeout(8000);
  
  // Get page content
  const content = await page.content();
  console.log('Has tweet text:', content.includes('Tweet text'));
  console.log('Has Post button:', content.includes('Post') && content.includes('button'));
  console.log('Has login:', content.includes('login') || content.includes('sign in'));
  console.log('Has usearound:', content.includes('usearound'));
  
  await browser.close();
  process.exit(0);
})();
