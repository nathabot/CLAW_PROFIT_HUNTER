#!/usr/bin/env node
/**
 * Twitter/X Trading Signal Scraper
 * Uses Nitter instances to scrape tweets from crypto trading accounts
 * 
 * Usage: node twitter-scraper.js [--account <username>] [--limit <n>] [--dry-run]
 */

const https = require('https');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const xml2js = require('xml2js');

// Configuration
const CONFIG = {
    databasePath: '/root/trading-bot/database/twitter_signals.db',
    nitterInstances: [
        'nitter.net',
        'nitter.privacydev.net',
        'nitter.projectsegfault.com',
        'nitter.pufiki.com',
        'nitter.nicfab.eu',
        'nitter.datura.network',
        'nitter.perennialte.ch'
    ],
    requestTimeout: 30000,
    rateLimitDelay: 5000, // 5 seconds between requests
    maxRetries: 3,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Regex patterns for extracting trading signals
const PATTERNS = {
    // Token symbols: $BTC, $ETH, $SOL, etc.
    tokenSymbol: /\$[A-Za-z]{2,10}\b/g,
    
    // Contract addresses (Solana, Ethereum, BSC)
    contractAddress: /[A-HJ-NP-Za-km-z1-9]{32,44}/g,
    
    // Price targets: "Target: $1.50", "TP: $2", "target 0.005"
    priceTarget: /(?:target|tp|take profit)[:\s]*\$?(\d+\.?\d*)[\skm]?/gi,
    
    // Stop loss: "SL: $1.20", "stop loss 0.5"
    stopLoss: /(?:sl|stop loss|stop-loss)[:\s]*\$?(\d+\.?\d*)/gi,
    
    // Entry price: "Entry: $1.00", "buy at 0.5"
    entryPrice: /(?:entry|buy at|enter at)[:\s]*\$?(\d+\.?\d*)/gi,
    
    // Signal keywords
    buySignals: /\b(buy|long|accumulate|add|entry|gem|moon|pump|breakout|rally|bullish|rocket)\b/gi,
    sellSignals: /\b(sell|short|exit|dump|dumping|crash|bearish|correction|reduce|cut loss)\b/gi,
    holdSignals: /\b(hold|hodl|holding|wait|patience|consolidate)\b/gi,
    
    // Sentiment indicators
    veryBullish: /\b(10x|100x|1000x|moon|gem|undervalued|huge|massive|explosive|breakout|parabolic)\b/gi,
    veryBearish: /\b(rug|rugpull|scam|dump|crash|exit|sell all|panic)\b/gi
};

// Logger utility
const logger = {
    info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
    success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
    warning: (msg) => console.log(`[${new Date().toISOString()}] ⚠️  ${msg}`),
    error: (msg) => console.log(`[${new Date().toISOString()}] ❌ ${msg}`),
    debug: (msg) => process.env.DEBUG && console.log(`[${new Date().toISOString()}] 🐛 ${msg}`)
};

// Rate limiter class
class RateLimiter {
    constructor(delayMs) {
        this.delayMs = delayMs;
        this.lastRequest = 0;
    }

    async wait() {
        const now = Date.now();
        const elapsed = now - this.lastRequest;
        if (elapsed < this.delayMs) {
            const waitTime = this.delayMs - elapsed;
            logger.debug(`Rate limiting: waiting ${waitTime}ms`);
            await sleep(waitTime);
        }
        this.lastRequest = Date.now();
    }
}

// Sleep utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// HTTP request with retry logic
async function fetchWithRetry(url, options = {}, retries = CONFIG.maxRetries) {
    const rateLimiter = new RateLimiter(CONFIG.rateLimitDelay);
    await rateLimiter.wait();

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await new Promise((resolve, reject) => {
                const client = url.startsWith('https:') ? https : http;
                const req = client.get(url, {
                    timeout: CONFIG.requestTimeout,
                    headers: {
                        'User-Agent': CONFIG.userAgent,
                        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        ...options.headers
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.on('error', reject);
            });

            if (response.statusCode === 200) {
                return response.data;
            } else if (response.statusCode === 429 || response.statusCode === 503) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.warning(`Rate limited (attempt ${attempt}/${retries}), waiting ${delay}ms...`);
                await sleep(delay);
            } else {
                throw new Error(`HTTP ${response.statusCode}`);
            }
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            logger.warning(`Request failed (attempt ${attempt}/${retries}): ${error.message}`);
            await sleep(Math.pow(2, attempt) * 1000);
        }
    }
    throw new Error('Max retries exceeded');
}

// Fetch RSS feed from Nitter
async function fetchNitterRSS(username, instance = null) {
    const instances = instance ? [instance] : CONFIG.nitterInstances;
    
    for (const nitterHost of instances) {
        try {
            const url = `https://${nitterHost}/${username}/rss`;
            logger.debug(`Trying ${nitterHost} for @${username}`);
            const data = await fetchWithRetry(url);
            logger.success(`Successfully fetched @${username} from ${nitterHost}`);
            return { data, instance: nitterHost };
        } catch (error) {
            logger.warning(`Failed to fetch from ${nitterHost}: ${error.message}`);
            continue;
        }
    }
    throw new Error(`All Nitter instances failed for @${username}`);
}

// Parse RSS feed XML
async function parseRSSFeed(xmlData) {
    // Check if data looks like HTML instead of XML
    if (xmlData.trim().startsWith('<!DOCTYPE html>') || xmlData.trim().startsWith('<html')) {
        throw new Error('Received HTML instead of RSS feed (instance may be blocked or rate limited)');
    }
    
    // Check if it looks like XML
    if (!xmlData.trim().startsWith('<?xml') && !xmlData.trim().startsWith('<rss')) {
        throw new Error('Invalid RSS feed format');
    }
    
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);
    
    if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
        return [];
    }

    const items = Array.isArray(result.rss.channel.item) 
        ? result.rss.channel.item 
        : [result.rss.channel.item];

    return items.map(item => ({
        title: item.title || '',
        description: item.description || '',
        link: item.link || '',
        pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        author: item.author || '',
        guid: item.guid ? (typeof item.guid === 'object' ? item.guid._ : item.guid) : ''
    }));
}

