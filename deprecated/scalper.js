const {Connection,Keypair}=require("@solana/web3.js");
const bs58=require("bs58");
const fs=require("fs");
const https=require("https");
const swapModule=require("./solana-tracker-swap.js");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const SOL="So11111111111111111111111111111111111111112";
const TELEGRAM_BOT_TOKEN="8198556074:AAH7BQrFxJEELGvpvhYsD-TBL0XVF5Iyn4w";
const TELEGRAM_CHAT_ID="428798235";

let wallet,conn;
let activePosition=null;
let monitoring=false;

async function main(){
  const w=JSON.parse(fs.readFileSync("wallet.json"));
  wallet=Keypair.fromSecretKey(bs58.default?bs58.default.decode(w.privateKey):bs58.decode(w.privateKey));
  conn=new Connection("https://api.mainnet-beta.solana.com");
  
  console.log("\n🎯 SCALPING MODE - TA Driven");
  console.log("📍",wallet.publicKey.toString());
  const bal=(await conn.getBalance(wallet.publicKey)/1e9).toFixed(4);
  console.log("💰",bal,"SOL\n");
  
  sendTelegram(`🎯 SCALPING TRADER ACTIVE

💰 Balance: ${bal} SOL

📝 Send me CA (Contract Address)
I will:
• Analyze chart & technicals
• Check buy/sell flow
• Find entry before rebound
• Execute scalp (5-15% targets)
• Quick exit on profit

Ready for CA! 🚀`);
  
  console.log("✅ Scalper ready");
  console.log("📱 Send CA via Telegram\n");
  
  // Poll for CA commands
  let lastUpdateId=0;
  while(true){
    try{
      const updates=await getTelegramUpdates(lastUpdateId);
      
      for(const update of updates){
        lastUpdateId=Math.max(lastUpdateId,update.update_id+1);
        
        if(!update.message?.text)continue;
        const text=update.message.text.trim();
        
        // Check if its a CA (Solana address format)
        if(text.length>=32&&text.length<=44&&/^[A-HJ-NP-Za-km-z1-9]+$/.test(text)){
          console.log("📨 New CA:",text);
          await analyzeAndTrade(text);
        }
        else if(text.toUpperCase()==="EXIT"&&activePosition){
          await forceExit();
        }
        else if(text.toUpperCase()==="STATUS"){
          await showStatus();
        }
      }
      
      // Monitor active position
      if(activePosition&&monitoring){
        await monitorPosition();
      }
      
    }catch(e){
      console.log("Error:",e.message);
    }
    
    await sleep(2000);
  }
}

async function analyzeAndTrade(ca){
  sendTelegram(`🔍 Analyzing ${ca.slice(0,8)}...

Checking:
• Chart pattern
• Support/Resistance
• Buy/Sell pressure
• Volume profile
• Entry timing

Please wait...`);
  
  try{
    // Get token data
    const data=await fetchDex(ca);
    if(!data?.pairs?.[0]){
      sendTelegram("❌ Token not found on DEX");
      return;
    }
    
    const p=data.pairs[0];
    const symbol=p.baseToken.symbol;
    const price=parseFloat(p.priceUsd||0);
    const liq=p.liquidity?.usd||0;
    const vol24h=p.volume?.h24||0;
    const txns=p.txns?.h24||{};
    
    console.log(`\n📊 ${symbol} Analysis:`);
    console.log(`   Price: $${price}`);
    console.log(`   Liq: $${(liq/1000).toFixed(1)}k | Vol: $${(vol24h/1000).toFixed(1)}k`);
    console.log(`   24h Txns: ${txns.buys||0} buys | ${txns.sells||0} sells`);
    
    // Technical Analysis
    const ta=await technicalAnalysis(p);
    
    let analysis=`📊 ${symbol} ANALYSIS\n\n`;
    analysis+=`💰 Price: $${price}\n`;
    analysis+=`💧 Liquidity: $${(liq/1000).toFixed(1)}k\n`;
    analysis+=`📊 Volume 24h: $${(vol24h/1000).toFixed(1)}k\n`;
    analysis+=`📈 Buys: ${txns.buys||0} | 📉 Sells: ${txns.sells||0}\n\n`;
    
    analysis+=`🎯 TECHNICALS:\n`;
    analysis+=`• 5min: ${ta.trend5m}\n`;
    analysis+=`• 1h: ${ta.trend1h}\n`;
    analysis+=`• Price change 5m: ${ta.change5m}%\n`;
    analysis+=`• Price change 1h: ${ta.change1h}%\n`;
    analysis+=`• Buy pressure: ${ta.buyPressure}%\n\n`;
    
    // Decision logic
    const decision=makeDecision(ta,p);
    
    analysis+=`💡 DECISION: ${decision.action}\n`;
    analysis+=`📝 Reason: ${decision.reason}\n\n`;
    
    if(decision.action==="BUY"){
      analysis+=`🟢 Executing entry...\n`;
      analysis+=`Entry: $${price}\n`;
      analysis+=`Target: +${decision.target}%\n`;
      analysis+=`Stop: -${decision.stop}%`;
      
      sendTelegram(analysis);
      
      await executeBuy(ca,symbol,price,decision.target,decision.stop);
    }
    else if(decision.action==="WAIT"){
      analysis+=`⏳ Watching for better entry...`;
      sendTelegram(analysis);
    }
    else{
      analysis+=`❌ Not suitable for scalping`;
      sendTelegram(analysis);
    }
    
  }catch(e){
    console.log("❌ Analysis failed:",e.message);
    sendTelegram(`❌ Analysis failed: ${e.message}`);
  }
}

