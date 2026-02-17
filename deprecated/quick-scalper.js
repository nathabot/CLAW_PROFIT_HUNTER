// Quick Scalper - 5-10 minute trades, 10%+ target
// 2026-02-11 16:10 WIB

const https = require('https');

const CONFIG = {
    TARGET_PROFIT: 10,      // 10% minimum
    TIMEFRAME: '5m',        // 5-10 minutes
    MIN_LIQUIDITY: 10000,   // Lower for scalping
    MIN_VOLUME: 30000,
    MIN_MOMENTUM: 5,        // 5% momentum in last hour
    POSITION_SIZE: 0.01,
    SCAN_TOP: 20
};

function apiRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function analyzeScalpSetup(pair) {
    const h1 = parseFloat(pair.priceChange?.h1 || 0);
    const h6 = parseFloat(pair.priceChange?.h6 || 0);
    const h24 = parseFloat(pair.priceChange?.h24 || 0);
    const m5 = parseFloat(pair.priceChange?.m5 || 0);
    
    const liq = parseFloat(pair.liquidity?.usd || 0);
    const vol = parseFloat(pair.volume?.h24 || 0);
    const volH6 = parseFloat(pair.volume?.h6 || 0);
    
    const buys = pair.txns?.h1?.buys || 0;
    const sells = pair.txns?.h1?.sells || 0;
    const buyPressure = buys / (buys + sells + 1);
    
    // Scalping criteria
    let score = 0;
    let reasons = [];
    
    // Strong recent momentum (most important for scalp)
    if (m5 > 5) {
        score += 4;
        reasons.push(`5m: +${m5.toFixed(1)}% (strong)`);
    } else if (m5 > 2) {
        score += 2;
        reasons.push(`5m: +${m5.toFixed(1)}%`);
    }
    
    if (h1 > 10) {
        score += 3;
        reasons.push(`1h: +${h1.toFixed(1)}% (momentum)`);
    } else if (h1 > 5) {
        score += 2;
        reasons.push(`1h: +${h1.toFixed(1)}%`);
    }
    
    // Volume acceleration
    const volRatio = volH6 / (vol / 4 + 1);
    if (volRatio > 1.5) {
        score += 2;
        reasons.push('Volume accelerating');
    }
    
    // Buy pressure
    if (buyPressure > 0.65) {
        score += 2;
        reasons.push(`Buy pressure: ${(buyPressure * 100).toFixed(0)}%`);
    }
    
    // Liquidity adequate for entry/exit
    if (liq > 20000) {
        score += 1;
        reasons.push('Good liquidity');
    }
    
    // Check if already pumped too much (avoid tops)
    if (h6 > 50 || h24 > 100) {
        score -= 3;
        reasons.push('⚠️ Already pumped hard (risk)');
    }
    
    return { 
        score, 
        reasons,
        momentum: { m5, h1, h6, h24 },
        buyPressure,
        volumeAccel: volRatio
    };
}

