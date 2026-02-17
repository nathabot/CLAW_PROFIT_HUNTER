#!/usr/bin/env node
/**
 * TEST SOLANA TRACKER SWAP
 * Buy and sell USDC using Solana Tracker API
 */

const { Connection, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const bs58 = require('bs58');
const SolanaTrackerExecutor = require('./solana-tracker-executor');

const CONFIG = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  WSOL: 'So11111111111111111111111111111111111111112',
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
  WALLET_PATH: '/root/trading-bot/wallet.json',
  API_KEY: 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a',
  TEST_AMOUNT_SOL: 0.01
};

const BOT_TOKEN = '8295470573:AAEfp_o-I2FEOaQcfMeHHbWce54WTNHBwCE';
const CHAT_ID = '428798235';

async function notify(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
  } catch (e) {}
}

async function test() {
  console.log('🧪 SOLANA TRACKER SWAP TEST');
  console.log('=' .repeat(60));
  
  // Load wallet
  console.log('🔑 Loading wallet...');
  const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
  const bs58lib = bs58.default || bs58;
  const secretKey = bs58lib.decode(walletData.privateKey);
  const wallet = Keypair.fromSecretKey(secretKey);
  console.log(`✅ Wallet: ${wallet.publicKey.toString()}`);
  
  // Setup
  const connection = new Connection(CONFIG.RPC);
  const executor = new SolanaTrackerExecutor(CONFIG.API_KEY, connection, wallet);
  
  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`);
  
  if (balance < CONFIG.TEST_AMOUNT_SOL * 1.5 * 1e9) {
    console.error(`❌ Insufficient balance`);
    process.exit(1);
  }
  
  // Test honeypot check first
  console.log('\n🔒 Testing honeypot check for USDC...');
  const honeypot = await executor.honeypotCheck(CONFIG.USDC);
  console.log(`   Result: ${honeypot.safe ? '✅ SAFE' : '❌ UNSAFE'} - ${honeypot.reason}`);
  
  // === BUY ===
  console.log('\n' + '='.repeat(60));
  console.log('🛒 STEP 1: BUY USDC');
  console.log('='.repeat(60));
  
  await notify(`🧪 *Solana Tracker Test*\n\nStep 1: Buying USDC with ${CONFIG.TEST_AMOUNT_SOL} SOL...`);
  
  const buyResult = await executor.executeBuy(CONFIG.USDC, CONFIG.TEST_AMOUNT_SOL, 10);
  
  if (!buyResult.success) {
    console.error('❌ BUY FAILED:', buyResult.error);
    await notify(`❌ *BUY FAILED*\n\n${buyResult.error}`);
    process.exit(1);
  }
  
  console.log(`✅ BUY SUCCESS!`);
  console.log(`   Tx: ${buyResult.signature}`);
  console.log(`   Platform: ${buyResult.platform}`);
  console.log(`   Expected: ${buyResult.expectedOutput} USDC`);
  
  await notify(`✅ *BUY SUCCESS*\n\nSpent: ${CONFIG.TEST_AMOUNT_SOL} SOL\nPlatform: ${buyResult.platform}\nExpected: ${buyResult.expectedOutput} USDC\n\n🔗 [View](https://solscan.io/tx/${buyResult.signature})`);
  
  // Wait
  console.log('\n⏳ Waiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  
  // === SELL ===
  console.log('\n' + '='.repeat(60));
  console.log('💵 STEP 2: SELL USDC');
  console.log('='.repeat(60));
  
  // Calculate USDC amount in base units (6 decimals)
  const usdcAmount = Math.floor(buyResult.expectedOutput * 1000000); // 6 decimals for USDC
  
  await notify(`💵 *Step 2: Selling ${buyResult.expectedOutput} USDC...*`);
  
  const sellResult = await executor.executeSell(CONFIG.USDC, usdcAmount, 10);
  
  if (!sellResult.success) {
    console.error('❌ SELL FAILED:', sellResult.error);
    await notify(`❌ *SELL FAILED*\n\n${sellResult.error}`);
    process.exit(1);
  }
  
  console.log(`✅ SELL SUCCESS!`);
  console.log(`   Tx: ${sellResult.signature}`);
  console.log(`   Got: ${sellResult.outputAmount.toFixed(6)} SOL`);
  
  // Calculate
  const pnl = sellResult.outputAmount - CONFIG.TEST_AMOUNT_SOL;
  const pnlPercent = (pnl / CONFIG.TEST_AMOUNT_SOL) * 100;
  
  console.log('\n📊 RESULTS');
  console.log(`   Started: ${CONFIG.TEST_AMOUNT_SOL} SOL`);
  console.log(`   Ended: ${sellResult.outputAmount.toFixed(6)} SOL`);
  console.log(`   PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} SOL (${pnlPercent.toFixed(2)}%)`);
  
  await notify(
    `✅ *SELL SUCCESS - TEST COMPLETE!*\n\n` +
    `📊 Results:\n` +
    `Started: ${CONFIG.TEST_AMOUNT_SOL} SOL\n` +
    `Ended: ${sellResult.outputAmount.toFixed(6)} SOL\n` +
    `PnL: ${pnl > 0 ? '+' : ''}${pnl.toFixed(6)} SOL\n\n` +
    `🔗 [Sell Tx](https://solscan.io/tx/${sellResult.signature})\n\n` +
    `✅ Solana Tracker working! Jupiter bypass successful!`
  );
  
  console.log('\n🎉 SOLANA TRACKER TEST COMPLETE!');
}

test().catch(e => {
  console.error('💥 Test crashed:', e);
  process.exit(1);
});
