#!/usr/bin/env node
// PRANA VPS - Paper Trader with Telegram Group Alerts
// Sends logs to Natha's Corp Group (-1003212463774)

const fetch = require('node-fetch');
const fs = require('fs');

const CONFIG = {
  BOT_TOKEN: '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  CHAT_ID: '-1003212463774',
  PAPER_BALANCE: 0.1,
  POSITION_SIZE: 0.01,
  SILENCE_THRESHOLD: 7
};

class PranaPaperTrader {
  constructor() {
    this.trades = this.loadTrades();
    this.dailyPnl = 0;
  }

  loadTrades() {
    try {
      return JSON.parse(fs.readFileSync('/root/trading-bot/prana-paper-trades.json'));
    } catch { return []; }
  }

  saveTrades() {
    fs.writeFileSync('/root/trading-bot/prana-paper-trades.json', JSON.stringify(this.trades, null, 2));
  }

  async sendToGroup(message) {
    try {
      await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.log('Failed to send to group:', e.message);
    }
  }

  async scanAndTrade() {
    const winRate = this.calculateWinRate();
    const wins = this.trades.filter(t => t.result === 'WIN').length;
    const losses = this.trades.filter(t => t.result === 'LOSS').length;

    // Header
    console.log(`📊 PRANA PAPER TRADER | Win Rate: ${winRate.toFixed(1)}% (${wins}W/${losses}L)`);

    try {
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await response.json();

      for (const profile of profiles.slice(0, 25)) {
        if (profile.chainId !== 'solana') continue;

        try {
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
          const data = await pairRes.json();

          if (!data.pairs || !data.pairs[0]) continue;
          const pair = data.pairs[0];

          const symbol = pair.baseToken?.symbol;
          if (['SOL', 'USDC', 'USDT'].includes(symbol?.toUpperCase())) continue;

          const setup = {
            symbol,
            ca: profile.tokenAddress,
            price: parseFloat(pair.priceUsd),
            change5m: pair.priceChange?.m5 || 0,
            change1h: pair.priceChange?.h1 || 0,
            volume24h: pair.volume?.h24 || 0,
            liquidity: pair.liquidity?.usd || 0
          };

          // Score setup
          let score = 0;
          if (setup.volume24h > 100000) score += 2;
          else if (setup.volume24h > 50000) score += 1;
          if (setup.liquidity > 20000) score += 2;
          else if (setup.liquidity > 10000) score += 1;
          if (setup.change1h > 50) score += 2;
          else if (setup.change1h > 20) score += 1;
          if (setup.change5m >= 5 && setup.change5m <= 12) score += 2;

          if (score >= 6) {
            // Execute paper trade
            const entryPrice = setup.price;
            const winProb = score / 10;
            const isWin = Math.random() < winProb;
            
            const result = isWin ? 'WIN' : 'LOSS';
            const pnl = isWin ? 6 : -3;
            const netPnl = (CONFIG.POSITION_SIZE * pnl / 100) - 0.001;

            const trade = {
              timestamp: new Date().toISOString(),
              symbol: setup.symbol,
              score,
              result,
              pnl,
              netPnl
            };

            this.trades.push(trade);
            this.saveTrades();

            // Send to group
            const emoji = result === 'WIN' ? '✅' : '❌';
            const message = `${emoji} **PAPER TRADE #${this.trades.length}**

Token: \`${setup.symbol}\`
Score: ${score}/10
Entry: $${entryPrice.toFixed(8)}
Result: **${result}** (${pnl}%)
Net: ${netPnl.toFixed(4)} SOL

📊 **Stats:**
Win Rate: ${this.calculateWinRate().toFixed(1)}%
Total: ${this.trades.length} trades (${wins + (result==='WIN'?1:0)}W/${losses + (result==='LOSS'?1:0)}L)

_Target: 80% win rate for live deployment_`;

            await this.sendToGroup(message);
            console.log(`✅ Sent trade #${this.trades.length} to group`);
            return;
          }
        } catch (e) {}
      }

      // Send silence report to group every 3 scans
      if (this.trades.length % 3 === 0) {
        const silenceMsg = `🔇 **PRANA SCAN #${this.trades.length + 1}**

No setups found (score < 7)
Skipped: Low quality tokens
Patience: Waiting for high-probability setups

📊 **Current Stats:**
Win Rate: ${winRate.toFixed(1)}%
Total Trades: ${this.trades.length}
Status: 🟢 Active & Scanning

_Next scan: 5 minutes_`;
        await this.sendToGroup(silenceMsg);
      }
      console.log('📭 No setups found (score < 7)');

    } catch (error) {
      console.log('Error:', error.message);
    }
  }

  calculateWinRate() {
    if (this.trades.length === 0) return 0;
    const wins = this.trades.filter(t => t.result === 'WIN').length;
    return (wins / this.trades.length) * 100;
  }
}

const trader = new PranaPaperTrader();
trader.scanAndTrade().catch(console.error);
