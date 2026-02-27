#!/usr/bin/env node
/**
 * learning-v4.js v2.0 — FULL AUTONOMOUS SELF-LEARNING ENGINE
 * 
 * Runs after EVERY trade close. Analyzes patterns, writes new lessons,
 * adjusts strategy params, and improves itself over time.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const DIR          = '/root/trading-bot';
const HISTORY_FILE = path.join(DIR, 'bitget-futures-v4-history.json');
const PARAMS_FILE  = path.join(DIR, 'learned-params.json');
const LESSONS_FILE = path.join(DIR, 'bitget-lessons.json');
const CREDS        = JSON.parse(fs.readFileSync(path.join(DIR, 'bitget-credentials.json')));

const TG_TOKEN = '8440050300:AAFONxv0lMjl9Os_pIdn8bdf4uFgiBod8zU';
const TG_CHAT  = '-1003212463774';
const T_EVAL   = 25;

function tg(msg) {
  return new Promise(res => {
    const body = JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML', message_thread_id: T_EVAL });
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${TG_TOKEN}/sendMessage`,
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    }, r => { r.resume(); res(); });
    req.on('error', () => res());
    req.write(body); req.end();
  });
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE)); }
  catch { return []; }
}

function loadParams() {
  try { return JSON.parse(fs.readFileSync(PARAMS_FILE)); }
  catch {
    return {
      RSI_LONG_MAX: 44, RSI_SHORT_MIN: 56,
      MIN_RR: 1.5, PAUSE_TF: [], PAUSE_DIR: [],
      POSITION_PCT: 0.20, MAX_SL_PCT: 3.0,
      VERSION: 1, LESSONS_LEARNED: 0
    };
  }
}

function loadLessons() {
  try { return JSON.parse(fs.readFileSync(LESSONS_FILE)); }
  catch { return []; }
}

function saveParams(p) {
  fs.writeFileSync(PARAMS_FILE, JSON.stringify(p, null, 2));
}

function saveLessons(l) {
  fs.writeFileSync(LESSONS_FILE, JSON.stringify(l, null, 2));
}

// ── CORE LEARNING ANALYSIS ────────────────────────────────────
async function learn() {
  const history = loadHistory();
  const params  = loadParams();
  const lessons = loadLessons();

  if (!history.length) {
    console.log('No history yet — nothing to learn');
    return;
  }

  const recent = history.slice(-20); // last 20 trades
  const wins   = recent.filter(t => t.closeReason === 'BITGET_AUTO' && (t.pnlPct > 0));
  const losses = recent.filter(t => t.pnlPct <= 0 || t.closeReason === 'HARD_STOP' || t.closeReason === 'EMERGENCY_SL');

  const winRate = wins.length / recent.length;
  const avgWinPct  = wins.length  ? wins.reduce((s,t)  => s + (t.pnlPct||0), 0) / wins.length  : 0;
  const avgLossPct = losses.length? losses.reduce((s,t) => s + Math.abs(t.pnlPct||0), 0) / losses.length : 0;
  const expectancy = (winRate * avgWinPct) - ((1 - winRate) * avgLossPct);

  // Consecutive losses
  let consLoss = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].pnlPct < 0 || history[i].closeReason === 'HARD_STOP') consLoss++;
    else break;
  }

  // Consecutive wins
  let consWin = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].pnlPct > 0) consWin++;
    else break;
  }

  // Per-TF stats
  const tfStats = {};
  for (const t of recent) {
    if (!t.tf) continue;
    if (!tfStats[t.tf]) tfStats[t.tf] = { wins: 0, total: 0 };
    tfStats[t.tf].total++;
    if (t.pnlPct > 0) tfStats[t.tf].wins++;
  }

  // Per-dir stats
  const dirStats = {};
  for (const t of recent) {
    if (!t.dir) continue;
    if (!dirStats[t.dir]) dirStats[t.dir] = { wins: 0, total: 0 };
    dirStats[t.dir].total++;
    if (t.pnlPct > 0) dirStats[t.dir].wins++;
  }

  const changes = [];
  const newLessons = [];
  const now = new Date().toISOString();

  // ── RULE 1: 3+ consecutive losses → tighten ──────────────
  if (consLoss >= 3) {
    const oldRsiL = params.RSI_LONG_MAX;
    const oldRsiS = params.RSI_SHORT_MIN;
    params.RSI_LONG_MAX  = Math.max(38, params.RSI_LONG_MAX  - 2);
    params.RSI_SHORT_MIN = Math.min(62, params.RSI_SHORT_MIN + 2);
    params.MIN_RR        = Math.min(3.0, params.MIN_RR + 0.3);
    changes.push(`RSI tightened: ${oldRsiL}/${oldRsiS} → ${params.RSI_LONG_MAX}/${params.RSI_SHORT_MIN}`);
    changes.push(`MIN_RR raised: → ${params.MIN_RR.toFixed(1)}`);
    
    newLessons.push({
      timestamp: now, event: 'AUTO_TIGHTEN_AFTER_LOSSES',
      trigger: `${consLoss} consecutive losses`,
      action: `RSI tightened to ${params.RSI_LONG_MAX}/${params.RSI_SHORT_MIN}, MIN_RR → ${params.MIN_RR}`,
      expectancy: expectancy.toFixed(2)
    });
  }

  // ── RULE 2: TF win rate < 35% (min 4 trades) → pause TF ──
  for (const [tf, stat] of Object.entries(tfStats)) {
    if (stat.total >= 4 && stat.wins / stat.total < 0.35) {
      if (!params.PAUSE_TF.includes(tf)) {
        params.PAUSE_TF.push(tf);
        changes.push(`PAUSE_TF: ${tf} (WR ${(stat.wins/stat.total*100).toFixed(0)}%)`);
        newLessons.push({
          timestamp: now, event: 'AUTO_PAUSE_TF',
          tf, winRate: (stat.wins/stat.total).toFixed(2),
          action: `Paused TF ${tf} — too many losses`,
          trades: stat.total
        });
      }
    } else if (stat.total >= 6 && stat.wins / stat.total >= 0.50) {
      params.PAUSE_TF = params.PAUSE_TF.filter(t => t !== tf);
      if (changes.indexOf(`RESUME_TF: ${tf}`) === -1) {
        changes.push(`RESUME_TF: ${tf} (WR improving)`);
      }
    }
  }

  // ── RULE 3: Direction WR < 35% → pause direction ──────────
  for (const [dir, stat] of Object.entries(dirStats)) {
    if (stat.total >= 4 && stat.wins / stat.total < 0.35) {
      if (!params.PAUSE_DIR.includes(dir)) {
        params.PAUSE_DIR.push(dir);
        changes.push(`PAUSE_DIR: ${dir} (WR ${(stat.wins/stat.total*100).toFixed(0)}%)`);
        newLessons.push({
          timestamp: now, event: 'AUTO_PAUSE_DIRECTION',
          dir, winRate: (stat.wins/stat.total).toFixed(2),
          action: `Paused direction ${dir}`
        });
      }
    } else if (stat.total >= 6 && stat.wins / stat.total >= 0.50) {
      params.PAUSE_DIR = params.PAUSE_DIR.filter(d => d !== dir);
    }
  }

  // ── RULE 4: WR > 60% for 10+ trades → loosen params ──────
  if (recent.length >= 10 && winRate > 0.60) {
    params.RSI_LONG_MAX  = Math.min(46, params.RSI_LONG_MAX  + 1);
    params.RSI_SHORT_MIN = Math.max(54, params.RSI_SHORT_MIN - 1);
    params.MIN_RR        = Math.max(1.5, params.MIN_RR - 0.1);
    changes.push(`RSI loosened (WR ${(winRate*100).toFixed(0)}%): → ${params.RSI_LONG_MAX}/${params.RSI_SHORT_MIN}`);
    newLessons.push({
      timestamp: now, event: 'AUTO_LOOSEN_HIGH_WINRATE',
      winRate: winRate.toFixed(2), trades: recent.length,
      action: 'RSI loosened — high win rate detected'
    });
  }

  // ── RULE 5: 2 consecutive wins → partial reset ─────────────
  if (consWin >= 2 && params.RSI_LONG_MAX < 44) {
    params.RSI_LONG_MAX  = Math.min(44, params.RSI_LONG_MAX  + 1);
    params.RSI_SHORT_MIN = Math.max(56, params.RSI_SHORT_MIN - 1);
    changes.push(`RSI partial reset after ${consWin} wins`);
  }

  // ── RULE 6: Negative expectancy → reassess everything ─────
  if (recent.length >= 8 && expectancy < -2) {
    params.MIN_RR = Math.min(3.5, params.MIN_RR + 0.5);
    newLessons.push({
      timestamp: now, event: 'NEGATIVE_EXPECTANCY_DETECTED',
      expectancy: expectancy.toFixed(2), trades: recent.length,
      action: `MIN_RR raised to ${params.MIN_RR} — negative expectancy detected`,
      recommendation: 'Review entry criteria — system may be in bad market regime'
    });
    changes.push(`⚠️ Negative expectancy ${expectancy.toFixed(2)} — MIN_RR raised to ${params.MIN_RR}`);
  }

  // ── RULE 7: Hard stop pattern → write lesson ───────────────
  const hardStops = recent.filter(t => t.closeReason === 'HARD_STOP');
  if (hardStops.length >= 2) {
    // Check if hard stops happened on same TF
    const hardStopTFs = [...new Set(hardStops.map(t => t.tf))];
    for (const tf of hardStopTFs) {
      const tfHardStops = hardStops.filter(t => t.tf === tf);
      if (tfHardStops.length >= 2 && !params.PAUSE_TF.includes(tf)) {
        params.PAUSE_TF.push(tf);
        newLessons.push({
          timestamp: now, event: 'HARD_STOP_PATTERN',
          tf, count: tfHardStops.length,
          action: `Paused TF ${tf} — repeated hard stops indicate bad market regime for this TF`
        });
        changes.push(`PAUSE_TF: ${tf} (repeated HARD_STOP)`);
      }
    }
  }

  // ── Update version & lesson count ─────────────────────────
  params.VERSION = (params.VERSION || 1) + 1;
  params.LESSONS_LEARNED = (params.LESSONS_LEARNED || 0) + newLessons.length;
  params.lastUpdated = now;
  params.stats = {
    recent: recent.length, winRate: winRate.toFixed(2),
    avgWin: avgWinPct.toFixed(2), avgLoss: avgLossPct.toFixed(2),
    expectancy: expectancy.toFixed(2), consLoss, consWin
  };

  // Save
  saveParams(params);
  if (newLessons.length) {
    const all = loadLessons();
    all.push(...newLessons);
    saveLessons(all);
  }

  // ── Telegram Report ────────────────────────────────────────
  const statsLine = `WR: ${(winRate*100).toFixed(0)}% | Exp: ${expectancy.toFixed(2)}% | ${recent.length} trades`;
  const pauseLine = params.PAUSE_TF.length || params.PAUSE_DIR.length 
    ? `\n⏸ Paused: TF[${params.PAUSE_TF.join(',')||'-'}] Dir[${params.PAUSE_DIR.join(',')||'-'}]` 
    : '';

  let msg = `🧠 <b>Learning Cycle v${params.VERSION}</b>\n` +
    `${statsLine}${pauseLine}\n` +
    `RSI: LONG<${params.RSI_LONG_MAX} SHORT>${params.RSI_SHORT_MIN} | MIN_RR: ${params.MIN_RR}\n`;
  
  if (changes.length) {
    msg += `\n📝 Changes:\n${changes.map(c => `• ${c}`).join('\n')}`;
  } else {
    msg += `\n✅ Params stable — no changes needed`;
  }
  if (newLessons.length) {
    msg += `\n\n📚 +${newLessons.length} new lesson(s) recorded`;
  }

  await tg(msg);
  console.log('Learning cycle complete. Changes:', changes.length, '| New lessons:', newLessons.length);
  console.log('Stats:', JSON.stringify(params.stats));
}

learn().catch(e => {
  console.error('Learning error:', e.message);
  process.exit(1);
});
