const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const { exec } = require('child_process');
const fs = require('fs');

const WALLET_PATH = './wallet.json';
const TOKEN_CA = '6jqv9GMLXWsdam62SE63NctxkXND4nZFz97gLcopump';
const POSITION_SOL = 0.005;
const CLAW_AMOUNT = 165784.57;

const TP1_SOL = 0.0065;
const TP2_SOL = 0.0075;
const SL_SOL = 0.00425;

let tp1Executed = false;
let tp2Executed = false;

async function getTokenPrice() {
  return new Promise((resolve) => {
    exec('curl -s "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"', { timeout: 10000 }, async (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      
      try {
        const solPrice = JSON.parse(stdout).solana?.usd || 100;
        
        // Use Birdeye for token price
        const res = await fetch(`https://api.birdeye.so/public/token?address=${TOKEN_CA}`);
        const data = await res.json();
        
        if (data?.data?.price) {
          resolve({
            price: data.data.price,
            solPrice: solPrice
          });
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  });
}

async function sellToken(percent, reason) {
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
  const secretKey = Buffer.from(walletData.secretKey, 'base64');
  const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
  
  const SOLANA_TRACKER_BASE_URL = 'https://swap-v2.solanatracker.io';
  const wsol = 'So11111111111111111111111111111111111111112';
  
  const sellAmount = percent === 'all' ? CLAW_AMOUNT : (CLAW_AMOUNT * (percent/100));
  
  const url = `${SOLANA_TRACKER_BASE_URL}/swap?from=${TOKEN_CA}&to=${wsol}&fromAmount=${sellAmount}&slippage=30&payer=${wallet.publicKey.toString()}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.txn) {
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const txBytes = Uint8Array.from(Buffer.from(data.txn, 'base64'));
      const transaction = VersionedTransaction.deserialize(txBytes);
      transaction.sign([wallet]);
      const signature = await connection.sendTransaction(transaction, { maxRetries: 5 });
      
      console.log(`\n✅ ${reason}!`);
      console.log(`TX: https://solscan.io/tx/${signature}`);
      return true;
    }
  } catch (e) {
    console.error('Sell error:', e.message);
  }
  return false;
}

async function monitor() {
  const ts = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`\n[${ts}] Checking CLAW...`);
  
  const priceData = await getTokenPrice();
  if (!priceData) {
    console.log('⚠️ Price API blocked, skipping...');
    return;
  }
  
  const currentValueSOL = priceData.price * CLAW_AMOUNT / priceData.solPrice;
  const pnl = ((currentValueSOL - POSITION_SOL) / POSITION_SOL) * 100;
  
  console.log(`💰 Price: $${priceData.price.toFixed(6)} | SOL: $${priceData.solPrice}`);
  console.log(`📊 Value: ${currentValueSOL.toFixed(6)} SOL (${pnl.toFixed(2)}%)`);
  
  if (!tp1Executed && currentValueSOL >= TP1_SOL) {
    console.log('\n🎯 TP1 (+30%) REACHED! Selling 50%...');
    await sellToken(50, 'TP1');
    tp1Executed = true;
  }
  
  if (!tp2Executed && currentValueSOL >= TP2_SOL) {
    console.log('\n🎯 TP2 (+50%) REACHED! Selling all...');
    await sellToken('all', 'TP2 - FULL EXIT');
    tp2Executed = true;
    process.exit(0);
  }
  
  if (currentValueSOL <= SL_SOL) {
    console.log('\n🛡️ SL (-15%) HIT! Cutting loss...');
    await sellToken('all', 'SL');
    process.exit(0);
  }
}

console.log('🚀 CLAW Monitor started (30s interval)');
setInterval(monitor, 30000);
monitor();
