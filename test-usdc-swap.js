#!/usr/bin/env node
/**
 * USDC SWAP TEST
 * Buy and immediately sell USDC to verify swap execution
 */

const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const bs58 = require('bs58');
const JupiterSwapExecutorV2 = require('./jupiter-swap-executor-v2');

const CONFIG = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  WSOL: 'So11111111111111111111111111111111111111112',
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
  WALLET_PATH: '/root/trading-bot/wallet.json',
  JUPITER_CONFIG: '/root/trading-bot/jupiter-config.json',
  TEST_AMOUNT_SOL: 0.01,  // Small test amount
  SLIPPAGE: 10
};

const BOT_TOKEN = '8295470573:AAEfp_o-I2FEOaQcfMeHHbWce54WTNHBwCE';
const CHAT_ID = '428798235';

async function notify(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: CHAT_ID, 
        text: msg, 
        parse_mode: 'Markdown' 
      })
    });
  } catch (e) {}
}

async function test() {
  console.log('🧪 USDC SWAP TEST STARTING...\n');
  console.log('='.repeat(60));
  
  // Load wallet
  console.log('🔑 Loading wallet...');
  let wallet;
  try {
    const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
    // Handle different wallet formats
    if (walletData.privateKey) {
      // Base58 encoded key
      const bs58mod = require('bs58');
      const bs58 = bs58mod.default || bs58mod;
      const secretKey = bs58.decode(walletData.privateKey);
      wallet = Keypair.fromSecretKey(secretKey);
    } else if (Array.isArray(walletData)) {
      // Array format
      wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
    } else {
      // Direct array in JSON
      wallet = Keypair.fromSecretKey(new Uint8Array(Object.values(walletData)));
    }
    console.log(`✅ Wallet: ${wallet.publicKey.toString()}`);
  } catch (e) {
    console.error('❌ Failed to load wallet:', e.message);
    process.exit(1);
  }
  
  // Load Jupiter config
  let apiKey;
  try {
    const jupConfig = JSON.parse(fs.readFileSync(CONFIG.JUPITER_CONFIG, 'utf8'));
    apiKey = jupConfig.apiKey;
    console.log(`✅ Jupiter API: ${apiKey.slice(0, 10)}...`);
  } catch (e) {
    console.error('❌ Failed to load Jupiter config:', e.message);
    process.exit(1);
  }
  
  // Setup connection and executor
  const connection = new Connection(CONFIG.RPC);
  const swapExecutor = new JupiterSwapExecutorV2(connection, CONFIG.WALLET_PATH, '/root/trading-bot/jupiter-api-pool.json');
  
  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  
  if (balance < CONFIG.TEST_AMOUNT_SOL * 1.5 * 1e9) {
    console.error(`❌ Insufficient balance. Need ${CONFIG.TEST_AMOUNT_SOL * 1.5} SOL`);
    process.exit(1);
  }
  
  // === STEP 1: BUY USDC ===
  console.log('\n' + '='.repeat(60));
  console.log('🛒 STEP 1: BUYING USDC');
  console.log('='.repeat(60));
  
  await notify(`🧪 *USDC SWAP TEST*\n\nStep 1: Buying USDC with ${CONFIG.TEST_AMOUNT_SOL} SOL...`);
  
  const buyResult = await swapExecutor.executeBuy(
    CONFIG.USDC, 
    CONFIG.TEST_AMOUNT_SOL, 
    CONFIG.SLIPPAGE
  );
  
  if (!buyResult.success) {
    console.error('❌ BUY FAILED:', buyResult.error);
    await notify(`❌ *BUY FAILED*\n\n${buyResult.error}`);
    process.exit(1);
  }
  
  console.log(`✅ BUY SUCCESS!`);
  console.log(`   Tx: ${buyResult.signature}`);
  console.log(`   Got: ${buyResult.expectedOutput} USDC`);
  console.log(`   Impact: ${buyResult.price}%`);
  
  await notify(
    `✅ *BUY SUCCESS*\n\n` +
    `Spent: ${CONFIG.TEST_AMOUNT_SOL} SOL\n` +
    `Got: ${buyResult.expectedOutput} USDC\n` +
    `Impact: ${buyResult.price}%\n\n` +
    `🔗 [View on Solscan](https://solscan.io/tx/${buyResult.signature})`
  );
  
  // Wait a moment
  console.log('\n⏳ Waiting 3 seconds before selling...');
  await new Promise(r => setTimeout(r, 3000));
  
  // === STEP 2: SELL USDC ===
  console.log('\n' + '='.repeat(60));
  console.log('💵 STEP 2: SELLING USDC');
  console.log('='.repeat(60));
  
  await notify(`💵 *Step 2: Selling ${buyResult.expectedOutput} USDC back to SOL...*`);
  
  const sellResult = await swapExecutor.executeSell(
    CONFIG.USDC,
    buyResult.expectedOutput,
    CONFIG.SLIPPAGE
  );
  
  if (!sellResult.success) {
    console.error('❌ SELL FAILED:', sellResult.error);
    await notify(`❌ *SELL FAILED*\n\n${sellResult.error}\n\n⚠️ You now hold ${buyResult.expectedOutput} USDC`);
    process.exit(1);
  }
  
  console.log(`✅ SELL SUCCESS!`);
  console.log(`   Tx: ${sellResult.signature}`);
  console.log(`   Got: ${sellResult.outputAmount.toFixed(6)} SOL`);
  
  // Calculate PnL
  const pnl = sellResult.outputAmount - CONFIG.TEST_AMOUNT_SOL;
  const pnlPercent = (pnl / CONFIG.TEST_AMOUNT_SOL) * 100;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`   Started: ${CONFIG.TEST_AMOUNT_SOL} SOL`);
  console.log(`   Ended:   ${sellResult.outputAmount.toFixed(6)} SOL`);
  console.log(`   PnL:     ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} SOL (${pnlPercent.toFixed(2)}%)`);
  console.log(`   Fees:    ~${(Math.abs(pnl)).toFixed(6)} SOL`);
  console.log('='.repeat(60));
  
  await notify(
    `✅ *SELL SUCCESS - TEST COMPLETE!*\n\n` +
    `📊 *Results:*\n` +
    `Started: ${CONFIG.TEST_AMOUNT_SOL} SOL\n` +
    `Ended: ${sellResult.outputAmount.toFixed(6)} SOL\n` +
    `PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} SOL\n\n` +
    `🔗 [Sell Tx](https://solscan.io/tx/${sellResult.signature})\n\n` +
    `✅ Swap execution verified!`
  );
  
  console.log('\n🎉 USDC SWAP TEST COMPLETE!');
  console.log('✅ Jupiter swap execution is working!');
}

test().catch(e => {
  console.error('💥 Test crashed:', e);
  process.exit(1);
});