// Extract token symbols from text
function extractTokenSymbols(text) {
    const symbols = [];
    const matches = text.match(PATTERNS.tokenSymbol);
    if (matches) {
        matches.forEach(match => {
            const symbol = match.replace('$', '').toUpperCase();
            if (!symbols.find(s => s.symbol === symbol)) {
                symbols.push({ symbol, type: 'cashtag' });
            }
        });
    }
    return symbols;
}

// Extract contract addresses from text
function extractContractAddresses(text) {
    const addresses = [];
    const matches = text.match(PATTERNS.contractAddress);
    if (matches) {
        matches.forEach(addr => {
            // Filter out likely false positives (too short or common words)
            if (addr.length >= 32 && !addresses.includes(addr)) {
                addresses.push(addr);
            }
        });
    }
    return addresses;
}

// Detect signal type from text
function detectSignalType(text) {
    const lowerText = text.toLowerCase();
    
    const buyCount = (lowerText.match(PATTERNS.buySignals) || []).length;
    const sellCount = (lowerText.match(PATTERNS.sellSignals) || []).length;
    const holdCount = (lowerText.match(PATTERNS.holdSignals) || []).length;

    // Check for explicit keywords
    if (lowerText.includes('buy now') || lowerText.includes('entry here') || lowerText.includes('long here')) {
        return 'BUY';
    }
    if (lowerText.includes('sell now') || lowerText.includes('exit here') || lowerText.includes('short here')) {
        return 'SELL';
    }
    if (lowerText.includes('hold') || lowerText.includes('hodl')) {
        return 'HOLD';
    }
    if (lowerText.includes('accumulate')) {
        return 'ACCUMULATE';
    }
    if (lowerText.includes('reduce')) {
        return 'REDUCE';
    }

    // Count-based detection
    if (buyCount > sellCount && buyCount > holdCount) return 'BUY';
    if (sellCount > buyCount && sellCount > holdCount) return 'SELL';
    if (holdCount > buyCount && holdCount > sellCount) return 'HOLD';

    return null;
}

