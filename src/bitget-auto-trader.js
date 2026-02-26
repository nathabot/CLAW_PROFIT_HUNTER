#!/usr/bin/env node
// BITGET AUTONOMOUS TRADER v1.0
// Full autonomous trading with self-learning
// Updated: 2026-02-26

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { RSI, MACD, EMA, ATR } = require('technicalindicators');

const BITGET_BASE_URL = 'https://api.bitget.com';

// Dynamic TP/SL based on ATR
function calculateDynamicTP_SL(candles) {
  if (!candles || candles.length < 20) {
    return { method: 'FIXED', tpPct: 3, slPct: 1.5 };
  }
  
  const highs = candles.map(c => parseFloat(c[2])).reverse();
  const lows = candles.map(c => parseFloat(c[3])).reverse();
  const closes = candles.map(c => parseFloat(c[4])).reverse();
  
  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atr = atrValues[atrValues.length - 1];
  const price = closes[closes.length - 1];
  const atrPct = (atr / price) * 100;
  
  const slPct = Math.max(atrPct, 1);
  const tpPct = Math.max(atrPct * 2, 2);
  
  return {
    method: 'ATR',
    atr: atr.toFixed(4),
    tpPct: Math.min(tpPct, 8),
    slPct: Math.min(slPct, 4)
  };
}

// Anti-pucuk: avoid entry when price too far above EMA
function isGoodEntryZone(candles, ta) {
  if (!candles || candles.length < 20 || !ta || !ta.valid) return { good: false, reason: 'No TA data' };
  
  const closes = candles.map(c => parseFloat(c[4])).reverse();
  const emaValues = EMA.calculate({ period: 20, values: closes });
  const ema20 = emaValues[emaValues.length - 1];
  const currentPrice = closes[closes.length - 1];
  
  const distanceFromEMA = ((currentPrice - ema20) / ema20) * 100;
  
  // Good entry: price within 2% above EMA (pullback zone)
  // Bad entry: price > 5% above EMA (likely "pucuk")
  if (distanceFromEMA > 5) {
    return { good: false, reason: `Too far above EMA (${distanceFromEMA.toFixed(1)}%)` };
  }
  
  if (distanceFromEMA < -3) {
    return { good: false, reason: `Below EMA (${distanceFromEMA.toFixed(1)}%) - wait for bounce` };
  }
  
  return { good: true, reason: `Good zone - ${distanceFromEMA.toFixed(1)}% from EMA` };
}
const POSITIONS_FILE = '/root/trading-bot/bitget-positions.json';
const COOLDOWNS_FILE = '/root/trading-bot/bitget-cooldowns.json';
const LOG_FILE = '/root/trading-bot/logs/bitget-auto-trader.log';

// Load configs
const config = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-system-config.json', 'utf8'));
const creds = JSON.parse(fs.readFileSync('/root/trading-bot/bitget-credentials.json', 'utf8'));
const { TELEGRAM_BOT_TOKEN } = require('/root/trading-bot/src/env-loader');

const BOT_TOKEN = TELEGRAM_BOT_TOKEN || '${TELEGRAM_BOT_TOKEN}';
const CHAT_ID = config.TELEGRAM_CHAT_ID;

// Ensure log dir
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// State
let positions = [];
let cooldowns = [];
let learning = null;

// Try to load learning module
try {
  learning = require('/root/trading-bot/src/bitget-learning.js');
  learning = new learning();
} catch (e) {
  console.log('Learning module not available:', e.message);
}

// ============= UTILS =============

