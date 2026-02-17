#!/usr/bin/env node
/**
 * Twitter/X Trading Signal Analyzer
 * Analyzes patterns and generates insights from collected tweets
 * 
 * Usage: node twitter-analyzer.js [--report] [--token <SYMBOL>] [--timeframe <hours>]
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

// Configuration
const CONFIG = {
    databasePath: '/root/trading-bot/database/twitter_signals.db',
    defaultTimeframe: 24, // hours
    topAccountsLimit: 10,
    minSignalsForAnalysis: 5
};

// Logger utility
const logger = {
    info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
    success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
    warning: (msg) => console.log(`[${new Date().toISOString()}] ⚠️  ${msg}`),
    error: (msg) => console.log(`[${new Date().toISOString()}] ❌ ${msg}`),
    highlight: (msg) => console.log(`\n🔥 ${msg}\n`)
};

// Database class
class Database {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
        this.allAsync = promisify(this.db.all.bind(this.db));
        this.getAsync = promisify(this.db.get.bind(this.db));
        this.runAsync = promisify(this.db.run.bind(this.db));
    }

    async getRecentSignals(hours = 24) {
        const sql = `
            SELECT 
                s.*,
                t.author_username,
                t.content,
                t.posted_at,
                t.retweets,
                t.likes
            FROM trading_signals s
            JOIN tweets t ON s.tweet_id = t.id
            WHERE t.posted_at >= datetime('now', '-${hours} hours')
            ORDER BY t.posted_at DESC
        `;
        return await this.allAsync(sql);
    }

    async getSignalsByToken(token, hours = 24) {
        const sql = `
            SELECT 
                s.*,
                t.author_username,
                t.content,
                t.posted_at,
                t.retweets,
                t.likes
            FROM trading_signals s
            JOIN tweets t ON s.tweet_id = t.id
            WHERE (s.token_symbol = ? OR t.content LIKE ?)
            AND t.posted_at >= datetime('now', '-${hours} hours')
            ORDER BY t.posted_at DESC
        `;
        return await this.allAsync(sql, [token.toUpperCase(), `%$${token}%`]);
    }

    async getSignalsByAccount(username, hours = 24) {
        const sql = `
            SELECT 
                s.*,
                t.author_username,
                t.content,
                t.posted_at
            FROM trading_signals s
            JOIN tweets t ON s.tweet_id = t.id
            WHERE t.author_username = ?
            AND t.posted_at >= datetime('now', '-${hours} hours')
            ORDER BY t.posted_at DESC
        `;
        return await this.allAsync(sql, [username]);
    }

    async getTopMentionedTokens(hours = 24, limit = 10) {
        const sql = `
            SELECT 
                COALESCE(s.token_symbol, tm.token_symbol) as symbol,
                COUNT(*) as mention_count,
                COUNT(DISTINCT t.author_username) as unique_accounts,
                GROUP_CONCAT(DISTINCT t.author_username) as accounts,
                AVG(CASE WHEN s.sentiment = 'bullish' THEN 1 
                         WHEN s.sentiment = 'bearish' THEN -1 
                         ELSE 0 END) as avg_sentiment,
                COUNT(CASE WHEN s.signal_type = 'BUY' THEN 1 END) as buy_signals,
                COUNT(CASE WHEN s.signal_type = 'SELL' THEN 1 END) as sell_signals
            FROM tweets t
            LEFT JOIN trading_signals s ON t.id = s.tweet_id
            LEFT JOIN token_mentions tm ON t.id = tm.tweet_id
            WHERE t.posted_at >= datetime('now', '-${hours} hours')
            AND (s.token_symbol IS NOT NULL OR tm.token_symbol IS NOT NULL)
            GROUP BY COALESCE(s.token_symbol, tm.token_symbol)
            ORDER BY mention_count DESC
            LIMIT ?
        `;
        return await this.allAsync(sql, [limit]);
    }

    async getSentimentByAccount(hours = 24) {
        const sql = `
            SELECT 
                t.author_username,
                COUNT(*) as total_signals,
                COUNT(CASE WHEN s.sentiment = 'bullish' THEN 1 END) as bullish_count,
                COUNT(CASE WHEN s.sentiment = 'bearish' THEN 1 END) as bearish_count,
                COUNT(CASE WHEN s.sentiment = 'neutral' THEN 1 END) as neutral_count,
                COUNT(CASE WHEN s.signal_type = 'BUY' THEN 1 END) as buy_count,
                COUNT(CASE WHEN s.signal_type = 'SELL' THEN 1 END) as sell_count,
                AVG(s.confidence_score) as avg_confidence,
                MAX(t.posted_at) as last_signal
            FROM trading_signals s
            JOIN tweets t ON s.tweet_id = t.id
            WHERE t.posted_at >= datetime('now', '-${hours} hours')
            GROUP BY t.author_username
            ORDER BY total_signals DESC
        `;
        return await this.allAsync(sql);
    }

    async getSignalAccuracy(username = null) {
        let sql = `
            SELECT 
                COUNT(*) as total_signals,
                COUNT(CASE WHEN so.outcome = 'hit_target' THEN 1 END) as hit_target,
                COUNT(CASE WHEN so.outcome = 'hit_stop' THEN 1 END) as hit_stop,
                COUNT(CASE WHEN so.outcome = 'expired' THEN 1 END) as expired,
                AVG(so.pnl_percent) as avg_pnl,
                AVG(CASE WHEN so.outcome = 'hit_target' THEN 1 ELSE 0 END) as win_rate
            FROM trading_signals s
            JOIN signal_outcomes so ON s.id = so.signal_id
        `;
        
        if (username) {
            sql += ` JOIN tweets t ON s.tweet_id = t.id WHERE t.author_username = ?`;
            return await this.getAsync(sql, [username]);
        }
        
        return await this.getAsync(sql);
    }

    async getCorrelationMatrix(hours = 24) {
        const sql = `
            SELECT 
                t1.author_username as account1,
                t2.author_username as account2,
                COUNT(*) as co_mentions,
                GROUP_CONCAT(DISTINCT COALESCE(s1.token_symbol, s2.token_symbol)) as shared_tokens
            FROM trading_signals s1
            JOIN tweets t1 ON s1.tweet_id = t1.id
            JOIN trading_signals s2 ON s1.token_symbol = s2.token_symbol AND s1.id < s2.id
            JOIN tweets t2 ON s2.tweet_id = t2.id
            WHERE t1.posted_at >= datetime('now', '-${hours} hours')
            AND t2.posted_at >= datetime('now', '-${hours} hours')
            AND t1.author_username != t2.author_username
            GROUP BY t1.author_username, t2.author_username
            HAVING co_mentions >= 2
            ORDER BY co_mentions DESC
        `;
        return await this.allAsync(sql);
    }

    async getHourlyActivity(hours = 24) {
        const sql = `
            SELECT 
                strftime('%H', t.posted_at) as hour,
                COUNT(*) as signal_count,
                COUNT(DISTINCT t.author_username) as active_accounts
            FROM trading_signals s
            JOIN tweets t ON s.tweet_id = t.id
            WHERE t.posted_at >= datetime('now', '-${hours} hours')
            GROUP BY hour
            ORDER BY hour
        `;
        return await this.allAsync(sql);
    }

    async getAllAccounts() {
        return await this.allAsync('SELECT * FROM monitored_accounts WHERE is_active = 1 ORDER BY priority DESC');
    }

    close() {
        this.db.close();
    }
}

// Analyzer class
class SignalAnalyzer {
    constructor(db) {
        this.db = db;
    }

    async generateMarketSentiment(hours = 24) {
        logger.info(`Analyzing market sentiment (last ${hours}h)...`);
        
        const signals = await this.db.getRecentSignals(hours);
        
        if (signals.length === 0) {
            return { sentiment: 'neutral', confidence: 0, reason: 'No signals found' };
        }

        const bullish = signals.filter(s => s.sentiment === 'bullish' || s.sentiment === 'very_bullish').length;
        const bearish = signals.filter(s => s.sentiment === 'bearish' || s.sentiment === 'very_bearish').length;
        const neutral = signals.filter(s => s.sentiment === 'neutral').length;
        const total = signals.length;

        const bullishRatio = bullish / total;
        const bearishRatio = bearish / total;

        let sentiment, confidence, reason;

        if (bullishRatio > 0.6) {
            sentiment = 'strongly_bullish';
            confidence = bullishRatio;
            reason = `${Math.round(bullishRatio * 100)}% of ${total} signals are bullish`;
        } else if (bullishRatio > 0.4) {
            sentiment = 'bullish';
            confidence = bullishRatio;
            reason = `Bullish signals (${bullish}) outnumber bearish (${bearish})`;
        } else if (bearishRatio > 0.6) {
            sentiment = 'strongly_bearish';
            confidence = bearishRatio;
            reason = `${Math.round(bearishRatio * 100)}% of ${total} signals are bearish`;
        } else if (bearishRatio > 0.4) {
            sentiment = 'bearish';
            confidence = bearishRatio;
            reason = `Bearish signals (${bearish}) outnumber bullish (${bullish})`;
        } else {
            sentiment = 'neutral';
            confidence = neutral / total;
            reason = 'Mixed signals, market indecision';
        }

        return { sentiment, confidence, reason, stats: { bullish, bearish, neutral, total } };
    }

    async identifyHotTokens(hours = 24) {
        logger.info(`Identifying hot tokens (last ${hours}h)...`);
        
        const tokens = await this.db.getTopMentionedTokens(hours, 10);
        
        return tokens.map(t => ({
            symbol: t.symbol,
            mentions: t.mention_count,
            uniqueAccounts: t.unique_accounts,
            accounts: t.accounts ? t.accounts.split(',') : [],
            sentiment: t.avg_sentiment > 0.3 ? 'bullish' : t.avg_sentiment < -0.3 ? 'bearish' : 'mixed',
            buySignals: t.buy_signals,
            sellSignals: t.sell_signals,
            score: this.calculateTokenScore(t)
        })).sort((a, b) => b.score - a.score);
    }

    calculateTokenScore(token) {
        let score = token.mention_count * 10;
        score += token.unique_accounts * 20;
        score += token.buy_signals * 15;
        score -= token.sell_signals * 10;
        if (token.avg_sentiment > 0) score += token.avg_sentiment * 25;
        return Math.max(0, score);
    }

    async analyzeAccountPerformance(hours = 24) {
        logger.info(`Analyzing account performance (last ${hours}h)...`);
        
        const accounts = await this.db.getSentimentByAccount(hours);
        
        return accounts.map(a => {
            const winRate = a.total_signals > 0 ? (a.bullish_count / a.total_signals) : 0;
            const consistency = this.calculateConsistency(a);
            
            return {
                username: a.author_username,
                totalSignals: a.total_signals,
                bullishRatio: a.bullish_count / a.total_signals,
                bearishRatio: a.bearish_count / a.total_signals,
                buyCount: a.buy_count,
                sellCount: a.sell_count,
                avgConfidence: a.avg_confidence,
                consistency: consistency,
                lastSignal: a.last_signal,
                reliabilityScore: this.calculateReliabilityScore(a, winRate, consistency)
            };
        }).sort((a, b) => b.reliabilityScore - a.reliabilityScore);
    }

    calculateConsistency(account) {
        const total = account.total_signals;
        if (total < 5) return 0;
        
        const dominant = Math.max(account.bullish_count, account.bearish_count, account.neutral_count);
        return dominant / total;
    }

    calculateReliabilityScore(account, winRate, consistency) {
        let score = 0;
        score += (account.total_signals / 20) * 30; // More signals = more track record
        score += winRate * 40;
        score += consistency * 20;
        score += (account.avg_confidence || 0.5) * 10;
        return Math.min(100, score);
    }

    async detectConsensusTrades(hours = 24) {
        logger.info(`Detecting consensus trades (last ${hours}h)...`);
        
        const tokens = await this.db.getTopMentionedTokens(hours, 20);
        
        const consensus = tokens.filter(t => {
            const hasMultipleAccounts = t.unique_accounts >= 3;
            const strongSentiment = Math.abs(t.avg_sentiment) > 0.5;
            const hasSignal = t.buy_signals > 0 || t.sell_signals > 0;
            return hasMultipleAccounts && strongSentiment && hasSignal;
        }).map(t => ({
            symbol: t.symbol,
            type: t.avg_sentiment > 0 ? 'BUY' : 'SELL',
            accounts: t.accounts ? t.accounts.split(',') : [],
            accountCount: t.unique_accounts,
            sentiment: t.avg_sentiment,
            confidence: Math.min(1, t.unique_accounts / 5 + Math.abs(t.avg_sentiment) * 0.5)
        }));

        return consensus.sort((a, b) => b.confidence - a.confidence);
    }

    async findSmartMoneySignals(hours = 24) {
        logger.info(`Finding smart money signals (last ${hours}h)...`);
        
        const accounts = await this.db.getAllAccounts();
        const smartMoney = accounts.filter(a => 
            a.account_type === 'smart_money' || 
            a.account_type === 'whale_alert' ||
            a.priority >= 9
        );

        const signals = [];
        for (const account of smartMoney) {
            const accountSignals = await this.db.getSignalsByAccount(account.username, hours);
            if (accountSignals.length > 0) {
                signals.push({
                    account: account.username,
                    accountType: account.account_type,
                    signals: accountSignals.slice(0, 5),
                    highConfidence: accountSignals.filter(s => s.confidence_score > 0.7).length
                });
            }
        }

        return signals.sort((a, b) => b.highConfidence - a.highConfidence);
    }

    async analyzeTimingPatterns(hours = 24) {
        logger.info(`Analyzing timing patterns (last ${hours}h)...`);
        
        const hourly = await this.db.getHourlyActivity(hours);
        
        const peakHours = hourly
            .sort((a, b) => b.signal_count - a.signal_count)
            .slice(0, 3)
            .map(h => ({
                hour: parseInt(h.hour),
                signals: h.signal_count,
                accounts: h.active_accounts
            }));

        const quietHours = hourly
            .sort((a, b) => a.signal_count - b.signal_count)
            .slice(0, 3)
            .map(h => ({
                hour: parseInt(h.hour),
                signals: h.signal_count,
                accounts: h.active_accounts
            }));

        return { peakHours, quietHours, allHours: hourly };
    }

    async generateFullReport(hours = 24) {
        logger.info('Generating full market intelligence report...\n');

        const [marketSentiment, hotTokens, accountPerformance, consensusTrades, smartMoney, timing] = await Promise.all([
            this.generateMarketSentiment(hours),
            this.identifyHotTokens(hours),
            this.analyzeAccountPerformance(hours),
            this.detectConsensusTrades(hours),
            this.findSmartMoneySignals(hours),
            this.analyzeTimingPatterns(hours)
        ]);

        return {
            generatedAt: new Date().toISOString(),
            timeframe: `${hours}h`,
            marketSentiment,
            hotTokens,
            accountPerformance,
            consensusTrades,
            smartMoney,
            timing
        };
    }
}

// Report formatter
class ReportFormatter {
    static format(report) {
        let output = '\n';
        output += '╔════════════════════════════════════════════════════════════════╗\n';
        output += '║           🐦 TWITTER SIGNAL INTELLIGENCE REPORT                ║\n';
        output += '╚════════════════════════════════════════════════════════════════╝\n\n';
        
        output += `📅 Generated: ${new Date(report.generatedAt).toLocaleString()}\n`;
        output += `⏱️  Timeframe: Last ${report.timeframe}\n\n`;

        // Market Sentiment
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '📊 MARKET SENTIMENT\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        const sentiment = report.marketSentiment;
        const emoji = sentiment.sentiment.includes('bullish') ? '🟢' : sentiment.sentiment.includes('bearish') ? '🔴' : '⚪';
        output += `${emoji} ${sentiment.sentiment.toUpperCase()} (${Math.round(sentiment.confidence * 100)}% confidence)\n`;
        output += `   ${sentiment.reason}\n`;
        if (sentiment.stats) {
            output += `   Bullish: ${sentiment.stats.bullish} | Bearish: ${sentiment.stats.bearish} | Neutral: ${sentiment.stats.neutral}\n`;
        }
        output += '\n';

        // Hot Tokens
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '🔥 HOT TOKENS\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        if (report.hotTokens.length === 0) {
            output += 'No tokens found in analysis period.\n';
        } else {
            report.hotTokens.slice(0, 10).forEach((token, i) => {
                const sentEmoji = token.sentiment === 'bullish' ? '🟢' : token.sentiment === 'bearish' ? '🔴' : '⚪';
                output += `${i + 1}. $${token.symbol.padEnd(8)} ${sentEmoji} Score: ${Math.round(token.score)}\n`;
                output += `   Mentions: ${token.mentions} | Accounts: ${token.uniqueAccounts} | Buy: ${token.buySignals} Sell: ${token.sellSignals}\n`;
                output += `   Top accounts: ${token.accounts.slice(0, 3).join(', ')}\n`;
            });
        }
        output += '\n';

        // Consensus Trades
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '🤝 CONSENSUS TRADES (3+ accounts agree)\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        if (report.consensusTrades.length === 0) {
            output += 'No strong consensus found.\n';
        } else {
            report.consensusTrades.slice(0, 5).forEach((trade, i) => {
                const typeEmoji = trade.type === 'BUY' ? '🟢' : '🔴';
                output += `${i + 1}. $${trade.symbol.padEnd(8)} ${typeEmoji} ${trade.type} (${Math.round(trade.confidence * 100)}% confidence)\n`;
                output += `   Accounts (${trade.accountCount}): ${trade.accounts.join(', ')}\n`;
            });
        }
        output += '\n';

        // Smart Money
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '🐋 SMART MONEY ACTIVITY\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        if (report.smartMoney.length === 0) {
            output += 'No smart money signals found.\n';
        } else {
            report.smartMoney.slice(0, 5).forEach(sm => {
                output += `@${sm.account} (${sm.accountType}): ${sm.signals.length} signals, ${sm.highConfidence} high confidence\n`;
                if (sm.signals.length > 0) {
                    const latest = sm.signals[0];
                    output += `   Latest: ${latest.signal_type || 'MENTION'} $${latest.token_symbol || '?'} (${latest.sentiment})\n`;
                }
            });
        }
        output += '\n';

        // Account Performance
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '📈 TOP PERFORMING ACCOUNTS\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        report.accountPerformance.slice(0, 5).forEach((acc, i) => {
            const bullishPct = Math.round(acc.bullishRatio * 100);
            output += `${i + 1}. @${acc.username.padEnd(20)} Score: ${Math.round(acc.reliabilityScore)}/100\n`;
            output += `   Signals: ${acc.totalSignals} | Bullish: ${bullishPct}% | Consistency: ${Math.round(acc.consistency * 100)}%\n`;
        });
        output += '\n';

        // Timing
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '⏰ BEST POSTING TIMES\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += 'Most Active Hours:\n';
        report.timing.peakHours.forEach(h => {
            output += `  ${h.hour}:00 UTC - ${h.signals} signals from ${h.accounts} accounts\n`;
        });
        output += '\n';

        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += 'End of Report\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        return output;
    }

    static formatTokenAnalysis(symbol, signals) {
        if (signals.length === 0) {
            return `No signals found for $${symbol}`;
        }

        const bullish = signals.filter(s => s.sentiment === 'bullish').length;
        const bearish = signals.filter(s => s.sentiment === 'bearish').length;
        const buySignals = signals.filter(s => s.signal_type === 'BUY').length;
        const sellSignals = signals.filter(s => s.signal_type === 'SELL').length;

        let output = '\n';
        output += `╔═══════════════════════════════════════════════════════════════╗\n`;
        output += `║                    $${symbol.padEnd(10)} ANALYSIS                      ║\n`;
        output += `╚═══════════════════════════════════════════════════════════════╝\n\n`;
        
        output += `Total Signals: ${signals.length}\n`;
        output += `Bullish: ${bullish} | Bearish: ${bearish} | Neutral: ${signals.length - bullish - bearish}\n`;
        output += `Buy: ${buySignals} | Sell: ${sellSignals} | Hold: ${signals.filter(s => s.signal_type === 'HOLD').length}\n\n`;

        output += 'Recent Signals:\n';
        output += '─'.repeat(60) + '\n';
        
        signals.slice(0, 10).forEach(s => {
            const emoji = s.signal_type === 'BUY' ? '🟢' : s.signal_type === 'SELL' ? '🔴' : '⚪';
            output += `${emoji} @${s.author_username.padEnd(15)} ${s.signal_type || 'MENTION'} ${s.sentiment.padEnd(10)}\n`;
            output += `   ${s.content.substring(0, 80)}...\n`;
            if (s.price_target_low || s.stop_loss) {
                output += `   Target: $${s.price_target_low || '?'} | SL: $${s.stop_loss || '?'}\n`;
            }
            output += '\n';
        });

        return output;
    }
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    const reportMode = args.includes('--report') || args.includes('-r');
    const tokenArg = args.find((arg, i) => args[i - 1] === '--token' || args[i - 1] === '-t');
    const hoursArg = args.find((arg, i) => args[i - 1] === '--hours' || args[i - 1] === '-h');
    
    const hours = parseInt(hoursArg) || CONFIG.defaultTimeframe;

    logger.info('Twitter/X Trading Signal Analyzer');
    logger.info('=================================\n');

    const db = new Database(CONFIG.databasePath);
    const analyzer = new SignalAnalyzer(db);

    try {
        if (tokenArg) {
            // Analyze specific token
            logger.info(`Analyzing token: $${tokenArg}`);
            const signals = await db.getSignalsByToken(tokenArg, hours);
            console.log(ReportFormatter.formatTokenAnalysis(tokenArg, signals));
        } else if (reportMode) {
            // Generate full report
            const report = await analyzer.generateFullReport(hours);
            console.log(ReportFormatter.format(report));
        } else {
            // Default: show summary
            const [sentiment, hotTokens] = await Promise.all([
                analyzer.generateMarketSentiment(hours),
                analyzer.identifyHotTokens(hours)
            ]);

            console.log('\n📊 MARKET SENTIMENT:', sentiment.sentiment.toUpperCase());
            console.log('   ', sentiment.reason);
            console.log('\n🔥 HOT TOKENS:');
            hotTokens.slice(0, 5).forEach((t, i) => {
                console.log(`   ${i + 1}. $${t.symbol} - ${t.mentions} mentions, ${t.sentiment}`);
            });
            console.log('\n💡 Use --report for full analysis, --token <SYMBOL> for token details');
        }

    } catch (error) {
        logger.error(`Error: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

// Export for use as module
module.exports = {
    Database,
    SignalAnalyzer,
    ReportFormatter,
    CONFIG
};
