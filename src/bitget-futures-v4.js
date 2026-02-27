#!/usr/bin/env node
// ============================================================
// BITGET FUTURES AUTONOMOUS TRADER v4.5-RISK
// UPGRADE: Multi-Timeframe (15m/30m/1H) + Fibonacci TP/SL
//
// Flow per coin:
//  1. Fetch candles 15m, 30m, 1H
//  2. Hitung swing high/low → Fibonacci levels per TF
//  3. Signal: RSI + MACD + harga dekat Fib retracement 0.382-0.618
//  4. 1H signal > 30m > 15m (priority)
//  5. MTF alignment bonus (2 TF setuju = score +20)
//  6. Entry pakai Fibonacci TP/SL dari TF yang memberi signal
//  7. SL+ ladder aktif setelah entry (dari v3.1)
// ============================================================
'use strict';

const fs     = require('fs');
const { exec } = require('child_process');
const path   = require('path');
const fetch  = require('node-fetch');
const crypto = require('crypto');
const { RSI, MACD, EMA, ATR } = require('technicalindicators');

// ── PATHS ─────────────────────────────────────────────────────
const DIR          = '/root/trading-bot';
const LOG_FILE     = `${DIR}/logs/bitget-futures-v4.log`;
const POS_FILE     = `${DIR}/bitget-futures-v4-positions.json`;
const HISTORY_FILE = `${DIR}/bitget-futures-v4-history.json`;
const LESSONS_FILE = `${DIR}/bitget-lessons.json`;
const CREDS        = JSON.parse(fs.readFileSync(`${DIR}/bitget-credentials.json`));

const BOT_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const CHAT_ID   = '-1003212463774';
const T_TRADES  = 24;
const T_EVAL    = 25;

// ── TIMEFRAME CONFIG ──────────────────────────────────────────
const TF = {
  '15m': {
    gran:        '15m',
    lookback:    60,           // 60 candles × 15min = 15h
    swingWindow: 20,           // swing high/low window
    maxHoldMs:   2 * 3600000, // 2 jam max hold
    slBufPct:    0.003,        // 0.3% buffer di luar swing low/high
    fibExtTP:    1.0,          // TP = swing-high + range×1.0 (100% ext)
    maxTpPct:    5.0,          // max TP 5%
    maxSlPct:    3.0,          // max SL 3%
    slPlusTrigger: 0.3,        // SL+ aktif di profit 0.3%
    priority:    25,            // raised (was 10) to compete with 1H
    label:       '15m'
  },
  '30m': {
    gran:        '30m',
    lookback:    60,           // 60 × 30min = 30h
    swingWindow: 20,
    maxHoldMs:   4 * 3600000, // 4 jam
    slBufPct:    0.005,
    fibExtTP:    1.272,        // 127.2% extension
    maxTpPct:    10.0,         // max TP 10%
    maxSlPct:    3.0,          // max SL 3% (FIXED)
    slPlusTrigger: 0.5,
    priority:    20,
    label:       '30m'
  },
  '1H': {
    gran:        '1H',
    lookback:    60,           // 60 × 1h = 60h
    swingWindow: 20,
    maxHoldMs:   12 * 3600000, // 12 jam
    slBufPct:    0.008,
    fibExtTP:    1.618,         // 161.8% extension (full fib ext)
    maxTpPct:    20.0,          // max TP 20%
    maxSlPct:    3.0,           // max SL 8%
    slPlusTrigger: 1.0,
    priority:    30,
    label:       '1H'
  }
};

// ── TRADE CONFIG ──────────────────────────────────────────────
const CFG = {
  PRODUCT_TYPE:   'USDT-FUTURES',
  LEVERAGE:       10,
  MARGIN_MODE:    'isolated',
  MARGIN_COIN:    'USDT',
  POSITION_PCT:   0.20,
  MIN_TRADE_USDT: 2.0,        // KILL SWITCH: no new trades below $2
  MAX_POSITIONS:  3,
  SCAN_INTERVAL:  3 * 60000,   // 3 menit (was 5 — faster signal detection)
  MONITOR_MS:     5000,        // 5 detik (was 20s — terlalu lambat)
  MIN_VOL_USDT:   2_000_000,  // $2M min volume (was $5M)
  TOP_N:          50,          // scan 50 pairs (was 30)

  // RSI thresholds
  RSI_LONG_MAX:   44,          // was 42
  RSI_SHORT_MIN:  56,          // was 58

  // Fibonacci retracement range untuk entry (harga harus ada di zona ini)
  FIB_ENTRY_MIN:  0.250,   // zona 25%-75% (was 30%)
  FIB_ENTRY_MAX:  0.750,   // was 70%

  // SL+ ladder (pctProfit -> slLevel)
  SL_PLUS_LEVELS: [
    { trigger: 0.5, target: 0.0,  label: 'BE'  },   // breakeven
    { trigger: 1.5, target: 1.0,  label: '+1%' },   // lock +1%
    { trigger: 2.5, target: 2.0,  label: '+2%' },   // lock +2%
  ],
};

