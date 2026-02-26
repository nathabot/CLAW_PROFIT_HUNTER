#!/usr/bin/env node
// BITGET SCANNER v2.0
// Platform: VPS Natha
// Features: TA-enhanced scoring (RSI, MACD, EMA20) + momentum filter
// Updated: 2026-02-26

const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { RSI, MACD, EMA } = require('technicalindicators');
const { TELEGRAM_BOT_TOKEN } = require('./env-loader');

const BITGET_BASE_URL = 'https://api.bitget.com';
const BOT_TOKEN = TELEGRAM_BOT_TOKEN || '${TELEGRAM_BOT_TOKEN}';
const CHAT_ID = '-1003212463774';

// Candle granularity: 1min, 5min, 15min, 30min, 1H, 4H, 1D
const CANDLE_GRANULARITY = '15min';
const CANDLE_LIMIT = 60; // 60 candles for TA calculation

class BitgetScanner {
  constructor(configPath = '/root/trading-bot/bitget-config.json') {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const credPath = '/root/trading-bot/bitget-credentials.json';
    if (!fs.existsSync(credPath)) throw new Error(`Credentials not found: ${credPath}`);
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    this.apiKey = creds.apiKey;
    this.secretKey = creds.secretKey;
    this.passphrase = creds.passphrase;

    this.resultsFile = '/root/trading-bot/bitget-scan-results.json';
    this.logFile = this.config.LOG_FILE || '/root/trading-bot/logs/bitget-trader.log';

    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    this.log('BitgetScanner v2.0 initialized (TA-enhanced)');
  }

  log(message) {
    const ts = `[${new Date().toLocaleTimeString('id-ID')}]`;
    const line = `${ts} ${message}`;
    console.log(line);
    try { fs.appendFileSync(this.logFile, line + '\n'); } catch (_) {}
  }

  generateSignature(timestamp, method, requestPath, body = '') {
    const msg = timestamp + method + requestPath + body;
    return crypto.createHmac('sha256', this.secretKey).update(msg).digest('base64');
  }

  async request(method, endpoint, body = null, isPublic = false) {
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json', 'locale': 'en-US' };

    if (!isPublic) {
      headers['ACCESS-KEY'] = this.apiKey;
      headers['ACCESS-SIGN'] = this.generateSignature(timestamp, method, endpoint, bodyStr);
      headers['ACCESS-TIMESTAMP'] = timestamp;
      headers['ACCESS-PASSPHRASE'] = this.passphrase;
    }

    try {
      const res = await fetch(BITGET_BASE_URL + endpoint, {
        method,
        headers,
        ...(body && { body: bodyStr })
      });
      const data = await res.json();
      if (data.code !== '00000') throw new Error(`Bitget API: ${data.msg || 'Unknown error'}`);
      return data.data;
    } catch (err) {
      this.log(`❌ API error [${endpoint}]: ${err.message}`);
      throw err;
    }
  }

  // Fetch all spot tickers (public endpoint)
  async fetchTickers() {
    this.log('📊 Fetching tickers...');
    const data = await this.request('GET', '/api/v2/spot/market/tickers', null, true);
    if (!data || !Array.isArray(data)) throw new Error('Invalid ticker data');
    this.log(`✅ ${data.length} tickers fetched`);
    return data;
  }

  // Fetch OHLCV candles for a symbol (public endpoint)
  async fetchCandles(symbol) {
    try {
      const endpoint = `/api/v2/spot/market/candles?symbol=${symbol}&granularity=${CANDLE_GRANULARITY}&limit=${CANDLE_LIMIT}`;
      const data = await this.request('GET', endpoint, null, true);
      // Bitget returns: [timestamp, open, high, low, close, volume, quoteVolume]
      return data;
    } catch (err) {
      return null;
    }
  }

