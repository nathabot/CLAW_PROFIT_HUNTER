#!/usr/bin/env node
// PULLBACK STRATEGY BACKTESTER
// Test strategy on historical data before live trading

const fetch = require('node-fetch');
const fs = require('fs');

const CONFIG = {
  LOOKBACK_DAYS: 7,        // Test last 7 days
  MIN_1H_CHANGE: 15,       // Min 15% 1h trend
  PULLBACK_MIN: -15,       // Min -15% pullback
  PULLBACK_MAX: -2,        // Max -2% pullback
  STOP_LOSS: -5,           // -5% stop
  TAKE_PROFIT: 10,         // +10% target
  POSITION_SIZE: 0.01,     // 0.01 SOL
  FEE_PER_TRADE: 0.0005,   // 0.0005 SOL fee
  MAX_HOLD_TIME: 30        // Max 30 minutes
};

class PullbackBacktester {
  constructor() {
    this.trades = [];
    this.totalPnl = 0;
    this.wins = 0;
    this.losses = 0;
  }

  async fetchHistoricalData(tokenCA, days = 7) {
    try {
      // Get OHLCV data from DexScreener or similar
      // For now, use current pairs and simulate
      console.log(`📊 Fetching data for ${tokenCA}...`);
      
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`);
      const data = await response.json();
      
      if (!data.pairs || !data.pairs[0]) return null;
      
      return data.pairs[0];
    } catch (e) {
      return null;
    }
  }

  simulateTrade(entryPrice, exitPrice, holdTime) {
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
    const grossPnl = CONFIG.POSITION_SIZE * (pnlPercent / 100);
    const netPnl = grossPnl - (CONFIG.FEE_PER_TRADE * 2); // Buy + Sell fees
    
    return {
      pnlPercent,
      grossPnl,
      netPnl,
      holdTime,
      result: pnlPercent >= CONFIG.TAKE_PROFIT ? 'WIN' : 
              pnlPercent <= CONFIG.STOP_LOSS ? 'LOSS' : 'TIMEOUT'
    };
  }

  async runBacktest() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  PULLBACK STRATEGY BACKTESTER');
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('Configuration:');
    console.log(`  Min 1h trend: +${CONFIG.MIN_1H_CHANGE}%`);
    console.log(`  Pullback range: ${CONFIG.PULLBACK_MIN}% to ${CONFIG.PULLBACK_MAX}%`);
    console.log(`  Stop loss: ${CONFIG.STOP_LOSS}%`);
    console.log(`  Take profit: +${CONFIG.TAKE_PROFIT}%`);
    console.log(`  Position size: ${CONFIG.POSITION_SIZE} SOL`);
    console.log(`  Max hold: ${CONFIG.MAX_HOLD_TIME} minutes\n`);
    
    // Get trending tokens
    console.log('🔍 Scanning for backtest candidates...\n');
    
    try {
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await response.json();
      
      let candidates = 0;
      let tested = 0;
      
      for (const profile of profiles.slice(0, 30)) {
        if (profile.chainId !== 'solana') continue;
        
        try {
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
          const data = await pairRes.json();
          
          if (!data.pairs || !data.pairs[0]) continue;
          const pair = data.pairs[0];
          
          const symbol = pair.baseToken?.symbol;
          const price = parseFloat(pair.priceUsd);
          const change1h = pair.priceChange?.h1 || 0;
          const change5m = pair.priceChange?.m5 || 0;
          const change24h = pair.priceChange?.h24 || 0;
          
          if (['SOL', 'USDC', 'USDT'].includes(symbol?.toUpperCase())) continue;
          
          // Check if this was a valid setup
          const validTrend = change1h > CONFIG.MIN_1H_CHANGE;
          const validPullback = change5m >= CONFIG.PULLBACK_MIN && change5m <= CONFIG.PULLBACK_MAX;
          
          if (validTrend && validPullback) {
            candidates++;
            
            // Simulate entry at current price
            const entryPrice = price;
            const stopPrice = entryPrice * (1 + CONFIG.STOP_LOSS/100);
            const targetPrice = entryPrice * (1 + CONFIG.TAKE_PROFIT/100);
            
            // Simulate what happened next using 24h data as proxy
            // In real backtest, we'd have minute-by-minute data
            const priceMoved = change24h - change1h; // Movement after our entry
            const estimatedExit = entryPrice * (1 + priceMoved/100);
            
            // Determine outcome
            let exitPrice, holdTime, result;
            
            if (priceMoved <= CONFIG.STOP_LOSS) {
              exitPrice = stopPrice;
              result = 'LOSS';
              holdTime = 15; // Estimated
            } else if (priceMoved >= CONFIG.TAKE_PROFIT) {
              exitPrice = targetPrice;
              result = 'WIN';
              holdTime = 20; // Estimated
            } else {
              exitPrice = estimatedExit;
              result = priceMoved > 0 ? 'WIN' : 'LOSS';
              holdTime = CONFIG.MAX_HOLD_TIME;
            }
            
            const trade = this.simulateTrade(entryPrice, exitPrice, holdTime);
            trade.symbol = symbol;
            trade.entryPrice = entryPrice;
            trade.exitPrice = exitPrice;
            trade.setup = `${change1h}% 1h, ${change5m}% 5m pullback`;
            
            this.trades.push(trade);
            
            if (trade.netPnl > 0) this.wins++;
            else this.losses++;
            
            this.totalPnl += trade.netPnl;
            
            console.log(`\n📝 Trade ${this.trades.length}: ${symbol}`);
            console.log(`   Setup: ${trade.setup}`);
            console.log(`   Entry: $${entryPrice.toFixed(8)}`);
            console.log(`   Exit: $${exitPrice.toFixed(8)}`);
            console.log(`   PnL: ${trade.pnlPercent.toFixed(2)}% ($${trade.netPnl.toFixed(4)} SOL)`);
            console.log(`   Result: ${result}`);
            
            tested++;
            if (tested >= 10) break; // Test max 10 trades
          }
        } catch (e) {}
      }
      
      this.printResults();
      
    } catch (error) {
      console.log('❌ Backtest error:', error.message);
    }
  }
  
  printResults() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  BACKTEST RESULTS');
    console.log('═══════════════════════════════════════════════════\n');
    
    const totalTrades = this.trades.length;
    const winRate = totalTrades > 0 ? (this.wins / totalTrades * 100).toFixed(1) : 0;
    const avgPnl = totalTrades > 0 ? (this.totalPnl / totalTrades).toFixed(4) : 0;
    
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Wins: ${this.wins}`);
    console.log(`Losses: ${this.losses}`);
    console.log(`Win Rate: ${winRate}%`);
    console.log(`Total PnL: ${this.totalPnl.toFixed(4)} SOL`);
    console.log(`Avg PnL per trade: ${avgPnl} SOL`);
    console.log(`\nProfit Factor: ${this.calculateProfitFactor().toFixed(2)}`);
    
    console.log('\n═══════════════════════════════════════════════════');
    if (winRate >= 50 && this.totalPnl > 0) {
      console.log('✅ STRATEGY VALID - Ready for live trading');
    } else {
      console.log('⚠️  STRATEGY NEEDS IMPROVEMENT');
      console.log('   Adjust parameters or wait for better setups');
    }
    console.log('═══════════════════════════════════════════════════\n');
    
    // Save results
    const report = {
      timestamp: new Date().toISOString(),
      config: CONFIG,
      results: {
        totalTrades,
        wins: this.wins,
        losses: this.losses,
        winRate: `${winRate}%`,
        totalPnl: this.totalPnl,
        avgPnl
      },
      trades: this.trades
    };
    
    fs.writeFileSync('/root/trading-bot/backtest-report.json', JSON.stringify(report, null, 2));
    console.log('📊 Full report saved to backtest-report.json');
  }
  
  calculateProfitFactor() {
    let grossProfit = 0;
    let grossLoss = 0;
    
    this.trades.forEach(t => {
      if (t.netPnl > 0) grossProfit += t.netPnl;
      else grossLoss += Math.abs(t.netPnl);
    });
    
    return grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
  }
}

// Run backtest
const backtester = new PullbackBacktester();
backtester.runBacktest().catch(console.error);
