#!/usr/bin/env node
/**
 * Generate mock Twitter data for testing
 * Creates realistic trading signals in the database
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

const CONFIG = {
    databasePath: '/root/trading-bot/database/twitter_signals.db'
};

// Mock tweet templates
const MOCK_TEMPLATES = {
    lookonchain: [
        {
            content: "A smart money just bought $2.5M worth of $SOL at $98.50. Wallet: 7xKX...gAsU. Previous trades: +340% avg return. #smartmoney",
            sentiment: 'bullish',
            signal_type: 'BUY',
            target: 120,
            stop_loss: 88
        },
        {
            content: "🚨 Whale Alert: 15,000 $ETH ($36M) transferred from Binance to cold wallet. Bullish signal - reducing exchange supply.",
            sentiment: 'bullish',
            signal_type: 'BUY'
        },
        {
            content: "Smart money accumulating $BONK. 3 wallets bought $1.2M in last 24h. Entry: $0.000012 Target: $0.000018 🎯",
            sentiment: 'bullish',
            signal_type: 'BUY',
            target: 0.000018,
            entry: 0.000012
        },
        {
            content: "Whale sold 5,000 $BTC at $43,200. Moved to stablecoins. Caution signal - taking profits at resistance.",
            sentiment: 'bearish',
            signal_type: 'SELL'
        }
    ],
    whale_alert: [
        {
            content: "🐋 45,000,000 #USDT transferred from #Binance to unknown wallet. Large outflow - potential buying pressure.",
            sentiment: 'bullish'
        },
        {
            content: "🚨 12,500 $ETH ($30M) moved from cold wallet to #Coinbase. Watch for potential sell pressure.",
            sentiment: 'bearish',
            signal_type: 'SELL'
        },
        {
            content: "💎 100,000,000 $USDC minted at #Circle. Fresh stables entering the market. Bullish for alts.",
            sentiment: 'bullish'
        }
    ],
    DeFiMinty: [
        {
            content: "Found an early gem! $PEPE2 on Solana. Contract: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU. Just launched, under $100k MC. NFA DYOR 🚀",
            sentiment: 'very_bullish',
            signal_type: 'BUY',
            contract: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
        },
        {
            content: "$JUP looking primed for breakout. Chart is coiled. Entry $0.85 Target $1.20 SL $0.75. Volume coming in 👀",
            sentiment: 'bullish',
            signal_type: 'BUY',
            entry: 0.85,
            target: 1.20,
            stop_loss: 0.75
        },
        {
            content: "Taking profits on $WIF here. Up 45% from entry. Not bearish but locking in gains. Sell 50%, let rest ride.",
            sentiment: 'neutral',
            signal_type: 'REDUCE'
        }
    ],
    CryptoCapo_: [
        {
            content: "$BTC update: Broke above $44k resistance with volume. Targeting $48k next. Invalidation below $42k. #TA",
            sentiment: 'bullish',
            signal_type: 'BUY',
            target: 48000,
            stop_loss: 42000
        },
        {
            content: "Solana chart looking dangerous. $SOL losing $95 support. If we close below, targeting $88. Be cautious.",
            sentiment: 'bearish',
            signal_type: 'SELL'
        },
        {
            content: "Major altseason setup forming. $ETH breaking out vs BTC. Time for ETH ecosystem plays. Accumulate $ETH $ARB $OP.",
            sentiment: 'very_bullish',
            signal_type: 'ACCUMULATE'
        }
    ],
    CryptoMichNL: [
        {
            content: "Market structure remains bullish. Corrections are for buying. DCA into $BTC $ETH here. 6-figure BTC coming. 📈",
            sentiment: 'bullish',
            signal_type: 'ACCUMULATE'
        },
        {
            content: "Fear is high but smart money is buying. Don't sell your bags here. Hold tight. $SOL $AVAX $NEAR",
            sentiment: 'bullish',
            signal_type: 'HOLD'
        },
        {
            content: "Small caps getting destroyed. Risk-off mode until BTC finds support. Reduce alt exposure by 30-40%.",
            sentiment: 'bearish',
            signal_type: 'REDUCE'
        }
    ],
    AltcoinGordon: [
        {
            content: "$PEPE breaking out! 🐸 Volume exploding. Target 2x from here. Moon mission engaged! 🚀🚀🚀",
            sentiment: 'very_bullish',
            signal_type: 'BUY'
        },
        {
            content: "$DOGE pump incoming. Elon tweet vibes. Load up now or regret later. Target $0.15!",
            sentiment: 'very_bullish',
            signal_type: 'BUY',
            target: 0.15
        },
        {
            content: "Exit all memes. Market dumping hard. $PEPE $DOGE $SHIB all going to zero. Sell everything now!",
            sentiment: 'very_bearish',
            signal_type: 'SELL'
        }
    ],
    thewolfofbsc: [
        {
            content: "New BSC gem spotted! $MOONSHOT launched 2 hours ago. $50k MC, locked LP, based dev. 0x1234567890abcdef...DYOR NFA",
            sentiment: 'bullish',
            signal_type: 'BUY',
            contract: '0x1234567890abcdef1234567890abcdef12345678'
        },
        {
            content: "$CAKE printing. PancakeSwap volume up 200%. Target $3.50. Bullish on BSC ecosystem.",
            sentiment: 'bullish',
            signal_type: 'BUY',
            target: 3.50
        }
    ],
    solanabotsnipers: [
        {
            content: "🎯 SNIPER ALERT: $JUP massive volume spike detected. Bots accumulating. Target $1.50. Entry $0.95",
            sentiment: 'bullish',
            signal_type: 'BUY',
            entry: 0.95,
            target: 1.50
        },
        {
            content: "New Solana token launch: $RAYDIUM v2. Contract: RDMT...k9Lp. Early entry, high risk high reward.",
            sentiment: 'bullish',
            signal_type: 'BUY',
            contract: 'RDMTk9LpXXXk9LpXXXk9LpXXXk9LpXXXk9LpXXXk9Lp'
        }
    ]
};

// Database class
class Database {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
        this.runAsync = promisify(this.db.run.bind(this.db));
        this.getAsync = promisify(this.db.get.bind(this.db));
        this.allAsync = promisify(this.db.all.bind(this.db));
    }

    async init() {
        const fs = require('fs');
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            const statements = schema
                .replace(/--.*$/gm, '')
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 10);
            
            for (const statement of statements) {
                try {
                    await this.runAsync(statement);
                } catch (err) {
                    if (!err.message.includes('already exists')) {
                        // ignore
                    }
                }
            }
        }
    }

    async insertTweet(tweet) {
        const sql = `
            INSERT OR IGNORE INTO tweets 
            (tweet_id, author_username, author_display_name, content, posted_at, url, likes, retweets, replies)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        return await this.runAsync(sql, [
            tweet.id,
            tweet.author_username,
            tweet.author_display_name,
            tweet.content,
            tweet.posted_at,
            tweet.url,
            tweet.likes || 0,
            tweet.retweets || 0,
            tweet.replies || 0
        ]);
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

    close() {
        this.db.close();
    }
}

// Extract symbols from content
function extractSymbols(content) {
    const matches = content.match(/\$[A-Za-z]{2,10}\b/g);
    return matches ? [...new Set(matches.map(m => m.replace('$', '').toUpperCase()))] : [];
}

// Extract contract addresses
function extractContracts(content) {
    const patterns = [
        /[A-HJ-NP-Za-km-z1-9]{43,44}/g, // Solana
        /0x[a-fA-F0-9]{40}/g // Ethereum/BSC
    ];
    
    const contracts = [];
    for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) contracts.push(...matches);
    }
    return contracts;
}

function generateMockData() {
    const tweets = [];
    let tweetId = 1000000000000000000;
    
    for (const [username, templates] of Object.entries(MOCK_TEMPLATES)) {
        templates.forEach((template, index) => {
            const hoursAgo = Math.floor(Math.random() * 24);
            const minutesAgo = Math.floor(Math.random() * 60);
            const postedAt = new Date();
            postedAt.setHours(postedAt.getHours() - hoursAgo);
            postedAt.setMinutes(postedAt.getMinutes() - minutesAgo);
            
            const symbols = extractSymbols(template.content);
            const contracts = extractContracts(template.content);
            
            tweets.push({
                id: (tweetId++).toString(),
                author_username: username,
                author_display_name: username,
                content: template.content,
                posted_at: postedAt.toISOString(),
                url: `https://twitter.com/${username}/status/${tweetId}`,
                likes: Math.floor(Math.random() * 500) + 50,
                retweets: Math.floor(Math.random() * 200) + 10,
                replies: Math.floor(Math.random() * 100),
                symbols,
                contracts,
                signal_type: template.signal_type || null,
                sentiment: template.sentiment || 'neutral',
                target: template.target || null,
                stop_loss: template.stop_loss || null,
                entry: template.entry || null
            });
        });
    }
    
    return tweets;
}

async function main() {
    console.log('🎲 Generating mock Twitter trading data...\n');
    
    const db = new Database(CONFIG.databasePath);
    await db.init();
    
    const mockTweets = generateMockData();
    let inserted = 0;
    let signalsCreated = 0;
    
    for (const tweet of mockTweets) {
        try {
            await db.insertTweet(tweet);
            const dbTweet = await db.getTweetById(tweet.id);
            
            if (dbTweet) {
                // Insert token mentions
                for (const symbol of tweet.symbols) {
                    await db.insertTokenMention({
                        tweet_id: dbTweet.id,
                        token_symbol: symbol,
                        contract_address: null,
                        blockchain: null,
                        mention_type: 'cashtag'
                    });
                }
                
                for (const addr of tweet.contracts) {
                    const blockchain = addr.startsWith('0x') ? 'ethereum' : 'solana';
                    await db.insertTokenMention({
                        tweet_id: dbTweet.id,
                        token_symbol: null,
                        contract_address: addr,
                        blockchain: blockchain,
                        mention_type: 'contract'
                    });
                }
                
                // Insert trading signal if applicable
                if (tweet.signal_type || tweet.symbols.length > 0) {
                    await db.insertSignal({
                        tweet_id: dbTweet.id,
                        token_symbol: tweet.symbols[0] || null,
                        contract_address: tweet.contracts[0] || null,
                        signal_type: tweet.signal_type,
                        sentiment: tweet.sentiment,
                        price_target_low: tweet.target,
                        price_target_high: tweet.target ? tweet.target * 1.1 : null,
                        stop_loss: tweet.stop_loss,
                        entry_price: tweet.entry,
                        confidence_score: 0.6 + Math.random() * 0.3
                    });
                    signalsCreated++;
                }
                
                await db.updateAccountLastScraped(tweet.author_username);
                inserted++;
            }
        } catch (err) {
            console.error(`Error inserting tweet: ${err.message}`);
        }
    }
    
    console.log(`✅ Inserted ${inserted} mock tweets`);
    console.log(`✅ Created ${signalsCreated} trading signals`);
    console.log(`\nSample data ready! Run: npm run analyze`);
    
    db.close();
}

main().catch(console.error);
