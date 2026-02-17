#!/usr/bin/env node
/**
 * POSITION EXIT MONITOR v5.0
 * Monitors active positions and executes sell at TP/SL
 * Prevents double orders, ensures timely exits
 */

const fetch = require('node-fetch');
const fs = require('fs');
const { Connection, PublicKey, Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');

const CONFIG = {
  RPC: 'https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304',
  WALLET_PATH: '/root/trading-bot/wallet.json',
  POSITIONS_FILE: '/root/trading-bot/positions.json',
  STATE_FILE: '/root/trading-bot/monitor-state.json',
  CHECK_INTERVAL: 5000, // Check every 5 seconds
  SOLANA_TRACKER_API_KEY: 'af3eb8ef-de7c-469f-a6d6-30b6c4c11f2a'
};

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';
const TOPIC_POSITIONS = 24;
const TOPIC_EVALUATIONS = 25;

class ExitMonitor {
  constructor() {
    this.connection = new Connection(CONFIG.RPC);
    this.loadWallet();
    this.activePositions = [];
    this.checkCount = 0;
  }

  loadWallet() {
    try {
      const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH, 'utf8'));
      if (walletData.privateKey) {
        const bs58lib = bs58.default || bs58;
        const secretKey = bs58lib.decode(walletData.privateKey);
        this.wallet = Keypair.fromSecretKey(secretKey);
      } else {
        this.wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
      }
      console.log(`🔑 Wallet loaded: ${this.wallet.publicKey.toString().substring(0, 20)}...`);
    } catch (e) {
      console.error('❌ Failed to load wallet:', e.message);
      process.exit(1);
    }
  }

  loadPositions() {
    try {
      if (fs.existsSync(CONFIG.POSITIONS_FILE)) {
        this.activePositions = JSON.parse(fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8'));
      } else if (fs.existsSync(CONFIG.STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
        this.activePositions = (state.positions || state.trades || [])
          .map(item => item.pos || item)
          .filter(pos => !pos.exited);
      } else {
        this.activePositions = [];
      }
    } catch (e) {
      console.log('⚠️  Error loading positions:', e.message);
      this.activePositions = [];
    }
  }

  savePositions() {
    try {
      fs.writeFileSync(CONFIG.POSITIONS_FILE, JSON.stringify(this.activePositions, null, 2));
    } catch (e) {
      console.log('⚠️  Error saving positions:', e.message);
    }
  }

  async getCurrentPrice(tokenCA) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`);
      const data = await response.json();
      return parseFloat(data.pairs?.[0]?.priceUsd || 0);
    } catch (e) {
      return 0;
    }
  }

  async executeSell(position, percent = '100%') {
    try {
      console.log(`\n💰 EXECUTING SELL: ${position.symbol || position.ca}`);
      console.log(`   Amount: ${percent}`);
      
      const url = `https://swap-v2.solanatracker.io/swap`;
      const body = {
        from: position.address || position.ca,
        to: 'So11111111111111111111111111111111111111112', // SOL
        fromAmount: percent,
        slippage: 15,
        payer: this.wallet.publicKey.toString(),
        priorityFee: 0.0005,
        fee: 300
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CONFIG.SOLANA_TRACKER_API_KEY
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      
      if (!data.txn) {
        throw new Error('No transaction data received');
      }

      // Sign and send transaction
      const txBuffer = Buffer.from(data.txn, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);
      transaction.sign([this.wallet]);

      const signature = await this.connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3
      });

      await this.connection.confirmTransaction(signature, 'confirmed');

      console.log(`   ✅ Signature: ${signature}`);
      return { success: true, signature };
    } catch (e) {
      console.log(`   ❌ Sell failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  async sendTelegram(message, topic = TOPIC_POSITIONS) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_thread_id: topic,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {
      console.log('Telegram error:', e.message);
    }
  }

  async checkPosition(position) {
    const currentPrice = await this.getCurrentPrice(position.address || position.ca);
    
    if (currentPrice === 0) {
      console.log(`⚠️  Failed to get price for ${position.symbol || position.ca}`);
      return false;
    }

    const entryPrice = position.entryPrice || position.price;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // Get dynamic TP/SL from position or use defaults
    const tp1 = position.tp1 || position.takeProfit1Percent || 10;
    const tp2 = position.tp2 || position.takeProfit2Percent || 20;
    const sl = position.sl || position.stopLossPercent || -5;
    const partialDone = position.partialExitDone || false;

    // Every 12 checks (1 minute), log status
    if (this.checkCount % 12 === 0) {
      console.log(`📊 ${position.symbol || position.ca}: ${pnlPercent.toFixed(2)}% | TP1:${tp1}% TP2:${tp2}% SL:${sl}%`);
    }

    // Check TP2 (full exit)
    if (pnlPercent >= tp2) {
      console.log(`\n🎯 TP2 HIT! ${position.symbol} at +${pnlPercent.toFixed(2)}%`);
      
      const sellPercent = partialDone ? '95%' : '100%'; // Sell remaining if partial done
      const sellResult = await this.executeSell(position, sellPercent);
      
      if (sellResult.success) {
        await this.sendTelegram(
          `🎯 *TP2 HIT - FULL EXIT*\n\n` +
          `Token: ${position.symbol}\n` +
          `Entry: $${entryPrice.toFixed(8)}\n` +
          `Exit: $${currentPrice.toFixed(8)}\n` +
          `PnL: *+${pnlPercent.toFixed(2)}%*\n` +
          `Signature: \`${sellResult.signature}\``,
          TOPIC_POSITIONS
        );
        
        await this.sendTelegram(
          `✅ *TRADE WIN*\n` +
          `${position.symbol}: +${pnlPercent.toFixed(2)}%\n` +
          `Exit: TP2`,
          TOPIC_EVALUATIONS
        );
        
        return true; // Position closed
      }
    }
    
    // Check TP1 (partial exit)
    else if (pnlPercent >= tp1 && !partialDone) {
      console.log(`\n✅ TP1 HIT! ${position.symbol} at +${pnlPercent.toFixed(2)}%`);
      
      const sellResult = await this.executeSell(position, '50%');
      
      if (sellResult.success) {
        position.partialExitDone = true;
        this.savePositions();
        
        await this.sendTelegram(
          `✅ *TP1 HIT - PARTIAL EXIT (50%)*\n\n` +
          `Token: ${position.symbol}\n` +
          `Entry: $${entryPrice.toFixed(8)}\n` +
          `Current: $${currentPrice.toFixed(8)}\n` +
          `PnL: *+${pnlPercent.toFixed(2)}%*\n` +
          `Remaining: 50% (holding for TP2)`,
          TOPIC_POSITIONS
        );
        
        return false; // Keep monitoring remaining 50%
      }
    }
    
    // Check SL
    else if (pnlPercent <= sl) {
      console.log(`\n❌ SL HIT! ${position.symbol} at ${pnlPercent.toFixed(2)}%`);
      
      const sellResult = await this.executeSell(position, '100%');
      
      if (sellResult.success) {
        await this.sendTelegram(
          `❌ *STOP LOSS HIT*\n\n` +
          `Token: ${position.symbol}\n` +
          `Entry: $${entryPrice.toFixed(8)}\n` +
          `Exit: $${currentPrice.toFixed(8)}\n` +
          `PnL: *${pnlPercent.toFixed(2)}%*\n` +
          `Signature: \`${sellResult.signature}\``,
          TOPIC_POSITIONS
        );
        
        await this.sendTelegram(
          `❌ *TRADE LOSS*\n` +
          `${position.symbol}: ${pnlPercent.toFixed(2)}%\n` +
          `Exit: Stop Loss`,
          TOPIC_EVALUATIONS
        );
        
        return true; // Position closed
      }
    }
    
    return false;
  }

  async monitorLoop() {
    this.loadPositions();
    
    if (this.activePositions.length === 0) {
      if (this.checkCount % 60 === 0) { // Log every 5 minutes
        console.log('📊 No active positions to monitor');
      }
      return;
    }

    console.log(`\n🔍 Checking ${this.activePositions.length} position(s)...`);

    for (let i = this.activePositions.length - 1; i >= 0; i--) {
      const position = this.activePositions[i];
      const shouldClose = await this.checkPosition(position);
      
      if (shouldClose) {
        position.exited = true;
        position.exitTime = new Date().toISOString();
        this.activePositions.splice(i, 1);
        this.savePositions();
      }
    }
  }

  async start() {
    console.log('🚀 EXIT MONITOR v5.0 STARTED');
    console.log('📊 Monitoring active positions for TP/SL exits');
    console.log('⏱️  Check interval: 5 seconds\n');
    
    // Continuous monitoring loop
    setInterval(async () => {
      this.checkCount++;
      try {
        await this.monitorLoop();
      } catch (e) {
        console.error('❌ Monitor error:', e.message);
      }
    }, CONFIG.CHECK_INTERVAL);
    
    // Initial check
    await this.monitorLoop();
  }
}

// Start monitor
const monitor = new ExitMonitor();
monitor.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Exit monitor stopping...');
  process.exit(0);
});
