#!/usr/bin/env node
// BITGET FUTURES AUTONOMOUS TRADER v1.0
// Dual-direction: LONG + SHORT with ATR-based TP/SL
// Updated: 2026-02-26

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { RSI, MACD, EMA, ATR } = require('technicalindicators');

const POSITIONS_FILE = '/root/trading-bot/bitget-futures-positions.json';
const LOG_FILE = '/root/trading-bot/logs/bitget-futures-trader.log';

const config = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-system-config.json', 'utf8'));
const creds = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-credentials.json', 'utf8'));
const { TELEGRAM_BOT_TOKEN } = require('/root/trading-bot/src/env-loader');

const BITGET_BASE = 'https://api.bitget.com';
const BOT_TOKEN = TELEGRAM_BOT_TOKEN;
const CHAT_ID = config.TELEGRAM_CHAT_ID;
const PRODUCT_TYPE = 'USDT-FUTURES';

// Futures symbol mapping - Bitget uses same symbol format for spot and futures
// DOGEUSDT -> DOGEUSDT (no change needed)
const toFuturesSymbol = (spot) => {
  return spot;
};

const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

let positions = [];

function log(msg) {
  const ts = `[${new Date().toLocaleTimeString('id-ID')}]`;
  console.log(`${ts} ${msg}`);
  try { fs.appendFileSync(LOG_FILE, `${ts} ${msg}\n`); } catch (_) {}
}

function generateSignature(timestamp, method, requestPath, body = '') {
  const msg = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', creds.secretKey).update(msg).digest('base64');
}

async function request(method, endpoint, body = null) {
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = {
    'ACCESS-KEY': creds.apiKey,
    'ACCESS-SIGN': generateSignature(timestamp, method, endpoint, bodyStr),
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': creds.passphrase,
    'Content-Type': 'application/json'
  };

  const res = await fetch(BITGET_BASE + endpoint, {
    method,
    headers,
    ...(body && { body: bodyStr })
  });
  const data = await res.json();
  if (data.code !== '00000') throw new Error(`Bitget: ${data.msg}`);
  return data.data;
}

async function sendTelegram(msg, topicId) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, message_thread_id: topicId, parse_mode: 'HTML' })
    });
  } catch (e) { log(`TG error: ${e.message}`); }
}

function loadState() {
  if (fs.existsSync(POSITIONS_FILE)) positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
}

function saveState() {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
}

// ============ FUTURES SPECIFIC ============

async function getFuturesBalance() {
  const res = await request('GET', `/api/v2/mix/account/accounts?productType=${PRODUCT_TYPE}`);
  if (!res || res.length === 0) return 0;
  const usdt = res.find(a => a.marginCoin === 'USDT');
  return usdt ? parseFloat(usdt.available) : 0;
}

async function getPosition(symbol) {
  const futSymbol = toFuturesSymbol(symbol);
  try {
    const res = await request('GET', `/api/v2/mix/position/singlePosition?symbol=${futSymbol}&productType=${PRODUCT_TYPE}`);
    return res;
  } catch (e) {
    return null;
  }
}

const LEVERAGE = 10; // 10x leverage for profit maximization

async function openLong(symbol, amountUSDT) {
  const futSymbol = toFuturesSymbol(symbol);
  const order = {
    symbol: futSymbol,
    productType: PRODUCT_TYPE,
    marginMode: 'isolated',
    marginCoin: 'USDT',
    size: amountUSDT.toString(),
    side: 'buy',
    tradeSide: 'open',
    orderType: 'market',
    force: 'gtc'
  };
  return await request('POST', '/api/v2/mix/order/place-order', order);
}

async function openShort(symbol, amountUSDT) {
  const futSymbol = toFuturesSymbol(symbol);
  const order = {
    symbol: futSymbol,
    productType: PRODUCT_TYPE,
    marginMode: 'isolated',
    marginCoin: 'USDT',
    size: amountUSDT.toString(),
    side: 'sell',
    tradeSide: 'open',
    orderType: 'market',
    force: 'gtc'
  };
  return await request('POST', '/api/v2/mix/order/place-order', order);
}

async function closeLong(symbol) {
  const futSymbol = toFuturesSymbol(symbol);
  const pos = await getPosition(symbol);
  if (!pos || parseFloat(pos.holding) <= 0) return null;
  
  const order = {
    symbol: futSymbol,
    productType: PRODUCT_TYPE,
    marginMode: 'isolated',
    marginCoin: 'USDT',
    size: pos.holding,
    side: 'sell',
    tradeSide: 'close',
    orderType: 'market',
    force: 'gtc'
  };
  return await request('POST', '/api/v2/mix/order/place-order', order);
}

async function closeShort(symbol) {
  const futSymbol = toFuturesSymbol(symbol);
  const pos = await getPosition(symbol);
  if (!pos || parseFloat(pos.holding) <= 0) return null;
  
  const order = {
    symbol: futSymbol,
    productType: PRODUCT_TYPE,
    marginMode: 'isolated',
    marginCoin: 'USDT',
    size: pos.holding,
    side: 'buy',
    tradeSide: 'close',
    orderType: 'market',
    force: 'gtc'
  };
  return await request('POST', '/api/v2/mix/order/place-order', order);
}

