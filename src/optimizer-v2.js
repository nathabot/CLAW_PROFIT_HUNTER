/**
 * Strategy Optimizer v2 - Parameter Simulation Engine
 * Simulates different TP/SL combinations to find optimal parameters
 * Usage: node src/optimizer-v2.js
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

/**
 * Simulate trade outcomes with given TP/SL parameters
 */
function simulateTrade(entryPrice, exitPrice, tp1Percent, tp2Percent, slPercent) {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    
    if (!entry || !exit || exit === 'MARKET') return null;
    
    const priceChange = ((exit - entry) / entry) * 100;
    
    // Calculate what would happen with given parameters
    let result = 'HOLDING';
    
    if (priceChange >= tp1Percent) {
        result = 'TP1_HIT';  // Would exit at TP1
    } else if (priceChange <= -slPercent) {
        result = 'STOP_LOSS'; // Would hit SL
    } else if (priceChange >= tp2Percent) {
        result = 'TP2_HIT';   // Would hit TP2
    } else if (priceChange >= tp1Percent / 2) {
        result = 'PARTIAL';   // Would partial exit
    } else {
        result = 'NO_HIT';    // Price never reached targets
    }
    
    return {
        entry,
        exit,
        priceChange,
        result,
        pnlPercent: priceChange
    };
}

/**
 * Run simulation with specific TP/SL parameters
 */
function runSimulation(positions, tp1, tp2, sl) {
    let wins = 0;
    let losses = 0;
    let tp1Hits = 0;
    let tp2Hits = 0;
    let slHits = 0;
    let noHits = 0;
    let totalPnl = 0;
    
    const results = [];
    
    positions.forEach(pos => {
        if (pos.exited && pos.exitPrice && pos.exitPrice !== 'MARKET') {
            const sim = simulateTrade(pos.entryPrice, pos.exitPrice, tp1 * 100, tp2 * 100, sl * 100);
            
            if (sim) {
                results.push(sim);
                
                if (sim.result === 'TP1_HIT' || sim.result === 'TP2_HIT') {
                    wins++;
                    tp1Hits++;
                } else if (sim.result === 'STOP_LOSS') {
                    losses++;
                    slHits++;
                } else if (sim.result === 'NO_HIT') {
                    // Check if price went negative
                    if (sim.pnlPercent < 0) {
                        losses++;
                        slHits++;
                    } else {
                        // Still in profit but didn't hit TP - treat as partial
                        wins++;
                        noHits++;
                    }
                }
                
                totalPnl += sim.pnlPercent;
            }
        }
    });
    
    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgPnl = total > 0 ? totalPnl / total : 0;
    
    return {
        tp1: tp1 * 100,
        tp2: tp2 * 100,
        sl: sl * 100,
        total,
        wins,
        losses,
        winRate: winRate.toFixed(1),
        avgPnl: avgPnl.toFixed(2),
        totalPnl: totalPnl.toFixed(2),
        tp1Hits,
        tp2Hits,
        slHits,
        noHits
    };
}

/**
 * Grid search over parameter space
 */
function gridSearch(positions) {
    console.log('\n🔍 Running Grid Search Simulation...\n');
    
    const tp1Range = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10];
    const tp2Range = [0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15];
    const slRange = [0.02, 0.03, 0.05, 0.08, 0.10, 0.15];
    
    const results = [];
    
    for (const tp1 of tp1Range) {
        for (const tp2 of tp2Range) {
            if (tp2 <= tp1) continue; // TP2 must be higher than TP1
            
            for (const sl of slRange) {
                const sim = runSimulation(positions, tp1, tp2, sl);
                if (sim.total > 0) {
                    results.push(sim);
                }
            }
        }
    }
    
    // Sort by win rate
    results.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
    
    return results;
}

/**
 * Find optimal parameters
 */
