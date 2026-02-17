#!/usr/bin/env node
// HIGH-FREQUENCY SCALPER v3 - Trending Tokens Focus
// Scan trending tokens with momentum

const { Connection, PublicKey } = require('@solana/web3.js');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fetch = require('node-fetch');

const CONFIG = {
  MIN_VOLUME_24H: 15000,        // $15k volume
  MIN_LIQUIDITY: 3000,          // $3k liquidity
  PROFIT_TARGET: 15,            // 15% profit (cover fees + net profit)
  STOP_LOSS: -7,                // 7% stop loss
  POSITION_SIZE: 0.020,         // 0.02 SOL per trade (bigger for fee efficiency)
  MAX_POSITIONS: 2,             // Max 2 concurrent
  SOL_RESERVE: 0.015,           // Fee reserve
  WALLET: 'EKbhgJrxCL93cBkENoS7vPeRQiSWoNgdW1oPv1sGQZrX'
};

const DB_PATH = '/root/trading-bot/scalper-positions.db';

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${msg}`);
}

class HighFreqScalper {
  constructor() {
    this.connection = new Connection('https://mainnet.helius-rpc.com/?api-key=74e50cb9-46b5-44dd-a67d-238283806304');
    this.initDB();
  }

  initDB() {
    const db = new sqlite3.Database(DB_PATH);
    db.run(`CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_symbol TEXT NOT NULL,
      token_ca TEXT NOT NULL,
      entry_price REAL NOT NULL,
      position_size REAL NOT NULL,
      entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      target_price REAL NOT NULL,
      stop_price REAL NOT NULL,
      status TEXT DEFAULT 'OPEN',
      txid TEXT
    )`);
    db.close();
  }

  async getWalletBalance() {
    try {
      const balance = await this.connection.getBalance(new PublicKey(CONFIG.WALLET));
      return balance / 1e9;
    } catch (e) {
      return 0;
    }
  }

  async scanForOpportunities() {
    log('🔍 Scanning trending tokens...');
    
    try {
      // Get latest token profiles (trending)
      const response = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      const profiles = await response.json();
      
      if (!profiles || !Array.isArray(profiles)) {
        log('❌ Invalid profiles response');
        return [];
      }

      log(`📊 Token profiles: ${profiles.length}`);

      // Get detailed data for each token
      const opportunities = [];
      
      for (const profile of profiles.slice(0, 10)) { // Check top 10
        if (profile.chainId !== 'solana') continue;
        
        try {
          // Get pair data for this token
          const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
          const pairData = await pairRes.json();
          
          if (!pairData.pairs || pairData.pairs.length === 0) continue;
          
          const pair = pairData.pairs[0]; // Best pair
          
          // Skip if no price data
          if (!pair.priceUsd) continue;
          
          // Skip majors
          const symbol = pair.baseToken?.symbol?.toUpperCase() || '';
          if (['SOL', 'USDC', 'USDT', 'WBTC', 'WETH'].includes(symbol)) continue;
          
          const priceChange5m = pair.priceChange?.m5 || 0;
          const volume = pair.volume?.h24 || 0;
          const liquidity = pair.liquidity?.usd || 0;
          
          // AGGRESSIVE: Any token with >2% 5m momentum and decent volume
          if (volume >= CONFIG.MIN_VOLUME_24H && liquidity >= CONFIG.MIN_LIQUIDITY && priceChange5m > 2) {
            opportunities.push({
              symbol: symbol,
              ca: profile.tokenAddress,
              price: parseFloat(pair.priceUsd),
              priceChange5m: priceChange5m,
              priceChange1h: pair.priceChange?.h1 || 0,
              volume24h: volume,
              liquidity: liquidity
            });
          }
        } catch (e) {
          // Skip failed tokens
        }
      }

      // Sort by 5m change
      opportunities.sort((a, b) => b.priceChange5m - a.priceChange5m);

      log(`✅ Found ${opportunities.length} opportunities`);
      opportunities.slice(0, 5).forEach((opp, i) => {
        log(`   ${i+1}. ${opp.symbol}: $${opp.price.toFixed(6)} (+${opp.priceChange5m}% 5m)`);
      });
      
      return opportunities;

    } catch (error) {
      log(`❌ Scan error: ${error.message}`);
      return [];
    }
  }

  async executeBuy(token) {
    const balance = await this.getWalletBalance();
    const feeEstimate = 0.001; // Estimated total fees (buy + sell)
    const grossProfit = CONFIG.POSITION_SIZE * (CONFIG.PROFIT_TARGET / 100);
    const netProfit = grossProfit - feeEstimate;
    
    if (balance < CONFIG.POSITION_SIZE + CONFIG.SOL_RESERVE) {
      log(`❌ Insufficient balance: ${balance} SOL`);
      return null;
    }
    
    log(`💡 Trade Math: ${CONFIG.POSITION_SIZE} SOL x ${CONFIG.PROFIT_TARGET}% = ${grossProfit.toFixed(4)} SOL gross`);
    log(`💡 After fees (~${feeEstimate} SOL): ${netProfit.toFixed(4)} SOL net profit`);

    const openPositions = await this.countOpenPositions();
    if (openPositions >= CONFIG.MAX_POSITIONS) {
      log(`⚠️ Max positions reached (${CONFIG.MAX_POSITIONS})`);
      return null;
    }

    log(`🚀 BUY: ${token.symbol} at $${token.price.toFixed(6)}`);
    log(`   CA: ${token.ca}`);
    log(`   5m: +${token.priceChange5m}% | 1h: ${token.priceChange1h}%`);

    try {
      const swapCmd = `cd /root/trading-bot && node tracker-swap.js buy ${token.ca} ${CONFIG.POSITION_SIZE}`;
      const { stdout } = await execAsync(swapCmd, { timeout: 90000 });
      
      const txMatch = stdout.match(/TX: ([A-Za-z0-9]+)/);
      const txid = txMatch ? txMatch[1] : null;

      if (txid) {
        const targetPrice = token.price * 1.10;
        const stopPrice = token.price * 0.95;

        const db = new sqlite3.Database(DB_PATH);
        db.run(
          `INSERT INTO positions (token_symbol, token_ca, entry_price, position_size, target_price, stop_price, txid, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
          [token.symbol, token.ca, token.price, CONFIG.POSITION_SIZE, targetPrice, stopPrice, txid]
        );
        db.close();

        log(`✅ BOUGHT: ${token.symbol} - TX: ${txid.slice(0, 20)}...`);
        return { success: true, txid };
      }

      return { success: false };

    } catch (error) {
      log(`❌ Buy failed: ${error.message}`);
      return { success: false };
    }
  }

  async countOpenPositions() {
    return new Promise((resolve) => {
      const db = new sqlite3.Database(DB_PATH);
      db.get(`SELECT COUNT(*) as count FROM positions WHERE status = 'OPEN'`, [], (err, row) => {
        db.close();
        resolve(row?.count || 0);
      });
    });
  }

  async checkPositions() {
    const db = new sqlite3.Database(DB_PATH);
    
    db.all(`SELECT * FROM positions WHERE status = 'OPEN'`, [], async (err, positions) => {
      if (err || !positions.length) {
        db.close();
        return;
      }

      log(`📊 Checking ${positions.length} positions...`);

      for (const pos of positions) {
        try {
          const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${pos.token_ca}`);
          const data = await response.json();
          
          if (!data.pairs || !data.pairs[0]) continue;
          
          const currentPrice = parseFloat(data.pairs[0].priceUsd);
          const pnl = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;

          log(`   ${pos.token_symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`);

          if (pnl >= CONFIG.PROFIT_TARGET) {
            await this.executeSell(pos, currentPrice, 'TP');
          } else if (pnl <= CONFIG.STOP_LOSS) {
            await this.executeSell(pos, currentPrice, 'SL');
          }
        } catch (e) {
          log(`   ⚠️ ${e.message}`);
        }
      }

      db.close();
    });
  }

  async executeSell(position, currentPrice, reason) {
    log(`🎯 ${reason}: Selling ${position.token_symbol}`);

    try {
      const swapCmd = `cd /root/trading-bot && node tracker-swap.js sell ${position.token_ca} 100`;
      await execAsync(swapCmd, { timeout: 90000 });

      const db = new sqlite3.Database(DB_PATH);
      db.run(`UPDATE positions SET status = ? WHERE id = ?`, [reason, position.id]);
      db.close();

      const pnl = ((currentPrice - position.entry_price) / pos.entry_price) * 100;
      log(`✅ SOLD: ${position.token_symbol} PnL: ${pnl.toFixed(2)}%`);

    } catch (error) {
      log(`❌ Sell failed: ${error.message}`);
    }
  }

  async run() {
    log('═══════════════════════════════════════════════════════');
    log('  HIGH-FREQ SCALPER v3 - 10% PROFIT TARGET');
    log('═══════════════════════════════════════════════════════');

    const balance = await this.getWalletBalance();
    const openCount = await this.countOpenPositions();
    
    log(`💰 Balance: ${balance.toFixed(4)} SOL`);
    log(`📊 Positions: ${openCount}/${CONFIG.MAX_POSITIONS}`);
    log(`🎯 Target: ${CONFIG.PROFIT_TARGET}% per trade`);

    await this.checkPositions();
    const opportunities = await this.scanForOpportunities();

    if (opportunities.length > 0 && openCount < CONFIG.MAX_POSITIONS) {
      await this.executeBuy(opportunities[0]);
    } else if (openCount >= CONFIG.MAX_POSITIONS) {
      log('⏳ Max positions - monitoring for exits');
    }

    log('✅ Cycle complete\n');
  }
}

if (require.main === module) {
  const scalper = new HighFreqScalper();
  scalper.run().catch(console.error);
}

module.exports = HighFreqScalper;