// ── LOGGER ───────────────────────────────────────────────────
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
function log(msg, level = 'INFO') {
  const ts   = new Date().toLocaleTimeString('id-ID');
  const line = `[${ts}][${level}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
}

// ── TELEGRAM ─────────────────────────────────────────────────
async function tg(text, topic = T_TRADES) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, message_thread_id: topic, parse_mode: 'HTML' })
    });
  } catch (_) {}
}

// ── PRICE ROUNDING (dynamic per price magnitude) ─────────────
function roundPrice(p) {
  if (p >= 10000) return +(p.toFixed(1));
  if (p >= 1000)  return +(p.toFixed(2));
  if (p >= 100)   return +(p.toFixed(2));
  if (p >= 10)    return +(p.toFixed(3));
  if (p >= 1)     return +(p.toFixed(4));
  return +(p.toFixed(5));
}

// ── BITGET API ────────────────────────────────────────────────
const BASE = 'https://api.bitget.com';

function sign(ts, method, epath, qs, body) {
  let payload = '';
  if (qs && Object.keys(qs).length)
    payload = '?' + Object.keys(qs).sort().map(k => `${k}=${qs[k]}`).join('&');
  else if (body)
    payload = JSON.stringify(body);
  return crypto.createHmac('sha256', CREDS.secretKey)
    .update(ts + method + epath + payload)
    .digest('base64');
}

async function api(method, epath, qs = null, body = null, pub = false) {
  const ts = Date.now().toString();
  let url  = BASE + epath;
  const headers = { 'Content-Type': 'application/json' };

  if (!pub) {
    headers['ACCESS-KEY']        = CREDS.apiKey;
    headers['ACCESS-TIMESTAMP']  = ts;
    headers['ACCESS-PASSPHRASE'] = CREDS.passphrase;
    headers['ACCESS-SIGN']       = sign(ts, method, epath, qs, body);
  }

  if (qs && Object.keys(qs).length) {
    url += '?' + Object.keys(qs).sort().map(k => `${k}=${qs[k]}`).join('&');
  }

  const res  = await fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (data.code && data.code !== '00000') throw new Error(`API ${data.code}: ${data.msg}`);
  return data.data;
}

// ── STATE ─────────────────────────────────────────────────────
let positions    = [];
let cooldowns    = {};
let tradeHistory = [];

function loadState() {
  if (fs.existsSync(POS_FILE))     try { positions    = JSON.parse(fs.readFileSync(POS_FILE))     || []; } catch (_) {}
  if (fs.existsSync(HISTORY_FILE)) try { tradeHistory = JSON.parse(fs.readFileSync(HISTORY_FILE)) || []; } catch (_) {}
}

function savePositions() { fs.writeFileSync(POS_FILE, JSON.stringify(positions, null, 2)); }
function saveHistory()   { fs.writeFileSync(HISTORY_FILE, JSON.stringify(tradeHistory.slice(-200), null, 2)); }

// ── SELF-LEARNING ENGINE ──────────────────────────────────────
function runLearning() {
  exec(`node ${path.join(DIR, 'src/learning-v4.js')}`, (err, stdout, stderr) => {
    if (err) { log(`Learning err: ${err.message}`, 'WARN'); return; }
    if (stdout) log(`🧠 Learning: ${stdout.trim().split('\n')[0]}`);
  });
}

// ── SCHEDULED LEARNING (every 2 hours + stagnancy check) ────────────────
let lastScheduledLearning = Date.now();
const STAGNANT_THRESHOLD = 1 * 60 * 60 * 1000; // 1 hour no trade = stagnan
const SCHEDULE_LEARNING_INTERVAL = 2 * 60 * 60 * 1000; // every 2 hours

function checkAndRunScheduledLearning(now) {
  const history = tradeHistory.slice(-20);
  const lastTrade = history[history.length - 1];
  const hoursSinceLastTrade = lastTrade ? (now - lastTrade.closeTs) / (60 * 60 * 1000) : 999;
  
  const shouldRun = 
    (now - lastScheduledLearning > SCHEDULE_LEARNING_INTERVAL) ||  // scheduled
    (hoursSinceLastTrade > 6);  // stagnan > 6 jam
  
  if (shouldRun && lastTrade) {
    log(`📊 Scheduled learning: ${hoursSinceLastTrade.toFixed(1)}h since last trade`);
    lastScheduledLearning = now;
    
    // Run async without blocking
    exec(`node ${path.join(DIR, 'src/learning-v4.js')}`, (err, stdout, stderr) => {
      if (err) { log(`Scheduled learning err: ${err.message}`, 'WARN'); return; }
      if (stdout) log(`🧠 Scheduled: ${stdout.trim().split('\n')[0]}`);
    });
  }
}


// Reload learned params from file
function loadLearnedParams() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(DIR, 'learned-params.json')));
    if (p.RSI_LONG_MAX)  CFG.RSI_LONG_MAX  = p.RSI_LONG_MAX;
    if (p.RSI_SHORT_MIN) CFG.RSI_SHORT_MIN = p.RSI_SHORT_MIN;
    if (p.MIN_RR)        CFG.MIN_RR        = p.MIN_RR;
    if (p.PAUSE_TF)      CFG.PAUSE_TF      = p.PAUSE_TF || [];
    if (p.PAUSE_DIR)     CFG.PAUSE_DIR     = p.PAUSE_DIR || [];
  } catch (_) {}
}


// ── TARGET TRACKER ────────────────────────────────────────────
const TARGET_FILE = path.join(DIR, 'trading-targets.json');

function loadTargets() {
  try { return JSON.parse(fs.readFileSync(TARGET_FILE)); }
  catch { return null; }
}

async function checkAndReportTargets(currentBalance) {
  const t = loadTargets();
  if (!t) return;

  const startBal  = t.start_balance;
  const profit    = currentBalance - startBal;
  const pct       = ((profit / startBal) * 100).toFixed(1);
  let msg = '';

  // Phase 1: Recovery
  if (!t.recovery_done) {
    const needed  = t.recovery_target - currentBalance;
    const progress = ((currentBalance - startBal) / (t.recovery_target - startBal) * 100).toFixed(0);
    msg = `📊 <b>Target Progress</b>\n` +
          `Balance: <b>$${currentBalance.toFixed(2)}</b> (${pct > 0 ? '+' : ''}${pct}%)\n` +
          `🎯 Recovery: $${currentBalance.toFixed(2)} / $${t.recovery_target} [${progress}%]\n` +
          `Sisa: $${Math.max(0, needed).toFixed(2)}`;

    if (currentBalance >= t.recovery_target) {
      t.recovery_done = true;
      t.current_day = 1;
      t.current_day_target = t.daily_base;
      t.current_day_start_bal = currentBalance;
      fs.writeFileSync(TARGET_FILE, JSON.stringify(t, null, 2));
      msg += `\n\n🏆 <b>RECOVERY TERCAPAI!</b>\nMulai compound $2/hari!`;
    }
  } else {
    // Phase 2: Daily compound
    const dayStart  = t.current_day_start_bal || currentBalance;
    const dayProfit = currentBalance - dayStart;
    const dayTarget = t.current_day_target;
    const dayPct    = ((dayProfit / dayTarget) * 100).toFixed(0);

    msg = `📊 <b>Target Progress — Day ${t.current_day}</b>\n` +
          `Balance: <b>$${currentBalance.toFixed(2)}</b>\n` +
          `🎯 Hari ini: $${dayProfit.toFixed(2)} / $${dayTarget.toFixed(2)} [${dayPct}%]\n` +
          `Next target: $${(dayTarget * 2).toFixed(2)}/hari`;

    if (dayProfit >= dayTarget) {
      const prevTarget = t.current_day_target;
      t.daily_history.push({ day: t.current_day, profit: dayProfit, target: prevTarget, bal: currentBalance });
      t.current_day++;
      t.current_day_target = prevTarget * 2;
      t.current_day_start_bal = currentBalance;
      fs.writeFileSync(TARGET_FILE, JSON.stringify(t, null, 2));
      msg += `\n\n🚀 <b>TARGET HARI INI TERCAPAI!</b>\nBesok target: $${t.current_day_target.toFixed(2)}`;
    }
  }

  fs.writeFileSync(TARGET_FILE, JSON.stringify(t, null, 2));
  if (msg) await tg(msg, T_EVAL);
}


// ── BALANCE ───────────────────────────────────────────────────
async function getBalance() {
  try {
    const res = await api('GET', '/api/v2/mix/account/accounts', { productType: CFG.PRODUCT_TYPE });
    if (res && res.length) {
      const equity = parseFloat(res[0].accountEquity || 0);
      const avail  = parseFloat(res[0].available);
      log(`💰 Equity:$${equity.toFixed(2)} Available:$${avail.toFixed(2)}`);
      return avail;
    }
  } catch (e) { log(`Balance err: ${e.message}`, 'WARN'); }
  return null;
}

// ── SET LEVERAGE ──────────────────────────────────────────────
async function setLeverage(symbol, side) {
  try {
    await api('POST', '/api/v2/mix/account/set-leverage', null, {
      symbol, productType: CFG.PRODUCT_TYPE, marginCoin: CFG.MARGIN_COIN,
      leverage: String(CFG.LEVERAGE), holdSide: side.toLowerCase()
    });
  } catch (e) { log(`Leverage err: ${e.message}`, 'WARN'); }
}

// ── OPEN POSITIONS ────────────────────────────────────────────
async function fetchOpenPositions() {
  try {
    const res = await api('GET', '/api/v2/mix/position/all-position', { marginCoin: CFG.MARGIN_COIN, productType: CFG.PRODUCT_TYPE });
    return (res || []).filter(p => parseFloat(p.total) > 0);
  } catch (e) { return []; }
}

// ── PLAN ORDER (TP/SL) ────────────────────────────────────────
// Auto-round size based on checkScale from API error
function roundSizeByScale(size, scale) {
  const factor = Math.pow(10, scale);
  return Math.floor(size * factor) / factor;
}

async function placePlanOrder(symbol, dir, size, triggerPrice, label) {
  const side     = dir === 'LONG' ? 'sell' : 'buy';
  const holdSide = dir === 'LONG' ? 'long'  : 'short';

  // Round by scale helper
  function scaleRound(val, scale) {
    const f = Math.pow(10, scale);
    return Math.round(val * f) / f;
  }

  let tryPrice = roundPrice(triggerPrice);
  let trySize  = size;

  for (let attempt = 0; attempt <= 5; attempt++) {
    try {
      const res = await api('POST', '/api/v2/mix/order/place-plan-order', null, {
        symbol, productType: CFG.PRODUCT_TYPE,
        marginMode: CFG.MARGIN_MODE, marginCoin: CFG.MARGIN_COIN,
        planType: 'normal_plan',
        triggerPrice: String(tryPrice),
        triggerType: 'mark_price',
        side, tradeSide: 'close',
        orderType: 'market',
        size: String(trySize),
        holdSide
      });
      const oid = res?.orderId;
      log(`✅ ${label}: $${tryPrice} size:${trySize} id:${oid}`);
      return oid;
    } catch (e) {
      const msg = e.message || '';
      // Fix PRICE precision: checkBDScale error
      const priceScaleMatch = msg.match(/checkBDScale[^=]*?checkScale=(\d+)/i) ||
                              msg.match(/trigger price.*?checkScale=(\d+)/i);
      // Fix SIZE precision: checkScale error
      const sizeScaleMatch  = msg.match(/checkScale=(\d+)/);

      if (priceScaleMatch && attempt < 5) {
        const pScale = parseInt(priceScaleMatch[1]);
        tryPrice = scaleRound(triggerPrice, pScale);
        log(`↩️  Retry ${label} — price rounded to ${pScale}dp: $${tryPrice}`);
      } else if (sizeScaleMatch && attempt < 5) {
        const sScale = parseInt(sizeScaleMatch[1]);
        trySize = roundSizeByScale(size, sScale);
        log(`↩️  Retry ${label} — size rounded to ${sScale}dp: ${trySize}`);
      } else {
        log(`⚠️  ${label} FAILED: ${msg}`, 'WARN');
        return null;
      }
    }
  }
  return null;
}

async function cancelPlanOrder(orderId, symbol) {
  if (!orderId) return;
  try {
    await api('POST', '/api/v2/mix/order/cancel-plan-order', null, { orderId, symbol, productType: CFG.PRODUCT_TYPE });
    log(`🗑️  Cancelled plan order ${orderId}`);
  } catch (e) { log(`Cancel plan err: ${e.message}`, 'WARN'); }
}

// ── FORCE CLOSE ───────────────────────────────────────────────
async function forceClose(symbol, holdSide, reason) {
  log(`🚨 Force close ${symbol} ${holdSide} — ${reason}`, 'WARN');
  try {
    await api('POST', '/api/v2/mix/order/close-positions', null, {
      symbol, productType: CFG.PRODUCT_TYPE, marginCoin: CFG.MARGIN_COIN, holdSide
    });
    log(`✅ Force closed ${symbol}`);
    return true;
  } catch (e) { log(`Force close err: ${e.message}`, 'ERROR'); return false; }
}

// ── SL+ ADJUST ────────────────────────────────────────────────
async function adjustSL(pos, newSlPrice, reason) {
  await cancelPlanOrder(pos.slOrderId, pos.symbol);
  const newOid = await placePlanOrder(pos.symbol, pos.dir, pos.size, newSlPrice, `SL+(${reason})`);
  pos.slPrice   = newSlPrice;
  pos.slOrderId = newOid;
  log(`📈 SL+ → $${roundPrice(newSlPrice)} (${reason})`);
  return newOid;
}

// ── FETCH FUTURES CANDLES ─────────────────────────────────────
async function fetchCandles(symbol, gran, limit) {
  const data = await api('GET', '/api/v2/mix/market/candles', {
    symbol, productType: CFG.PRODUCT_TYPE, granularity: gran, limit: String(limit)
  }, null, true);
  if (!data || data.length < 20) return null;
  // Format: [ts, open, high, low, close, baseVol, quoteVol] — oldest first
  return {
    ts:     data.map(c => parseInt(c[0])),
    opens:  data.map(c => parseFloat(c[1])),
    highs:  data.map(c => parseFloat(c[2])),
    lows:   data.map(c => parseFloat(c[3])),
    closes: data.map(c => parseFloat(c[4])),
    vols:   data.map(c => parseFloat(c[5]))
  };
}

// ── FIBONACCI CALCULATION ─────────────────────────────────────
function calcFibonacci(candles, window, tfCfg, dir) {
  const n      = candles.highs.length;
  const start  = Math.max(0, n - window);
  const highs  = candles.highs.slice(start);
  const lows   = candles.lows.slice(start);
  const price  = candles.closes[n - 1];

  const swingHigh = Math.max(...highs);
  const swingLow  = Math.min(...lows);
  const range     = swingHigh - swingLow;
  if (range <= 0) return null;

  // Fibonacci retracement levels (from swing low up to swing high)
  const fib236 = swingHigh - range * 0.236;
  const fib382 = swingHigh - range * 0.382;
  const fib500 = swingHigh - range * 0.500;
  const fib618 = swingHigh - range * 0.618;
  const fib786 = swingHigh - range * 0.786;

  // Price position as retracement ratio (0 = at swing low, 1 = at swing high)
  const retracePct = (price - swingLow) / range;

  // Entry zone: 0.30 - 0.70 retracement (near 0.382-0.618)
  const inEntryZone = retracePct >= CFG.FIB_ENTRY_MIN && retracePct <= CFG.FIB_ENTRY_MAX;

  if (dir === 'LONG') {
    // LONG: price pulled back to Fib support, expecting bounce
    // Entry zone: near 0.382-0.618 from below (in lower half)
    const longZone = retracePct >= CFG.FIB_ENTRY_MIN && retracePct <= 0.55;
    if (!longZone) return null;

    const tp = swingHigh + range * tfCfg.fibExtTP;  // Fibonacci extension beyond swing high
    const sl = swingLow  * (1 - tfCfg.slBufPct);    // Below swing low with buffer
    const tpPct = ((tp - price) / price) * 100;
    const slPct = ((price - sl) / price) * 100;
    const rr    = tpPct / slPct;

    // Cap TP/SL at TF max
    const cappedTpPct = Math.min(tpPct, tfCfg.maxTpPct || 20);
    const cappedSlPct = Math.min(slPct, tfCfg.maxSlPct || 3);
    const cappedTp    = price * (1 + cappedTpPct / 100);
    const cappedSl    = price * (1 - cappedSlPct / 100);
    const cappedRr    = cappedTpPct / cappedSlPct;

    return { swingHigh, swingLow, range, retracePct,
             tp: cappedTp, sl: cappedSl,
             tpPct: cappedTpPct, slPct: cappedSlPct, rr: cappedRr,
             fib382, fib500, fib618, inEntryZone: longZone };

  } else { // SHORT
    // SHORT: price bounced up to Fib resistance, expecting reversal
    // Entry zone: near 0.382-0.618 from above (in upper half)
    const shortZone = retracePct >= 0.45 && retracePct <= (1 - CFG.FIB_ENTRY_MIN);
    if (!shortZone) return null;

    const tp = swingLow  - range * tfCfg.fibExtTP;   // Extension below swing low
    const sl = swingHigh * (1 + tfCfg.slBufPct);     // Above swing high with buffer
    const tpPct = ((price - tp) / price) * 100;
    const slPct = ((sl - price) / price) * 100;
    const rr    = tpPct / slPct;

    // Cap TP/SL at TF max
    const cappedTpPct = Math.min(tpPct, tfCfg.maxTpPct || 20);
    const cappedSlPct = Math.min(slPct, tfCfg.maxSlPct || 3);
    const cappedTp    = price * (1 - cappedTpPct / 100);
    const cappedSl    = price * (1 + cappedSlPct / 100);
    const cappedRr    = cappedTpPct / cappedSlPct;

    return { swingHigh, swingLow, range, retracePct,
             tp: cappedTp, sl: cappedSl,
             tpPct: cappedTpPct, slPct: cappedSlPct, rr: cappedRr,
             fib382, fib500, fib618, inEntryZone: shortZone };
  }
}

// ── TECHNICAL ANALYSIS PER TF ─────────────────────────────────
function analyzeTF(candles, tfKey) {
  const tfCfg  = TF[tfKey];
  const closes = candles.closes;
  const highs  = candles.highs;
  const lows   = candles.lows;
  const price  = closes[closes.length - 1];

  const rsiVals  = RSI.calculate({ period: 14, values: closes });
  const macdVals = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
  const atrVals  = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

  if (!rsiVals.length || !macdVals.length) return null;

  const rsi      = rsiVals[rsiVals.length - 1];
  const macd     = macdVals[macdVals.length - 1];
  const prevMacd = macdVals[macdVals.length - 2];
  const atr      = atrVals[atrVals.length - 1];
  const atrPct   = (atr / price) * 100;

  const macdBull     = macd?.histogram > 0;
  const macdBear     = macd?.histogram < 0;
  const macdCrossUp  = prevMacd?.histogram <= 0 && macd?.histogram > 0;
  const macdCrossDown= prevMacd?.histogram >= 0 && macd?.histogram < 0;

  // Determine direction
  let dir = null;
  if (rsi < CFG.RSI_LONG_MAX  && macdBull) dir = 'LONG';
  if (rsi > CFG.RSI_SHORT_MIN && macdBear) dir = 'SHORT';
  if (!dir) return null;

  // Check Fibonacci entry zone
  const fib = calcFibonacci(candles, tfCfg.swingWindow, tfCfg, dir);
  if (!fib || !fib.inEntryZone) return null;

  // Minimum R:R ratio 1.5:1
  if (fib.rr < 1.5) return null;
  // Minimum volatility
  if (atrPct < 0.2) return null;

  const crossBonus = (dir === 'LONG' && macdCrossUp) || (dir === 'SHORT' && macdCrossDown) ? 10 : 0;
  const rrBonus    = Math.min(fib.rr * 3, 15);
  const score      = tfCfg.priority + (dir === 'LONG' ? CFG.RSI_LONG_MAX - rsi : rsi - CFG.RSI_SHORT_MIN) + crossBonus + rrBonus;

  return {
    tf: tfKey, dir, price, rsi, atrPct,
    macdHist: macd.histogram,
    macdCrossUp, macdCrossDown,
    tp: fib.tp, sl: fib.sl,
    tpPct: fib.tpPct, slPct: fib.slPct, rr: fib.rr,
    swingHigh: fib.swingHigh, swingLow: fib.swingLow,
    retracePct: fib.retracePct,
    score
  };
}

// ── SCAN SINGLE COIN ACROSS ALL TFs ───────────────────────────
async function scanCoin(symbol) {
  const results = [];

  for (const tfKey of ['1H', '30m', '15m']) {
    const tfCfg = TF[tfKey];
    try {
      const candles = await fetchCandles(symbol, tfCfg.gran, tfCfg.lookback);
      if (!candles) continue;

      const analysis = analyzeTF(candles, tfKey);
      if (analysis) results.push(analysis);

      await new Promise(r => setTimeout(r, 150)); // rate limit
    } catch (e) { /* skip TF */ }
  }

  if (results.length === 0) return null;

  // MTF alignment bonus: 2+ TFs agree on same direction
  const dirs = results.map(r => r.dir);
  const longCount  = dirs.filter(d => d === 'LONG').length;
  const shortCount = dirs.filter(d => d === 'SHORT').length;
  const alignment  = Math.max(longCount, shortCount);
  const alignDir   = longCount >= shortCount ? 'LONG' : 'SHORT';

  // Bonus for MTF alignment
  const alignBonus = alignment >= 2 ? 20 * (alignment - 1) : 0;

  // Use highest priority TF (1H > 30m > 15m) that matches alignment direction
  const aligned = results
    .filter(r => r.dir === alignDir)
    .sort((a, b) => TF[b.tf].priority - TF[a.tf].priority);

  if (!aligned.length) return null;

  const best = aligned[0];
  best.score += alignBonus;
  best.alignCount = alignment;
  best.symbol = symbol;

  return best;
}

// ── EXECUTE TRADE ─────────────────────────────────────────────
async function executeTrade(signal) {
  const { symbol, dir, tf, price, tp, sl, tpPct, slPct, rr, score } = signal;

  if (positions.length >= CFG.MAX_POSITIONS) return;
  if (positions.find(p => p.symbol === symbol)) return;
  if (cooldowns[symbol] && cooldowns[symbol] > Date.now()) return;

  const balance = await getBalance();
  if (!balance || balance < CFG.MIN_TRADE_USDT) {
    log(`❌ Balance $${balance} too low`);
    return;
  }

  await setLeverage(symbol, dir);
  await new Promise(r => setTimeout(r, 500));

  const rawSize = (balance * CFG.POSITION_PCT * CFG.LEVERAGE) / price;
  // Smart size rounding — different coins need different precision
  let size;
  if      (rawSize >= 1000) size = Math.floor(rawSize);           // integer
  else if (rawSize >= 100)  size = Math.floor(rawSize);           // integer
  else if (rawSize >= 10)   size = Math.floor(rawSize * 10)  / 10;  // 1 decimal
  else if (rawSize >= 1)    size = Math.floor(rawSize * 100) / 100; // 2 decimals
  else                      size = Math.floor(rawSize * 1000)/ 1000; // 3 decimals
  if (size <= 0) { log(`❌ Size too small`); return; }

  log(`📤 ${dir} ${symbol}[${tf}] | $${price} | size:${size} | TP:+${tpPct.toFixed(1)}% SL:-${slPct.toFixed(1)}% R:R=${rr.toFixed(1)}`);

  let orderId = null;
  try {
    // Try place order, retry with correct scale if needed
    const tryPlaceOrder = async (trySize) => {
      return api('POST', '/api/v2/mix/order/place-order', null, {
        symbol, productType: CFG.PRODUCT_TYPE,
        marginMode: CFG.MARGIN_MODE, marginCoin: CFG.MARGIN_COIN,
        side: dir === 'LONG' ? 'buy' : 'sell',
        tradeSide: 'open', orderType: 'market', force: 'gtc',
        size: String(trySize)
      });
    };
    let res;
    try {
      res = await tryPlaceOrder(size);
    } catch (e) {
      const scaleMatch = e.message.match(/checkScale=(\d+)/);
      if (scaleMatch) {
        const scale = parseInt(scaleMatch[1]);
        size = roundSizeByScale(size, scale);
        log(`↩️  Retry order with size=${size} (scale=${scale})`);
        try { res = await tryPlaceOrder(size); }
        catch (e2) { log(`❌ Place order FAILED: ${e2.message}`, 'ERROR'); return; }
      } else {
        log(`❌ Place order FAILED: ${e.message}`, 'ERROR'); return;
      }
    }
    orderId = res?.orderId;
    log(`✅ Order placed: ${orderId} size:${size}`);
  } catch (e) {
    log(`❌ Place order FAILED: ${e.message}`, 'ERROR');
    return;
  }

  // Verify position opened
  await new Promise(r => setTimeout(r, 2000));
  const openPos = await fetchOpenPositions();
  const livePos = openPos.find(p => p.symbol === symbol);
  if (!livePos) { log(`⚠️  Position not confirmed after order`, 'WARN'); return; }

  const actualEntry = parseFloat(livePos.openPriceAvg || price);

  // Recalculate TP/SL from actual entry (keep same % structure from Fibonacci)
  const actualTp = dir === 'LONG'
    ? actualEntry * (1 + tpPct / 100)
    : actualEntry * (1 - tpPct / 100);
  const actualSl = dir === 'LONG'
    ? actualEntry * (1 - slPct / 100)
    : actualEntry * (1 + slPct / 100);

  const tpOid = await placePlanOrder(symbol, dir, size, actualTp, 'TP');
  const slOid = await placePlanOrder(symbol, dir, size, actualSl, 'SL');

  const tfCfg = TF[tf];
  const pos = {
    symbol, dir, size, tf,
    entryPrice: actualEntry,
    tpPrice: actualTp, slPrice: actualSl,
    tpPct, slPct, rr,
    swingHigh: signal.swingHigh, swingLow: signal.swingLow,
    tpOrderId: tpOid, slOrderId: slOid,
    tpOk: !!tpOid, slOk: !!slOid,
    slLevel: 0,
    slPlusTrigger: tfCfg.slPlusTrigger,
    maxHoldMs: tfCfg.maxHoldMs,
    openTs: Date.now(),
    orderId,
    alignCount: signal.alignCount || 1
  };
  positions.push(pos);
  savePositions();

  const msg =
    `🚀 <b>${dir} ${symbol}</b> [${tf}${pos.alignCount >= 2 ? ' 🔗MTF' : ''}]\n` +
    `📍 Entry: $${actualEntry.toFixed(4)}\n` +
    `🎯 TP: $${roundPrice(actualTp)} (+${tpPct.toFixed(1)}%)\n` +
    `🛑 SL: $${roundPrice(actualSl)} (-${slPct.toFixed(1)}%)\n` +
    `⚖️  R:R = ${rr.toFixed(1)} | RSI:${signal.rsi.toFixed(1)}\n` +
    `📊 Swing L:$${roundPrice(signal.swingLow)} H:$${roundPrice(signal.swingHigh)}\n` +
    `${tpOid ? '✅' : '⚠️'} TP  ${slOid ? '✅' : '⚠️'} SL | Score:${score.toFixed(0)}`;

  await tg(msg, T_TRADES);
  log(`📨 Telegram sent: ${symbol}`);
}

// ── MONITOR POSITIONS ─────────────────────────────────────────
async function monitorPositions() {
  if (!positions.length) return;

  const openPos = await fetchOpenPositions();
  const now     = Date.now();

  for (const pos of [...positions]) {
    const live = openPos.find(p => p.symbol === pos.symbol);

    // ── Position closed (TP/SL hit or manual) ──
    if (!live) {
      log(`📊 ${pos.symbol} ${pos.dir}[${pos.tf}] CLOSED`);
      positions = positions.filter(p => p.symbol !== pos.symbol);
      cooldowns[pos.symbol] = now + 10 * 60000; // 10 min cooldown
      tradeHistory.push({ ...pos, closeTs: now, closeReason: 'BITGET_AUTO' });
      savePositions(); saveHistory();
      await tg(`📊 <b>${pos.symbol} ${pos.dir}[${pos.tf}] CLOSED</b>\nEntry: $${pos.entryPrice.toFixed(4)}\nTP:+${pos.tpPct.toFixed(1)}% SL:-${pos.slPct.toFixed(1)}%`, T_EVAL);
      runLearning();
      try { const bal = await getBalance(); if (bal) await checkAndReportTargets(bal); } catch(e) { log("Target err:"+e.message,"WARN"); }
      continue;
    }

    const markPrice = parseFloat(live.markPrice);
    if (!markPrice) continue;

    const pnlPct = pos.dir === 'LONG'
      ? ((markPrice - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - markPrice) / pos.entryPrice) * 100;

    log(`📌 ${pos.symbol}[${pos.tf}] ${pos.dir} | Entry:$${pos.entryPrice.toFixed(4)} Mark:$${markPrice.toFixed(4)} P&L:${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}% SL_lvl:${pos.slLevel}`);

    // ── SL+ LADDER — lindungi floating profit ──
    for (let i = pos.slLevel; i < CFG.SL_PLUS_LEVELS.length; i++) {
      const lvl = CFG.SL_PLUS_LEVELS[i];
      if (pnlPct >= lvl.trigger) {
        const newSlPct = lvl.target;
        const newSl = newSlPct === 0
          ? pos.entryPrice * (pos.dir === 'LONG' ? 1.001 : 0.999)  // breakeven + tiny fee buf
          : pos.dir === 'LONG'
            ? pos.entryPrice * (1 + newSlPct / 100)
            : pos.entryPrice * (1 - newSlPct / 100);

        await adjustSL(pos, newSl, lvl.label);
        pos.slLevel = i + 1;
        savePositions();
        await tg(
          `📈 <b>SL+ ${pos.symbol}[${pos.tf}] → ${lvl.label}</b>\n` +
          `P&L: +${pnlPct.toFixed(2)}%\nNew SL: $${roundPrice(newSl)}`,
          T_EVAL
        );
        break; // Only one level at a time
      }
    }

    // ── HARD STOP BOT-SIDE: force close -3% tanpa nunggu plan order ──
    if (pnlPct < -3) {
      log(`🚨 HARD STOP ${pos.symbol} P&L:${pnlPct.toFixed(2)}% — force close NOW`, 'ERROR');
      const closed = await forceClose(pos.symbol, pos.dir.toLowerCase(), 'HARD_STOP_-3pct');
      if (closed) {
        positions = positions.filter(p => p.symbol !== pos.symbol);
        cooldowns[pos.symbol] = now + 60 * 60000;
        tradeHistory.push({ ...pos, closeTs: now, closeReason: 'HARD_STOP', closePrice: markPrice, pnlPct });
        savePositions(); saveHistory();
        await tg(`🚨 <b>HARD STOP -3% ${pos.symbol}</b>\nP&L: ${pnlPct.toFixed(2)}%\nMargin diselamatkan`, T_EVAL);
        runLearning();
      }
      continue;
    }

    // ── EMERGENCY SL (if plan order failed) ──
    if (!pos.slOk) {
      const breached = pos.dir === 'LONG' ? markPrice <= pos.slPrice : markPrice >= pos.slPrice;
      if (breached) {
        const closed = await forceClose(pos.symbol, pos.dir.toLowerCase(), 'Emergency SL');
        if (closed) {
          positions = positions.filter(p => p.symbol !== pos.symbol);
          cooldowns[pos.symbol] = now + 30 * 60000;
          tradeHistory.push({ ...pos, closeTs: now, closeReason: 'EMERGENCY_SL', closePrice: markPrice });
          savePositions(); saveHistory();
          await tg(`🚨 <b>Emergency SL ${pos.symbol}</b>\nP&L: ${pnlPct.toFixed(2)}%`, T_EVAL);
        }
        continue;
      }
    }

    // ── MAX HOLD TIME ──
    if (now - pos.openTs > pos.maxHoldMs) {
      log(`⏰ Max hold time (${pos.tf}) for ${pos.symbol}`, 'WARN');
      await forceClose(pos.symbol, pos.dir.toLowerCase(), 'Max hold');
      positions = positions.filter(p => p.symbol !== pos.symbol);
      tradeHistory.push({ ...pos, closeTs: now, closeReason: 'MAX_HOLD', closePrice: markPrice });
      savePositions(); saveHistory();
      await tg(`⏰ <b>Max hold close ${pos.symbol}[${pos.tf}]</b>\nP&L: ${pnlPct.toFixed(2)}%`, T_EVAL);
    }
  }
}

// ── MAIN SCAN ─────────────────────────────────────────────────
async function scan() {
  if (positions.length >= CFG.MAX_POSITIONS) {
    log(`⏸️  Max positions — skip scan`);
    return;
  }

  log(`🔍 Scanning ${CFG.TOP_N} futures pairs across 15m/30m/1H...`);
  checkAndRunScheduledLearning(Date.now());

  const tickers = await api('GET', '/api/v2/mix/market/tickers', { productType: CFG.PRODUCT_TYPE }, null, true);
  if (!tickers) return;

  const candidates = tickers
    .filter(t => t.symbol?.endsWith('USDT') && parseFloat(t.usdtVolume || 0) >= CFG.MIN_VOL_USDT)
    .sort((a, b) => parseFloat(b.usdtVolume) - parseFloat(a.usdtVolume))
    .slice(0, CFG.TOP_N);

  log(`📋 ${candidates.length} candidates`);

  const signals = [];
  for (const t of candidates) {
    const sym = t.symbol;
    if (cooldowns[sym] && cooldowns[sym] > Date.now()) continue;
    if (positions.find(p => p.symbol === sym)) continue;

    try {
      const sig = await scanCoin(sym);
      if (sig) {
        signals.push(sig);
        const mtf = sig.alignCount >= 2 ? ` 🔗MTF(${sig.alignCount}TF)` : '';
        log(`🎯 ${sym}[${sig.tf}]${mtf} ${sig.dir} | RSI:${sig.rsi.toFixed(1)} R:R:${sig.rr.toFixed(1)} score:${sig.score.toFixed(0)}`);
      }
    } catch (_) {}
  }

  if (!signals.length) {
    log(`⏳ No signal (RSI+Fib criteria not met)`);
    return;
  }

  // Sort by score, execute best
  signals.sort((a, b) => b.score - a.score);
  log(`🏆 Best: ${signals[0].symbol}[${signals[0].tf}] score:${signals[0].score.toFixed(0)}`);
  await executeTrade(signals[0]);
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  log('====================================================');
  log('BITGET FUTURES AUTONOMOUS TRADER v4.5-RISK — MTF+FIB');
  log(`TF: 15m(${TF['15m'].fibExtTP}ext) | 30m(${TF['30m'].fibExtTP}ext) | 1H(${TF['1H'].fibExtTP}ext)`);
  log(`RSI: LONG<${CFG.RSI_LONG_MAX} SHORT>${CFG.RSI_SHORT_MIN} | Fib entry zone: ${CFG.FIB_ENTRY_MIN*100}%-${CFG.FIB_ENTRY_MAX*100}%`);
  log(`Leverage: ${CFG.LEVERAGE}x | Top ${CFG.TOP_N} pairs | Min vol $${CFG.MIN_VOL_USDT/1e6}M`);
  log(`SL+: BE@0.5% → +1%@1.5% → +2%@2.5%`);
  log('====================================================');

  loadState();
  log(`📂 Loaded ${positions.length} positions, ${tradeHistory.length} history`);
  checkAndRunScheduledLearning(Date.now());

  const wins  = tradeHistory.filter(t => t.pnl > 0 || t.closeReason?.includes('TP')).length;
  if (tradeHistory.length) log(`📊 Stats: ${tradeHistory.length} trades | ${wins} wins | WR:${(wins/tradeHistory.length*100).toFixed(0)}%`);

  await tg(
    `🤖 <b>Futures Trader v4.2 STARTED</b>\n` +
    `📐 Multi-TF: 15m / 30m / 1H\n` +
    `📏 TP/SL: Fibonacci swing high/low\n` +
    `📈 SL+: BE→+1%→+2% ladder\n` +
    `RSI LONG<${CFG.RSI_LONG_MAX} SHORT>${CFG.RSI_SHORT_MIN}\n` +
    `Positions loaded: ${positions.length}`,
    T_TRADES
  );

  // Monitor loop
  setInterval(async () => {
    try { await monitorPositions(); } catch (e) { log(`Monitor err: ${e.message}`, 'ERROR'); }
  }, CFG.MONITOR_MS);

  // Scan loop
  const doScan = async () => {
    try { await scan(); } catch (e) { log(`Scan err: ${e.message}`, 'ERROR'); }
    setTimeout(doScan, CFG.SCAN_INTERVAL);
  };
  setTimeout(doScan, 3000);
}

main().catch(e => { log(`FATAL: ${e.message}`, 'ERROR'); process.exit(1); });
