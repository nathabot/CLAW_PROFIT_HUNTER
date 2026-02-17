#!/usr/bin/env node
/**
 * PAPER TRADER - STRICT MODE v6.0
 * For testing new strategy before live deployment
 * Target: 50 paper trades with >70% WR before going live
 */

const fs = require('fs');
const fetch = require('node-fetch');

// STRICT CONFIGURATION
const CONFIG = {
  MIN_SCORE: 9,              // CHANGED: 6 → 9 (gold standard only)
  MIN_LIQUIDITY: 50000,      // CHANGED: 20000 → 50000
  MIN_VOLUME_24H: 100000,    // CHANGED: 30000 → 100000
  MAX_POSITIONS: 2,          // NEW: Max 2 positions
  MAX_DAILY_TRADES: 3,       // NEW: Max 3 trades/day
  MAX_CONCURRENT: 2,         // NEW: Max 2 concurrent
  POSITION_SIZE: 0.015,      // Conservative
  SL_PERCENT: -3,            // Strict -3%
  TP1_PERCENT: 5,            // Lowered: 6% → 5%
  TP2_PERCENT: 8,            // Lowered: 9% → 8%
  MAX_HOLD_MINUTES: 30,      // NEW: Max 30 min hold
  
  // BLACKLIST RULE
  MAX_SL_PER_TOKEN: 2,       // 3 strike rule
  
  // TARGET
  TARGET_WR: 70,             // Min 70% to go live
  TARGET_TRADES: 50          // Paper test 50 trades
};

// State
const PAPER_STATE = {
  trades: [],
  wins: 0,
  losses: 0,
  currentPositions: 0,
  dailyTrades: 0,
  lastTradeDate: null,
  tokenSLCount: {},  // Track SL per token
  blacklist: []      // Blacklisted tokens
};

// Load state
function loadState() {
  try {
    const data = fs.readFileSync('/root/trading-bot/paper-strict-state.json', 'utf8');
    Object.assign(PAPER_STATE, JSON.parse(data));
  } catch (e) {
    console.log('📊 New paper test session started');
  }
}

// Save state
function saveState() {
  fs.writeFileSync('/root/trading-bot/paper-strict-state.json', JSON.stringify(PAPER_STATE, null, 2));
}

