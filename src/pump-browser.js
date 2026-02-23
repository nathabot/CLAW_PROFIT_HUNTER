// Browser-based pump.fun scanner
// Uses headless browser to scrape pump.fun directly

const { chromium } = require('playwright');

const LOG_FILE = __dirname + '/../logs/pump-browser.log';

let state = {
  knownTokens: new Set(),
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function scrape() {
  log('Scraping pump.fun...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    await page.goto('https://pump.fun/coins?sort=trending', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait for tokens to load
    await page.waitForTimeout(3000);
    
    // Get token cards
    const tokens = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="coin-card"], [class*="token-item"]');
      return Array.from(cards).slice(0, 20).map(card => {
        const name = card.querySelector('[class*="name"]')?.textContent || 'Unknown';
        const symbol = card.querySelector('[class*="symbol"]')?.textContent || '';
        const price = card.querySelector('[class*="price"]')?.textContent || '';
        const marketCap = card.querySelector('[class*="marketcap"]')?.textContent || '';
        
        return { name, symbol, price, marketCap };
      });
    });
    
    log(`Found ${tokens.length} tokens on page`);
    
    if (tokens.length > 0) {
      log('Sample tokens:');
      tokens.slice(0, 5).forEach(t => {
        log(`  ${t.symbol}: ${t.marketCap}`);
      });
    }
    
  } catch (e) {
    log(`Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

log('Browser pump scanner starting...');
scrape().then(() => process.exit(0));