function log(msg) {
  const ts = `[${new Date().toLocaleTimeString('id-ID')}]`;
  const line = `${ts} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
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

  const res = await fetch(BITGET_BASE_URL + endpoint, {
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
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: msg,
        message_thread_id: topicId,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    log(`Telegram error: ${e.message}`);
  }
}

function loadState() {
  if (fs.existsSync(POSITIONS_FILE)) {
    positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
  }
  if (fs.existsSync(COOLDOWNS_FILE)) {
    cooldowns = JSON.parse(fs.readFileSync(COOLDOWNS_FILE, 'utf8'));
  }
}

function saveState() {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
  fs.writeFileSync(COOLDOWNS_FILE, JSON.stringify(cooldowns, null, 2));
}

// ============= EXECUTOR =============

async function getBalance(coin = 'USDT') {
  const assets = await request('GET', '/api/v2/spot/account/assets');
  const asset = assets.find(a => a.coin === coin);
  return asset ? parseFloat(asset.available) : 0;
}

async function getPrice(symbol) {
  const tickers = await request('GET', `/api/v2/spot/market/tickers?symbol=${symbol}`);
  return tickers ? parseFloat(tickers.lastPr) : null;
}

async function buyMarket(symbol, usdtAmount) {
  const order = {
    symbol,
    side: 'buy',
    orderType: 'market',
    force: 'gtc',
    quoteSize: usdtAmount.toString()
  };
  return await request('POST', '/api/v2/spot/trade/place-order', order);
}

async function sellMarket(symbol, quantity) {
  const order = {
    symbol,
    side: 'sell',
    orderType: 'market',
    force: 'gtc',
    size: quantity.toString()
  };
  return await request('POST', '/api/v2/spot/trade/place-order', order);
}

// ============= SCANNER =============

async function fetchCandles(symbol, granularity = '15min', limit = 60) {
  try {
    const data = await request('GET', `/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`, null, true);
    return data;
  } catch (e) {
    return null;
  }
}

function calculateTA(candles) {
  if (!candles || candles.length < 26) return { valid: false };
  try {
    const closes = candles.map(c => parseFloat(c[4])).reverse();
    const volumes = candles.map(c => parseFloat(c[5])).reverse();

    const rsiValues = RSI.calculate({ period: 14, values: closes });
    const rsi = rsiValues[rsiValues.length - 1];

    const macdValues = MACD.calculate({
      values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      SimpleMAOscillator: false, SimpleMASignal: false
    });
    const macdLast = macdValues[macdValues.length - 1];
    const macdPrev = macdValues[macdValues.length - 2];
    const macdCrossover = macdLast?.histogram > 0 && macdPrev?.histogram <= 0;
    const macdBullish = macdLast?.histogram > 0;

    const ema20Values = EMA.calculate({ period: 20, values: closes });
    const ema20 = ema20Values[ema20Values.length - 1];
    const currentPrice = closes[closes.length - 1];
    const aboveEma20 = currentPrice > ema20;

    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const prevVol = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const volumeRising = recentVol > prevVol * 1.1;

    return {
      valid: true,
      rsi: parseFloat(rsi?.toFixed(2)),
      macdBullish,
      macdCrossover,
      aboveEma20,
      volumeRising,
      bullishSignals: [aboveEma20, macdBullish, rsi < 70, volumeRising].filter(Boolean).length
    };
  } catch (e) {
    return { valid: false };
  }
}

async function scanMarket() {
  log('🔍 Scanning market...');
  const tickers = await request('GET', '/api/v2/spot/market/tickers');
  const usdtPairs = tickers.filter(t => t.symbol && t.symbol.endsWith('USDT'));

  // Clean cooldowns
  const now = Date.now();
  cooldowns = cooldowns.filter(c => c.expiresAt > now);
  saveState();

  const scored = [];

  for (const ticker of usdtPairs.slice(0, 50)) { // Limit API calls
    const changePct = Math.abs(parseFloat(ticker.change24h || 0)) * 100;
    const vol = parseFloat(ticker.usdtVolume || ticker.quoteVolume || 0);

    if (changePct < 2 || vol < 250000) continue;

    // Skip if on cooldown
    if (cooldowns.find(c => c.symbol === ticker.symbol)) continue;

    // Skip if already in position
    if (positions.find(p => p.symbol === ticker.symbol)) continue;

    const candles = await fetchCandles(ticker.symbol);
    const ta = calculateTA(candles);

    if (!ta.valid) continue;

    // Calculate score
    let score = 0;
    score += Math.min(changePct * 1.5, 30);
    score += Math.min(Math.log10(vol) * 2, 20);
    if (ta.rsi >= config.RSI_MIN && ta.rsi <= config.RSI_MAX) score += 5;
    else if (ta.rsi > config.RSI_MAX) score -= 8;
    if (ta.macdCrossover) score += 10;
    if (ta.macdBullish) score += 4;
    if (ta.aboveEma20) score += 5;
    if (ta.volumeRising) score += 3;

    if (score >= config.MIN_SCORE && ta.bullishSignals >= config.MIN_BULLISH_SIGNALS) {
      // Get candles for TP/SL calculation
      const candles = await fetchCandles(ticker.symbol);
      const tpSl = calculateDynamicTP_SL(candles);
      const entryZone = isGoodEntryZone(candles, ta);
      
      scored.push({
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPr),
        change24h: changePct,
        volume: vol,
        score: parseFloat(score.toFixed(2)),
        ta,
        tpSl,
        entryZone
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

// ============= TRADING =============

async function executeTrade(candidate) {
  const usdtBalance = await getBalance('USDT');
  
  if (usdtBalance < config.MIN_USDT_TRADE) {
    log(`❌ Insufficient USDT: ${usdtBalance.toFixed(2)} (min ${config.MIN_USDT_TRADE})`);
    return false;
  }

  if (positions.length >= config.MAX_CONCURRENT_POSITIONS) {
    log('❌ Max positions reached');
    return false;
  }

  // Anti-pucuk: Check entry zone
  const entryCheck = candidate.entryZone || { good: true };
  if (!entryCheck.good) {
    log(`⏸️ Skipping ${candidate.symbol}: ${entryCheck.reason}`);
    return false;
  }

  // Dynamic TP/SL based on ATR
  const tpSl = candidate.tpSl || { tpPct: 3, slPct: 1.5, method: 'FIXED' };
  log(`📊 TP/SL for ${candidate.symbol}: TP +${tpSl.tpPct}% / SL -${tpSl.slPct}% (${tpSl.method})`);

  const tradeSize = usdtBalance * config.POSITION_SIZE_PCT;
  if (tradeSize < config.MIN_USDT_TRADE) {
    log(`❌ Trade size too small: $${tradeSize.toFixed(2)}`);
    return false;
  }

  log(`🚀 Executing BUY ${candidate.symbol} @ $${tradeSize.toFixed(2)}`);

  try {
    const result = await buyMarket(candidate.symbol, tradeSize);
    
    const position = {
      symbol: candidate.symbol,
      entryPrice: candidate.price,
      entryTime: Date.now(),
      size: tradeSize,
      tpPrice: candidate.price * (1 + tpSl.tpPct / 100),
      slPrice: candidate.price * (1 - tpSl.slPct / 100),
      tpPct: tpSl.tpPct,
      slPct: tpSl.slPct,
      trailingSl: candidate.price,
      signals: candidate.ta,
      score: candidate.score,
      tpMethod: tpSl.method
    };

    positions.push(position);
    saveState();

    const msg = `🚀 <b>BUY EXECUTED</b>\n\n` +
      `Pair: <b>${candidate.symbol}</b>\n` +
      `Entry: $${candidate.price}\n` +
      `Size: $${tradeSize.toFixed(2)}\n` +
      `TP: +${tpSl.tpPct}% ($${position.tpPrice.toFixed(6)})\n` +
      `SL: -${tpSl.slPct}% ($${position.slPrice.toFixed(6)})\n` +
      `Method: ${tpSl.method}\n` +
      `Entry Zone: ${entryCheck.reason}\n` +
      `Score: ${candidate.score} | RSI: ${candidate.ta.rsi}`;
    
    await sendTelegram(msg, config.TELEGRAM_TOPIC_TRADES);
    log(`✅ Position opened: ${candidate.symbol}`);
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
      const currentPrice = await getPrice(pos.symbol);
      if (!currentPrice) continue;

      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

      // Check trailing stop activation
      if (pnlPct >= config.TRAILING_STOP_ACTIVATE_PCT && pos.trailingSl === pos.entryPrice) {
        pos.trailingSl = pos.entryPrice * 1.005; // Move to +0.5% (breakeven + fees)
        log(`📈 Trailing stop activated for ${pos.symbol} at ${pos.trailingSl}`);
      }

      // Update trailing stop
      if (pos.trailingSl > pos.entryPrice && currentPrice < pos.trailingSl) {
        log(`🛡️ Trailing stop hit for ${pos.symbol}`);
        toClose.push({ pos, reason: 'TRAILING_STOP', pnlPct });
      }
      // Check TP
      else if (currentPrice >= pos.tpPrice) {
        log(`🎯 TP hit for ${pos.symbol}`);
        toClose.push({ pos, reason: 'TP', pnlPct });
      }
      // Check SL
      else if (currentPrice <= pos.slPrice) {
        log(`🛑 SL hit for ${pos.symbol}`);
        toClose.push({ pos, reason: 'SL', pnlPct });
      }
      // Check max hold time
      else if (Date.now() - pos.entryTime > config.MAX_HOLD_HOURS * 3600000) {
        log(`⏰ Max hold time reached for ${pos.symbol}`);
        toClose.push({ pos, reason: 'MAX_TIME', pnlPct });
      }
    } catch (e) {
      log(`Monitor error ${pos.symbol}: ${e.message}`);
    }
  }

  for (const { pos, reason, pnlPct } of toClose) {
    await closePosition(pos, reason, pnlPct);
  }
}

async function closePosition(pos, reason, pnlPct) {
  try {
    // Get current quantity
    const assets = await request('GET', '/api/v2/spot/account/assets');
    const asset = assets.find(a => a.coin === pos.symbol.replace('USDT', ''));
    if (!asset || parseFloat(asset.available) <= 0) {
      log(`❌ No balance to sell for ${pos.symbol}`);
      positions = positions.filter(p => p.symbol !== pos.symbol);
      saveState();
      return;
    }

    const qty = parseFloat(asset.available);
    await sellMarket(pos.symbol, qty);

    // Record trade for learning
    if (learning) {
      learning.recordTrade({
        symbol: pos.symbol,
        entryPrice: pos.entryPrice,
        exitPrice: pos.entryPrice * (1 + pnlPct / 100),
        pnlPct,
        reason,
        signals: pos.signals,
        score: pos.score
      });
    }

    // Add to cooldown if loss
    if (pnlPct < 0) {
      cooldowns.push({
        symbol: pos.symbol,
        expiresAt: Date.now() + config.COOLDOWN_AFTER_LOSS_MINUTES * 60000
      });
      saveState();
    }

    // Remove from positions
    positions = positions.filter(p => p.symbol !== pos.symbol);
    saveState();

    const emoji = pnlPct >= 0 ? '✅' : '❌';
    const msg = `${emoji} <b>POSITION CLOSED</b>\n\n` +
      `Pair: <b>${pos.symbol}</b>\n` +
      `Reason: ${reason}\n` +
      `Entry: $${pos.entryPrice}\n` +
      `P&L: <b>${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</b>`;

    await sendTelegram(msg, config.TELEGRAM_TOPIC_EVAL);
    log(`✅ Closed ${pos.symbol}: ${pnlPct.toFixed(2)}%`);

  } catch (e) {
    log(`❌ Close failed: ${e.message}`);
  }
}

// ============= MAIN LOOP =============

async function main() {
  log('=== Bitget Autonomous Trader v1.0 STARTED ===');
  
  loadState();
  
  // Send startup notification
  await sendTelegram('🤖 <b>Bitget Auto Trader Started</b>\n\nMode: Autonomous\nMin Score: ' + config.MIN_SCORE + '\nTP: +' + config.TAKE_PROFIT_PCT + '% | SL: -' + config.STOP_LOSS_PCT + '%', config.TELEGRAM_TOPIC_TRADES);

  let scanCounter = 0;

  while (true) {
    try {
      // Monitor positions every 30 seconds
      await monitorPositions();

      // Scan every 15 minutes (900 seconds / 30 = 30 cycles)
      scanCounter++;
      if (scanCounter >= 30) {
        scanCounter = 0;
        
        const candidates = await scanMarket();
        
        if (candidates.length > 0) {
          const msg = `🔍 <b>Scan Results</b>\n\n` +
            candidates.map((c, i) => `${i+1}. ${c.symbol} | Score: ${c.score} | RSI: ${c.ta.rsi} | ${c.ta.bullishSignals}/4`).join('\n');
          await sendTelegram(msg, config.TELEGRAM_TOPIC_SCANNER);

          // Execute best candidate
          const executed = await executeTrade(candidates[0]);
          if (!executed) {
            log('No trade executed');
          }
        } else {
          log('No qualified candidates found');
        }
      }

      // Show stats every hour
      if (scanCounter % 120 === 0 && learning) {
        const stats = learning.getStats();
        if (stats) {
          const msg = `📊 <b>Performance Stats</b>\n\n` +
            `Trades: ${stats.totalTrades} | Win Rate: ${stats.winRate}\n` +
            `Avg Win: ${stats.avgWin} | Avg Loss: ${stats.avgLoss}\n` +
            `Total P&L: ${stats.totalPnl}`;
          await sendTelegram(msg, config.TELEGRAM_TOPIC_PERFORMANCE);
        }
      }

    } catch (e) {
      log(`Main loop error: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 30000));
  }
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
