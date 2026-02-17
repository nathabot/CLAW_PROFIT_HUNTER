const {Connection,Keypair}=require("@solana/web3.js");
const bs58=require("bs58");
const fs=require("fs");
const https=require("https");
const swapModule=require("./solana-tracker-swap.js");
const {addPosition,checkPositions}=require("./position-tracker.js");

const SOL="So11111111111111111111111111111111111111112";
const TELEGRAM_BOT_TOKEN="8198556074:AAH7BQrFxJEELGvpvhYsD-TBL0XVF5Iyn4w";
const TELEGRAM_CHAT_ID="428798235";
const CHECK_INTERVAL=90000; // 1.5 min

async function main(){
  const w=JSON.parse(fs.readFileSync("wallet.json"));
  const wallet=Keypair.fromSecretKey(bs58.default?bs58.default.decode(w.privateKey):bs58.decode(w.privateKey));
  const conn=new Connection("https://api.mainnet-beta.solana.com");
  
  console.log("\n🎯 MANUAL TRADING MODE");
  console.log("📍",wallet.publicKey.toString());
  const bal=(await conn.getBalance(wallet.publicKey)/1e9).toFixed(4);
  console.log("💰",bal,"SOL\n");
  
  sendTelegram(`🎯 MANUAL TRADING ACTIVE

💰 Balance: ${bal} SOL
📍 Wallet: ${wallet.publicKey.toString().slice(0,8)}...

📝 Commands:
• BUY <token_address> <amount_sol>
• SELL <token_address>
• STATUS
• BALANCE

Position monitoring: Every 1.5min
Auto-sell: +30% profit | -15% stop`);
  
  console.log("✅ Manual trading ready");
  console.log("📱 Send commands via Telegram\n");
  console.log("Format: BUY <token_address> <amount_sol>");
  console.log("Example: BUY EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.01\n");
  
  // Position monitoring loop
  setInterval(async()=>{
    try{
      await checkPositions(wallet,swapModule);
    }catch(e){
      console.log("Position check error:",e.message);
    }
  },CHECK_INTERVAL);
  
  // Poll for commands
  let lastUpdateId=0;
  while(true){
    try{
      const updates=await getTelegramUpdates(lastUpdateId);
      
      for(const update of updates){
        lastUpdateId=Math.max(lastUpdateId,update.update_id+1);
        
        if(!update.message?.text)continue;
        const text=update.message.text.trim();
        
        console.log("📨 Command:",text);
        
        if(text.toUpperCase().startsWith("BUY ")){
          const parts=text.split(" ");
          if(parts.length<3){
            sendTelegram("❌ Format: BUY <token_address> <amount_sol>");
            continue;
          }
          
          const tokenAddr=parts[1];
          const amount=parseFloat(parts[2]);
          
          if(isNaN(amount)||amount<=0){
            sendTelegram("❌ Invalid amount");
            continue;
          }
          
          await executeBuy(wallet,tokenAddr,amount);
        }
        else if(text.toUpperCase().startsWith("SELL ")){
          const parts=text.split(" ");
          if(parts.length<2){
            sendTelegram("❌ Format: SELL <token_address>");
            continue;
          }
          
          const tokenAddr=parts[1];
          await executeSell(wallet,tokenAddr);
        }
        else if(text.toUpperCase()==="STATUS"){
          await showStatus(wallet);
        }
        else if(text.toUpperCase()==="BALANCE"){
          const b=(await conn.getBalance(wallet.publicKey)/1e9).toFixed(4);
          sendTelegram(`💰 Balance: ${b} SOL`);
        }
      }
      
    }catch(e){
      console.log("Poll error:",e.message);
    }
    
    await sleep(3000);
  }
}

