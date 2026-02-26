#!/usr/bin/env node
// BITGET FUTURES AUTONOMOUS TRADER v2.1
// Fix: preset TP/SL inline on place-order + correct GET signature
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { RSI, MACD, EMA, ATR } = require('technicalindicators');

const POSITIONS_FILE = '/root/trading-bot/bitget-futures-positions.json';
const LOG_FILE = '/root/trading-bot/logs/bitget-futures-v2.log';
const config = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-system-config.json', 'utf8'));
const creds = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-credentials.json', 'utf8'));

const BITGET_BASE = 'https://api.bitget.com';
const PRODUCT_TYPE = 'USDT-FUTURES';
const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID = '-1003212463774';
const TOPIC_TRADES = 24;
const TOPIC_EVAL = 25;

let positions = [];
let cooldowns = {}; // { symbol: expiryTs }

const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function log(msg) {
  const ts = `[${new Date().toLocaleTimeString('id-ID')}]`;
  const line = `${ts} ${msg}`;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
  process.stdout.write(line + '\n');
}

// ============ SIGNATURE — benar sesuai Bitget SDK ============
function sign(ts, method, path, qsOrBody) {
  let payload = '';
  if (method === 'GET' && qsOrBody && Object.keys(qsOrBody).length) {
    // Sort keys alphabetically (sesuai SDK)
    const sorted = Object.keys(qsOrBody).sort();
    payload = '?' + sorted.map(k => `${k}=${qsOrBody[k]}`).join('&');
  } else if (method === 'POST' && qsOrBody) {
    payload = JSON.stringify(qsOrBody);
  }
  const msg = ts + method + path + payload;
  return crypto.createHmac('sha256', creds.secretKey).update(msg).digest('base64');
}

async function api(method, path, qsOrBody = null, isPublic = false) {
  const ts = Date.now().toString();
  const headers = { 'Content-Type': 'application/json' };

  let url = BITGET_BASE + path;
  let bodyStr = null;

  if (!isPublic) {
    headers['ACCESS-KEY'] = creds.apiKey;
    headers['ACCESS-TIMESTAMP'] = ts;
    headers['ACCESS-PASSPHRASE'] = creds.passphrase;
    headers['ACCESS-SIGN'] = sign(ts, method, path, qsOrBody);
  }

  if (method === 'GET' && qsOrBody && Object.keys(qsOrBody).length) {
    const qs = Object.keys(qsOrBody).sort().map(k => `${k}=${qsOrBody[k]}`).join('&');
    url += '?' + qs;
  } else if (method === 'POST' && qsOrBody) {
    bodyStr = JSON.stringify(qsOrBody);
  }

  const res = await fetch(url, { method, headers, ...(bodyStr && { body: bodyStr }) });
  const data = await res.json();
  if (data.code && data.code !== '00000') throw new Error(`${data.code}: ${data.msg}`);
  return data.data;
}

async function tg(msg, topic = TOPIC_TRADES) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg, message_thread_id: topic, parse_mode: 'HTML' })
    });
  } catch (_) {}
}

// ============ BALANCE — via position atau account ============
async function getBalance() {
  try {
    const res = await api('GET', '/api/v2/mix/account/accounts', { productType: PRODUCT_TYPE });
    if (res && res.length > 0) return parseFloat(res[0].available);
  } catch (e) {
    log(`Balance error: ${e.message}`);
  }
  return 4.5; // fallback
}

// ============ POSITIONS ============
async function getOpenPositions() {
  try {
    const res = await api('GET', '/api/v2/mix/position/all-position', { marginCoin: 'USDT', productType: PRODUCT_TYPE });
    return (res || []).filter(p => parseFloat(p.total) > 0);
  } catch (e) { return []; }
}

async function closePosition(symbol, holdSide) {
  try {
    return await api('POST', '/api/v2/mix/order/close-positions', {
      symbol, productType: PRODUCT_TYPE, marginCoin: 'USDT', holdSide
    });
  } catch (e) {
    log(`Close error: ${e.message}`);
    return null;
  }
}

// ============ TA ============
async function fetchAndAnalyze(symbol) {
  const candles = await api('GET', '/api/v2/spot/market/candles', {
    symbol, granularity: '15min', limit: '60'
  }, true);
  if (!candles || candles.length < 30) return null;

  const closes = candles.map(c => parseFloat(c[4])).reverse();
  const highs = candles.map(c => parseFloat(c[2])).reverse();
  const lows = candles.map(c => parseFloat(c[3])).reverse();
  const price = closes[closes.length - 1];

  const rsi = RSI.calculate({ period: 14, values: closes });
  const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  const ema20 = EMA.calculate({ period: 20, values: closes });
  const atrVals = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

  const r = rsi[rsi.length - 1];
  const m = macd[macd.length - 1];
  const e20 = ema20[ema20.length - 1];
  const atr = atrVals[atrVals.length - 1];
  const atrPct = (atr / price) * 100;

  return {
    price, rsi: r, price, e20,
    macdBull: m?.histogram > 0,
    macdBear: m?.histogram < 0,
    aboveEma: price > e20,
    tpPct: Math.min(atrPct * 2.5, 8),   // 2.5x ATR, max 8%
    slPct: Math.min(atrPct * 1.2, 4),    // 1.2x ATR, max 4%
  };
}

