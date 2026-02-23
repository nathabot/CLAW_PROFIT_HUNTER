// Helius WebSocket - get new token mints

const WebSocket = require('ws');

const WS_URL = 'wss://mainnet.helius-rpc.com/?api-key=1ec339d5-5519-4b6c-9c9f-4f5e5d2b8c2d';

let log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

log('Connecting to Helius WS...');

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  log('Connected! Subscribing to token mints...');
  
  // Subscribe to token mint transactions
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [{
      mentions: ['6EF8rrecthR5Dkzon8Nwu42h6vdjz46kxkUeZ9Vd2EM']
    }, 'confirmed']
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.method === 'notifications') {
      const logs = msg.params?.result?.value?.meta?.logMessages || [];
      if (logs.some(l => l.includes('initializeMint') || l.includes('create'))) {
        log('=== New token activity detected! ===');
      }
    }
  } catch(e) {}
});

ws.on('error', e => log('Error: ' + e.message));
ws.on('close', () => log('Closed'));

setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({jsonrpc:'2.0',id:2,method:'ping'}));
}, 25000);
