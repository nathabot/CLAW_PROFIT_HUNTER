#!/usr/bin/env node
// GHOSTMARKET + MEMORYPALACE + DEBTTOFUTURE
// Phase 1: Hours 1-2 of 12-hour compressed implementation

const fs = require('fs');
const path = require('path');

const CONFIG = {
  VIRTUAL_BET_SIZE: 0.001,  // SOL - bet on your own trades
  LEARNING_RATE: 30,        // minutes learning = 1 trade credit
  MEMORY_GRAPH_FILE: '/root/trading-bot/memory-graph.json',
  TRADE_CREDITS_FILE: '/root/trading-bot/trade-credits.json',
  GHOST_BETS_FILE: '/root/trading-bot/ghost-bets.json'
};

class SoulCorePhase1 {
  constructor() {
    this.memoryGraph = this.loadMemoryGraph();
    this.tradeCredits = this.loadTradeCredits();
    this.ghostBets = this.loadGhostBets();
  }

  // GHOSTMARKET: Bet on your own trades before executing
  async placeGhostBet(tradeSetup) {
    const bet = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      token: tradeSetup.token,
      setup: tradeSetup.setup,
      entryPrice: tradeSetup.entryPrice,
      targetPrice: tradeSetup.targetPrice,
      stopPrice: tradeSetup.stopPrice,
      betAmount: CONFIG.VIRTUAL_BET_SIZE,
      predictedOutcome: 'WIN', // You bet on yourself
      status: 'PENDING'
    };

    this.ghostBets.push(bet);
    this.saveGhostBets();

    console.log('👻 GHOSTMARKET: Bet placed on your own trade');
    console.log(`   Token: ${bet.token}`);
    console.log(`   Bet: ${bet.betAmount} SOL on SUCCESS`);
    console.log(`   Potential reward: ${(bet.betAmount * 2).toFixed(4)} SOL if correct\n`);

