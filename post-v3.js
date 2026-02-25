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
  
  // Go to home - just DOM
  await page.goto('https://x.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('Loaded:', page.url());
  
  // Wait for JS
  await page.waitForTimeout(10000);
  
  // Check what's there
  const title = await page.title();
  console.log('Title:', title);
  
  // Try to find the post button directly
  const postBtn = await page.$('button[data-testid="tweetButton"]');
  console.log('Post button found:', !!postBtn);
  
  if (postBtn) {
    await postBtn.click();
    await page.waitForTimeout(3000);
    
    // Now type in the modal
    const input = await page.$('div[aria-label="Tweet text"]');
    if (input) {
      await input.fill('Just set up my AI agent to run my X. It\'s actually working. 🤖');
      console.log('Filled');
      
      await page.waitForTimeout(1000);
      
      const submitBtn = await page.$('button[data-testid="tweetButton"]');
      if (submitBtn) {
        await submitBtn.click();
        console.log('✅ POSTED!');
      }
    }
  }
  
  await browser.close();
})();
