#!/usr/bin/env node
/**
 * Test script for Twitter scraper
 * Tests database initialization and basic scraping functionality
 */

const fs = require('fs');
const path = require('path');
const { Database } = require('../agents/twitter-scraper.js');

const CONFIG = {
    databasePath: '/root/trading-bot/database/twitter_signals.db'
};

async function testDatabase() {
    console.log('🧪 Testing database initialization...\n');
    
    // Ensure directory exists
    const dbDir = path.dirname(CONFIG.databasePath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(CONFIG.databasePath);
    
    try {
        await db.init();
        console.log('✅ Database initialized successfully');
        
        // Check if tables were created
        const tables = await db.allAsync(
            "SELECT name FROM sqlite_master WHERE type='table'"
        );
        console.log(`✅ Found ${tables.length} tables:`);
        tables.forEach(t => console.log(`   - ${t.name}`));
        
        // Check if default accounts were inserted
        const accounts = await db.allAsync(
            'SELECT username, account_type, priority FROM monitored_accounts ORDER BY priority DESC'
        );
        console.log(`\n✅ Found ${accounts.length} monitored accounts:`);
        accounts.forEach(a => {
            console.log(`   - @${a.username} (${a.account_type}, priority: ${a.priority})`);
        });
        
        return true;
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
        return false;
    } finally {
        db.close();
    }
}

async function testPatternExtraction() {
    console.log('\n🧪 Testing pattern extraction...\n');
    
    const { 
        extractTokenSymbols, 
        extractContractAddresses,
        detectSignalType,
        detectSentiment,
        extractPriceTargets,
        extractStopLoss,
        extractEntryPrice,
        cleanContent
    } = require('../agents/twitter-scraper.js');
    
    const testCases = [
        {
            name: "Buy signal with target",
            text: "Just bought $SOL at $95. Target $120 🚀 Stop loss at $88 #bullish",
            expected: { symbol: 'SOL', signal: 'BUY', sentiment: 'bullish' }
        },
        {
            name: "Sell signal",
            text: "Exiting $BTC position here. Market looking bearish, taking profits. Sell at $42000",
            expected: { symbol: 'BTC', signal: 'SELL', sentiment: 'bearish' }
        },
        {
            name: "Multiple tokens",
            text: "Watching $ETH and $ADA for breakout. Entry: $1800 and $0.45 respectively. TP: $2000 / $0.60",
            expected: { symbols: ['ETH', 'ADA'], signal: 'BUY', sentiment: 'bullish' }
        },
        {
            name: "Solana contract",
            text: "New gem found! 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU looking bullish, buy under $0.001",
            expected: { hasContract: true, signal: 'BUY', sentiment: 'bullish' }
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of testCases) {
        console.log(`Test: ${test.name}`);
        console.log(`Input: "${test.text.substring(0, 60)}..."`);
        
        const content = cleanContent(test.text);
        const symbols = extractTokenSymbols(content);
        const contracts = extractContractAddresses(content);
        const signal = detectSignalType(content);
        const sentiment = detectSentiment(content);
        const targets = extractPriceTargets(content);
        const stopLoss = extractStopLoss(content);
        const entry = extractEntryPrice(content);
        
        console.log(`  Symbols: ${symbols.map(s => s.symbol).join(', ') || 'none'}`);
        console.log(`  Contracts: ${contracts.length > 0 ? contracts[0].substring(0, 16) + '...' : 'none'}`);
        console.log(`  Signal: ${signal || 'none'}`);
        console.log(`  Sentiment: ${sentiment}`);
        console.log(`  Targets: ${targets.join(', ') || 'none'}`);
        console.log(`  Stop Loss: ${stopLoss || 'none'}`);
        console.log(`  Entry: ${entry || 'none'}`);
        
        // Validate
        let valid = true;
        if (test.expected.symbol && !symbols.find(s => s.symbol === test.expected.symbol)) {
            console.log(`  ⚠️  Expected symbol ${test.expected.symbol} not found`);
            valid = false;
        }
        if (test.expected.signal && signal !== test.expected.signal) {
            console.log(`  ⚠️  Expected signal ${test.expected.signal}, got ${signal}`);
            valid = false;
        }
        if (test.expected.sentiment && sentiment !== test.expected.sentiment) {
            console.log(`  ⚠️  Expected sentiment ${test.expected.sentiment}, got ${sentiment}`);
            valid = false;
        }
        
        if (valid) {
            console.log('  ✅ PASSED\n');
            passed++;
        } else {
            console.log('  ❌ FAILED\n');
            failed++;
        }
    }
    
    console.log(`\nPattern Extraction Results: ${passed}/${testCases.length} passed`);
    return failed === 0;
}

async function runQuickScrapeTest() {
    console.log('\n🧪 Running quick scrape test (may take 30-60s)...\n');
    
    const { TwitterScraper, Database } = require('../agents/twitter-scraper.js');
    const db = new Database(CONFIG.databasePath);
    await db.init();
    
    const scraper = new TwitterScraper(db);
    
    try {
        // Try to scrape a single account
        const result = await scraper.scrapeAccount('lookonchain', 5);
        console.log(`\nScrape completed:`);
        console.log(`  - Tweets processed: ${result.processed.length}`);
        console.log(`  - Nitter instance: ${result.instance || 'none'}`);
        
        if (result.processed.length > 0) {
            console.log('\n  Sample tweet:');
            const sample = result.processed[0];
            console.log(`  ID: ${sample.tweetId}`);
            console.log(`  Content: ${sample.content?.substring(0, 100)}...`);
        }
        
        return result.processed.length > 0;
    } catch (error) {
        console.log(`\n⚠️  Scrape test encountered issue: ${error.message}`);
        console.log('This is expected if Nitter instances are rate limited or unavailable.');
        console.log('The scraper will retry with multiple instances during normal operation.');
        return false;
    } finally {
        db.close();
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       TWITTER SCRAPER TEST SUITE                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    const results = {
        database: false,
        patterns: false,
        scraping: false
    };
    
    // Test 1: Database
    results.database = await testDatabase();
    
    // Test 2: Pattern extraction
    results.patterns = await testPatternExtraction();
    
    // Test 3: Live scraping (optional, may fail due to network)
    results.scraping = await runQuickScrapeTest();
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`Database:     ${results.database ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Patterns:     ${results.patterns ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Live Scrape:  ${results.scraping ? '✅ PASS' : '⚠️  SKIP/FAIL'}`);
    console.log('');
    
    if (results.database && results.patterns) {
        console.log('✅ Core functionality verified! Scraper is ready to use.');
        console.log('\nNext steps:');
        console.log('  1. Run: npm run scrape -- --account lookonchain --limit 10');
        console.log('  2. Run: npm run analyze');
        console.log('  3. Schedule: Add to cron for automated scraping');
    } else {
        console.log('❌ Some tests failed. Please check the errors above.');
    }
}

main().catch(console.error);