    return bet;
  }

  // Resolve ghost bet after trade completes
  resolveGhostBet(tradeId, actualOutcome, pnlPercent) {
    const bet = this.ghostBets.find(b => b.id === tradeId);
    if (!bet) return;

    const won = (actualOutcome === 'WIN' && bet.predictedOutcome === 'WIN') ||
                (actualOutcome === 'LOSS' && bet.predictedOutcome === 'LOSS');

    bet.status = won ? 'WON' : 'LOST';
    bet.actualOutcome = actualOutcome;
    bet.actualPnl = pnlPercent;
    bet.resolvedAt = new Date().toISOString();

    this.saveGhostBets();

    console.log(`👻 GHOSTMARKET: Bet ${bet.status}`);
    console.log(`   ${won ? '✅ You knew yourself!' : '❌ Misjudgment'}`);
    console.log(`   PnL: ${pnlPercent}%\n`);
  }

  // MEMORYPALACE: Externalized cognition graph
  logDecision(decision) {
    const node = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      type: decision.type, // 'THOUGHT', 'ANALYSIS', 'ACTION', 'RESULT'
      content: decision.content,
      context: decision.context,
      relatedTo: decision.relatedTo || null,
      tags: decision.tags || []
    };

    this.memoryGraph.nodes.push(node);

    // Create edges if related to previous decisions
    if (node.relatedTo) {
      this.memoryGraph.edges.push({
        from: node.relatedTo,
        to: node.id,
        type: 'LEADS_TO'
      });
    }

    this.saveMemoryGraph();

    console.log('🏛️ MEMORYPALACE: Decision logged');
    console.log(`   Type: ${node.type}`);
    console.log(`   Content: ${node.content.substring(0, 50)}...`);
    console.log(`   Total nodes: ${this.memoryGraph.nodes.length}\n`);
  }

  // Query memory graph
  queryMemory(tags) {
    return this.memoryGraph.nodes.filter(node => 
      tags.some(tag => node.tags.includes(tag))
    );
  }

  // DEBTTOFUTURE: Learning credits
  addLearningCredit(minutesLearned) {
    const credits = Math.floor(minutesLearned / CONFIG.LEARNING_RATE);
    this.tradeCredits.available += credits;
    this.tradeCredits.totalEarned += credits;
    this.tradeCredits.learningLog.push({
      timestamp: new Date().toISOString(),
      minutes: minutesLearned,
      creditsEarned: credits
    });

    this.saveTradeCredits();

    console.log('📚 DEBTTOFUTURE: Learning credit added');
    console.log(`   Minutes: ${minutesLearned}`);
    console.log(`   Credits: +${credits}`);
    console.log(`   Available: ${this.tradeCredits.available}\n`);
  }

  // Use trade credit
  useTradeCredit() {
    if (this.tradeCredits.available <= 0) {
      console.log('❌ DEBTTOFUTURE: No credits available');
      console.log(`   Learn ${CONFIG.LEARNING_RATE} minutes to earn 1 credit\n`);
      return false;
    }

    this.tradeCredits.available--;
    this.tradeCredits.used++;
    this.saveTradeCredits();

    console.log('✅ DEBTTOFUTURE: Trade credit used');
    console.log(`   Remaining: ${this.tradeCredits.available}\n`);
    return true;
  }

  // Load/Save functions
  loadMemoryGraph() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.MEMORY_GRAPH_FILE));
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  saveMemoryGraph() {
    fs.writeFileSync(CONFIG.MEMORY_GRAPH_FILE, JSON.stringify(this.memoryGraph, null, 2));
  }

  loadTradeCredits() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.TRADE_CREDITS_FILE));
    } catch {
      return { available: 0, used: 0, totalEarned: 0, learningLog: [] };
    }
  }

  saveTradeCredits() {
    fs.writeFileSync(CONFIG.TRADE_CREDITS_FILE, JSON.stringify(this.tradeCredits, null, 2));
  }

  loadGhostBets() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.GHOST_BETS_FILE));
    } catch {
      return [];
    }
  }

  saveGhostBets() {
    fs.writeFileSync(CONFIG.GHOST_BETS_FILE, JSON.stringify(this.ghostBets, null, 2));
  }

  // Status report
  status() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  SOUL CORE PHASE 1 STATUS');
    console.log('═══════════════════════════════════════════════════\n');

    console.log('👻 GHOSTMARKET:');
    console.log(`   Active bets: ${this.ghostBets.filter(b => b.status === 'PENDING').length}`);
    console.log(`   Total bets: ${this.ghostBets.length}`);
    console.log(`   Win rate: ${this.calculateGhostWinRate()}%\n`);

    console.log('🏛️ MEMORYPALACE:');
    console.log(`   Total nodes: ${this.memoryGraph.nodes.length}`);
    console.log(`   Total edges: ${this.memoryGraph.edges.length}`);
    console.log(`   Memory categories: ${[...new Set(this.memoryGraph.nodes.map(n => n.type))].join(', ')}\n`);

    console.log('📚 DEBTTOFUTURE:');
    console.log(`   Available credits: ${this.tradeCredits.available}`);
    console.log(`   Used credits: ${this.tradeCredits.used}`);
    console.log(`   Total earned: ${this.tradeCredits.totalEarned}`);
    console.log(`   Learning hours: ${(this.tradeCredits.totalEarned * CONFIG.LEARNING_RATE / 60).toFixed(1)}\n`);
  }

  calculateGhostWinRate() {
    const resolved = this.ghostBets.filter(b => b.status !== 'PENDING');
    if (resolved.length === 0) return 0;
    const won = resolved.filter(b => b.status === 'WON').length;
    return ((won / resolved.length) * 100).toFixed(1);
  }
}

// Demo run
console.log('═══════════════════════════════════════════════════');
console.log('  SOUL CORE PHASE 1: GHOSTMARKET + MEMORYPALACE + DEBTTOFUTURE');
console.log('═══════════════════════════════════════════════════\n');

const soul = new SoulCorePhase1();

// Example: Log learning (30 minutes = 1 credit)
soul.addLearningCredit(30);

// Example: Log a decision
soul.logDecision({
  type: 'ANALYSIS',
  content: 'SOL showing strong momentum, +15% in 1h, considering breakout entry',
  context: 'Market analysis during US hours',
  tags: ['SOL', 'momentum', 'breakout']
});

// Example: Place ghost bet
soul.placeGhostBet({
  token: 'EXAMPLE',
  setup: 'Breakout +8% in 5m',
  entryPrice: 100,
  targetPrice: 106,
  stopPrice: 97
});

// Show status
soul.status();

console.log('✅ Phase 1 systems initialized');
console.log('Ready for Phase 2: CloneWars + SilenceEngine\n');

module.exports = SoulCorePhase1;
