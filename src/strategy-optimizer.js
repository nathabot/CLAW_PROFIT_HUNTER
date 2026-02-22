/**
 * Strategy Optimizer - Analyzes trading history to find optimal parameters
 * Usage: node src/strategy-optimizer.js
 */

const fs = require('fs');
const path = require('path');

const TRADING_BOT_DIR = process.env.TRADING_BOT_DIR || '/root/trading-bot';
const POSITIONS_FILE = path.join(TRADING_BOT_DIR, 'positions.json');

function readJSON(file, fallback = null) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
    return fallback;
}

function analyzeStrategyPerformance(positions) {
    // Group by strategy
    const strategies = {};
    
    positions.forEach(pos => {
        const stratId = pos.strategyId || 'unknown';
        if (!strategies[stratId]) {
            strategies[stratId] = {
                name: pos.strategy || stratId,
                trades: [],
                wins: 0,
                losses: 0,
                totalPnl: 0
            };
        }
        
        const pnl = parseFloat(pos.pnlPercent) || 0;
        strategies[stratId].trades.push({
            symbol: pos.symbol,
            pnlPercent: pnl,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice,
            targets: pos.targets,
            strategy: pos.strategy
        });
        
        if (pnl > 0) strategies[stratId].wins++;
        else strategies[stratId].losses++;
        strategies[stratId].totalPnl += pnl;
    });
    
    // Calculate stats
    const results = Object.entries(strategies).map(([id, data]) => {
        const total = data.trades.length;
        return {
            strategyId: id,
            strategyName: data.name,
            totalTrades: total,
            winRate: total > 0 ? ((data.wins / total) * 100).toFixed(1) : 0,
            avgPnl: total > 0 ? (data.totalPnl / total).toFixed(2) : 0,
            totalPnl: data.totalPnl.toFixed(2)
        };
    });
    
    // Sort by win rate
    return results.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
}

function analyzeTP1Performance(positions) {
    // Analyze TP1 hit rate
    const tp1Trades = positions.filter(p => p.targets?.tp1 && p.exited);
    
    let tp1Hit = 0;
    let tp1NotHit = 0;
    let partialHit = 0;
    
    tp1Trades.forEach(pos => {
        const entry = parseFloat(pos.entryPrice);
        const tp1 = parseFloat(pos.targets.tp1);
        const exit = parseFloat(pos.exitPrice);
        
        if (exit === 'MARKET') {
            // Force closed - can't determine
            return;
        }
        
        if (exit >= tp1) {
            tp1Hit++;
        } else if (pos.partialExited) {
            partialHit++;
        } else {
            tp1NotHit++;
        }
    });
    
    const total = tp1Hit + tp1NotHit;
    return {
        tp1HitRate: total > 0 ? ((tp1Hit / total) * 100).toFixed(1) : 0,
        partialRate: total > 0 ? ((partialHit / total) * 100).toFixed(1) : 0,
        totalAnalyzed: total
    };
}

function analyzeStopLoss(positions) {
    const slTrades = positions.filter(p => p.exited && p.exitType === 'STOP_LOSS');
    
    let slCount = 0;
    let totalTrades = positions.filter(p => p.exited).length;
    
    slTrades.forEach(() => slCount++);
    
    return {
        slCount,
        slRate: totalTrades > 0 ? ((slCount / totalTrades) * 100).toFixed(1) : 0,
        totalTrades
    };
}