async function scanForScalp() {
    console.log('🔥 QUICK SCALPER - Hunting 10%+ in 5-10 minutes\n');
    console.log('📊 Scanning top 20 trending tokens...\n');
    
    const data = await apiRequest('https://api.dexscreener.com/latest/dex/search?q=solana');
    
    const candidates = data.pairs
        .filter(p => {
            const liq = parseFloat(p.liquidity?.usd || 0);
            const vol = parseFloat(p.volume?.h24 || 0);
            const h1 = parseFloat(p.priceChange?.h1 || 0);
            return liq > CONFIG.MIN_LIQUIDITY && 
                   vol > CONFIG.MIN_VOLUME && 
                   h1 > 0;
        })
        .slice(0, CONFIG.SCAN_TOP);
    
    console.log(`Found ${candidates.length} candidates with positive momentum\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    let bestCandidate = null;
    let bestScore = 0;
    
    for (const pair of candidates) {
        const symbol = pair.baseToken.symbol;
        const token = pair.baseToken.address;
        
        const analysis = analyzeScalpSetup(pair);
        
        console.log(`${symbol.padEnd(12)} Score: ${analysis.score}/10`);
        console.log(`   CA: ${token.substring(0, 8)}...`);
        console.log(`   Price: $${pair.priceUsd}`);
        console.log(`   Liq: $${(pair.liquidity?.usd || 0).toLocaleString()}`);
        console.log(`   Vol: $${(pair.volume?.h24 || 0).toLocaleString()}`);
        console.log(`   Changes: 5m: ${analysis.momentum.m5.toFixed(1)}% | 1h: ${analysis.momentum.h1.toFixed(1)}% | 24h: ${analysis.momentum.h24.toFixed(1)}%`);
        console.log(`   Buy Pressure: ${(analysis.buyPressure * 100).toFixed(0)}%`);
        console.log(`   Reasons: ${analysis.reasons.join(', ')}`);
        console.log();
        
        if (analysis.score > bestScore) {
            bestScore = analysis.score;
            bestCandidate = { pair, analysis };
        }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (bestCandidate && bestScore >= 7) {
        const { pair, analysis } = bestCandidate;
        console.log(`\n🎯 BEST CANDIDATE: ${pair.baseToken.symbol}`);
        console.log(`   Score: ${bestScore}/10`);
        console.log(`   Entry: $${pair.priceUsd}`);
        console.log(`   Target: $${(parseFloat(pair.priceUsd) * 1.10).toFixed(8)} (+10%)`);
        console.log(`   Stop: $${(parseFloat(pair.priceUsd) * 0.95).toFixed(8)} (-5%)`);
        console.log(`\n✅ READY TO EXECUTE!`);
        console.log(`   Position: ${CONFIG.POSITION_SIZE} SOL`);
        console.log(`   Expected hold: 5-10 minutes`);
        console.log(`\n🔗 ${pair.url}`);
        
        return bestCandidate;
    } else {
        console.log(`\n❌ No strong scalp setup found (best score: ${bestScore}/10)`);
        console.log(`   Need: 7+/10 for execution`);
        console.log(`   Waiting for better momentum...\n`);
        return null;
    }
}

async function sendTelegramAlert(candidate) {
    const { pair, analysis } = candidate;
    const score = analysis.score;
    
    const message = `⚡ QUICK SCALP OPPORTUNITY!

**${pair.baseToken.symbol}** (${pair.baseToken.address.substring(0, 8)}...)

🎯 **Score: ${score}/10** - SCALP MODE

**Setup:**
• Entry: $${pair.priceUsd}
• Target: +10% ($${(parseFloat(pair.priceUsd) * 1.10).toFixed(8)})
• Stop: -5% ($${(parseFloat(pair.priceUsd) * 0.95).toFixed(8)})
• Timeframe: 5-10 minutes

**Momentum:**
• 5m: ${analysis.momentum.m5 > 0 ? '+' : ''}${analysis.momentum.m5.toFixed(1)}%
• 1h: ${analysis.momentum.h1 > 0 ? '+' : ''}${analysis.momentum.h1.toFixed(1)}%
• 24h: ${analysis.momentum.h24 > 0 ? '+' : ''}${analysis.momentum.h24.toFixed(1)}%
• Buy Pressure: ${(analysis.buyPressure * 100).toFixed(0)}%

**Market:**
• Liquidity: $${(pair.liquidity?.usd || 0).toLocaleString()}
• Volume 24h: $${(pair.volume?.h24 || 0).toLocaleString()}

**Why:** ${analysis.reasons.join(' • ')}

🔗 ${pair.url}

⚠️ Quick scalp - monitor closely!`;
    
    try {
        const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
        const CHAT_ID = '-1003212463774';
        const TOPIC = '24'; // Active Positions
        
        await apiRequest(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&message_thread_id=${TOPIC}&text=${encodeURIComponent(message)}&parse_mode=Markdown`);
        console.log(`\n✅ Alert sent to Telegram!`);
    } catch (e) {
        console.error('Telegram error:', e.message);
    }
}

async function main() {
    const candidate = await scanForScalp();
    
    if (candidate) {
        await sendTelegramAlert(candidate);
    }
}

main().catch(console.error);
