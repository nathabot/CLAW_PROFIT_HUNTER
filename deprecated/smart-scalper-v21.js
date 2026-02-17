#!/usr/bin/env node
/**
 * SMART SCALPER v2.1 - BLACKLIST ENFORCED
 * FIX: Strict 3-strike rule, check blacklist before EVERY trade
 */

const fs = require('fs');
const fetch = require('node-fetch');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

const TOKENS = [
  { ca: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' },
  { ca: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF' },
  { ca: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'POPCAT' },
  { ca: '6D7NaB2xsLd7cauWu1wKk6oQsWxcHw3fGmV1UNtnqQvt', symbol: 'MYRO' },
  { ca: '5rc4nZ2f7bvgqqRjhcYmWWtM9qG1KuvggW7qBqBC9EJK', symbol: 'GIGA' }
];

const CONFIG = {
  WALLET_PATH: '/root/trading-bot/wallet.json',
  RPC: 'https://rpc-mainnet.solanatracker.io/?api_key=56584027-12fe-47f3-9ba2-6ef1620ed84b',
  
  POSITION_SIZE: 0.02,
  MAX_POSITIONS: 2,
  MAX_TRADES_6H: 12,
  
  SL_PERCENT: -1.5,
  TP1_PERCENT: 2,
  TP2_PERCENT: 4,
  MAX_HOLD_MINUTES: 15,
  
  // 3-STRIKE SETTINGS
  MAX_SL_PER_TOKEN: 3,        // MAX 3 SL per token
  SL_COOLDOWN_HOURS: 24,      // Reset after 24h
  
  MIN_PULLBACK_PERCENT: 0.5,
  MAX_ENTRY_FROM_HIGH: 1.0,
  MIN_GREEN_CANDLE: 0.3,
  WAIT_AFTER_RED: 2,
  
  COOLDOWN_MINUTES: 5,
  SCAN_INTERVAL_MS: 30000,
  
  MIN_BALANCE: 0.03,
  TELEGRAM_BOT: '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU',
  TELEGRAM_CHAT: '-1003212463774',
  TELEGRAM_TOPIC: 24,
  
  // FILE PATHS
  BLACKLIST_FILE: '/root/trading-bot/blacklist.json',
  SL_COUNT_FILE: '/root/trading-bot/token-sl-count.json'
};

// Load blacklist
function loadBlacklist() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.BLACKLIST_FILE, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

// Load SL count
function loadSLCount() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.SL_COUNT_FILE, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}

// Save SL count
function saveSLCount(counts) {
  fs.writeFileSync(CONFIG.SL_COUNT_FILE, JSON.stringify(counts, null, 2));
}

// Add to blacklist
function addToBlacklist(ca, symbol) {
  const blacklist = loadBlacklist();
  if (!blacklist.includes(ca)) {
    blacklist.push(ca);
    fs.writeFileSync(CONFIG.BLACKLIST_FILE, JSON.stringify(blacklist, null, 2));
    
    const msg = `🚫 *TOKEN BLACKLISTED*\n${symbol}\nCA: ${ca.slice(0, 15)}...\nReason: 3x SL hit\n\n🚫 NEVER TRADING THIS AGAIN`;
    notify(msg);
    console.log(`\n🚫 BLACKLISTED: ${symbol} - 3x SL`);
  }
}

// Check if token can trade (3-strike rule)
function canTradeToken(ca, symbol) {
  // Check blacklist
  const blacklist = loadBlacklist();
  if (blacklist.includes(ca)) {
    console.log(`   ${symbol}: 🚫 BLACKLISTED`);
    return { canTrade: false, reason: 'BLACKLISTED' };
  }
  
  // Check SL count
  const slCounts = loadSLCount();
  const tokenData = slCounts[ca];
  
  if (tokenData) {
    // Check if 24h passed since first SL
    const hoursSinceFirst = (Date.now() - tokenData.firstSL) / (1000 * 60 * 60);
    
    if (hoursSinceFirst >= CONFIG.SL_COOLDOWN_HOURS) {
      // Reset after 24h
      delete slCounts[ca];
      saveSLCount(slCounts);
      console.log(`   ${symbol}: SL count reset (24h passed)`);
    } else if (tokenData.count >= CONFIG.MAX_SL_PER_TOKEN) {
      // 3 strikes - blacklist
      addToBlacklist(ca, symbol);
      return { canTrade: false, reason: '3_STRIKES' };
    } else {
      console.log(`   ${symbol}: ⚠️  ${tokenData.count}/3 SL`);
    }
  }
  
  return { canTrade: true };
}

// Record SL hit
function recordSL(ca, symbol) {
  const slCounts = loadSLCount();
  
  if (!slCounts[ca]) {
    slCounts[ca] = {
      symbol,
      count: 1,
      firstSL: Date.now(),
      lastSL: Date.now()
    };
  } else {
    slCounts[ca].count++;
    slCounts[ca].lastSL = Date.now();
  }
  
  saveSLCount(slCounts);
  
  // Check if should blacklist
  if (slCounts[ca].count >= CONFIG.MAX_SL_PER_TOKEN) {
    addToBlacklist(ca, symbol);
  }
  
  return slCounts[ca].count;
}

const priceHistory = {};

const state = {
  positions: [],
  tradeCount: 0,
  startTime: Date.now(),
  lastTrade: {},
  wins: 0,
  losses: 0
};

const walletData = JSON.parse(fs.readFileSync(CONFIG.WALLET_PATH));
const bs58lib = bs58.default || bs58;
const wallet = Keypair.fromSecretKey(bs58lib.decode(walletData.privateKey));
const connection = new Connection(CONFIG.RPC);

console.log('═══════════════════════════════════════════════════════');
console.log('   🛡️ SMART SCALPER v2.1 - BLACKLIST ENFORCED');
console.log('═══════════════════════════════════════════════════════');
console.log('3-STRIKE RULE:');
console.log('  1x SL: Warning');
console.log('  2x SL: Caution');
console.log('  3x SL: 🚫 BLACKLIST FOREVER');
console.log('═══════════════════════════════════════════════════════\n');

async function notify(text) {
  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT,
        message_thread_id: CONFIG.TELEGRAM_TOPIC,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {}
}

async function getBalance() {
  return (await connection.getBalance(wallet.publicKey)) / 1e9;
}

async function getTokenData(ca) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, { timeout: 10000 });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pairs?.[0] || null;
  } catch (e) { return null; }
}

