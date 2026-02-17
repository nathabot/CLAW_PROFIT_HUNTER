#!/usr/bin/env node
/**
 * Trading Strategy Database Initialization Script
 * Creates and initializes the strategy-intelligence database
 * 
 * Usage: node init-db.js [--reset] [--seed]
 *   --reset: Drop and recreate all tables
 *   --seed:  Insert sample data for testing
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Configuration
const DB_PATH = process.env.TRADING_DB_PATH || '/root/trading-bot/strategy-intelligence.db';
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Check if database file exists
 */
function databaseExists() {
    return fs.existsSync(DB_PATH);
}

/**
 * Read and execute schema SQL
 */
function initializeSchema(db) {
    return new Promise((resolve, reject) => {
        log('Reading schema file...', 'blue');
        
        if (!fs.existsSync(SCHEMA_PATH)) {
            reject(new Error(`Schema file not found: ${SCHEMA_PATH}`));
            return;
        }

        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        
        // Split schema into individual statements
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

        log(`Executing ${statements.length} schema statements...`, 'blue');

        // Execute each statement
        let completed = 0;
        
        db.exec(schema, (err) => {
            if (err) {
                reject(err);
            } else {
                log('Schema executed successfully', 'green');
                resolve();
            }
        });
    });
}

/**
 * Drop all tables (for reset)
 */
function dropAllTables(db) {
    return new Promise((resolve, reject) => {
        log('Dropping existing tables...', 'yellow');
        
        const tables = [
            'strategy_performance',
            'market_context',
            'smart_money',
            'signals',
            'strategies'
        ];

        let completed = 0;
        tables.forEach(table => {
            db.run(`DROP TABLE IF EXISTS ${table}`, (err) => {
                if (err) {
                    log(`Error dropping ${table}: ${err.message}`, 'red');
                } else {
                    log(`  Dropped table: ${table}`, 'cyan');
                }
                completed++;
                if (completed === tables.length) {
                    // Also drop views
                    db.run('DROP VIEW IF EXISTS v_active_strategies', () => {});
                    db.run('DROP VIEW IF EXISTS v_recent_signals', () => {});
                    db.run('DROP VIEW IF EXISTS v_smart_money_summary', () => {});
                    resolve();
                }
            });
        });
    });
}

/**
 * Insert sample data for testing
 */
