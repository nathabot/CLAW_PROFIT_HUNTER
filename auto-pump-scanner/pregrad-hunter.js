/**
 * PRE-GRAD HUNTER - Browser-based scanner
 * Finds tokens on bonding curve BEFORE they pump
 */

const { chromium } = require('playwright');

const CONFIG = {
  CDP_URL: 'http://localhost:18800',
  MAX_POSITION: 0.005,      // SOL
  TARGET_GAIN: 30,          // % - first TP
  TARGET_GAIN_2: 50,        // % - final TP
  STOP_LOSS: 15,            // %
  
  // Filters - MUST pass
  MAX_DEV_HOLDER: 50,       // %
  MIN_LIQUIDITY: 3000,       // $
  MIN_CURVE: 3,              // %
  MAX_AGE: 12,               // hours
  MAX_MC: 90000,             // $ - pre-grad
  MIN_MC: 5000,              // $
  
  // Score threshold
  MIN_SCORE: 60,             // out of 100
};

async function connectToBrowser() {
  console.log('🔌 Connecting to browser...');
  
  const browser = await chromium.connectOverCDP(CONFIG.CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  
  if (pages.length === 0) {
    console.log('❌ No pages found');
    return null;
  }
  
  // Find pump.fun page
  const pumpPage = pages.find(p => p.url().includes('pump.fun'));
  
  if (!pumpPage) {
    console.log('❌ No pump.fun page found');
    return null;
  }
  
  console.log('✅ Connected to pump.fun');
  return { browser, page: pumpPage };
}

async function scanForPreGradTokens(page) {
  console.log('\n🔍 Scanning for pre-grad tokens...');
  
  // Refresh to get latest
  await page.reload();
  await page.waitForLoadState('networkidle');
  await new Promise(r => setTimeout(r, 3000));
  
  // Get all token links
  const tokens = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href^="/coin/"]');
    const data = [];
    
    links.forEach(link => {
      const text = link.textContent?.trim() || '';
      const href = link.href;
      
      // Extract symbol from text like "$SYMBOL MC $XX.XK"
      const match = text.match(/\$([A-Za-z]+)/);
      if (match && !text.includes('View on') && !text.includes('Trade on')) {
        data.push({
          symbol: match[1],
          href: href,
          ca: href.split('/coin/')[1]?.split('?')[0]
        });
      }
    });
    
    // Remove duplicates
    const unique = [];
    const seen = new Set();
    data.forEach(t => {
      if (!seen.has(t.ca)) {
        seen.add(t.ca);
        unique.push(t);
      }
    });
    
    return unique;
  });
  
  console.log(`📋 Found ${tokens.length} tokens`);
  
  if (tokens.length === 0) {
    return [];
  }
  
  // Get detailed info for each token
  const results = [];
  
  for (const token of tokens.slice(0, 10)) { // Check top 10
    console.log(`\n📊 Checking ${token.symbol}...`);
    
    try {
      const details = await getTokenDetails(page, token);
      
      if (details) {
        results.push(details);
        
        console.log(`   MC: $${details.mc}`);
        console.log(`   Curve: ${details.curve}%`);
        console.log(`   Dev: ${details.devPercent}%`);
        console.log(`   Liquidity: $${details.liquidity}`);
        
        // Quick filter check
        if (details.graduated) {
          console.log(`   ❌ Graduated`);
        } else if (details.devPercent >= CONFIG.MAX_DEV_HOLDER) {
          console.log(`   ❌ Dev holder too high: ${details.devPercent}%`);
        } else if (details.curve < CONFIG.MIN_CURVE) {
          console.log(`   ❌ Curve too low: ${details.curve}%`);
        } else if (details.mc > CONFIG.MAX_MC) {
          console.log(`   ❌ MC too high: $${details.mc}`);
        } else {
          console.log(`   ✅ PASSED FILTERS!`);
        }
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
    
    // Go back to list
    await page.goto('https://pump.fun');
    await new Promise(r => setTimeout(r, 2000));
  }
  
  return results;
}

async function getTokenDetails(page, token) {
  try {
    // Navigate to token page
    await page.goto(token.href, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // Extract data from page
    const details = await page.evaluate(() => {
      const data = {
        symbol: '',
        ca: window.location.pathname.split('/coin/')[1],
        mc: 0,
        curve: 0,
        devPercent: 0,
        liquidity: 0,
        graduated: false,
        age: 0,
        priceChange: 0,
      };
      
      // Get text content
      const text = document.body.innerText;
      
      // Market Cap
      const mcMatch = text.match(/Market Cap \$?([\d.]+)([KMB]?)/i);
      if (mcMatch) {
        let val = parseFloat(mcMatch[1]);
        if (mcMatch[2] === 'K') val *= 1000;
        if (mcMatch[2] === 'M') val *= 1000000;
        if (mcMatch[2] === 'B') val *= 1000000000;
        data.mc = val;
      }
      
      // Bonding curve
      const curveMatch = text.match(/(\d+\.?\d*)%.*Curve/i) || text.match(/Curve.*?(\d+\.?\d*)%/i);
      if (curveMatch) {
        data.curve = parseFloat(curveMatch[1]);
      }
      
      // Check if graduated
      if (text.includes('graduated') || text.includes('Coin has graduated')) {
        data.graduated = true;
      }
      
      // Dev holder %
      const devMatch = text.match(/Dev.*?(\d+\.?\d*)%/i);
      if (devMatch) {
        data.devPercent = parseFloat(devMatch[1]);
      }
      
      // Liquidity
      const liqMatch = text.match(/(\d+\.?\d*)%.*Liquidity/i) || text.match(/Liquidity.*?(\d+\.?\d*)%/i);
      if (liqMatch) {
        // Usually shown as % of MC, need to calculate
        const pct = parseFloat(liqMatch[1]);
        data.liquidity = (pct / 100) * data.mc;
      }
      
      // Price change
      const changeMatch = text.match(/(\d+\.?\d*)%.*?(24hr|24h|1h|5m)/i);
      if (changeMatch) {
        data.priceChange = parseFloat(changeMatch[1]);
      }
      
      return data;
    });
    
    // Calculate score
    details.score = calculateScore(details);
    details.symbol = token.symbol;
    details.href = token.href;
    
    return details;
    
  } catch (e) {
    console.error('Error getting details:', e.message);
    return null;
  }
}

function calculateScore(token) {
  let score = 0;
  
  // Curve progress (0-20)
  score += Math.min(20, token.curve * 2);
  
  // Dev holder (0-25) - lower is better
  score += Math.max(0, 25 - (token.devPercent * 0.5));
  
  // Liquidity (0-20)
  score += Math.min(20, (token.liquidity / 10000) * 20);
  
  // MC sweet spot (0-15) - $15k is perfect
  const mcIdeal = 15000;
  const mcDiff = Math.abs(token.mc - mcIdeal);
  score += Math.max(0, 15 - (mcDiff / 2000));
  
  // Age (0-10) - assume new if not specified
  score += 10;
  
  // Price momentum (0-10)
  score += Math.min(10, token.priceChange);
  
  return Math.min(100, Math.round(score));
}

async function main() {
  const browserConn = await connectToBrowser();
  
  if (!browserConn) {
    console.log('❌ Could not connect to browser');
    process.exit(1);
  }
  
  const { browser, page } = browserConn;
  
  // Scan for tokens
  const results = await scanForPreGradTokens(page);
  
  // Filter and sort
  const qualified = results
    .filter(t => !t.graduated && t.devPercent < CONFIG.MAX_DEV_HOLDER && t.curve >= CONFIG.MIN_CURVE && t.mc < CONFIG.MAX_MC && t.mc >= CONFIG.MIN_MC)
    .sort((a, b) => b.score - a.score);
  
  console.log('\n=========================================');
  console.log('🎯 QUALIFIED PRE-GRAD TOKENS:');
  console.log('=========================================');
  
  if (qualified.length === 0) {
    console.log('❌ No qualified tokens found');
  } else {
    qualified.slice(0, 5).forEach((t, i) => {
      console.log(`\n${i+1}. ${t.symbol}`);
      console.log(`   Score: ${t.score}/100`);
      console.log(`   MC: $${t.mc}`);
      console.log(`   Curve: ${t.curve}%`);
      console.log(`   Dev: ${t.devPercent}%`);
      console.log(`   Link: ${t.href}`);
    });
    
    // Alert for top pick
    const top = qualified[0];
    console.log(`\n🚀 TOP PICK: ${top.symbol} (${top.score}/100)`);
    console.log(`   Ready to trade: YES`);
  }
  
  await browser.close();
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { CONFIG, scanForPreGradTokens, calculateScore };