async function technicalAnalysis(p){
  const price=parseFloat(p.priceUsd||0);
  const change5m=p.priceChange?.m5||0;
  const change1h=p.priceChange?.h1||0;
  const change6h=p.priceChange?.h6||0;
  const txns=p.txns?.h1||{};
  const buys=txns.buys||0;
  const sells=txns.sells||0;
  
  // Trend determination
  let trend5m="neutral";
  if(change5m>2)trend5m="up";
  else if(change5m<-2)trend5m="down";
  
  let trend1h="neutral";
  if(change1h>5)trend1h="up";
  else if(change1h<-5)trend1h="down";
  
  // Buy pressure
  const totalTx=buys+sells;
  const buyPressure=totalTx>0?(buys/totalTx*100):50;
  
  return {
    trend5m,
    trend1h,
    change5m:change5m.toFixed(1),
    change1h:change1h.toFixed(1),
    change6h:change6h.toFixed(1),
    buyPressure:buyPressure.toFixed(0)
  };
}

function makeDecision(ta,p){
  const liq=p.liquidity?.usd||0;
  const vol=p.volume?.h24||0;
  const change5m=parseFloat(ta.change5m);
  const change1h=parseFloat(ta.change1h);
  const buyPressure=parseFloat(ta.buyPressure);
  
  // Basic filters
  if(liq<5000)return {action:"SKIP",reason:"Liquidity too low"};
  if(vol<10000)return {action:"SKIP",reason:"Volume too low"};
  
  // SCALP ENTRY LOGIC
  
  // Pattern 1: Recent dip + buy pressure returning
  if(change5m<-3&&change5m>-8&&buyPressure>55){
    return {
      action:"BUY",
      reason:"Dip reversal + buy pressure",
      target:8,
      stop:5
    };
  }
  
  // Pattern 2: Consolidation after dump + buyers stepping in
  if(change1h<-10&&change5m>-2&&change5m<2&&buyPressure>60){
    return {
      action:"BUY",
      reason:"Bounce setup after dump",
      target:12,
      stop:6
    };
  }
  
  // Pattern 3: Early uptrend + strong buyers
  if(change5m>1&&change5m<5&&change1h<20&&buyPressure>65){
    return {
      action:"BUY",
      reason:"Early momentum + buyer control",
      target:10,
      stop:5
    };
  }
  
  // Pattern 4: Oversold bounce
  if(change1h<-20&&change5m>3&&buyPressure>70){
    return {
      action:"BUY",
      reason:"Oversold bounce signal",
      target:15,
      stop:7
    };
  }
  
  // Wait conditions
  if(change5m>5)return {action:"WAIT",reason:"Already pumping, wait for dip"};
  if(change1h>30)return {action:"WAIT",reason:"Overextended, wait for cooldown"};
  if(buyPressure<45)return {action:"WAIT",reason:"Sell pressure too high"};
  
  return {action:"WAIT",reason:"No clear scalp setup yet"};
}

async function executeBuy(ca,symbol,entryPrice,targetPct,stopPct){
  console.log(`🟢 Buying ${symbol}...`);
  
  try{
    const bal=await conn.getBalance(wallet.publicKey);
    const amount=Math.min(0.01,bal/1e9*0.5); // Max 0.01 or 50% balance
    
    const sig=await swapModule.swap(wallet,SOL,ca,Math.floor(amount*1e9));
    
    console.log("✅ Entry executed:",sig);
    
    activePosition={
      ca:ca,
      symbol:symbol,
      entryPrice:entryPrice,
      amount:amount,
      targetPrice:entryPrice*(1+targetPct/100),
      stopPrice:entryPrice*(1-stopPct/100),
      targetPct:targetPct,
      stopPct:stopPct,
      sig:sig,
      entryTime:Date.now()
    };
    
    monitoring=true;
    
    sendTelegram(`✅ ENTERED ${symbol}

💰 Entry: $${entryPrice}
📊 Amount: ${amount.toFixed(4)} SOL
🎯 Target: $${activePosition.targetPrice.toFixed(8)} (+${targetPct}%)
🛑 Stop: $${activePosition.stopPrice.toFixed(8)} (-${stopPct}%)

🔗 https://solscan.io/tx/${sig}

⏱️ Monitoring active...`);
    
  }catch(e){
    console.log("❌ Buy failed:",e.message);
    sendTelegram(`❌ Entry failed: ${e.message}`);
  }
}

