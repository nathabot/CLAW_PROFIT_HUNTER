/**
 * PUMP.FUN BROWSER SCANNER
 * 
 * Uses existing browser (CDP) to scrape pump.fun
 * Feeds data through pump-browser-integration.js
 * 
 * Run: node src/pump-browser-scanner.js
 */

const { chromium } = require('playwright');

const CDP_URL = process.env.CDP_URL || 'http://localhost:18800';
const BROWSER_TARGET = '5D57322F7771916F1DA0AD6CB2A61E83'; // pump.fun tab

async function connectToBrowser() {
  console.log('🔌 Connecting to browser...');
  
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    const pages = context.pages();
    
    // Find pump.fun page
    const pumpPage = pages.find(p => 
      p.url().includes('pump.fun') && 
      !p.url().includes('coin/')
    );
    
    if (!pumpPage) {
      // Navigate to pump.fun
      console.log('📡 Navigating to pump.fun...');
      const newPage = await context.newPage();
      await newPage.goto('https://pump.fun', { timeout: 30000 });
      await newPage.waitForLoadState('networkidle');
      return newPage;
    }
    
    console.log('✅ Connected to pump.fun');
    return pumpPage;
    
  } catch (e) {
    console.error('❌ Browser connection failed:', e.message);
    return null;
  }
}

async function extractTokens(page) {
  console.log('📊 Extracting tokens from page...');
  
  // Refresh to get latest
  await page.reload();
  await page.waitForLoadState('networkidle');
  await new Promise(r => setTimeout(r, 3000));
  
  // Extract token data using page evaluation
  const tokens = await page.evaluate(() => {
    const results = [];
    
    // Find all coin entries
    const entries = document.querySelectorAll('a[href^="/coin/"]');
    
    entries.forEach(entry => {
      const text = entry.textContent?.trim() || '';
      const href = entry.href;
      
      // Skip if it's not a token entry (View on, Trade on, etc)
      if (text.includes('View on') || text.includes('Trade on')) return;
      
      // Extract symbol - look for $SYMBOL pattern
      const symbolMatch = text.match(/\$([A-Z][A-Za-z0-9]{1,10})/);
      if (!symbolMatch) return;
      
      const symbol = symbolMatch[1];
      
      // Extract MC - look for $X.XK or $X.XM pattern
      const mcMatch = text.match(/\$([\d.]+)([KMB])/i);
      const mc = mcMatch ? parseFloat(mcMatch[1]) * (mcMatch[2] === 'K' ? 1000 : mcMatch[2] === 'M' ? 1000000 : 1) : 0;
      
      // Extract change %
      const changeMatch = text.match(/([\d.]+)%/);
      const change = changeMatch ? parseFloat(changeMatch[1]) : 0;
      
      // Get parent element for more details
      const parent = entry.closest('li') || entry.parentElement;
      const parentText = parent?.textContent || '';
      
      // Extract age
      const ageMatch = parentText.match(/(\d+)\s*(m|min|h|d)/i);
      const age = ageMatch ? ageMatch[0] : 'Unknown';
      
      results.push({
        symbol,
        name: symbol,
        ca: href.split('/coin/')[1]?.split('?')[0],
        mcStr: mc > 0 ? `$${mc}` : '',
        changeStr: change > 0 ? `+${change}%` : '',
        ageStr: age,
        url: href,
      });
    });
    
    // Deduplicate
    const unique = [];
    const seen = new Set();
    results.forEach(t => {
      if (!seen.has(t.ca) && t.ca) {
        seen.add(t.ca);
        unique.push(t);
      }
    });
    
    return unique;
  });
  
  console.log(`   Found ${tokens.length} tokens`);
  return tokens;
}

async function getTokenDetails(page, token) {
  try {
    // Navigate to token page
    await page.goto(token.url, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Extract detailed data
    const details = await page.evaluate(() => {
      const text = document.body.innerText;
      
      // Market Cap
      let mc = 0;
      const mcMatch = text.match(/Market Cap \$?([\d.]+)([KMB]?)/i);
      if (mcMatch) {
        mc = parseFloat(mcMatch[1]);
        if (mcMatch[2] === 'K') mc *= 1000;
        if (mcMatch[2] === 'M') mc *= 1000000;
      }
      
      // Bonding curve
      let curve = 0;
      const curveMatch = text.match(/(\d+\.?\d*)%.*Curve/i) || text.match(/Curve.*?(\d+\.?\d*)%/i);
      if (curveMatch) curve = parseFloat(curveMatch[1]);
      
      // Dev holder %
      let devHolder = 100;
      const devMatch = text.match(/Creator.*?(\d+\.?\d*)%/i);
      if (devMatch) devHolder = parseFloat(devMatch[1]);
      
      // Liquidity %
      let liquidity = 0;
      const liqMatch = text.match(/(\d+\.?\d*)%.*Liquidity/i);
      if (liqMatch) {
        const pct = parseFloat(liqMatch[1]);
        liquidity = (pct / 100) * mc;
      }
      
      // 24h change
      let change24h = 0;
      const changeMatch = text.match(/(\d+\.?\d%)/);
      if (changeMatch) change24h = parseFloat(changeMatch[1]);
      
      return { mc, curve, devHolder, liquidity, change24h };
    });
    
    return { ...token, ...details };
    
  } catch (e) {
    console.log(`   ⚠️ Could not get details for ${token.symbol}: ${e.message}`);
    return token;
  }
}

async function main() {
  console.log('\n🎯 PUMP.FUN BROWSER SCANNER');
  console.log('============================');
  
  // Connect to browser
  const page = await connectToBrowser();
  if (!page) {
    console.log('❌ Could not connect to browser');
    process.exit(1);
  }
  
  // Get token list
  const rawTokens = await extractTokens(page);
  
  if (rawTokens.length === 0) {
    console.log('❌ No tokens found');
    process.exit(1);
  }
  
  // Get details for top tokens
  console.log('\n📋 Getting detailed info...');
  const detailedTokens = [];
  
  for (const token of rawTokens.slice(0, 10)) {
    const details = await getTokenDetails(page, token);
    detailedTokens.push(details);
    
    console.log(`   ${token.symbol}: MC $${details.mc || 'N/A'}, Curve ${details.curve || 0}%, Dev ${details.devHolder || 100}%`);
    
    // Go back to list
    await page.goto('https://pump.fun');
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Process through integration
  console.log('\n🧠 Processing through integration...');
  
  const { processTokensFromBrowser } = require('./pump-browser-integration');
  const results = await processTokensFromBrowser(detailedTokens);
  
  // Summary
  console.log('\n=========================================');
  console.log('📊 FINAL RESULTS:');
  console.log(`   Total scanned: ${results.total}`);
  console.log(`   Passed filters: ${results.passed}`);
  console.log(`   Qualified signals: ${results.signals.length}`);
  console.log('=========================================');
  
  // Return signals for further processing
  return results;
}

// Run if called directly
if (require.main === module) {
  main()
    .then(results => {
      console.log('\n✅ Scanner complete');
      process.exit(0);
    })
    .catch(e => {
      console.error('❌ Error:', e);
      process.exit(1);
    });
}

module.exports = { main, extractTokens, getTokenDetails };
