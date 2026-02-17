const { Connection, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const fs = require("fs");
const https = require("https");
const swapModule = require("./solana-tracker-swap.js");

const SOL = "So11111111111111111111111111111111111111112";
const TELEGRAM_BOT_TOKEN = "8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU";
const TELEGRAM_CHAT_ID = "-1003212463774";
const SCANNER_TOPIC_ID = "22";
const POSITIONS_TOPIC_ID = "24";

let wallet, conn;
let activePosition = null;
let monitoring = false;

// Autonomous config
const CONFIG = {
  MIN_LIQUIDITY: 15000,  // $30k min
  MIN_VOLUME_24H: 50000, // $50k for high activity
  MAX_AGE_HOURS: 24,     // Focus on fresh tokens (1 day max)
  MIN_PRICE_CHANGE_1H: 3, // At least 3% up in 1h
  MIN_BUY_PRESSURE: 55,   // 55% buy pressure
  TARGET_PROFIT: 0.10,    // 10% TP (conservative for frequent trades)
  STOP_LOSS: 0.08,        // 8% SL (tight for scalping)
  POSITION_SIZE: 0.01,    // 0.01 SOL per trade
  SCAN_INTERVAL: 120000,  // 2 minutes
  MAX_CONCURRENT: 1       // 1 position at a time for scalping
};

async function main() {
  const w = JSON.parse(fs.readFileSync("wallet.json"));
  wallet = Keypair.fromSecretKey(bs58.default ? bs58.default.decode(w.privateKey) : bs58.decode(w.privateKey));
  conn = new Connection("https://api.mainnet-beta.solana.com");
  
  const bal = (await conn.getBalance(wallet.publicKey) / 1e9).toFixed(4);
  console.log("\n🤖 AUTONOMOUS SCALPER");
  console.log("📍", wallet.publicKey.toString());
  console.log("💰", bal, "SOL");
  console.log("\n⚙️ CONFIG:");
  console.log("- Min Liquidity: $" + CONFIG.MIN_LIQUIDITY.toLocaleString());
  console.log("- Target: +" + (CONFIG.TARGET_PROFIT * 100) + "%");
  console.log("- Stop Loss: -" + (CONFIG.STOP_LOSS * 100) + "%");
  console.log("- Position Size: " + CONFIG.POSITION_SIZE + " SOL");
  console.log("- Scan Interval: " + (CONFIG.SCAN_INTERVAL / 1000) + "s\n");
  
  sendTelegram(`🤖 AUTONOMOUS SCALPER ACTIVE

💰 Balance: ${bal} SOL
📊 Strategy: High-frequency scalps
🎯 Target: +${CONFIG.TARGET_PROFIT * 100}%
🛑 Stop: -${CONFIG.STOP_LOSS * 100}%
💧 Min Liq: $${CONFIG.MIN_LIQUIDITY.toLocaleString()}

Bot scanning market every ${CONFIG.SCAN_INTERVAL / 1000}s
Will execute automatically when criteria met! 🚀`, SCANNER_TOPIC_ID);
  
  // Start autonomous scan loop
  while (true) {
    try {
      if (!activePosition) {
        await scanAndExecute();
      } else if (monitoring) {
        await monitorPosition();
      }
    } catch (e) {
      console.log("Error:", e.message);
    }
    
    await sleep(CONFIG.SCAN_INTERVAL);
  }
}

async function scanAndExecute() {
  console.log(`[${new Date().toISOString()}] Scanning...`);
  
  try {
    // Fetch new tokens from DexScreener
    const tokens = await fetchNewTokens();
    
    if (tokens.length === 0) {
      console.log("No candidates found");
      return;
    }
    
    console.log(`Found ${tokens.length} candidates, analyzing...`);
    
    for (const token of tokens) {
      const score = analyzeToken(token);
      
      if (score.pass) {
        console.log(`✅ MATCH: ${token.symbol} (${token.address.slice(0,8)})`);
        console.log(`   Liq: $${token.liquidity} | Vol: $${token.volume24h}`);
        console.log(`   Change 1h: +${token.priceChange1h}% | Buy: ${score.buyPressure}%`);
        
        // EXECUTE
        await executeScalp(token);
        return; // Only one position at a time
      }
    }
    
    console.log("No tokens passed criteria");
    
  } catch (e) {
    console.log("Scan error:", e.message);
  }
}

function analyzeToken(token) {
  const criteria = {
    liquidity: token.liquidity >= CONFIG.MIN_LIQUIDITY,
    volume: token.volume24h >= CONFIG.MIN_VOLUME_24H,
    age: token.ageHours <= CONFIG.MAX_AGE_HOURS,
    priceChange: token.priceChange1h >= CONFIG.MIN_PRICE_CHANGE_1H,
    buyPressure: token.buyPressure >= CONFIG.MIN_BUY_PRESSURE
  };
  
  const pass = Object.values(criteria).every(v => v);
  
  return {
    pass,
    criteria,
    buyPressure: token.buyPressure,
    score: Object.values(criteria).filter(v => v).length
  };
}

async function executeScalp(token) {
  const msg = `🎯 SCALP ENTRY

📊 ${token.symbol}
\`${token.address}\`

💰 Entry: $${token.price}
📦 Size: ${CONFIG.POSITION_SIZE} SOL
💧 Liquidity: $${token.liquidity.toLocaleString()}
📈 Vol 24h: $${token.volume24h.toLocaleString()}
🔥 Change 1h: +${token.priceChange1h}%

🎯 TP: +${CONFIG.TARGET_PROFIT * 100}% 
🛑 SL: -${CONFIG.STOP_LOSS * 100}%

Executing...`;
  
  sendTelegram(msg, POSITIONS_TOPIC_ID);
  
  try {
    // Execute swap via solana-tracker
    const txResult = await swapModule.swap(
      wallet,
      SOL,
      token.address,
      CONFIG.POSITION_SIZE,
      0.15 // 15% slippage for fast execution
    );
    
    if (txResult.success) {
      activePosition = {
        address: token.address,
        symbol: token.symbol,
        entryPrice: token.price,
        entryTime: Date.now(),
        size: CONFIG.POSITION_SIZE,
        targetPrice: token.price * (1 + CONFIG.TARGET_PROFIT),
        stopPrice: token.price * (1 - CONFIG.STOP_LOSS)
      };
      
      monitoring = true;
      
      sendTelegram(`✅ SCALP ENTERED

${token.symbol} executed successfully!
TX: ${txResult.tx}`, POSITIONS_TOPIC_ID);
      
      console.log("✅ Position entered");
    } else {
      sendTelegram(`❌ SCALP FAILED\n\n${token.symbol} execution failed\nReason: ${txResult.error}`, POSITIONS_TOPIC_ID);
    }
    
  } catch (e) {
    sendTelegram(`❌ SCALP ERROR\n\n${token.symbol} error: ${e.message}`, POSITIONS_TOPIC_ID);
  }
}

async function monitorPosition() {
  // TODO: Implement position monitoring (check price, exit on TP/SL)
  console.log("Monitoring position...");
}

async function fetchNewTokens() {
  // TODO: Implement DexScreener API call to fetch new tokens
  // For now return empty
  return [];
}

function sendTelegram(message, topicId) {
  const data = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    message_thread_id: topicId,
    text: message,
    parse_mode: "Markdown"
  });
  
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length
    }
  };
  
  const req = https.request(options);
  req.write(data);
  req.end();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start
main().catch(console.error);