// ============ TA & SCANNING ============

async function fetchCandles(symbol, granularity = '15min', limit = 60) {
  try {
    return await request('GET', `/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`, null, true);
  } catch (e) { return null; }
}

function analyzeTA(candles) {
  if (!candles || candles.length < 26) return { valid: false };
  
  try {
    const closes = candles.map(c => parseFloat(c[4])).reverse();
    const highs = candles.map(c => parseFloat(c[2])).reverse();
    const lows = candles.map(c => parseFloat(c[3])).reverse();
    
    const rsi = RSI.calculate({ period: 14, values: closes });
    const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    
    const price = closes[closes.length - 1];
    const r = rsi[rsi.length - 1];
    const m = macd[macd.length - 1];
    const mp = macd[macd.length - 2];
    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const a = atr[atr.length - 1];
    
    // Direction
    const trend = price > e20 ? 'UP' : 'DOWN';
    const emaTrend = e20 > e50 ? 'UP' : 'DOWN';
    
    // ATR-based TP/SL
    const atrPct = (a / price) * 100;
    const tpPct = Math.min(atrPct * 2, 8); // 2x ATR, max 8%
    const slPct = Math.max(atrPct, 1.5);   // 1x ATR, min 1.5%
    
    // More aggressive signals for more opportunities
    const longSignal = r < 50 && trend === 'UP' && (m?.histogram > 0 || r < 35);
    const shortSignal = r > 50 && trend === 'DOWN' && (m?.histogram < 0 || r > 65);
    const macdCross = m?.histogram > 0 && mp?.histogram <= 0;
    
    return {
      valid: true,
      price,
      rsi: parseFloat(r.toFixed(1)),
      macdBullish: m?.histogram > 0,
      macdBearish: m?.histogram < 0,
      macdCross,
      aboveEma20: price > e20,
      aboveEma50: price > e50,
      emaTrend,
      trend,
      atr: parseFloat(a.toFixed(6)),
      atrPct: parseFloat(atrPct.toFixed(1)),
      tpPct: parseFloat(tpPct.toFixed(1)),
      slPct: parseFloat(slPct.toFixed(1)),
      longSignal,
      shortSignal,
      direction: longSignal ? 'LONG' : shortSignal ? 'SHORT' : 'NONE'
    };
  } catch (e) {
    return { valid: false };
  }
}

async function scanMarket() {
  log('🔍 Scanning ALL opportunities...');
  const tickers = await request('GET', '/api/v2/spot/market/tickers');
  const usdt = tickers.filter(t => t.symbol && t.symbol.endsWith('USDT')); // ALL pairs!
  
  const candidates = [];
  
  for (const t of usdt) {
    const chg = Math.abs(parseFloat(t.change24h || 0)) * 100;
    const vol = parseFloat(t.usdtVolume || t.quoteVolume || 0);
    // Lower thresholds = more opportunities
    if (chg < 1 || vol < 50000) continue;
    
    // Skip if already in position
    if (positions.find(p => p.symbol === t.symbol)) continue;
    
    const candles = await fetchCandles(t.symbol);
    const ta = analyzeTA(candles);
    if (!ta.valid) continue;
    
    if (ta.direction !== 'NONE') {
      // More aggressive: include more candidates
            const score = (ta.longSignal || ta.shortSignal) ? 60 : 50;
      if ((ta.longSignal && ta.rsi < 50) || (ta.shortSignal && ta.rsi > 50)) {
        candidates.push({
          symbol: t.symbol,
          price: parseFloat(t.lastPr),
          change24h: chg,
          volume: vol,
          ta,
          score
        });
      }
    }
  }
  
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}

// ============ TRADING ============

