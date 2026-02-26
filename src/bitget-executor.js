#!/usr/bin/env node
// BITGET EXECUTOR - Order execution module
// Updated: 2026-02-26

const crypto = require('crypto');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const BITGET_BASE_URL = 'https://api.bitget.com';

class BitgetExecutor {
  constructor(credentialsPath = '/root/trading-bot/bitget-credentials.json') {
    const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    this.apiKey = creds.apiKey;
    this.secretKey = creds.secretKey;
    this.passphrase = creds.passphrase;
    
    this.logFile = '/root/trading-bot/logs/bitget-executor.log';
    this.ensureLogDir();
    this.log('Executor initialized');
  }

  ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  log(msg) {
    const ts = `[${new Date().toLocaleTimeString('id-ID')}]`;
    console.log(`${ts} ${msg}`);
    try { fs.appendFileSync(this.logFile, `${ts} ${msg}\n`); } catch (_) {}
  }

  generateSignature(timestamp, method, requestPath, body = '') {
    const msg = timestamp + method + requestPath + body;
    return crypto.createHmac('sha256', this.secretKey).update(msg).digest('base64');
  }

  async request(method, endpoint, body = null) {
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {
      'ACCESS-KEY': this.apiKey,
      'ACCESS-SIGN': this.generateSignature(timestamp, method, endpoint, bodyStr),
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json'
    };

    const res = await fetch(BITGET_BASE_URL + endpoint, {
      method,
      headers,
      ...(body && { body: bodyStr })
    });
    const data = await res.json();
    if (data.code !== '00000') throw new Error(`Bitget: ${data.msg}`);
    return data.data;
  }

  async getBalance(coin = 'USDT') {
    const assets = await this.request('GET', '/api/v2/spot/account/assets');
    const asset = assets.find(a => a.coin === coin);
    return asset ? parseFloat(asset.available) : 0;
  }

  async getPrice(symbol) {
    const tickers = await this.request('GET', `/api/v2/spot/market/tickers?symbol=${symbol}`);
    return tickers ? parseFloat(tickers.lastPr) : null;
  }

  async buyMarket(symbol, usdtAmount) {
    // For market buy, we use quoteSize (USDT amount)
    const order = {
      symbol,
      side: 'buy',
      orderType: 'market',
      force: 'gtc',
      quoteSize: usdtAmount.toString()
    };
    return await this.request('POST', '/api/v2/spot/trade/place-order', order);
  }

  async sellMarket(symbol, quantity) {
    const order = {
      symbol,
      side: 'sell',
      orderType: 'market',
      force: 'gtc',
      size: quantity.toString()
    };
    return await this.request('POST', '/api/v2/spot/trade/place-order', order);
  }

  async getMinOrderSize(symbol) {
    // Bitget typically has $1 minimum for USDT pairs
    return 1;
  }
}

module.exports = BitgetExecutor;
