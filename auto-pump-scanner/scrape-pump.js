/**
 * PUMP.FUN SCRAPER - Extracts token data from browser
 * Runs via browser automation
 */

const { chromium } = require('playwright');

const FILTER_CONFIG = {
  MIN_HOLDER_PERCENT: 50,      // Top holder must be < 50%
  MIN_LIQUIDITY: 5000,         // $5k minimum
  MIN_BONDING_CURVE: 5,        // 5% minimum  
  MAX_AGE_HOURS: 24,           // Less than 24h old
  MIN_CHANGE: 5,               // 5% minimum price change
  MIN_MC: 5000,
  MAX_MC: 500000,
};

async function scrapePumpFun() {
  console.log('🌐 Launching browser...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Go to pump.fun
    console.log('📡 Loading pump.fun...');
    await page.goto('https://pump.fun', { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    
    // Get page content for analysis
    const content = await page.content();
    console.log('📄 Page loaded, length:', content.length);
    
    // Look for token data in page
    // pump.fun loads data dynamically, need to find the JSON
    
    // Try to find script tags with token data
    const scripts = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      return Array.from(scripts).map(s => s.textContent).filter(t => t && t.includes('marketCap'));
    });
    
    if (scripts.length > 0) {
      console.log('📊 Found token data in scripts');
      
      // Parse the data
      for (const script of scripts) {
        try {
          // Look for JSON-like data
          const match = script.match(/\{[^{}]*"marketCap"[^{}]*\}/);
          if (match) {
            console.log('📦 Found marketCap data!');
            console.log(match[0].slice(0, 200));
          }
        } catch (e) {}
      }
    }
    
    // Alternative: Click on "New" tab to get new tokens
    console.log('\n🔄 Trying to get new tokens...');
    
    // Click on New tab if exists
    try {
      const newTab = await page.$('button:has-text("🌱 New")');
      if (newTab) {
        await newTab.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('Could not click New tab:', e.message);
    }
    
    // Get all coin links
    const coins = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href^="/coin/"]');
      return Array.from(links).map(l => ({
        href: l.href,
        text: l.textContent?.trim() || ''
      })).slice(0, 20);
    });
    
    console.log(`\n📋 Found ${coins.length} coin links`);
    coins.forEach((c, i) => console.log(`   ${i+1}. ${c.textContent.slice(0,40)} -> ${c.href}`));
    
    return { coins, page };
    
  } catch (e) {
    console.error('❌ Error:', e.message);
    return null;
  }
}

// Run if called directly
if (require.main === module) {
  scrapePumpFun().then(r => {
    console.log('\n✅ Done');
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { scrapePumpFun, FILTER_CONFIG };