function findOptimal(positions) {
    console.log('📊 OPTIMIZER v2 - Parameter Simulation Engine');
    console.log('='.repeat(50));
    console.log(`Analyzing ${positions.length} historical trades...\n`);
    
    // Filter to only closed positions with valid exit prices
    // Exclude force-closed positions (network issues skew data)
    const closedPositions = positions.filter(p => 
        p.exited && 
        p.exitPrice && 
        p.exitPrice !== 'MARKET' &&
        !p.notes?.includes('Force closed') &&
        p.pnlPercent > -90  // Exclude -100% force closes
    );
    
    console.log(`Valid for simulation: ${closedPositions.length} trades\n`);
    
    if (closedPositions.length < 10) {
        console.log('⚠️  Low sample size - results may not be reliable');
    }
    
    // Run grid search
    const results = gridSearch(closedPositions);
    
    // Show top 10 results
    console.log('📈 TOP 10 PARAMETER COMBINATIONS');
    console.log('-'.repeat(60));
    console.log('TP1%  TP2%  SL%   | WR%   | Avg%  | Trades');
    console.log('-'.repeat(60));
    
    results.slice(0, 10).forEach((r, i) => {
        console.log(
            `${r.tp1.toFixed(0).padStart(3)}% ${r.tp2.toFixed(0).padStart(3)}% ` +
            `${(r.sl * 100).toFixed(0).padStart(3)}% | ` +
            `${r.winRate.padStart(4)}% | ${r.avgPnl.padStart(5)}% | ${r.total}`
        );
    });
    
    // Best result
    const best = results[0];
    
    console.log('\n' + '='.repeat(50));
    console.log('🏆 OPTIMAL PARAMETERS');
    console.log('='.repeat(50));
    console.log(`   TP1: +${best.tp1.toFixed(1)}%`);
    console.log(`   TP2: +${best.tp2.toFixed(1)}%`);
    console.log(`   SL:  -${(best.sl * 100).toFixed(1)}%`);
    console.log(`   Win Rate: ${best.winRate}%`);
    console.log(`   Avg P/L: ${best.avgPnl}%`);
    console.log(`   Sample Size: ${best.total} trades`);
    
    // Confidence level
    let confidence = 'LOW';
    if (best.total >= 30) confidence = 'HIGH';
    else if (best.total >= 15) confidence = 'MEDIUM';
    
    console.log(`   Confidence: ${confidence}`);
    
    // Compare with current settings
    console.log('\n📊 COMPARED TO CURRENT SETTINGS');
    console.log('-'.repeat(50));
    
    const current = runSimulation(closedPositions, 0.05, 0.08, 0.05); // Current: TP1 5%, TP2 8%, SL 5%
    const optimized = runSimulation(closedPositions, best.tp1/100, best.tp2/100, best.sl/100);
    
    console.log(`Current: TP1 +5%, TP2 +8%, SL -5%`);
    console.log(`   → WR: ${current.winRate}%, Avg: ${current.avgPnl}%`);
    console.log(`\nOptimized: TP1 +${best.tp1.toFixed(1)}%, TP2 +${best.tp2.toFixed(1)}%, SL -${(best.sl*100).toFixed(1)}%`);
    console.log(`   → WR: ${optimized.winRate}%, Avg: ${optimized.avgPnl}%`);
    
    const wrImprovement = parseFloat(optimized.winRate) - parseFloat(current.winRate);
    const avgImprovement = parseFloat(optimized.avgPnl) - parseFloat(current.avgPnl);
    
    console.log(`\n📈 IMPROVEMENT`);
    console.log(`   Win Rate: ${wrImprovement > 0 ? '+' : ''}${wrImprovement.toFixed(1)}%`);
    console.log(`   Avg P/L:  ${avgImprovement > 0 ? '+' : ''}${avgImprovement.toFixed(1)}%`);
    
    // Save results
    const output = {
        optimal: {
            tp1: best.tp1 / 100,
            tp2: best.tp2 / 100,
            sl: best.sl
        },
        current: {
            tp1: 0.05,
            tp2: 0.08,
            sl: 0.05
        },
        improvement: {
            winRate: wrImprovement.toFixed(1),
            avgPnl: avgImprovement.toFixed(1)
        },
        confidence,
        sampleSize: best.total,
        testedCombinations: results.length,
        timestamp: new Date().toISOString()
    };
    
    const outputFile = path.join(TRADING_BOT_DIR, 'optimizer-results.json');
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\n✅ Results saved to: ${outputFile}`);
    
    return output;
}

function main() {
    const positions = readJSON(POSITIONS_FILE, []);
    
    if (positions.length === 0) {
        console.log('No positions found!');
        return;
    }
    
    findOptimal(positions);
}

main();