  // Calculate TA signals from candle data
  calculateTA(candles) {
    if (!candles || candles.length < 26) {
      return { valid: false };
    }

    try {
      // Extract close prices (index 4) and volumes (index 5)
      const closes = candles.map(c => parseFloat(c[4])).reverse(); // oldest first
      const volumes = candles.map(c => parseFloat(c[5])).reverse();

      if (closes.length < 26) return { valid: false };

      // RSI (14)
      const rsiValues = RSI.calculate({ period: 14, values: closes });
      const rsi = rsiValues[rsiValues.length - 1];

      // MACD (12, 26, 9)
      const macdValues = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      const macdLast = macdValues[macdValues.length - 1];
      const macdPrev = macdValues[macdValues.length - 2];
      const macdCrossover = macdLast && macdPrev
        ? (macdLast.histogram > 0 && macdPrev.histogram <= 0) // bullish crossover
        : false;
      const macdBullish = macdLast ? macdLast.histogram > 0 : false;

      // EMA 20
      const ema20Values = EMA.calculate({ period: 20, values: closes });
      const ema20 = ema20Values[ema20Values.length - 1];
      const currentPrice = closes[closes.length - 1];
      const aboveEma20 = currentPrice > ema20;

      // Volume trend (last 5 vs prev 5)
      const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const prevVol = volumes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
      const volumeRising = recentVol > prevVol * 1.1; // 10% higher

      return {
        valid: true,
        rsi: parseFloat(rsi?.toFixed(2)),
        macdBullish,
        macdCrossover,
        aboveEma20,
        ema20: parseFloat(ema20?.toFixed(8)),
        volumeRising,
        // Signal summary
        bullishSignals: [aboveEma20, macdBullish, rsi < 70, volumeRising].filter(Boolean).length,
        // RSI classification
        rsiZone: rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  // Score a single pair
  scorePair(ticker, ta) {
    // change24h is a ratio (0.05 = 5%) — convert to percentage
    const priceChange24h = parseFloat(ticker.change24h || 0) * 100;
    const volume24h = parseFloat(ticker.usdtVolume || ticker.quoteVolume || 0);
    const priceChange1h = parseFloat(ticker.changeUtc24h || 0) * 100; // utc change as proxy

    let score = 0;
    const signals = [];

    // === BASIC MOMENTUM SIGNALS ===
    if (priceChange24h > this.config.MIN_PRICE_CHANGE_24H_PERCENT) {
      score += priceChange24h * 1.5;
      signals.push(`📈 24h +${priceChange24h.toFixed(1)}%`);
    }
    if (volume24h > this.config.MIN_VOLUME_24H_USD) {
      score += Math.log10(volume24h) * 2;
      signals.push(`💧 Vol $${(volume24h / 1e6).toFixed(1)}M`);
    }
    if (priceChange1h > 0.5) {
      score += priceChange1h * 4;
      signals.push(`⚡ 1h +${priceChange1h.toFixed(2)}%`);
    }

    // === TA SIGNALS (bonus points) ===
    if (ta && ta.valid) {
      // RSI: prefer 40-65 range (momentum but not overbought)
      if (ta.rsi >= 40 && ta.rsi <= 65) {
        score += 5;
        signals.push(`RSI ${ta.rsi} ✅`);
      } else if (ta.rsi > 65 && ta.rsi <= 70) {
        score += 2;
        signals.push(`RSI ${ta.rsi} ⚠️`);
      } else if (ta.rsi > 70) {
        score -= 8; // Overbought penalty
        signals.push(`RSI ${ta.rsi} ❌ OB`);
      } else if (ta.rsi < 30) {
        score += 3; // Oversold = potential reversal
        signals.push(`RSI ${ta.rsi} 🔄 OS`);
      }

      // MACD bullish
      if (ta.macdCrossover) {
        score += 10; // Strong signal: fresh crossover
        signals.push('MACD 🚀 Cross');
      } else if (ta.macdBullish) {
        score += 4;
        signals.push('MACD ✅');
      }

      // Above EMA20 = uptrend
      if (ta.aboveEma20) {
        score += 5;
        signals.push('EMA20 ✅');
      } else {
        score -= 3;
        signals.push('EMA20 ❌');
      }

      // Volume rising
      if (ta.volumeRising) {
        score += 3;
        signals.push('Vol↑ ✅');
      }
    }

    return { score: parseFloat(score.toFixed(2)), signals };
  }

  async scanMarket() {
    try {
      this.log('🔍 Starting Bitget TA-enhanced scan...');

      const tickers = await this.fetchTickers();
      const usdtPairs = tickers.filter(t => t.symbol && t.symbol.endsWith('USDT'));
      this.log(`📌 ${usdtPairs.length} USDT pairs found`);

      // Pre-filter: only pairs with some 24h movement and volume
      // NOTE: change24h is a RATIO (0.05 = 5%), not a percentage
      const preFiltered = usdtPairs.filter(t => {
        const changePct = Math.abs(parseFloat(t.change24h || 0)) * 100;
        const vol = parseFloat(t.usdtVolume || t.quoteVolume || 0);
        return changePct > 1 && vol > this.config.MIN_VOLUME_24H_USD * 0.5;
      });
      this.log(`⚡ Pre-filtered to ${preFiltered.length} candidates for TA analysis`);

      // Fetch candles and calculate TA for pre-filtered pairs
      const scored = [];
      let processed = 0;

      for (const ticker of preFiltered) {
        try {
          // Rate limit: avoid hammering API
          if (processed > 0 && processed % 10 === 0) {
            await new Promise(r => setTimeout(r, 500));
          }

          const candles = await this.fetchCandles(ticker.symbol);
          const ta = this.calculateTA(candles);
          const { score, signals } = this.scorePair(ticker, ta);

          if (score > 0) {
            scored.push({
              symbol: ticker.symbol,
              price: parseFloat(ticker.lastPr),
              priceChange24h: parseFloat(ticker.change24h || 0) * 100,
              priceChange1h: parseFloat(ticker.changeUtc24h || 0) * 100,
              volume24h: parseFloat(ticker.usdtVolume || ticker.quoteVolume || 0),
              score,
              signals,
              ta: ta.valid ? {
                rsi: ta.rsi,
                rsiZone: ta.rsiZone,
                macdBullish: ta.macdBullish,
                macdCrossover: ta.macdCrossover,
                aboveEma20: ta.aboveEma20,
                volumeRising: ta.volumeRising,
                bullishSignals: ta.bullishSignals
              } : null
            });
          }
          processed++;
        } catch (_) {
          processed++;
        }
      }

      // Sort by score
      scored.sort((a, b) => b.score - a.score);
      const top10 = scored.slice(0, 10);

      this.log(`🎯 Top ${top10.length} candidates scored`);

      const results = {
        timestamp: new Date().toISOString(),
        scanTime: new Date().toLocaleString('id-ID'),
        granularity: CANDLE_GRANULARITY,
        totalPairs: usdtPairs.length,
        preFiltered: preFiltered.length,
        qualified: scored.length,
        top10
      };

      fs.writeFileSync(this.resultsFile, JSON.stringify(results, null, 2));
      this.log(`✅ Results saved to ${this.resultsFile}`);

      await this.sendTopCandidates(top10.slice(0, 3));
      return results;

    } catch (err) {
      this.log(`❌ Scan failed: ${err.message}`);
      throw err;
    }
  }

  async sendTopCandidates(candidates) {
    if (!candidates.length) return;

    try {
      let msg = '🔥 <b>Bitget Scanner v2.0</b>\n';
      msg += `📊 TA: RSI + MACD + EMA20\n\n`;

      candidates.forEach((p, i) => {
        const dir = p.priceChange24h >= 0 ? '🟢' : '🔴';
        msg += `${i + 1}. <b>${p.symbol}</b> ${dir}\n`;
        msg += `   Price: $${p.price < 0.01 ? p.price.toFixed(8) : p.price.toFixed(4)}\n`;
        msg += `   24h: ${p.priceChange24h > 0 ? '+' : ''}${p.priceChange24h.toFixed(2)}%\n`;
        msg += `   Vol: $${(p.volume24h / 1e6).toFixed(1)}M\n`;
        if (p.ta) {
          msg += `   RSI: ${p.ta.rsi} (${p.ta.rsiZone})\n`;
          msg += `   MACD: ${p.ta.macdBullish ? '✅' : '❌'} ${p.ta.macdCrossover ? '🚀 CROSS' : ''}\n`;
          msg += `   EMA20: ${p.ta.aboveEma20 ? '✅ Above' : '❌ Below'}\n`;
          msg += `   Bullish: ${p.ta.bullishSignals}/4 signals\n`;
        }
        msg += `   Score: <b>${p.score}</b>\n\n`;
      });

      msg += `⏰ ${new Date().toLocaleString('id-ID')}`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: msg,
          message_thread_id: this.config.TELEGRAM_TOPIC_SCANNER || 22,
          parse_mode: 'HTML'
        })
      });

      this.log('✅ Top candidates sent to Telegram');
    } catch (err) {
      this.log(`⚠️ Telegram send failed: ${err.message}`);
    }
  }
}

if (require.main === module) {
  (async () => {
    try {
      const scanner = new BitgetScanner();
      const results = await scanner.scanMarket();
      console.log(`\n✅ Scan complete. ${results.qualified} qualified, top 10 saved.`);
      process.exit(0);
    } catch (err) {
      console.error('\n❌ Scan failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = BitgetScanner;