function getSignal(ta) {
  // LONG: RSI oversold + MACD bullish + above EMA
  if (ta.rsi < config.RSI_LONG_MAX && ta.macdBull && ta.aboveEma)
    return { dir: 'LONG', score: 80 + (config.RSI_LONG_MAX - ta.rsi) };
  // SHORT: RSI overbought + MACD bearish + below EMA
  if (ta.rsi > config.RSI_SHORT_MIN && ta.macdBear && !ta.aboveEma)
    return { dir: 'SHORT', score: 80 + (ta.rsi - config.RSI_SHORT_MIN) };
  return null;
}

// ============ EXECUTE — TP/SL preset inline ============
async function executeTrade(symbol, dir, ta) {
  const balance = await getBalance();
  if (balance < config.MIN_USDT_TRADE) { log(`❌ Balance low: $${balance}`); return; }
  if (positions.length >= config.MAX_CONCURRENT_POSITIONS) { log('❌ Max positions'); return; }

  const size = (balance * config.POSITION_SIZE_PCT).toFixed(4);
  const price = ta.price;
  const tpPrice = dir === 'LONG' ? price * (1 + ta.tpPct / 100) : price * (1 - ta.tpPct / 100);
  const slPrice = dir === 'LONG' ? price * (1 - ta.slPct / 100) : price * (1 + ta.slPct / 100);

  try {
    // Place order + preset TP/SL sekaligus
    const order = {
      symbol, productType: PRODUCT_TYPE,
      marginMode: 'isolated', marginCoin: 'USDT',
      size, side: dir === 'LONG' ? 'buy' : 'sell',
      tradeSide: 'open', orderType: 'market', force: 'gtc',
      presetStopSurplusPrice: tpPrice.toFixed(6),   // TP inline
      presetStopLossPrice: slPrice.toFixed(6)         // SL inline
    };
    const res = await api('POST', '/api/v2/mix/order/place-order', order);
    const orderId = res?.orderId || 'unknown';

    const pos = { symbol, dir, entryPrice: price, entryTime: Date.now(), size: parseFloat(size), tpPrice, slPrice, tpPct: ta.tpPct, slPct: ta.slPct };
    positions.push(pos);
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));

    const msg = `🚀 <b>${dir} ${symbol}</b>\n📍 Entry: $${price}\n🎯 TP: $${tpPrice.toFixed(4)} (+${ta.tpPct.toFixed(1)}%)\n🛑 SL: $${slPrice.toFixed(4)} (-${ta.slPct.toFixed(1)}%)\nRSI: ${ta.rsi.toFixed(1)}`;
    log(`✅ ${dir} ${symbol} @ $${price} | TP:${ta.tpPct.toFixed(1)}% SL:${ta.slPct.toFixed(1)}%`);
    await tg(msg);
  } catch (e) {
    log(`❌ Trade error: ${e.message}`);
  }
}

// ============ MONITOR ============
async function monitorPositions() {
  if (positions.length === 0) return;
  const openPos = await getOpenPositions();

  for (const pos of [...positions]) {
    const live = openPos.find(p => p.symbol === pos.symbol);
    if (!live) {
      // Posisi sudah ditutup (TP/SL hit oleh Bitget)
      log(`📊 ${pos.symbol} closed by Bitget (TP/SL hit)`);
      positions = positions.filter(p => p.symbol !== pos.symbol);
      cooldowns[pos.symbol] = Date.now() + config.COOLDOWN_AFTER_LOSS_MINUTES * 60000;
      fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
    }
  }
}

// ============ MAIN ============
async function main() {
  log('=== Futures Trader v2.1 STARTED ===');
  log(`RSI LONG < ${config.RSI_LONG_MAX} | RSI SHORT > ${config.RSI_SHORT_MIN}`);
  
  if (fs.existsSync(POSITIONS_FILE)) {
    try { positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8')) || []; } catch (_) {}
  }

  await tg(`🤖 <b>Futures Trader v2.1 Started</b>\nRSI LONG < ${config.RSI_LONG_MAX} | SHORT > ${config.RSI_SHORT_MIN}\nTP/SL: preset inline on order`);

  let cycle = 0;
  while (true) {
    try {
      await monitorPositions();

      if (cycle % (config.SCAN_INTERVAL_MINUTES * 4) === 0) {
        log(`🔍 Scanning...`);
        const now = Date.now();
        cooldowns = Object.fromEntries(Object.entries(cooldowns).filter(([_, v]) => v > now));

        const tickers = await api('GET', '/api/v2/spot/market/tickers', null, true);
        const candidates = tickers
          .filter(t => t.symbol?.endsWith('USDT') && parseFloat(t.usdtVolume || 0) > 500000)
          .sort((a, b) => parseFloat(b.usdtVolume) - parseFloat(a.usdtVolume))
          .slice(0, 40);

        let found = false;
        for (const t of candidates) {
          const sym = t.symbol;
          if (cooldowns[sym] || positions.find(p => p.symbol === sym)) continue;

          try {
            const ta = await fetchAndAnalyze(sym);
            if (!ta) continue;
            const signal = getSignal(ta);
            if (signal) {
              log(`🎯 ${sym} ${signal.dir} | RSI:${ta.rsi.toFixed(1)} | TP:${ta.tpPct.toFixed(1)}% SL:${ta.slPct.toFixed(1)}%`);
              await executeTrade(sym, signal.dir, ta);
              found = true;
              break;
            }
          } catch (_) {}
        }
        if (!found) log(`⏳ No signal (RSI < ${config.RSI_LONG_MAX} or > ${config.RSI_SHORT_MIN} required)`);
      }
    } catch (e) {
      log(`Error: ${e.message}`);
    }

    cycle++;
    await new Promise(r => setTimeout(r, 15000));
  }
}

main();
