#!/usr/bin/env node
/**
 * Database Test & Usage Examples
 * Demonstrates all CRUD operations and features
 */

const { TradingDatabase, getDatabase } = require('./db.js');
const fs = require('fs');

async function runTests() {
    console.log('🧪 Trading Strategy Database Tests\n');
    console.log('=' .repeat(50));

    const db = getDatabase();
    
    try {
        // Connect to database
        await db.connect();
        console.log('✅ Connected to database\n');

        // ============================================
        // Test 1: Get Dashboard Data
        // ============================================
        console.log('\n📊 Dashboard Data:');
        console.log('-'.repeat(50));
        const dashboard = await db.getDashboardData();
        console.log('Summary:', JSON.stringify(dashboard.summary, null, 2));
        console.log('Top Strategies:', dashboard.top_strategies.length);
        console.log('Recent Smart Money:', dashboard.recent_smart_money.length);

        // ============================================
        // Test 2: Query Strategies
        // ============================================
        console.log('\n📈 Active Strategies (confidence >= 70):');
        console.log('-'.repeat(50));
        const strategies = await db.getStrategies({ minConfidence: 70 });
        strategies.forEach(s => {
            console.log(`  • ${s.name} (${s.type}) - Confidence: ${s.confidence_score}%`);
            console.log(`    Source: ${s.source} | Rules: ${Object.keys(s.entry_rules).join(', ')}`);
        });

        // ============================================
        // Test 3: Query Signals
        // ============================================
        console.log('\n🚨 Recent Signals:');
        console.log('-'.repeat(50));
        const signals = await db.getSignals({ limit: 5 });
        signals.forEach(sig => {
            console.log(`  • ${sig.token_symbol} [${sig.signal_type.toUpperCase()}]`);
            console.log(`    Entry: $${sig.entry_price} | Target: $${sig.target_price} | Stop: $${sig.stop_loss}`);
            console.log(`    Confidence: ${sig.confidence}% | Strategy: ${sig.strategy_name || 'N/A'}`);
        });

        // ============================================
        // Test 4: Smart Money Activity
        // ============================================
        console.log('\n🐋 Smart Money Activity:');
        console.log('-'.repeat(50));
        const smartMoney = await db.getSmartMoney({ limit: 5 });
        smartMoney.forEach(sm => {
            const entity = sm.entity_name || 'Unknown';
            console.log(`  • ${entity} - ${sm.action.toUpperCase()} ${sm.amount} ${sm.token_symbol}`);
            console.log(`    Value: $${sm.amount_usd?.toLocaleString() || 'N/A'} | Chain: ${sm.chain}`);
        });

        // ============================================
        // Test 5: Market Context
        // ============================================
        console.log('\n🌍 Market Context:');
        console.log('-'.repeat(50));
        const market = await db.getLatestMarketContext();
        if (market) {
            console.log(`  Fear & Greed: ${market.fear_greed_index} (${market.fear_greed_classification})`);
            console.log(`  BTC Dominance: ${market.btc_dominance}%`);
            console.log(`  Total Market Cap: $${(market.total_market_cap_usd / 1e12).toFixed(2)}T`);
            console.log(`  Trending: ${market.trending_topics?.join(', ')}`);
        }

        // ============================================
        // Test 6: Strategy Performance
        // ============================================
        console.log('\n🏆 Top Performing Strategies:');
        console.log('-'.repeat(50));
        const topStrategies = await db.getTopStrategies(3);
        topStrategies.forEach((s, i) => {
            console.log(`  ${i+1}. ${s.strategy_name}`);
            console.log(`     Win Rate: ${s.win_rate}% | Total PnL: ${s.total_pnl}% | Trades: ${s.total_trades}`);
            console.log(`     Profit Factor: ${s.profit_factor} | Sharpe: ${s.sharpe_ratio}`);
        });

        // ============================================
        // Test 7: Create a New Signal
        // ============================================
        console.log('\n➕ Creating Test Signal:');
        console.log('-'.repeat(50));
        const newSignal = {
            token_symbol: 'LINK',
            strategy_id: 1,
            signal_type: 'buy',
            entry_price: 18.50,
            target_price: 22.00,
            stop_loss: 16.80,
            source: 'test_script',
            confidence: 65.5,
            notes: 'Test signal from database initialization'
        };
        const signalId = await db.createSignal(newSignal);
        console.log(`  ✅ Created signal ID: ${signalId}`);

        // Verify it was created
        const createdSignal = await db.getSignal(signalId);
        console.log(`  📋 ${createdSignal.token_symbol} ${createdSignal.signal_type} @ $${createdSignal.entry_price}`);

        // ============================================
        // Test 8: Export for Trading Division
        // ============================================
        console.log('\n📤 Export for Trading Division:');
        console.log('-'.repeat(50));
        const exportData = await db.exportForTradingDivision({
            signalLimit: 5,
            strategyLimit: 3,
            includeSmartMoney: true,
            includeMarketContext: true
        });
        
        console.log(`  Exported at: ${exportData.metadata.exported_at}`);
        console.log(`  Strategies: ${exportData.strategies.length}`);
        console.log(`  Active Signals: ${exportData.active_signals.length}`);
        console.log(`  Smart Money Alerts: ${exportData.smart_money_alerts.length}`);
        console.log(`  Market Context: ${exportData.market_context ? 'Included' : 'N/A'}`);

        // Save export to file
        const exportPath = '/root/trading-bot/database/export-example.json';
        fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
        console.log(`  💾 Export saved to: ${exportPath}`);

        // ============================================
        // Test 9: Get Whale Movements
        // ============================================
        console.log('\n🐋 Whale Movements (>$1M):');
        console.log('-'.repeat(50));
        const whales = await db.getWhaleMovements(1000000, 24);
        if (whales.length > 0) {
            whales.forEach(w => {
                const entity = w.entity_name || w.wallet_address.slice(0, 12) + '...';
                console.log(`  • ${entity}: $${w.amount_usd?.toLocaleString()} ${w.action.toUpperCase()}`);
            });
        } else {
            console.log('  No whale movements found in sample data');
        }

        // ============================================
        // Test 10: Pending Signals
        // ============================================
        console.log('\n⏳ Pending Signals:');
        console.log('-'.repeat(50));
        const pending = await db.getPendingSignals();
        console.log(`  Found ${pending.length} pending signals`);
        pending.forEach(p => {
            console.log(`  • ${p.token_symbol} ${p.signal_type} (Confidence: ${p.confidence}%)`);
        });

        console.log('\n' + '='.repeat(50));
        console.log('✅ All tests completed successfully!');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await db.close();
        console.log('\n👋 Database connection closed');
    }
}

// Run tests
runTests();