function findOptimalParameters(positions) {
    // Analyze winning trades to find optimal parameters
    const winners = positions.filter(p => parseFloat(p.pnlPercent) > 0);
    
    if (winners.length === 0) {
        return { message: 'No winning trades to analyze' };
    }
    
    // Calculate average TP/SL ratios from winners
    let tp1Ratios = [];
    let tp2Ratios = [];
    
    winners.forEach(pos => {
        const entry = parseFloat(pos.entryPrice);
        const sl = parseFloat(pos.targets?.sl);
        const tp1 = parseFloat(pos.targets?.tp1);
        const tp2 = parseFloat(pos.targets?.tp2);
        
        if (entry && sl && tp1) {
            tp1Ratios.push((tp1 - entry) / entry * 100); // % gain to TP1
        }
        if (entry && sl && tp2) {
            tp2Ratios.push((tp2 - entry) / entry * 100); // % gain to TP2
        }
    });
    
    const avgTP1 = tp1Ratios.length > 0 
        ? (tp1Ratios.reduce((a, b) => a + b, 0) / tp1Ratios.length).toFixed(1) 
        : 0;
    const avgTP2 = tp2Ratios.length > 0 
        ? (tp2Ratios.reduce((a, b) => a + b, 0) / tp2Ratios.length).toFixed(1) 
        : 0;
    
    return {
        avgTP1Percent: avgTP1,
        avgTP2Percent: avgTP2,
        sampleSize: winners.length
    };
}

function main() {
    console.log('📊 Strategy Optimizer - Analyzing Trading History\n');
    console.log('='.repeat(50));
    
    const positions = readJSON(POSITIONS_FILE, []);
    
    if (positions.length === 0) {
        console.log('No positions found!');
        return;
    }
    
    console.log(`Total trades: ${positions.length}\n`);
    
    // 1. Strategy Performance
    console.log('📈 STRATEGY PERFORMANCE (by Win Rate)');
    console.log('-'.repeat(50));
    const strategyResults = analyzeStrategyPerformance(positions);
    strategyResults.forEach((r, i) => {
        console.log(`${i + 1}. ${r.strategyName}`);
        console.log(`   WR: ${r.winRate}% | Avg P/L: ${r.avgPnl}% | Trades: ${r.totalTrades}`);
    });
    
    // 2. TP1 Analysis
    console.log('\n🎯 TP1 HIT RATE');
    console.log('-'.repeat(50));
    const tp1Stats = analyzeTP1Performance(positions);
    console.log(`TP1 Hit Rate: ${tp1Stats.tp1HitRate}%`);
    console.log(`Partial Exit Rate: ${tp1Stats.partialRate}%`);
    console.log(`Analyzed: ${tp1Stats.totalAnalyzed} trades`);
    
    // 3. Stop Loss Analysis
    console.log('\n🛡️ STOP LOSS ANALYSIS');
    console.log('-'.repeat(50));
    const slStats = analyzeStopLoss(positions);
    console.log(`SL Hit Rate: ${slStats.slRate}%`);
    console.log(`Total SL triggers: ${slStats.slCount} / ${slStats.totalTrades}`);
    
    // 4. Optimal Parameters
    console.log('\n⚡ OPTIMAL PARAMETERS (from winners)');
    console.log('-'.repeat(50));
    const optimal = findOptimalParameters(positions);
    if (optimal.message) {
        console.log(optimal.message);
    } else {
        console.log(`Average TP1: +${optimal.avgTP1Percent}%`);
        console.log(`Average TP2: +${optimal.avgTP2Percent}%`);
        console.log(`Based on: ${optimal.sampleSize} winning trades`);
    }
    
    // 5. Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    console.log('-'.repeat(50));
    const bestStrategy = strategyResults[0];
    if (bestStrategy && parseFloat(bestStrategy.winRate) > 50) {
        console.log(`→ Best performing: ${bestStrategy.strategyName} (${bestStrategy.winRate}% WR)`);
    }
    if (parseFloat(tp1Stats.tp1HitRate) > 50) {
        console.log(`→ TP1 is effective - ${tp1Stats.tp1HitRate}% hit rate`);
    }
    if (parseFloat(slStats.slRate) > 30) {
        console.log(`→ WARNING: High SL rate (${slStats.slRate}%) - consider widening SL`);
    }
    
    console.log('\n' + '='.repeat(50));
}

main();
