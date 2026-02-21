/**
 * Exit Retry Module
 * Provides retry mechanism with fallback DEXs for failed sells
 */

const connection = require('@solana/web3.js').Connection;
const { VersionedTransaction } = require('@solana/web3.js');

const SOLANATRACKER_API = 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a';
const JUPITER_API = 'https://public.jupiterapi.com/swap';

/**
 * Execute sell with retry and fallback
 */
async function executeSellWithRetry(ca, fromAmount, payer, connection, maxRetries = 3) {
  const wsol = 'So11111111111111111111111111111111111111112';
  
  // Try order: Solana Tracker → Jupiter → OpenOcean
  const dexes = [
    { name: 'SolanaTracker', url: buildSolanaTrackerUrl(ca, wsol, fromAmount, payer) },
    { name: 'Jupiter', url: buildJupiterUrl(ca, wsol, fromAmount, payer) },
  ];
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const dex of dexes) {
      console.log(`  🔄 Attempt ${attempt}/${maxRetries} - ${dex.name}...`);
      
      try {
        const result = await executeSellSingle(dex.url, connection, payer);
        if (result.success) {
          console.log(`  ✅ Sell SUCCESS via ${dex.name}`);
          return result;
        }
        lastError = result.error;
        console.log(`  ⚠️ ${dex.name} failed: ${result.error}`);
      } catch (e) {
        lastError = e.message;
        console.log(`  ⚠️ ${dex.name} error: ${e.message}`);
      }
    }
    
    // Exponential backoff
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`  ⏳ Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
  
  return { success: false, error: `All ${maxRetries} attempts failed. Last error: ${lastError}` };
}

function buildSolanaTrackerUrl(ca, wsol, fromAmount, payer) {
  return `https://swap-v2.solanatracker.io/swap?from=${ca}&to=${wsol}&fromAmount=${encodeURIComponent(fromAmount)}&slippage=30&payer=${payer}&priorityFee=auto&priorityFeeLevel=high&txVersion=v0`;
}

function buildJupiterUrl(ca, wsol, fromAmount, payer) {
  return `https://public.jupiterapi.com/swap?inputMint=${ca}&outputMint=${wsol}&amount=${fromAmount}&slippage=30&userPublicKey=${payer}`;
}

async function executeSellSingle(url, connection, payer) {
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SOLANATRACKER_API}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    if (data.error) return { success: false, error: data.error };
    
    const txBuf = Buffer.from(data.txn, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    
    // Sign with wallet - will be passed in
    // Note: Caller must sign the transaction
    
    return { 
      success: true, 
      tx: transaction,
      data 
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Mark position as pending sell BEFORE actually selling
 */
function markPositionPendingSell(positionsFile, symbol) {
  const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
  const pos = positions.find(p => p.symbol === symbol && !p.exited);
  
  if (pos) {
    pos.exited = true;
    pos.exitTime = Date.now();
    pos.exitType = 'PENDING_SELL';
    pos.exitPrice = 'PENDING';
    pos.pnlPercent = 0; // Will be calculated after sell
    
    fs.writeFileSync(positionsFile, JSON.stringify(positions, null, 2));
    console.log(`  📝 Marked ${symbol} as PENDING_SELL`);
    return pos;
  }
  return null;
}

/**
 * Mark position as fully exited after sell success
 */
function markPositionExited(positionsFile, symbol, exitPrice, pnlPercent, exitTx, exitType = 'TAKE_PROFIT') {
  const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
  const pos = positions.find(p => p.symbol === symbol && p.exitType === 'PENDING_SELL');
  
  if (pos) {
    pos.exitPrice = exitPrice;
    pos.pnlPercent = pnlPercent;
    pos.exitTxHash = exitTx;
    pos.exitType = exitType;
    
    fs.writeFileSync(positionsFile, JSON.stringify(positions, null, 2));
    console.log(`  ✅ ${symbol} marked as ${exitType}, PnL: ${pnlPercent}%`);
    return pos;
  }
  return null;
}

/**
 * Mark position as failed sell
 */
function markPositionFailed(positionsFile, symbol, pnlPercent = -100) {
  const positions = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
  const pos = positions.find(p => p.symbol === symbol && p.exitType === 'PENDING_SELL');
  
  if (pos) {
    pos.exitPrice = 'FAILED';
    pos.pnlPercent = pnlPercent;
    pos.exitType = 'SELL_FAILED';
    
    fs.writeFileSync(positionsFile, JSON.stringify(positions, null, 2));
    console.log(`  ❌ ${symbol} marked as SELL_FAILED, PnL: ${pnlPercent}%`);
    return pos;
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  executeSellWithRetry,
  markPositionPendingSell,
  markPositionExited,
  markPositionFailed
};