function seedSampleData(db) {
    return new Promise((resolve, reject) => {
        log('Inserting sample data...', 'blue');

        const now = new Date().toISOString();

        // Sample strategies
        const strategies = [
            {
                name: 'Twitter Momentum Alpha',
                source: 'twitter',
                type: 'momentum',
                description: 'Captures momentum from viral Twitter mentions with volume confirmation',
                entry_rules: JSON.stringify({
                    min_mentions_per_hour: 50,
                    sentiment_threshold: 0.7,
                    volume_spike: 2.0,
                    min_market_cap: 1000000
                }),
                exit_rules: JSON.stringify({
                    take_profit: 0.15,
                    stop_loss: 0.07,
                    trailing_stop: 0.05,
                    max_hold_hours: 48
                }),
                risk_params: JSON.stringify({
                    position_size: 0.05,
                    max_positions: 5,
                    daily_loss_limit: 0.02
                }),
                performance_metrics: JSON.stringify({
                    backtest_return: 0.45,
                    max_drawdown: 0.12,
                    sharpe_ratio: 1.8
                }),
                confidence_score: 82.5
            },
            {
                name: 'Smart Money Follower',
                source: 'onchain',
                type: 'smart_money',
                description: 'Follows whale wallet movements on Ethereum and Solana',
                entry_rules: JSON.stringify({
                    min_wallet_balance_usd: 1000000,
                    min_buy_amount_usd: 50000,
                    wallet_win_rate_threshold: 0.6,
                    follow_within_minutes: 10
                }),
                exit_rules: JSON.stringify({
                    whale_sell_signal: true,
                    take_profit: 0.20,
                    stop_loss: 0.08
                }),
                risk_params: JSON.stringify({
                    position_size: 0.08,
                    max_slippage: 0.02,
                    gas_threshold_gwei: 50
                }),
                performance_metrics: JSON.stringify({
                    backtest_return: 0.62,
                    max_drawdown: 0.15,
                    sharpe_ratio: 2.1
                }),
                confidence_score: 88.0
            },
            {
                name: 'Breakout Scalper',
                source: 'technical',
                type: 'scalping',
                description: 'Quick scalp trades on confirmed breakout patterns',
                entry_rules: JSON.stringify({
                    breakout_confirmation: 'close_above_resistance',
                    volume_confirmation: true,
                    min_volatility: 0.03,
                    timeframe: '5m'
                }),
                exit_rules: JSON.stringify({
                    take_profit: 0.03,
                    stop_loss: 0.015,
                    time_exit_minutes: 30
                }),
                risk_params: JSON.stringify({
                    position_size: 0.10,
                    max_daily_trades: 10,
                    consecutive_loss_limit: 3
                }),
                performance_metrics: JSON.stringify({
                    backtest_return: 0.35,
                    max_drawdown: 0.08,
                    win_rate: 0.58
                }),
                confidence_score: 75.0
            }
        ];

        // Insert strategies
        const insertStrategy = db.prepare(`
            INSERT INTO strategies 
            (name, source, type, description, entry_rules, exit_rules, risk_params, performance_metrics, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        strategies.forEach(s => {
            insertStrategy.run(
                s.name, s.source, s.type, s.description,
                s.entry_rules, s.exit_rules, s.risk_params,
                s.performance_metrics, s.confidence_score
            );
        });
        insertStrategy.finalize();

        // Sample signals
        const signals = [
            {
                token_symbol: 'BTC',
                strategy_id: 2,
                signal_type: 'buy',
                entry_price: 98500.00,
                target_price: 108000.00,
                stop_loss: 94500.00,
                source: 'onchain_scanner',
                confidence: 85.5,
                notes: 'Whale accumulation detected - 3 wallets >$1M buying'
            },
            {
                token_symbol: 'SOL',
                strategy_id: 1,
                signal_type: 'strong_buy',
                entry_price: 245.50,
                target_price: 280.00,
                stop_loss: 228.00,
                source: 'twitter_analyzer',
                confidence: 78.0,
                notes: 'Viral Twitter thread + volume spike 3x'
            },
            {
                token_symbol: 'ETH',
                strategy_id: 3,
                signal_type: 'buy',
                entry_price: 2750.00,
                target_price: 2900.00,
                stop_loss: 2680.00,
                source: 'technical_indicator',
                confidence: 72.5,
                notes: 'Breakout above 4h resistance'
            }
        ];

        const insertSignal = db.prepare(`
            INSERT INTO signals 
            (token_symbol, strategy_id, signal_type, entry_price, target_price, stop_loss, source, confidence, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        signals.forEach(s => {
            insertSignal.run(
                s.token_symbol, s.strategy_id, s.signal_type,
                s.entry_price, s.target_price, s.stop_loss,
                s.source, s.confidence, s.notes
            );
        });
        insertSignal.finalize();

        // Sample smart money transactions
        const smartMoneyTxs = [
            {
                wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
                entity_name: 'Jump Trading',
                token_symbol: 'BTC',
                action: 'buy',
                amount: 150.5,
                amount_usd: 14800000,
                tx_hash: '0xabc123def456789',
                chain: 'ethereum',
                block_number: 18234567
            },
            {
                wallet_address: '0x1234567890abcdef',
                entity_name: 'Alameda Research',
                token_symbol: 'SOL',
                action: 'sell',
                amount: 50000,
                amount_usd: 12250000,
                tx_hash: '0xdef789abc123456',
                chain: 'solana',
                block_number: 234567890
            },
            {
                wallet_address: '0xfedcba0987654321',
                entity_name: null,
                token_symbol: 'ETH',
                action: 'buy',
                amount: 2500,
                amount_usd: 6875000,
                tx_hash: '0x9876543210fedcba',
                chain: 'ethereum',
                block_number: 18234568
            }
        ];

        const insertSmartMoney = db.prepare(`
            INSERT INTO smart_money 
            (wallet_address, entity_name, token_symbol, action, amount, amount_usd, tx_hash, chain, block_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        smartMoneyTxs.forEach(tx => {
            insertSmartMoney.run(
                tx.wallet_address, tx.entity_name, tx.token_symbol,
                tx.action, tx.amount, tx.amount_usd,
                tx.tx_hash, tx.chain, tx.block_number
            );
        });
        insertSmartMoney.finalize();

        // Sample market context
        const marketContext = {
            fear_greed_index: 65,
            fear_greed_classification: 'Greed',
            btc_dominance: 52.5,
            eth_dominance: 18.2,
            total_market_cap_usd: 2850000000000,
            btc_price: 98500,
            eth_price: 2750,
            narrative: 'Bitcoin consolidation after ETF approval, altcoin season beginning',
            trending_topics: JSON.stringify(['Bitcoin ETF', 'Solana DeFi', 'L2 Scaling', 'AI Tokens']),
            volatility_index: 0.035,
            funding_rates: JSON.stringify({ binance: 0.0001, bybit: 0.00012, dydx: 0.00008 }),
            liquidation_data: JSON.stringify({ longs_24h: 45000000, shorts_24h: 32000000 })
        };

        db.run(`
            INSERT INTO market_context 
            (fear_greed_index, fear_greed_classification, btc_dominance, eth_dominance, total_market_cap_usd, btc_price, eth_price, narrative, trending_topics, volatility_index, funding_rates, liquidation_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            marketContext.fear_greed_index,
            marketContext.fear_greed_classification,
            marketContext.btc_dominance,
            marketContext.eth_dominance,
            marketContext.total_market_cap_usd,
            marketContext.btc_price,
            marketContext.eth_price,
            marketContext.narrative,
            marketContext.trending_topics,
            marketContext.volatility_index,
            marketContext.funding_rates,
            marketContext.liquidation_data
        ]);

        // Sample strategy performance
        const performances = [
            {
                strategy_id: 1,
                win_count: 45,
                loss_count: 18,
                break_even_count: 2,
                avg_profit: 0.085,
                avg_loss: 0.045,
                total_trades: 65,
                win_rate: 69.2,
                profit_factor: 2.35,
                sharpe_ratio: 1.85,
                max_drawdown: 0.12,
                total_pnl: 2.45,
                avg_trade_duration_hours: 36.5,
                period_start: '2025-01-01',
                period_end: '2025-02-13'
            },
            {
                strategy_id: 2,
                win_count: 32,
                loss_count: 8,
                break_even_count: 0,
                avg_profit: 0.12,
                avg_loss: 0.055,
                total_trades: 40,
                win_rate: 80.0,
                profit_factor: 3.2,
                sharpe_ratio: 2.4,
                max_drawdown: 0.08,
                total_pnl: 3.85,
                avg_trade_duration_hours: 48.0,
                period_start: '2025-01-01',
                period_end: '2025-02-13'
            }
        ];

        const insertPerf = db.prepare(`
            INSERT INTO strategy_performance 
            (strategy_id, win_count, loss_count, break_even_count, avg_profit, avg_loss, total_trades, win_rate, profit_factor, sharpe_ratio, max_drawdown, total_pnl, avg_trade_duration_hours, period_start, period_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        performances.forEach(p => {
            insertPerf.run(
                p.strategy_id, p.win_count, p.loss_count, p.break_even_count,
                p.avg_profit, p.avg_loss, p.total_trades, p.win_rate,
                p.profit_factor, p.sharpe_ratio, p.max_drawdown, p.total_pnl,
                p.avg_trade_duration_hours, p.period_start, p.period_end
            );
        });
        insertPerf.finalize();

        log('Sample data inserted successfully', 'green');
        resolve();
    });
}

/**
 * Verify database setup
 */
function verifyDatabase(db) {
    return new Promise((resolve, reject) => {
        log('Verifying database setup...', 'blue');

        const checks = [
            { name: 'strategies', sql: 'SELECT COUNT(*) as count FROM strategies' },
            { name: 'signals', sql: 'SELECT COUNT(*) as count FROM signals' },
            { name: 'smart_money', sql: 'SELECT COUNT(*) as count FROM smart_money' },
            { name: 'market_context', sql: 'SELECT COUNT(*) as count FROM market_context' },
            { name: 'strategy_performance', sql: 'SELECT COUNT(*) as count FROM strategy_performance' }
        ];

        let completed = 0;
        const results = {};

        checks.forEach(check => {
            db.get(check.sql, (err, row) => {
                if (err) {
                    log(`  ✗ ${check.name}: ERROR - ${err.message}`, 'red');
                    results[check.name] = { error: err.message };
                } else {
                    log(`  ✓ ${check.name}: ${row.count} records`, 'green');
                    results[check.name] = { count: row.count };
                }
                completed++;
                if (completed === checks.length) {
                    resolve(results);
                }
            });
        });
    });
}

/**
 * Main initialization function
 */
async function main() {
    const args = process.argv.slice(2);
    const shouldReset = args.includes('--reset');
    const shouldSeed = args.includes('--seed');

    log('========================================', 'cyan');
    log('Trading Strategy Database Initialization', 'cyan');
    log('========================================', 'cyan');
    log(`Database path: ${DB_PATH}`, 'blue');
    log(`Schema path: ${SCHEMA_PATH}`, 'blue');

    // Check if database exists
    const exists = databaseExists();
    if (exists && !shouldReset) {
        log('Database already exists. Use --reset to recreate.', 'yellow');
    }

    // Connect to database
    const db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            log(`Failed to connect: ${err.message}`, 'red');
            process.exit(1);
        }
    });

    try {
        // Drop tables if reset flag
        if (shouldReset) {
            await dropAllTables(db);
        }

        // Initialize schema
        await initializeSchema(db);

        // Seed data if requested
        if (shouldSeed) {
            await seedSampleData(db);
        }

        // Verify setup
        await verifyDatabase(db);

        log('========================================', 'green');
        log('Database initialization complete!', 'green');
        log('========================================', 'green');

    } catch (error) {
        log(`Error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    } finally {
        db.close((err) => {
            if (err) {
                log(`Error closing database: ${err.message}`, 'red');
            } else {
                log('Database connection closed', 'blue');
            }
        });
    }
}

// Run main function
main();