// Detect sentiment from text
function detectSentiment(text) {
    const lowerText = text.toLowerCase();
    
    const veryBullishCount = (lowerText.match(PATTERNS.veryBullish) || []).length;
    const veryBearishCount = (lowerText.match(PATTERNS.veryBearish) || []).length;
    const bullishCount = (lowerText.match(PATTERNS.buySignals) || []).length;
    const bearishCount = (lowerText.match(PATTERNS.sellSignals) || []).length;

    if (veryBullishCount > 0) return 'very_bullish';
    if (veryBearishCount > 0) return 'very_bearish';
    if (bullishCount > bearishCount) return 'bullish';
    if (bearishCount > bullishCount) return 'bearish';
    
    return 'neutral';
}

// Extract price targets from text
function extractPriceTargets(text) {
    const targets = [];
    let match;
    
    // Reset regex
    PATTERNS.priceTarget.lastIndex = 0;
    while ((match = PATTERNS.priceTarget.exec(text)) !== null) {
        const price = parseFloat(match[1]);
        if (!isNaN(price) && price > 0) {
            targets.push(price);
        }
    }
    
    return targets.sort((a, b) => a - b);
}

// Extract stop loss from text
function extractStopLoss(text) {
    let match;
    
    // Reset regex
    PATTERNS.stopLoss.lastIndex = 0;
    while ((match = PATTERNS.stopLoss.exec(text)) !== null) {
        const price = parseFloat(match[1]);
        if (!isNaN(price) && price > 0) {
            return price;
        }
    }
    
    return null;
}

// Extract entry price from text
function extractEntryPrice(text) {
    let match;
    
    // Reset regex
    PATTERNS.entryPrice.lastIndex = 0;
    while ((match = PATTERNS.entryPrice.exec(text)) !== null) {
        const price = parseFloat(match[1]);
        if (!isNaN(price) && price > 0) {
            return price;
        }
    }
    
    return null;
}

// Calculate confidence score for a signal
function calculateConfidence(tweet, signal) {
    let score = 0.5; // Base score
    
    // Account reputation boost (would need historical data)
    if (tweet.retweets > 100) score += 0.1;
    if (tweet.retweets > 500) score += 0.1;
    
    // Signal specificity boost
    if (signal.price_target_low) score += 0.1;
    if (signal.stop_loss) score += 0.1;
    if (signal.entry_price) score += 0.1;
    
    // Token mention boost
    if (signal.token_symbol || signal.contract_address) score += 0.1;
    
    // Cap at 1.0
    return Math.min(score, 1.0);
}

