// BITGET TRADER MODULE
// Platform: VPS Natha
// Features: Spot trading execution via Bitget REST API
// Updated: 2026-02-26

const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TELEGRAM_BOT_TOKEN } = require('./env-loader');

const BITGET_BASE_URL = 'https://api.bitget.com';
const BOT_TOKEN = TELEGRAM_BOT_TOKEN || '${TELEGRAM_BOT_TOKEN}';
const CHAT_ID = '-1003212463774';

class BitgetTrader {
  constructor(configPath = '/root/trading-bot/bitget-config.json') {
    // Load config
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Load credentials
    const credPath = '/root/trading-bot/bitget-credentials.json';
    if (!fs.existsSync(credPath)) {
      throw new Error(`Credentials file not found: ${credPath}`);
    }
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    this.apiKey = creds.apiKey;
    this.secretKey = creds.secretKey;
    this.passphrase = creds.passphrase;
    
    // State file for tracking positions
    this.stateFile = '/root/trading-bot/bitget-state.json';
    this.logFile = this.config.LOG_FILE || '/root/trading-bot/logs/bitget-trader.log';
    
    // Ensure log directory exists
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.log('BitgetTrader initialized');
  }
  
  // Logging with timestamp
  log(message) {
    const timestamp = `[${new Date().toLocaleTimeString('id-ID')}]`;
    const logMessage = `${timestamp} ${message}`;
    console.log(logMessage);
    
    // Append to log file
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }
  
