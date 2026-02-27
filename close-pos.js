#!/usr/bin/env node
// Close BCHUSDT position manually
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const CREDS = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-credentials.json', 'utf8'));

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const ts = Date.now().toString();
    let payload = '';
    if (body) payload = JSON.stringify(body);
    
    const signMsg = ts + method + path + payload;
    const signature = crypto.createHmac('sha256', CREDS.secretKey).update(signMsg).digest('base64');
    
    const options = {
      hostname: 'api.bitget.com',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'ACCESS-KEY': CREDS.apiKey,
        'ACCESS-TIMESTAMP': ts,
        'ACCESS-PASSPHRASE': CREDS.passphrase,
        'ACCESS-SIGN': signature
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Close BCHUSDT LONG
  const closeRes = await request('POST', '/api/v2/mix/order/close-positions', {
    symbol: 'BCHUSDT',
    productType: 'USDT-FUTURES',
    marginCoin: 'USDT',
    holdSide: 'long'
  });
  
  console.log('Close result:', JSON.stringify(closeRes));
  
  // Check balance
  const balRes = await request('GET', '/api/v2/mix/account/accounts?productType=USDT-FUTURES');
  console.log('Balance:', balRes.data?.[0]?.available);
}

main().catch(console.error);
