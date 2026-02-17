// Ultra-Fast Scalper - 1-2 minute trades
// Target: 5%+ in 60-120 seconds
// 2026-02-11 16:21 WIB

const https = require('https');

const CONFIG = {
    TARGET_PROFIT: 5,       // 5% target (faster exit)
    STOP_LOSS: 3,           // 3% stop
    TIMEFRAME: '1-2min',
    MIN_LIQUIDITY: 8000,    // Lower for speed
    MIN_VOLUME: 20000,
    POSITION_SIZE: 0.008,   // Smaller position for speed
    MIN_SCORE: 5,           // Lower threshold for flat market
    TRADES_TARGET: 2
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

function scoreUltraFast(pair) {
    const m5 = parseFloat(pair.priceChange?.m5 || 0);
    const h1 = parseFloat(pair.priceChange?.h1 || 0);
    const h24 = parseFloat(pair.priceChange?.h24 || 0);
    
    const liq = parseFloat(pair.liquidity?.usd || 0);
    const vol = parseFloat(pair.volume?.h24 || 0);
    const volH1 = parseFloat(pair.volume?.h1 || 0);
    
    const buys = pair.txns?.m5?.buys || pair.txns?.h1?.buys || 0;
    const sells = pair.txns?.m5?.sells || pair.txns?.h1?.sells || 0;
    const buyPressure = buys / (buys + sells + 1);
    
    let score = 0;
    let signals = [];
    
    // Ultra-short momentum (most critical)
    if (m5 > 3) {
        score += 3;
        signals.push(`🔥 5m: +${m5.toFixed(1)}%`);
    } else if (m5 > 1) {
        score += 2;
        signals.push(`5m: +${m5.toFixed(1)}%`);
    } else if (m5 > 0) {
        score += 1;
        signals.push(`5m: +${m5.toFixed(1)}%`);
    }
    
    // Recent trend
    if (h1 > 3) {
        score += 2;
        signals.push(`1h: +${h1.toFixed(1)}%`);
    } else if (h1 > 0) {
        score += 1;
    }
    
    // Buy pressure (critical for fast exit)
    if (buyPressure > 0.60) {
        score += 2;
        signals.push(`Buy: ${(buyPressure * 100).toFixed(0)}%`);
    } else if (buyPressure > 0.50) {
        score += 1;
    }
    
    // Liquidity for quick entry/exit
    if (liq > 15000) {
        score += 1;
        signals.push('Liq OK');
    } else if (liq >= CONFIG.MIN_LIQUIDITY) {
        score += 0.5;
    }
    
    // Volume check
    if (volH1 > vol / 12) { // H1 vol > average
        score += 1;
        signals.push('Vol spike');
    }
    
    // Avoid tops
    if (h24 > 100) {
        score -= 2;
        signals.push('⚠️ Pumped');
    }
    
    return {
        score: Math.round(score * 10) / 10,
        signals,
        buyPressure,
        momentum: { m5, h1, h24 }
    };
}

async function findUltraFastSetups() {
    console.log('⚡ ULTRA-FAST SCALPER - 1-2 MINUTE TRADES');
    console.log('🎯 Target: 5%+ in 60-120 seconds');
    console.log('📊 Looking for 2 trades...\n');
    
    const data = await apiRequest('https://api.dexscreener.com/latest/dex/search?q=solana');
    
    const candidates = data.pairs
        .filter(p => {
            const liq = parseFloat(p.liquidity?.usd || 0);
            const vol = parseFloat(p.volume?.h24 || 0);
            return liq >= CONFIG.MIN_LIQUIDITY && vol >= CONFIG.MIN_VOLUME;
        })
        .slice(0, 30); // Scan more for speed
    
    console.log(`Scanning ${candidates.length} candidates...\n`);
    
    const scored = [];
    
    for (const pair of candidates) {
        const analysis = scoreUltraFast(pair);
        
        if (analysis.score >= CONFIG.MIN_SCORE) {
            scored.push({ pair, analysis });
        }
    }
    
    // Sort by score
    scored.sort((a, b) => b.analysis.score - a.analysis.score);
    
    console.log(`Found ${scored.length} candidates ≥${CONFIG.MIN_SCORE}/10\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const topPicks = scored.slice(0, CONFIG.TRADES_TARGET);
    
    topPicks.forEach((pick, i) => {
        const { pair, analysis } = pick;
        console.log(`${i + 1}. ${pair.baseToken.symbol.padEnd(10)} Score: ${analysis.score}/10`);
        console.log(`   CA: ${pair.baseToken.address.substring(0, 12)}...`);
        console.log(`   Price: $${pair.priceUsd}`);
        console.log(`   Liq: $${(pair.liquidity?.usd || 0).toLocaleString()}`);
        console.log(`   Signals: ${analysis.signals.join(' • ')}`);
        console.log(`   Entry: $${pair.priceUsd}`);
        console.log(`   Target: $${(parseFloat(pair.priceUsd) * 1.05).toFixed(8)} (+5%)`);
        console.log(`   Stop: $${(parseFloat(pair.priceUsd) * 0.97).toFixed(8)} (-3%)`);
        console.log(`   🔗 ${pair.url}`);
        console.log();
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (topPicks.length > 0) {
        console.log(`✅ Found ${topPicks.length} trade(s) ready to execute!`);
        return topPicks;
    } else {
        console.log('❌ No candidates met criteria (min score: 5/10)');
        return [];
    }
}

async function sendAlert(picks) {
    if (picks.length === 0) return;
    
    const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
    const CHAT_ID = '-1003212463774';
    const TOPIC = '24';
    
    for (let i = 0; i < picks.length; i++) {
        const { pair, analysis } = picks[i];
        
        const message = `⚡ ULTRA-FAST SCALP #${i + 1}

**${pair.baseToken.symbol}**
CA: \`${pair.baseToken.address}\`

🎯 **Score: ${analysis.score}/10**
⏱️ **Timeframe: 1-2 minutes**

**Setup:**
• Entry: $${pair.priceUsd}
• Target: +5% ($${(parseFloat(pair.priceUsd) * 1.05).toFixed(8)})
• Stop: -3% ($${(parseFloat(pair.priceUsd) * 0.97).toFixed(8)})
• Position: ${CONFIG.POSITION_SIZE} SOL

**Signals:**
${analysis.signals.map(s => `• ${s}`).join('\n')}

**Market:**
• Liquidity: $${(pair.liquidity?.usd || 0).toLocaleString()}
• Volume 24h: $${(pair.volume?.h24 || 0).toLocaleString()}
• Buy Pressure: ${(analysis.buyPressure * 100).toFixed(0)}%

🔗 ${pair.url}

⚠️ Quick in/out - monitor closely!`;
        
        try {
            await apiRequest(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&message_thread_id=${TOPIC}&text=${encodeURIComponent(message)}&parse_mode=Markdown`);
            console.log(`✅ Alert #${i + 1} sent!`);
        } catch (e) {
            console.error(`❌ Alert #${i + 1} failed:`, e.message);
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function main() {
    const picks = await findUltraFastSetups();
    
    if (picks.length > 0) {
        console.log('\n📤 Sending alerts to Telegram...\n');
        await sendAlert(picks);
        console.log('\n✅ All alerts sent! Monitor Topic #24');
    }
}

main().catch(console.error);
