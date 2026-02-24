/**
 * ENHANCED PORTFOLIO TRACKER
 * Better Telegram integration with rich messages
 */

const fetch = require('node-fetch');
const fs = require('fs');

const TELEGRAM_API = 'https://api.telegram.org/bot';

class PortfolioTracker {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.stateFile = '/root/trading-bot/portfolio-state.json';
    this.loadState();
  }
  
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      } else {
        this.state = { trades: [], dailyStats: {} };
      }
    } catch (e) {
      this.state = { trades: [], dailyStats: {} };
    }
  }
  
  saveState() {
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
  }
  
  recordTrade(trade) {
    this.state.trades.push({
      ...trade,
      timestamp: new Date().toISOString()
    });
    this.saveState();
  }
  
  getTodayStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayTrades = this.state.trades.filter(t => 
      t.timestamp.startsWith(today)
    );
    
    const wins = todayTrades.filter(t => t.pnl > 0);
    const losses = todayTrades.filter(t => t.pnl <= 0);
    
    return {
      trades: todayTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: todayTrades.length > 0 
        ? (wins.length / todayTrades.length * 100).toFixed(1) 
        : 0,
      totalPnl: todayTrades.reduce((sum, t) => sum + t.pnl, 0)
    };
  }
  
  async sendPortfolioUpdate(balance, positions) {
    const stats = this.getTodayStats();
    
    let msg = `📊 **PORTFOLIO UPDATE**\n\n`;
    msg += `💰 Balance: ${balance.toFixed(4)} SOL\n\n`;
    
    msg += `📈 **Today:**\n`;
    msg += `Trades: ${stats.trades}\n`;
    msg += `W/L: ${stats.wins}/${stats.losses}\n`;
    msg += `WR: ${stats.winRate}%\n`;
    msg += `PnL: ${stats.totalPnl > 0 ? '+' : ''}${stats.totalPnl.toFixed(4)} SOL\n`;
    
    if (positions && positions.length > 0) {
      msg += `\n📌 **Open Positions:**\n`;
      for (const p of positions) {
        const pnl = ((p.currentPrice - p.entryPrice) / p.entryPrice * 100).toFixed(1);
        msg += `${p.symbol}: ${pnl > 0 ? '+' : ''}${pnl}%\n`;
      }
    }
    
    await this.sendTelegram(msg);
  }
  
  async sendAlert(type, message) {
    const emojis = {
      error: '❌',
      warning: '⚠️',
      success: '✅',
      info: 'ℹ️'
    };
    
    const msg = `${emojis[type] || 'ℹ️'} ${message}`;
    await this.sendTelegram(msg);
  }
  
  async sendTelegram(text) {
    try {
      await fetch(`${TELEGRAM_API}${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.log('Telegram error:', e.message);
    }
  }
}

module.exports = PortfolioTracker;