function analyzeCandles(symbol, currentPrice, priceChange) {
  const history = priceHistory[symbol] || [];
  const now = Date.now();
  
  history.push({ price: currentPrice, time: now, change: priceChange });
  while (history.length > 20) history.shift();
  priceHistory[symbol] = history;
  
  if (history.length < 5) {
    return { ok: false, reason: 'Collecting data...' };
  }
  
  const recent = history.slice(-10);
  const recentHigh = Math.max(...recent.map(h => h.price));
  const percentFromHigh = ((recentHigh - currentPrice) / recentHigh) * 100;
  
  if (percentFromHigh < CONFIG.MAX_ENTRY_FROM_HIGH) {
    return { ok: false, reason: `Too close to high (${percentFromHigh.toFixed(2)}%)` };
  }
  
  if (percentFromHigh < CONFIG.MIN_PULLBACK_PERCENT) {
    return { ok: false, reason: `Pullback too small (${percentFromHigh.toFixed(2)}%)` };
  }
  
  const last3 = history.slice(-3);
  const hadRedCandle = last3.some(c => c.change < 0);
  const redCandle = last3.find(c => c.change < 0);
  const minutesSinceRed = redCandle ? (now - redCandle.time) / 60000 : 999;
  
  if (minutesSinceRed < CONFIG.WAIT_AFTER_RED) {
    return { ok: false, reason: `Red candle ${minutesSinceRed.toFixed(1)}min ago` };
  }
  
  if (priceChange < CONFIG.MIN_GREEN_CANDLE) {
    return { ok: false, reason: `No green candle (${priceChange.toFixed(2)}%)` };
  }
  
  const priceChange5min = ((currentPrice - history[0].price) / history[0].price) * 100;
  if (priceChange5min < -2) {
    return { ok: false, reason: `Downtrend (${priceChange5min.toFixed(2)}%)` };
  }
  
  return { ok: true, reason: `Pullback ${percentFromHigh.toFixed(2)}%` };
}

async function executeTrade(token, symbol, ca) {
  // DOUBLE CHECK BLACKLIST
  const check = canTradeToken(ca, symbol);
  if (!check.canTrade) {
    console.log(`   ${symbol}: BLOCKED - ${check.reason}`);
    return;
  }
  
  const balance = await getBalance();
  if (balance < CONFIG.MIN_BALANCE + CONFIG.POSITION_SIZE) {
    console.log(`⚠️  Balance low: ${balance.toFixed(4)} SOL`);
    return;
  }
  
  if (state.positions.length >= CONFIG.MAX_POSITIONS) return;
  if (state.tradeCount >= CONFIG.MAX_TRADES_6H) return;
  
  const lastTrade = state.lastTrade[symbol];
  if (lastTrade && (Date.now() - lastTrade) < CONFIG.COOLDOWN_MINUTES * 60000) {
    console.log(`⏳ ${symbol} cooldown`);
    return;
  }
  
  const entry = parseFloat(token.priceUsd);
  const sl = entry * (1 + CONFIG.SL_PERCENT / 100);
  const tp1 = entry * (1 + CONFIG.TP1_PERCENT / 100);
  const tp2 = entry * (1 + CONFIG.TP2_PERCENT / 100);
  
  const position = {
    symbol, ca,
    entry, sl, tp1, tp2,
    size: CONFIG.POSITION_SIZE,
    startTime: Date.now(), status: 'OPEN'
  };
  
  state.positions.push(position);
  state.tradeCount++;
  state.lastTrade[symbol] = Date.now();
  
  fs.writeFileSync(`/root/trading-bot/pos-${symbol.toLowerCase()}.json`, JSON.stringify(position, null, 2));
  
  console.log(`\n✅ ENTER: ${symbol}`);
  console.log(`   Entry: $${entry.toFixed(8)}`);
  console.log(`   SL: $${sl.toFixed(8)} | TP: $${tp2.toFixed(8)}`);
  
  await notify(`✅ *ENTER: ${symbol}*\nEntry: $${entry.toFixed(8)}\nSL: ${CONFIG.SL_PERCENT}% | TP: +${CONFIG.TP2_PERCENT}%\nTrade ${state.tradeCount}/${CONFIG.MAX_TRADES_6H}`);
}