async function executeBuy(wallet,tokenAddr,amountSol){
  console.log(`🟢 Buying ${amountSol} SOL of ${tokenAddr.slice(0,8)}...`);
  sendTelegram(`🟢 Executing BUY...
Token: ${tokenAddr.slice(0,12)}...
Amount: ${amountSol} SOL`);
  
  try{
    // Get token info
    const data=await fetchDex(tokenAddr);
    const p=data?.pairs?.[0];
    const tokenSymbol=p?.baseToken?.symbol||"UNKNOWN";
    const price=parseFloat(p?.priceUsd||0);
    
    const sig=await swapModule.swap(wallet,SOL,tokenAddr,Math.floor(amountSol*1e9));
    
    console.log("✅ BUY SUCCESS:",sig);
    
    addPosition(tokenAddr,tokenSymbol,price,amountSol,sig);
    
    sendTelegram(`✅ BOUGHT ${tokenSymbol}
💰 Entry: $${price}
📊 Amount: ${amountSol} SOL
🔗 https://solscan.io/tx/${sig}

Auto-sell active:
• Target: +30%
• Stop: -15%`);
    
  }catch(e){
    console.log("❌ Buy failed:",e.message);
    sendTelegram(`❌ BUY FAILED
Error: ${e.message}`);
  }
}

async function executeSell(wallet,tokenAddr){
  console.log(`🔴 Selling ${tokenAddr.slice(0,8)}...`);
  sendTelegram(`🔴 Executing SELL...
Token: ${tokenAddr.slice(0,12)}...`);
  
  try{
    const positions=JSON.parse(fs.readFileSync("/root/trading-bot/positions.json"));
    const pos=positions[tokenAddr];
    
    if(!pos){
      sendTelegram("❌ Position not found");
      return;
    }
    
    const sig=await swapModule.swap(wallet,tokenAddr,SOL,Math.floor(pos.amountSol*1e9*0.95));
    
    console.log("✅ SELL SUCCESS:",sig);
    
    // Remove position
    delete positions[tokenAddr];
    fs.writeFileSync("/root/trading-bot/positions.json",JSON.stringify(positions,null,2));
    
    sendTelegram(`✅ SOLD ${pos.symbol}
🔗 https://solscan.io/tx/${sig}`);
    
  }catch(e){
    console.log("❌ Sell failed:",e.message);
    sendTelegram(`❌ SELL FAILED
Error: ${e.message}`);
  }
}

async function showStatus(wallet){
  const positions=JSON.parse(fs.readFileSync("/root/trading-bot/positions.json"));
  const keys=Object.keys(positions);
  
  if(keys.length===0){
    sendTelegram("📊 No active positions");
    return;
  }
  
  let msg="📊 POSITIONS:\n\n";
  
  for(const addr of keys){
    const pos=positions[addr];
    
    try{
      const data=await fetchDex(addr);
      const p=data?.pairs?.[0];
      const currentPrice=parseFloat(p?.priceUsd||0);
      const change=((currentPrice-pos.entryPrice)/pos.entryPrice)*100;
      
      msg+=`${pos.symbol}: ${change>0?"+":""}${change.toFixed(1)}%\n`;
      msg+=`  Entry: $${pos.entryPrice}\n`;
      msg+=`  Now: $${currentPrice}\n\n`;
    }catch(e){
      msg+=`${pos.symbol}: Error loading\n\n`;
    }
  }
  
  sendTelegram(msg);
}

function sendTelegram(msg){
  const data=JSON.stringify({chat_id:TELEGRAM_CHAT_ID,text:msg});
  const req=https.request({
    hostname:"api.telegram.org",
    path:`/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method:"POST",
    headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data)}
  },()=>{});
  req.on("error",()=>{});
  req.write(data);
  req.end();
}

function getTelegramUpdates(offset){
  return new Promise((resolve,reject)=>{
    https.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=10`,res=>{
      let d="";
      res.on("data",c=>d+=c);
      res.on("end",()=>{
        try{
          const result=JSON.parse(d);
          resolve(result.result||[]);
        }catch(e){reject(e);}
      });
    }).on("error",reject);
  });
}

function fetchDex(addr){
  return new Promise((r,j)=>{
    https.get(`https://api.dexscreener.com/latest/dex/tokens/${addr}`,res=>{
      let d="";
      res.on("data",c=>d+=c);
      res.on("end",()=>{try{r(JSON.parse(d));}catch(e){j(e);}});
    }).on("error",j);
  });
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

main().catch(console.error);
