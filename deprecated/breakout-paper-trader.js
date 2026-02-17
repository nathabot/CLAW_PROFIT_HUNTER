#!/usr/bin/env node
// BREAKOUT PAPER TRADER
// Monitor and paper trade breakout setups

const fetch = require('node-fetch');
const fs = require('fs');

const CONFIG = {
  BREAKOUT_MIN: 5,         // +5% in 5m
  BREAKOUT_MAX: 15,        // Max +15% (not too parabolic)
  MIN_VOLUME_24H: 30000,   // $30k volume
  MIN_LIQUIDITY: 5000,     // $5k liquidity
  MAX_POSITIONS: 1,        // 1 trade at a time
  PAPER_POSITION_SIZE: 0.01 // 0.01 SOL virtual
};

const PAPER_TRADES = [];
let ACTIVE_TRADE = null;

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${msg}`);
}

async function scanForBreakouts() {
  if (ACTIVE_TRADE) {
    log(`⏳ Active trade: ${ACTIVE_TRADE.symbol} - monitoring for exit`);
    await checkActiveTrade();
    return;
  }

  log('🔍 Scanning for BREAKOUT setups...');
  
  try {
    const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    const profiles = await response.json();
    
    let found = 0;
    
    for (const profile of profiles.slice(0, 30)) {
      if (profile.chainId !== 'solana') continue;
      
      try {
        const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
        const data = await pairRes.json();
        
        if (!data.pairs || !data.pairs[0]) continue;
        const pair = data.pairs[0];
        
        const symbol = pair.baseToken?.symbol;
        const price = parseFloat(pair.priceUsd);
        const change5m = pair.priceChange?.m5 || 0;
        const change1h = pair.priceChange?.h1 || 0;
        const volume = pair.volume?.h24 || 0;
        const liquidity = pair.liquidity?.usd || 0;
        
        // Skip majors and low quality
        if (['SOL', 'USDC', 'USDT', 'WBTC', 'WETH'].includes(symbol?.toUpperCase())) continue;
        if (volume < CONFIG.MIN_VOLUME_24H) continue;
        if (liquidity < CONFIG.MIN_LIQUIDITY) continue;
        
        // BREAKOUT criteria
        const isBreakingOut = change5m >= CONFIG.BREAKOUT_MIN && change5m <= CONFIG.BREAKOUT_MAX;
        const hasTrend = change1h > 0; // Some uptrend support
        
        if (isBreakingOut && hasTrend) {
          found++;
          
          // ENTER PAPER TRADE
          ACTIVE_TRADE = {
            id: Date.now(),
            symbol,
            ca: profile.tokenAddress,
            entryPrice: price,
            entryTime: new Date().toISOString(),
            change5m,
            change1h,
            volume,
            stopPrice: price * 0.97,  // -3% stop
            targetPrice: price * 1.06, // +6% target
            status: 'OPEN'
          };
          
          log(`\n🚀 PAPER ENTRY: ${symbol}`);
          log(`   Price: $${price.toFixed(8)}`);
          log(`   Breakout: +${change5m}% in 5m`);
          log(`   1h trend: +${change1h}%`);
          log(`   Stop: $${ACTIVE_TRADE.stopPrice.toFixed(8)} (-3%)`);
          log(`   Target: $${ACTIVE_TRADE.targetPrice.toFixed(8)} (+6%)`);
          log(`   Position: ${CONFIG.PAPER_POSITION_SIZE} SOL (virtual)\n`);
          
          // Save to file
          fs.appendFileSync('/root/trading-bot/paper-trades.log', JSON.stringify(ACTIVE_TRADE) + '\n');
          
          // Alert
          await sendAlert(`🚀 PAPER TRADE ENTERED\n\nToken: ${symbol}\nEntry: $${price.toFixed(8)}\nBreakout: +${change5m}%\nStop: -3% | Target: +6%\n\n⏳ Monitoring for exit...`);
          
          break; // Only 1 trade at a time
        }
      } catch (e) {}
    }
    
    if (found === 0) {
      log('📭 No breakout setups found');
    }
    
  } catch (error) {
    log(`❌ Error: ${error.message}`);
  }
}

async function checkActiveTrade() {
  if (!ACTIVE_TRADE) return;
  
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ACTIVE_TRADE.ca}`);
    const data = await response.json();
    
    if (!data.pairs || !data.pairs[0]) return;
    
    const pair = data.pairs[0];
    const currentPrice = parseFloat(pair.priceUsd);
    const pnlPercent = ((currentPrice - ACTIVE_TRADE.entryPrice) / ACTIVE_TRADE.entryPrice) * 100;
    
    const now = new Date();
    const entry = new Date(ACTIVE_TRADE.entryTime);
    const holdTimeMin = (now - entry) / 1000 / 60;
    
    log(`   ${ACTIVE_TRADE.symbol}: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (${holdTimeMin.toFixed(1)} min)`);
    
    // Check exits
    if (pnlPercent <= -3) {
      // STOP LOSS
      await exitTrade('STOP LOSS', currentPrice, pnlPercent, holdTimeMin);
    } else if (pnlPercent >= 6) {
      // TAKE PROFIT
      await exitTrade('TAKE PROFIT', currentPrice, pnlPercent, holdTimeMin);
    } else if (holdTimeMin >= 15) {
      // TIME STOP
      await exitTrade('TIME STOP', currentPrice, pnlPercent, holdTimeMin);
    }
    
  } catch (e) {
    log(`   ⚠️ Error checking ${ACTIVE_TRADE.symbol}: ${e.message}`);
  }
}

