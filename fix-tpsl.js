#!/usr/bin/env node
// Quick fix: set TP/SL for existing BCHUSDT position
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');

const CREDS = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-credentials.json', 'utf8'));

const BASE = 'https://api.bitget.com';

function sign(ts, method, path, qs = null, body = null) {
  let payload = '';
  if (qs && Object.keys(qs).length) {
    const sorted = Object.keys(qs).sort();
    payload = '?' + sorted.map(k => `${k}=${qs[k]}`).join('&');
  } else if (body) {
    payload = JSON.stringify(body);
  }
  return crypto.createHmac('sha256', CREDS.secretKey)
    .update(ts + method + path + payload)
    .digest('base64');
}

async function api(method, path, qs = null, body = null) {
  const ts = Date.now().toString();
  let url = BASE + path;
  
  const headers = {
    'Content-Type': 'application/json',
    'ACCESS-KEY': CREDS.apiKey,
    'ACCESS-TIMESTAMP': ts,
    'ACCESS-PASSPHRASE': CREDS.passphrase
  };
  
  if (qs && Object.keys(qs).length) {
    const sorted = Object.keys(qs).sort();
    const qstr = sorted.map(k => `${k}=${qs[k]}`).join('&');
    url += '?' + qstr;
    headers['ACCESS-SIGN'] = sign(ts, method, path, qs, null);
  } else if (body) {
    headers['ACCESS-SIGN'] = sign(ts, method, path, null, body);
  } else {
    headers['ACCESS-SIGN'] = sign(ts, method, path, null, null);
  }
  
  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
}

async function main() {
  const symbol = 'BCHUSDT';
  const size = '1';  // Use size=1 for entire position (close all)
  const productType = 'USDT-FUTURES';
  
  // Get current position to find entry price
  const positions = await api('GET', '/api/v2/mix/position/all-position', {
    marginCoin: 'USDT', productType
  });
  
  console.log('Positions response:', JSON.stringify(positions, null, 2).slice(0, 500));
  
  const pos = positions.data?.find(p => p.symbol === symbol && parseFloat(p.total) > 0);
  if (!pos) {
    console.log('No BCHUSDT position found');
    return;
  }
  
  const entry = parseFloat(pos.averageOpenPrice);
  console.log(`Found BCHUSDT position: entry=$${entry}, size=${pos.total}`);
  
  // Calculate TP/SL based on ATR-like volatility (small for BCH)
  const tpPrice = entry * 1.015;  // +1.5%
  const slPrice = entry * 0.990;  // -1.0%
  
  console.log(`Setting TP: $${tpPrice.toFixed(4)}, SL: $${slPrice.toFixed(4)}`);
  
  // Set TP
  const tpRes = await api('POST', '/api/v2/mix/order/place-plan-order', null, {
    symbol, productType,
    marginMode: 'isolated', marginCoin: 'USDT',
    planType: 'normal_plan',
    triggerPrice: tpPrice.toFixed(4),
    triggerType: 'mark_price',
    side: 'sell', tradeSide: 'close',
    orderType: 'market',
    size, holdSide: 'long'
  });
  console.log('TP result:', JSON.stringify(tpRes));
  
  // Set SL
  const slRes = await api('POST', '/api/v2/mix/order/place-plan-order', null, {
    symbol, productType,
    marginMode: 'isolated', marginCoin: 'USDT',
    planType: 'normal_plan',
    triggerPrice: slPrice.toFixed(4),
    triggerType: 'mark_price',
    side: 'sell', tradeSide: 'close',
    orderType: 'market',
    size, holdSide: 'long'
  });
  console.log('SL result:', JSON.stringify(slRes));
}

main().catch(console.error);
