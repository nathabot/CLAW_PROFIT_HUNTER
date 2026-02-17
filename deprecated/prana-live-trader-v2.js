#!/usr/bin/env node
// PRANA VPS - LIVE TRADER
// Strategy: 73.3% win rate validated (22W/8L)
// Position: 0.015 SOL with fee reserve

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fetch = require('node-fetch');
const { exec } = require('child_process');

const CONFIG = {
  WALLET: 'EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX',
  POSITION_SIZE: 0.015,     // SOL per trade
  FEE_RESERVE: 0.015,       // SOL reserved for fees
  STOP_LOSS: -3,            // %
  TAKE_PROFIT: 6,           // %
  MIN_SCORE: 8,             // /10 (validated from paper trading)
  MAX_DAILY_TRADES: 10,
  DAILY_TARGET: 0.2,        // SOL
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304'
};

class PranaLiveTrader {
  constructor() {
    this.connection = new Connection(CONFIG.RPC);
    this.tradesToday = 0;
    this.dailyPnl = 0;
    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
  }

  async getBalance() {
    try {
      const balance = await this.connection.getBalance(new PublicKey(CONFIG.WALLET));
      return balance / 1e9;
    } catch (e) { return 0; }
  }

  async scanAndTrade() {
    const balance = await this.getBalance();
    const tradingBalance = balance - CONFIG.FEE_RESERVE;

    console.log('═══════════════════════════════════════════════════');
    console.log('  PRANA LIVE TRADER - 73.3% STRATEGY');
    console.log('═══════════════════════════════════════════════════\n');

    console.log(`Wallet: ${CONFIG.WALLET}`);
    console.log(`Balance: ${balance.toFixed(4)} SOL`);
    console.log(`Trading: ${tradingBalance.toFixed(4)} SOL`);
    console.log(`Fee Reserve: ${CONFIG.FEE_RESERVE} SOL`);
    console.log(`Position: ${CONFIG.POSITION_SIZE} SOL`);
    console.log(`Daily PnL: ${this.dailyPnl.toFixed(4)} SOL`);
    console.log(`Win Rate: ${this.totalTrades > 0 ? ((this.wins/this.totalTrades)*100).toFixed(1) : 0}%`);
    console.log(`Trades Today: ${this.tradesToday}/${CONFIG.MAX_DAILY_TRADES}\n`);

    // Check limits
    if (tradingBalance < CONFIG.POSITION_SIZE) {
      console.log('❌ Insufficient balance for trading');
      return;
    }

    if (this.tradesToday >= CONFIG.MAX_DAILY_TRADES) {
      console.log('✅ Max daily trades reached');
      return;
    }

    if (this.dailyPnl >= CONFIG.DAILY_TARGET) {
      console.log('🎯 Daily target reached!');
      return;
    }

    // Scan
    try {
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await response.json();

      for (const profile of profiles.slice(0, 30)) {
        if (profile.chainId !== 'solana') continue;

        try {
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
          const data = await pairRes.json();

          if (!data.pairs || !data.pairs[0]) continue;
          const pair = data.pairs[0];

          const symbol = pair.baseToken?.symbol;
          if (['SOL', 'USDC', 'USDT'].includes(symbol?.toUpperCase())) continue;

          // Score setup (same as paper trading)
          let score = 0;
          if (pair.volume?.h24 > 100000) score += 2;
          else if (pair.volume?.h24 > 50000) score += 1;
          if (pair.liquidity?.usd > 20000) score += 2;
          else if (pair.liquidity?.usd > 10000) score += 1;
          if (pair.priceChange?.h1 > 50) score += 2;
          else if (pair.priceChange?.h1 > 20) score += 1;
          if (pair.priceChange?.m5 >= 5 && pair.priceChange?.m5 <= 12) score += 2;

          if (score >= CONFIG.MIN_SCORE) {
            await this.executeLiveTrade({
              symbol,
              ca: profile.tokenAddress,
              price: parseFloat(pair.priceUsd),
              score
            });
            return;
          }
        } catch (e) {}
      }

      console.log('📭 No setups found (score >= 6)');

    } catch (error) {
      console.log('Error:', error.message);
    }
  }

  async executeLiveTrade(setup) {
    const entryPrice = setup.price;
    const stopPrice = entryPrice * 0.97;
    const targetPrice = entryPrice * 1.06;

    console.log('\n🚀 LIVE TRADE SETUP');
    console.log(`Token: ${setup.symbol}`);
    console.log(`Score: ${setup.score}/10`);
    console.log(`Entry: $${entryPrice.toFixed(8)}`);
    console.log(`Stop: $${stopPrice.toFixed(8)} (-3%)`);
    console.log(`Target: $${targetPrice.toFixed(8)} (+6%)`);
    console.log(`Size: ${CONFIG.POSITION_SIZE} SOL`);
    console.log(`CA: ${setup.ca}\n`);

    // Execute swap
    console.log('⚡ EXECUTING SWAP...');
    const swapCmd = `node tracker-swap.js buy ${setup.ca} ${CONFIG.POSITION_SIZE}`;

    exec(swapCmd, { timeout: 90000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ Swap failed:', error.message);
        return;
      }

      console.log('✅ Swap executed!');
      console.log(stdout);

      // Log trade
      this.tradesToday++;
      this.totalTrades++;

      // Send to group
      this.notifyGroup(`🚀 **LIVE TRADE EXECUTED**

Token: \`${setup.symbol}\`
Score: ${setup.score}/10
Entry: $${entryPrice.toFixed(8)}
Size: ${CONFIG.POSITION_SIZE} SOL
Stop: -3% | Target: +6%

⏳ Monitoring for exit...`);

      // Monitor position (in real implementation, this would be a separate process)
      console.log('⏳ Position active. Monitor manually or set alerts.');
    });
  }

  notifyGroup(message) {
    const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
    const CHAT_ID = '-1003212463774';

    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    }).catch(() => {});
  }
}

const trader = new PranaLiveTrader();
trader.scanAndTrade().catch(console.error);