  // Generate HMAC-SHA256 signature for Bitget API
  generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    const hmac = crypto.createHmac('sha256', this.secretKey);
    hmac.update(message);
    return hmac.digest('base64');
  }
  
  // Make authenticated request to Bitget API
  async request(method, endpoint, body = null) {
    const timestamp = Date.now().toString();
    const requestPath = endpoint;
    const bodyStr = body ? JSON.stringify(body) : '';
    
    const signature = this.generateSignature(timestamp, method, requestPath, bodyStr);
    
    const headers = {
      'ACCESS-KEY': this.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json',
      'locale': 'en-US'
    };
    
    const url = BITGET_BASE_URL + requestPath;
    
    try {
      const options = {
        method,
        headers,
        ...(body && { body: bodyStr })
      };
      
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (data.code !== '00000') {
        throw new Error(`Bitget API error: ${data.msg || data.message || 'Unknown error'}`);
      }
      
      return data.data;
    } catch (err) {
      this.log(`❌ API request failed: ${err.message}`);
      throw err;
    }
  }
  
  // Get balance for a specific coin
  async getBalance(coin = 'USDT') {
    try {
      const data = await this.request('GET', '/api/v2/spot/account/assets');
      
      if (!data || !Array.isArray(data)) {
        return 0;
      }
      
      const asset = data.find(a => a.coin === coin);
      return asset ? parseFloat(asset.available) : 0;
    } catch (err) {
      this.log(`Failed to get balance for ${coin}: ${err.message}`);
      return 0;
    }
  }
  
  // Get current price for a symbol
  async getPrice(symbol) {
    try {
      const data = await this.request('GET', `/api/v2/spot/market/tickers?symbol=${symbol}`);
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error(`No price data for ${symbol}`);
      }
      
      return parseFloat(data[0].lastPr);
    } catch (err) {
      this.log(`Failed to get price for ${symbol}: ${err.message}`);
      throw err;
    }
  }
  
  // Place buy order (market order)
  async placeBuyOrder(symbol, quoteAmount) {
    try {
      this.log(`🛒 Placing BUY order: ${symbol}, amount: ${quoteAmount} USDT`);
      
      const orderParams = {
        symbol: symbol,
        side: 'buy',
        orderType: 'market',
        force: 'gtc',
        size: quoteAmount.toString() // For market buy, size is in quote currency (USDT)
      };
      
      const data = await this.request('POST', '/api/v2/spot/trade/place-order', orderParams);
      
      this.log(`✅ BUY order placed: ${data.orderId}`);
      
      // Update state
      await this.addPosition(symbol, data.orderId, quoteAmount);
      
      // Send Telegram notification
      await this.sendTelegram(
        `🟢 Bitget BUY\n` +
        `Symbol: ${symbol}\n` +
        `Amount: ${quoteAmount} USDT\n` +
        `Order ID: ${data.orderId}`,
        this.config.TELEGRAM_TOPIC_TRADES || 24
      );
      
      return data;
    } catch (err) {
      this.log(`❌ Failed to place BUY order: ${err.message}`);
      await this.sendTelegram(
        `❌ Bitget BUY Failed\n` +
        `Symbol: ${symbol}\n` +
        `Error: ${err.message}`,
        this.config.TELEGRAM_TOPIC_TRADES || 24
      );
      throw err;
    }
  }
  
  // Place sell order (market order)
  async placeSellOrder(symbol, quantity) {
    try {
      this.log(`💰 Placing SELL order: ${symbol}, quantity: ${quantity}`);
      
      const orderParams = {
        symbol: symbol,
        side: 'sell',
        orderType: 'market',
        force: 'gtc',
        size: quantity.toString() // For market sell, size is in base currency
      };
      
      const data = await this.request('POST', '/api/v2/spot/trade/place-order', orderParams);
      
      this.log(`✅ SELL order placed: ${data.orderId}`);
      
      // Update state
      await this.removePosition(symbol, data.orderId);
      
      // Send Telegram notification
      await this.sendTelegram(
        `🔴 Bitget SELL\n` +
        `Symbol: ${symbol}\n` +
        `Quantity: ${quantity}\n` +
        `Order ID: ${data.orderId}`,
        this.config.TELEGRAM_TOPIC_TRADES || 24
      );
      
      return data;
    } catch (err) {
      this.log(`❌ Failed to place SELL order: ${err.message}`);
      await this.sendTelegram(
        `❌ Bitget SELL Failed\n` +
        `Symbol: ${symbol}\n` +
        `Error: ${err.message}`,
        this.config.TELEGRAM_TOPIC_TRADES || 24
      );
      throw err;
    }
  }
  
  // Get order status
  async getOrder(orderId, symbol) {
    try {
      const data = await this.request('GET', `/api/v2/spot/trade/orderInfo?orderId=${orderId}&symbol=${symbol}`);
      return data;
    } catch (err) {
      this.log(`Failed to get order ${orderId}: ${err.message}`);
      throw err;
    }
  }
  
  // Cancel order
  async cancelOrder(orderId, symbol) {
    try {
      this.log(`🚫 Cancelling order: ${orderId}`);
      
      const data = await this.request('POST', '/api/v2/spot/trade/cancel-order', {
        orderId: orderId,
        symbol: symbol
      });
      
      this.log(`✅ Order cancelled: ${orderId}`);
      return data;
    } catch (err) {
      this.log(`Failed to cancel order ${orderId}: ${err.message}`);
      throw err;
    }
  }
  
  // Get all open positions from state file
  async getPositions() {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return [];
      }
      
      const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return state.positions || [];
    } catch (err) {
      this.log(`Failed to read positions: ${err.message}`);
      return [];
    }
  }
  
  // Add position to state file
  async addPosition(symbol, orderId, quoteAmount) {
    try {
      let state = { positions: [] };
      
      if (fs.existsSync(this.stateFile)) {
        state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
      
      state.positions = state.positions || [];
      state.positions.push({
        symbol,
        orderId,
        quoteAmount,
        openTime: Date.now(),
        status: 'open'
      });
      
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
      this.log(`Position added to state: ${symbol}`);
    } catch (err) {
      this.log(`Failed to add position: ${err.message}`);
    }
  }
  
  // Remove position from state file
  async removePosition(symbol, orderId) {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return;
      }
      
      const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      state.positions = state.positions || [];
      
      state.positions = state.positions.filter(p => p.symbol !== symbol || p.orderId !== orderId);
      
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
      this.log(`Position removed from state: ${symbol}`);
    } catch (err) {
      this.log(`Failed to remove position: ${err.message}`);
    }
  }
  
  // Send Telegram notification
  async sendTelegram(message, topicId = 24) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      
      const params = {
        chat_id: CHAT_ID,
        text: message,
        message_thread_id: topicId,
        parse_mode: 'HTML'
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Telegram API error: ${errorText}`);
      }
    } catch (err) {
      this.log(`Failed to send Telegram: ${err.message}`);
    }
  }
}

module.exports = BitgetTrader;