async function scan() {
  const elapsed = Math.floor((Date.now() - state.startTime) / 60000);
  const remaining = 360 - elapsed;
  
  if (remaining <= 0) {
    console.log('\n🎉 DONE!');
    process.exit(0);
  }
  
  if (state.tradeCount >= CONFIG.MAX_TRADES_6H) {
    console.log('\n✅ Max trades reached');
    return;
  }
  
  console.log(`\n🛡️ SCAN [${elapsed}m] P:${state.positions.length}/${CONFIG.MAX_POSITIONS} T:${state.tradeCount}/${CONFIG.MAX_TRADES_6H}`);
  
  // Show blacklist status
  const blacklist = loadBlacklist();
  if (blacklist.length > 0) {
    console.log(`   🚫 Blacklist: ${blacklist.length} tokens`);
  }
  
  for (const tokenConfig of TOKENS) {
    // CHECK BLACKLIST FIRST
    const tradeCheck = canTradeToken(tokenConfig.ca, tokenConfig.symbol);
    if (!tradeCheck.canTrade) {
      continue;
    }
    
    if (state.positions.find(p => p.symbol === tokenConfig.symbol)) continue;
    
    const data = await getTokenData(tokenConfig.ca);
    if (!data) continue;
    
    data.baseToken = { symbol: tokenConfig.symbol, address: tokenConfig.ca };
    
    const candle = analyzeCandles(tokenConfig.symbol, parseFloat(data.priceUsd), data.priceChange?.m5 || 0);
    if (candle.ok) {
      console.log(`   ${tokenConfig.symbol}: ✅ ${candle.reason}`);
      await executeTrade(data, tokenConfig.symbol, tokenConfig.ca);
    } else {
      console.log(`   ${tokenConfig.symbol}: ⏳ ${candle.reason}`);
    }
  }
}

async function checkPositions() {
  for (let i = state.positions.length - 1; i >= 0; i--) {
    const pos = state.positions[i];
    const data = await getTokenData(pos.ca);
    if (!data) continue;
    
    const currentPrice = parseFloat(data.priceUsd);
    const change = ((currentPrice - pos.entry) / pos.entry) * 100;
    const holdTime = (Date.now() - pos.startTime) / 60000;
    
    if (change >= CONFIG.TP2_PERCENT) {
      console.log(`\n🚀 TP2: ${pos.symbol} +${change.toFixed(2)}%`);
      state.wins++;
      state.positions.splice(i, 1);
      fs.unlinkSync(`/root/trading-bot/pos-${pos.symbol.toLowerCase()}.json`);
      await notify(`✅ *WIN: ${pos.symbol}* +${change.toFixed(2)}%`);
    } else if (change <= CONFIG.SL_PERCENT) {
      console.log(`\n🛑 SL HIT: ${pos.symbol} ${change.toFixed(2)}%`);
      state.losses++;
      
      // RECORD SL HIT!
      const slCount = recordSL(pos.ca, pos.symbol);
      console.log(`   ⚠️  SL Count: ${slCount}/3`);
      
      state.positions.splice(i, 1);
      fs.unlinkSync(`/root/trading-bot/pos-${pos.symbol.toLowerCase()}.json`);
      await notify(`🛑 *SL: ${pos.symbol}* ${change.toFixed(2)}%\nStrike: ${slCount}/3`);
    } else if (holdTime >= CONFIG.MAX_HOLD_MINUTES) {
      console.log(`\n⏰ TIME: ${pos.symbol} ${change.toFixed(2)}%`);
      if (change > 0) state.wins++; else state.losses++;
      state.positions.splice(i, 1);
      fs.unlinkSync(`/root/trading-bot/pos-${pos.symbol.toLowerCase()}.json`);
      await notify(`⏰ *EXIT: ${pos.symbol}* ${change > 0 ? '+' : ''}${change.toFixed(2)}%`);
    } else {
      console.log(`   ${pos.symbol}: ${change > 0 ? '+' : ''}${change.toFixed(2)}% (${holdTime.toFixed(1)}m)`);
    }
  }
}

async function main() {
  const blacklist = loadBlacklist();
  await notify(`🛡️ *SMART SCALPER v2.1*\n\n3-STRIKE RULE ACTIVE:\n1x SL = Warning\n2x SL = Caution\n3x SL = 🚫 BLACKLIST\n\nBlacklist: ${blacklist.length} tokens`);
  
  while (true) {
    await scan();
    await checkPositions();
    
    const elapsed = Math.floor((Date.now() - state.startTime) / 60000);
    if (elapsed >= 360) break;
    
    await new Promise(r => setTimeout(r, CONFIG.SCAN_INTERVAL_MS));
  }
  
  process.exit(0);
}

main().catch(console.error);
