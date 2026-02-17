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
const TOPIC_EVALUATIONS = '25';

// Config
const MIN_SCORE = 7.0;
const POSITION_SIZE = 0.01; // SOL
const STOP_LOSS = -0.15; // -15%
const TAKE_PROFIT = 0.48; // +48%
const SCAN_INTERVAL = 10 * 60 * 1000; // 10 minutes

let wallet, conn;
let activePositions = [];

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
  console.log('🤖 AUTONOMOUS TRADER ONLINE');
  console.log('💰 Balance:', bal, 'SOL');
  console.log('📊 Min Score:', MIN_SCORE);
  console.log('💵 Position Size:', POSITION_SIZE, 'SOL');
  console.log('');
  
  await sendTelegram(`🤖 AUTONOMOUS TRADER ACTIVE

💰 Balance: ${bal} SOL
📊 Min Score: ${MIN_SCORE}/10
💵 Position: ${POSITION_SIZE} SOL
🛑 Stop Loss: -15%
🎯 Take Profit: +48%

Scanning every 10 minutes... 🔍`, TOPIC_POSITIONS);
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
    await executeTrade(best);
    
  } catch (err) {
    console.error('Scan error:', err.message);
  }
}

async function executeTrade(opp) {
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
      stopLoss: entryPrice * (1 + STOP_LOSS),
      takeProfit: entryPrice * (1 + TAKE_PROFIT)
    };
    
    activePositions.push(position);
    
    // Update queue status
    const updatedQueue = JSON.parse(fs.readFileSync("manual-queue.json", "utf8"));
    const queueIndex = updatedQueue.findIndex(q => q.address === opp.address);
    if (queueIndex !== -1) {
      updatedQueue[queueIndex].status = 'executed';
      fs.writeFileSync("manual-queue.json", JSON.stringify(updatedQueue, null, 2));
    }
    
    await sendTelegram(`✅ POSITION OPENED

📊 ${opp.symbol} | ${opp.score}/10
💰 Entry: $${entryPrice}
💵 Size: ${POSITION_SIZE} SOL
🛑 Stop: $${position.stopLoss.toFixed(8)}
🎯 Target: $${position.takeProfit.toFixed(8)}
🔗 TX: ${txid}

Monitoring... 👀`, TOPIC_POSITIONS);
    
  } catch (err) {
    console.error('❌ Trade failed:', err.message);
    await sendTelegram(`❌ TRADE FAILED

Token: ${opp.symbol}
Error: ${err.message}`, TOPIC_POSITIONS);
  }
}

async function monitorPositions() {
  if (activePositions.length === 0) return;
  
  console.log('[Monitor] Checking', activePositions.length, 'position(s)...');
  
  for (const pos of activePositions) {
    try {
      // Fetch current price (simplified - need DexScreener API)
      const currentPrice = pos.entryPrice * 1.05; // TODO: Real price fetch
      const pnl = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      
      console.log(`  ${pos.symbol}: ${pnl.toFixed(2)}%`);
      
      // Check exit conditions
      if (currentPrice <= pos.stopLoss) {
        await exitPosition(pos, currentPrice, 'STOP LOSS');
      } else if (currentPrice >= pos.takeProfit) {
        await exitPosition(pos, currentPrice, 'TAKE PROFIT');
      }
      
    } catch (err) {
      console.error('Monitor error:', pos.symbol, err.message);
    }
  }
}

async function exitPosition(pos, exitPrice, reason) {
  try {
    console.log('');
    console.log('🚪 EXITING:', pos.symbol, '-', reason);
    
    // Swap back to SOL (TODO: implement token → SOL swap)
    // const txid = await swapModule.swap(wallet, pos.address, SOL, tokenAmount);
    
    const pnl = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const profitSOL = pos.size * (pnl / 100);
    
    await sendTelegram(`🚪 POSITION CLOSED - ${reason}

📊 ${pos.symbol}
💰 Entry: $${pos.entryPrice}
💵 Exit: $${exitPrice}
📈 PnL: ${pnl.toFixed(2)}%
💎 Profit: ${profitSOL.toFixed(4)} SOL
⏱️ Duration: ${Math.round((Date.now()-pos.entryTime)/60000)} min`, TOPIC_POSITIONS);
    
    await sendTelegram(`📊 TRADE EVALUATION

${pos.symbol} | ${pnl >= 0 ? '✅ WIN' : '❌ LOSS'}
Entry: $${pos.entryPrice}
Exit: $${exitPrice}
PnL: ${pnl.toFixed(2)}%
Profit: ${profitSOL.toFixed(4)} SOL
Reason: ${reason}`, TOPIC_EVALUATIONS);
    
    // Remove from active
    activePositions = activePositions.filter(p => p.address !== pos.address);
    
  } catch (err) {
    console.error('Exit error:', err.message);
  }
}

async function main() {
  await init();
  
  // Scan immediately
  await scanAndExecute();
  
  // Scan loop
  setInterval(scanAndExecute, SCAN_INTERVAL);
  
  // Monitor loop
  setInterval(monitorPositions, 30000); // Every 30s
}

main().catch(err => console.error('Fatal:', err));
