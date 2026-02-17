const swapModule = require('./solana-tracker-swap.js');
const {Connection, Keypair} = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const https = require('https');

// SSL BYPASS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SOL = 'So11111111111111111111111111111111111111112';
const TELEGRAM_BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const GROUP_ID = '-1003212463774';
const TOPIC_POSITIONS = '24';

// Config
const MIN_SCORE = 7.0;
const POSITION_SIZE = 0.01; // SOL
const SCAN_INTERVAL = 10 * 60 * 1000; // 10 minutes

let wallet, conn;

async function sendTelegram(msg, topicId) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      chat_id: GROUP_ID,
      text: msg,
      message_thread_id: topicId
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    }, res => {
      res.on('data', ()=>{});
      res.on('end', resolve);
    });
    req.on('error', e => console.log('TG Error:', e.message));
    req.write(data);
    req.end();
  });
}

async function init() {
  const w = JSON.parse(fs.readFileSync('wallet.json'));
  wallet = Keypair.fromSecretKey(bs58.default?bs58.default.decode(w.privateKey):bs58.decode(w.privateKey));
  conn = new Connection('https://api.mainnet-beta.solana.com');
  
  const bal = (await conn.getBalance(wallet.publicKey)/1e9).toFixed(4);
  console.log('🤖 AUTONOMOUS TRADER v2.0 ONLINE');
  console.log('💰 Balance:', bal, 'SOL');
  console.log('📊 Min Score:', MIN_SCORE);
  console.log('💵 Position Size:', POSITION_SIZE, 'SOL');
  console.log('🎯 Exit Strategy: Integrated');
  console.log('');
  
  await sendTelegram(`🤖 AUTONOMOUS TRADER v2.0 ACTIVE

💰 Balance: ${bal} SOL
📊 Min Score: ${MIN_SCORE}/10
💵 Position: ${POSITION_SIZE} SOL
🎯 Exit Strategy: AUTO
  • Stop Loss: -15%
  • Partial Exit: +30% (50%)
  • Full Exit: +48% (50%)

Scanning every 10 minutes... 🔍`, TOPIC_POSITIONS);
}

function loadActivePositions() {
  try {
    if (fs.existsSync('active-positions.json')) {
      return JSON.parse(fs.readFileSync('active-positions.json', 'utf8'));
    }
  } catch (err) {
    console.error('Load positions error:', err.message);
  }
  return [];
}

function saveActivePositions(positions) {
  try {
    fs.writeFileSync('active-positions.json', JSON.stringify(positions, null, 2));
  } catch (err) {
    console.error('Save positions error:', err.message);
  }
}

async function scanAndExecute() {
  try {
    console.log('[' + new Date().toLocaleTimeString() + '] 🔍 Scanning...');
    
    // Read queue
    if (!fs.existsSync('manual-queue.json')) {
      console.log('No queue file');
      return;
    }
    
    const queue = JSON.parse(fs.readFileSync('manual-queue.json', 'utf8'));
    const activePositions = loadActivePositions();
    
    // Filter qualified opportunities
    const qualified = queue.filter(opp => 
      opp.score >= MIN_SCORE && 
      opp.status === 'pending' &&
      !activePositions.find(p => p.address === opp.address)
    );
    
    if (qualified.length === 0) {
      console.log('No qualified opportunities (score ≥' + MIN_SCORE + ')');
      return;
    }
    
    // Execute best opportunity
    const best = qualified.sort((a,b) => b.score - a.score)[0];
    await executeTrade(best, activePositions);
    
  } catch (err) {
    console.error('Scan error:', err.message);
  }
}

async function executeTrade(opp, activePositions) {
  try {
    console.log('');
    console.log('🚀 EXECUTING TRADE');
    console.log('Token:', opp.symbol);
    console.log('Score:', opp.score + '/10');
    console.log('CA:', opp.address);
    console.log('');
    
    const entryPrice = opp.price;
    const entryTime = Date.now();
    
    await sendTelegram(`🚀 OPENING POSITION

📊 Token: ${opp.symbol}
⭐ Score: ${opp.score}/10
💵 Size: ${POSITION_SIZE} SOL
💰 Entry: $${entryPrice}
📝 CA: ${opp.address}

Executing... ⏳`, TOPIC_POSITIONS);
    
    // Execute swap
    const txid = await swapModule.swap(
      wallet,
      SOL,
      opp.address,
      POSITION_SIZE * 1e9
    );
    
    console.log('✅ Trade executed:', txid);
    
    // Track position
    const position = {
      symbol: opp.symbol,
      address: opp.address,
      entryPrice,
      entryTime,
      size: POSITION_SIZE,
      txid,
      partialExited: false,
      score: opp.score
    };
    
    activePositions.push(position);
    saveActivePositions(activePositions);
    
    // Update queue status
    const updatedQueue = JSON.parse(fs.readFileSync('manual-queue.json', 'utf8'));
    const queueIndex = updatedQueue.findIndex(q => q.address === opp.address);
    if (queueIndex !== -1) {
      updatedQueue[queueIndex].status = 'executed';
      fs.writeFileSync('manual-queue.json', JSON.stringify(updatedQueue, null, 2));
    }
    
    const stopLoss = entryPrice * (1 - 0.15);
    const partialTarget = entryPrice * (1 + 0.30);
    const fullTarget = entryPrice * (1 + 0.48);
    
    await sendTelegram(`✅ POSITION OPENED

📊 ${opp.symbol} | ${opp.score}/10
💰 Entry: $${entryPrice.toFixed(8)}
💵 Size: ${POSITION_SIZE} SOL
🛑 Stop: $${stopLoss.toFixed(8)} (-15%)
📊 Partial: $${partialTarget.toFixed(8)} (+30%, exit 50%)
🎯 Full: $${fullTarget.toFixed(8)} (+48%, exit 50%)
🔗 TX: ${txid}

Exit Strategy Module will handle exits automatically! 👀`, TOPIC_POSITIONS);
    
  } catch (err) {
    console.error('❌ Trade failed:', err.message);
    await sendTelegram(`❌ TRADE FAILED

Token: ${opp.symbol}
Error: ${err.message}`, TOPIC_POSITIONS);
  }
}

async function main() {
  await init();
  
  // Scan immediately
  await scanAndExecute();
  
  // Scan loop
  setInterval(scanAndExecute, SCAN_INTERVAL);
}

main().catch(err => console.error('Fatal:', err));
