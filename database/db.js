/**
 * Trading Strategy Database Helper Module
 * Provides CRUD operations for the strategy-intelligence database
 * 
 * @module db
 * @version 1.0.0
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

// Database configuration
const DB_PATH = process.env.TRADING_DB_PATH || '/root/trading-bot/strategy-intelligence.db';

class TradingDatabase {
    constructor(dbPath = DB_PATH) {
        this.dbPath = dbPath;
        this.db = null;
    }

    /**
     * Initialize database connection
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Database connection error:', err.message);
                    reject(err);
                } else {
                    console.log('Connected to strategy-intelligence database');
                    // Enable foreign keys
                    this.db.run('PRAGMA foreign_keys = ON');
                    resolve(this.db);
                }
            });
        });
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        console.log('Database connection closed');
                        resolve();
                    }
                });
            });
        }
    }

    // ============================================
    // STRATEGIES CRUD
    // ============================================

    /**
     * Create a new strategy
     * @param {Object} strategy - Strategy data
     * @returns {Promise<number>} - New strategy ID
     */
    async createStrategy(strategy) {
        const {
            name,
            source,
            type,
            description = '',
            entry_rules = {},
            exit_rules = {},
            risk_params = {},
            performance_metrics = {},
            confidence_score = 50.00
        } = strategy;

        const sql = `
            INSERT INTO strategies 
            (name, source, type, description, entry_rules, exit_rules, risk_params, performance_metrics, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            name,
            source,
            type,
            description,
            JSON.stringify(entry_rules),
            JSON.stringify(exit_rules),
            JSON.stringify(risk_params),
            JSON.stringify(performance_metrics),
            confidence_score
        ];

        return this.run(sql, params);
    }

    /**
     * Get strategy by ID
     * @param {number} id - Strategy ID
     * @returns {Promise<Object>}
     */
    async getStrategy(id) {
        const sql = 'SELECT * FROM strategies WHERE id = ?';
        const row = await this.get(sql, [id]);
        if (row) {
            return this.parseStrategyRow(row);
        }
        return null;
    }

    /**
     * Get all strategies with optional filtering
     * @param {Object} filters - Filter criteria
     * @returns {Promise<Array>}
     */
    async getStrategies(filters = {}) {
        let sql = 'SELECT * FROM strategies WHERE 1=1';
        const params = [];

        if (filters.source) {
            sql += ' AND source = ?';
            params.push(filters.source);
        }
        if (filters.type) {
            sql += ' AND type = ?';
            params.push(filters.type);
        }
        if (filters.minConfidence) {
            sql += ' AND confidence_score >= ?';
            params.push(filters.minConfidence);
        }
        if (filters.active !== undefined) {
            sql += ' AND confidence_score >= 60';
        }

        sql += ' ORDER BY confidence_score DESC, updated_at DESC';

        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }

        const rows = await this.all(sql, params);
        return rows.map(row => this.parseStrategyRow(row));
    }

    /**
     * Update strategy
     * @param {number} id - Strategy ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateStrategy(id, updates) {
        const allowedFields = ['name', 'description', 'entry_rules', 'exit_rules', 'risk_params', 'performance_metrics', 'confidence_score'];
        const fields = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                params.push(typeof value === 'object' ? JSON.stringify(value) : value);
            }
        }

        if (fields.length === 0) return;

        const sql = `UPDATE strategies SET ${fields.join(', ')} WHERE id = ?`;
        params.push(id);

        return this.run(sql, params);
    }

    /**
     * Delete strategy
     * @param {number} id - Strategy ID
     */
    async deleteStrategy(id) {
        return this.run('DELETE FROM strategies WHERE id = ?', [id]);
    }

    // ============================================
    // SIGNALS CRUD
    // ============================================

    /**
     * Create a new trading signal
     * @param {Object} signal - Signal data
     * @returns {Promise<number>} - New signal ID
     */
    async createSignal(signal) {
        const {
            token_symbol,
            strategy_id,
            signal_type,
            entry_price,
            target_price,
            stop_loss,
            source,
            confidence,
            notes = ''
        } = signal;

        const sql = `
            INSERT INTO signals 
            (token_symbol, strategy_id, signal_type, entry_price, target_price, stop_loss, source, confidence, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            token_symbol,
            strategy_id,
            signal_type,
            entry_price,
            target_price,
            stop_loss,
            source,
            confidence,
            notes
        ];

        return this.run(sql, params);
    }

    /**
     * Get signal by ID
     * @param {number} id - Signal ID
     */
    async getSignal(id) {
        const sql = `
            SELECT s.*, st.name as strategy_name 
            FROM signals s 
            LEFT JOIN strategies st ON s.strategy_id = st.id 
            WHERE s.id = ?
        `;
        const row = await this.get(sql, [id]);
        return row || null;
    }

    /**
     * Get recent signals with filtering
     * @param {Object} filters - Filter options
     */
    async getSignals(filters = {}) {
        let sql = `
            SELECT s.*, st.name as strategy_name, st.type as strategy_type
            FROM signals s
            LEFT JOIN strategies st ON s.strategy_id = st.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.token) {
            sql += ' AND s.token_symbol = ?';
            params.push(filters.token.toUpperCase());
        }
        if (filters.strategy_id) {
            sql += ' AND s.strategy_id = ?';
            params.push(filters.strategy_id);
        }
        if (filters.signal_type) {
            sql += ' AND s.signal_type = ?';
            params.push(filters.signal_type);
        }
        if (filters.executed !== undefined) {
            sql += ' AND s.executed = ?';
            params.push(filters.executed ? 1 : 0);
        }
        if (filters.minConfidence) {
            sql += ' AND s.confidence >= ?';
            params.push(filters.minConfidence);
        }
        if (filters.since) {
            sql += ' AND s.timestamp >= ?';
            params.push(filters.since);
        }

        sql += ' ORDER BY s.timestamp DESC';

        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }

        return this.all(sql, params);
    }

    /**
     * Mark signal as executed
     * @param {number} id - Signal ID
     * @param {Object} execution - Execution details
     */
    async markSignalExecuted(id, execution) {
        const { execution_price, pnl = null } = execution;
        const sql = `
            UPDATE signals 
            SET executed = 1, execution_price = ?, execution_time = CURRENT_TIMESTAMP, pnl = ?
            WHERE id = ?
        `;
        return this.run(sql, [execution_price, pnl, id]);
    }

    /**
     * Get pending signals (not executed)
     */
    async getPendingSignals() {
        return this.getSignals({ executed: false, limit: 100 });
    }

    // ============================================
    // SMART MONEY CRUD
    // ============================================

    /**
     * Record smart money transaction
     * @param {Object} transaction - Transaction data
     */
    async recordSmartMoney(transaction) {
        const {
            wallet_address,
            entity_name = null,
            token_symbol,
            action,
            amount,
            amount_usd = null,
            tx_hash,
            chain,
            strategy_correlation = null,
            block_number = null,
            gas_price_gwei = null
        } = transaction;

        const sql = `
            INSERT INTO smart_money 
            (wallet_address, entity_name, token_symbol, action, amount, amount_usd, tx_hash, chain, strategy_correlation, block_number, gas_price_gwei)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            wallet_address,
            entity_name,
            token_symbol.toUpperCase(),
            action,
            amount,
            amount_usd,
            tx_hash,
            chain,
            strategy_correlation,
            block_number,
            gas_price_gwei
        ];

        return this.run(sql, params);
    }

    /**
     * Get smart money activity
     * @param {Object} filters - Filter options
     */
    async getSmartMoney(filters = {}) {
        let sql = 'SELECT * FROM smart_money WHERE 1=1';
        const params = [];

        if (filters.token) {
            sql += ' AND token_symbol = ?';
            params.push(filters.token.toUpperCase());
        }
        if (filters.wallet) {
            sql += ' AND wallet_address = ?';
            params.push(filters.wallet);
        }
        if (filters.action) {
            sql += ' AND action = ?';
            params.push(filters.action);
        }
        if (filters.chain) {
            sql += ' AND chain = ?';
            params.push(filters.chain);
        }
        if (filters.entity) {
            sql += ' AND entity_name = ?';
            params.push(filters.entity);
        }
        if (filters.minAmountUsd) {
            sql += ' AND amount_usd >= ?';
            params.push(filters.minAmountUsd);
        }
        if (filters.since) {
            sql += ' AND timestamp >= ?';
            params.push(filters.since);
        }

        sql += ' ORDER BY timestamp DESC';

        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }

        return this.all(sql, params);
    }

    /**
     * Get smart money summary by token
     */
    async getSmartMoneySummary() {
        const sql = 'SELECT * FROM v_smart_money_summary ORDER BY last_activity DESC';
        return this.all(sql);
    }

    /**
     * Get significant transactions (whale movements)
     * @param {number} minUsd - Minimum USD amount
     * @param {number} hours - Lookback period
     */
    async getWhaleMovements(minUsd = 100000, hours = 24) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        return this.getSmartMoney({ minAmountUsd: minUsd, since });
    }

    // ============================================
    // MARKET CONTEXT CRUD
    // ============================================

    /**
     * Record market context snapshot
     * @param {Object} context - Market data
     */
    async recordMarketContext(context) {
        const {
            fear_greed_index,
            fear_greed_classification,
            btc_dominance,
            eth_dominance = null,
            total_market_cap_usd = null,
            btc_price = null,
            eth_price = null,
            narrative = '',
            trending_topics = [],
            volatility_index = null,
            funding_rates = {},
            liquidation_data = {}
        } = context;

        const sql = `
            INSERT INTO market_context 
            (fear_greed_index, fear_greed_classification, btc_dominance, eth_dominance, total_market_cap_usd, btc_price, eth_price, narrative, trending_topics, volatility_index, funding_rates, liquidation_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            fear_greed_index,
            fear_greed_classification,
            btc_dominance,
            eth_dominance,
            total_market_cap_usd,
            btc_price,
            eth_price,
            narrative,
            JSON.stringify(trending_topics),
            volatility_index,
            JSON.stringify(funding_rates),
            JSON.stringify(liquidation_data)
        ];

        return this.run(sql, params);
    }

    /**
     * Get latest market context
     */
    async getLatestMarketContext() {
        const sql = 'SELECT * FROM market_context ORDER BY timestamp DESC LIMIT 1';
        const row = await this.get(sql);
        if (row) {
            return this.parseMarketContextRow(row);
        }
        return null;
    }

    /**
     * Get market context history
     * @param {number} limit - Number of records
     */
    async getMarketContextHistory(limit = 100) {
        const sql = 'SELECT * FROM market_context ORDER BY timestamp DESC LIMIT ?';
        const rows = await this.all(sql, [limit]);
        return rows.map(row => this.parseMarketContextRow(row));
    }

    // ============================================
    // STRATEGY PERFORMANCE CRUD
    // ============================================

    /**
     * Record or update strategy performance
     * @param {Object} performance - Performance data
     */
    async updateStrategyPerformance(performance) {
        const {
            strategy_id,
            win_count = 0,
            loss_count = 0,
            break_even_count = 0,
            avg_profit = 0,
            avg_loss = 0,
            total_trades,
            win_rate,
            profit_factor = null,
            sharpe_ratio = null,
            max_drawdown = null,
            total_pnl = 0,
            avg_trade_duration_hours = null,
            period_start = new Date().toISOString().split('T')[0],
            period_end = new Date().toISOString().split('T')[0]
        } = performance;

        const calculatedTotal = win_count + loss_count + break_even_count;
        const finalTotalTrades = total_trades || calculatedTotal;
        const finalWinRate = win_rate || (finalTotalTrades > 0 ? (win_count / finalTotalTrades * 100) : 0);

        const sql = `
            INSERT INTO strategy_performance 
            (strategy_id, win_count, loss_count, break_even_count, avg_profit, avg_loss, total_trades, win_rate, profit_factor, sharpe_ratio, max_drawdown, total_pnl, avg_trade_duration_hours, period_start, period_end)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(strategy_id, period_start) DO UPDATE SET
                win_count = excluded.win_count,
                loss_count = excluded.loss_count,
                break_even_count = excluded.break_even_count,
                avg_profit = excluded.avg_profit,
                avg_loss = excluded.avg_loss,
                total_trades = excluded.total_trades,
                win_rate = excluded.win_rate,
                profit_factor = excluded.profit_factor,
                sharpe_ratio = excluded.sharpe_ratio,
                max_drawdown = excluded.max_drawdown,
                total_pnl = excluded.total_pnl,
                avg_trade_duration_hours = excluded.avg_trade_duration_hours,
                period_end = excluded.period_end,
                last_updated = CURRENT_TIMESTAMP
        `;

        const params = [
            strategy_id, win_count, loss_count, break_even_count, avg_profit, avg_loss,
            finalTotalTrades, finalWinRate, profit_factor, sharpe_ratio, max_drawdown,
            total_pnl, avg_trade_duration_hours, period_start, period_end
        ];

        return this.run(sql, params);
    }

    /**
     * Get strategy performance
     * @param {number} strategyId - Strategy ID
     */
    async getStrategyPerformance(strategyId) {
        const sql = `
            SELECT sp.*, s.name as strategy_name, s.type as strategy_type
            FROM strategy_performance sp
            JOIN strategies s ON sp.strategy_id = s.id
            WHERE sp.strategy_id = ?
            ORDER BY sp.period_start DESC
        `;
        return this.all(sql, [strategyId]);
    }

    /**
     * Get top performing strategies
     * @param {number} limit - Number of strategies
     */
    async getTopStrategies(limit = 10) {
        const sql = `
            SELECT sp.*, s.name as strategy_name, s.type as strategy_type, s.confidence_score
            FROM strategy_performance sp
            JOIN strategies s ON sp.strategy_id = s.id
            ORDER BY sp.total_pnl DESC, sp.win_rate DESC
            LIMIT ?
        `;
        return this.all(sql, [limit]);
    }

    // ============================================
    // ANALYTICS & REPORTING
    // ============================================

    /**
     * Get comprehensive dashboard data
     */
    async getDashboardData() {
        const [
            activeStrategies,
            pendingSignals,
            recentSmartMoney,
            marketContext,
            topStrategies,
            todaySignals
        ] = await Promise.all([
            this.all('SELECT COUNT(*) as count FROM strategies WHERE confidence_score >= 70'),
            this.all('SELECT COUNT(*) as count FROM signals WHERE executed = 0'),
            this.all('SELECT * FROM smart_money ORDER BY timestamp DESC LIMIT 10'),
            this.getLatestMarketContext(),
            this.getTopStrategies(5),
            this.all(`SELECT COUNT(*) as count FROM signals WHERE DATE(timestamp) = DATE('now')`)
        ]);

        return {
            summary: {
                active_strategies: activeStrategies[0].count,
                pending_signals: pendingSignals[0].count,
                signals_today: todaySignals[0].count
            },
            market_context: marketContext,
            recent_smart_money: recentSmartMoney,
            top_strategies: topStrategies
        };
    }

    /**
     * Get signals performance report
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     */
    async getSignalsReport(startDate, endDate) {
        const sql = `
            SELECT 
                s.token_symbol,
                s.signal_type,
                COUNT(*) as total_signals,
                SUM(CASE WHEN s.executed = 1 THEN 1 ELSE 0 END) as executed_count,
                SUM(CASE WHEN s.pnl > 0 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN s.pnl < 0 THEN 1 ELSE 0 END) as losses,
                AVG(s.pnl) as avg_pnl,
                SUM(s.pnl) as total_pnl
            FROM signals s
            WHERE DATE(s.timestamp) BETWEEN ? AND ?
            GROUP BY s.token_symbol, s.signal_type
            ORDER BY total_pnl DESC
        `;
        return this.all(sql, [startDate, endDate]);
    }

    // ============================================
    // EXPORT FORMATS
    // ============================================

    /**
     * Export data for trading division consumption
     * @param {Object} options - Export options
     * @returns {Object} - Formatted export data
     */
    async exportForTradingDivision(options = {}) {
        const {
            signalLimit = 50,
            strategyLimit = 20,
            includeSmartMoney = true,
            includeMarketContext = true
        } = options;

        const exportData = {
            metadata: {
                exported_at: new Date().toISOString(),
                version: '1.0.0',
                source: 'strategy-intelligence-db'
            },
            strategies: [],
            active_signals: [],
            smart_money_alerts: [],
            market_context: null
        };

        // Get active strategies with performance
        const strategies = await this.all(`
            SELECT s.*, sp.win_rate, sp.total_pnl, sp.profit_factor
            FROM strategies s
            LEFT JOIN strategy_performance sp ON s.id = sp.strategy_id
            WHERE s.confidence_score >= 60
            ORDER BY s.confidence_score DESC
            LIMIT ?
        `, [strategyLimit]);

        exportData.strategies = strategies.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            source: s.source,
            confidence_score: s.confidence_score,
            entry_rules: JSON.parse(s.entry_rules || '{}'),
            exit_rules: JSON.parse(s.exit_rules || '{}'),
            risk_params: JSON.parse(s.risk_params || '{}'),
            performance: {
                win_rate: s.win_rate,
                total_pnl: s.total_pnl,
                profit_factor: s.profit_factor
            }
        }));

        // Get pending signals
        const signals = await this.getSignals({ 
            executed: false, 
            limit: signalLimit 
        });

        exportData.active_signals = signals.map(sig => ({
            id: sig.id,
            token: sig.token_symbol,
            signal_type: sig.signal_type,
            entry_price: sig.entry_price,
            target_price: sig.target_price,
            stop_loss: sig.stop_loss,
            confidence: sig.confidence,
            strategy: {
                id: sig.strategy_id,
                name: sig.strategy_name,
                type: sig.strategy_type
            },
            timestamp: sig.timestamp,
            source: sig.source
        }));

        // Get recent smart money if requested
        if (includeSmartMoney) {
            const smartMoney = await this.getSmartMoney({ limit: 20 });
            exportData.smart_money_alerts = smartMoney.map(sm => ({
                wallet: sm.wallet_address,
                entity: sm.entity_name,
                token: sm.token_symbol,
                action: sm.action,
                amount: sm.amount,
                amount_usd: sm.amount_usd,
                chain: sm.chain,
                timestamp: sm.timestamp,
                tx_hash: sm.tx_hash
            }));
        }

        // Get market context if requested
        if (includeMarketContext) {
            exportData.market_context = await this.getLatestMarketContext();
        }

        return exportData;
    }

    /**
     * Export strategies as JSON
     */
    async exportStrategiesJSON() {
        const strategies = await this.getStrategies();
        return {
            exported_at: new Date().toISOString(),
            count: strategies.length,
            strategies: strategies
        };
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Parse strategy row (handle JSON fields)
     */
    parseStrategyRow(row) {
        return {
            ...row,
            entry_rules: JSON.parse(row.entry_rules || '{}'),
            exit_rules: JSON.parse(row.exit_rules || '{}'),
            risk_params: JSON.parse(row.risk_params || '{}'),
            performance_metrics: JSON.parse(row.performance_metrics || '{}')
        };
    }

    /**
     * Parse market context row (handle JSON fields)
     */
    parseMarketContextRow(row) {
        return {
            ...row,
            trending_topics: JSON.parse(row.trending_topics || '[]'),
            funding_rates: JSON.parse(row.funding_rates || '{}'),
            liquidation_data: JSON.parse(row.liquidation_data || '{}')
        };
    }

    /**
     * Run SQL query (insert/update/delete)
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('SQL Error:', err.message);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    /**
     * Get single row
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get all rows
     */
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let instance = null;

function getDatabase() {
    if (!instance) {
        instance = new TradingDatabase();
    }
    return instance;
}

// ============================================
// MODULE EXPORTS
// ============================================

module.exports = {
    TradingDatabase,
    getDatabase,
    DB_PATH
};
