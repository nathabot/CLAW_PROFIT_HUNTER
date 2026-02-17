#!/usr/bin/env node
/**
 * Initialize database schema
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = '/root/trading-bot/database/twitter_signals.db';

const TABLES = [
    `CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id TEXT UNIQUE NOT NULL,
        author_username TEXT NOT NULL,
        author_display_name TEXT,
        content TEXT NOT NULL,
        posted_at DATETIME NOT NULL,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        url TEXT,
        likes INTEGER DEFAULT 0,
        retweets INTEGER DEFAULT 0,
        replies INTEGER DEFAULT 0,
        is_reply BOOLEAN DEFAULT 0,
        is_retweet BOOLEAN DEFAULT 0,
        raw_json TEXT
    )`,
    
    `CREATE TABLE IF NOT EXISTS trading_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id INTEGER NOT NULL,
        token_symbol TEXT,
        contract_address TEXT,
        signal_type TEXT,
        sentiment TEXT,
        price_target_low REAL,
        price_target_high REAL,
        stop_loss REAL,
        entry_price REAL,
        confidence_score REAL,
        extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tweet_id) REFERENCES tweets(id) ON DELETE CASCADE
    )`,
    
    `CREATE TABLE IF NOT EXISTS token_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tweet_id INTEGER NOT NULL,
        token_symbol TEXT,
        contract_address TEXT,
        blockchain TEXT,
        mention_type TEXT,
        FOREIGN KEY (tweet_id) REFERENCES tweets(id) ON DELETE CASCADE
    )`,
    
    `CREATE TABLE IF NOT EXISTS monitored_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        account_type TEXT,
        followers_count INTEGER,
        following_count INTEGER,
        tweet_count INTEGER,
        listed_count INTEGER,
        created_at DATETIME,
        last_scraped_at DATETIME,
        scrape_frequency_minutes INTEGER DEFAULT 30,
        is_active BOOLEAN DEFAULT 1,
        priority INTEGER DEFAULT 5,
        accuracy_score REAL,
        notes TEXT
    )`,
    
    `CREATE TABLE IF NOT EXISTS scraper_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        accounts_scraped INTEGER DEFAULT 0,
        tweets_found INTEGER DEFAULT 0,
        signals_extracted INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0,
        nitter_instance TEXT,
        status TEXT,
        error_message TEXT
    )`,
    
    `CREATE TABLE IF NOT EXISTS signal_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id INTEGER NOT NULL,
        token_symbol TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        entry_price REAL,
        target_price REAL,
        stop_loss REAL,
        outcome TEXT,
        outcome_price REAL,
        outcome_at DATETIME,
        pnl_percent REAL,
        time_to_outcome_hours REAL,
        FOREIGN KEY (signal_id) REFERENCES trading_signals(id) ON DELETE CASCADE
    )`
];

const INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_tweets_author ON tweets(author_username)',
    'CREATE INDEX IF NOT EXISTS idx_tweets_posted_at ON tweets(posted_at)',
    'CREATE INDEX IF NOT EXISTS idx_signals_token ON trading_signals(token_symbol)',
    'CREATE INDEX IF NOT EXISTS idx_signals_type ON trading_signals(signal_type)',
    'CREATE INDEX IF NOT EXISTS idx_signals_sentiment ON trading_signals(sentiment)',
    'CREATE INDEX IF NOT EXISTS idx_mentions_token ON token_mentions(token_symbol)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_username ON monitored_accounts(username)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_type ON monitored_accounts(account_type)'
];

const ACCOUNTS = [
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('lookonchain', 'Lookonchain', 'smart_money', 10, 'Smart money tracking, whale movements')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('whale_alert', 'Whale Alert', 'whale_alert', 10, 'Large crypto transactions')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('DeFiMinty', 'DeFi Minty', 'alpha_caller', 9, 'Alpha calls and early gems')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('CryptoCapo_', 'Crypto Capo', 'technical_analyst', 8, 'Technical analysis and market calls')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('CryptoMichNL', 'Michaël van de Poppe', 'market_analyst', 8, 'Market analysis and trends')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('AltcoinGordon', 'Altcoin Gordon', 'momentum_trader', 7, 'Momentum plays and alerts')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('thewolfofbsc', 'Wolf of BSC', 'memecoin_scanner', 8, 'BSC memecoin scanner')",
    "INSERT OR IGNORE INTO monitored_accounts (username, display_name, account_type, priority, notes) VALUES ('solanabotsnipers', 'Solana Bot Snipers', 'memecoin_scanner', 8, 'Solana token snipers and calls')"
];

async function init() {
    console.log('🔧 Initializing database...\n');
    
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const db = new sqlite3.Database(DB_PATH);
    
    const run = (sql) => new Promise((resolve, reject) => {
        db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    
    try {
        for (const table of TABLES) {
            await run(table);
        }
        console.log(`✅ Created ${TABLES.length} tables`);
        
        for (const index of INDEXES) {
            await run(index);
        }
        console.log(`✅ Created ${INDEXES.length} indexes`);
        
        for (const account of ACCOUNTS) {
            await run(account);
        }
        console.log(`✅ Inserted ${ACCOUNTS.length} monitored accounts`);
        
        console.log('\n✅ Database initialized successfully!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        db.close();
    }
}

init();