async function executeTrade(candidate) {
  const balance = await getFuturesBalance();
  const minTrade = 5; // USDT minimum
  
  if (balance < minTrade) {
    log(`❌ Insufficient margin: $${balance.toFixed(2)} (min $${minTrade})`);
    return false;
  }
  
  if (positions.length >= config.MAX_CONCURRENT_POSITIONS) {
    log('❌ Max positions reached');
    return false;
  }
  
  const size = balance * 0.8; // 80% of balance
  const direction = candidate.ta.direction;
  const { tpPct, slPct } = candidate.ta;
  
  log(`🚀 Opening ${direction} ${candidate.symbol} @ $${size.toFixed(2)} | TP +${tpPct}% / SL -${slPct}%`);
  
  try {
    let result;
    if (direction === 'LONG') {
      result = await openLong(candidate.symbol, size);
    } else {
      result = await openShort(candidate.symbol, size);
    }
    
    const position = {
      symbol: candidate.symbol,
      direction,
      entryPrice: candidate.price,
      entryTime: Date.now(),
      size,
      tpPct,
      slPct,
      ta: candidate.ta,
      score: candidate.score
    };
    
    positions.push(position);
    saveState();
    
    const emoji = direction === 'LONG' ? '🟢' : '🔴';
    const msg = `${emoji} <b>${direction} OPENED</b>\n\n` +
      `Pair: <b>${candidate.symbol}</b>\n` +
      `Entry: $${candidate.price}\n` +
      `Size: $${size.toFixed(2)} (${LEVERAGE}x)\n` +
      `TP: +${tpPct}% ($${(size * tpPct / 100).toFixed(2)})\n` +
      `SL: -${slPct}% ($${(size * slPct / 100).toFixed(2)})\n` +
      `ATR: ${candidate.ta.atrPct}%\n` +
      `RSI: ${candidate.ta.rsi} | Trend: ${candidate.ta.trend}`;
    
    await sendTelegram(msg, config.TELEGRAM_TOPIC_TRADES);
    log(`✅ ${direction} opened: ${candidate.symbol}`);
    return true;
    
  } catch (e) {
    log(`❌ Trade failed: ${e.message}`);
    return false;
  }
}

async function monitorPositions() {
  if (positions.length === 0) return;
  
  const toClose = [];
  
  for (const pos of positions) {
    try {
      const candles = await fetchCandles(pos.symbol);
      const ta = analyzeTA(candles);
      if (!ta.valid) continue;
      
      const currentPrice = ta.price;
      const pnlPct = pos.direction === 'LONG'
        ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
      
      const tpHit = pos.direction === 'LONG' ? currentPrice >= pos.entryPrice * (1 + pos.tpPct / 100) : currentPrice <= pos.entryPrice * (1 - pos.tpPct / 100);
      const slHit = pos.direction === 'LONG' ? currentPrice <= pos.entryPrice * (1 - pos.slPct / 100) : currentPrice >= pos.entryPrice * (1 + pos.slPct / 100);
      
      if (tpHit) {
        log(`🎯 TP hit: ${pos.symbol} ${pos.direction} +${pnlPct.toFixed(1)}%`);
        toClose.push({ pos, pnlPct, reason: 'TP' });
      } else if (slHit) {
        log(`🛑 SL hit: ${pos.symbol} ${pos.direction} ${pnlPct.toFixed(1)}%`);
        toClose.push({ pos, pnlPct, reason: 'SL' });
      }
    } catch (e) {
      log(`Monitor error ${pos.symbol}: ${e.message}`);
    }
  }
  
  for (const { pos, pnlPct, reason } of toClose) {
    await closePosition(pos, pnlPct, reason);
  }
}

async function closePosition(pos, pnlPct, reason) {
  try {
    let result;
    if (pos.direction === 'LONG') {
      result = await closeLong(pos.symbol);
    } else {
      result = await closeShort(pos.symbol);
    }
    
    positions = positions.filter(p => p.symbol !== pos.symbol);
    saveState();
    
    const emoji = pnlPct >= 0 ? '✅' : '❌';
    const msg = `${emoji} <b>${pos.direction} CLOSED</b>\n\n` +
      `Pair: <b>${pos.symbol}</b>\n` +
      `Reason: ${reason}\n` +
      `P&L: <b>${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</b>`;
    
    await sendTelegram(msg, config.TELEGRAM_TOPIC_EVAL);
    log(`✅ Closed ${pos.symbol}: ${pnlPct.toFixed(2)}%`);
    
  } catch (e) {
    log(`❌ Close failed: ${e.message}`);
  }
}

// ============ MAIN LOOP ============

async function main() {
  log('=== Bitget Futures Trader v1.0 STARTED ===');
  loadState();
  
  const balance = await getFuturesBalance();
  await sendTelegram(`🤖 <b>Futures Trader Started</b>\n\nMargin: $${balance.toFixed(2)}\nMode: LONG + SHORT\nTP/SL: ATR-based`, config.TELEGRAM_TOPIC_TRADES);
  
  let scanCounter = 0;
  
  while (true) {
    try {
      await monitorPositions();
      
      scanCounter++;
      // Scan every SCAN_INTERVAL_MINUTES (from config, default 5 min)
      const scanInterval = config.SCAN_INTERVAL_MINUTES || 5;
      const cyclesPerScan = scanInterval * 2; // 30 sec per cycle
      if (scanCounter >= cyclesPerScan) {
        scanCounter = 0;
        
        const candidates = await scanMarket();
        if (candidates.length > 0) {
          const msg = `🔍 <b>Futures Scan</b>\n\n` +
            candidates.map((c, i) => `${i + 1}. ${c.symbol} ${c.ta.direction} | RSI: ${c.ta.rsi} | TP: +${c.ta.tpPct}%`).join('\n');
          await sendTelegram(msg, config.TELEGRAM_TOPIC_SCANNER);
          
          await executeTrade(candidates[0]);
        }
      }
      
    } catch (e) {
      log(`Loop error: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 30000));
  }
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
