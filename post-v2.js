const { chromium } = require('playwright');
const fs = require('fs');
const cookies = JSON.parse(fs.readFileSync('./usearound-cookies-fixed.json', 'utf8'));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  await ctx.addCookies(cookies);
  
  const page = await ctx.newPage();
  
  // Go to compose directly
  await page.goto('https://x.com/compose/post', { waitUntil: 'networkidle', timeout: 35000 });
  console.log('URL:', page.url());
  
  await page.waitForTimeout(5000);
  
  // Try to find and fill textarea
  const textareas = await page.locator('textarea').all();
  console.log('Found textareas:', textareas.length);
  
  if (textareas.length > 0) {
    await textareas[0].fill('Just set up my AI agent to run my X. It\'s actually working. 🤖');
    console.log('Filled tweet');
    
    await page.waitForTimeout(2000);
    
    const postBtn = await page.$('button[data-testid="tweetButton"]');
    if (postBtn) {
      await postBtn.click();
      console.log('✅ TWEET POSTED!');
    }
  }
  
  await browser.close();
  process.exit(0);
})();