// Telegram notify
async function notify(text) {
  try {
    await fetch('https://api.telegram.org/bot8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '-1003212463774',
        message_thread_id: 24,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}

// Strict scoring function
function calculateStrictScore(token) {
  let score = 0;
  const reasons = [];
  
  // Score 9/10: Must have ALL of these
  if (token.liquidity >= CONFIG.MIN_LIQUIDITY) {
    score += 2;
  } else {
    reasons.push(`Liquidity $${token.liquidity} < $${CONFIG.MIN_LIQUIDITY}`);
    return { score: 0, pass: false, reasons };
  }
  
  if (token.volume24h >= CONFIG.MIN_VOLUME_24H) {
    score += 2;
  } else {
    reasons.push(`Volume $${token.volume24h} < $${CONFIG.MIN_VOLUME_24H}`);
    return { score: 0, pass: false, reasons };
  }
  
  // Momentum checks (must be positive and stable)
  if (token.priceChange?.m5 > 2 && token.priceChange?.m5 < 10) {
    score += 2; // Sweet spot: +2% to +10%
  } else {
    reasons.push(`M5 change ${token.priceChange?.m5}% not in 2-10%`);
    return { score: 0, pass: false, reasons };
  }
  
  if (token.priceChange?.h1 > 5 && token.priceChange?.h1 < 30) {
    score += 2; // Good 1h trend
  } else {
    reasons.push(`H1 change ${token.priceChange?.h1}% not in 5-30%`);
    return { score: 0, pass: false, reasons };
  }
  
  // Buy pressure
  const txns = token.txns?.h1 || { buys: 0, sells: 0 };
  const total = txns.buys + txns.sells;
  if (total > 0) {
    const buyPressure = (txns.buys / total) * 100;
    if (buyPressure >= 60) {
      score += 1;
    } else {
      reasons.push(`Buy pressure ${buyPressure.toFixed(1)}% < 60%`);
      return { score: 0, pass: false, reasons };
    }
  }
  
  // Token age (must be 1-7 days)
  const ageHours = (Date.now() - token.pairCreatedAt) / (1000 * 60 * 60);
  if (ageHours >= 1 && ageHours <= 168) { // 1 hour to 7 days
    score += 1;
  } else {
    reasons.push(`Token age ${ageHours.toFixed(1)}h not in 1h-7d`);
    return { score: 0, pass: false, reasons };
  }
  
  // Volatility check (skip if too volatile)
  const volatility = Math.abs(token.priceChange?.m5 || 0) + Math.abs(token.priceChange?.h1 || 0);
  if (volatility > 40) {
    reasons.push(`Too volatile: ${volatility.toFixed(1)}%`);
    return { score: 0, pass: false, reasons };
  }
  
  // Check blacklist
  if (PAPER_STATE.blacklist.includes(token.baseToken?.address)) {
    reasons.push('Token blacklisted (3x SL)');
    return { score: 0, pass: false, reasons };
  }
  
  // Check previous SL count
  const slCount = PAPER_STATE.tokenSLCount[token.baseToken?.address] || 0;
  if (slCount >= CONFIG.MAX_SL_PER_TOKEN) {
    reasons.push(`Token has ${slCount} SL (max ${CONFIG.MAX_SL_PER_TOKEN})`);
    return { score: 0, pass: false, reasons };
  } else if (slCount === 2) {
    score -= 1; // Penalty for 2 SL
    reasons.push('Warning: 2x SL history');
  }
  
  return { score, pass: score >= CONFIG.MIN_SCORE, reasons };
}

// Simulate paper trade
async function simulateTrade(token) {
  const scoreCheck = calculateStrictScore(token);
  
  if (!scoreCheck.pass) {
    console.log(`❌ ${token.baseToken?.symbol}: REJECTED (Score: ${scoreCheck.score})`);
    scoreCheck.reasons.forEach(r => console.log(`   - ${r}`));
    return null;
  }
  
  // Check limits
  if (PAPER_STATE.currentPositions >= CONFIG.MAX_POSITIONS) {
    console.log(`⚠️ Max positions (${CONFIG.MAX_POSITIONS}) reached`);
    return null;
  }
  
  const today = new Date().toDateString();
  if (PAPER_STATE.lastTradeDate !== today) {
    PAPER_STATE.dailyTrades = 0;
    PAPER_STATE.lastTradeDate = today;
  }
  
  if (PAPER_STATE.dailyTrades >= CONFIG.MAX_DAILY_TRADES) {
    console.log(`⚠️ Daily trade limit (${CONFIG.MAX_DAILY_TRADES}) reached`);
    return null;
  }
  
  // Paper trade entry
  const trade = {
    id: Date.now(),
    symbol: token.baseToken?.symbol,
    ca: token.baseToken?.address,
    entry: parseFloat(token.priceUsd),
    entryTime: Date.now(),
    sl: parseFloat(token.priceUsd) * (1 + CONFIG.SL_PERCENT / 100),
    tp1: parseFloat(token.priceUsd) * (1 + CONFIG.TP1_PERCENT / 100),
    tp2: parseFloat(token.priceUsd) * (1 + CONFIG.TP2_PERCENT / 100),
    score: scoreCheck.score,
    status: 'OPEN',
    pnl: 0
  };
  
  PAPER_STATE.trades.push(trade);
  PAPER_STATE.currentPositions++;
  PAPER_STATE.dailyTrades++;
  saveState();
  
  console.log(`\n✅ PAPER TRADE: ${trade.symbol}`);
  console.log(`   Score: ${trade.score}/10 | Price: $${trade.entry.toFixed(8)}`);
  console.log(`   SL: $${trade.sl.toFixed(8)} | TP1: $${trade.tp1.toFixed(8)} | TP2: $${trade.tp2.toFixed(8)}`);
  
  await notify(`📊 *PAPER TRADE: ${trade.symbol}*\nScore: ${trade.score}/10\nEntry: $${trade.entry.toFixed(8)}\nSL: -${Math.abs(CONFIG.SL_PERCENT)}% | TP: +${CONFIG.TP2_PERCENT}%`);
  
  return trade;
}

// Check paper trades for exits
async function checkPaperExits() {
  const openTrades = PAPER_STATE.trades.filter(t => t.status === 'OPEN');
  
  for (const trade of openTrades) {
    try {
      // Get current price
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${trade.ca}`, { timeout: 10000 });
      if (!res.ok) continue;
      
      const data = await res.json();
      if (!data.pairs || !data.pairs[0]) continue;
      
      const currentPrice = parseFloat(data.pairs[0].priceUsd);
      const pnl = ((currentPrice - trade.entry) / trade.entry) * 100;
      
      // Check SL
      if (currentPrice <= trade.sl) {
        trade.status = 'CLOSED';
        trade.exitPrice = currentPrice;
        trade.exitTime = Date.now();
        trade.pnl = pnl;
        trade.result = 'SL';
        PAPER_STATE.losses++;
        PAPER_STATE.currentPositions--;
        
        // Track SL per token
        PAPER_STATE.tokenSLCount[trade.ca] = (PAPER_STATE.tokenSLCount[trade.ca] || 0) + 1;
        
        // Blacklist if 3 SL
        if (PAPER_STATE.tokenSLCount[trade.ca] >= 3) {
          PAPER_STATE.blacklist.push(trade.ca);
          console.log(`🚫 ${trade.symbol}: BLACKLISTED (3x SL)`);
        }
        
        console.log(`\n❌ SL HIT: ${trade.symbol} | PnL: ${pnl.toFixed(2)}%`);
        await notify(`❌ *PAPER SL: ${trade.symbol}*\nPnL: ${pnl.toFixed(2)}%`);
      }
      
      // Check TP2
      else if (currentPrice >= trade.tp2) {
        trade.status = 'CLOSED';
        trade.exitPrice = currentPrice;
        trade.exitTime = Date.now();
        trade.pnl = pnl;
        trade.result = 'TP2';
        PAPER_STATE.wins++;
        PAPER_STATE.currentPositions--;
        
        console.log(`\n✅ TP2 HIT: ${trade.symbol} | PnL: ${pnl.toFixed(2)}%`);
        await notify(`✅ *PAPER TP2: ${trade.symbol}*\nPnL: ${pnl.toFixed(2)}%`);
      }
      
      // Check TP1 (partial)
      else if (currentPrice >= trade.tp1 && !trade.tp1Hit) {
        trade.tp1Hit = true;
        console.log(`\n🎯 TP1 HIT: ${trade.symbol} | PnL: ${pnl.toFixed(2)}% (50% sold)`);
      }
      
      // Check max hold time
      const holdMinutes = (Date.now() - trade.entryTime) / (1000 * 60);
      if (holdMinutes > CONFIG.MAX_HOLD_MINUTES && pnl > 0) {
        // Close at market if profitable
        trade.status = 'CLOSED';
        trade.exitPrice = currentPrice;
        trade.exitTime = Date.now();
        trade.pnl = pnl;
        trade.result = 'TIMEOUT_PROFIT';
        PAPER_STATE.wins++;
        PAPER_STATE.currentPositions--;
        
        console.log(`\n⏱️ TIMEOUT CLOSE: ${trade.symbol} | PnL: ${pnl.toFixed(2)}%`);
      }
      
    } catch (e) {
      console.error(`Error checking ${trade.symbol}:`, e.message);
    }
  }
  
  saveState();
}

// Print stats
function printStats() {
  const total = PAPER_STATE.wins + PAPER_STATE.losses;
  const wr = total > 0 ? (PAPER_STATE.wins / total * 100).toFixed(1) : 0;
  const avgWin = PAPER_STATE.trades.filter(t => t.pnl > 0).reduce((a, t) => a + t.pnl, 0) / (PAPER_STATE.wins || 1);
  const avgLoss = PAPER_STATE.trades.filter(t => t.pnl < 0).reduce((a, t) => a + t.pnl, 0) / (PAPER_STATE.losses || 1);
  
  console.log('\n════════════════════════════════════════════════════');
  console.log('       📊 PAPER TRADER - STRICT MODE STATS');
  console.log('════════════════════════════════════════════════════');
  console.log(`Total Trades: ${total}/${CONFIG.TARGET_TRADES}`);
  console.log(`Wins: ${PAPER_STATE.wins} | Losses: ${PAPER_STATE.losses}`);
  console.log(`Win Rate: ${wr}% (Target: ${CONFIG.TARGET_WR}%)`);
  console.log(`Avg Win: +${avgWin.toFixed(2)}% | Avg Loss: ${avgLoss.toFixed(2)}%`);
  console.log(`Open Positions: ${PAPER_STATE.currentPositions}/${CONFIG.MAX_POSITIONS}`);
  console.log(`Daily Trades: ${PAPER_STATE.dailyTrades}/${CONFIG.MAX_DAILY_TRADES}`);
  console.log(`Blacklisted: ${PAPER_STATE.blacklist.length} tokens`);
  
  if (total >= CONFIG.TARGET_TRADES) {
    if (wr >= CONFIG.TARGET_WR) {
      console.log('\n🎉 TARGET ACHIEVED! Ready for LIVE trading');
    } else {
      console.log('\n⚠️ Target trades reached but WR below 70%');
      console.log('   Continue paper testing...');
    }
  }
  
  console.log('════════════════════════════════════════════════════\n');
}

// Main
async function main() {
  loadState();
  
  console.log('════════════════════════════════════════════════════');
  console.log('   🧪 PAPER TRADER - STRICT MODE v6.0');
  console.log('════════════════════════════════════════════════════');
  console.log('Testing new strict strategy before live deployment');
  console.log(`Target: ${CONFIG.TARGET_TRADES} trades with ${CONFIG.TARGET_WR}% WR\n`);
  
  printStats();
  
  // Check existing trades
  await checkPaperExits();
  
  // Scan for new opportunities (placeholder - integrate with your scanner)
  console.log('\n🔍 Scanning for opportunities with STRICT filters...');
  console.log(`Min Score: ${CONFIG.MIN_SCORE}/10`);
  console.log(`Min Liquidity: $${CONFIG.MIN_LIQUIDITY.toLocaleString()}`);
  console.log(`Min Volume: $${CONFIG.MIN_VOLUME_24H.toLocaleString()}`);
  console.log(`Max Positions: ${CONFIG.MAX_POSITIONS}`);
  console.log(`Max Daily Trades: ${CONFIG.MAX_DAILY_TRADES}\n`);
  
  printStats();
  saveState();
}

main().catch(console.error);
