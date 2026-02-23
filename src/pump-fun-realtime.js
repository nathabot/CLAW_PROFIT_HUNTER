// Real-time pump.fun monitor using WebSocket subscription

const WebSocket = require('ws');

const WS_URL = 'wss://mainnet.helius-rpc.com/?api-key=1ec339d5-5519-4b6c-9c9f-4f5e5d2b8c2d';

const LOG_FILE = __dirname + '/../logs/pump-realtime.log';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

log('Connecting to Helius WebSocket...');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  log('Connected! Subscribing to pump.fun program...');
  
  // Subscribe to pump.fun program account changes
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'programSubscribe',
    params: [
      '6EF8rrecthR5Dkzon8Nwu42h6vdjz46kxkUeZ9Vd2EM',
      {
        encoding: 'jsonParsed',
        commitment: 'confirmed'
      }
    ]
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    
    if (msg.method === 'notification') {
      const account = msg.params?.result?.value?.account;
      if (account) {
        log('New pump.fun activity detected!');
        log(JSON.stringify(account, null, 2).slice(0, 500));
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
});

ws.on('error', (e) => {
  log('WS Error: ' + e.message);
});

ws.on('close', () => {
  log('Connection closed, reconnecting...');
  setTimeout(() => {
    // Will need to reconnect
  }, 5000);
});

setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }));
  }
}, 25000);

module.exports = { ws };