// Clean tweet content (remove HTML entities)
function cleanContent(content) {
    return content
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Database class
class Database {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
        this.runAsync = promisify(this.db.run.bind(this.db));
        this.getAsync = promisify(this.db.get.bind(this.db));
        this.allAsync = promisify(this.db.all.bind(this.db));
    }

    async init() {
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            // Split by semicolons but be smarter about it
            const statements = schema
                .replace(/--.*$/gm, '') // Remove comments
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 10 && !s.match(/^\s*--/));
            
            for (const statement of statements) {
                try {
                    await this.runAsync(statement);
                } catch (err) {
                    // Ignore duplicate errors
                    if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
                        logger.debug(`Schema note: ${err.message}`);
                    }
                }
            }
        }
    }

    async insertTweet(tweet) {
        const sql = `
            INSERT OR IGNORE INTO tweets 
            (tweet_id, author_username, author_display_name, content, posted_at, url, likes, retweets, replies, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const result = await this.runAsync(sql, [
            tweet.id,
            tweet.author_username,
            tweet.author_display_name,
            tweet.content,
            tweet.posted_at,
            tweet.url,
            tweet.likes || 0,
            tweet.retweets || 0,
            tweet.replies || 0,
            JSON.stringify(tweet.raw)
        ]);
        
        return result;
    }

    async getTweetById(tweetId) {
        return await this.getAsync('SELECT * FROM tweets WHERE tweet_id = ?', [tweetId]);
    }

    async insertSignal(signal) {
        const sql = `
            INSERT INTO trading_signals 
            (tweet_id, token_symbol, contract_address, signal_type, sentiment, price_target_low, price_target_high, stop_loss, entry_price, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        return await this.runAsync(sql, [
            signal.tweet_id,
            signal.token_symbol,
            signal.contract_address,
            signal.signal_type,
            signal.sentiment,
            signal.price_target_low,
            signal.price_target_high,
            signal.stop_loss,
            signal.entry_price,
            signal.confidence_score
        ]);
    }

    async insertTokenMention(mention) {
        const sql = `
            INSERT INTO token_mentions (tweet_id, token_symbol, contract_address, blockchain, mention_type)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        return await this.runAsync(sql, [
            mention.tweet_id,
            mention.token_symbol,
            mention.contract_address,
            mention.blockchain,
            mention.mention_type
        ]);
    }

    async updateAccountLastScraped(username) {
        const sql = 'UPDATE monitored_accounts SET last_scraped_at = CURRENT_TIMESTAMP WHERE username = ?';
        await this.runAsync(sql, [username]);
    }

    async getActiveAccounts() {
        return await this.allAsync(
            'SELECT * FROM monitored_accounts WHERE is_active = 1 ORDER BY priority DESC'
        );
    }

    async logScraperRun(run) {
        const sql = `
            INSERT INTO scraper_runs (started_at, ended_at, accounts_scraped, tweets_found, signals_extracted, errors_count, nitter_instance, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return await this.runAsync(sql, [
            run.started_at,
            run.ended_at,
            run.accounts_scraped,
            run.tweets_found,
            run.signals_extracted,
            run.errors_count,
            run.nitter_instance,
            run.status,
            run.error_message
        ]);
    }

    close() {
        this.db.close();
    }
}

// Main scraper class
class TwitterScraper {
    constructor(db) {
        this.db = db;
        this.stats = {
            accountsScraped: 0,
            tweetsFound: 0,
            newTweets: 0,
            signalsExtracted: 0,
            errors: 0
        };
    }

    async scrapeAccount(username, limit = 20) {
        logger.info(`Scraping @${username}...`);
        
        try {
            const { data, instance } = await fetchNitterRSS(username);
            const tweets = await parseRSSFeed(data);
            
            this.stats.accountsScraped++;
            logger.info(`Found ${tweets.length} tweets from @${username}`);

            const processed = [];
            for (const tweet of tweets.slice(0, limit)) {
                try {
                    const result = await this.processTweet(tweet, username);
                    if (result.isNew) {
                        processed.push(result);
                    }
                } catch (err) {
                    logger.error(`Error processing tweet: ${err.message}`);
                    this.stats.errors++;
                }
            }

            await this.db.updateAccountLastScraped(username);
            return { processed, instance };

        } catch (error) {
            logger.error(`Failed to scrape @${username}: ${error.message}`);
            this.stats.errors++;
            return { processed: [], instance: null };
        }
    }

    async processTweet(tweet, username) {
        // Generate tweet ID from GUID or link
        const tweetId = tweet.guid || tweet.link.split('/').pop();
        
        // Check if already exists
        const existing = await this.db.getTweetById(tweetId);
        if (existing) {
            return { isNew: false, tweetId };
        }

        const content = cleanContent(tweet.description || tweet.title);
        
        // Create tweet object
        const tweetObj = {
            id: tweetId,
            author_username: username,
            author_display_name: tweet.author || username,
            content: content,
            posted_at: tweet.pubDate.toISOString(),
            url: tweet.link,
            likes: 0,
            retweets: 0,
            replies: 0,
            raw: tweet
        };

        // Insert tweet
        await this.db.insertTweet(tweetObj);
        this.stats.tweetsFound++;
        this.stats.newTweets++;

        // Get the inserted tweet's database ID
        const dbTweet = await this.db.getTweetById(tweetId);

        // Extract and store token mentions
        const symbols = extractTokenSymbols(content);
        for (const sym of symbols) {
            await this.db.insertTokenMention({
                tweet_id: dbTweet.id,
                token_symbol: sym.symbol,
                contract_address: null,
                blockchain: null,
                mention_type: sym.type
            });
        }

        const contracts = extractContractAddresses(content);
        for (const addr of contracts) {
            await this.db.insertTokenMention({
                tweet_id: dbTweet.id,
                token_symbol: null,
                contract_address: addr,
                blockchain: this.detectBlockchain(addr),
                mention_type: 'contract'
            });
        }

        // Extract trading signals
        const signalType = detectSignalType(content);
        const sentiment = detectSentiment(content);
        const priceTargets = extractPriceTargets(content);
        const stopLoss = extractStopLoss(content);
        const entryPrice = extractEntryPrice(content);

        // Only create signal if we have meaningful data
        if (signalType || symbols.length > 0 || contracts.length > 0) {
            const signal = {
                tweet_id: dbTweet.id,
                token_symbol: symbols[0]?.symbol || null,
                contract_address: contracts[0] || null,
                signal_type: signalType,
                sentiment: sentiment,
                price_target_low: priceTargets[0] || null,
                price_target_high: priceTargets[priceTargets.length - 1] || null,
                stop_loss: stopLoss,
                entry_price: entryPrice,
                confidence_score: 0.5
            };

            signal.confidence_score = calculateConfidence(tweetObj, signal);
            await this.db.insertSignal(signal);
            this.stats.signalsExtracted++;

            logger.success(`Signal extracted: ${signalType || 'MENTION'} ${symbols[0]?.symbol || ''} (${sentiment})`);
        }

        return { isNew: true, tweetId, content };
    }

    detectBlockchain(address) {
        if (address.length === 44) return 'solana';
        if (address.length === 42 && address.startsWith('0x')) return 'ethereum';
        if (address.length === 42 && address.startsWith('0x')) return 'bsc';
        return 'unknown';
    }

    async scrapeAll(limit = 20) {
        const accounts = await this.db.getActiveAccounts();
        logger.info(`Starting scrape of ${accounts.length} accounts`);

        const runStart = new Date().toISOString();
        let lastInstance = null;

        for (const account of accounts) {
            const result = await this.scrapeAccount(account.username, limit);
            if (result.instance) {
                lastInstance = result.instance;
            }
            // Add delay between accounts
            await sleep(CONFIG.rateLimitDelay);
        }

        // Log scraper run
        await this.db.logScraperRun({
            started_at: runStart,
            ended_at: new Date().toISOString(),
            accounts_scraped: this.stats.accountsScraped,
            tweets_found: this.stats.tweetsFound,
            signals_extracted: this.stats.signalsExtracted,
            errors_count: this.stats.errors,
            nitter_instance: lastInstance,
            status: this.stats.errors > 5 ? 'failed' : 'completed',
            error_message: this.stats.errors > 0 ? `${this.stats.errors} errors occurred` : null
        });

        return this.stats;
    }

    printStats() {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 SCRAPER STATISTICS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Accounts Scraped:     ${this.stats.accountsScraped}`);
        console.log(`Tweets Found:         ${this.stats.tweetsFound}`);
        console.log(`New Tweets:           ${this.stats.newTweets}`);
        console.log(`Signals Extracted:    ${this.stats.signalsExtracted}`);
        console.log(`Errors:               ${this.stats.errors}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    const accountArg = args.find((arg, i) => args[i - 1] === '--account') || args[args.indexOf('-a') + 1];
    const limitArg = args.find((arg, i) => args[i - 1] === '--limit') || args[args.indexOf('-l') + 1];
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    
    const limit = parseInt(limitArg) || 20;

    logger.info('Twitter/X Trading Signal Scraper');
    logger.info('================================\n');

    // Ensure database directory exists
    const dbDir = path.dirname(CONFIG.databasePath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = new Database(CONFIG.databasePath);
    await db.init();

    try {
        if (dryRun) {
            logger.info('DRY RUN MODE - No database writes');
        }

        const scraper = new TwitterScraper(db);

        if (accountArg) {
            // Scrape specific account
            await scraper.scrapeAccount(accountArg, limit);
        } else {
            // Scrape all accounts
            await scraper.scrapeAll(limit);
        }

        scraper.printStats();
        logger.success('Scraping completed!');

    } catch (error) {
        logger.error(`Fatal error: ${error.message}`);
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
    TwitterScraper,
    Database,
    CONFIG,
    PATTERNS,
    extractTokenSymbols,
    extractContractAddresses,
    detectSignalType,
    detectSentiment,
    extractPriceTargets,
    extractStopLoss,
    extractEntryPrice,
    cleanContent
};
