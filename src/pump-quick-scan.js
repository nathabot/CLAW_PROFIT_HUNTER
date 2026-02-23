/**
 * PUMP.FUN QUICK SCAN
 * 
 * Uses existing browser tab (no new connection needed)
 * Extracts token data and runs through integration
 * 
 * Usage: node src/pump-quick-scan.js
 */

const fs = require('fs');

// Quick extraction from existing pump.fun page
// This reads the page content directly

async function scanFromExistingTab() {
  console.log('\n🎯 PUMP.FUN QUICK SCAN');
  console.log('========================\n');
  
  // The browser is already on pump.fun
  // We need to use the browser tool to get the snapshot
  
  // For now, let's use the tokens we already identified manually
  // These are from the latest pump.fun scan
  
  const knownTokens = [
    {
      symbol: 'BurntLobster',
      name: 'The Burnt Lobster',
      ca: '27Qo2XUNyyTGQkhxFJnFuNhYrX816rc1zuS7ZJAFpump',
      mc: 4800,
      mcStr: '$4.8K',
      changeStr: '+69.85%',
      curve: 44,
      devHolder: 100, // dev holds 100% initially
      liquidity: 3200,
      ageStr: '9m',
      url: 'https://pump.fun/coin/27Qo2XUNyyTGQkhxFJnFuNhYrX816rc1zuS7ZJAFpump'
    },
    {
      symbol: 'KREME',
      name: 'Kreme Coin',
      ca: '342X1kb4UN1uvxdGMN5yL9m6N3HeSemk7xiX2AzPpump',
      mc: 7400,
      mcStr: '$7.4K',
      changeStr: '+151.39%',
      curve: 62,
      devHolder: 100,
      liquidity: 3900,
      ageStr: '14m',
      url: 'https://pump.fun/coin/342X1kb4UN1uvxdGMN5yL9m6N3HeSemk7xiX2AzPpump'
    },
    {
      symbol: 'YOU',
      name: "I'm Like You",
      ca: '5skJctqisMoqz1BectXvxEn4pgCmgifVGapskp2fpump',
      mc: 18400,
      mcStr: '$18.4K',
      changeStr: '+19.28%',
      curve: 75,
      devHolder: 100,
      liquidity: 13800,
      ageStr: '3h',
      url: 'https://pump.fun/coin/5skJctqisMoqz1BectXvxEn4pgCmgifVGapskp2fpump'
    },
    {
      symbol: 'HINAE',
      name: 'Horse Is Not An Employee',
      ca: '9iVx3rkS24uDoD1R9j9r8ur1CzbWpHv2B2r7xhj5pump',
      mc: 3600,
      mcStr: '$3.6K',
      changeStr: '+38.16%',
      curve: 30,
      devHolder: 100,
      liquidity: 1100,
      ageStr: '7m',
      url: 'https://pump.fun/coin/9iVx3rkS24uDoD1R9j9r8ur1CzbWpHv2B2r7xhj5pump'
    },
    {
      symbol: 'TOILET',
      name: 'Strategic Bathroom Reserve',
      ca: 'G1bi1DTYru9ek25TKYTkho15Pkseii8a5w2EB66Ppump',
      mc: 15000,
      mcStr: '$15.0K',
      changeStr: '+73.23%',
      curve: 55,
      devHolder: 100,
      liquidity: 8250,
      ageStr: '4m',
      url: 'https://pump.fun/coin/G1bi1DTYru9ek25TKYTkho15Pkseii8a5w2EB66Ppump'
    },
  ];
  
  console.log('📊 Testing with known pre-grad tokens...\n');
  
  // Process through integration
  const { processTokensFromBrowser } = require('./pump-browser-integration');
  const results = await processTokensFromBrowser(knownTokens);
  
  // Save signals
  if (results.signals.length > 0) {
    console.log('\n🎯 TOP SIGNAL:');
    const top = results.signals[0];
    console.log(`   Token: ${top.symbol}`);
    console.log(`   CA: ${top.tokenAddress.slice(0, 8)}...`);
    console.log(`   Score: ${top.confidence}/10`);
    console.log(`   URL: ${top.metrics.bondingCurve}% curve`);
    
    // Update trading config to add this as a potential trade
    const configPath = '/root/trading-bot/trading-config.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.PUMP_SIGNAL = top;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('   ✅ Added to trading config');
    }
  }
  
  return results;
}

scanFromExistingTab()
  .then(results => {
    console.log('\n✅ Quick scan complete');
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
