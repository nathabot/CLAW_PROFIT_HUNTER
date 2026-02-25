const { chromium } = require('playwright');
const fs = require('fs');
const cookies = JSON.parse(fs.readFileSync('./usearound-cookies-fixed.json', 'utf8'));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.addCookies(cookies);
  
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  
  await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('Loaded');
  
  await page.waitForTimeout(15000);
  
  const html = await page.content();
  console.log('Has usearound:', html.includes('usearound'));
  
  await browser.close();
  process.exit(0);
})();