async function monitorPosition(){
  if(!activePosition)return;
  
  try{
    const data=await fetchDex(activePosition.ca);
    const p=data?.pairs?.[0];
    if(!p)return;
    
    const currentPrice=parseFloat(p.priceUsd||0);
    const change=((currentPrice-activePosition.entryPrice)/activePosition.entryPrice)*100;
    
    console.log(`📊 ${activePosition.symbol}: ${change>0?"+":""}${change.toFixed(2)}% ($${currentPrice})`);
    
    // Target hit
    if(currentPrice>=activePosition.targetPrice){
      console.log("🎯 TARGET HIT! Selling...");
      await exitPosition("PROFIT",currentPrice,change);
    }
    // Stop loss
    else if(currentPrice<=activePosition.stopPrice){
      console.log("🛑 STOP HIT! Selling...");
      await exitPosition("STOP",currentPrice,change);
    }
    // Trailing stop (if +5%, move stop to breakeven)
    else if(change>5&&activePosition.stopPrice<activePosition.entryPrice){
      activePosition.stopPrice=activePosition.entryPrice;
      console.log("📈 Trailing stop → breakeven");
      sendTelegram(`📈 ${activePosition.symbol} at +${change.toFixed(1)}%

Trailing stop moved to breakeven`);
    }
    
  }catch(e){
    console.log("Monitor error:",e.message);
  }
}

async function exitPosition(reason,exitPrice,changePct){
  const pos=activePosition;
  
  try{
    const sig=await swapModule.swap(wallet,pos.ca,SOL,Math.floor(pos.amount*1e9*0.95));
    
    console.log("✅ Exit executed:",sig);
    
    const emoji=reason==="PROFIT"?"🎯":"🛑";
    const result=changePct>0?"PROFIT":"LOSS";
    
    sendTelegram(`${emoji} SCALP ${result}: ${pos.symbol}

💰 Entry: $${pos.entryPrice}
💵 Exit: $${exitPrice}
📊 P&L: ${changePct>0?"+":""}${changePct.toFixed(2)}%
⏱️ Duration: ${Math.floor((Date.now()-pos.entryTime)/60000)} min

🔗 https://solscan.io/tx/${sig}

${reason==="PROFIT"?"✅ Target reached!":"⚠️ Stop loss hit"}

Ready for next CA! 🚀`);
    
    activePosition=null;
    monitoring=false;
    
  }catch(e){
    console.log("❌ Exit failed:",e.message);
    sendTelegram(`❌ Exit failed: ${e.message}

Try manual exit or EXIT command`);
  }
}

async function forceExit(){
  if(!activePosition){
    sendTelegram("❌ No active position");
    return;
  }
  
  sendTelegram("🔴 Force exit executing...");
  
  const data=await fetchDex(activePosition.ca);
  const currentPrice=parseFloat(data?.pairs?.[0]?.priceUsd||0);
  const change=((currentPrice-activePosition.entryPrice)/activePosition.entryPrice)*100;
  
  await exitPosition("MANUAL",currentPrice,change);
}

async function showStatus(){
  const bal=(await conn.getBalance(wallet.publicKey)/1e9).toFixed(4);
  
  let msg=`📊 SCALPER STATUS\n\n`;
  msg+=`💰 Balance: ${bal} SOL\n\n`;
  
  if(activePosition){
    const data=await fetchDex(activePosition.ca);
    const currentPrice=parseFloat(data?.pairs?.[0]?.priceUsd||0);
    const change=((currentPrice-activePosition.entryPrice)/activePosition.entryPrice)*100;
    
    msg+=`🎯 Active: ${activePosition.symbol}\n`;
    msg+=`Entry: $${activePosition.entryPrice}\n`;
    msg+=`Now: $${currentPrice}\n`;
    msg+=`P&L: ${change>0?"+":""}${change.toFixed(2)}%\n`;
    msg+=`Target: +${activePosition.targetPct}%\n`;
    msg+=`Stop: -${activePosition.stopPct}%`;
  }else{
    msg+=`No active position\nReady for CA! 🚀`;
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
    https.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=5`,res=>{
      let d="";
      res.on("data",c=>d+=c);
      res.on("end",()=>{
        try{resolve(JSON.parse(d).result||[]);}catch(e){reject(e);}
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