async function exitTrade(reason, exitPrice, pnlPercent, holdTimeMin) {
  const grossPnl = CONFIG.PAPER_POSITION_SIZE * (pnlPercent / 100);
  const netPnl = grossPnl - 0.001; // Fees
  
  ACTIVE_TRADE.exitPrice = exitPrice;
  ACTIVE_TRADE.exitTime = new Date().toISOString();
  ACTIVE_TRADE.pnlPercent = pnlPercent;
  ACTIVE_TRADE.netPnl = netPnl;
  ACTIVE_TRADE.exitReason = reason;
  ACTIVE_TRADE.holdTime = holdTimeMin;
  ACTIVE_TRADE.status = 'CLOSED';
  
  PAPER_TRADES.push(ACTIVE_TRADE);
  
  log(`\n🎯 PAPER EXIT: ${ACTIVE_TRADE.symbol}`);
  log(`   Reason: ${reason}`);
  log(`   Exit: $${exitPrice.toFixed(8)}`);
  log(`   PnL: ${pnlPercent.toFixed(2)}% ($${netPnl.toFixed(4)} SOL)`);
  log(`   Hold time: ${holdTimeMin.toFixed(1)} min\n`);
  
  // Update file
  fs.appendFileSync('/root/trading-bot/paper-trades.log', JSON.stringify(ACTIVE_TRADE) + '\n');
  
  // Alert
  const emoji = netPnl > 0 ? '✅' : '❌';
  await sendAlert(`${emoji} PAPER TRADE CLOSED\n\nToken: ${ACTIVE_TRADE.symbol}\nReason: ${reason}\nPnL: ${pnlPercent.toFixed(2)}% ($${netPnl.toFixed(4)} SOL)\nHold: ${holdTimeMin.toFixed(1)} min\n\n📊 Total trades: ${PAPER_TRADES.length}`);
  
  ACTIVE_TRADE = null;
  
  // Print stats
  printStats();
}

function printStats() {
  const total = PAPER_TRADES.length;
  const wins = PAPER_TRADES.filter(t => t.netPnl > 0).length;
  const losses = PAPER_TRADES.filter(t => t.netPnl <= 0).length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
  const totalPnl = PAPER_TRADES.reduce((sum, t) => sum + t.netPnl, 0);
  
  log('═══════════════════════════════════════════════════');
  log('  PAPER TRADING STATS');
  log('═══════════════════════════════════════════════════');
  log(`Total Trades: ${total}`);
  log(`Wins: ${wins} | Losses: ${losses}`);
  log(`Win Rate: ${winRate}%`);
  log(`Total PnL: ${totalPnl.toFixed(4)} SOL`);
  log('═══════════════════════════════════════════════════\n');
  
  if (total >= 5) {
    if (winRate >= 50 && totalPnl > 0) {
      log('✅ READY FOR REAL TRADING (small size)');
    } else {
      log('⚠️  NEED MORE PRACTICE - Continue paper trading');
    }
  }
}

async function sendAlert(message) {
  // Telegram alert
  const botToken = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
  const chatId = '-1003212463774';
  
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}

async function main() {
  log('═══════════════════════════════════════════════════');
  log('  BREAKOUT PAPER TRADER - LIVE');
  log('═══════════════════════════════════════════════════');
  log('Strategy: Buy +5% breakout, -3% stop, +6% target');
  log('Scanning every 2 minutes...\n');
  
  // Run immediately
  await scanForBreakouts();
  
  // Run every 2 minutes
  setInterval(scanForBreakouts, 2 * 60 * 1000);
}

main().catch(console.error);
